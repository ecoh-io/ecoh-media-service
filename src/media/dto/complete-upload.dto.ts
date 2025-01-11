// src/media/dto/complete-upload.dto.ts

import { IsUUID, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteUploadDto {
  @ApiProperty({ description: 'Media ID', type: 'string', format: 'uuid' })
  @IsUUID()
  mediaId!: string;

  @ApiProperty({ description: 'S3 object key' })
  @IsString()
  key!: string; // S3 object key

  @ApiProperty({ description: 'User ID', type: 'string', format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Album ID',
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
  @IsString({ each: true })
  tags?: string[];
}
