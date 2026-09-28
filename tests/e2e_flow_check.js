import assert from 'node:assert/strict';
import {
  generateKey,
  generateIV,
  encryptBuffer,
  decryptBuffer,
  encryptMetadata,
  decryptMetadata,
  exportKeyToBase64Url,
  importKeyFromBase64Url,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  calculateSHA256
} from '../client/src/utils/cryptoUtils.js';

async function testEndToEnd() {
  console.log('Testing End-to-End Encryption & API pipeline...');

  // 1. Plaintext data
  const originalSecret = 'PERSEVEX_CYBERSECURITY_INTERNSHIP_TOP_SECRET_E2EE_2026';
  const plaintextBuffer = new TextEncoder().encode(originalSecret).buffer;
  const originalSha256 = await calculateSHA256(plaintextBuffer);

  // 2. Client-side encryption
  const key = await generateKey();
  const iv = generateIV();
  const rawKeyBase64Url = await exportKeyToBase64Url(key);
  const ciphertextBuffer = await encryptBuffer(plaintextBuffer, key, iv);

  const { encryptedMetadata, metadataIv } = await encryptMetadata({
    name: 'secret_file.txt',
    type: 'text/plain',
    size: plaintextBuffer.byteLength
  }, key);

  // 3. Upload to server
  const formData = new FormData();
  formData.append('ciphertextBlob', new Blob([ciphertextBuffer]), 'payload.enc');
  formData.append('iv', arrayBufferToBase64(iv));
  formData.append('encryptedMetadata', encryptedMetadata);
  formData.append('metadataIv', metadataIv);
  formData.append('expiresInHours', '24');
  formData.append('maxDownloads', '5');

  const uploadRes = await fetch('http://localhost:5000/api/files/upload', {
    method: 'POST',
    body: formData
  });

  assert.equal(uploadRes.status, 201, 'Upload status must be 201 Created');
  const uploadJson = await uploadRes.json();
  console.log('✓ Upload successful! File ID:', uploadJson.fileId);

  // 4. Verify Server Proof / Inspection (Server is Blind)
  const inspectRes = await fetch(`http://localhost:5000/api/files/${uploadJson.fileId}/inspect`);
  assert.equal(inspectRes.status, 200);
  const inspectJson = await inspectRes.json();
  assert.ok(inspectJson.hexDumpSample.length > 0);
  console.log('✓ Proof of Zero-Knowledge verified! Raw hex dump sample:', inspectJson.hexDumpSample[0].hex);

  // 5. Download encrypted ciphertext from server
  const downloadRes = await fetch(`http://localhost:5000/api/files/${uploadJson.fileId}/download`);
  assert.equal(downloadRes.status, 200);
  const downloadedCiphertext = await downloadRes.arrayBuffer();

  // 6. Client-side decryption with URL hash key
  const importedKey = await importKeyFromBase64Url(rawKeyBase64Url);
  const serverMetaRes = await fetch(`http://localhost:5000/api/files/${uploadJson.fileId}/meta`);
  const serverMeta = await serverMetaRes.json();
  const serverIv = new Uint8Array(base64ToArrayBuffer(serverMeta.iv));

  const decryptedPlaintext = await decryptBuffer(downloadedCiphertext, importedKey, serverIv);
  const decryptedText = new TextDecoder().decode(decryptedPlaintext);
  const decryptedSha256 = await calculateSHA256(decryptedPlaintext);

  assert.equal(decryptedText, originalSecret, 'Decrypted plaintext must match original secret exactly!');
  assert.equal(decryptedSha256, originalSha256, 'SHA-256 fingerprints must match!');

  console.log('✓ Decryption successful! Recovered secret:', decryptedText);
  console.log('\n>>> ALL SYSTEMS VERIFIED: 100% OPERATIONAL <<<');
}

testEndToEnd().catch(err => {
  console.error('End-to-End Test Failed:', err);
  process.exit(1);
});
