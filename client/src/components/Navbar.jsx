import React, { useEffect, useState } from 'react';
import { Shield, Eye, BookOpen, Upload, Download, Menu, X } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const [serverHealth, setServerHealth] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const navItems = [
    { id: 'upload', label: 'Encrypt & Share', icon: Upload },
    { id: 'receive', label: 'Decrypt File', icon: Download },
    { id: 'inspector', label: 'Server Inspector', icon: Eye },
    { id: 'security', label: 'Security Audit', icon: BookOpen },
  ];

  const handleNavClick = (id) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  return (
    <header className="border-b border-cyan-950/30 bg-[#0a0f1a]/85 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Zero-Knowledge Badge */}
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => handleNavClick('upload')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 via-teal-600 to-sky-700 flex items-center justify-center shadow-lg shadow-cyan-600/20 border border-cyan-400/20 group-hover:scale-105 transition-transform">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white">Guardian<span className="text-cyan-400">Box</span></span>
                <span className="badge-violet text-[10px] uppercase font-mono py-0.5">E2EE v1.0</span>
              </div>
              <p className="text-[11px] text-slate-400">Zero-Knowledge Encrypted Transfer</p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1.5 bg-midnight-900/70 p-1.5 rounded-xl border border-cyan-950/40 shadow-inner">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-semibold shadow-cyber-cyan'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>

          {/* Mobile hamburger + Status */}
          <div className="flex items-center gap-3">
            {/* Backend Status Indicator */}
            {serverHealth ? (
              <div className="flex items-center gap-2 bg-emerald-950/25 border border-emerald-500/25 px-3 py-1.5 rounded-lg text-xs text-emerald-400 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="hidden sm:inline font-mono">API Online</span>
                <span className="sm:hidden font-mono">OK</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-950/25 border border-amber-500/25 px-3 py-1.5 rounded-lg text-xs text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="font-mono">Connecting...</span>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileOpen && (
          <div className="md:hidden pb-4 pt-2 space-y-1 animate-fadeIn">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === id
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
