import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Album } from '../albums/albums.entity';
import {
  IsUrl,
  IsEnum,
  IsUUID,
  IsOptional,
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
} from 'class-validator';
import { MediaType } from '../common/enums/media-type.enum';

@Entity()
@Index('IDX_MEDIA_TAGS', { synchronize: false }) // Consider using a separate index strategy for array columns
@Unique(['key']) // Ensure the S3 object key is unique
export class Media {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  id!: string;

  @Column()
  @Index()
  @IsUrl()
  url!: string;

  @Column()
  @Index()
  key!: string; // S3 object key

  @Column({
    type: 'enum',
    enum: MediaType,
  })
  @IsEnum(MediaType)
  type!: MediaType;

  @Column()
  @Index()
  @IsUUID()
  uploadedBy!: string; // User ID from auth & user service

  @ManyToOne(() => Album, album => album.mediaItems, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @IsOptional()
  album?: Album;

  @Column('text', { array: true, nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  tags?: string[];

  @Column({ nullable: true })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string; // URL of the generated thumbnail

  @Column({ type: 'json', nullable: true })
  @IsOptional()
  metadata?: Record<string, unknown>; // Extracted metadata with specific typing

  @Column({ default: false })
  @IsBoolean()
  isFlagged!: boolean; // Indicates if content is flagged

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  // For full-text search
  /*
      @Column({ type: 'tsvector', select: false, nullable: true })
      searchVector?: string;
    */
}
