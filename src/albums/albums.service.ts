// src/albums/albums.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Album } from './albums.entity';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { LoggerService } from 'src/logger/logger.service';
import { Media } from 'src/media/media.entity';
import { MediaService } from 'src/media/media.service';

@Injectable()
export class AlbumsService {
  constructor(
    @InjectRepository(Album)
    private albumRepository: Repository<Album>,
    @Inject(forwardRef(() => MediaService))
    public mediaService: MediaService,
    private readonly logger: LoggerService
  ) {}

  /**
   * Creates a new album.
   */
  async createAlbum(
    createAlbumDto: CreateAlbumDto,
    userId: string
  ): Promise<Album> {
    const { name, visibility, coverPhotoId } = createAlbumDto;

    let coverPhoto: Media | undefined;
    if (coverPhotoId) {
      coverPhoto = await this.mediaService.getMedia(coverPhotoId);
    }

    const album = this.albumRepository.create({
      name,
      visibility,
      createdBy: userId,
      coverPhoto,
    });

    await this.albumRepository.save(album);
    this.logger.log(`Album created with ID: ${album.id}`);

    return album;
  }

  /**
   * Retrieves an album by ID, ensuring access control.
   */
  async getAlbumById(id: string, userId: string): Promise<Album> {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: ['mediaItems', 'coverPhoto'],
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

  async getAlbumsByUserId(userId: string): Promise<Album[]> {
    // Validate the user ID
    if (!userId) {
      this.logger.warn('Invalid user ID provided for retrieving albums');
      throw new BadRequestException('User ID cannot be empty');
    }

    // Log the retrieval attempt
    this.logger.log(`Retrieving albums for user: ${userId}`);

    try {
      // Fetch the albums
      const albums = await this.albumRepository.find({
        where: { createdBy: userId },
        relations: ['mediaItems', 'coverPhoto'],
      });

      // Log the result
      this.logger.log(`Retrieved ${albums.length} albums for user: ${userId}`);
      return albums;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve albums for user: ${userId}`,
        error as any
      );
      throw new Error('Failed to retrieve albums');
    }
  }

  /**
   * Updates an existing album.
   */
  async updateAlbum(
    id: string,
    updateAlbumDto: UpdateAlbumDto,
    userId: string
  ): Promise<Album> {
    const album = await this.albumRepository.findOne({ where: { id } });
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
    const updatedAlbum = await this.albumRepository.save(album);
    this.logger.log(`Album updated: ${id} by user: ${userId}`);
    return updatedAlbum;
  }

  /**
   * Deletes an album.
   */
  async deleteAlbum(id: string, userId: string): Promise<void> {
    const album = await this.albumRepository.findOne({
      where: { id },
      relations: ['mediaItems', 'coverPhoto'],
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

    await this.albumRepository.remove(album);
    this.logger.log(`Album deleted: ${id} by user: ${userId}`);
  }

  // Additional methods like listing albums can be added here
}
