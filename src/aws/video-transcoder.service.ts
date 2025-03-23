import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import AWS from 'aws-sdk';
import { LoggerService } from 'src/logger/logger.service';
import { EntityManager, Connection } from 'typeorm';
import { Media } from 'src/media/media.entity'; // Ensure the Media entity is imported
import { MediaService } from 'src/media/media.service';

@Injectable()
export class VideoTranscoder {
  private readonly inputBucket = 'ecoh-media';
  private readonly outputBucket = 'ecoh-media';
  private readonly outputPrefix = 'video/transcoded';
  private readonly inputPrefix = 'video';
  private readonly templateName = 'Ecoh-Transcoding-Template';
  private readonly cloudFrontDomain: string =
    process.env.AWS_CLOUDFRONT_URL || 'https://default-cloudfront-domain';
  private readonly region = 'eu-west-2';

  constructor(
    @Inject('MEDIA_CONVERT') private readonly mediaConvert: AWS.MediaConvert,
    @Inject('DYNAMODB') private readonly dynamoDB: AWS.DynamoDB.DocumentClient,
    @Inject(forwardRef(() => MediaService))
    private readonly mediaService: MediaService,
    private connection: Connection,
    private readonly logger: LoggerService
  ) {}

  /**
   * Submits a video for transcoding using AWS MediaConvert.
   * @param key The S3 object key of the video to be transcoded (e.g., "video/user123/myvideo.mp4").
   */
  async transcodeVideo(mediaId: string, key: string): Promise<void> {
    this.logger.log(`Submitting MediaConvert job for: ${key}`);

    if (!key.startsWith(`${this.inputPrefix}/`)) {
      this.logger.error(
        `Invalid video key: ${key}. Must be in '${this.inputPrefix}/'`
      );
      throw new Error('Invalid video path.');
    }

    try {
      // Get the MediaConvert endpoint
      const endpoint = await this.getMediaConvertEndpoint();
      const mediaConvertWithEndpoint = new AWS.MediaConvert({
        region: this.region,
        endpoint: endpoint,
      });

      // Build the job parameters
      const jobParams: AWS.MediaConvert.CreateJobRequest = {
        Role: 'arn:aws:iam::529088281346:role/MediaConvertRole',
        JobTemplate: this.templateName,
        Settings: {
          Inputs: [{ FileInput: `s3://${this.inputBucket}/${key}` }],
          OutputGroups: [
            {
              Name: 'Apple HLS',
              OutputGroupSettings: {
                HlsGroupSettings: {
                  Destination: `s3://${this.outputBucket}/${
                    this.outputPrefix
                  }/${this.extractFileName(key)}/`,
                  SegmentLength: 6,
                  MinSegmentLength: 0,
                },
              },
            },
          ],
        },
        StatusUpdateInterval: 'SECONDS_10',
      };

      const jobResponse = await mediaConvertWithEndpoint
        .createJob(jobParams)
        .promise();

      if (jobResponse.Job?.Id) {
        this.logger.log(
          `MediaConvert job created successfully: ${jobResponse.Job.Id}`
        );
        await this.saveTranscodingJob(jobResponse.Job.Id, key, mediaId);
      } else {
        throw new Error('MediaConvert job creation returned an undefined Job.');
      }
    } catch (error) {
      this.logger.error(
        `Failed to start MediaConvert job for: ${key}`,
        undefined,
        error as any
      );
      throw new Error('MediaConvert transcoding failed');
    }
  }

  /**
   * Retrieves the AWS MediaConvert endpoint.
   */
  async getMediaConvertEndpoint(): Promise<string> {
    if (typeof this.mediaConvert.config.endpoint === 'string') {
      this.logger.log(
        `Using cached MediaConvert endpoint: ${this.mediaConvert.config.endpoint}`
      );
      return this.mediaConvert.config.endpoint;
    }
    const response = await this.mediaConvert.describeEndpoints().promise();
    if (!response.Endpoints?.length) {
      throw new Error('No MediaConvert endpoints found');
    }
    const endpoint = response.Endpoints[0].Url;
    if (!endpoint) {
      throw new Error('Endpoint URL is undefined');
    }
    this.mediaConvert.config.endpoint = endpoint;
    this.logger.log(`Retrieved MediaConvert endpoint: ${endpoint}`);
    return endpoint;
  }

  /**
   * Saves a transcoding job's status to DynamoDB.
   */
  private async saveTranscodingJob(
    jobId: string,
    key: string,
    mediaId: string
  ): Promise<void> {
    await this.dynamoDB
      .put({
        TableName: 'transcoding_jobs',
        Item: {
          jobId,
          status: 'IN_PROGRESS',
          videoKey: key,
          mediaId: mediaId,
          createdAt: new Date().toISOString(),
        },
      })
      .promise();
    this.logger.log(`Saved MediaConvert job ${jobId} in DynamoDB`);
  }

  /**
   * Checks the status of a MediaConvert job and updates the database.
   */
  async checkJobStatus(jobId: string): Promise<void> {
    try {
      // Fetch job details from MediaConvert
      const jobDetails = await this.mediaConvert
        .getJob({ Id: jobId })
        .promise();
      if (!jobDetails.Job) {
        this.logger.error(`MediaConvert job ${jobId} not found.`);
        return;
      }

      const status = jobDetails.Job.Status;
      this.logger.log(`MediaConvert job ${jobId} status: ${status}`);

      // Retrieve the original video key from DynamoDB
      const dynamoResult = await this.dynamoDB
        .get({ TableName: 'transcoding_jobs', Key: { jobId } })
        .promise();

      const mediaId = dynamoResult.Item?.mediaId;
      const videoKey = dynamoResult.Item?.videoKey;

      if (!mediaId || !videoKey) {
        this.logger.error(
          `No mediaId or videoKey found in DynamoDB for job: ${jobId}`
        );
        return;
      }

      // ✅ If the job is complete, generate and update the media record with the final URL
      if (status === 'COMPLETE') {
        const outputUrl = this.extractOutputUrl(videoKey);

        if (!outputUrl) {
          this.logger.error(`No valid output URL found for job: ${jobId}`);
          return;
        }

        // ✅ Update the media record in the database
        await this.updateMediaRecord(mediaId, outputUrl);

        const metadata = await this.mediaService.extractVideoMetadata(videoKey);

        await this.connection.transaction(async (manager: EntityManager) => {
          const media = await manager.findOne(Media, {
            where: { id: mediaId },
          });
          if (!media) {
            this.logger.warn(
              `Media not found for post-transcoding metadata: ${mediaId}`
            );
            return;
          }
          media.metadata = {
            ...media.metadata,
            ...metadata,
          };
          await manager.save(media);
          this.logger.log(
            `✅ Metadata updated for transcoded media: ${mediaId}`
          );
        });
      }

      // ✅ Update job status in DynamoDB
      await this.dynamoDB
        .update({
          TableName: 'transcoding_jobs',
          Key: { jobId },
          UpdateExpression: 'SET #status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
        })
        .promise();
    } catch (error) {
      this.logger.error(
        `Failed to fetch MediaConvert job status for: ${jobId}`,
        undefined,
        error as any
      );
    }
  }

  /**
   * Updates the media record in the database with the transcoded video URL.
   */
  private async updateMediaRecord(
    mediaId: string,
    transcodedUrl: string
  ): Promise<void> {
    if (!transcodedUrl) {
      this.logger.warn(`No valid transcoded URL found for key: ${mediaId}`);
      return;
    }

    this.logger.log(
      `Updating media record with transcoded URL: ${transcodedUrl}`
    );

    await this.connection.transaction(async (manager: EntityManager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Media)
        .set({ url: transcodedUrl, updatedAt: new Date() }) // ✅ Updates timestamp for consistency
        .where('id = :mediaId', { mediaId })
        .execute();

      if (result.affected === 0) {
        this.logger.warn(`No media record found for id: ${mediaId}`);
        return;
      }

      this.logger.log(`Media record updated successfully for id: ${mediaId}`);
    });
  }

  /**
   * Deletes a failed job entry from DynamoDB.
   */
  private async deleteFailedJob(jobId: string): Promise<void> {
    try {
      await this.dynamoDB
        .delete({
          TableName: 'transcoding_jobs',
          Key: { jobId },
        })
        .promise();
      this.logger.log(`Deleted failed job ${jobId} from DynamoDB`);
    } catch (error) {
      this.logger.error(
        `Failed to delete failed job ${jobId} from DynamoDB`,
        undefined,
        error as any
      );
    }
  }

  /**
   * Extracts the master .m3u8 file URL from MediaConvert job details.
   */
  private extractOutputUrl(videoKey: string): string {
    const cleanKey = this.extractFileName(videoKey);
    return `https://${this.cloudFrontDomain}/videos/transcoded/${cleanKey}.m3u8`;
  }

  /**
   * Polls for completed MediaConvert jobs every 2 minutes.
   */
  async pollTranscodingJobs(): Promise<void> {
    this.logger.log('Polling for completed MediaConvert jobs...');
    try {
      const jobs = await this.dynamoDB
        .scan({
          TableName: 'transcoding_jobs',
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'IN_PROGRESS' },
        })
        .promise();

      for (const job of jobs.Items || []) {
        await this.checkJobStatus(job.jobId);
      }
    } catch (error) {
      this.logger.error(
        'Failed to poll transcoding jobs',
        undefined,
        error as any
      );
    }
  }

  @Cron('*/2 * * * *') // Runs every 2 minutes
  async handleJobPolling() {
    await this.pollTranscodingJobs();
  }

  /**
   * Extracts the filename (without extension) from an S3 key.
   */
  private extractFileName(key: string): string {
    return key.replace(`${this.inputPrefix}/`, '').replace(/\.[^/.]+$/, '');
  }
}
