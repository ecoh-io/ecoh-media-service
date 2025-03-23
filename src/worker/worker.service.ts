import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import AWS from 'aws-sdk';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaService } from 'src/media/media.service';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class WorkerService implements OnModuleInit {
  private queueUrls: Record<string, string>;

  constructor(
    private readonly logger: LoggerService,
    private readonly mediaService: MediaService,
    @Inject('DYNAMODB') private readonly dynamoDB: AWS.DynamoDB.DocumentClient,
    @Inject('SQS') private readonly sqs: AWS.SQS
  ) {
    this.queueUrls = {
      MEDIA_PROCESSING: process.env.AWS_SQS_MEDIA_PROCESSING_QUEUE_URL || '',
      VIDEO_MODERATION: process.env.AWS_SQS_VIDEO_MODERATION_QUEUE_URL || '',
    };

    // Ensure all required queues exist
    Object.entries(this.queueUrls).forEach(([key, url]) => {
      if (!url) {
        throw new Error(
          `SQS Queue URL for ${key} is not defined in environment variables.`
        );
      }
    });
  }

  /**
   * Lifecycle hook that is called once the module has been initialized.
   */
  onModuleInit() {
    this.logger.log(
      'WorkerService initialized and ready to poll multiple queues.'
    );
  }

  /**
   * ✅ Polls multiple SQS queues in parallel.
   */
  async pollAllQueues(): Promise<void> {
    await Promise.all([
      this.pollQueue('MEDIA_PROCESSING'),
      this.pollQueue('VIDEO_MODERATION'),
    ]);
  }

  /**
   * ✅ Polls a specific SQS queue and processes messages.
   */
  private async pollQueue(
    queueName: keyof typeof this.queueUrls
  ): Promise<void> {
    const queueUrl = this.queueUrls[queueName];

    const params: AWS.SQS.ReceiveMessageRequest = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 60,
      MessageAttributeNames: ['All'],
    };

    try {
      const data = await this.sqs.receiveMessage(params).promise();

      if (data.Messages && data.Messages.length > 0) {
        this.logger.log(
          `Received ${data.Messages.length} messages from ${queueName}`
        );

        for (const message of data.Messages) {
          await this.processMessage(queueName, message);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error polling ${queueName} queue:`,
        undefined,
        error as any
      );
    }
  }

  /**
   * ✅ Routes a message to the appropriate processor.
   */
  private async processMessage(
    queueName: keyof typeof this.queueUrls,
    message: AWS.SQS.Message
  ): Promise<void> {
    const receiptHandle = message.ReceiptHandle;
    if (!receiptHandle || !message.Body) {
      this.logger.error(
        `Invalid message received in ${queueName}`,
        undefined,
        JSON.stringify(message)
      );
      return;
    }

    try {
      const snsMessage = JSON.parse(message.Body);

      // Parse the actual payload from the SNS message
      const payload = JSON.parse(snsMessage.Message);

      switch (queueName) {
        case 'MEDIA_PROCESSING':
          await this.mediaService.processUploadedMedia(
            payload.mediaId,
            payload.key,
            payload.userId,
            payload.albumId,
            payload.tags
          );
          break;

        case 'VIDEO_MODERATION':
          await this.processVideoModerationMessage(payload);
          break;

        default:
          throw new Error(`Unknown queue type: ${queueName}`);
      }

      await this.sqs
        .deleteMessage({
          QueueUrl: this.queueUrls[queueName],
          ReceiptHandle: receiptHandle,
        })
        .promise();
      this.logger.log(
        `Successfully processed and deleted message from ${queueName}`
      );
    } catch (error) {
      console.log(`Error processing message from ${queueName}:`, error);
      this.logger.error(
        `Error processing message from ${queueName}:`,
        undefined,
        error as any
      );
    }
  }

  /**
   * ✅ Processes video moderation results.
   */
  private async processVideoModerationMessage(body: any): Promise<void> {
    const { JobId: jobId, JobTag, Status, ModerationLabels } = body;
    const mediaId = JobTag;
    this.logger.log(
      `Processing video moderation result for Media ID: ${mediaId}`
    );

    if (!mediaId) {
      this.logger.error(`Missing Media ID for Job ID: ${jobId}`);
      return;
    }

    if (Status === 'SUCCEEDED') {
      let explicitContentDetected = false;

      if (ModerationLabels?.length) {
        const explicitLabels = ModerationLabels.filter(label =>
          ['Explicit Nudity', 'Violence'].includes(label.ParentName || '')
        );

        if (explicitLabels.length > 0) {
          this.logger.warn(
            `Video flagged. Labels: ${explicitLabels
              .map(l => l.Name)
              .join(', ')}`
          );
          explicitContentDetected = true;
        }
      }

      // ✅ Update SQL database
      await this.mediaService.updateModerationStatus(
        mediaId,
        explicitContentDetected
      );

      // ✅ Update DynamoDB
      try {
        await this.dynamoDB
          .update({
            TableName: 'video_moderation_jobs',
            Key: { jobId }, // or { jobId } if that's your PK
            UpdateExpression:
              'SET #status = :status, #flagged = :flagged, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#flagged': 'isFlagged',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':status': 'COMPLETED',
              ':flagged': explicitContentDetected,
              ':updatedAt': new Date().toISOString(),
            },
          })
          .promise();

        this.logger.log(
          `DynamoDB video_moderation_jobs updated for Job ID: ${jobId}`
        );
      } catch (err) {
        this.logger.error(
          `Failed to update video_moderation_jobs table for Job ID: ${jobId}`,
          err as any
        );
      }
    } else {
      this.logger.error(`Moderation job failed for Job ID: ${jobId}`);

      await this.dynamoDB
        .update({
          TableName: 'video_moderation_jobs',
          Key: { jobId },
          UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':status': 'FAILED',
            ':updatedAt': new Date().toISOString(),
          },
        })
        .promise();
    }
  }

  /**
   * ✅ Scheduled task to poll all queues.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    this.logger.log('Polling all SQS queues...');
    await this.pollAllQueues();
  }
}
