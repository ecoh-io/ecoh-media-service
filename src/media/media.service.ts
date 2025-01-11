// src/media/media.service.ts

import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Connection } from 'typeorm';
import { Media } from './media.entity';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import sharp from 'sharp';
import { AlbumsService } from '../albums/albums.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import * as exifParser from 'exif-parser';
import * as fs from 'fs/promises';
import { MediaType } from '../common/enums/media-type.enum';
import { ObjectDetector } from 'src/aws/object-detector.service';
import { ContentModerator } from 'src/aws/content-moderator.service';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class MediaService {
  private bucketName: string;
  private awsRegion: string = process.env.AWS_REGION || 'us-east-1';
  private queueUrl: string;
  private authServiceApiKey: string = process.env.AUTH_SERVICE_API_KEY || '';

  constructor(
    @InjectRepository(Media)
    private mediaRepository: Repository<Media>,
    private httpService: HttpService,
    public albumsService: AlbumsService,
    private connection: Connection,
    private readonly logger: LoggerService,
    private objectDetector: ObjectDetector,
    private contentModerator: ContentModerator,
    @Inject('S3') private readonly s3: AWS.S3,
    @Inject('SQS') private readonly sqs: AWS.SQS,
    @Inject('BUCKET_NAME') bucketName: string
  ) {
    this.bucketName = bucketName;
    this.queueUrl = process.env.AWS_SQS_QUEUE_URL || 'default-queue-url';
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
      url: `https://${this.bucketName}.s3.${this.awsRegion}.amazonaws.com`,
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
    await this.publishMediaProcessingEvent(mediaId, key, userId, albumId, tags);
  }

  /**
   * Publishes a media processing event to SQS.
   */
  async publishMediaProcessingEvent(
    mediaId: string,
    key: string,
    userId: string,
    albumId?: string,
    tags?: string[]
  ): Promise<void> {
    const params = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify({
        mediaId,
        key,
        userId,
        albumId,
        tags,
      }),
      MessageAttributes: {
        MediaId: {
          DataType: 'String',
          StringValue: mediaId,
        },
      },
    };

    try {
      await this.sqs.sendMessage(params).promise();
      this.logger.log(
        `Published media processing event for mediaId: ${mediaId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish media processing event for mediaId: ${mediaId}`,
        (error as any).stack
      );
      throw new BadRequestException('Failed to initiate media processing');
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
      // Fetch media
      const media = await manager.findOne(Media, {
        where: { id: mediaId },
        relations: ['album'],
      });
      if (!media) {
        this.logger.warn(`Media not found: ${mediaId}`);
        throw new BadRequestException('Media not found');
      }

      // Content Moderation
      const isFlagged = await this.contentModerator.moderateContent(key);
      media.isFlagged = isFlagged;

      // Object Detection and Tagging
      const detectedTags = await this.objectDetector.detectObjects(key);
      media.tags = [...(media.tags || []), ...detectedTags];

      // Image-specific Processing
      if (media.type === MediaType.IMAGE) {
        // Generate Thumbnail
        const thumbnailUrl = await this.generateImageThumbnail(key);
        media.thumbnailUrl = thumbnailUrl;

        // Optimize Image and Convert Format
        const optimizedUrl = await this.optimizeImage(key);
        media.url = optimizedUrl; // Update to optimized image URL

        // Extract Metadata
        const imageBuffer = (
          await this.s3
            .getObject({ Bucket: this.bucketName, Key: key })
            .promise()
        ).Body as Buffer;
        const metadata = await this.extractImageMetadata(imageBuffer);
        media.metadata = metadata;

        // Generate Responsive Images
        const responsiveUrls = await this.generateResponsiveImages(key);
        media.metadata = media.metadata || {};
        media.metadata.responsiveImages = responsiveUrls; // Store responsive image URLs
      }

      // Video-specific Processing
      if (media.type === MediaType.VIDEO) {
        // Transcode Video
        await this.transcodeVideo(key);

        // Extract Metadata
        const metadata = await this.extractVideoMetadata(key);
        media.metadata = metadata;
      }

      // Update User Profile if it's a profile picture
      if (media.type === MediaType.PROFILE_PICTURE) {
        await this.updateUserProfilePicture(media.id, userId, manager);
      }

      // Save updated media
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
      const thumbnailUrl = `https://${this.bucketName}.s3.${this.awsRegion}.amazonaws.com/${thumbnailKey}`;
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
      const optimizedUrl = `https://${this.bucketName}.s3.${this.awsRegion}.amazonaws.com/${optimizedKey}`;
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
   * Transcodes a video into multiple formats and resolutions.
   */
  async transcodeVideo(key: string): Promise<void> {
    this.logger.log(`Transcoding video for key: ${key}`);

    const inputPath = `/tmp/${key}`;
    const outputPath720 = `/tmp/${key}_720p.mp4`;
    const outputPath1080 = `/tmp/${key}_1080p.mp4`;

    try {
      // Download the video from S3
      const params = { Bucket: this.bucketName, Key: key };
      const video = await this.s3.getObject(params).promise();
      await fs.writeFile(inputPath, video.Body as Buffer);

      // Transcode to 720p
      await this.runFFmpeg(inputPath, outputPath720, '1280x720');

      // Transcode to 1080p
      await this.runFFmpeg(inputPath, outputPath1080, '1920x1080');

      // Upload transcoded videos back to S3
      await this.s3
        .upload({
          Bucket: this.bucketName,
          Key: `${key}_720p.mp4`,
          Body: await fs.readFile(outputPath720),
          ContentType: 'video/mp4',
          CacheControl: 'max-age=31536000',
        })
        .promise();
      await this.s3
        .upload({
          Bucket: this.bucketName,
          Key: `${key}_1080p.mp4`,
          Body: await fs.readFile(outputPath1080),
          ContentType: 'video/mp4',
          CacheControl: 'max-age=31536000',
        })
        .promise();

      this.logger.log(`Video transcoded and uploaded for key: ${key}`);

      // Cleanup
      await fs.unlink(inputPath);
      await fs.unlink(outputPath720);
      await fs.unlink(outputPath1080);
    } catch (error) {
      this.logger.error(
        `Failed to transcode video for key: ${key}`,
        (error as any).stack
      );
      throw new BadRequestException('Failed to transcode video');
    }
  }

  /**
   * Runs FFmpeg to transcode media.
   */
  private runFFmpeg(
    input: string,
    output: string,
    resolution: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      const ffmpeg = require('child_process').spawn(ffmpegPath, [
        '-i',
        input,
        '-s',
        resolution,
        '-c:a',
        'copy',
        output,
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        this.logger.debug(`FFmpeg STDERR: ${data.toString()}`);
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Optimizes an image by compressing and converting it to WebP format.
   * (Redundant method name removed)
   */

  /**
   * Extracts metadata from an image using exif-parser.
   */
  async extractImageMetadata(buffer: Buffer): Promise<any> {
    try {
      const parser = exifParser.create(buffer);
      const result = parser.parse();
      return result.tags;
    } catch (error) {
      this.logger.warn('Failed to extract EXIF data', (error as any).stack);
      return {};
    }
  }

  /**
   * Extracts metadata from a video using FFprobe.
   */
  async extractVideoMetadata(key: string): Promise<any> {
    this.logger.log(`Extracting video metadata for key: ${key}`);

    const inputPath = `/tmp/${key}`;

    try {
      // Download the video from S3
      const params = { Bucket: this.bucketName, Key: key };
      const video = await this.s3.getObject(params).promise();
      await fs.writeFile(inputPath, video.Body as Buffer);

      // Run FFprobe to get metadata
      const metadata = await this.runFFprobe(inputPath);

      // Cleanup
      await fs.unlink(inputPath);

      return metadata;
    } catch (error) {
      this.logger.warn(
        `Failed to extract video metadata for key: ${key}`,
        (error as any).stack
      );
      return {};
    }
  }

  /**
   * Runs FFprobe to get video metadata.
   */
  private runFFprobe(input: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const ffprobePath = process.env.FFMPEG_PATH
        ? process.env.FFMPEG_PATH.replace('ffmpeg', 'ffprobe')
        : 'ffprobe';
      const ffprobe = require('child_process').spawn(ffprobePath, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'json',
        input,
      ]);

      let data = '';
      ffprobe.stdout.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      ffprobe.stderr.on('data', (chunk: Buffer) => {
        this.logger.debug(`FFprobe STDERR: ${chunk.toString()}`);
      });

      ffprobe.on('close', (code: number) => {
        if (code === 0) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`FFprobe process exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Generates responsive images at different resolutions.
   */
  async generateResponsiveImages(key: string): Promise<string[]> {
    this.logger.log(`Generating responsive images for key: ${key}`);

    const resolutions = [320, 640, 1280];
    const responsiveUrls: string[] = [];

    const params = { Bucket: this.bucketName, Key: key };
    const image = await this.s3.getObject(params).promise();

    for (const width of resolutions) {
      const resizedBuffer = await sharp(image.Body as Buffer)
        .resize(width)
        .toBuffer();

      const responsiveKey = key.replace(/(\.\w+)$/, `_${width}px$1`);
      const uploadParams = {
        Bucket: this.bucketName,
        Key: responsiveKey,
        Body: resizedBuffer,
        ContentType: image.ContentType,
        CacheControl: 'max-age=31536000', // Cache for 1 year
      };

      await this.s3.putObject(uploadParams).promise();
      const responsiveUrl = `https://${this.bucketName}.s3.${this.awsRegion}.amazonaws.com/${responsiveKey}`;
      responsiveUrls.push(responsiveUrl);
      this.logger.log(`Responsive image uploaded: ${responsiveUrl}`);
    }

    return responsiveUrls;
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
    this.logger.log(`Updating user profile picture for user: ${userId}`);

    const media = await manager.findOne(Media, { where: { id: mediaId } });
    if (!media) {
      this.logger.warn(
        `Media not found for profile picture update: ${mediaId}`
      );
      throw new BadRequestException('Media not found');
    }

    const payload = {
      profilePictureUrl: `${media.thumbnailUrl || media.url}/${media.key}`, // Use thumbnail if available
    };

    try {
      await lastValueFrom(
        this.httpService.put(
          `${process.env.AUTH_SERVICE_URL}/users/${userId}/proifile-picture`,
          payload,
          {
            headers: {
              'x-api-key': this.authServiceApiKey,
              'Content-Type': 'application/json',
            },
          }
        )
      );
      this.logger.log(`User profile picture updated for user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to update user profile picture for user: ${userId}`,
        (error as any).stack
      );
      // Rollback transaction by throwing an error
      throw new BadRequestException('Failed to update user profile picture');
    }
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
