/**
 * GuardianBox - Cryptography Engine (Client-Side)
 * 
 * Implements Zero-Knowledge End-to-End Encryption (E2EE) using the native Web Crypto API.
 * Standards:
 * - Cipher: AES-GCM (Galois/Counter Mode) with 256-bit symmetric keys
 * - Initialization Vector (IV): 96-bit (12 bytes) cryptographically secure pseudorandom number
 * - Key Derivation (optional passphrase mode): PBKDF2 with HMAC-SHA-256 (100,000 iterations) + 16-byte salt
 * - Key Distribution: Embedded strictly inside the URL hash fragment (#key=...), never transmitted via HTTP
 * 
 * Works identically in modern browsers (window.crypto) and Node.js v19+ (globalThis.crypto).
 */

const cryptoSubtle = (typeof window !== 'undefined' ? window.crypto : globalThis.crypto)?.subtle;
const cryptoRandom = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;

if (!cryptoSubtle || !cryptoRandom) {
  throw new Error('Web Crypto API is not supported in this runtime environment.');
}

/**
 * Generates a random 256-bit AES-GCM key.
 * @returns {Promise<CryptoKey>}
 */
export async function generateKey() {
  return await cryptoSubtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable so we can place it into URL hash
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a 96-bit (12 bytes) Initialization Vector for AES-GCM.
 * Each encryption MUST use a distinct, randomly generated IV.
 * @returns {Uint8Array}
 */
export function generateIV() {
  const iv = new Uint8Array(12);
  cryptoRandom.getRandomValues(iv);
  return iv;
}

/**
 * Generates a 128-bit (16 bytes) random salt for PBKDF2 key derivation.
 * @returns {Uint8Array}
 */
export function generateSalt() {
  const salt = new Uint8Array(16);
  cryptoRandom.getRandomValues(salt);
  return salt;
}

/**
 * Derives an AES-GCM 256-bit key from a user-supplied password string using PBKDF2.
 * @param {string} password 
 * @param {Uint8Array} salt 
 * @param {number} iterations (default 100,000)
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKeyFromPassword(password, salt, iterations = 100000) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await cryptoSubtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await cryptoSubtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an ArrayBuffer of plaintext using AES-GCM 256-bit.
 * The resulting ciphertext contains the 128-bit authentication tag appended automatically.
 * @param {ArrayBuffer|Uint8Array} dataBuffer 
 * @param {CryptoKey} key 
 * @param {Uint8Array} iv 
 * @returns {Promise<ArrayBuffer>}
 */
export async function encryptBuffer(dataBuffer, key, iv) {
  return await cryptoSubtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    dataBuffer
  );
}

/**
 * Decrypts an ArrayBuffer of ciphertext using AES-GCM 256-bit.
 * Automatically verifies integrity and throws an error if authentication fails (wrong key or tampering).
 * @param {ArrayBuffer|Uint8Array} ciphertextBuffer 
 * @param {CryptoKey} key 
 * @param {Uint8Array} iv 
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptBuffer(ciphertextBuffer, key, iv) {
  try {
    return await cryptoSubtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertextBuffer
    );
  } catch (error) {
    throw new Error('Decryption failed: Incorrect decryption key or corrupted ciphertext.');
  }
}

/**
 * Encrypts file metadata (name, mime type, size) so the server never knows file details.
 * @param {Object} metadataObj 
 * @param {CryptoKey} key 
 * @returns {Promise<{ encryptedMetadata: string, metadataIv: string }>}
 */
export async function encryptMetadata(metadataObj, key) {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(metadataObj);
  const metadataBuffer = encoder.encode(jsonString);

  const iv = generateIV();
  const encryptedBuffer = await encryptBuffer(metadataBuffer, key, iv);

  return {
    encryptedMetadata: arrayBufferToBase64(encryptedBuffer),
    metadataIv: arrayBufferToBase64(iv)
  };
}

/**
 * Decrypts encrypted file metadata.
 * @param {string} encryptedMetadataBase64 
 * @param {string} metadataIvBase64 
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function decryptMetadata(encryptedMetadataBase64, metadataIvBase64, key) {
  const ciphertextBuffer = base64ToArrayBuffer(encryptedMetadataBase64);
  const ivBuffer = new Uint8Array(base64ToArrayBuffer(metadataIvBase64));

  const decryptedBuffer = await decryptBuffer(ciphertextBuffer, key, ivBuffer);
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decryptedBuffer);
  return JSON.parse(jsonString);
}

/**
 * Exports a CryptoKey to a URL-safe Base64 string for URL hash fragments.
 * @param {CryptoKey} key 
 * @returns {Promise<string>}
 */
export async function exportKeyToBase64Url(key) {
  const raw = await cryptoSubtle.exportKey('raw', key);
  return arrayBufferToBase64Url(raw);
}

/**
 * Imports a raw key from a URL-safe Base64 string into a CryptoKey.
 * @param {string} base64UrlString 
 * @returns {Promise<CryptoKey>}
 */
export async function importKeyFromBase64Url(base64UrlString) {
  const rawBytes = base64UrlToArrayBuffer(base64UrlString);
  return await cryptoSubtle.importKey(
    'raw',
    rawBytes,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Computes a SHA-256 hexadecimal hash string of a buffer for cryptographic fingerprinting.
 * @param {ArrayBuffer|Uint8Array} buffer 
 * @returns {Promise<string>}
 */
export async function calculateSHA256(buffer) {
  const hashBuffer = await cryptoSubtle.digest('SHA-256', buffer);
  return arrayBufferToHex(hashBuffer);
}

/* =========================================================================
   Encoding / Decoding Helper Functions
   ========================================================================= */

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64Url(buffer) {
  const base64 = arrayBufferToBase64(buffer);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToArrayBuffer(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return base64ToArrayBuffer(base64);
}

export function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToArrayBuffer(hexString) {
  const cleanHex = hexString.replace(/\s+/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
