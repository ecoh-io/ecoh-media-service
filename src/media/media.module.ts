// src/media/media.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { Media } from './media.entity';
import { AlbumsModule } from '../albums/albums.module';
import { HttpModule } from '@nestjs/axios';
import { AwsModule } from 'src/aws/aws.module';
import { LoggerService } from 'src/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { VideoTranscoder } from 'src/aws/video-transcoder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media]),
    AwsModule,
    forwardRef(() => AlbumsModule), // Import AlbumsModule to access AlbumsService
    HttpModule,
  ],
  providers: [MediaService, LoggerService, VideoTranscoder],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
