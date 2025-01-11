// src/media/media.controller.ts

import {
  Controller,
  Post,
  UseGuards,
  Body,
  Req,
  Get,
  Delete,
  BadRequestException,
  Query,
  Param,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiBearerAuth()
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Generates a pre-signed URL for uploading media.
   *
   * **Endpoint**: POST /media/presigned-url
   *
   * **Request Body**:
   * ```json
   * {
   *   "type": "image",
   *   "mimetype": "image/jpeg",
   *   "albumId": "optional-album-uuid",
   *   "tags": ["tag1", "tag2"]
   * }
   * ```
   *
   * **Response**:
   * ```json
   * {
   *   "url": "https://s3.amazonaws.com/bucket/key.jpg?signature...",
   *   "mediaId": "generated-media-uuid"
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Post('presigned-url')
  @ApiOperation({ summary: 'Generate a pre-signed URL for media upload' })
  @ApiResponse({
    status: 201,
    description: 'Pre-signed URL generated successfully.',
  })
  async getPresignedUrl(@Body() body: PresignedUrlDto, @Req() req) {
    // Validate mimetype based on type
    const allowedMimetypes = {
      profile_picture: ['image/jpeg', 'image/png', 'image/gif'],
      image: ['image/jpeg', 'image/png', 'image/gif'],
      video: ['video/mp4', 'video/mpeg', 'video/quicktime'],
    };

    if (!allowedMimetypes[body.type].includes(body.mimetype)) {
      throw new BadRequestException(
        'Invalid mimetype for the specified media type'
      );
    }

    // If albumId is provided, verify it belongs to the user
    if (body.albumId && body.userId) {
      await this.mediaService.albumsService.getAlbumById(
        body.albumId,
        body.userId
      );
    }

    const { url, key, mediaId } = await this.mediaService.generatePresignedUrl(
      body.type,
      body.mimetype,
      body.userId,
      body.albumId,
      body.tags
    );
    return { url, mediaId };
  }

  /**
   * Notifies the media service of a completed upload.
   *
   * **Endpoint**: POST /media/complete-upload
   *
   * **Request Body**:
   * ```json
   * {
   *   "mediaId": "media-uuid",
   *   "key": "media/key.jpg",
   *   "albumId": "optional-album-uuid",
   *   "tags": ["tag1", "tag2"]
   * }
   * ```
   *
   * **Response**:
   * ```json
   * {
   *   "message": "Media processing initiated"
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Post('complete-upload')
  @ApiOperation({ summary: 'Notify the media service of a completed upload' })
  @ApiResponse({
    status: 200,
    description: 'Media processing initiated successfully.',
  })
  async completeUpload(@Body() body: CompleteUploadDto, @Req() req) {
    await this.mediaService.completeUpload(body);
    return { message: 'Media processing initiated' };
  }

  /**
   * Retrieves media details by ID.
   *
   * **Endpoint**: GET /media/:id
   *
   * **Response**:
   * ```json
   * {
   *   "media": {
   *     "id": "media-uuid",
   *     "url": "https://cloudfront-domain/key.jpg",
   *     "key": "key.jpg",
   *     "type": "image",
   *     "uploadedBy": "user-uuid",
   *     "album": { ... },
   *     "tags": ["tag1", "tag2"],
   *     "thumbnailUrl": "https://cloudfront-domain/key_thumbnail.jpg",
   *     "metadata": { ... },
   *     "isFlagged": false,
   *     "createdAt": "timestamp"
   *   }
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get media details by ID' })
  @ApiResponse({ status: 200, description: 'Media retrieved successfully.' })
  async getMedia(@Param('id') id: string, @Req() req) {
    const userId = req.user.id;
    const media = await this.mediaService.getMedia(id);

    // Check if media is in a private album
    if (
      media.album &&
      !media.album.visibility &&
      media.album.createdBy !== userId
    ) {
      throw new BadRequestException('Access to this media is forbidden');
    }

    return { media };
  }

  /**
   * Deletes media by ID.
   *
   * **Endpoint**: DELETE /media/:id
   *
   * **Response**:
   * ```json
   * {
   *   "message": "Media deleted successfully"
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete media by ID' })
  @ApiResponse({ status: 200, description: 'Media deleted successfully.' })
  async deleteMedia(@Param('id') id: string, @Req() req) {
    const userId = req.user.id;
    await this.mediaService.deleteMedia(id, userId);
    return { message: 'Media deleted successfully' };
  }

  /**
   * Lists media with pagination and optional album filtering.
   *
   * **Endpoint**: GET /media
   *
   * **Query Parameters**:
   * - `page`: Page number (default: 1)
   * - `limit`: Items per page (default: 20)
   * - `albumId`: Optional album ID to filter media
   *
   * **Response**:
   * ```json
   * {
   *   "data": [ ... ],
   *   "total": 100
   * }
   * ```
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({
    summary: 'List media with pagination and optional album filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'Media list retrieved successfully.',
  })
  async listMedia(
    @Req() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('albumId') albumId?: string
  ) {
    const userId = req.user.id;
    const mediaList = await this.mediaService.getMediaList(
      userId,
      page,
      limit,
      albumId
    );
    return mediaList;
  }

  // Additional endpoints like searching media by tags can be added here
}
