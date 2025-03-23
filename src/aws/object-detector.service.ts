// src/aws/object-detector.service.ts

import { Inject, Injectable } from '@nestjs/common';
import AWS from 'aws-sdk';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class ObjectDetector {
  constructor(
    @Inject('S3') private readonly s3: AWS.S3,
    @Inject('REKOGNITION') private readonly rekognition: AWS.Rekognition,
    @Inject('BUCKET_NAME') private readonly bucketName: string,
    private readonly logger: LoggerService
  ) {}

  /**
   * Detects objects in an image stored in S3.
   * @param key The S3 object key.
   * @returns A promise that resolves to an array of detected object names.
   */
  async detectObjects(key: string): Promise<string[]> {
    this.logger.log(`Detecting objects in key: ${key}`);

    const params: AWS.S3.GetObjectRequest = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      const media = await this.s3.getObject(params).promise();

      if (!media.Body) {
        this.logger.error(`S3 object ${key} has no body.`);
        return [];
      }

      const imageBytes = Buffer.isBuffer(media.Body)
        ? media.Body
        : Buffer.from(media.Body as Uint8Array);

      const detectParams: AWS.Rekognition.DetectLabelsRequest = {
        Image: { Bytes: imageBytes },
        MaxLabels: 10,
        MinConfidence: 70,
      };

      const response = await this.rekognition
        .detectLabels(detectParams)
        .promise();

      const labels = response.Labels ?? [];

      const tags = labels
        .map(label => label.Name?.trim().toLowerCase())
        .filter((name): name is string => !!name && name.length > 0);

      this.logger.log(`Objects detected: ${tags.join(', ')}`);
      return tags;
    } catch (error) {
      this.logger.error(
        `Failed to detect objects in ${key}:`,
        (error as Error).stack
      );
      return [];
    }
  }
}
