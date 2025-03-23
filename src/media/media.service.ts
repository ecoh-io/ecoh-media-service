// src/media/media.service.ts

import * as exifParser from 'exif-parser';
import * as fs from 'fs/promises';
import * as ffmpeg from 'fluent-ffmpeg';
import * as AWS from 'aws-sdk';
import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Connection } from 'typeorm';
import { Media } from './media.entity';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { AlbumsService } from '../albums/albums.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { MediaType } from '../common/enums/media-type.enum';
import { ObjectDetector } from 'src/aws/object-detector.service';
import { ContentModerator } from 'src/aws/content-moderator.service';
import { LoggerService } from 'src/logger/logger.service';
import { VideoTranscoder } from 'src/aws/video-transcoder.service';

const ffmpegPath = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

@Injectable()
export class MediaService {
  private bucketName: string;
  private cloudFrontDomain: string =
    process.env.AWS_CLOUDFRONT_URL || 'default-cloudfront-domain';

  constructor(
    @InjectRepository(Media)
    private mediaRepository: Repository<Media>,
    public albumsService: AlbumsService,
    private connection: Connection,
    private readonly logger: LoggerService,
    private objectDetector: ObjectDetector,
    private contentModerator: ContentModerator,
    private readonly videoTranscoder: VideoTranscoder,
    @Inject('S3') private readonly s3: AWS.S3,
    @Inject('SNS') private readonly sns: AWS.SNS,
    @Inject('BUCKET_NAME') bucketName: string,
    @Inject('DYNAMODB') private readonly dynamoDB: AWS.DynamoDB.DocumentClient
  ) {
    this.bucketName = bucketName;
  }

  /**
   * Generates a pre-signed URL for uploading media to S3 and pre-creates a media entry in the database.
   */
  async generatePresignedUrl(
    type: MediaType,
    mimetype: string,
    userId: string,
    albumId?: string,
    tags?: string[]
  ): Promise<{ url: string; key: string; mediaId: string }> {
    const fileExtension = mimetype.split('/').pop();
    const key = `${type}/${uuidv4()}.${fileExtension}`;
    const mediaId = uuidv4(); // Generate a unique media ID

    const params = {
      Bucket: this.bucketName,
      Key: key,
      Expires: 300, // 5 minutes
      ContentType: mimetype,
    };

    const url = this.s3.getSignedUrl('putObject', params);

    // Pre-create the media entry with minimal info
    const media = this.mediaRepository.create({
      id: mediaId,
      key,
      url: `https://${this.cloudFrontDomain}/${key}`,
      type: type,
      uploadedBy: userId,
      tags: tags || [],
      isFlagged: false,
    });

    if (albumId) {
      const album = await this.albumsService.getAlbumById(albumId, userId);
      media.album = album;
    }

    await this.mediaRepository.save(media);
    this.logger.log(`Pre-signed URL generated for mediaId: ${mediaId}`);

    return { url, key, mediaId };
  }

  /**
   * Handles completion of media upload by publishing an event to SQS.
   */
  async completeUpload(completeUploadDto: CompleteUploadDto): Promise<void> {
    const { mediaId, key, userId, albumId, tags } = completeUploadDto;
    this.logger.log(`Completing upload for mediaId: ${mediaId}`);

    // Publish event to SQS
    await this.publishEvent('MEDIA_PROCESSING', {
      mediaId,
      key,
      userId,
      albumId,
      tags,
    });
  }

  /**
   * Publishes a media processing event to SQS.
   */
  async publishEvent(
    eventType: 'MEDIA_PROCESSING' | 'PROFILE_IMAGE_UPDATE',
    payload: Record<string, any>
  ): Promise<void> {
    const params = {
      TopicArn: process.env.AWS_SNS_TOPIC_ARN, // Ensure this is set in your environment variables
      Message: JSON.stringify(payload),
      MessageAttributes: {
        EventType: {
          DataType: 'String',
          StringValue: eventType,
        },
      },
    };

    try {
      await this.sns.publish(params).promise();
      this.logger.log(
        `Published ${eventType} event: ${JSON.stringify(payload)}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish ${eventType} event`,
        (error as any).stack
      );
      throw new BadRequestException(
        `Failed to initiate ${eventType.toLowerCase()} event`
      );
    }
  }

  /**
   * Processes uploaded media: generates thumbnail, optimizes image, transcodes video,
   * extracts metadata, moderates content, detects objects, adds watermark, and updates user profile if necessary.
   */
  async processUploadedMedia(
    mediaId: string,
    key: string,
    userId: string,
    albumId?: string,
    tags?: string[]
  ): Promise<void> {
    this.logger.log(`Processing uploaded media: ${mediaId}`);

    await this.connection.transaction(async (manager: EntityManager) => {
      const media = await manager.findOne(Media, {
        where: { id: mediaId },
        relations: ['album'],
      });
      if (!media) {
        this.logger.warn(`Media not found: ${mediaId}`);
        throw new BadRequestException('Media not found');
      }

      if (
        media.type === MediaType.IMAGE ||
        media.type === MediaType.PROFILE_PICTURE
      ) {
        const moderationResult = await this.contentModerator.moderateContent(
          mediaId,
          key
        );
        media.isFlagged =
          typeof moderationResult === 'boolean' ? moderationResult : false;

        if (!media.isFlagged) {
          // Detect objects in the image and add tags
          const detectedTags = await this.objectDetector.detectObjects(key);
          media.tags = Array.from(
            new Set(
              [...(media.tags ?? []), ...detectedTags]
                .map(tag => tag.trim().toLowerCase())
                .filter(tag => tag.length > 0)
            )
          );

          // Generate thumbnail
          const thumbnailUrl = await this.generateImageThumbnail(key);
          media.thumbnailUrl = thumbnailUrl;

          // Optimize image and update the main URL
          const optimizedUrl = await this.optimizeImage(key);
          media.url = optimizedUrl;

          // Pull raw image buffer from S3
          const imageBuffer = (
            await this.s3
              .getObject({ Bucket: this.bucketName, Key: key })
              .promise()
          ).Body as Buffer;

          // Extract metadata using improved EXIF parser logic
          const imageMetadata = await this.extractImageMetadata(imageBuffer);

          // Store into media.metadata
          media.metadata = {
            ...imageMetadata,
            responsiveImages: await this.generateResponsiveImages(key),
          };

          this.logger.log(`Image metadata extracted for mediaId: ${mediaId}`);

          if (media.type === MediaType.PROFILE_PICTURE) {
            await this.updateUserProfilePicture(media.id, userId, manager);
          }
        }
      }

      if (media.type === MediaType.VIDEO) {
        try {
          const jobId = await this.contentModerator.moderateVideo(mediaId, key);
          this.logger.log(
            `Video moderation started for ${mediaId}, Job ID: ${jobId}`
          );

          await this.dynamoDB
            .put({
              TableName: 'video_moderation_jobs',
              Item: {
                mediaId,
                jobId,
                key,
                status: 'PENDING',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            })
            .promise();

          await this.videoTranscoder.transcodeVideo(mediaId, key);
        } catch (error) {
          console.log(
            'Failed to initiate video moderation for: ${mediaId}`,',
            error
          );
          this.logger.error(
            `Failed video moderation for: ${mediaId}`,
            error as any
          );
          throw new BadRequestException('Video moderation failed');
        }
      }

      await manager.save(media);
    });

    this.logger.log(`Processing completed for media: ${mediaId}`);
  }

  /**
   * Generates a thumbnail for an image and uploads it to S3.
   */
  async generateImageThumbnail(key: string): Promise<string> {
    this.logger.log(`Generating thumbnail for key: ${key}`);

    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      const image = await this.s3.getObject(params).promise();
      const thumbnail = await sharp(image.Body as Buffer)
        .resize(200, 200) // Resize to 200x200 pixels
        .toBuffer();

      const thumbnailKey = key.replace(/(\.\w+)$/, '_thumbnail$1');
      const uploadParams = {
        Bucket: this.bucketName,
        Key: thumbnailKey,
        Body: thumbnail,
        ContentType: 'image/jpeg', // Adjust based on original image type
        CacheControl: 'max-age=31536000', // Cache for 1 year
      };

      await this.s3.putObject(uploadParams).promise();
      const thumbnailUrl = `https://${this.cloudFrontDomain}/${key}`;
      this.logger.log(`Thumbnail generated and uploaded: ${thumbnailUrl}`);
      return thumbnailUrl;
    } catch (error) {
      this.logger.error(
        `Failed to generate thumbnail for key: ${key}`,
        (error as any).stack
      );
      throw new BadRequestException('Failed to generate thumbnail');
    }
  }

  /**
   * Optimizes an image by compressing and converting it to WebP format.
   */
  async optimizeImage(key: string): Promise<string> {
    this.logger.log(`Optimizing image for key: ${key}`);

    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      const image = await this.s3.getObject(params).promise();
      const optimizedBuffer = await sharp(image.Body as Buffer)
        .resize({ width: 800 }) // Resize to a maximum width of 800px
        .webp({ quality: 80 }) // Convert to WebP with 80% quality
        .toBuffer();

      const optimizedKey = key.replace(/(\.\w+)$/, '_optimized.webp');
      const uploadParams = {
        Bucket: this.bucketName,
        Key: optimizedKey,
        Body: optimizedBuffer,
        ContentType: 'image/webp',
        CacheControl: 'max-age=31536000', // Cache for 1 year
      };

      await this.s3.putObject(uploadParams).promise();
      const optimizedUrl = `https://${this.cloudFrontDomain}/${key}`;
      this.logger.log(`Optimized image uploaded: ${optimizedUrl}`);
      return optimizedUrl;
    } catch (error) {
      this.logger.error(
        `Failed to optimize image for key: ${key}`,
        (error as any).stack
      );
      throw new BadRequestException('Failed to optimize image');
    }
  }

  /**
   * Optimizes an image by compressing and converting it to WebP format.
   * (Redundant method name removed)
   */

  /**
   * Extracts metadata from an image using exif-parser.
   */
  async extractImageMetadata(buffer: Buffer): Promise<Record<string, any>> {
    try {
      const parser = exifParser.create(buffer);
      const result = parser.parse();

      // Extract common metadata fields
      const tags = result.tags || {};
      const metadata = {
        orientation: tags.Orientation,
        width: tags.ExifImageWidth,
        height: tags.ExifImageHeight,
        cameraMake: tags.Make,
        cameraModel: tags.Model,
        iso: tags.ISO,
        exposureTime: tags.ExposureTime,
        focalLength: tags.FocalLength,
        creationDate: tags.DateTimeOriginal,
      };
      this.logger.log(`Extracted image metadata: ${JSON.stringify(metadata)}`);
      return metadata;
    } catch (exifError) {
      this.logger.warn('EXIF parsing failed, falling back to Sharp');

      try {
        const sharpMeta = await sharp(buffer).metadata();
        const metadata = {
          orientation: sharpMeta.orientation,
          width: sharpMeta.width,
          height: sharpMeta.height,
          format: sharpMeta.format,
        };
        this.logger.log(
          `Extracted image metadata: ${JSON.stringify(metadata)}`
        );
        return metadata;
      } catch (sharpError) {
        this.logger.warn('Sharp fallback metadata extraction failed');
        return {};
      }
    }
  }

  /**
   * Extracts metadata from a video using FFprobe.
   */
  async extractVideoMetadata(key: string): Promise<any> {
    this.logger.log(`Extracting video metadata for key: ${key}`);

    const inputPath = `/tmp/${key.replace(/\//g, '_')}`; // safe file name

    try {
      // Download the video from S3
      const params = { Bucket: this.bucketName, Key: key };
      const video = await this.s3.getObject(params).promise();
      await fs.writeFile(inputPath, video.Body as Buffer);

      // Confirm file exists
      const exists = await fs.stat(inputPath).catch(() => null);
      if (!exists)
        throw new Error(`Failed to write video to disk at ${inputPath}`);

      // Extract metadata using fluent-ffmpeg
      const metadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, data) => {
          if (err) return reject(err);

          const videoStream = data.streams.find(s => s.codec_type === 'video');

          const result = {
            duration: parseFloat(data.format.duration), // in seconds
            size: parseInt(data.format.size), // total file size in bytes
            formatName: data.format.format_name, // e.g., mov, mp4
            formatLongName: data.format.format_long_name, // e.g., QuickTime / MOV
            codec: videoStream?.codec_name, // e.g., h264
            codecLongName: videoStream?.codec_long_name, // e.g., H.264 / AVC / MPEG-4 AVC
            width: videoStream?.width,
            height: videoStream?.height,
            bitrate: parseInt(data.format.bit_rate), // average bitrate in bps
            frameRate: eval(videoStream?.avg_frame_rate || '0'), // in fps
            pixelFormat: videoStream?.pix_fmt, // e.g., yuv420p
            level: videoStream?.level, // codec level
            profile: videoStream?.profile, // codec profile e.g., High, Main
            rotation: videoStream?.tags?.rotate || 0, // if available (useful for phone videos)
            creationTime:
              videoStream?.tags?.creation_time || // when video was captured
              data.format.tags?.creation_time,
            aspectRatio:
              videoStream?.display_aspect_ratio || // e.g., 16:9
              `${videoStream?.width}:${videoStream?.height}`,
          };

          resolve(result);
        });
      });

      this.logger.log(`Extracted video metadata: ${JSON.stringify(metadata)}`);

      await fs.unlink(inputPath); // clean up
      return metadata;
    } catch (error) {
      console.log('Failed to extract video metadata:', error);
      this.logger.warn(`Failed to extract video metadata for key: ${key}`);
      return {};
    }
  }

  /**
   * Generates responsive images at different resolutions.
   */
  async generateResponsiveImages(key: string): Promise<string[]> {
    this.logger.log(`Generating responsive images for key: ${key}`);

    const resolutions = [320, 640, 1024, 1600];
    const responsiveUrls: string[] = [];

    try {
      // Fetch original image
      const { Body, ContentType } = await this.s3
        .getObject({ Bucket: this.bucketName, Key: key })
        .promise();

      if (!Body) {
        this.logger.warn(`No image body found for key: ${key}`);
        return [];
      }

      const imageBuffer = Body as Buffer;

      for (const width of resolutions) {
        const responsiveKey = key.replace(/(\.\w+)$/, `_${width}px.webp`);

        const resizedBuffer = await sharp(imageBuffer)
          .resize({ width })
          .webp({ quality: 80 })
          .toBuffer();

        await this.s3
          .putObject({
            Bucket: this.bucketName,
            Key: responsiveKey,
            Body: resizedBuffer,
            ContentType: 'image/webp',
            CacheControl: 'max-age=31536000',
          })
          .promise();

        const responsiveUrl = `https://${this.cloudFrontDomain}/${responsiveKey}`;
        responsiveUrls.push(responsiveUrl);
        this.logger.log(`Uploaded responsive image: ${responsiveUrl}`);
      }

      return responsiveUrls;
    } catch (error) {
      this.logger.error(`Failed to generate responsive images for key: ${key}`);
      return [];
    }
  }

  /**
   * Adds a watermark to an image and uploads it to S3.
   * (This method was already defined above; no need to repeat.)
   */

  /**
   * Updates the user's profile picture in the auth & user microservice.
   */
  async updateUserProfilePicture(
    mediaId: string,
    userId: string,
    manager: EntityManager
  ): Promise<void> {
    this.logger.log(`Updating profile picture for user: ${userId}`);

    // Fetch media record
    const media = await manager.findOne(Media, { where: { id: mediaId } });

    if (!media) {
      this.logger.warn(
        `Media not found for profile picture update: ${mediaId}`
      );
      throw new BadRequestException('Media not found');
    }

    // Ensure profile picture URL exists
    const profilePictureUrl = media.thumbnailUrl || media.url;
    if (!profilePictureUrl) {
      this.logger.error(`No valid URL found for mediaId: ${mediaId}`);
      throw new BadRequestException('Invalid profile picture URL');
    }

    try {
      // Publish SNS event for profile image update
      await this.publishEvent('PROFILE_IMAGE_UPDATE', {
        imageURL: profilePictureUrl,
        userId,
      });

      this.logger.log(
        `Profile image update event published for user: ${userId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish profile image update event for user: ${userId}`,
        (error as any).stack
      );
      throw new BadRequestException('Failed to update user profile picture');
    }
  }

  async updateModerationStatus(
    mediaId: string,
    isFlagged: boolean
  ): Promise<void> {
    this.logger.log(
      `Updating moderation status for Media ID: ${mediaId}, Flagged: ${isFlagged}`
    );

    await this.connection.transaction(async (manager: EntityManager) => {
      const media = await manager.findOne(Media, { where: { id: mediaId } });

      if (!media) {
        this.logger.warn(`No media found for Media ID: ${mediaId}`);
        return;
      }

      media.isFlagged = isFlagged;
      await manager.save(media);

      this.logger.log(`Moderation status updated for Media ID: ${media.id}`);
    });
  }

  /**
   * Retrieves a media item by ID.
   */
  async getMedia(id: string): Promise<Media> {
    const media = await this.mediaRepository.findOne({
      where: { id },
      relations: ['album'],
    });
    if (!media) {
      this.logger.warn(`Media not found: ${id}`);
      throw new BadRequestException('Media not found');
    }
    return media;
  }

  /**
   * Deletes a media item.
   */
  async deleteMedia(id: string, userId: string): Promise<void> {
    const media = await this.mediaRepository.findOne({ where: { id } });

    if (!media) {
      this.logger.warn(`Media not found for deletion: ${id}`);
      throw new BadRequestException('Media not found');
    }

    if (media.uploadedBy !== userId) {
      this.logger.warn(`User ${userId} unauthorized to delete media: ${id}`);
      throw new BadRequestException('Unauthorized');
    }

    const params = {
      Bucket: this.bucketName,
      Key: media.key,
    };

    try {
      await this.s3.deleteObject(params).promise();
      await this.mediaRepository.delete(id);
      this.logger.log(`Media deleted: ${id} by user: ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to delete media: ${id}`, (error as any).stack);
      throw new BadRequestException('Failed to delete media');
    }
  }

  /**
   * Lists media items with pagination and optional album filtering.
   */
  async getMediaList(
    userId: string,
    page: number = 1,
    limit: number = 20,
    albumId?: string
  ): Promise<{ data: Media[]; total: number }> {
    const query = this.mediaRepository
      .createQueryBuilder('media')
      .where('media.uploadedBy = :userId', { userId });

    if (albumId) {
      query.andWhere('media.album = :albumId', { albumId });
    }

    query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('media.createdAt', 'DESC');

    const [data, total] = await query.getManyAndCount();
    this.logger.log(
      `Retrieved media list for user: ${userId}, page: ${page}, limit: ${limit}`
    );
    return { data, total };
  }
}
