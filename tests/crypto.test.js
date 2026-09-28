import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKey,
  generateIV,
  generateSalt,
  deriveKeyFromPassword,
  encryptBuffer,
  decryptBuffer,
  encryptMetadata,
  decryptMetadata,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  calculateSHA256
} from '../client/src/utils/cryptoUtils.js';

test('1. Key Generation creates valid 256-bit AES-GCM CryptoKey', async () => {
  const key = await generateKey();
  assert.ok(key, 'Key should be defined');
  assert.equal(key.algorithm.name, 'AES-GCM');
  assert.equal(key.algorithm.length, 256);
  assert.equal(key.extractable, true);
});

test('2. Roundtrip: encrypt(data, key) followed by decrypt(ciphertext, key) returns original text', async () => {
  const key = await generateKey();
  const iv = generateIV();
  const originalMessage = 'Confidential Persevex Internship Document #2026';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const plaintextBuffer = encoder.encode(originalMessage);
  const ciphertextBuffer = await encryptBuffer(plaintextBuffer, key, iv);

  assert.notDeepEqual(
    new Uint8Array(ciphertextBuffer),
    new Uint8Array(plaintextBuffer),
    'Ciphertext must not match plaintext'
  );

  const decryptedBuffer = await decryptBuffer(ciphertextBuffer, key, iv);
  const decryptedText = decoder.decode(decryptedBuffer);

  assert.equal(decryptedText, originalMessage, 'Decrypted text must match original message exactly');
});

test('3. Roundtrip: binary data (simulating file bytes) encrypts and decrypts losslessly', async () => {
  const key = await generateKey();
  const iv = generateIV();

  // Create a 64KB pseudo-random binary payload simulating a PDF or binary file
  const originalBytes = new Uint8Array(65536);
  for (let i = 0; i < originalBytes.length; i++) {
    originalBytes[i] = (i * 37 + 13) % 256;
  }

  const originalHash = await calculateSHA256(originalBytes);
  const ciphertext = await encryptBuffer(originalBytes.buffer, key, iv);
  const decrypted = await decryptBuffer(ciphertext, key, iv);
  const decryptedHash = await calculateSHA256(decrypted);

  assert.equal(decryptedHash, originalHash, 'SHA-256 fingerprint of decrypted file must match original');
  assert.equal(decrypted.byteLength, originalBytes.byteLength, 'Byte lengths must match');
});

test('4. Security: Decrypting with an incorrect key MUST throw an authentication failure', async () => {
  const validKey = await generateKey();
  const attackerKey = await generateKey();
  const iv = generateIV();

  const plaintext = new TextEncoder().encode('Top secret payload');
  const ciphertext = await encryptBuffer(plaintext, validKey, iv);

  await assert.rejects(
    async () => {
      await decryptBuffer(ciphertext, attackerKey, iv);
    },
    /Decryption failed/,
    'Decryption with incorrect key must fail without revealing plaintext'
  );
});

test('5. Security: Tampering with ciphertext triggers AEAD authentication tag failure', async () => {
  const key = await generateKey();
  const iv = generateIV();
  const plaintext = new TextEncoder().encode('Integrity verified payload');
  const ciphertext = await encryptBuffer(plaintext, key, iv);

  // Flip a single bit in the ciphertext payload
  const tamperedCiphertext = new Uint8Array(ciphertext);
  tamperedCiphertext[10] ^= 0x01; // flip 1 bit

  await assert.rejects(
    async () => {
      await decryptBuffer(tamperedCiphertext.buffer, key, iv);
    },
    /Decryption failed/,
    'Tampered ciphertext must fail authentication'
  );
});

test('6. Cryptographic Rigor: Repeated encryptions use distinct IVs and produce different ciphertexts', async () => {
  const key = await generateKey();
  const plaintext = new TextEncoder().encode('Same repeated message');

  const iv1 = generateIV();
  const iv2 = generateIV();
  assert.notDeepEqual(iv1, iv2, 'IVs must be unique per operation');

  const ciphertext1 = await encryptBuffer(plaintext, key, iv1);
  const ciphertext2 = await encryptBuffer(plaintext, key, iv2);

  assert.notDeepEqual(
    new Uint8Array(ciphertext1),
    new Uint8Array(ciphertext2),
    'Ciphertexts must be completely distinct due to IV freshness'
  );
});

test('7. Passphrase Key Derivation (PBKDF2) derives deterministic key from password + salt', async () => {
  const password = 'SuperSecureInternPassphrase!2026';
  const salt = generateSalt();

  const key1 = await deriveKeyFromPassword(password, salt);
  const key2 = await deriveKeyFromPassword(password, salt);

  const rawKey1 = await exportKeyToBase64Url(key1);
  const rawKey2 = await exportKeyToBase64Url(key2);

  assert.equal(rawKey1, rawKey2, 'Same password and salt must yield identical 256-bit AES key');

  // Encryption with derived key
  const iv = generateIV();
  const secretText = 'Protected by user passphrase';
  const ciphertext = await encryptBuffer(new TextEncoder().encode(secretText), key1, iv);

  const decrypted = await decryptBuffer(ciphertext, key2, iv);
  assert.equal(new TextDecoder().decode(decrypted), secretText);
});

test('8. URL Hash Serialization: Key exports to URL-safe Base64 and reconstructs perfectly', async () => {
  const originalKey = await generateKey();
  const base64UrlHash = await exportKeyToBase64Url(originalKey);

  // Ensure it's URL-safe (no +, /, or = padding)
  assert.equal(/^[A-Za-z0-9_-]+$/.test(base64UrlHash), true, 'Hash key must be strictly URL-safe');

  const importedKey = await importKeyFromBase64Url(base64UrlHash);

  // Encrypt with original, decrypt with imported
  const iv = generateIV();
  const message = 'Testing URL Hash roundtrip';
  const ciphertext = await encryptBuffer(new TextEncoder().encode(message), originalKey, iv);
  const decrypted = await decryptBuffer(ciphertext, importedKey, iv);

  assert.equal(new TextDecoder().decode(decrypted), message);
});

test('9. Metadata Encryption: Filename and MIME type are completely hidden from server', async () => {
  const key = await generateKey();
  const originalMeta = {
    name: 'quarterly_financial_report.pdf',
    type: 'application/pdf',
    size: 1048576,
    lastModified: 1711620000000
  };

  const { encryptedMetadata, metadataIv } = await encryptMetadata(originalMeta, key);

  assert.ok(encryptedMetadata && metadataIv);
  assert.equal(encryptedMetadata.includes('quarterly'), false, 'Encrypted metadata must not reveal filename');

  const recoveredMeta = await decryptMetadata(encryptedMetadata, metadataIv, key);
  assert.deepEqual(recoveredMeta, originalMeta, 'Recovered metadata must match original');
});
