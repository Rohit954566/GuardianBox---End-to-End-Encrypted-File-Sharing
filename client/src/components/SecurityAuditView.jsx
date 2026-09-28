import React from 'react';
import { ShieldAlert, Lock, Key, AlertTriangle, CheckCircle, FileX, Terminal, Cpu } from 'lucide-react';

export default function SecurityAuditView() {
  const attackVectors = [
    {
      id: 'vector-1',
      title: 'What if the user loses the link?',
      riskLevel: 'Permanent Loss (Expected Behavior)',
      badgeColor: 'badge-rose',
      description:
        'Because GuardianBox operates on strict Zero-Knowledge principles, the decryption key exists solely in the URL hash fragment (#key=...) on the sender/receiver clients. The server never stores or caches the key.',
      mitigation:
        'Data recovery is mathematically impossible without the key (2^256 keyspace). This is a core security guarantee, not a defect. Ephemeral cron jobs will automatically clean up orphaned encrypted blobs once their expiration timestamp passes.',
      status: 'Protected by Cryptographic Design'
    },
    {
      id: 'vector-2',
      title: 'URL Hash Leakage via HTTP Referrer Headers',
      riskLevel: 'Critical Privacy Risk',
      badgeColor: 'badge-rose',
      description:
        'If the download page contains external links, scripts, or assets, the browser might include the current URL in the "Referer" HTTP header, inadvertently transmitting the #key fragment to third-party domains.',
      mitigation:
        'GuardianBox enforces <meta name="referrer" content="no-referrer" /> globally across all client pages. Additionally, no external third-party analytics, ads, or scripts are loaded on the file decryption page.',
      status: 'Mitigated via strict Referrer-Policy: no-referrer'
    },
    {
      id: 'vector-3',
      title: 'Malicious Server / Compromised Host Injection',
      riskLevel: 'High Risk (Host Trust Model)',
      badgeColor: 'badge-cyan',
      description:
        'If an adversary compromises the web server hosting the client HTML/JS assets, they could theoretically tamper with cryptoUtils.js to exfiltrate keys during execution.',
      mitigation:
        'End-to-End browser encryption assumes the integrity of the served client application. In enterprise production, GuardianBox utilizes Content Security Policy (CSP), Subresource Integrity (SRI) hashes, and can be distributed as a cryptographically signed static Progressive Web App (PWA) or desktop wrapper (Electron/Tauri).',
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

  return (
    <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto">
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Threat Modeling & Cryptographic Audit</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Security <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Architecture</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto">
          Comprehensive threat analysis of GuardianBox zero-knowledge file sharing, detailing attack vectors, cryptographic boundaries, and mitigation mechanisms.
        </p>
      </div>

      {/* Cryptographic Primitives Table */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-cyan-400" />
          Applied Cryptographic Specifications
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-1">
            <span className="text-slate-500 block">Symmetric Cipher</span>
            <span className="font-bold text-cyan-300 font-mono">AES-GCM (256-bit)</span>
            <p className="text-[10px] text-slate-400">Authenticated Galois/Counter Mode</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-1">
            <span className="text-slate-500 block">Initialization Vector</span>
            <span className="font-bold text-cyan-300 font-mono">96-bit (12 Bytes)</span>
            <p className="text-[10px] text-slate-400">CSPRNG generated per file</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-1">
            <span className="text-slate-500 block">Key Derivation</span>
            <span className="font-bold text-cyan-300 font-mono">PBKDF2 (SHA-256)</span>
            <p className="text-[10px] text-slate-400">100,000 rounds + 16B salt</p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-1">
            <span className="text-slate-500 block">Key Transport</span>
            <span className="font-bold text-cyan-300 font-mono">URI Hash Fragment</span>
            <p className="text-[10px] text-slate-400">RFC 3986 client-side isolation</p>
          </div>
        </div>
      </div>

      {/* Attack Vectors List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white">Threat Vectors & Defense Evaluations</h3>

        <div className="space-y-4">
          {attackVectors.map((v) => (
            <div key={v.id} className="glass-panel p-6 space-y-3 border-slate-800 hover:border-slate-700 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {v.title}
                </h4>
                <span className={v.badgeColor}>{v.riskLevel}</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-slate-400 block mb-1">Vector Analysis:</strong>
                {v.description}
              </p>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80 text-xs space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Architectural Countermeasure:
                </span>
                <p className="text-slate-300">{v.mitigation}</p>
                <div className="pt-1 text-[11px] font-mono text-cyan-400">
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
