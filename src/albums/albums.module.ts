import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumsService } from './albums.service';
import { AlbumsController } from './albums.controller';
import { Album } from './albums.entity';
import { LoggerService } from 'src/logger/logger.service';

@Module({
  imports: [TypeOrmModule.forFeature([Album])],
  providers: [AlbumsService, LoggerService],
  controllers: [AlbumsController],
  exports: [AlbumsService],
})
export class AlbumsModule {}
