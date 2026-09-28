import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import UploadVault from './components/UploadVault';
import DownloadVault from './components/DownloadVault';
import ServerInspector from './components/ServerInspector';
import SecurityAuditView from './components/SecurityAuditView';
import ShareModal from './components/ShareModal';
import { Shield } from 'lucide-react';

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSwitchToReceive = (fileId, key, isPassphrase) => {
    setDownloadTarget({ id: fileId, key: key, isPassphrase: isPassphrase });
    setActiveTab('receive');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070a13] text-slate-100 selection:bg-cyan-500 selection:text-slate-900">
      {/* Background Cyber Ambient Lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[25%] w-[600px] h-[600px] rounded-full bg-cyan-600/10 blur-[150px] animate-pulse-slow" />
        <div className="absolute top-[35%] right-[5%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[160px]" />
        <div className="absolute bottom-[-10%] left-[5%] w-[650px] h-[650px] rounded-full bg-indigo-900/15 blur-[180px]" />
      </div>

      {/* Navigation Bar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
        {activeTab === 'upload' && (
          <UploadVault
            onUploadSuccess={handleUploadSuccess}
            onSwitchToInspect={handleSwitchToInspect}
            onSwitchToReceive={handleSwitchToReceive}
          />
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

      {/* Professional Footer */}
      <footer className="border-t border-slate-900/90 bg-[#06080e] py-8 text-xs text-slate-500 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <span className="text-slate-300 font-semibold">GuardianBox</span>
            <span className="text-slate-600">•</span>
            <span>Zero-Knowledge End-to-End Encrypted File Transfer</span>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-slate-400 font-mono text-[11px]">
              Engineered with Web Crypto API • AES-256-GCM • RFC 3986
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
