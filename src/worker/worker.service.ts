// src/worker/worker.service.ts

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import AWS from 'aws-sdk';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaService } from 'src/media/media.service';
import { LoggerService } from 'src/logger/logger.service';

@Injectable()
export class WorkerService implements OnModuleInit {
  private sqs: AWS.SQS;
  private queueUrl: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly mediaService: MediaService
  ) {
    AWS.config.update({ region: process.env.AWS_REGION });
    this.sqs = new AWS.SQS();
    this.queueUrl = process.env.AWS_SQS_QUEUE_URL || '';
    if (!this.queueUrl) {
      throw new Error('SQS Queue URL is not defined in environment variables.');
    }
  }

  /**
   * Lifecycle hook that is called once the module has been initialized.
   */
  onModuleInit() {
    this.logger.log('WorkerService initialized and ready to poll messages.');
  }

  /**
   * Processes a single SQS message.
   * @param message The SQS message to process.
   */
  async processMessage(message: AWS.SQS.Message): Promise<void> {
    const receiptHandle = message.ReceiptHandle;

    if (!receiptHandle) {
      this.logger.error(
        'ReceiptHandle is undefined for the message:',
        message.Body
      );
      // Decide how to handle messages without ReceiptHandle
      return;
    }

    try {
      // Your message processing logic here
      this.logger.log(`Processing message: ${message.MessageId}`);

      // Example: Parse message body
      if (!message.Body) {
        throw new Error('Message body is undefined.');
      }
      const body = JSON.parse(message.Body);
      const { mediaId, key, userId, albumId, tags } = body;

      await this.mediaService.processUploadedMedia(
        mediaId,
        key,
        userId,
        albumId,
        tags
      );

      // After successful processing, delete the message from the queue
      const deleteParams: AWS.SQS.DeleteMessageRequest = {
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      };

      await this.sqs.deleteMessage(deleteParams).promise();
      this.logger.log(`Deleted message: ${message.MessageId}`);
    } catch (error) {
      this.logger.error('Error processing message:', (error as Error).stack);
    }
  }

  /**
   * Polls the SQS queue for new messages and processes them.
   */
  async pollMessages(): Promise<void> {
    const params: AWS.SQS.ReceiveMessageRequest = {
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: 10, // Adjust as needed
      WaitTimeSeconds: 20, // Enable long polling
      VisibilityTimeout: 60, // Time to process the message
    };

    try {
      const data = await this.sqs.receiveMessage(params).promise();

      if (data.Messages && data.Messages.length > 0) {
        for (const message of data.Messages) {
          await this.processMessage(message);
        }
      } else {
        this.logger.log('No messages received.');
      }
    } catch (error) {
      this.logger.error(
        'Error receiving messages from SQS:',
        (error as Error).stack
      );
    }
  }

  async purgeQueue(): Promise<void> {
    try {
      const params: AWS.SQS.PurgeQueueRequest = {
        QueueUrl: this.queueUrl,
      };

      await this.sqs.purgeQueue(params).promise();
      this.logger.log('Successfully purged the SQS queue.');
    } catch (error) {
      this.logger.error('Error purging the SQS queue:', (error as Error).stack);
    }
  }

  /**
   * Scheduled task to poll messages at regular intervals.
   */
  @Cron(CronExpression.EVERY_MINUTE) // Adjust the schedule as needed
  async handleCron() {
    this.logger.log('Polling for SQS messages...');
    await this.pollMessages();
  }
}
