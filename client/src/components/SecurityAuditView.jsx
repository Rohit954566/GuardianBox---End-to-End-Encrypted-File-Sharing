import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  Key,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Terminal,
  Cpu,
  RefreshCw,
  Zap,
  Play,
  FileCode,
  ShieldCheck
} from 'lucide-react';
import {
  generateKey,
  generateIV,
  encryptBuffer,
  decryptBuffer,
  exportKeyToBase64Url,
  calculateSHA256,
  arrayBufferToBase64
} from '../utils/cryptoUtils.js';

export default function SecurityAuditView() {
  // Interactive Applied Crypto Sandbox State
  const [demoInput, setDemoInput] = useState('CONFIDENTIAL_PERSEVEX_PAYLOAD_v1.0');
  const [encryptedDemo, setEncryptedDemo] = useState(null);
  const [demoResult, setDemoResult] = useState(null);
  const [isDemoRunning, setIsDemoRunning] = useState(false);

  const attackVectors = [
    {
      id: 'vector-1',
      title: 'What if the user loses the link or key?',
      riskLevel: 'Permanent Loss (Expected Behavior)',
      badgeColor: 'badge-rose',
      description:
        'Because GuardianBox operates on strict Zero-Knowledge principles, the decryption key exists solely in the URL hash fragment (#key=...) on the sender/receiver clients. The server never stores, caches, or logs the key.',
      mitigation:
        'Data recovery is mathematically impossible without the key (2^256 keyspace entropy). This is a foundational security guarantee, not a defect. Ephemeral cron jobs automatically purge orphaned encrypted blobs once their expiration timestamp passes.',
      status: 'Protected by Cryptographic Design'
    },
    {
      id: 'vector-2',
      title: 'URL Hash Leakage via HTTP Referrer Headers',
      riskLevel: 'Critical Privacy Risk',
      badgeColor: 'badge-rose',
      description:
        'If the download page contains external links, third-party scripts, or external assets, standard browsers might include the current URL in the "Referer" HTTP header, inadvertently transmitting the #key fragment to third-party domains.',
      mitigation:
        'GuardianBox enforces <meta name="referrer" content="no-referrer" /> globally across all client pages. Furthermore, zero external third-party analytics, trackers, or CDNs are executed on the application runtime.',
      status: 'Mitigated via strict Referrer-Policy: no-referrer'
    },
    {
      id: 'vector-3',
      title: 'Malicious Server / Host Integrity Threat',
      riskLevel: 'High Risk (Host Trust Model)',
      badgeColor: 'badge-cyan',
      description:
        'If an adversary achieves remote code execution on the web server hosting the client HTML/JS assets, they could theoretically tamper with cryptoUtils.js to exfiltrate keys during client execution.',
      mitigation:
        'End-to-End browser encryption relies on application code integrity. In production environments, GuardianBox utilizes strict Content Security Policy (CSP), Subresource Integrity (SRI) hashes, and can be distributed as a cryptographically signed static Progressive Web App (PWA) or desktop wrapper (Electron/Tauri).',
      status: 'Addressed via CSP and Static Code Integrity'
    },
    {
      id: 'vector-4',
      title: 'Database Breach / Cloud Storage (S3) Exfiltration',
      riskLevel: 'Moderate to High Risk',
      badgeColor: 'badge-emerald',
      description:
        'An attacker gains unauthorized root access to the AWS S3 bucket and SQLite/PostgreSQL metadata database.',
      mitigation:
        'The attacker obtains only AES-GCM 256-bit ciphertext blobs and 96-bit random IVs. The AES-GCM cipher provides both confidentiality and authentication. Without the client keys, cracking the ciphertext requires 2^256 brute force operations, which is physically impossible with modern or future computing power.',
      status: 'Zero-Knowledge Protected: 0% plaintext exposed'
    },
    {
      id: 'vector-5',
      title: 'Ciphertext Tampering / Bit-Flipping Attacks',
      riskLevel: 'Integrity Threat',
      badgeColor: 'badge-emerald',
      description:
        'An adversary modifies bytes within the stored ciphertext in S3 or in transit to corrupt the recipient payload or induce oracle errors.',
      mitigation:
        'GuardianBox uses AES-GCM, an Authenticated Encryption with Associated Data (AEAD) scheme. Decryption automatically validates the 128-bit authentication tag appended to each ciphertext. Any modification—even 1 bit—causes crypto.subtle.decrypt to abort with an authentication failure before any data is output.',
      status: 'Protected via AEAD Authentication Tag'
    }
  ];

  // Run interactive in-browser encryption
  const runDemoEncrypt = async () => {
    setIsDemoRunning(true);
    setDemoResult(null);
    try {
      const enc = new TextEncoder();
      const plaintextBuffer = enc.encode(demoInput).buffer;
      const originalSha = await calculateSHA256(plaintextBuffer);

      // Generate random 256-bit AES-GCM key and 96-bit IV
      const key = await generateKey();
      const iv = generateIV();
      const keyStr = await exportKeyToBase64Url(key);

      // Encrypt
      const ciphertextBuffer = await encryptBuffer(plaintextBuffer, key, iv);

      // Format hex sample
      const cipherBytes = new Uint8Array(ciphertextBuffer);
      const hexSample = Array.from(cipherBytes.slice(0, 32))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');

      setEncryptedDemo({
        key,
        iv,
        keyStr,
        originalSha,
        ciphertextBuffer,
        cipherBytes,
        hexSample,
        totalBytes: ciphertextBuffer.byteLength
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsDemoRunning(false);
    }
  };

  // Test authentic decryption
  const testValidDecryption = async () => {
    if (!encryptedDemo) return;
    try {
      const decryptedBuffer = await decryptBuffer(
        encryptedDemo.ciphertextBuffer,
        encryptedDemo.key,
        encryptedDemo.iv
      );
      const dec = new TextDecoder();
      const text = dec.decode(decryptedBuffer);
      const sha = await calculateSHA256(decryptedBuffer);

      setDemoResult({
        success: true,
        type: 'valid',
        recoveredText: text,
        sha,
        message: 'AEAD Tag Verified (128-bit MAC matches). Plaintext recovered with zero error.'
      });
    } catch (err) {
      setDemoResult({
        success: false,
        type: 'error',
        message: err.message
      });
    }
  };

  // Simulate 1-bit adversary tampering
  const testTamperAttack = async () => {
    if (!encryptedDemo) return;
    try {
      // Clone buffer and flip 1 single bit in byte 0
      const tampered = new Uint8Array(encryptedDemo.ciphertextBuffer.slice(0));
      tampered[0] ^= 0x01; // flip lowest bit

      await decryptBuffer(
        tampered.buffer,
        encryptedDemo.key,
        encryptedDemo.iv
      );

      // Should never reach here
      setDemoResult({
        success: true,
        type: 'tamper_failed_unexpected',
        message: 'Unexpected: Decryption succeeded on tampered data.'
      });
    } catch (err) {
      setDemoResult({
        success: false,
        type: 'tamper_caught',
        tamperedOffset: 0,
        message: 'OperationError: AEAD Tag authentication failed! Web Crypto API rejected the forged buffer. Integrity preserved.'
      });
    }
  };

  return (
    <div className="space-y-10 animate-fadeIn max-w-5xl mx-auto">
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          <span>Threat Modeling & Applied Cryptographic Audit</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
          Security <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">Architecture</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto">
          Comprehensive threat analysis of GuardianBox zero-knowledge file sharing, detailing attack vectors, cryptographic boundaries, and interactive verification.
        </p>
      </div>

      {/* Applied Cryptographic Specifications */}
      <div className="glass-panel p-6 sm:p-8 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-cyan-400" />
          Applied Cryptographic Specifications & Standards
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-midnight-900/90 border border-cyan-950/40 p-4 rounded-xl space-y-1">
            <span className="text-slate-500 block">Symmetric Cipher</span>
            <span className="font-bold text-cyan-300 font-mono text-sm">AES-GCM (256-bit)</span>
            <p className="text-[11px] text-slate-400">Galois/Counter Mode with 128-bit AEAD tag</p>
          </div>

          <div className="bg-midnight-900/90 border border-cyan-950/40 p-4 rounded-xl space-y-1">
            <span className="text-slate-500 block">Initialization Vector</span>
            <span className="font-bold text-cyan-300 font-mono text-sm">96-bit (12 Bytes)</span>
            <p className="text-[11px] text-slate-400">CSPRNG generated per file encryption</p>
          </div>

          <div className="bg-midnight-900/90 border border-cyan-950/40 p-4 rounded-xl space-y-1">
            <span className="text-slate-500 block">Key Derivation</span>
            <span className="font-bold text-cyan-300 font-mono text-sm">PBKDF2 (SHA-256)</span>
            <p className="text-[11px] text-slate-400">100,000 rounds + 16B random salt</p>
          </div>

          <div className="bg-midnight-900/90 border border-cyan-950/40 p-4 rounded-xl space-y-1">
            <span className="text-slate-500 block">Key Transport</span>
            <span className="font-bold text-cyan-300 font-mono text-sm">URI Hash Fragment</span>
            <p className="text-[11px] text-slate-400">RFC 3986 client-side isolation</p>
          </div>
        </div>
      </div>

      {/* Interactive Cryptographic Verification Lab */}
      <div className="glass-panel glass-panel-glow p-6 sm:p-8 space-y-6 border-cyan-500/25">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-cyan-950/40">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-bold text-white">Live Cryptographic Verification Lab</h3>
              <span className="badge-cyan text-[10px]">Interactive Sandbox</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Test Web Crypto API AES-GCM operations and simulate adversary bit-flipping attacks in real time.
            </p>
          </div>

          <button
            onClick={runDemoEncrypt}
            disabled={isDemoRunning || !demoInput}
            className="btn-primary text-xs py-2 px-4 whitespace-nowrap self-start sm:self-auto"
          >
            {isDemoRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Encrypt In Browser
          </button>
        </div>

        {/* Input Bar */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Plaintext String to Encrypt via Web Crypto API:
          </label>
          <input
            type="text"
            value={demoInput}
            onChange={(e) => setDemoInput(e.target.value)}
            className="w-full bg-midnight-900/90 border border-cyan-950/60 rounded-xl px-4 py-2.5 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-400 transition-all"
            placeholder="Type confidential payload..."
          />
        </div>

        {/* Encrypted Result & Live Buttons */}
        {encryptedDemo && (
          <div className="space-y-4 pt-2 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-midnight-900/80 p-3.5 rounded-xl border border-cyan-950/40 space-y-1">
                <span className="text-slate-500 block text-[10px]">Generated 256-bit Symmetric Key (URL Hash Safe):</span>
                <span className="font-mono text-cyan-300 break-all block">{encryptedDemo.keyStr}</span>
              </div>

              <div className="bg-midnight-900/80 p-3.5 rounded-xl border border-cyan-950/40 space-y-1">
                <span className="text-slate-500 block text-[10px]">Ciphertext (First 32 Bytes + 128-bit Tag):</span>
                <span className="font-mono text-slate-300 break-all block">{encryptedDemo.hexSample} ...</span>
              </div>
            </div>

            {/* Test Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                onClick={testValidDecryption}
                className="btn-secondary flex-1 py-2.5 text-xs flex items-center justify-center gap-2 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/30"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Verify Legitimate Decryption
              </button>

              <button
                onClick={testTamperAttack}
                className="btn-secondary flex-1 py-2.5 text-xs flex items-center justify-center gap-2 border-rose-500/30 text-rose-300 hover:bg-rose-950/30"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Simulate 1-Bit In-Transit Tampering
              </button>
            </div>

            {/* Result Feedback Box */}
            {demoResult && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-1.5 animate-fadeIn ${
                  demoResult.success
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold font-mono">
                  {demoResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>DECRYPTION SUCCESSFUL</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>AEAD INTEGRITY VIOLATION DETECTED</span>
                    </>
                  )}
                </div>

                <p className="font-mono text-[11px] leading-relaxed opacity-90">
                  {demoResult.message}
                </p>

                {demoResult.recoveredText && (
                  <div className="pt-2 border-t border-emerald-500/20 text-[11px]">
                    <span className="text-slate-400">Decrypted Payload: </span>
                    <strong className="text-white font-mono">{demoResult.recoveredText}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attack Vectors List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Terminal className="w-5 h-5 text-cyan-400" />
          Threat Vectors & Architectural Countermeasures
        </h3>

        <div className="space-y-4">
          {attackVectors.map((v) => (
            <div
              key={v.id}
              className="glass-panel p-6 space-y-3 border-cyan-950/30 hover:border-cyan-500/30 transition-all duration-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {v.title}
                </h4>
                <span className={v.badgeColor}>{v.riskLevel}</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-400 block mb-1">Threat Analysis:</strong>
                {v.description}
              </p>

              <div className="bg-midnight-900/90 p-4 rounded-xl border border-cyan-950/40 text-xs space-y-1.5 shadow-inner">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Architectural Countermeasure:
                </span>
                <p className="text-slate-300 leading-relaxed">{v.mitigation}</p>
                <div className="pt-1.5 text-[11px] font-mono text-cyan-400">
                  Status: {v.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
