import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import UploadVault from './components/UploadVault';
import DownloadVault from './components/DownloadVault';
import ServerInspector from './components/ServerInspector';
import SecurityAuditView from './components/SecurityAuditView';
import ShareModal from './components/ShareModal';
import { Shield, Lock, Terminal, Github, ExternalLink } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'receive' | 'inspector' | 'security'
  const [shareData, setShareData] = useState(null);

  // States passed between views
  const [inspectTargetId, setInspectTargetId] = useState('');
  const [downloadTarget, setDownloadTarget] = useState({ id: '', key: '', isPassphrase: false });

  // Handle URL hash changes (e.g. #/file/gb_xxxx#key=yyyy)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.includes('/file/')) {
        setActiveTab('receive');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleUploadSuccess = (data) => {
    setShareData(data);
    setInspectTargetId(data.fileId);
  };

  const handleSwitchToInspect = (fileId) => {
    setInspectTargetId(fileId);
    setActiveTab('inspector');
  };

  const handleSwitchToReceive = (fileId, key, isPassphrase) => {
    setDownloadTarget({ id: fileId, key: key, isPassphrase: isPassphrase });
    setActiveTab('receive');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070a12] text-slate-100 selection:bg-cyan-500 selection:text-slate-900">
      {/* Background Cyber Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-cyan-600/10 blur-[120px] animate-pulse-glow" />
        <div className="absolute top-[40%] right-[10%] w-[450px] h-[450px] rounded-full bg-blue-600/10 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[10%] w-[600px] h-[600px] rounded-full bg-slate-800/15 blur-[160px]" />
      </div>

      {/* Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
        {activeTab === 'upload' && (
          <UploadVault onUploadSuccess={handleUploadSuccess} />
        )}

        {activeTab === 'receive' && (
          <DownloadVault
            initialFileId={downloadTarget.id}
            initialKey={downloadTarget.key}
            isInitialPassphrase={downloadTarget.isPassphrase}
          />
        )}

        {activeTab === 'inspector' && (
          <ServerInspector inspectFileId={inspectTargetId} />
        )}

        {activeTab === 'security' && (
          <SecurityAuditView />
        )}
      </main>

      {/* Share Modal upon Successful Encryption */}
      {shareData && (
        <ShareModal
          shareData={shareData}
          onClose={() => setShareData(null)}
          onSwitchToInspect={handleSwitchToInspect}
          onSwitchToReceive={handleSwitchToReceive}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900/80 bg-[#06080e] py-8 text-xs text-slate-500 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300 font-semibold">GuardianBox</span>
            <span>—</span>
            <span>Zero-Knowledge File Sharing System</span>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-slate-400 font-mono text-[11px]">
              Standards: RFC 3986 • AES-GCM 256 • PBKDF2 • Web Crypto API
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
