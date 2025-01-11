// src/albums/albums.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Album } from './albums.entity';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class AlbumsService {
  constructor(
    @InjectRepository(Album)
    private albumsRepository: Repository<Album>,
    private readonly logger: LoggerService
  ) {}

  /**
   * Creates a new album.
   */
  async createAlbum(
    createAlbumDto: CreateAlbumDto,
    userId: string
  ): Promise<Album> {
    const album = this.albumsRepository.create({
      ...createAlbumDto,
      createdBy: userId,
    });
    const savedAlbum = await this.albumsRepository.save(album);
    this.logger.log(`Album created: ${savedAlbum.id} by user: ${userId}`);
    return savedAlbum;
  }

  /**
   * Retrieves an album by ID, ensuring access control.
   */
  async getAlbumById(id: string, userId: string): Promise<Album> {
    const album = await this.albumsRepository.findOne({
      where: { id },
      relations: ['mediaItems'],
    });
    if (!album) {
      this.logger.warn(`Album not found: ${id}`);
      throw new NotFoundException('Album not found');
    }

    if (!album.visibility && album.createdBy !== userId) {
      this.logger.warn(`User ${userId} unauthorized to access album: ${id}`);
      throw new ForbiddenException('Access to this album is forbidden');
    }

    return album;
  }

  /**
   * Updates an existing album.
   */
  async updateAlbum(
    id: string,
    updateAlbumDto: UpdateAlbumDto,
    userId: string
  ): Promise<Album> {
    const album = await this.albumsRepository.findOne({ where: { id } });
    if (!album) {
      this.logger.warn(`Album not found for update: ${id}`);
      throw new NotFoundException('Album not found');
    }

    if (album.createdBy !== userId) {
      this.logger.warn(`User ${userId} unauthorized to update album: ${id}`);
      throw new ForbiddenException(
        'You are not authorized to update this album'
      );
    }

    Object.assign(album, updateAlbumDto);
    const updatedAlbum = await this.albumsRepository.save(album);
    this.logger.log(`Album updated: ${id} by user: ${userId}`);
    return updatedAlbum;
  }

  /**
   * Deletes an album.
   */
  async deleteAlbum(id: string, userId: string): Promise<void> {
    const album = await this.albumsRepository.findOne({
      where: { id },
      relations: ['mediaItems'],
    });
    if (!album) {
      this.logger.warn(`Album not found for deletion: ${id}`);
      throw new NotFoundException('Album not found');
    }

    if (album.createdBy !== userId) {
      this.logger.warn(`User ${userId} unauthorized to delete album: ${id}`);
      throw new ForbiddenException(
        'You are not authorized to delete this album'
      );
    }

    await this.albumsRepository.remove(album);
    this.logger.log(`Album deleted: ${id} by user: ${userId}`);
  }

  // Additional methods like listing albums can be added here
}
