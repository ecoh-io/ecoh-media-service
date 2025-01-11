import { DataSource } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { Media } from './media/media.entity';
import { Album } from './albums/albums.entity';

// Import other entities as needed

// Initialize configuration manually for CLI usage
dotenv.config();

const isSslEnabled = process.env.DB_SSL === 'true';
let sslOptions: any = false;

if (isSslEnabled) {
  const sslFilePath = process.env.DB_SSL_FILE
    ? path.resolve(process.env.DB_SSL_FILE)
    : null;

  console.log('sslFilePath', sslFilePath);

  if (sslFilePath && fs.existsSync(sslFilePath)) {
    const ca = fs.readFileSync(sslFilePath).toString();
    sslOptions = {
      ca,
      require: true,
      rejectUnauthorized: true, // Enforce SSL certificate validation
    };
  } else {
    console.warn(
      'SSL is enabled but the SSL certificate file was not found. Proceeding without SSL.'
    );
  }
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!, 10) || 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Media, Album],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  synchronize: false,
  ssl: sslOptions,
});
