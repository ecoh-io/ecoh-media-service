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

    let media: AWS.S3.GetObjectOutput;

    try {
      media = await this.s3.getObject(params).promise();
      if (!media.Body) {
        this.logger.error(`S3 object ${key} has no body.`);
        return [];
      }
    } catch (error) {
      this.logger.error(
        `Failed to get object ${key} from S3`,
        (error as Error).stack
      );
      return [];
    }

    // Ensure media.Body is a Buffer
    let imageBytes: Buffer;
    if (Buffer.isBuffer(media.Body)) {
      imageBytes = media.Body;
    } else if (media.Body instanceof Uint8Array) {
      imageBytes = Buffer.from(media.Body);
    } else {
      this.logger.error(`Unsupported media.Body type: ${typeof media.Body}`);
      return [];
    }

    const detectParams: AWS.Rekognition.DetectLabelsRequest = {
      Image: {
        Bytes: imageBytes,
      },
      MaxLabels: 10,
      MinConfidence: 70,
    };

    try {
      const response = await this.rekognition
        .detectLabels(detectParams)
        .promise();
      const labels =
        response.Labels?.map(label => label.Name).filter(
          (name): name is string => typeof name === 'string'
        ) || [];
      this.logger.log(`Objects detected: ${labels.join(', ')}`);
      return labels;
    } catch (error) {
      this.logger.error(
        'Failed to perform object detection',
        (error as Error).stack
      );
      return [];
    }
  }
}
