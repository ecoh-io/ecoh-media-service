import { MigrationInterface, QueryRunner } from "typeorm";

export class AlbumEntityEdit1739714027259 implements MigrationInterface {
    name = 'AlbumEntityEdit1739714027259'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "albums" RENAME COLUMN "description" TO "coverPhotoId"`);
        await queryRunner.query(`ALTER TYPE "public"."albums_visibility_enum" RENAME TO "albums_visibility_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."albums_visibility_enum" AS ENUM('private', 'connections_only', 'network_only', 'everyone')`);
        await queryRunner.query(`ALTER TABLE "albums" ALTER COLUMN "visibility" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "albums" ALTER COLUMN "visibility" TYPE "public"."albums_visibility_enum" USING "visibility"::"text"::"public"."albums_visibility_enum"`);
        await queryRunner.query(`ALTER TABLE "albums" ALTER COLUMN "visibility" SET DEFAULT 'private'`);
        await queryRunner.query(`DROP TYPE "public"."albums_visibility_enum_old"`);
        await queryRunner.query(`ALTER TABLE "albums" DROP COLUMN "coverPhotoId"`);
        await queryRunner.query(`ALTER TABLE "albums" ADD "coverPhotoId" uuid`);
        await queryRunner.query(`ALTER TYPE "public"."media_type_enum" RENAME TO "media_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."media_type_enum" AS ENUM('profile_picture', 'album_cover_image', 'image', 'video')`);
        await queryRunner.query(`ALTER TABLE "media" ALTER COLUMN "type" TYPE "public"."media_type_enum" USING "type"::"text"::"public"."media_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."media_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "albums" ADD CONSTRAINT "FK_9f1fc3a5c97873dd12d0b0fb244" FOREIGN KEY ("coverPhotoId") REFERENCES "media"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "albums" DROP CONSTRAINT "FK_9f1fc3a5c97873dd12d0b0fb244"`);
        await queryRunner.query(`CREATE TYPE "public"."media_type_enum_old" AS ENUM('profile_picture', 'image', 'video')`);
        await queryRunner.query(`ALTER TABLE "media" ALTER COLUMN "type" TYPE "public"."media_type_enum_old" USING "type"::"text"::"public"."media_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."media_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."media_type_enum_old" RENAME TO "media_type_enum"`);
        await queryRunner.query(`ALTER TABLE "albums" DROP COLUMN "coverPhotoId"`);
        await queryRunner.query(`ALTER TABLE "albums" ADD "coverPhotoId" text`);
        await queryRunner.query(`CREATE TYPE "public"."albums_visibility_enum_old" AS ENUM('public', 'private', 'shared')`);
        await queryRunner.query(`ALTER TABLE "albums" ALTER COLUMN "visibility" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "albums" ALTER COLUMN "visibility" TYPE "public"."albums_visibility_enum_old" USING "visibility"::"text"::"public"."albums_visibility_enum_old"`);
        await queryRunner.query(`ALTER TABLE "albums" ALTER COLUMN "visibility" SET DEFAULT 'private'`);
        await queryRunner.query(`DROP TYPE "public"."albums_visibility_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."albums_visibility_enum_old" RENAME TO "albums_visibility_enum"`);
        await queryRunner.query(`ALTER TABLE "albums" RENAME COLUMN "coverPhotoId" TO "description"`);
    }

}
