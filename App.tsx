
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { HelpModal } from './components/HelpModal';
import DropStatsModal from './components/DropStatsModal';
import SessionWorkspace from './components/SessionWorkspace';
import SystemLogPanel from './components/SystemLogPanel';
import SettingsModal from './components/SettingsModal';
import ProjectConfirmModal from './components/ProjectConfirmModal';
import { LayoutDashboard, HelpCircle, Plus, Server, X, Edit2, Check, Copy, ClipboardPaste, Trash2, MousePointer2, Power, Play, Square, Globe, BarChart3, FolderOpen, Save, FilePlus, Cloud, Settings, GripVertical } from 'lucide-react';
import { SessionInfo, ConnectionStatus, MessageSecurityMode, SecurityPolicy, AuthSettings, LogEntry, ProjectFile, SessionConfig, AppSettings, ConnectionOptions } from './types';
import { opcuaService } from './services/opcuaService';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { useProject } from './contexts/ProjectContext';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

function AppContent() {
  const { t, language, setLanguage } = useLanguage();
  const { registerOpcUaGetter, setDirty, isDirty } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // App Global Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>({
      general: { language: 'zh', autoConnect: false, theme: 'light' },
      opcua: { applicationName: 'ReactOPCUAClient', defaultRequestTimeout: 10000, defaultKeepAliveInterval: 5000, reconnectDelay: 5000 },
      paths: { pkiRoot: '', logsDir: '' }
  });
  const appSettingsRef = useRef(appSettings); 

  useEffect(() => { appSettingsRef.current = appSettings; }, [appSettings]);

  // Apply Theme
  useEffect(() => {
    if (appSettings.general.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [appSettings.general.theme]);

  const [sessions, setSessions] = useState<SessionInfo[]>([
    { 
        id: 'default', 
        name: 'PLC 1', 
        endpointUrl: 'opc.tcp://192.168.1.88:4840', 
        status: ConnectionStatus.DISCONNECTED,
        securityMode: MessageSecurityMode.None,
        securityPolicy: SecurityPolicy.None,
        authSettings: { mode: 'Anonymous', autoAcceptUnknownCert: true },
        autoReconnect: true,
        autoRead: false,
        autoSubscribe: false,
        autoSchedule: false,
        dropCount: 0,
        config: {
            rwGroups: [{ id: 'default-group', name: 'Group 1', nodes: [] }],
            subscriptions: [{
                viewIndex: 1,
                subscriptionId: 1001,
                publishingInterval: 500,
                lifetimeCount: 100,
                maxKeepAliveCount: 10,
                maxNotificationsPerPublish: 0,
                priority: 0,
                publishTimeout: 60000,
                samplingInterval: 500,
                queueSize: 10,
                discardOldest: true,
                items: [],
                status: 'Paused'
            }],
            trendGroups: [{ id: 'default-trend-group', name: 'Trend Group 1', nodes: [] }],
            schedulerGroups: [] 
        }
    }
  ]);
  
  // Register sessions getter for global save
  useEffect(() => {
      registerOpcUaGetter(() => sessions);
  }, [sessions, registerOpcUaGetter]);

  // Dirty Tracking
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
    }
    setDirty(true);
  }, [sessions, setDirty]);

  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set(['default']));
  const [lastClickedSessionId, setLastClickedSessionId] = useState<string | null>('default');
  const [clipboardSessions, setClipboardSessions] = useState<SessionInfo[] | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Local Project Confirmation State (Only for local "New/Open" actions inside app)
  const [isProjectConfirmOpen, setIsProjectConfirmOpen] = useState(false);
  const [pendingProjectAction, setPendingProjectAction] = useState<'NEW' | 'OPEN' | null>(null);

  const [createCount, setCreateCount] = useState(1);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((level: LogEntry['level'], message: string, sessionName?: string) => {
      const newLog: LogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          level,
          message,
          sessionName
      };
      setLogs(prev => [...prev, newLog].slice(-500)); 
      const prefix = sessionName ? `[${sessionName}]` : '[System]';
      if (level === 'error') console.error(`${prefix} ${message}`);
      else console.log(`${prefix} ${message}`);
  }, []);

  const handleUpdateSession = useCallback((sessionId: string, updates: Partial<SessionInfo>) => {
      setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s;
          
          // If the user edits connection settings while in ERROR state, abort auto-reconnect
          // by setting status to DISCONNECTED.
          const isConnectionSettingChanged = updates.endpointUrl !== undefined || 
                                             updates.securityMode !== undefined || 
                                             updates.securityPolicy !== undefined || 
                                             updates.authSettings !== undefined;
                                             
          if (s.status === ConnectionStatus.ERROR && isConnectionSettingChanged) {
              return { ...s, ...updates, status: ConnectionStatus.DISCONNECTED, lastError: undefined };
          }
          
          return { ...s, ...updates };
      }));
  }, []);

  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const handleConnectSession = useCallback(async (
      id: string, 
      endpointUrl?: string, 
      securityMode?: MessageSecurityMode, 
      securityPolicy?: SecurityPolicy, 
      auth?: AuthSettings,
      options?: ConnectionOptions
  ) => {
      const attemptId = Math.random().toString(36).substr(2, 9);
      // FIX: Use ref to avoid stale closure during async/timeout calls
      const session = sessionsRef.current.find(s => s.id === id);
      
      if (!session || session.status === ConnectionStatus.CONNECTED || session.status === ConnectionStatus.CONNECTING) return;

      const targetUrl = (endpointUrl || session.endpointUrl).trim();
      const targetMode = securityMode || session.securityMode;
      const targetPolicy = securityPolicy || session.securityPolicy;
      const targetAuth = auth || session.authSettings;

      setSessions(prev => prev.map(s => s.id === id ? { 
          ...s, 
          status: ConnectionStatus.CONNECTING, 
          endpointUrl: targetUrl,
          securityMode: targetMode,
          securityPolicy: targetPolicy,
          authSettings: targetAuth,
          connectionOptions: options, 
          lastError: undefined,
          pendingAttemptId: attemptId 
      } : s));

      addLog('info', `Connecting to ${targetUrl}...`, session.name);

      try {
          const { backendId, secureChannelId, sessionNodeId } = await opcuaService.connect(
              targetUrl, targetMode, targetPolicy, targetAuth, { ...options, sessionName: session.name }
          );
          
          setSessions(current => {
              const currentSession = current.find(s => s.id === id);
              if (!currentSession || currentSession.pendingAttemptId !== attemptId) {
                  addLog('warn', `Connection attempt obsolete. Disconnecting zombie backend session...`, session.name);
                  opcuaService.disconnect(backendId);
                  return current;
              }

              return current.map(s => s.id === id ? { 
                  ...s, 
                  status: ConnectionStatus.CONNECTED, 
                  lastError: undefined,
                  backendId: backendId,
                  secureChannelId: secureChannelId,
                  sessionNodeId: sessionNodeId,
                  pendingAttemptId: undefined 
              } : s);
          });
          addLog('success', `Session Active. Channel ID: ${secureChannelId}`, session.name);
      } catch (error: any) {
          const errMsg = error instanceof Error ? error.message : String(error);
          
          // Check if the attempt was cancelled before proceeding
          const currentSession = sessionsRef.current.find(s => s.id === id);
          if (!currentSession || currentSession.pendingAttemptId !== attemptId) {
              addLog('warn', `Connection attempt cancelled. Ignoring error: ${errMsg}`, session.name);
              return;
          }

          setSessions(current => {
              return current.map(s => s.id === id ? { 
                  ...s, 
                  status: ConnectionStatus.ERROR, 
                  lastError: errMsg,
                  pendingAttemptId: undefined
              } : s);
          });
          addLog('error', `Connection failed: ${errMsg}`, session.name);

          // Auto-reconnect on connection failure
          // Use sessionsRef to get the latest autoReconnect state, fallback to initial session state
          const latestSession = sessionsRef.current.find(s => s.id === id);
          const isAutoReconnect = latestSession ? latestSession.autoReconnect : session.autoReconnect;
          
          if (isAutoReconnect) {
              const delay = appSettingsRef.current.opcua.reconnectDelay || 5000;
              addLog('warn', `Auto-reconnecting in ${delay/1000}s...`, session.name);
              
              setTimeout(() => {
                  const freshSession = sessionsRef.current.find(s => s.id === id);
                  if (freshSession && freshSession.status === ConnectionStatus.ERROR && freshSession.autoReconnect) {
                      handleConnectSession(freshSession.id);
                  }
              }, delay);
          }
      }
  }, [addLog]); // Removed 'sessions' dependency to prevent unnecessary recreations and stale closures

  useEffect(() => {
      const removeListener = opcuaService.onDrop((droppedBackendId) => {
          const currentSessions = sessionsRef.current;
          const session = currentSessions.find(s => s.backendId === droppedBackendId);
          if (!session) return;
          
          setSessions(prev => prev.map(s => {
              if (s.id === session.id) {
                   return {
                       ...s,
                       status: ConnectionStatus.ERROR,
                       dropCount: s.dropCount + 1,
                       lastError: 'Connection lost. Reconnecting...'
                   };
              }
              return s;
          }));
          
          addLog('error', 'Connection dropped by server.', session.name);
          
          if (session.autoReconnect) {
              const delay = appSettingsRef.current.opcua.reconnectDelay || 5000;
              addLog('warn', `Auto-reconnecting in ${delay/1000}s...`, session.name);
              
              setTimeout(() => {
                  // FIX: Use sessionsRef to check latest status, avoiding stale state from closure
                  const freshSession = sessionsRef.current.find(s => s.id === session.id);
                  if (freshSession && freshSession.status === ConnectionStatus.ERROR) {
                      handleConnectSession(freshSession.id);
                  }
              }, delay);
          }
      });
      return () => { removeListener(); };
  }, [addLog, handleConnectSession]); 

  useEffect(() => {
      const initSettings = async () => {
          if (isElectron) {
              try {
                  const res = await (window as any).electronAPI.loadSettings();
                  if (res.success && res.settings) {
                      if (res.settings.general?.language) setLanguage(res.settings.general.language);
                      setAppSettings(res.settings);
                      addLog('info', 'Loaded application settings from disk.');
                  }
              } catch (e) { console.error("Failed to load settings", e); }
          }
      };
      initSettings();
  }, []);

  const handleSaveSettings = async (newSettings: AppSettings) => {
      setAppSettings(newSettings);
      if (isElectron) {
          const res = await (window as any).electronAPI.saveSettings(newSettings);
          if (res.success) addLog('success', 'Application settings saved to disk.');
          else addLog('error', `Failed to save settings: ${res.error}`);
      }
  };

  const performNewProject = () => {
      initialLoadRef.current = true;
      const defaultSession: SessionInfo = { 
          id: Math.random().toString(36).substr(2, 9), 
          name: 'PLC 1', 
          endpointUrl: 'opc.tcp://192.168.1.88:4840', 
          status: ConnectionStatus.DISCONNECTED,
          securityMode: MessageSecurityMode.None,
          securityPolicy: SecurityPolicy.None,
          authSettings: { mode: 'Anonymous', autoAcceptUnknownCert: true },
          autoReconnect: true,
          autoRead: false,
          autoSubscribe: false,
          autoSchedule: false,
          dropCount: 0,
          config: {
            rwGroups: [{ id: Math.random().toString(36).substr(2, 9), name: 'Group 1', nodes: [] }],
            subscriptions: [{
                viewIndex: 1,
                subscriptionId: 1001,
                publishingInterval: 500,
                lifetimeCount: 100,
                maxKeepAliveCount: 10,
                maxNotificationsPerPublish: 0,
                priority: 0,
                publishTimeout: 60000,
                samplingInterval: 500,
                queueSize: 10,
                discardOldest: true,
                items: [],
                status: 'Paused'
            }],
            trendGroups: [{ id: Math.random().toString(36).substr(2, 9), name: 'Trend Group 1', nodes: [] }],
            schedulerGroups: [] 
          }
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultSession.id);
      setSelectedSessionIds(new Set([defaultSession.id]));
      setLogs([]);
      setDirty(false);
      addLog('success', 'New project created.');
  };

  const performOpenProject = async () => {
      if (isElectron) {
          const res = await (window as any).electronAPI.openProject();
          if (res.success && res.data) {
              try {
                  const data: ProjectFile = JSON.parse(res.data);
                  if (Array.isArray(data.sessions)) {
                      initialLoadRef.current = true;
                      setSessions(data.sessions);
                      if (data.sessions.length > 0) setActiveSessionId(data.sessions[0].id);
                      setDirty(false);
                      addLog('success', `Project loaded from ${res.filePath}`);
                  }
              } catch (e) { addLog('error', 'Failed to parse project file.'); }
          }
      } else {
          fileInputRef.current?.click();
      }
  };

  // Local save logic (OPC UA only, legacy button)
  const handleSaveProjectLocal = async () => {
      addLog('info', 'Saving project...');
      // Yield to browser to render the log message and prevent UI freeze
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
          const projectData: ProjectFile = {
              version: "2.4.0",
              timestamp: new Date().toISOString(),
              sessions: sessions.map(s => ({
                  ...s,
                  status: ConnectionStatus.DISCONNECTED, 
                  dropCount: 0,
                  backendId: undefined, 
                  secureChannelId: undefined,
                  sessionNodeId: undefined,
                  pendingAttemptId: undefined 
              }))
          };
          
          // Use unformatted JSON to improve performance and reduce memory usage for large projects
          const jsonStr = JSON.stringify(projectData, (key, value) => typeof value === 'bigint' ? value.toString() : value);
          
          if (isElectron) {
              const res = await (window as any).electronAPI.saveProject(jsonStr);
              if (res.success) {
                  setDirty(false);
                  addLog('success', `Project saved to ${res.filePath}`);
                  return true;
              } else if (res.error) {
                  addLog('error', `Save failed: ${res.error}`);
              }
          } else {
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `opcua_project_${new Date().getTime()}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setDirty(false);
              addLog('success', 'Project downloaded as JSON.');
              return true;
          }
      } catch (err: any) {
          addLog('error', `Save failed: ${err.message}`);
      }
      return false;
  };

  const handleNewProjectRequest = () => {
      if (isDirty()) {
          setPendingProjectAction('NEW');
          setIsProjectConfirmOpen(true);
      } else {
          performNewProject();
      }
  };

  const handleOpenProjectRequest = () => {
      if (isDirty()) {
          setPendingProjectAction('OPEN');
          setIsProjectConfirmOpen(true);
      } else {
          performOpenProject();
      }
  };

  const handleWebFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const text = evt.target?.result as string;
              const data: ProjectFile = JSON.parse(text);
               if (Array.isArray(data.sessions)) {
                  initialLoadRef.current = true;
                  setSessions(data.sessions);
                  if (data.sessions.length > 0) setActiveSessionId(data.sessions[0].id);
                  setDirty(false);
                  addLog('success', `Project loaded from ${file.name}`);
              }
          } catch (err) { addLog('error', 'Invalid project file format.'); }
      };
      reader.readAsText(file);
      e.target.value = ''; 
  };

  const handleUpdateSessionConfig = useCallback((sessionId: string, newConfig: Partial<SessionConfig>) => {
      setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s;
          const currentConfig = s.config || { rwGroups: [], subscriptions: [], trendGroups: [], schedulerGroups: [] };
          return {
              ...s,
              config: {
                  ...currentConfig,
                  ...newConfig
              }
          };
      }));
  }, []);

  const handleDisconnectSession = useCallback(async (id: string) => {
      const session = sessions.find(s => s.id === id);
      if (!session) return;
      addLog('info', 'Disconnecting session...', session.name);
      if (session.backendId) await opcuaService.disconnect(session.backendId);
      setSessions(prev => prev.map(s => s.id === id ? { 
          ...s, 
          status: ConnectionStatus.DISCONNECTED, 
          lastError: undefined,
          backendId: undefined,
          secureChannelId: undefined,
          sessionNodeId: undefined,
          pendingAttemptId: undefined 
      } : s));
      addLog('success', 'Session disconnected.', session.name);
  }, [sessions, addLog]);

  const handleConnectAll = () => {
      sessions.forEach(s => {
          if (s.status === ConnectionStatus.DISCONNECTED || s.status === ConnectionStatus.ERROR) {
              handleConnectSession(s.id);
          }
      });
  };

  const handleDisconnectAll = () => {
      sessions.forEach(s => {
          if (s.status === ConnectionStatus.CONNECTED || s.status === ConnectionStatus.CONNECTING) {
              handleDisconnectSession(s.id);
          }
      });
  };

  const handleResetDropCounts = () => {
      setSessions(prev => prev.map(s => ({ ...s, dropCount: 0 })));
      addLog('info', 'All drop counters have been reset to zero.');
  };

  const handleSingleDelete = (e: React.MouseEvent | undefined, id: string) => {
      if (e) e.stopPropagation();
      const session = sessions.find(s => s.id === id);
      if (session?.status === ConnectionStatus.CONNECTED && session.backendId) {
          opcuaService.disconnect(session.backendId);
      }
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length === 0) {
          performNewProject();
      } else {
          setSessions(remaining);
          if (activeSessionId === id) setActiveSessionId(remaining[0].id);
          if (selectedSessionIds.has(id)) {
              const newSel = new Set(selectedSessionIds);
              newSel.delete(id);
              setSelectedSessionIds(newSel);
          }
      }
  };

  const handleSessionClick = (e: React.MouseEvent, sessionId: string, index: number) => {
      setActiveSessionId(sessionId);
      const newSelected = new Set(selectedSessionIds);
      if (e.ctrlKey || e.metaKey) {
          if (newSelected.has(sessionId)) newSelected.delete(sessionId);
          else newSelected.add(sessionId);
          setLastClickedSessionId(sessionId);
      } else if (e.shiftKey && lastClickedSessionId) {
          const allIds = sessions.map(s => s.id);
          const lastIdx = allIds.indexOf(lastClickedSessionId);
          if (lastIdx !== -1) {
              const start = Math.min(lastIdx, index);
              const end = Math.max(lastIdx, index);
              newSelected.clear();
              for(let i=start; i<=end; i++) newSelected.add(allIds[i]);
          }
      } else {
          newSelected.clear();
          newSelected.add(sessionId);
          setLastClickedSessionId(sessionId);
      }
      setSelectedSessionIds(newSelected);
  };

  const executeBatchCreate = (count: number) => {
    const qty = Math.max(1, Math.min(count, 50));
    const newSessions: SessionInfo[] = [];
    const startIdx = sessions.length + 1;
    for (let i = 0; i < qty; i++) {
        newSessions.push({
            id: Math.random().toString(36).substr(2, 9),
            name: `Session ${startIdx + i}`,
            endpointUrl: 'opc.tcp://192.168.1.88:4840',
            status: ConnectionStatus.DISCONNECTED,
            securityMode: MessageSecurityMode.None,
            securityPolicy: SecurityPolicy.None,
            authSettings: { mode: 'Anonymous', autoAcceptUnknownCert: true },
            autoReconnect: true,
            autoRead: false,
            autoSubscribe: false,
            autoSchedule: false,
            dropCount: 0,
            config: {
                rwGroups: [{ id: Math.random().toString(36).substr(2, 9), name: 'Group 1', nodes: [] }],
                subscriptions: [{
                    viewIndex: 1,
                    subscriptionId: 1000 + i + 1,
                    publishingInterval: 500,
                    lifetimeCount: 100,
                    maxKeepAliveCount: 10,
                    maxNotificationsPerPublish: 0,
                    priority: 0,
                    publishTimeout: 60000,
                    samplingInterval: 500,
                    queueSize: 10,
                    discardOldest: true,
                    items: [],
                    status: 'Paused'
                }],
                trendGroups: [{ id: Math.random().toString(36).substr(2, 9), name: 'Trend Group 1', nodes: [] }],
                schedulerGroups: [] 
            }
        });
    }
    setSessions(prev => [...prev, ...newSessions]);
    setActiveSessionId(newSessions[0].id);
    setSelectedSessionIds(new Set(newSessions.map(s => s.id)));
  };

  const handleBatchCreate = () => executeBatchCreate(createCount);

  const handleDuplicateSession = (target: 'first' | 'current' | 'all', count: number) => {
      let targets: SessionInfo[] = [];
      if (target === 'first' && sessions.length > 0) targets = [sessions[0]];
      else if (target === 'current') {
          const current = sessions.find(s => s.id === activeSessionId);
          if (current) targets = [current];
      } else if (target === 'all') targets = [...sessions];

      if (targets.length === 0) return;
      const newSessions: SessionInfo[] = [];
      const qty = Math.max(1, Math.min(count, 50)); 

      targets.forEach(template => {
          for (let i = 0; i < qty; i++) {
              newSessions.push({
                  ...template,
                  id: Math.random().toString(36).substr(2, 9),
                  name: `${template.name} (Copy ${i+1})`,
                  status: ConnectionStatus.DISCONNECTED,
                  dropCount: 0,
                  lastError: undefined,
                  backendId: undefined, 
                  secureChannelId: undefined,
                  sessionNodeId: undefined,
                  config: JSON.parse(JSON.stringify(template.config || {}, (key, value) => typeof value === 'bigint' ? value.toString() : value)) 
              });
          }
      });
      setSessions(prev => [...prev, ...newSessions]);
      if (newSessions.length > 0) {
          setActiveSessionId(newSessions[0].id);
          setSelectedSessionIds(new Set(newSessions.map(s => s.id)));
      }
  };

  const handleCopySessions = () => {
      if (selectedSessionIds.size === 0) return;
      const toCopy = sessions.filter(s => selectedSessionIds.has(s.id));
      setClipboardSessions(toCopy);
      addLog('info', `Copied ${toCopy.length} sessions to clipboard.`);
  };

  const handlePasteSessions = () => {
      if (!clipboardSessions || clipboardSessions.length === 0) return;
      const existingNames = new Set(sessions.map(s => s.name));
      const newSessions = clipboardSessions.map(tpl => {
          let baseName = `${tpl.name} (Copy)`;
          let newName = baseName;
          let counter = 1;
          while (existingNames.has(newName)) { counter++; newName = `${baseName} ${counter}`; }
          existingNames.add(newName);
          return {
              ...tpl,
              id: Math.random().toString(36).substr(2, 9),
              name: newName,
              status: ConnectionStatus.DISCONNECTED,
              lastError: undefined,
              dropCount: 0,
              backendId: undefined,
              secureChannelId: undefined,
              sessionNodeId: undefined,
              config: JSON.parse(JSON.stringify(tpl.config || {}, (key, value) => typeof value === 'bigint' ? value.toString() : value))
          };
      });
      setSessions(prev => [...prev, ...newSessions]);
      setActiveSessionId(newSessions[0].id);
      setSelectedSessionIds(new Set(newSessions.map(s => s.id)));
  };

  const handleBatchDelete = () => {
      if (selectedSessionIds.size === 0) return;
      sessions.forEach(s => {
          if (selectedSessionIds.has(s.id) && s.status === ConnectionStatus.CONNECTED && s.backendId) {
              opcuaService.disconnect(s.backendId);
          }
      });
      const remaining = sessions.filter(s => !selectedSessionIds.has(s.id));
      if (remaining.length === 0) performNewProject();
      else {
          setSessions(remaining);
          if (selectedSessionIds.has(activeSessionId)) setActiveSessionId(remaining[0].id);
          setSelectedSessionIds(new Set());
      }
  };

  const startEditing = (e: React.MouseEvent, session: SessionInfo) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditName(session.name);
  };

  const saveName = () => {
    if (editingSessionId && editName.trim()) {
      setSessions(prev => prev.map(s => s.id === editingSessionId ? { ...s, name: editName.trim() } : s));
    }
    setEditingSessionId(null);
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.CONNECTED: return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
      case ConnectionStatus.CONNECTING: return 'bg-amber-400 animate-pulse';
      case ConnectionStatus.ERROR: return 'bg-red-500';
      default: return 'bg-slate-600';
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-100 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <DropStatsModal isOpen={isStatsOpen} onClose={() => setIsStatsOpen(false)} sessions={sessions} onResetCounts={handleResetDropCounts} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={handleSaveSettings} appSettings={appSettings} />
      {/* ProjectConfirmModal is now handled by MainShell, but we can keep one here for local "New Project" actions if needed, or remove it. 
          Currently kept but logic for global close is moved up. 
      */}
      <ProjectConfirmModal 
          isOpen={isProjectConfirmOpen} 
          onChoice={async (choice) => {
              setIsProjectConfirmOpen(false);
              if (choice === 'CANCEL') return;
              
              if (choice === 'YES') {
                  const saved = await handleSaveProjectLocal();
                  if (!saved) return;
              }
              
              if (pendingProjectAction === 'NEW') {
                  performNewProject();
              } else if (pendingProjectAction === 'OPEN') {
                  performOpenProject();
              }
              setPendingProjectAction(null);
          }} 
      />

      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleWebFileUpload} />

      <div className="flex-1 flex h-full w-full overflow-hidden">
        <div className="w-80 bg-slate-900 flex flex-col border-r border-slate-800 z-30 shadow-xl pb-0 shrink-0">
          <div className="h-14 flex items-center px-4 font-bold tracking-wide text-white border-b border-slate-800 gap-2 bg-slate-950 shadow-sm shrink-0">
             <div className="p-1.5 bg-sky-600 rounded">
                <LayoutDashboard className="w-4 h-4 text-white" />
             </div>
             <span className="truncate">{t.app.title}</span>
             <button onClick={handleNewProjectRequest} className="ml-auto p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title="New Project">
                 <Plus className="w-4 h-4" />
             </button>
          </div>
          
          <div className="flex bg-slate-900 border-b border-slate-800 p-2 gap-2 shrink-0">
             <button onClick={handleNewProjectRequest} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 overflow-hidden">
                 <FilePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                 <span className="text-xs font-bold truncate">New</span>
             </button>
             <button onClick={handleOpenProjectRequest} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 overflow-hidden">
                 <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                 <span className="text-xs font-bold truncate">Open</span>
             </button>
             <button onClick={handleSaveProjectLocal} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 overflow-hidden">
                 <Save className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                 <span className="text-xs font-bold truncate">Save</span>
             </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
             <div className="px-4 pb-2 text-[10px] font-bold uppercase text-slate-500 tracking-wider flex justify-between items-center select-none">
                 <div className="flex items-center gap-1">
                     <MousePointer2 className="w-3 h-3" />
                     <span>{t.app.sessions}</span>
                 </div>
                 <div className="flex gap-2">
                    {selectedSessionIds.size > 0 && <span className="bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded-full">{selectedSessionIds.size} Sel</span>}
                    <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{sessions.length}</span>
                 </div>
             </div>
             
             <div className="space-y-1 px-2 select-none">
                 {sessions.map((session, idx) => {
                     const isSelected = selectedSessionIds.has(session.id);
                     const isActive = activeSessionId === session.id;
                     return (
                     <div 
                        key={session.id}
                        onClick={(e) => handleSessionClick(e, session.id, idx)}
                        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                            isActive ? 'bg-slate-800 border-slate-700 shadow-md ring-1 ring-white/10' : 'border-transparent hover:bg-slate-800/50 hover:border-slate-800'
                        } ${isSelected && !isActive ? 'ring-1 ring-sky-500/50 bg-sky-900/10' : ''}`}
                     >
                         {isActive && <div className="absolute left-0 top-2 bottom-2 w-1 bg-sky-500 rounded-r-full"></div>}
                         <div className="flex items-center gap-3 truncate flex-1 min-w-0 pl-1">
                             <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${getStatusColor(session.status)}`} title={session.status}></div>
                             {editingSessionId === session.id ? (
                                <input 
                                  autoFocus
                                  className="w-full bg-slate-950 text-white text-sm px-1 py-0.5 rounded border border-sky-500 outline-none"
                                  value={editName}
                                  onChange={e => setEditName(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                  onBlur={saveName}
                                  onKeyDown={e => e.key === 'Enter' && saveName()}
                                />
                             ) : (
                                <div className="flex flex-col truncate">
                                    <span className={`text-sm font-medium truncate transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{session.name}</span>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-600 truncate uppercase">{session.status}</span>
                                        {session.dropCount > 0 && <span className="text-[10px] text-amber-500 font-bold ml-2 shrink-0">Drops: {session.dropCount}</span>}
                                    </div>
                                    {session.status === ConnectionStatus.CONNECTED && (
                                        <div className={`text-[9px] font-mono truncate mt-0.5 opacity-70 ${isActive ? 'text-sky-300' : 'text-slate-50'}`} title={`Channel ID: ${session.secureChannelId ?? 'N/A'}\nSession ID: ${session.sessionNodeId}`}>Channel ID: {session.secureChannelId ?? 'N/A'}</div>
                                    )}
                                </div>
                             )}
                         </div>
                         <div className="flex items-center gap-1 pl-2 shrink-0">
                            {editingSessionId === session.id ? (
                                <button onClick={(e) => { e.stopPropagation(); saveName(); }} className="p-1 text-emerald-400 hover:bg-emerald-900/30 rounded"><Check className="w-3.5 h-3.5" /></button>
                            ) : (
                                <>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (session.status === ConnectionStatus.CONNECTED) handleDisconnectSession(session.id);
                                            else handleConnectSession(session.id);
                                        }}
                                        className={`p-1.5 rounded transition-all ${
                                            session.status === ConnectionStatus.CONNECTED ? 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-900/20' : 
                                            session.status === ConnectionStatus.CONNECTING ? 'text-amber-500 animate-pulse' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-700'
                                        }`}
                                    >
                                        <Power className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={(e) => startEditing(e, session)} className={`hidden group-hover:block p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white`}><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={(e) => handleSingleDelete(e, session.id)} className={`hidden group-hover:block p-1.5 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-500`}><X className="w-3.5 h-3.5" /></button>
                                </>
                            )}
                         </div>
                     </div>
                 )})}
             </div>
          </div>

          <div className="p-3 border-t border-slate-800 bg-slate-950 gap-2 flex flex-col shrink-0">
              <div className="grid grid-cols-2 gap-2 mb-1">
                  <button onClick={handleConnectAll} className="flex items-center justify-center gap-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-500 border border-emerald-900/50 py-1.5 rounded text-xs font-bold transition-all overflow-hidden"><Play className="w-3.5 h-3.5 fill-current shrink-0" /> <span className="truncate">{t.app.connectAll}</span></button>
                  <button onClick={handleDisconnectAll} className="flex items-center justify-center gap-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/50 py-1.5 rounded text-xs font-bold transition-all overflow-hidden"><Square className="w-3.5 h-3.5 fill-current shrink-0" /> <span className="truncate">{t.app.stopAll}</span></button>
              </div>
              <div className="flex flex-wrap items-center gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
                  <div className="flex-1 flex items-center gap-1 px-1 min-w-[80px]">
                      <span className="text-xs text-slate-500 font-bold truncate">{t.app.batchQty}</span>
                      <input type="number" min="1" max="10" value={createCount} onChange={e => setCreateCount(Number(e.target.value))} className="w-12 bg-slate-800 text-slate-300 text-xs text-center border border-slate-700 rounded h-6 shrink-0" />
                  </div>
                  <div className="w-px h-4 bg-slate-700 mx-1 hidden sm:block"></div>
                  <div className="flex items-center gap-1 justify-end">
                      <button onClick={handleBatchCreate} className="p-1.5 text-sky-500 hover:bg-slate-800 rounded transition-colors shrink-0"><Plus className="w-4 h-4" /></button>
                      <button onClick={handleCopySessions} disabled={selectedSessionIds.size === 0} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-30 shrink-0"><Copy className="w-4 h-4" /></button>
                      <button onClick={handlePasteSessions} disabled={!clipboardSessions} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-30 shrink-0"><ClipboardPaste className="w-4 h-4" /></button>
                      <button onClick={handleBatchDelete} disabled={selectedSessionIds.size === 0} className="p-1.5 text-red-500 hover:bg-slate-800 rounded transition-colors disabled:opacity-30 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
              </div>
              <div className="flex gap-2 mt-1">
                 <button onClick={() => setIsHelpOpen(true)} className="flex items-center justify-center w-10 py-2 text-slate-500 hover:text-slate-300 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800 shrink-0" title={t.app.help}><HelpCircle className="w-4 h-4" /></button>
                 <button onClick={() => setIsSettingsOpen(true)} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-slate-500 hover:text-blue-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800 overflow-hidden" title={t.app.settings}><Settings className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{t.app.settings}</span></button>
                 <button onClick={() => setIsStatsOpen(true)} className="flex items-center justify-center w-10 py-2 text-slate-500 hover:text-amber-400 hover:bg-slate-900 rounded-lg text-xs transition-colors border border-transparent hover:border-slate-800 shrink-0" title={t.app.stats}><BarChart3 className="w-4 h-4" /></button>
              </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative min-w-0">
            {sessions.map(session => (
                <div key={session.id} className={`absolute inset-0 w-full h-full pb-9 ${activeSessionId === session.id ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'}`}>
                    <SessionWorkspace 
                        isVisible={activeSessionId === session.id} 
                        session={session}
                        addLog={(level, msg) => addLog(level, msg, session.name)}
                        logs={logs} 
                        onConnect={(endpoint, mode, policy, auth, options) => { handleConnectSession(session.id, endpoint, mode, policy, auth, options); }}
                        onDisconnect={() => handleDisconnectSession(session.id)}
                        onUpdateSessionConfig={handleUpdateSessionConfig}
                        onUpdateSession={(updates) => handleUpdateSession(session.id, updates)}
                        onCreateSessions={executeBatchCreate}
                        onDeleteSession={(id) => handleSingleDelete(undefined, id)}
                        onDeleteAllSessions={handleBatchDelete}
                        onDuplicateSession={handleDuplicateSession}
                    />
                </div>
            ))}
            <SystemLogPanel logs={logs} onClear={() => setLogs([])} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // App is wrapped by ProjectProvider in MainShell, so we can use hooks here
  return (
    <AppContent />
  );
}
