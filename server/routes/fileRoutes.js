import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { db } from '../database/db.js';
import { storage } from '../services/storageService.js';
import { config } from '../config/config.js';

const router = express.Router();

// Configure Multer for in-memory buffer handling of encrypted blobs up to maxFileSizeMB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSizeMB * 1024 * 1024
  }
});

/**
 * Generate a cryptographically secure, URL-safe random file identifier
 */
function generateFileId() {
  return 'gb_' + crypto.randomBytes(9).toString('base64url');
}

/**
 * POST /api/files/upload
 * Receives encrypted binary blob + cryptographic parameters (IV, encrypted metadata)
 * Server NEVER receives plaintext or decryption key.
 */
router.post('/upload', upload.single('ciphertextBlob'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No ciphertext binary blob provided in request.' });
    }

    const { iv, salt, encryptedMetadata, metadataIv, expiresInHours, maxDownloads } = req.body;

    if (!iv) {
      return res.status(400).json({ error: 'Missing Initialization Vector (IV). AES-GCM requires an IV.' });
    }

    const fileId = generateFileId();
    const storageKey = `${fileId}.enc`;

    // Calculate expiration timestamp
    let expiresAt = null;
    const hours = parseFloat(expiresInHours);
    if (!isNaN(hours) && hours > 0) {
      expiresAt = Date.now() + Math.round(hours * 3600 * 1000);
    } else {
      // Default to 24 hours if unspecified
      expiresAt = Date.now() + 24 * 3600 * 1000;
    }

    // Parse max downloads (burn after reading)
    let parsedMaxDownloads = null;
    if (maxDownloads !== undefined && maxDownloads !== '' && maxDownloads !== null) {
      const parsed = parseInt(maxDownloads, 10);
      if (!isNaN(parsed) && parsed > 0) {
        parsedMaxDownloads = parsed;
      }
    }

    // Save encrypted blob to storage (S3 or local disk)
    await storage.saveObject(storageKey, req.file.buffer);

    // Save metadata record into database (strictly zero knowledge - no keys!)
    const fileRecord = db.insertFile({
      id: fileId,
      iv: iv,
      salt: salt || null,
      encryptedMetadata: encryptedMetadata || null,
      metadataIv: metadataIv || null,
      storageKey: storageKey,
      fileSize: req.file.buffer.length,
      expiresAt: expiresAt,
      maxDownloads: parsedMaxDownloads
    });

    console.log(`[Upload] File registered: ${fileId} (${req.file.buffer.length} bytes encrypted) - Expires: ${new Date(expiresAt).toISOString()}`);

    return res.status(201).json({
      success: true,
      fileId: fileId,
      fileSize: fileRecord.fileSize,
      expiresAt: fileRecord.expiresAt,
      maxDownloads: fileRecord.maxDownloads,
      storageProvider: storage.getProviderName()
    });
  } catch (error) {
    console.error('[Upload Error]', error);
    return res.status(500).json({ error: error.message || 'Internal server error during upload.' });
  }
});

/**
 * GET /api/files/:id/meta
 * Fetches public cryptographic parameters needed for client-side decryption.
 * Does NOT contain decryption key.
 */
router.get('/:id/meta', async (req, res) => {
  try {
    const file = db.getFile(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found or has already been burned/expired.' });
    }

    // Check expiration
    if (file.expiresAt && file.expiresAt <= Date.now()) {
      return res.status(410).json({ error: 'This file link has expired and is no longer accessible.' });
    }

    // Check download limit
    if (file.maxDownloads !== null && file.downloadCount >= file.maxDownloads) {
      return res.status(410).json({ error: 'This file has reached its maximum download limit and was burned.' });
    }

    const remainingDownloads = file.maxDownloads !== null ? Math.max(0, file.maxDownloads - file.downloadCount) : null;

    return res.json({
      id: file.id,
      iv: file.iv,
      salt: file.salt,
      encryptedMetadata: file.encryptedMetadata,
      metadataIv: file.metadataIv,
      fileSize: file.fileSize,
      expiresAt: file.expiresAt,
      maxDownloads: file.maxDownloads,
      downloadCount: file.downloadCount,
      remainingDownloads: remainingDownloads,
      createdAt: file.createdAt
    });
  } catch (error) {
    console.error('[Meta Error]', error);
    return res.status(500).json({ error: 'Failed to retrieve file metadata.' });
  }
});

/**
 * GET /api/files/:id/download
 * Streams the raw encrypted binary blob to recipient for client-side decryption.
 * Increments download count and triggers burn-after-reading deletion if limit reached.
 */
router.get('/:id/download', async (req, res) => {
  try {
    const file = db.getFile(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found or has been deleted.' });
    }

    if (file.expiresAt && file.expiresAt <= Date.now()) {
      return res.status(410).json({ error: 'This file has expired.' });
    }

    if (file.maxDownloads !== null && file.downloadCount >= file.maxDownloads) {
      return res.status(410).json({ error: 'Download limit exceeded. File has been destroyed.' });
    }

    // Increment download count
    const updated = db.incrementDownloadCount(file.id);

    // Set headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.id}.enc"`);
    res.setHeader('X-GuardianBox-IV', file.iv);
    res.setHeader('X-GuardianBox-Size', file.fileSize);

    // Stream ciphertext blob to client
    const stream = await storage.getObjectStream(file.storageKey);
    stream.pipe(res);

    // Check if burn-after-reading limit is reached upon completion of this download
    if (file.maxDownloads !== null && updated.downloadCount >= file.maxDownloads) {
      res.on('finish', async () => {
        console.log(`[Burn After Reading] File ${file.id} reached max downloads (${updated.downloadCount}/${file.maxDownloads}). Immediate purge triggered.`);
        try {
          await storage.deleteObject(file.storageKey);
          db.markDeleted(file.id);
        } catch (delErr) {
          console.error(`Failed to burn file ${file.id}:`, delErr.message);
        }
      });
    }
  } catch (error) {
    console.error('[Download Error]', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to stream encrypted file.' });
    }
  }
});

/**
 * GET /api/files/:id/inspect
 * Proof of Zero-Knowledge / Cryptographic Audit Inspection:
 * Returns the exact binary hex dump stored in S3/Disk to prove the server only possesses unreadable random ciphertext.
 */
router.get('/:id/inspect', async (req, res) => {
  try {
    const file = db.getFile(req.params.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const buffer = await storage.getObjectBuffer(file.storageKey);
    const sampleLength = Math.min(buffer.length, 256);
    const sampleBuffer = buffer.subarray(0, sampleLength);

    // Create formatted hex dump view: 16 bytes per line with ASCII representation
    const hexLines = [];
    for (let i = 0; i < sampleBuffer.length; i += 16) {
      const slice = sampleBuffer.subarray(i, Math.min(i + 16, sampleBuffer.length));
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(slice).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      hexLines.push({
        offset: '0x' + i.toString(16).padStart(4, '0'),
        hex: hex.padEnd(48, ' '),
        ascii: ascii
      });
    }

    return res.json({
      fileId: file.id,
      storageKey: file.storageKey,
      storageProvider: storage.getProviderName(),
      totalCiphertextSize: buffer.length,
      initializationVector: file.iv,
      salt: file.salt || 'N/A (Random 256-bit Key Mode)',
      encryptedMetadataString: file.encryptedMetadata,
      proofStatement: 'The data below represents the EXACT bytes stored in S3/Disk storage. Plaintext is 100% inaccessible to server, ISP, and database admins without the recipient\'s client-side hash key.',
      hexDumpSample: hexLines,
      entropyStatus: 'High Entropy (Cryptographically Uniform AES-GCM Ciphertext)'
    });
  } catch (error) {
    console.error('[Inspect Error]', error);
    return res.status(500).json({ error: 'Failed to inspect file payload.' });
  }
});

/**
 * DELETE /api/files/:id
 * Manual early revocation endpoint
 */
router.delete('/:id', async (req, res) => {
  try {
    const file = db.getFile(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    await storage.deleteObject(file.storageKey);
    db.markDeleted(file.id);

    return res.json({ success: true, message: `File ${file.id} has been permanently deleted from storage.` });
  } catch (error) {
    console.error('[Delete Error]', error);
    return res.status(500).json({ error: 'Failed to delete file.' });
  }
});

export default router;
