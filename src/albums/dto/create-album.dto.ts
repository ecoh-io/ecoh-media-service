// src/albums/dto/create-album.dto.ts

import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class CreateAlbumDto {
  @ApiProperty({ description: 'Name of the album' })
  @IsString()
  name!: string;

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
