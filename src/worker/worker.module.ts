// src/worker/worker.module.ts

import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { ScheduleModule } from '@nestjs/schedule';
import { AwsModule } from '../aws/aws.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AwsModule, // To access AWS services if needed
    MediaModule, // To access MediaService for processing
  ],
  providers: [WorkerService],
})
export class WorkerModule {}
