// src/albums/dto/update-album.dto.ts

import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAlbumDto {
  @ApiPropertyOptional({ description: 'Name of the album' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description of the album' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Visibility of the album',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
