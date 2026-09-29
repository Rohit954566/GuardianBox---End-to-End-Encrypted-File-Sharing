import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ShieldCheck, QrCode as QrIcon, ExternalLink, Eye, Flame, Clock } from 'lucide-react';
import { formatBytes } from '../utils/cryptoUtils.js';

export default function ShareModal({ shareData, onClose, onSwitchToInspect, onSwitchToReceive }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const canvasRef = useRef(null);

  const fullShareUrl = `${window.location.origin}/#/file/${shareData.fileId}#key=${shareData.keyBase64Url}${shareData.isPassphrase ? '&mode=passphrase' : ''}`;

  useEffect(() => {
    if (showQr && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, fullShareUrl, {
        width: 220,
        margin: 2,
        color: {
          dark: '#0a0f1a',
          light: '#f0f9ff'
        }
      });
    }
  }, [showQr, fullShareUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const input = document.createElement('input');
      input.value = fullShareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-panel glass-panel-glow max-w-2xl w-full p-6 sm:p-8 space-y-6 relative border-cyan-500/30 shadow-cyber-cyan">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-600/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-cyber-cyan/15">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                File Encrypted & Uploaded
                <span className="badge-emerald text-xs font-normal">Zero-Knowledge</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                The ciphertext blob is stored on the server. The decryption key exists ONLY in this link.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Share Link Input Box */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Secure End-to-End Sharing Link</span>
            <span className="text-cyan-400 font-mono text-[11px]">Includes Client-Side Decryption Key (#)</span>
          </label>

          <div className="flex items-center gap-2 bg-midnight-900/90 border border-cyan-500/25 rounded-xl p-2 focus-within:border-cyan-400 transition-all shadow-inner">
            <input
              type="text"
              readOnly
              value={fullShareUrl}
              className="bg-transparent text-sm text-cyan-300 font-mono px-2 py-1 w-full focus:outline-none select-all truncate"
            />
            <button
              onClick={handleCopy}
              className="btn-primary py-2 px-4 text-xs whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* RFC 3986 Callout */}
        <div className="bg-midnight-900/80 border border-cyan-950/50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            Why is this Zero-Knowledge? (RFC 3986 Standard)
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Notice the <span className="text-cyan-300 font-mono font-bold">#key=...</span> fragment in your sharing URL.
            Under Internet standard <span className="text-white font-mono">RFC 3986</span>, anything after the <code className="text-cyan-300">#</code> symbol
            is processed <strong>purely by the browser</strong> and is <strong>never transmitted</strong> in HTTP requests to the server.
            The server hosts only unreadable random gibberish.
          </p>
        </div>

        {/* File Attributes & Expiration Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-midnight-900/60 border border-slate-800/60 p-3 rounded-xl">
            <span className="text-slate-500 block mb-1">Original File</span>
            <span className="font-semibold text-slate-200 truncate block">{shareData.fileName}</span>
          </div>

          <div className="bg-midnight-900/60 border border-slate-800/60 p-3 rounded-xl">
            <span className="text-slate-500 block mb-1">Encrypted Size</span>
            <span className="font-semibold text-cyan-400 font-mono">{formatBytes(shareData.fileSize)}</span>
          </div>

          <div className="bg-midnight-900/60 border border-slate-800/60 p-3 rounded-xl">
            <span className="text-slate-500 block mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" />
              Expires In
            </span>
            <span className="font-semibold text-amber-400">{shareData.expiresInHours} Hours</span>
          </div>

          <div className="bg-midnight-900/60 border border-slate-800/60 p-3 rounded-xl">
            <span className="text-slate-500 block mb-1 flex items-center gap-1">
              <Flame className="w-3 h-3 text-rose-400" />
              Download Limit
            </span>
            <span className="font-semibold text-rose-400">
              {shareData.maxDownloads ? `${shareData.maxDownloads} Download(s)` : 'Unlimited'}
            </span>
          </div>
        </div>

        {/* QR Code Display */}
        {showQr && (
          <div className="flex flex-col items-center justify-center p-4 bg-midnight-900 border border-cyan-950/40 rounded-xl space-y-2 animate-fadeIn">
            <p className="text-xs text-slate-400 font-medium">Scan to open and decrypt on another device:</p>
            <div className="p-3 bg-sky-50 rounded-xl shadow-lg">
              <canvas ref={canvasRef}></canvas>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQr(!showQr)}
              className="btn-secondary text-xs py-2 px-3"
            >
              <QrIcon className="w-4 h-4 text-cyan-400" />
              {showQr ? 'Hide QR Code' : 'Show QR Code'}
            </button>

            <button
              onClick={() => {
                onClose();
                onSwitchToInspect(shareData.fileId);
              }}
              className="btn-secondary text-xs py-2 px-3 text-cyan-300 border-cyan-500/20 hover:border-cyan-400"
            >
              <Eye className="w-4 h-4" />
              Proof: Inspect Server Blob
            </button>
          </div>

          <button
            onClick={() => {
              onClose();
              onSwitchToReceive(shareData.fileId, shareData.keyBase64Url, shareData.isPassphrase);
            }}
            className="btn-primary text-xs py-2 px-4"
          >
            <ExternalLink className="w-4 h-4" />
            Open Decryption Screen
          </button>
        </div>
      </div>
    </div>
  );
}
