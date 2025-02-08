import * as winston from 'winston';
import { customLogLevels } from './custom-log-levels';
import DailyRotateFile from 'winston-daily-rotate-file';
import WinstonCloudwatch from 'winston-cloudwatch';

// Apply the colors
winston.addColors(customLogLevels.colors);

// Define exception and rejection transports
export const exceptionHandlingTransports = [
  new DailyRotateFile({
    filename: 'logs/exceptions-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  }),
  new DailyRotateFile({
    filename: 'logs/rejections-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
  }),
];

const cloudWatchTransport = new WinstonCloudwatch({
  logGroupName: process.env.AWS_CLOUDWATCH_LOG_GROUP || 'Ecoh-Microservices',
  logStreamName: process.env.AWS_CLOUDWATCH_LOG_STREAM || 'Media-service',
  awsRegion: process.env.AWS_REGION,
  jsonMessage: true,
});

// Define main logger configuration
export const winstonConfig: winston.LoggerOptions = {
  levels: customLogLevels.levels,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // Include stack trace
    winston.format.splat(),
    winston.format.json() // Structured logging for file transports
  ),
  transports: [
    // Console Transport
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(
          ({ timestamp, level, message, context, stack }) => {
            const baseLog = `[${level}] [${
              context || 'Application'
            }] ${message} - ${timestamp}`;
            return stack ? `${baseLog}\n${stack}` : baseLog;
          }
        )
      ),
    }),

    // Daily Rotate File Transport for combined logs
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
    }),

    // Daily Rotate File Transport for error logs
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
    }),
    cloudWatchTransport,
  ],
  exitOnError: false, // Do not exit on handled exceptions
};
