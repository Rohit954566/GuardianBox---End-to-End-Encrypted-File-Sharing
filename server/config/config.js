import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  storageProvider: process.env.STORAGE_PROVIDER || (process.env.AWS_ACCESS_KEY_ID ? 's3' : 'local'),
  
  // Local storage config
  localStorageDir: path.resolve(__dirname, '../data/storage'),
  databaseFile: path.resolve(__dirname, '../data/metadata.json'),

  // AWS S3 / MinIO config
  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET_NAME || 'guardianbox-encrypted-files',
    endpoint: process.env.S3_ENDPOINT || undefined, // For MinIO e.g. http://localhost:9000
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'
  },

  // Upload limits
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10), // 100MB default
  
  // Cleanup cron schedule (default: runs every 5 minutes in dev, can be hourly in prod '0 * * * *')
  cleanupCronSchedule: process.env.CLEANUP_CRON || '*/5 * * * *'
};
