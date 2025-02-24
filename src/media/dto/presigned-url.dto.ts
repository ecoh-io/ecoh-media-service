// src/media/dto/presigned-url.dto.ts

import {
  IsEnum,
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType } from '../../common/enums/media-type.enum';

export class PresignedUrlDto {
  @ApiProperty({ description: 'Type of media', enum: MediaType })
  @IsEnum(MediaType)
  type!: MediaType;

  @ApiProperty({ description: 'MIME type of the media file' })
  @IsString()
  mimetype!: string;

  @ApiPropertyOptional({
    description: 'Album ID to associate the media with',
    type: 'string',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  albumId?: string;

  @ApiPropertyOptional({
    description: 'Tags associated with the media',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  tags?: string[];
}
