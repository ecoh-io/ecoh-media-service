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
import { MultipleUploadDto } from './dto/multiple-upload.dto';

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
    const userId = req.user.sub;
    // Validate mimetype based on type
    const allowedMimetypes = {
      profile_picture: ['image/jpeg', 'image/png', 'image/gif'],
      album_cover_image: ['image/jpeg', 'image/png', 'image/gif'],
      image: ['image/jpeg', 'image/png', 'image/gif'],
      video: ['video/mp4', 'video/mpeg', 'video/quicktime'],
    };

    if (!allowedMimetypes[body.type].includes(body.mimetype)) {
      throw new BadRequestException(
        'Invalid mimetype for the specified media type'
      );
    }

    // If albumId is provided, verify it belongs to the user
    if (body.albumId && userId) {
      await this.mediaService.albumsService.getAlbumById(body.albumId, userId);
    }

    const { url, key, mediaId } = await this.mediaService.generatePresignedUrl(
      body.type,
      body.mimetype,
      userId,
      body.albumId,
      body.tags
    );
    return { url, key, mediaId };
  }

  @UseGuards(JwtAuthGuard)
  @Post('multiple-presigned-urls')
  @ApiOperation({
    summary: 'Generate multiple pre-signed URLs for media upload',
  })
  @ApiResponse({
    status: 201,
    description: 'Pre-signed URLs generated successfully.',
  })
  async getMultiplePresignedUrls(@Body() body: MultipleUploadDto, @Req() req) {
    const userId = req.user.sub;

    // Validate mimetype based on type
    const allowedMimetypes = {
      profile_picture: ['image/jpeg', 'image/png', 'image/gif'],
      image: ['image/jpeg', 'image/png', 'image/gif'],
      video: ['video/mp4', 'video/mpeg', 'video/quicktime'],
    };

    const validateMimetype = (type: string, mimetype: string) => {
      if (!allowedMimetypes[type].includes(mimetype)) {
        throw new BadRequestException(
          `Invalid mimetype ${mimetype} for the specified media type ${type}`
        );
      }
    };

    // If albumId is provided, verify it belongs to the user
    const results = await Promise.all(
      body.uploads.map(async upload => {
        validateMimetype(upload.type, upload.mimetype);

        if (upload.albumId) {
          await this.mediaService.albumsService.getAlbumById(
            upload.albumId,
            userId
          );
        }

        return this.mediaService.generatePresignedUrl(
          upload.type,
          upload.mimetype,
          userId,
          upload.albumId,
          upload.tags
        );
      })
    );

    return results;
  }

  @UseGuards(JwtAuthGuard)
  @Post('complete-multiple-uploads')
  @ApiOperation({
    summary: 'Notify the media service of multiple completed uploads',
  })
  @ApiResponse({
    status: 200,
    description: 'Media processing initiated successfully for all uploads.',
  })
  async completeMultipleUploads(@Body() body: CompleteUploadDto[], @Req() req) {
    try {
      await Promise.all(
        body.map(upload => this.mediaService.completeUpload(upload))
      );
      return { message: 'Media processing initiated for all uploads' };
    } catch (error) {
      throw new BadRequestException('Failed to complete multiple uploads');
    }
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
