// src/media/media.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { Media } from './media.entity';
import { AlbumsModule } from '../albums/albums.module';
import { HttpModule } from '@nestjs/axios';
import { AwsModule } from 'src/aws/aws.module';
import { LoggerService } from 'src/logger/logger.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Media]),
    AwsModule,
    AlbumsModule, // Import AlbumsModule to access AlbumsService
    HttpModule,
  ],
  providers: [MediaService, LoggerService],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
