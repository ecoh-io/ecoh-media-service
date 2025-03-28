import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import configuration from './config/configuration';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import { MediaModule } from './media/media.module';
import { AlbumsModule } from './albums/albums.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { WorkerModule } from './worker/worker.module';
import { AwsModule } from './aws/aws.module';
import { LoggerMiddleware } from './logger/logger.middleware';
import { RequestIdMiddleware } from './logger/request-id.middleware';
import { WinstonModule } from 'nest-winston';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const sslEnabled = configService.get<boolean>('database.ssl');
        const sslFilePath = configService.get<string>('database.sslFile');

        let sslOptions: any = false;

        if (sslEnabled && sslFilePath) {
          const absolutePath = path.isAbsolute(sslFilePath)
            ? sslFilePath
            : path.resolve(__dirname, sslFilePath);

          try {
            const ca = fs.readFileSync(absolutePath).toString();
            sslOptions = {
              ca,
              require: true,
              rejectUnauthorized: false, // Enforce SSL certificate validation
            };
          } catch (error) {
            console.error('Failed to read SSL certificate file:', error);
            // Depending on your preference, you can throw an error or proceed without SSL
            throw new Error(
              'SSL is enabled but the certificate file could not be read.'
            );
          }
        }

        return {
          type: 'postgres',
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.name'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false, // Set to false in production
          migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
          cli: {
            migrationsDir: 'src/migrations',
          },
          ssl: sslOptions,
          logging: false,
        };
      },
      inject: [ConfigService],
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        level: configService.get<string>('logLevel'),
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.splat(),
          winston.format.json()
        ),
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            ),
          }),
          // Add more transports like File, AWS CloudWatch, etc., as needed
        ],
      }),
      inject: [ConfigService],
    }),
    AlbumsModule,
    MediaModule,
    MetricsModule,
    WorkerModule,
    AuthModule,
    AwsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, LoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
