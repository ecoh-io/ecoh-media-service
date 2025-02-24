// src/albums/dto/create-album.dto.ts

import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Visibility } from 'src/common/enums/visibility.enum';

export class CreateAlbumDto {
  @ApiProperty({ description: 'Name of the album' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Visibility of the album',
    enum: Visibility,
    default: Visibility.PRIVATE,
  })
  @IsEnum(Visibility)
  visibility!: Visibility;

  @ApiPropertyOptional({ description: 'Cover photo key' })
  @IsString()
  coverPhotoId!: string;
}
