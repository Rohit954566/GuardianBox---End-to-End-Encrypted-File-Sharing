import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { config } from '../config/config.js';

/**
 * Local Disk Storage Provider
 * Saves encrypted blobs to server/data/storage
 */
class LocalDiskStorage {
  constructor(storageDir) {
    this.storageDir = storageDir;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getFilePath(key) {
    return path.join(this.storageDir, key);
  }

  async saveObject(key, buffer) {
    const filePath = this.getFilePath(key);
    await fs.promises.writeFile(filePath, buffer);
    return { key, size: buffer.length };
  }

  async getObjectStream(key) {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File with key ${key} not found in local storage.`);
    }
    return fs.createReadStream(filePath);
  }

  async getObjectBuffer(key) {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File with key ${key} not found in local storage.`);
    }
    return await fs.promises.readFile(filePath);
  }

  async deleteObject(key) {
    const filePath = this.getFilePath(key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  }

  async objectExists(key) {
    return fs.existsSync(this.getFilePath(key));
  }

  getProviderName() {
    return 'Local Encrypted Disk Storage (Dev / Fallback)';
  }
}

/**
 * AWS S3 & MinIO Storage Provider
 * Implements S3 Client commands for cloud object storage
 */
class S3Storage {
  constructor(s3Config) {
    this.bucket = s3Config.bucket;
    const clientOptions = {
      region: s3Config.region
    };

    if (s3Config.endpoint) {
      clientOptions.endpoint = s3Config.endpoint;
      clientOptions.forcePathStyle = s3Config.forcePathStyle || true;
    }

    if (s3Config.accessKeyId && s3Config.secretAccessKey) {
      clientOptions.credentials = {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey
      };
    }

    this.client = new S3Client(clientOptions);
  }

  async saveObject(key, buffer) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/octet-stream' // Binary encrypted ciphertext
    });
    await this.client.send(command);
    return { key, size: buffer.length };
  }

  async getObjectStream(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    const response = await this.client.send(command);
    return response.Body;
  }

  async getObjectBuffer(key) {
    const stream = await this.getObjectStream(key);
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async deleteObject(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      await this.client.send(command);
      return true;
    } catch (err) {
      console.error(`Failed to delete S3 object ${key}:`, err.message);
      return false;
    }
  }

  async objectExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  getProviderName() {
    return `AWS S3 / MinIO (Bucket: ${this.bucket})`;
  }
}

// Instantiate storage provider dynamically based on environment configuration
let storageInstance;

if (config.storageProvider === 's3' && config.s3.accessKeyId && config.s3.secretAccessKey) {
  console.log(`[Storage] Initializing AWS S3 / MinIO storage adapter (${config.s3.bucket})`);
  storageInstance = new S3Storage(config.s3);
} else {
  console.log(`[Storage] Using Local Encrypted Disk Storage (${config.localStorageDir})`);
  storageInstance = new LocalDiskStorage(config.localStorageDir);
}

export const storage = storageInstance;
export { LocalDiskStorage, S3Storage };
