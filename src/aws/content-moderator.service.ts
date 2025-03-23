import { Inject, Injectable } from '@nestjs/common';
import AWS from 'aws-sdk';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class ContentModerator {
  constructor(
    @Inject('S3') private readonly s3: AWS.S3,
    @Inject('REKOGNITION') private readonly rekognition: AWS.Rekognition,
    @Inject('BUCKET_NAME') private readonly bucketName: string,
    private readonly logger: LoggerService
  ) {}

  /**
   * ✅ Determines if media is an image or video and processes it accordingly.
   * @param key The S3 object key.
   * @returns `true` if explicit content is detected, otherwise `false`.
   */
  async moderateContent(
    mediaId: string,
    key: string
  ): Promise<boolean | string> {
    this.logger.log(`Moderating content for key: ${key}`);

    if (this.isImage(key)) {
      return this.moderateImage(key);
    } else if (this.isVideo(key)) {
      return this.moderateVideo(mediaId, key);
    } else {
      this.logger.warn(`Unsupported media type for key: ${key}`);
      return false;
    }
  }

  /**
   * ✅ Moderates images using AWS Rekognition.
   */
  private async moderateImage(key: string): Promise<boolean> {
    this.logger.log(`Performing image moderation for key: ${key}`);

    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: this.bucketName,
        Key: key,
      };
      const media = await this.s3.getObject(params).promise();

      if (!media.Body) {
        this.logger.error(`S3 object ${key} has no body.`);
        return false;
      }

      const imageBytes = Buffer.isBuffer(media.Body)
        ? media.Body
        : Buffer.from(media.Body as Uint8Array);

      const detectParams: AWS.Rekognition.DetectModerationLabelsRequest = {
        Image: { Bytes: imageBytes },
        MinConfidence: 70,
      };

      const response = await this.rekognition
        .detectModerationLabels(detectParams)
        .promise();

      if (response.ModerationLabels?.length) {
        const explicitLabels = response.ModerationLabels.filter(label =>
          ['Explicit Nudity', 'Violence'].includes(label.ParentName || '')
        );

        if (explicitLabels.length > 0) {
          this.logger.warn(
            `Image flagged for key: ${key}. Labels: ${explicitLabels
              .map(l => l.Name)
              .join(', ')}`
          );
          return true;
        }
      }

      this.logger.log(`No explicit content detected for image: ${key}`);
      return false;
    } catch (error) {
      this.logger.error(
        `Failed to moderate image for key: ${key}`,
        error as any
      );
      return false;
    }
  }

  /**
   * ✅ Moderates videos using AWS Rekognition's asynchronous job API.
   */
  public async moderateVideo(mediaId: string, key: string): Promise<string> {
    this.logger.log(`Submitting video moderation job for key: ${key}`);

    const snsTopicArn = process.env.AWS_SNS_VIDEO_MODERATION_ARN;
    const roleArn = process.env.AWS_REKOGNITION_ROLE_ARN;

    if (!snsTopicArn || !roleArn) {
      this.logger.error(
        `Missing SNS Topic ARN or Role ARN. Ensure environment variables are set.`
      );
      throw new Error('Missing required environment variables.');
    }

    if (!mediaId) {
      this.logger.error(`Missing media ID for Job ID: ${mediaId}`);
      throw new Error('Missing media ID');
    }

    try {
      const startParams: AWS.Rekognition.StartContentModerationRequest = {
        Video: { S3Object: { Bucket: this.bucketName, Name: key } },
        MinConfidence: 70,
        NotificationChannel: {
          SNSTopicArn: snsTopicArn,
          RoleArn: roleArn,
        },
        JobTag: mediaId,
      };

      const response = await this.rekognition
        .startContentModeration(startParams)
        .promise();

      if (!response.JobId) {
        throw new Error('Failed to start moderation job.');
      }

      return response.JobId;
    } catch (error) {
      console.log(
        `Failed to start video moderation for key: ${key}`,
        error as any
      );
      this.logger.error(
        `Failed to start video moderation for key: ${key}`,
        error as any
      );
      throw new Error('Video moderation failed');
    }
  }

  /**
   * ✅ Determines if the file is an image based on extension.
   */
  private isImage(key: string): boolean {
    return /\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i.test(key);
  }

  /**
   * ✅ Determines if the file is a video based on extension.
   */
  private isVideo(key: string): boolean {
    return /\.(mp4|mov|avi|wmv|flv|mkv|webm|m4v|3gp|quicktime)$/i.test(key);
  }
}
