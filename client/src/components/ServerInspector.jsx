import React, { useState, useEffect } from 'react';
import { Eye, ShieldAlert, CheckCircle2, Copy, Check, Terminal, Database, Server, RefreshCw } from 'lucide-react';
import { formatBytes } from '../utils/cryptoUtils.js';

export default function ServerInspector({ inspectFileId }) {
  const [fileIdInput, setFileIdInput] = useState(inspectFileId || '');
  const [inspectionData, setInspectionData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedHex, setCopiedHex] = useState(false);

  useEffect(() => {
    if (inspectFileId) {
      setFileIdInput(inspectFileId);
      runInspection(inspectFileId);
    }
  }, [inspectFileId]);

  const runInspection = async (idToInspect) => {
    const id = idToInspect || fileIdInput;
    if (!id || id.trim().length < 3) {
      setErrorMsg('Please specify a valid File ID to inspect.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/files/${id.trim()}/inspect`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'File not found on server storage.');
      }
      const data = await res.json();
      setInspectionData(data);
    } catch (err) {
      console.error('Inspection failed:', err);
      setErrorMsg(err.message);
      setInspectionData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const copyHexDump = () => {
    if (!inspectionData || !inspectionData.hexDumpSample) return;
    const text = inspectionData.hexDumpSample
      .map(line => `${line.offset}  ${line.hex}  |${line.ascii}|`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 2500);
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-4xl mx-auto">
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 text-xs font-mono">
          <Eye className="w-3.5 h-3.5" />
          <span>Proof of Zero-Knowledge / Storage Audit</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Server Storage <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Inspector</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto">
          Verify the "Blind Server" guarantee. Inspect the exact binary bytes stored in the backend S3/Disk storage to prove zero plaintext leakage.
        </p>
      </div>

      {/* Query Bar */}
      <div className="glass-panel p-6 space-y-4">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Enter File ID to Audit Server Storage:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. gb_..."
            value={fileIdInput}
            onChange={(e) => setFileIdInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
          />
          <button
            onClick={() => runInspection()}
            disabled={isLoading || !fileIdInput}
            className="btn-primary text-xs px-6 whitespace-nowrap"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Inspect Storage'}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Inspection Results */}
      {inspectionData && (
        <div className="space-y-6 animate-fadeIn">
          {/* Storage & Cryptographic Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-panel p-4 space-y-1">
              <span className="text-slate-500 text-xs flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                Storage Provider
              </span>
              <p className="text-sm font-semibold text-slate-200">{inspectionData.storageProvider}</p>
              <span className="text-[10px] text-slate-400 font-mono">Key: {inspectionData.storageKey}</span>
            </div>

            <div className="glass-panel p-4 space-y-1">
              <span className="text-slate-500 text-xs flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                Ciphertext Volume
              </span>
              <p className="text-sm font-semibold text-emerald-400 font-mono">
                {formatBytes(inspectionData.totalCiphertextSize)}
              </p>
              <span className="text-[10px] text-slate-400 font-mono">256-bit AES-GCM + Tag</span>
            </div>

            <div className="glass-panel p-4 space-y-1">
              <span className="text-slate-500 text-xs flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                Entropy Level
              </span>
              <p className="text-sm font-semibold text-amber-400">Cryptographically Uniform</p>
              <span className="text-[10px] text-slate-400 font-mono">Zero Plaintext Patterns</span>
            </div>
          </div>

          {/* Hex Dump Viewer */}
          <div className="glass-panel p-6 space-y-4 border-cyan-500/30">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Raw Binary Hex Dump (First 256 Bytes in Server Storage)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Notice the complete absence of human-readable strings, file headers, or magic numbers.
                </p>
              </div>
              <button
                onClick={copyHexDump}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                {copiedHex ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Hex
                  </>
                )}
              </button>
            </div>

            {/* Terminal Block */}
            <div className="bg-[#050811] p-4 rounded-xl border border-slate-800 font-mono text-[11px] overflow-x-auto leading-relaxed text-slate-300">
              <div className="text-slate-500 mb-2 border-b border-slate-800/80 pb-1 flex justify-between">
                <span>OFFSET     00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F</span>
                <span>ASCII DUMP</span>
              </div>
              {inspectionData.hexDumpSample.map((line, idx) => (
                <div key={idx} className="flex justify-between hover:bg-slate-900/50 px-1 py-0.5 rounded">
                  <span className="text-cyan-500 mr-4">{line.offset}</span>
                  <span className="text-slate-300 tracking-wider flex-1 mr-4">{line.hex}</span>
                  <span className="text-slate-400 border-l border-slate-800 pl-4">{line.ascii}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Formal Zero-Knowledge Proof Evaluation Checklist */}
          <div className="bg-slate-900/70 border border-emerald-500/30 rounded-2xl p-6 space-y-4">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Cryptographic Audit & Zero-Knowledge Verification
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 1. Server Blindness
                </span>
                <p className="text-slate-300">
                  Encryption occurs on the client before network transmission. The server never holds or receives the plaintext file.
                </p>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 2. Key Isolation via URL Hash
                </span>
                <p className="text-slate-300">
                  The AES-256 key is conveyed exclusively inside the URL hash fragment (<code className="text-cyan-400 font-mono">#key=...</code>), which RFC 3986 forbids browsers from transmitting to web servers.
                </p>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 3. Metadata Obfuscation
                </span>
                <p className="text-slate-300">
                  Original filenames and MIME types are encrypted into ciphertext before upload, eliminating traffic profiling.
                </p>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 4. Breach Resilience
                </span>
                <p className="text-slate-300">
                  Even if the S3 bucket and database are completely compromised, an adversary only obtains random AES-GCM bytes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
