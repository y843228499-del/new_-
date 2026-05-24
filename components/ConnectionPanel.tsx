
import React, { useState, useEffect } from 'react';
import { ConnectionStatus, MessageSecurityMode, SecurityPolicy, AuthSettings, SessionInfo, EndpointDescription, ConnectionOptions } from '../types';
import { Wifi, WifiOff, ShieldCheck, Server, User, FileKey, X, Globe, RefreshCw, Sliders, ChevronDown, ChevronUp, Fingerprint, Lock, Repeat, Activity, Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { opcuaService } from '../services/opcuaService';

interface ConnectionPanelProps {
  session: SessionInfo;
  onConnect: (
      endpoint: string, 
      securityMode: MessageSecurityMode, 
      securityPolicy: SecurityPolicy,
      auth: AuthSettings,
      options?: ConnectionOptions
  ) => void;
  onDisconnect: () => void;
  onUpdateSession?: (updates: Partial<SessionInfo>) => void; 
}

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ session, onConnect, onDisconnect, onUpdateSession }) => {
  const { t } = useLanguage();
  const status = session.status;
  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;

  const [endpoint, setEndpoint] = useState(session.endpointUrl);
  const [securityMode, setSecurityMode] = useState<MessageSecurityMode>(session.securityMode);
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicy>(session.securityPolicy);
  
  const [authMode, setAuthMode] = useState<AuthSettings['mode']>(session.authSettings.mode);
  const [username, setUsername] = useState(session.authSettings.username || '');
  const [password, setPassword] = useState(session.authSettings.password || '');
  const [certFile, setCertFile] = useState(session.authSettings.certificateFile || '');
  const [keyFile, setKeyFile] = useState(session.authSettings.privateKeyFile || '');
  const [autoTrust, setAutoTrust] = useState(session.authSettings.autoAcceptUnknownCert);
  
  const [sessionTimeout, setSessionTimeout] = useState(session.connectionOptions?.sessionTimeout || 60000);
  const [keepAliveInterval, setKeepAliveInterval] = useState(session.connectionOptions?.keepAliveInterval || 5000);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false); 

  const [autoReconnect, setAutoReconnect] = useState(session.autoReconnect ?? true);
  const [autoRead, setAutoRead] = useState(session.autoRead ?? false);
  const [autoSubscribe, setAutoSubscribe] = useState(session.autoSubscribe ?? false);
  const [autoSchedule, setAutoSchedule] = useState(session.autoSchedule ?? false);

  const [isEndpointsModalOpen, setIsEndpointsModalOpen] = useState(false);
  const [discoveredEndpoints, setDiscoveredEndpoints] = useState<EndpointDescription[]>([]);
  const [isLoadingEndpoints, setIsLoadingEndpoints] = useState(false);

  useEffect(() => {
      if (session.endpointUrl) {
          setEndpoint(session.endpointUrl);
      } else {
          setEndpoint('opc.tcp://');
      }
      
      setSecurityMode(session.securityMode);
      setSecurityPolicy(session.securityPolicy);
      setAuthMode(session.authSettings.mode);
      setUsername(session.authSettings.username || '');
      setPassword(session.authSettings.password || '');
      setCertFile(session.authSettings.certificateFile || '');
      setKeyFile(session.authSettings.privateKeyFile || '');
      setAutoTrust(session.authSettings.autoAcceptUnknownCert);
      if(session.connectionOptions) {
          setSessionTimeout(session.connectionOptions.sessionTimeout);
          setKeepAliveInterval(session.connectionOptions.keepAliveInterval);
      }
      setAutoReconnect(session.autoReconnect ?? true);
      setAutoRead(session.autoRead ?? false);
      setAutoSubscribe(session.autoSubscribe ?? false);
      setAutoSchedule(session.autoSchedule ?? false);
  }, [session.id]);

  const handleToggleAutoReconnect = (val: boolean) => {
      setAutoReconnect(val);
      if (onUpdateSession) onUpdateSession({ autoReconnect: val });
  };

  const handleToggleAutoRead = (val: boolean) => {
      setAutoRead(val);
      if (onUpdateSession) onUpdateSession({ autoRead: val });
  };

  const handleToggleAutoSubscribe = (val: boolean) => {
      setAutoSubscribe(val);
      if (onUpdateSession) onUpdateSession({ autoSubscribe: val });
  };

  const handleToggleAutoSchedule = (val: boolean) => {
      setAutoSchedule(val);
      if (onUpdateSession) onUpdateSession({ autoSchedule: val });
  };

  const handleEndpointBlur = () => {
      let finalEndpoint = endpoint.trim();
      if (finalEndpoint.length > 0 && !finalEndpoint.startsWith('opc.tcp://')) {
          finalEndpoint = 'opc.tcp://' + finalEndpoint;
      }
      setEndpoint(finalEndpoint);
      if (onUpdateSession && finalEndpoint !== session.endpointUrl) {
          onUpdateSession({ endpointUrl: finalEndpoint });
      }
  };

  useEffect(() => {
      if (securityMode === MessageSecurityMode.None && securityPolicy !== SecurityPolicy.None) {
          setSecurityPolicy(SecurityPolicy.None);
          if (onUpdateSession) onUpdateSession({ securityPolicy: SecurityPolicy.None });
      }
  }, [securityMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isConnected || isConnecting) {
      onDisconnect();
    } else {
      const auth: AuthSettings = {
          mode: authMode,
          username: authMode === 'Username' ? username : undefined,
          password: authMode === 'Username' ? password : undefined,
          certificateFile: authMode === 'Certificate' ? certFile : undefined,
          privateKeyFile: authMode === 'Certificate' ? keyFile : undefined,
          autoAcceptUnknownCert: autoTrust
      };
      const options: ConnectionOptions = {
          sessionTimeout,
          keepAliveInterval
      };
      
      // Ensure we send trimmed data
      const finalEndpoint = endpoint.trim() || 'opc.tcp://localhost:4840';
      const finalPolicy = securityMode === MessageSecurityMode.None ? SecurityPolicy.None : securityPolicy;

      onConnect(finalEndpoint, securityMode, finalPolicy, auth, options);
    }
  };

  const selectEndpoint = (ep: EndpointDescription) => {
    setEndpoint(ep.endpointUrl);
    setSecurityMode(ep.securityMode);
    
    const policyParts = ep.securityPolicyUri.split('#');
    const policy = policyParts.length > 1 ? policyParts[1] : 'None';
    
    let finalPolicy = SecurityPolicy.None;
    if (Object.values(SecurityPolicy).includes(policy as SecurityPolicy)) {
        setSecurityPolicy(policy as SecurityPolicy);
        finalPolicy = policy as SecurityPolicy;
    }
    
    if (onUpdateSession) {
        onUpdateSession({
            endpointUrl: ep.endpointUrl,
            securityMode: ep.securityMode,
            securityPolicy: finalPolicy
        });
    }
    
    setIsEndpointsModalOpen(false);
  };

  const handleGetEndpoints = async () => {
    let url = endpoint.trim();
    if (!url) return;
    
    if (!url.startsWith('opc.tcp://')) {
        url = 'opc.tcp://' + url;
        setEndpoint(url);
    }

    setIsLoadingEndpoints(true);
    setDiscoveredEndpoints([]);
    try {
        const eps = await opcuaService.getEndpoints(url);
        setDiscoveredEndpoints(eps);
        setIsEndpointsModalOpen(true);
    } catch (e: any) {
        console.error(e);
        alert(`Failed to discover endpoints: ${e.message}`);
    } finally {
        setIsLoadingEndpoints(false);
    }
  };
  
  const groupedEndpoints = discoveredEndpoints.reduce((acc, ep) => {
      if (!acc[ep.endpointUrl]) {
          acc[ep.endpointUrl] = [];
      }
      acc[ep.endpointUrl].push(ep);
      return acc;
  }, {} as Record<string, EndpointDescription[]>);

  return (
    <div className="flex flex-col h-full relative">
      {isEndpointsModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-full border border-slate-200">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-blue-500" />
                        {t.connection.endpointsModal.title}
                    </h3>
                    <button onClick={() => setIsEndpointsModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    {discoveredEndpoints.length === 0 ? (
                        <div className="text-center text-slate-400 p-8 italic">{t.connection.endpointsModal.none}</div>
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(groupedEndpoints).map(([url, eps]) => (
                                <div key={url} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-bold text-slate-700 text-sm flex items-center gap-2">
                                        <Server className="w-4 h-4 text-slate-500" />
                                        {url}
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {(eps as EndpointDescription[]).sort((a,b) => a.securityLevel - b.securityLevel).map((ep, idx) => (
                                            <div key={idx} className="p-3 hover:bg-blue-50 cursor-pointer flex items-center gap-4 transition-colors group" onClick={() => selectEndpoint(ep)}>
                                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded w-fit ${ep.securityMode === MessageSecurityMode.None ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                                                        {ep.securityMode}
                                                    </span>
                                                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit border border-blue-100">
                                                        {ep.securityPolicyUri.split('#')[1]}
                                                    </span>
                                                    <span className="text-xs text-slate-400">
                                                        Level: {ep.securityLevel}
                                                    </span>
                                                </div>
                                                <button className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded text-xs font-bold group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                    {t.connection.endpointsModal.select}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col h-full bg-slate-50">
        <div className="border-b border-slate-200 bg-blue-50/20 z-20 shadow-sm">
            <div className="p-4 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative z-20">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.endpointUrl}</label>
                    <div className="relative flex items-center">
                        <Server className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 z-10" />
                        <input
                            type="text"
                            value={endpoint}
                            onChange={(e) => {
                                const val = e.target.value;
                                setEndpoint(val);
                                if (onUpdateSession) onUpdateSession({ endpointUrl: val });
                            }}
                            onBlur={handleEndpointBlur}
                            disabled={isConnected || isConnecting}
                            className="w-full pl-9 pr-24 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-slate-100 disabled:text-slate-500 font-mono text-sm shadow-sm bg-white"
                            placeholder="opc.tcp://hostname:port/path"
                        />
                        
                        <div className="absolute right-1 top-1 bottom-1 flex gap-1">
                            <button 
                                type="button"
                                onClick={handleGetEndpoints}
                                disabled={isConnected || isConnecting || isLoadingEndpoints}
                                className="px-3 bg-slate-100 hover:bg-white border border-transparent hover:border-slate-300 rounded text-xs font-bold text-slate-600 flex items-center gap-1 transition-all"
                                title="Discover Server Endpoints"
                            >
                                {isLoadingEndpoints ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">{t.connection.btn.getEndpoints}</span>
                            </button>
                        </div>
                    </div>
                </div>
                
                <div className="w-full md:w-48 z-10">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.securityMode}</label>
                    <div className="relative">
                        <ShieldCheck className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <select
                            value={securityMode}
                            onChange={(e) => {
                                const val = e.target.value as MessageSecurityMode;
                                setSecurityMode(val);
                                if (onUpdateSession) onUpdateSession({ securityMode: val });
                            }}
                            disabled={isConnected || isConnecting}
                            className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-slate-100 text-sm shadow-sm appearance-none bg-white"
                        >
                            {Object.values(MessageSecurityMode).map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="w-full md:w-64 z-10">
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.securityPolicy}</label>
                    <select
                        value={securityPolicy}
                        onChange={(e) => {
                            const val = e.target.value as SecurityPolicy;
                            setSecurityPolicy(val);
                            if (onUpdateSession) onUpdateSession({ securityPolicy: val });
                        }}
                        disabled={isConnected || isConnecting || securityMode === MessageSecurityMode.None}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-slate-100 text-sm shadow-sm bg-white"
                    >
                         {Object.values(SecurityPolicy).map(p => (
                            <option key={p} value={p}>{p}</option>
                         ))}
                    </select>
                </div>
            </div>

            <div className="px-4 pb-3">
                 <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                     <button 
                        type="button"
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                     >
                         <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase">
                             <Sliders className="w-4 h-4" /> Advanced Settings
                         </div>
                         {isAdvancedOpen ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                     </button>
                     
                     {isAdvancedOpen && (
                         <div className="p-4 border-t border-slate-200 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 bg-slate-50/30">
                             <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Session Timeout (ms)</label>
                                 <input 
                                     type="number" 
                                     value={sessionTimeout}
                                     onChange={e => setSessionTimeout(Number(e.target.value))}
                                     onBlur={() => onUpdateSession && onUpdateSession({ connectionOptions: { sessionTimeout, keepAliveInterval } })}
                                     disabled={isConnected}
                                     className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                                 />
                                 <p className="text-[10px] text-slate-400 mt-1">Requested session lifetime.</p>
                             </div>
                             <div>
                                 <label className="block text-xs font-bold text-slate-500 uppercase mb-1">KeepAlive Interval (ms)</label>
                                 <input 
                                     type="number" 
                                     value={keepAliveInterval}
                                     onChange={e => setKeepAliveInterval(Number(e.target.value))}
                                     onBlur={() => onUpdateSession && onUpdateSession({ connectionOptions: { sessionTimeout, keepAliveInterval } })}
                                     disabled={isConnected}
                                     className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                                 />
                                 <p className="text-[10px] text-slate-400 mt-1">Sends periodic ServerStatus read request.</p>
                             </div>
                         </div>
                     )}
                </div>
            </div>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto z-10">
            
            <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-slate-500" />
                    {t.connection.authSection}
                </h3>
                <div className="h-px bg-slate-200 flex-1"></div>
            </div>

            <div className="flex p-1 bg-slate-200 rounded-lg self-start border border-slate-300 shadow-inner">
                <button
                    type="button"
                    onClick={() => {
                        setAuthMode('Anonymous');
                        if (onUpdateSession) onUpdateSession({ authSettings: { ...session.authSettings, mode: 'Anonymous' } });
                    }}
                    disabled={isConnected}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${authMode === 'Anonymous' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                >
                    <User className="w-3.5 h-3.5" /> {t.connection.modes.anonymous}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setAuthMode('Username');
                        if (onUpdateSession) onUpdateSession({ authSettings: { ...session.authSettings, mode: 'Username' } });
                    }}
                    disabled={isConnected}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${authMode === 'Username' ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                >
                    <Lock className="w-3.5 h-3.5" /> {t.connection.modes.username}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setAuthMode('Certificate');
                        if (onUpdateSession) onUpdateSession({ authSettings: { ...session.authSettings, mode: 'Certificate' } });
                    }}
                    disabled={isConnected}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${authMode === 'Certificate' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                >
                    <FileKey className="w-3.5 h-3.5" /> {t.connection.modes.certificate}
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-300 p-6 flex-1 min-h-[140px] shadow-sm relative">
                
                {authMode === 'Anonymous' && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                        <User className="w-10 h-10 opacity-20" />
                        <p className="text-sm text-center">{t.connection.modes.anonymous} selected.</p>
                    </div>
                )}

                {authMode === 'Username' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.fields.username}</label>
                            <input 
                                type="text" 
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                onBlur={() => onUpdateSession && onUpdateSession({ authSettings: { ...session.authSettings, username, mode: 'Username' } })}
                                disabled={isConnected}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.fields.password}</label>
                            <input 
                                type="password" 
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                onBlur={() => onUpdateSession && onUpdateSession({ authSettings: { ...session.authSettings, password, mode: 'Username' } })}
                                disabled={isConnected}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                            />
                        </div>
                    </div>
                )}

                {authMode === 'Certificate' && (
                    <div className="flex flex-col gap-4 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.fields.cert}</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        readOnly
                                        value={certFile}
                                        className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 text-slate-600 font-mono"
                                        placeholder="No file selected"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const val = `client_cert_${Math.floor(Math.random() * 1000)}.der`;
                                            setCertFile(val);
                                            if (onUpdateSession) onUpdateSession({ authSettings: { ...session.authSettings, certificateFile: val, mode: 'Certificate' } });
                                        }}
                                        disabled={isConnected}
                                        className="px-3 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600 shadow-sm"
                                    >
                                        ...
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">{t.connection.fields.key}</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        readOnly
                                        value={keyFile}
                                        className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 text-slate-600 font-mono"
                                        placeholder="No file selected"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const val = `client_key_${Math.floor(Math.random() * 1000)}.pem`;
                                            setKeyFile(val);
                                            if (onUpdateSession) onUpdateSession({ authSettings: { ...session.authSettings, privateKeyFile: val, mode: 'Certificate' } });
                                        }}
                                        disabled={isConnected}
                                        className="px-3 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600 shadow-sm"
                                    >
                                        ...
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input 
                                    type="checkbox" 
                                    checked={autoTrust}
                                    onChange={e => {
                                        setAutoTrust(e.target.checked);
                                        if (onUpdateSession) onUpdateSession({ authSettings: { ...session.authSettings, autoAcceptUnknownCert: e.target.checked } });
                                    }}
                                    disabled={isConnected}
                                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 bg-white"
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">{t.connection.fields.autoTrust}</span>
                                    <span className="text-xs text-slate-500">{t.connection.fields.autoTrustDesc}</span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}
            </div>
            
        </div>

        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-wrap justify-between items-center gap-4">
            
            <div className="flex items-center gap-2 flex-wrap">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${isConnected ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-200 border-slate-300'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : isConnecting ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'}`}></div>
                    <span className={`text-sm font-bold ${isConnected ? 'text-emerald-700' : 'text-slate-600'}`}>{status}</span>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-300 shadow-sm" title="Automatically reconnect if connection drops">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={autoReconnect}
                            onChange={(e) => handleToggleAutoReconnect(e.target.checked)}
                        />
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 relative"></div>
                        <span className="text-xs font-bold text-slate-600 select-none flex items-center gap-1">
                            <Repeat className="w-3 h-3 text-slate-400" /> Auto Reconnect
                        </span>
                    </label>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-300 shadow-sm" title="Automatically start cyclic reading when connected">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={autoRead}
                            onChange={(e) => handleToggleAutoRead(e.target.checked)}
                        />
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600 relative"></div>
                        <span className="text-xs font-bold text-slate-600 select-none flex items-center gap-1">
                            <Repeat className="w-3 h-3 text-slate-400" /> Auto Read
                        </span>
                    </label>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-300 shadow-sm" title="Automatically start all subscriptions when connected">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={autoSubscribe}
                            onChange={(e) => handleToggleAutoSubscribe(e.target.checked)}
                        />
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600 relative"></div>
                        <span className="text-xs font-bold text-slate-600 select-none flex items-center gap-1">
                            <Activity className="w-3 h-3 text-slate-400" /> Auto Sub
                        </span>
                    </label>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-300 shadow-sm" title="Automatically start scheduler when connected">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={autoSchedule}
                            onChange={(e) => handleToggleAutoSchedule(e.target.checked)}
                        />
                        <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 relative"></div>
                        <span className="text-xs font-bold text-slate-600 select-none flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" /> Auto Sched
                        </span>
                    </label>
                </div>
            </div>

            <button
                type="submit"
                className={`px-8 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-2 ${
                    isConnected || isConnecting
                    ? 'bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300' 
                    : 'bg-primary text-white hover:bg-slate-800 hover:shadow-md'
                } disabled:opacity-50`}
            >
                {isConnecting ? (
                    <><X className="w-4 h-4" /> {t.settings.actions.cancel}</>
                ) : isConnected ? (
                    <><WifiOff className="w-4 h-4" /> {t.connection.btn.disconnect}</>
                ) : (
                    <><Wifi className="w-4 h-4" /> {t.connection.btn.connect}</>
                )}
            </button>
        </div>
      </form>
    </div>
  );
};

export default ConnectionPanel;
