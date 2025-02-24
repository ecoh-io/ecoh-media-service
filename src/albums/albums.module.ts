import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlbumsService } from './albums.service';
import { AlbumsController } from './albums.controller';
import { Album } from './albums.entity';
import { LoggerService } from 'src/logger/logger.service';
import { MediaModule } from 'src/media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([Album]), forwardRef(() => MediaModule)],
  providers: [AlbumsService, LoggerService],
  controllers: [AlbumsController],
  exports: [AlbumsService],
})
export class AlbumsModule {}
