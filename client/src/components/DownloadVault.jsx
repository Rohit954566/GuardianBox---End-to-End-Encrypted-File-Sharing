import React, { useState, useEffect } from 'react';
import {
  Download,
  Lock,
  Unlock,
  Key,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  CheckCircle,
  Loader2,
  Clock,
  Flame,
  FileQuestion
} from 'lucide-react';
import {
  importKeyFromBase64Url,
  deriveKeyFromPassword,
  decryptBuffer,
  decryptMetadata,
  base64ToArrayBuffer,
  calculateSHA256,
  formatBytes
} from '../utils/cryptoUtils.js';

export default function DownloadVault({ initialFileId, initialKey, isInitialPassphrase }) {
  const [fileId, setFileId] = useState(initialFileId || '');
  const [hashKey, setHashKey] = useState(initialKey || '');
  const [isPassphraseMode, setIsPassphraseMode] = useState(isInitialPassphrase || false);
  const [passphraseInput, setPassphraseInput] = useState('');

  // Retrieval & Decryption States
  const [fileMeta, setFileMeta] = useState(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionProgress, setDecryptionProgress] = useState('');
  const [decryptedFile, setDecryptedFile] = useState(null); // { blob, name, size, type, sha256 }
  const [errorMsg, setErrorMsg] = useState('');

  // Read URL Hash on mount or when hash changes
  useEffect(() => {
    const parseUrlHash = () => {
      const hash = window.location.hash;
      if (hash && hash.includes('/file/')) {
        const parts = hash.split('#');
        // parts[0] may be like '#/file/gb_xxxx'
        const match = hash.match(/\/file\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          setFileId(match[1]);
        }

        // Look for key in hash
        const keyMatch = hash.match(/key=([A-Za-z0-9_-]+)/);
        if (keyMatch && keyMatch[1]) {
          setHashKey(keyMatch[1]);
        }

        if (hash.includes('mode=passphrase')) {
          setIsPassphraseMode(true);
        }
      }
    };

    parseUrlHash();
    window.addEventListener('hashchange', parseUrlHash);
    return () => window.removeEventListener('hashchange', parseUrlHash);
  }, []);

  // When fileId changes or is set, fetch metadata
  useEffect(() => {
    if (fileId && fileId.trim().length > 3) {
      fetchFileMetadata(fileId.trim());
    }
  }, [fileId]);

  const fetchFileMetadata = async (id) => {
    setIsLoadingMeta(true);
    setErrorMsg('');
    setDecryptedFile(null);

    try {
      const res = await fetch(`/api/files/${id}/meta`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'File not found or expired.');
      }
      const data = await res.json();
      setFileMeta(data);
      if (data.salt) {
        setIsPassphraseMode(true);
      }
    } catch (err) {
      console.error('Fetch metadata error:', err);
      setErrorMsg(err.message);
      setFileMeta(null);
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const handleFetchAndDecrypt = async () => {
    if (!fileMeta) {
      setErrorMsg('No file metadata loaded.');
      return;
    }

    const keyString = isPassphraseMode ? passphraseInput : hashKey;
    if (!keyString) {
      setErrorMsg(isPassphraseMode ? 'Please enter the decryption passphrase.' : 'Missing decryption key in URL hash.');
      return;
    }

    setIsDecrypting(true);
    setErrorMsg('');
    setDecryptionProgress('Preparing cryptographic key in browser...');

    try {
      // Step 1: Import or derive the AES-GCM 256-bit key
      let cryptoKey;
      if (isPassphraseMode) {
        setDecryptionProgress('Deriving 256-bit AES key via PBKDF2 with salt...');
        const saltBuffer = new Uint8Array(base64ToArrayBuffer(fileMeta.salt));
        cryptoKey = await deriveKeyFromPassword(keyString, saltBuffer);
      } else {
        setDecryptionProgress('Importing raw 256-bit AES-GCM key from URL hash...');
        cryptoKey = await importKeyFromBase64Url(keyString);
      }

      // Step 2: Decrypt Metadata if available to recover original filename & mime type
      let resolvedFileName = 'decrypted_file';
      let resolvedMimeType = 'application/octet-stream';

      if (fileMeta.encryptedMetadata && fileMeta.metadataIv) {
        setDecryptionProgress('Decrypting metadata (filename and MIME type)...');
        try {
          const metaObj = await decryptMetadata(fileMeta.encryptedMetadata, fileMeta.metadataIv, cryptoKey);
          if (metaObj.name) resolvedFileName = metaObj.name;
          if (metaObj.type) resolvedMimeType = metaObj.type;
        } catch {
          console.warn('Metadata decryption failed or key mismatched');
        }
      }

      // Step 3: Fetch the raw encrypted binary blob from backend
      setDecryptionProgress('Fetching encrypted binary ciphertext blob from server...');
      const res = await fetch(`/api/files/${fileMeta.id}/download`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to download encrypted blob.');
      }

      const ciphertextBuffer = await res.arrayBuffer();

      // Step 4: Execute AES-GCM client-side decryption
      setDecryptionProgress('Running Web Crypto API AES-GCM 256-bit authenticated decryption...');
      const ivBuffer = new Uint8Array(base64ToArrayBuffer(fileMeta.iv));
      const decryptedPlaintextBuffer = await decryptBuffer(ciphertextBuffer, cryptoKey, ivBuffer);

      // Step 5: Compute integrity fingerprint of decrypted plaintext
      setDecryptionProgress('Verifying cryptographic SHA-256 integrity tag...');
      const sha256 = await calculateSHA256(decryptedPlaintextBuffer);

      // Step 6: Create Blob for browser download
      const decryptedBlob = new Blob([decryptedPlaintextBuffer], { type: resolvedMimeType });

      setDecryptedFile({
        blob: decryptedBlob,
        name: resolvedFileName,
        size: decryptedPlaintextBuffer.byteLength,
        type: resolvedMimeType,
        sha256: sha256
      });

      setDecryptionProgress('Decryption complete! Authenticated successfully.');
    } catch (err) {
      console.error('Decryption failed:', err);
      setErrorMsg(err.message || 'Decryption failed. Please verify that the key or passphrase is correct.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const triggerDownload = () => {
    if (!decryptedFile) return;

    const url = URL.createObjectURL(decryptedFile.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = decryptedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-3xl mx-auto">
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Unlock className="w-3.5 h-3.5" />
          <span>Client-Side AES-GCM Decryption</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Decrypt & Retrieve <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">File</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto">
          The encrypted blob is downloaded to your browser and decrypted in-memory using your local secret key.
        </p>
      </div>

      <div className="glass-panel glass-panel-glow p-6 sm:p-8 space-y-6 border-cyan-500/25">
        {/* File ID Input / Loader */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>File Identifier</span>
            {fileMeta && <span className="badge-emerald text-[10px]">Ciphertext Verified</span>}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. gb_a1b2c3d4e5f6"
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              className="w-full bg-midnight-900/90 border border-cyan-950/60 rounded-xl px-4 py-2.5 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-400 transition-all shadow-inner"
            />
            <button
              onClick={() => fetchFileMetadata(fileId.trim())}
              disabled={isLoadingMeta || !fileId}
              className="btn-secondary px-5 text-xs whitespace-nowrap"
            >
              {isLoadingMeta ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : 'Load File'}
            </button>
          </div>
        </div>

        {/* File Metadata Overview (if loaded) */}
        {fileMeta && (
          <div className="bg-midnight-900/90 border border-cyan-950/50 rounded-xl p-4 space-y-3 animate-fadeIn shadow-inner">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">Status: Ready for Decryption</span>
              <span className="text-cyan-400 font-mono font-semibold">Encrypted Size: {formatBytes(fileMeta.fileSize)}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-cyan-950/60">
              <div className="p-2.5 bg-midnight-800/80 border border-cyan-950/40 rounded-lg">
                <span className="text-slate-400 block text-[10px]">IV (Init Vector)</span>
                <span className="font-mono text-cyan-300 truncate block text-[11px] mt-0.5">{fileMeta.iv.substring(0, 16)}...</span>
              </div>

              <div className="p-2.5 bg-midnight-800/80 border border-cyan-950/40 rounded-lg">
                <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  Expires At
                </span>
                <span className="text-amber-300 font-mono text-[11px] mt-0.5 block">
                  {new Date(fileMeta.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="p-2.5 bg-midnight-800/80 border border-cyan-950/40 rounded-lg">
                <span className="text-slate-400 block text-[10px] flex items-center gap-1">
                  <Flame className="w-3 h-3 text-rose-400" />
                  Burn Limit
                </span>
                <span className="text-rose-300 font-mono text-[11px] mt-0.5 block">
                  {fileMeta.maxDownloads ? `${fileMeta.downloadCount}/${fileMeta.maxDownloads} downloads` : 'Unlimited'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Decryption Key Input */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              {isPassphraseMode ? 'Passphrase Key' : 'AES-256 Secret Key (From URL Hash)'}
            </span>
            {hashKey && !isPassphraseMode && (
              <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Key auto-detected from URL
              </span>
            )}
          </label>

          {isPassphraseMode ? (
            <input
              type="password"
              placeholder="Enter the sender's passphrase..."
              value={passphraseInput}
              onChange={(e) => setPassphraseInput(e.target.value)}
              className="w-full bg-midnight-900/90 border border-cyan-950/60 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400 transition-all shadow-inner"
            />
          ) : (
            <input
              type="text"
              placeholder="Paste raw base64url key..."
              value={hashKey}
              onChange={(e) => setHashKey(e.target.value)}
              className="w-full bg-midnight-900/90 border border-cyan-950/60 rounded-xl px-4 py-2.5 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-400 transition-all shadow-inner"
            />
          )}

          <p className="text-[11px] text-slate-400">
            {isPassphraseMode
              ? 'This file was protected with a passphrase. It will be derived locally using PBKDF2 with 100,000 rounds.'
              : 'This 256-bit key was loaded exclusively from the browser URL fragment and was never sent to the server.'}
          </p>
        </div>

        {/* Decryption Progress Indicator */}
        {isDecrypting && (
          <div className="p-4 bg-cyan-950/30 border border-cyan-500/40 rounded-xl space-y-2 animate-fadeIn shadow-cyber-cyan/10">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold font-mono">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>CLIENT-SIDE DECRYPTION IN PROGRESS:</span>
            </div>
            <p className="text-xs text-slate-200 font-mono bg-midnight-900/90 p-2.5 rounded-lg border border-cyan-950/60">
              {decryptionProgress}
            </p>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Decryption Error:</span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {/* Decrypted File Ready State */}
        {decryptedFile && (
          <div className="p-5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-4 animate-fadeIn shadow-emerald-500/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white max-w-md truncate">{decryptedFile.name}</h4>
                <p className="text-xs text-emerald-400/90 font-mono mt-0.5">
                  {formatBytes(decryptedFile.size)} • {decryptedFile.type}
                </p>
              </div>
            </div>

            <div className="bg-midnight-900/90 p-3 rounded-lg border border-cyan-950/40 text-[11px] font-mono text-slate-400 space-y-1 shadow-inner">
              <span className="text-slate-500 block">SHA-256 Integrity Verification:</span>
              <span className="text-emerald-400 break-all block">{decryptedFile.sha256}</span>
            </div>

            <button
              onClick={triggerDownload}
              className="btn-primary w-full py-3 text-sm bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
              Save Decrypted File to Computer
            </button>
          </div>
        )}

        {/* Decrypt Action Button (if not yet decrypted) */}
        {!decryptedFile && (
          <button
            onClick={handleFetchAndDecrypt}
            disabled={!fileMeta || isDecrypting || (!hashKey && !passphraseInput)}
            className="btn-primary w-full py-3.5 text-sm uppercase tracking-wider font-bold"
          >
            {isDecrypting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Decrypting In Browser...
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                Authenticate & Decrypt
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
