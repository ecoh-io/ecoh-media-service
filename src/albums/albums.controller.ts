// src/albums/albums.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { AlbumsService } from './albums.service';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiBearerAuth()
@ApiTags('albums')
@Controller('albums')
export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  /**
   * Creates a new album.
   *
   * **Endpoint**: POST /albums
   *
   * **Request Body**:
   * ```json
   * {
   *   "name": "Vacation Photos",
   *   "description": "Photos from my 2023 vacation",
   *   "isPublic": true
   * }
   * ```
   *
   * **Response**:
   * ```json
   * {
   *   "album": {
   *     "id": "album-uuid",
   *     "name": "Vacation Photos",
   *     "description": "Photos from my 2023 vacation",
   *     "createdBy": "user-uuid",
   *     "isPublic": true,
   *     "mediaItems": [],
   *     "createdAt": "timestamp"
   *   }
   * }
   * ```
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new album' })
  @ApiResponse({ status: 201, description: 'Album created successfully.' })
  async createAlbum(@Body() createAlbumDto: CreateAlbumDto, @Req() req) {
    const userId = req.user.sub;
    const album = await this.albumsService.createAlbum(createAlbumDto, userId);
    return album;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all albums for a user' })
  @ApiResponse({ status: 200, description: 'Albums retrieved successfully.' })
  async getAlbums(@Req() req) {
    const userId = req.user.sub;
    const albums = await this.albumsService.getAlbumsByUserId(userId);
    return albums;
  }

  /**
   * Retrieves album details by ID.
   *
   * **Endpoint**: GET /albums/:id
   *
   * **Response**:
   * ```json
   * {
   *   "album": {
   *     "id": "album-uuid",
   *     "name": "Vacation Photos",
   *     "description": "Photos from my 2023 vacation",
   *     "createdBy": "user-uuid",
   *     "isPublic": true,
   *     "mediaItems": [ ... ],
   *     "createdAt": "timestamp"
   *   }
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get album details by ID' })
  @ApiResponse({ status: 200, description: 'Album retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Album not found.' })
  async getAlbum(@Param('id') id: string, @Req() req) {
    const userId = req.user.sub;
    const album = await this.albumsService.getAlbumById(id, userId);
    return album;
  }

  /**
   * Updates an existing album.
   *
   * **Endpoint**: PATCH /albums/:id
   *
   * **Request Body**:
   * ```json
   * {
   *   "name": "Updated Album Name",
   *   "description": "Updated description",
   *   "isPublic": false
   * }
   * ```
   *
   * **Response**:
   * ```json
   * {
   *   "album": {
   *     "id": "album-uuid",
   *     "name": "Updated Album Name",
   *     "description": "Updated description",
   *     "createdBy": "user-uuid",
   *     "isPublic": false,
   *     "mediaItems": [ ... ],
   *     "createdAt": "timestamp"
   *   }
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing album' })
  @ApiResponse({ status: 200, description: 'Album updated successfully.' })
  @ApiResponse({ status: 404, description: 'Album not found.' })
  async updateAlbum(
    @Param('id') id: string,
    @Body() updateAlbumDto: UpdateAlbumDto,
    @Req() req
  ) {
    const userId = req.user.sub;
    const album = await this.albumsService.updateAlbum(
      id,
      updateAlbumDto,
      userId
    );
    return { album };
  }

  /**
   * Deletes an album.
   *
   * **Endpoint**: DELETE /albums/:id
   *
   * **Response**:
   * ```json
   * {
   *   "message": "Album deleted successfully"
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an album' })
  @ApiResponse({ status: 200, description: 'Album deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Album not found.' })
  async deleteAlbum(@Param('id') id: string, @Req() req) {
    const userId = req.user.sub;
    await this.albumsService.deleteAlbum(id, userId);
    return { message: 'Album deleted successfully' };
  }

  // Additional endpoints like listing albums can be added here
}
