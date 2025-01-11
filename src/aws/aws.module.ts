import { Module } from '@nestjs/common';
import { S3, SQS, Rekognition } from 'aws-sdk';
import { ObjectDetector } from './object-detector.service';
import { ContentModerator } from './content-moderator.service';
import { LoggerService } from 'src/logger/logger.service';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    {
      provide: 'S3',
      useFactory: (configService: ConfigService) => {
        return new S3({
          region: configService.get<string>('aws.region') || 'us-east-1',
          credentials: {
            accessKeyId: configService.get<string>('aws.accessKeyId')!,
            secretAccessKey: configService.get<string>('aws.secretAccessKey')!,
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'SQS',
      useFactory: (configService: ConfigService) => {
        return new SQS({
          region: configService.get<string>('aws.region') || 'us-east-1',
          credentials: {
            accessKeyId: configService.get<string>('aws.accessKeyId')!,
            secretAccessKey: configService.get<string>('aws.secretAccessKey')!,
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'REKOGNITION',
      useFactory: (configService: ConfigService) => {
        return new Rekognition({
          region:
            configService.get<string>('aws.rekognitionRegion') || 'us-east-1',
          credentials: {
            accessKeyId: configService.get<string>('aws.accessKeyId')!,
            secretAccessKey: configService.get<string>('aws.secretAccessKey')!,
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'BUCKET_NAME',
      useFactory: (configService: ConfigService) =>
        configService.get<string>('AWS_S3_BUCKET_NAME') ||
        'default-bucket-name',
      inject: [ConfigService],
    },
    LoggerService,
    ObjectDetector,
    ContentModerator,
  ],
  exports: [
    ObjectDetector,
    ContentModerator,
    'S3',
    'SQS',
    'REKOGNITION',
    'BUCKET_NAME',
  ],
})
export class AwsModule {}
