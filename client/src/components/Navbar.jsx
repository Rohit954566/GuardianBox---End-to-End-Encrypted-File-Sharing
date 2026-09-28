import React, { useEffect, useState } from 'react';
import { Shield, Lock, Eye, BookOpen, Upload, Download, Server, CheckCircle2 } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const [serverHealth, setServerHealth] = useState(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setServerHealth(data);
        }
      } catch {
        setServerHealth(null);
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-cyan-950/40 bg-[#090d16]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Zero-Knowledge Badge */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('upload')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-300/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Guardian<span className="text-cyan-400">Box</span></span>
                <span className="badge-cyan text-[10px] uppercase font-mono py-0.5">E2EE v1.0</span>
              </div>
              <p className="text-[11px] text-slate-400">Zero-Knowledge Encrypted Transfer</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Upload className="w-4 h-4" />
              Encrypt & Share
            </button>

            <button
              onClick={() => setActiveTab('receive')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'receive'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Download className="w-4 h-4" />
              Decrypt File
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'inspector'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Eye className="w-4 h-4" />
              Server Inspector (Proof)
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'security'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Security Audit
            </button>
          </nav>

          {/* Backend Status Indicator */}
          <div className="flex items-center gap-3">
            {serverHealth ? (
              <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="hidden sm:inline font-mono">Zero-Knowledge API Active</span>
                <span className="sm:hidden font-mono">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="font-mono">Connecting...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
