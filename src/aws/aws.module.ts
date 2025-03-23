import { Module } from '@nestjs/common';
import { S3, SNS, Rekognition, MediaConvert, DynamoDB, SQS } from 'aws-sdk';
import { ObjectDetector } from './object-detector.service';
import { ContentModerator } from './content-moderator.service';
import { LoggerService } from 'src/logger/logger.service';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [
    // ✅ S3 Storage
    {
      provide: 'S3',
      useFactory: (configService: ConfigService) => {
        return new S3({
          region: configService.get<string>('aws.region') || 'eu-west-2',
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'SQS',
      useFactory: (configService: ConfigService) => {
        return new SQS({
          region: configService.get<string>('aws.region') || 'eu-east-2',
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'SNS',
      useFactory: (configService: ConfigService) => {
        return new SNS({
          region: configService.get<string>('aws.region') || 'eu-west-2',
        });
      },
      inject: [ConfigService],
    },

    // ✅ AWS Rekognition for AI-based content moderation
    {
      provide: 'REKOGNITION',
      useFactory: (configService: ConfigService) => {
        return new Rekognition({
          region: configService.get<string>('aws.region') || 'eu-west-2',
        });
      },
      inject: [ConfigService],
    },

    // ✅ AWS MediaConvert for video transcoding
    {
      provide: 'MEDIA_CONVERT',
      useFactory: (configService: ConfigService) => {
        return new MediaConvert({
          region: configService.get<string>('aws.region') || 'eu-west-2',
        });
      },
      inject: [ConfigService],
    },

    // ✅ DynamoDB for storing transcoding & moderation job statuses
    {
      provide: 'DYNAMODB',
      useFactory: (configService: ConfigService) => {
        return new DynamoDB.DocumentClient({
          region: configService.get<string>('aws.region') || 'eu-west-2',
        });
      },
      inject: [ConfigService],
    },

    // ✅ Bucket name for S3 storage
    {
      provide: 'BUCKET_NAME',
      useFactory: (configService: ConfigService) =>
        configService.get<string>('AWS_S3_BUCKET_NAME') ||
        'default-bucket-name',
      inject: [ConfigService],
    },

    // ✅ Logger & Services
    LoggerService,
    ObjectDetector,
    ContentModerator,
  ],
  exports: [
    ObjectDetector,
    ContentModerator,
    'S3',
    'SQS',
    'SNS',
    'REKOGNITION',
    'MEDIA_CONVERT',
    'DYNAMODB',
    'BUCKET_NAME',
  ],
})
export class AwsModule {}
