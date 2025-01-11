import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import configuration from './config/configuration';
import * as fs from 'fs';
import * as path from 'path';
import { MediaModule } from './media/media.module';
import { AlbumsModule } from './albums/albums.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { WorkerModule } from './worker/worker.module';
import { AwsModule } from './aws/aws.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: '.env',
    }),
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
              rejectUnauthorized: true, // Enforce SSL certificate validation
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
          logging: configService.get<string>('nodeEnv') !== 'production',
        };
      },
      inject: [ConfigService],
    }),
    LoggerModule,
    MediaModule,
    AlbumsModule,
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
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
