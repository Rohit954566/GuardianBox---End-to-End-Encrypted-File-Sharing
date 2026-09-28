import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  File,
  Lock,
  Key,
  ShieldCheck,
  Clock,
  Flame,
  CheckCircle,
  AlertCircle,
  Loader2,
  Cpu
} from 'lucide-react';
import {
  generateKey,
  generateIV,
  generateSalt,
  deriveKeyFromPassword,
  encryptBuffer,
  encryptMetadata,
  exportKeyToBase64Url,
  calculateSHA256,
  arrayBufferToBase64,
  formatBytes
} from '../utils/cryptoUtils.js';

export default function UploadVault({ onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [keyMode, setKeyMode] = useState('random'); // 'random' | 'passphrase'
  const [passphrase, setPassphrase] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Encryption & Upload Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [cryptoStep, setCryptoStep] = useState(''); // Current step description
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setErrorMsg('');
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const handleEncryptAndUpload = async () => {
    if (!selectedFile) {
      setErrorMsg('Please select a file to encrypt.');
      return;
    }

    if (keyMode === 'passphrase' && (!passphrase || passphrase.trim().length < 6)) {
      setErrorMsg('Custom passphrase must be at least 6 characters long.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    try {
      // Step 1: Read file into memory buffer
      setCryptoStep('Reading plaintext file into local memory buffer...');
      const fileBuffer = await selectedFile.arrayBuffer();

      // Step 2: Compute pre-encryption SHA-256 fingerprint for verification
      setCryptoStep('Calculating SHA-256 integrity fingerprint...');
      const originalSha256 = await calculateSHA256(fileBuffer);

      // Step 3: Key Generation or Derivation
      let key;
      let salt = null;
      let keyStringForHash = '';

      if (keyMode === 'random') {
        setCryptoStep('Generating cryptographically secure 256-bit AES-GCM key (Web Crypto API)...');
        key = await generateKey();
        keyStringForHash = await exportKeyToBase64Url(key);
      } else {
        setCryptoStep('Deriving 256-bit key using PBKDF2 (100,000 iterations + 16-byte random salt)...');
        salt = generateSalt();
        key = await deriveKeyFromPassword(passphrase, salt);
        keyStringForHash = passphrase; // in passphrase mode, user or recipient enters passphrase
      }

      // Step 4: Generate unique 96-bit Initialization Vector (IV)
      setCryptoStep('Generating 96-bit (12-byte) cryptographically random IV...');
      const iv = generateIV();

      // Step 5: Encrypt file buffer via native AES-GCM
      setCryptoStep('Executing AES-GCM 256-bit encryption on file bytes...');
      const ciphertextBuffer = await encryptBuffer(fileBuffer, key, iv);

      // Step 6: Encrypt metadata (original filename, mime type, size)
      // This guarantees the server does not even know the file type or original name!
      setCryptoStep('Encrypting file metadata (filename, MIME type, timestamps)...');
      const metadataPayload = {
        name: selectedFile.name,
        type: selectedFile.type || 'application/octet-stream',
        size: selectedFile.size,
        originalSha256: originalSha256,
        lastModified: selectedFile.lastModified
      };
      const { encryptedMetadata, metadataIv } = await encryptMetadata(metadataPayload, key);

      // Step 7: Send encrypted binary blob + IV + metadata to backend
      setCryptoStep('Uploading encrypted ciphertext blob to zero-knowledge backend...');
      const formData = new FormData();
      const ciphertextBlob = new Blob([ciphertextBuffer], { type: 'application/octet-stream' });
      formData.append('ciphertextBlob', ciphertextBlob, `${Date.now()}.enc`);
      formData.append('iv', arrayBufferToBase64(iv));
      if (salt) {
        formData.append('salt', arrayBufferToBase64(salt));
      }
      formData.append('encryptedMetadata', encryptedMetadata);
      formData.append('metadataIv', metadataIv);
      formData.append('expiresInHours', expiresInHours);
      if (burnAfterReading) {
        formData.append('maxDownloads', '1');
      }

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server rejected the encrypted payload.');
      }

      const result = await response.json();

      setCryptoStep('Complete!');
      setIsProcessing(false);

      // Trigger Share Modal with generated file ID and client-side hash key
      onUploadSuccess({
        fileId: result.fileId,
        keyBase64Url: keyStringForHash,
        isPassphrase: keyMode === 'passphrase',
        fileName: selectedFile.name,
        fileSize: ciphertextBuffer.byteLength,
        expiresInHours: expiresInHours,
        maxDownloads: burnAfterReading ? 1 : null,
        storageProvider: result.storageProvider
      });

      // Reset form
      setSelectedFile(null);
      setPassphrase('');
    } catch (err) {
      console.error('Encryption/Upload error:', err);
      setErrorMsg(err.message || 'An error occurred during encryption.');
      setIsProcessing(false);
      setCryptoStep('');
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Title & Description */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Client-Side AES-GCM 256-Bit Cryptography</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          End-to-End Encrypted <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">File Vault</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
          Files are encrypted directly in your browser using the <strong className="text-slate-200">Web Crypto API</strong> before leaving your machine.
          The server only ever sees scrambled binary ciphertext.
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="glass-panel p-6 sm:p-8 space-y-6">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
                : selectedFile
                ? 'border-emerald-500/40 bg-emerald-950/20'
                : 'border-slate-700/80 hover:border-cyan-500/50 hover:bg-slate-900/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
                  <File className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white max-w-md truncate">{selectedFile.name}</h4>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    {formatBytes(selectedFile.size)} • {selectedFile.type || 'Binary Data'}
                  </p>
                </div>
                <span className="badge-emerald text-xs mt-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Ready to encrypt in memory
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 mt-2 underline"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-white">Drag & drop your file here, or click to browse</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Any file type supported • Client-side encrypted up to 100MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Encryption & Key Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            {/* Key Mode Selection */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                Key Generation Strategy
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setKeyMode('random')}
                  className={`p-2.5 rounded-lg border text-left font-medium transition-all ${
                    keyMode === 'random'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <span className="font-bold block text-white text-xs mb-0.5">Auto 256-Bit</span>
                  <span>Random Key (URL Hash)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setKeyMode('passphrase')}
                  className={`p-2.5 rounded-lg border text-left font-medium transition-all ${
                    keyMode === 'passphrase'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <span className="font-bold block text-white text-xs mb-0.5">Passphrase</span>
                  <span>PBKDF2 Derived</span>
                </button>
              </div>

              {keyMode === 'passphrase' && (
                <div className="space-y-1 pt-1 animate-fadeIn">
                  <input
                    type="password"
                    placeholder="Enter custom passphrase (min 6 chars)..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-slate-900 border border-cyan-500/40 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                  <p className="text-[10px] text-slate-400">
                    Recipient will be prompted to enter this passphrase to decrypt.
                  </p>
                </div>
              )}
            </div>

            {/* Ephemeral Lifecycle Controls */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Ephemeral Lifecycle (Expiration)
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Auto-Expire After:</span>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="1">1 Hour</option>
                    <option value="6">6 Hours</option>
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="72">3 Days</option>
                    <option value="168">7 Days</option>
                  </select>
                </div>

                {/* Burn After Reading Toggle */}
                <label className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-slate-900/60 border border-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={burnAfterReading}
                    onChange={(e) => setBurnAfterReading(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500/30"
                  />
                  <div>
                    <span className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" />
                      Burn After Reading (1 Download)
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      File and ciphertext blob are instantly purged from the server after the first download.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Cryptographic Execution Status */}
          {isProcessing && (
            <div className="p-4 bg-cyan-950/30 border border-cyan-500/40 rounded-xl space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>CRYPTOGRAPHIC ENGINE EXECUTING:</span>
              </div>
              <p className="text-xs text-slate-200 font-mono bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                {cryptoStep}
              </p>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleEncryptAndUpload}
            disabled={!selectedFile || isProcessing}
            className="btn-primary w-full py-3.5 text-sm uppercase tracking-wider font-bold"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Encrypting & Storing...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Encrypt in Browser & Secure Upload
              </>
            )}
          </button>
        </div>

        {/* Technical Architecture Quick Note */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-500" />
            Hardware-Accelerated WebCrypto
          </span>
          <span>•</span>
          <span>Zero Server Decryption Capability</span>
          <span>•</span>
          <span>AES-GCM Authenticated Cipher</span>
        </div>
      </div>
    </div>
  );
}
