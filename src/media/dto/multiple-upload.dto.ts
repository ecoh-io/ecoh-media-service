import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PresignedUrlDto } from './presigned-url.dto';

export class MultipleUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PresignedUrlDto)
  uploads!: PresignedUrlDto[];
}
