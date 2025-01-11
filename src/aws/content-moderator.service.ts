// src/aws/content-moderator.service.ts

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
   * Moderates content in the specified S3 object.
   * @param key The S3 object key.
   * @returns A promise that resolves to true if explicit content is detected, otherwise false.
   */
  async moderateContent(key: string): Promise<boolean> {
    this.logger.log(`Moderating content for key: ${key}`);

    const params: AWS.S3.GetObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    let media: AWS.S3.GetObjectOutput;

    try {
      media = await this.s3.getObject(params).promise();
      if (!media.Body) {
        this.logger.error(`S3 object ${key} has no body.`);
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Failed to get object ${key} from S3`,
        (error as Error).stack
      );
      return false;
    }

    // Ensure media.Body is a Buffer
    let imageBytes: Buffer;
    if (Buffer.isBuffer(media.Body)) {
      imageBytes = media.Body;
    } else if (media.Body instanceof Uint8Array) {
      imageBytes = Buffer.from(media.Body);
    } else {
      this.logger.error(`Unsupported media.Body type: ${typeof media.Body}`);
      return false;
    }

    const detectParams: AWS.Rekognition.DetectModerationLabelsRequest = {
      Image: {
        Bytes: imageBytes,
      },
      MinConfidence: 70,
    };

    try {
      const response = await this.rekognition
        .detectModerationLabels(detectParams)
        .promise();

      if (!response.ModerationLabels) {
        this.logger.log(`No moderation labels detected for key: ${key}`);
        return false;
      }

      const explicitLabels = response.ModerationLabels.filter(
        label =>
          label.ParentName === 'Explicit Nudity' ||
          label.ParentName === 'Violence'
      );

      if (explicitLabels.length > 0) {
        this.logger.warn(
          `Content flagged for key: ${key}. Labels: ${explicitLabels
            .map(l => l.Name)
            .join(', ')}`
        );
        return true;
      }

      this.logger.log(`No explicit content detected for key: ${key}`);
      return false;
    } catch (error) {
      this.logger.error(
        'Failed to perform content moderation',
        (error as Error).stack
      );
      return false;
    }
  }
}
