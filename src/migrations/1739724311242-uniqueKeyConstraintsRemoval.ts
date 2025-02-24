import { MigrationInterface, QueryRunner } from "typeorm";

export class UniqueKeyConstraintsRemoval1739724311242 implements MigrationInterface {
    name = 'UniqueKeyConstraintsRemoval1739724311242'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "albums" DROP CONSTRAINT "UQ_8f916d99af99755b24af6a101b3"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "albums" ADD CONSTRAINT "UQ_8f916d99af99755b24af6a101b3" UNIQUE ("name", "createdBy")`);
    }

}
