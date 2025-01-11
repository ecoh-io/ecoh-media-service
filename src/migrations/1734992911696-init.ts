import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1734992911696 implements MigrationInterface {
    name = 'Init1734992911696'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."albums_visibility_enum" AS ENUM('public', 'private', 'shared')`);
        await queryRunner.query(`CREATE TABLE "albums" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "description" text, "createdBy" character varying NOT NULL, "visibility" "public"."albums_visibility_enum" NOT NULL DEFAULT 'private', "isArchived" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_8f916d99af99755b24af6a101b3" UNIQUE ("name", "createdBy"), CONSTRAINT "PK_838ebae24d2e12082670ffc95d7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5c17fece855899bace782d3a29" ON "albums" ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_046d79e9b68d34cb99920146e4" ON "albums" ("createdBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_ALBUM_CREATED_BY" ON "albums" ("createdBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_ALBUM_NAME" ON "albums" ("name") `);
        await queryRunner.query(`CREATE TYPE "public"."media_type_enum" AS ENUM('profile_picture', 'image', 'video')`);
        await queryRunner.query(`CREATE TABLE "media" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "url" character varying NOT NULL, "key" character varying NOT NULL, "type" "public"."media_type_enum" NOT NULL, "uploadedBy" character varying NOT NULL, "tags" text array, "thumbnailUrl" character varying, "metadata" json, "isFlagged" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "albumId" uuid, CONSTRAINT "UQ_b305063b0a030ab458c128078c7" UNIQUE ("key"), CONSTRAINT "PK_f4e0fcac36e050de337b670d8bd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_42a60c07e4b566f0cc06a1eaaf" ON "media" ("url") `);
        await queryRunner.query(`CREATE INDEX "IDX_b305063b0a030ab458c128078c" ON "media" ("key") `);
        await queryRunner.query(`CREATE INDEX "IDX_aa2448683904dc9879c1085ca6" ON "media" ("uploadedBy") `);
        await queryRunner.query(`ALTER TABLE "media" ADD CONSTRAINT "FK_b8a6219dd26157b0ae902aec883" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "FK_b8a6219dd26157b0ae902aec883"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aa2448683904dc9879c1085ca6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b305063b0a030ab458c128078c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_42a60c07e4b566f0cc06a1eaaf"`);
        await queryRunner.query(`DROP TABLE "media"`);
        await queryRunner.query(`DROP TYPE "public"."media_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ALBUM_NAME"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ALBUM_CREATED_BY"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_046d79e9b68d34cb99920146e4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5c17fece855899bace782d3a29"`);
        await queryRunner.query(`DROP TABLE "albums"`);
        await queryRunner.query(`DROP TYPE "public"."albums_visibility_enum"`);
    }

}
