import fs from 'fs';
import path from 'path';
import { config } from '../config/config.js';

class FileDatabase {
  constructor() {
    this.filePath = config.databaseFile;
    this.data = { files: {} };
    this.init();
  }

  init() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.error('Error reading metadata database, initializing fresh:', err.message);
        this.data = { files: {} };
        this.save();
      }
    } else {
      this.save();
    }
  }

  save() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('Error writing metadata database:', err.message);
    }
  }

  /**
   * Save new encrypted file metadata.
   * STRICT ZERO-KNOWLEDGE POLICY: Any attempt to pass 'key' or 'password' will be rejected.
   */
  insertFile(record) {
    if (record.key || record.password || record.secret) {
      throw new Error('ZERO KNOWLEDGE VIOLATION: Plaintext key or password must never be sent or stored on server!');
    }

    const fileRecord = {
      id: record.id,
      iv: record.iv,
      salt: record.salt || null,
      encryptedMetadata: record.encryptedMetadata || null,
      metadataIv: record.metadataIv || null,
      storageKey: record.storageKey,
      fileSize: record.fileSize,
      expiresAt: record.expiresAt, // epoch timestamp
      maxDownloads: record.maxDownloads !== undefined ? record.maxDownloads : null,
      downloadCount: 0,
      createdAt: Date.now(),
      isDeleted: false
    };

    this.data.files[record.id] = fileRecord;
    this.save();
    return fileRecord;
  }

  getFile(id) {
    const file = this.data.files[id];
    if (!file || file.isDeleted) return null;
    return file;
  }

  incrementDownloadCount(id) {
    const file = this.data.files[id];
    if (!file || file.isDeleted) return null;

    file.downloadCount += 1;
    this.save();
    return file;
  }

  markDeleted(id) {
    const file = this.data.files[id];
    if (file) {
      file.isDeleted = true;
      delete this.data.files[id];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Find files that need to be purged:
   * 1. Expired by time (expiresAt < now)
   * 2. Burn-after-reading expired (downloadCount >= maxDownloads where maxDownloads > 0)
   */
  findFilesToPurge(now = Date.now()) {
    const toPurge = [];
    for (const [id, file] of Object.entries(this.data.files)) {
      if (file.isDeleted) continue;

      const isTimeExpired = file.expiresAt && file.expiresAt <= now;
      const isDownloadExhausted = file.maxDownloads !== null && file.downloadCount >= file.maxDownloads;

      if (isTimeExpired || isDownloadExhausted) {
        toPurge.push({
          ...file,
          reason: isTimeExpired ? 'time_expired' : 'burn_after_reading_limit'
        });
      }
    }
    return toPurge;
  }

  getAllActiveFilesCount() {
    return Object.values(this.data.files).filter(f => !f.isDeleted).length;
  }

  getTotalStorageBytes() {
    return Object.values(this.data.files)
      .filter(f => !f.isDeleted)
      .reduce((sum, f) => sum + (f.fileSize || 0), 0);
  }
}

export const db = new FileDatabase();
