import React, { useState, useRef, useEffect } from 'react';
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
  Cpu,
  History,
  Trash2,
  ExternalLink,
  Eye,
  Copy,
  Check,
  Zap
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

export default function UploadVault({ onUploadSuccess, onSwitchToInspect, onSwitchToReceive }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [keyMode, setKeyMode] = useState('random'); // 'random' | 'passphrase'
  const [passphrase, setPassphrase] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Encryption & Upload Progress States
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePipelineStep, setActivePipelineStep] = useState(0);
  const [cryptoStepText, setCryptoStepText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Local sender vault history (kept strictly client-side)
  const [vaultHistory, setVaultHistory] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('guardianbox_recent_vaults');
      if (stored) {
        setVaultHistory(JSON.parse(stored));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveToHistory = (item) => {
    try {
      const updated = [item, ...vaultHistory.filter(i => i.fileId !== item.fileId)].slice(0, 5);
      setVaultHistory(updated);
      localStorage.setItem('guardianbox_recent_vaults', JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const clearHistory = () => {
    setVaultHistory([]);
    localStorage.removeItem('guardianbox_recent_vaults');
  };

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

  const pipelineStages = [
    { title: 'Buffer Load', desc: 'In-memory array buffer ingestion' },
    { title: 'Key Generation', desc: 'AES-256 / PBKDF2 derivation' },
    { title: 'AES-GCM Engine', desc: 'Galois/Counter Mode + 128-bit tag' },
    { title: 'Metadata Seal', desc: 'Obfuscate filename & mime type' },
    { title: 'Encrypted Dispatch', desc: 'Zero-knowledge binary upload' }
  ];

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
    setActivePipelineStep(0);

    try {
      // Stage 0: Buffer Load
      setCryptoStepText('Reading plaintext file bytes into memory buffer...');
      const fileBuffer = await selectedFile.arrayBuffer();
      const originalSha256 = await calculateSHA256(fileBuffer);
      await new Promise(r => setTimeout(r, 120));

      // Stage 1: Key Generation
      setActivePipelineStep(1);
      let key;
      let salt = null;
      let keyStringForHash = '';

      if (keyMode === 'random') {
        setCryptoStepText('Generating 256-bit AES-GCM symmetric key via Web Crypto API...');
        key = await generateKey();
        keyStringForHash = await exportKeyToBase64Url(key);
      } else {
        setCryptoStepText('Deriving 256-bit key using PBKDF2 (100,000 iterations + 16-byte random salt)...');
        salt = generateSalt();
        key = await deriveKeyFromPassword(passphrase, salt);
        keyStringForHash = passphrase;
      }
      await new Promise(r => setTimeout(r, 150));

      // Stage 2: AES-GCM Engine
      setActivePipelineStep(2);
      setCryptoStepText('Executing AES-256-GCM authenticated encryption with 96-bit random IV...');
      const iv = generateIV();
      const ciphertextBuffer = await encryptBuffer(fileBuffer, key, iv);
      await new Promise(r => setTimeout(r, 150));

      // Stage 3: Metadata Seal
      setActivePipelineStep(3);
      setCryptoStepText('Encrypting original filename and MIME type into sealed metadata payload...');
      const metadataPayload = {
        name: selectedFile.name,
        type: selectedFile.type || 'application/octet-stream',
        size: selectedFile.size,
        originalSha256: originalSha256,
        lastModified: selectedFile.lastModified
      };
      const { encryptedMetadata, metadataIv } = await encryptMetadata(metadataPayload, key);
      await new Promise(r => setTimeout(r, 120));

      // Stage 4: Encrypted Dispatch
      setActivePipelineStep(4);
      setCryptoStepText('Transmitting encrypted binary ciphertext to blind server storage...');
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

      setIsProcessing(false);

      const sharePayload = {
        fileId: result.fileId,
        keyBase64Url: keyStringForHash,
        isPassphrase: keyMode === 'passphrase',
        fileName: selectedFile.name,
        fileSize: ciphertextBuffer.byteLength,
        expiresInHours: expiresInHours,
        maxDownloads: burnAfterReading ? 1 : null,
        storageProvider: result.storageProvider,
        createdAt: Date.now()
      };

      saveToHistory(sharePayload);
      onUploadSuccess(sharePayload);

      // Reset
      setSelectedFile(null);
      setPassphrase('');
    } catch (err) {
      console.error('Encryption/Upload error:', err);
      setErrorMsg(err.message || 'An error occurred during encryption.');
      setIsProcessing(false);
    }
  };

  const copyRecentLink = (item) => {
    const link = `${window.location.origin}/#/file/${item.fileId}#key=${item.keyBase64Url}${item.isPassphrase ? '&mode=passphrase' : ''}`;
    navigator.clipboard.writeText(link);
    setCopiedId(item.fileId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 text-xs font-mono shadow-cyber-cyan/20">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Zero-Knowledge Architecture • Web Crypto API Native</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
          Client-Side Encrypted <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">File Vault</span>
        </h1>

        <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
          Files are encrypted directly in your browser using hardware-accelerated <strong className="text-slate-200">AES-256-GCM</strong>.
          The server only ever receives scrambled binary ciphertext.
        </p>

        {/* Cryptographic Metrics Strip */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <span className="badge-violet text-xs">
            <Cpu className="w-3.5 h-3.5" /> Hardware AES-NI
          </span>
          <span className="badge-emerald text-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> 128-Bit AEAD Tag
          </span>
          <span className="badge-violet text-xs">
            <Key className="w-3.5 h-3.5" /> RFC 3986 Hash Key
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-8">
        <div className="glass-panel p-6 sm:p-8 space-y-6">
          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-300 ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/8 scale-[1.01] shadow-cyber-cyan'
                : selectedFile
                ? 'border-emerald-500/40 bg-emerald-950/15 shadow-cyber-emerald'
                : 'border-slate-800 hover:border-cyan-500/40 hover:bg-cyan-950/10'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-3 animate-fadeIn">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-cyber-emerald">
                  <File className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white max-w-md truncate">{selectedFile.name}</h4>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    {formatBytes(selectedFile.size)} • {selectedFile.type || 'Binary Data'}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="badge-emerald text-xs">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Plaintext Loaded in Memory
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 ml-2 hover:underline"
                  >
                    Change File
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 group">
                <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-cyan-950/40 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:border-cyan-500/40 transition-all shadow-lg shadow-cyan-950/20">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-semibold text-white">
                    Drag and drop your file here, or <span className="text-cyan-400 underline decoration-cyan-400/40 underline-offset-4">browse files</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Any file format up to 100MB • Completely encrypted before upload
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Cryptographic Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
            {/* Key Mode Card */}
            <div className="bg-midnight-900/70 border border-cyan-950/40 rounded-2xl p-4 sm:p-5 space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                Key Generation Strategy
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setKeyMode('random')}
                  className={`p-3 rounded-xl border text-left font-medium transition-all ${
                    keyMode === 'random'
                      ? 'border-cyan-500 bg-cyan-600/10 text-cyan-300 shadow-cyber-cyan/15'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold block text-white text-xs mb-0.5">Auto 256-Bit</span>
                  <span className="text-[11px] leading-tight block text-slate-400">Random URL Hash Key</span>
                </button>

                <button
                  type="button"
                  onClick={() => setKeyMode('passphrase')}
                  className={`p-3 rounded-xl border text-left font-medium transition-all ${
                    keyMode === 'passphrase'
                      ? 'border-cyan-500 bg-cyan-600/10 text-cyan-300 shadow-cyber-cyan/15'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold block text-white text-xs mb-0.5">Passphrase</span>
                  <span className="text-[11px] leading-tight block text-slate-400">PBKDF2 Derived</span>
                </button>
              </div>

              {keyMode === 'passphrase' && (
                <div className="space-y-1.5 pt-1 animate-fadeIn">
                  <input
                    type="password"
                    placeholder="Enter custom passphrase (min 6 chars)..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-slate-900 border border-cyan-500/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                  <p className="text-[11px] text-slate-400">
                    Recipient must enter this exact passphrase to decrypt the payload.
                  </p>
                </div>
              )}
            </div>

            {/* Expiration Card */}
            <div className="bg-midnight-900/70 border border-cyan-950/40 rounded-2xl p-4 sm:p-5 space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Ephemeral Lifecycle (Expiration)
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Self-Destruct Lifetime:</span>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="1">1 Hour</option>
                    <option value="6">6 Hours</option>
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="72">3 Days</option>
                    <option value="168">7 Days</option>
                  </select>
                </div>

                {/* Burn After Reading Toggle */}
                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl hover:bg-slate-900/80 border border-slate-800 transition-colors">
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
                      Ciphertext blob and metadata are instantly destroyed upon first successful download.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Interactive Cryptographic Pipeline Visualizer */}
          {isProcessing && (
            <div className="p-5 bg-midnight-900/80 border border-cyan-500/30 rounded-2xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>CRYPTOGRAPHIC ENGINE ACTIVE</span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">Stage {activePipelineStep + 1}/5</span>
              </div>

              {/* Progress Steps Indicators */}
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {pipelineStages.map((stage, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      idx === activePipelineStep
                        ? 'bg-cyan-600/15 border-cyan-400 text-cyan-300 shadow-cyber-cyan/20 scale-[1.02]'
                        : idx < activePipelineStep
                        ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-400'
                        : 'bg-slate-900/50 border-slate-800 text-slate-600'
                    }`}
                  >
                    <span className="text-[10px] font-bold block truncate">{stage.title}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-cyan-300 font-mono bg-slate-900/80 p-3 rounded-xl border border-cyan-950/60">
                {cryptoStepText}
              </p>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Submit Action */}
          <button
            onClick={handleEncryptAndUpload}
            disabled={!selectedFile || isProcessing}
            className="btn-primary w-full py-4 text-sm uppercase tracking-wider font-bold"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Encrypting in Browser...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Encrypt in Browser & Secure Upload
              </>
            )}
          </button>
        </div>

        {/* Sender's Recent Encrypted Vaults (Stored strictly client-side) */}
        {vaultHistory.length > 0 && (
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                Your Recent Uploads (Local Browser Session)
              </h3>
              <button
                onClick={clearHistory}
                className="text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>

            <div className="divide-y divide-slate-800/60">
              {vaultHistory.map((item) => (
                <div key={item.fileId} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-slate-200 block truncate max-w-xs">{item.fileName}</span>
                    <span className="font-mono text-[11px] text-cyan-400/70">{item.fileId}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyRecentLink(item)}
                      className="btn-secondary py-1.5 px-3 text-xs"
                    >
                      {copiedId === item.fileId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          Copy Link
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onSwitchToInspect(item.fileId)}
                      className="btn-secondary py-1.5 px-3 text-xs text-cyan-300"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect
                    </button>

                    <button
                      onClick={() => onSwitchToReceive(item.fileId, item.keyBase64Url, item.isPassphrase)}
                      className="btn-secondary py-1.5 px-3 text-xs text-emerald-300"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Decrypt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
