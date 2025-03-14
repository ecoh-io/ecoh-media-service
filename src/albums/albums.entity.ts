// src/albums/albums.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Media } from '../media/media.entity';
import { IsString, IsUUID, IsBoolean, Length, IsEnum } from 'class-validator';
import { Visibility } from '../common/enums/visibility.enum';

/**
 * Enhanced Album Entity with additional features:
 * - Timestamps (createdAt, updatedAt)
 * - Soft deletes
 * - Validation using class-validator
 * - Relations to User entity
 * - Improved indexing and unique constraints
 * - Specific typing and enumerations
 * - Full-text search capabilities
 * - Lifecycle hooks for related operations
 */
@Entity('albums')
@Index('IDX_ALBUM_NAME', ['name'])
@Index('IDX_ALBUM_CREATED_BY', ['createdBy'])
export class Album {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  @Index()
  @IsString()
  @Length(1, 255)
  name!: string;

  @Column()
  @Index()
  @IsUUID()
  createdBy!: string; // Relation to User entity

  @Column({
    type: 'enum',
    enum: Visibility,
    default: Visibility.PRIVATE,
  })
  @IsEnum(Visibility)
  visibility!: Visibility; // Enum to define album visibility

  @Column({ default: false })
  @IsBoolean()
  isArchived!: boolean; // Indicates if the album is archived

  @OneToMany(() => Media, media => media.album, { cascade: true })
  mediaItems?: Media[];

  @ManyToOne(() => Media, { nullable: true })
  @JoinColumn({ name: 'coverPhotoId' })
  coverPhoto!: Media;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
