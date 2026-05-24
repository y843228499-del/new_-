
import React, { useState, useEffect } from 'react';
import { X, Settings, FolderOpen, Globe, Monitor, Zap, FileKey, ShieldCheck, ShieldAlert, Key, Trash2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { AppSettings, CertificateFile } from '../types';
import { opcuaService } from '../services/opcuaService';
import { toast } from 'sonner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  appSettings?: AppSettings;
}

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, appSettings }) => {
  const { t, language, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState<'general' | 'opcua' | 'pki'>('general');
  
  // PKI State
  const [pkiTab, setPkiTab] = useState<'trusted' | 'rejected' | 'own'>('rejected');
  const [certList, setCertList] = useState<CertificateFile[]>([]);
  const [isLoadingPki, setIsLoadingPki] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(appSettings || {
      general: {
          language: language,
          autoConnect: false,
          theme: 'light'
      },
      opcua: {
          applicationName: 'ReactOPCUAClient',
          defaultRequestTimeout: 10000,
          defaultKeepAliveInterval: 5000,
          reconnectDelay: 5000
      },
      paths: {
          pkiRoot: '',
          logsDir: ''
      }
  });

  useEffect(() => {
    if (isOpen && appSettings) {
      setSettings(appSettings);
    }
  }, [isOpen, appSettings]);

  // Load paths from Electron if available
  useEffect(() => {
      if (isOpen && isElectron) {
          (window as any).electronAPI.getAppPaths().then((paths: any) => {
              setSettings(prev => ({ ...prev, paths: { ...prev.paths, ...paths } }));
          });
      }
  }, [isOpen]);

  // Sync language with local state
  useEffect(() => {
    setSettings(prev => ({...prev, general: {...prev.general, language}}));
  }, [language]);

  // PKI Data Fetch
  useEffect(() => {
      if (isOpen && activeTab === 'pki') {
          loadCertificates();
      }
  }, [isOpen, activeTab, pkiTab]);

  const loadCertificates = async () => {
      setIsLoadingPki(true);
      try {
          const files = await opcuaService.getCertificates(pkiTab);
          setCertList(files);
      } catch (e) {
          console.error("Failed to load certs", e);
      } finally {
          setIsLoadingPki(false);
      }
  };

  const handleTrustCert = async (filename: string) => {
      toast(`Trust certificate '${filename}'?`, {
          action: {
              label: 'Trust',
              onClick: async () => {
                  await opcuaService.trustCertificate(filename);
                  loadCertificates();
              }
          },
          cancel: {
              label: 'Cancel',
              onClick: () => {}
          }
      });
  };

  const handleRejectCert = async (filename: string) => {
      toast(`Reject (Revoke Trust) certificate '${filename}'?`, {
          action: {
              label: 'Reject',
              onClick: async () => {
                  await opcuaService.rejectCertificate(filename);
                  loadCertificates();
              }
          },
          cancel: {
              label: 'Cancel',
              onClick: () => {}
          }
      });
  };

  const handleDeleteCert = async (filename: string) => {
      toast(`Permanently delete certificate '${filename}'?`, {
          action: {
              label: 'Delete',
              onClick: async () => {
                  await opcuaService.deleteCertificate(pkiTab, filename);
                  loadCertificates();
              }
          },
          cancel: {
              label: 'Cancel',
              onClick: () => {}
          }
      });
  };

  const handleSave = () => {
      setLanguage(settings.general.language); // Apply language immediately
      onSave(settings);
      onClose();
  };

  const openFolder = (path: string) => {
      if (isElectron) {
          const promise = path ? (window as any).electronAPI.openPath(path) : (window as any).electronAPI.openPkiFolder('root');
          promise.then((err: any) => {
              if (err && typeof err === 'string') {
                  alert(`Failed to open folder: ${err}`);
              }
          });
      } else {
          alert(`In a real app, this would open: ${path || 'C:\\ProgramData\\OPCUA\\PKI'}`);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[650px] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700 rounded-lg shadow-sm text-white">
                 <Settings className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 leading-tight">{t.settings.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 bg-slate-50 border-r border-slate-200 flex flex-col p-2 gap-1">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-colors text-left ${activeTab === 'general' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-600 hover:bg-slate-200/50'}`}
                >
                    <Monitor className="w-4 h-4" /> {t.settings.tabs.general}
                </button>
                <button 
                    onClick={() => setActiveTab('opcua')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-colors text-left ${activeTab === 'opcua' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-600 hover:bg-slate-200/50'}`}
                >
                    <Zap className="w-4 h-4" /> {t.settings.tabs.opcua}
                </button>
                <button 
                    onClick={() => setActiveTab('pki')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-lg transition-colors text-left ${activeTab === 'pki' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-600 hover:bg-slate-200/50'}`}
                >
                    <FileKey className="w-4 h-4" /> {t.settings.tabs.certificates}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col">
                
                {/* GENERAL TAB */}
                {activeTab === 'general' && (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">{t.settings.general.language}</label>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setSettings(s => ({...s, general: {...s.general, language: 'en'}}))}
                                    className={`flex items-center gap-2 px-4 py-2 rounded border ${settings.general.language === 'en' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}
                                >
                                    <Globe className="w-4 h-4" /> English
                                </button>
                                <button 
                                    onClick={() => setSettings(s => ({...s, general: {...s.general, language: 'zh'}}))}
                                    className={`flex items-center gap-2 px-4 py-2 rounded border ${settings.general.language === 'zh' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}
                                >
                                    <Globe className="w-4 h-4" /> 中文
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Theme (主题)</label>
                            <div className="flex gap-4">
                                <button 
                                    onClick={() => setSettings(s => ({...s, general: {...s.general, theme: 'light'}}))}
                                    className={`flex items-center gap-2 px-4 py-2 rounded border ${settings.general.theme === 'light' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}
                                >
                                    <Monitor className="w-4 h-4" /> Light
                                </button>
                                <button 
                                    onClick={() => setSettings(s => ({...s, general: {...s.general, theme: 'dark'}}))}
                                    className={`flex items-center gap-2 px-4 py-2 rounded border ${settings.general.theme === 'dark' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}
                                >
                                    <Monitor className="w-4 h-4" /> Dark
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                <input 
                                    type="checkbox" 
                                    checked={settings.general.autoConnect}
                                    onChange={e => setSettings(s => ({...s, general: {...s.general, autoConnect: e.target.checked}}))}
                                    className="w-5 h-5 text-blue-600 rounded"
                                />
                                <span className="font-medium text-slate-700">{t.settings.general.autoConnect}</span>
                            </label>
                        </div>
                    </div>
                )}

                {/* OPC UA TAB */}
                {activeTab === 'opcua' && (
                    <div className="space-y-6">
                         <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t.settings.opcua.appName}</label>
                            <input 
                                type="text" 
                                value={settings.opcua.applicationName}
                                onChange={e => setSettings(s => ({...s, opcua: {...s.opcua, applicationName: e.target.value}}))}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t.settings.opcua.reqTimeout}</label>
                                <input 
                                    type="number" 
                                    value={settings.opcua.defaultRequestTimeout}
                                    onChange={e => setSettings(s => ({...s, opcua: {...s.opcua, defaultRequestTimeout: Number(e.target.value)}}))}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t.settings.opcua.keepAlive}</label>
                                <input 
                                    type="number" 
                                    value={settings.opcua.defaultKeepAliveInterval}
                                    onChange={e => setSettings(s => ({...s, opcua: {...s.opcua, defaultKeepAliveInterval: Number(e.target.value)}}))}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        
                        <div className="pt-4 border-t border-slate-200">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t.settings.opcua.reconnectDelay}</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number"
                                    min="1000"
                                    step="1000" 
                                    value={settings.opcua.reconnectDelay || 5000}
                                    onChange={e => setSettings(s => ({...s, opcua: {...s.opcua, reconnectDelay: Number(e.target.value)}}))}
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono text-blue-600 font-bold"
                                />
                                <span className="text-xs text-slate-400">ms</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">Wait time before attempting to reconnect after a connection drop.</p>
                        </div>
                    </div>
                )}

                {/* PKI TAB (Visual Manager) */}
                {activeTab === 'pki' && (
                    <div className="flex flex-col h-full gap-4">
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-800 flex justify-between items-start">
                            <div>{t.settings.pki.desc}</div>
                            <button onClick={() => openFolder(settings.paths.pkiRoot)} className="text-xs text-amber-700 font-bold hover:underline flex items-center gap-1">
                                <FolderOpen className="w-3 h-3" /> Root
                            </button>
                        </div>

                        {/* Sub-Tabs */}
                        <div className="flex gap-1 border-b border-slate-200">
                            <button onClick={() => setPkiTab('rejected')} className={`px-4 py-2 text-xs font-bold rounded-t-lg flex items-center gap-2 ${pkiTab === 'rejected' ? 'bg-red-50 text-red-700 border-b-2 border-red-500' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <ShieldAlert className="w-3.5 h-3.5" /> Rejected
                            </button>
                            <button onClick={() => setPkiTab('trusted')} className={`px-4 py-2 text-xs font-bold rounded-t-lg flex items-center gap-2 ${pkiTab === 'trusted' ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <ShieldCheck className="w-3.5 h-3.5" /> Trusted
                            </button>
                            <button onClick={() => setPkiTab('own')} className={`px-4 py-2 text-xs font-bold rounded-t-lg flex items-center gap-2 ${pkiTab === 'own' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <Key className="w-3.5 h-3.5" /> Own
                            </button>
                            <div className="flex-1"></div>
                            <button onClick={loadCertificates} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" title="Refresh">
                                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPki ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {/* Certificate List */}
                        <div className="flex-1 border border-slate-200 rounded-lg overflow-y-auto bg-slate-50/30 relative">
                            {certList.length === 0 ? (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400 italic text-xs">
                                    No certificates found in {pkiTab} folder.
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="p-3">Filename</th>
                                            <th className="p-3 w-32 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm divide-y divide-slate-100">
                                        {certList.map((cert) => (
                                            <tr key={cert.name} className="hover:bg-white transition-colors">
                                                <td className="p-3 flex items-center gap-2">
                                                    <div className="p-1.5 bg-slate-200 rounded text-slate-500">
                                                        <FileKey className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-700 truncate max-w-[250px]">{cert.name}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono select-all truncate max-w-[250px]">{cert.path}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {pkiTab === 'rejected' && (
                                                            <button onClick={() => handleTrustCert(cert.name)} className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold hover:bg-emerald-200 flex items-center gap-1">
                                                                <CheckCircle2 className="w-3 h-3" /> Trust
                                                            </button>
                                                        )}
                                                        {pkiTab === 'trusted' && (
                                                            <button onClick={() => handleRejectCert(cert.name)} className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold hover:bg-amber-200 flex items-center gap-1">
                                                                <AlertTriangle className="w-3 h-3" /> Reject
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDeleteCert(cert.name)} className="p-1.5 bg-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm transition-colors">
                 {t.settings.actions.cancel}
             </button>
             <button onClick={handleSave} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-sm shadow-md transition-colors">
                 {t.settings.actions.save}
             </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
