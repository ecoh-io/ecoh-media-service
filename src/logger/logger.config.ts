// src/logger/winston.logger.ts

import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import WinstonCloudwatch from 'winston-cloudwatch';
import { customLogLevels } from './custom-log-levels';

winston.addColors(customLogLevels.colors);

// 🌀 Rotating Combined Logs
const combinedLog = new DailyRotateFile({
  filename: 'logs/combined-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'info',
});
combinedLog.setMaxListeners(50);

// ❗ Rotating Error Logs
const errorLog = new DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error',
});
errorLog.setMaxListeners(50);

// ☁️ Optional: AWS CloudWatch Logs
const cloudWatchTransport = new WinstonCloudwatch({
  logGroupName: process.env.AWS_CLOUDWATCH_LOG_GROUP || 'Ecoh-Microservices',
  logStreamName: process.env.AWS_CLOUDWATCH_LOG_STREAM || 'Media-service',
  awsRegion: process.env.AWS_REGION,
  jsonMessage: true,
});
cloudWatchTransport.setMaxListeners?.(50);

// Export reusable exception/rejection transports
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
exceptionHandlingTransports.forEach(t => t.setMaxListeners(50));

// Export main Winston logger
export const logger = winston.createLogger({
  levels: customLogLevels.levels,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    // 🎛️ Console log
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(
          ({ timestamp, level, message, context, stack }) => {
            const base = `[${level}] [${
              context || 'App'
            }] ${message} - ${timestamp}`;
            return stack ? `${base}\n${stack}` : base;
          }
        )
      ),
    }),
    combinedLog,
    errorLog,
    ...(process.env.NODE_ENV === 'production' ? [cloudWatchTransport] : []),
  ],
  exitOnError: false,
});
