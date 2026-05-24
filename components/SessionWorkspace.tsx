
import React, { useState, useCallback, useRef, useEffect } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ReadWritePanel from './ReadWritePanel';
import SubscriptionPanel from './SubscriptionPanel';
import BrowserPanel from './BrowserPanel';
import DashboardPanel from './DashboardPanel';
import TrendPanel from './TrendPanel';
import EventPanel from './EventPanel';
import SchedulerPanel from './SchedulerPanel'; 
import CopilotWidget from './CopilotWidget'; 
import ChaosPanel from './ChaosPanel'; 

import { ConnectionStatus, ReferenceDescription, OpcNode, SessionInfo, AuthSettings, MessageSecurityMode, SecurityPolicy, SessionConfig, BatchGroup, Subscription, ConnectionOptions, MonitoredItem, SchedulerGroup, CopilotInsight, PendingAIAction, LogEntry, OpcDataType } from '../types';
import { LayoutList, Activity, Wifi, WifiOff, ChevronDown, ChevronUp, FolderTree, Gauge, TrendingUp, Bell, ArrowRightLeft, Skull, LayoutDashboard } from 'lucide-react'; 
import { useLanguage } from '../contexts/LanguageContext';
import { analyzeLog } from '../services/aiKnowledgeBase'; 

interface SessionWorkspaceProps {
  isVisible: boolean; 
  session: SessionInfo;
  addLog: (level: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
  logs?: LogEntry[];
  onConnect: (endpoint: string, securityMode: MessageSecurityMode, securityPolicy: SecurityPolicy, auth: AuthSettings, options?: ConnectionOptions) => void;
  onDisconnect: () => void;
  onUpdateSessionConfig: (sessionId: string, config: Partial<SessionConfig>) => void;
  onUpdateSession: (updates: Partial<SessionInfo>) => void; 
  onCreateSessions?: (count: number) => void;
  onDeleteSession?: (sessionId: string) => void;
  onDeleteAllSessions?: () => void;
  onDuplicateSession?: (target: 'first' | 'current' | 'all', count: number) => void; 
}

type ViewMode = 'DASHBOARD' | 'READ_WRITE' | 'SUBSCRIPTION' | 'BROWSER' | 'TREND' | 'EVENTS' | 'SCHEDULER' | 'CHAOS'; 

const getDefaultValueForType = (type?: string, valueRank?: number, arrayDimensions?: any): any => {
    const getScalar = (t: string) => {
        const base = t.includes('[') ? t.split('[')[0] : t;
        switch (base) {
            case 'Boolean': return false;
            case 'SByte':
            case 'Byte':
            case 'Int16':
            case 'UInt16':
            case 'Int32':
            case 'UInt32': return 0;
            case 'Int64':
            case 'UInt64': return 0n; 
            case 'Float':
            case 'Double': return 0.0;
            case 'String': return "";
            case 'DateTime': return new Date().toISOString();
            default: return 0;
        }
    };
    
    const scalar = getScalar(type || 'Int32');
    
    // Robust Multi-Dimensional Array Generation
    const rank = Number(valueRank);
    if (!isNaN(rank) && rank >= 1) {
        try {
            let dims: number[] = [];
            
            // 1. Robust Parsing (Handle TypedArrays, Arrays, Strings)
            if (arrayDimensions) {
                // Ensure we convert TypedArrays/Proxies to plain array
                if (Array.isArray(arrayDimensions) || ArrayBuffer.isView(arrayDimensions)) {
                    dims = Array.from(arrayDimensions as any).map(Number);
                } else if (typeof arrayDimensions === 'string' && arrayDimensions.trim().length > 0) {
                    dims = arrayDimensions.split(',').map(s => Number(s.trim()));
                } else if (typeof arrayDimensions === 'number') {
                    dims = [arrayDimensions];
                }
            }

            // Filter out NaNs and ensure valid numbers
            dims = dims.filter(n => typeof n === 'number' && !isNaN(n) && n > 0);

            // 2. Intelligent Defaulting
            // FIX: If dimensions exist, trust them even if rank mismatches. Only guess if dims is empty.
            if (dims.length === 0 && rank > 0) {
                if (rank === 1) dims = [5];
                else if (rank === 2) dims = [3, 3];
                else if (rank === 3) dims = [2, 2, 2];
                else dims = Array(rank).fill(2); 
            } else if (dims.length > 0) {
                // Dimensions found, use them as is.
                // Replace 0 dimensions (variable length) with a default visual size
                dims = dims.map(d => d === 0 ? 3 : d);
            }

            // 3. Recursive Array Builder
            const createNestedArray = (d: number[], depth: number): any => {
                // Safety cap to prevent browser freeze
                let size = Math.floor(d[depth]);
                if (isNaN(size) || size < 1) size = 1;
                if (size > 200) size = 200; 

                if (depth === d.length - 1) {
                    return new Array(size).fill(scalar);
                }
                return Array.from({ length: size }, () => createNestedArray(d, depth + 1));
            };

            // Safety check: ensure dims is valid before recursion
            if (dims.length > 0) {
                return createNestedArray(dims, 0);
            }
            return [scalar]; // Fallback 1D

        } catch (e) {
            console.error("Failed to generate complex array, falling back to rank-based default.", e);
            // Emergency fallback ensuring multidimensional structure
            if (rank === 2) return [[scalar, scalar], [scalar, scalar]];
            if (rank === 3) return [[[scalar, scalar]], [[scalar, scalar]]];
            return [scalar, scalar, scalar];
        }
    }
    
    return scalar;
};

const createOpcNode = (ref: ReferenceDescription, initValue: boolean = false): OpcNode => {
    let dataTypeStr = (ref.dataType as string) || 'Int32';
    
    // Explicitly append dimensions to dataType string (e.g. Int32[2,3])
    // This ensures downstream components display the correct signature without guessing.
    if (ref.valueRank && ref.valueRank >= 1) {
        let dimStr = '';
        if (ref.arrayDimensions) {
            // FIX: Robustly handle potential TypedArrays here too, though parsing logic above should catch it
            if (Array.isArray(ref.arrayDimensions) || ArrayBuffer.isView(ref.arrayDimensions)) {
                dimStr = Array.from(ref.arrayDimensions as any).join(',');
            } else if (typeof ref.arrayDimensions === 'string') {
                dimStr = ref.arrayDimensions;
            } else if (typeof ref.arrayDimensions === 'number') {
                dimStr = String(ref.arrayDimensions);
            }
        }
        
        // Even if dimStr is empty (variable length), we indicate array
        if (!dimStr) dimStr = ''; 

        // Clean up potentially existing brackets if re-wrapping (though rare here)
        const cleanType = dataTypeStr.includes('[') ? dataTypeStr.split('[')[0] : dataTypeStr;
        dataTypeStr = `${cleanType}[${dimStr}]`;
    }

    return {
        internalId: Math.random().toString(36).substr(2, 9),
        nodeId: ref.nodeId,
        displayName: ref.displayName,
        dataType: dataTypeStr as OpcDataType,
        value: initValue ? getDefaultValueForType(ref.dataType, ref.valueRank, ref.arrayDimensions) : null,
        statusCode: 'Good',
        sourceTimestamp: '-',
        lastRtt: undefined
    };
};

const NavTab = ({ mode, icon: Icon, label, colorClass, canDrop = false, currentMode, setViewMode, onDrop, dropHint }: any) => {
    const [isOver, setIsOver] = useState(false);
    return (
      <button 
          type="button"
          onClick={() => setViewMode(mode)} 
          onDragOver={(e) => { 
              if (canDrop) { e.preventDefault(); setIsOver(true); }
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={(e) => { 
              if (canDrop) { setIsOver(false); onDrop(e, mode); }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-bold transition-all relative top-[1px]
          ${currentMode === mode 
              ? `bg-white dark:bg-slate-900 border-t border-x border-slate-200 dark:border-slate-700 shadow-[0_-2px_5px_rgba(0,0,0,0.02)] ${colorClass} z-10` 
              : 'bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 z-0'}
          ${isOver ? 'ring-2 ring-inset ring-sky-400 bg-sky-50 dark:bg-sky-900/30 !text-sky-600 dark:!text-sky-400' : ''}
          `}
          title={canDrop ? dropHint : undefined}
      >
          <Icon className="w-4 h-4" /> {label}
      </button>
    );
};

const SessionWorkspace: React.FC<SessionWorkspaceProps> = ({ isVisible, session, addLog, logs, onConnect, onDisconnect, onUpdateSessionConfig, onUpdateSession, onCreateSessions, onDeleteSession, onDeleteAllSessions, onDuplicateSession }) => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState<ViewMode>('DASHBOARD'); 
  
  const [pendingRWNodes, setPendingRWNodes] = useState<OpcNode[]>([]);
  const [pendingSubNodes, setPendingSubNodes] = useState<OpcNode[]>([]);
  const [pendingTrendNodes, setPendingTrendNodes] = useState<OpcNode[]>([]);
  const [pendingSchedulerNodes, setPendingSchedulerNodes] = useState<{ nodes: OpcNode[], targetGroupId?: string, listType: 'source' | 'target' } | null>(null);
  
  const [existingRwIds, setExistingRwIds] = useState<Set<string>>(new Set());
  const [existingSubIds, setExistingSubIds] = useState<Set<string>>(new Set());
  const [existingTrendIds, setExistingTrendIds] = useState<Set<string>>(new Set());

  const [connPanelHeight, setConnPanelHeight] = useState(session.status === ConnectionStatus.CONNECTED ? 48 : 580);
  const [isCollapsed, setIsCollapsed] = useState(session.status === ConnectionStatus.CONNECTED); 
  const [insights, setInsights] = useState<CopilotInsight[]>([]);

  const handleAddLog = (level: 'info' | 'error' | 'success' | 'warn', msg: string) => {
      addLog(level, msg);
      if (level === 'error' || level === 'warn') {
          const insight = analyzeLog(msg);
          if (insight) {
              setInsights(prev => [...prev, insight]);
          }
      }
  };

  const status = session.status;
  const isConnected = status === ConnectionStatus.CONNECTED;

  const handleCopilotAction = (actionType: string, payload?: any) => {
      if (actionType === 'NAVIGATE') {
          if (payload === 'BROWSER') setViewMode('BROWSER');
          else if (payload === 'TREND') setViewMode('TREND');
          else if (payload === 'SCHEDULER') setViewMode('SCHEDULER');
          else if (payload === 'NAV_DASHBOARD') setViewMode('DASHBOARD');
          else if (payload === 'NAV_RW') setViewMode('READ_WRITE');
          else if (payload === 'NAV_SUB') setViewMode('SUBSCRIPTION');
          else if (payload === 'NAV_TREND') setViewMode('TREND');
          else if (payload === 'NAV_SCHEDULER') setViewMode('SCHEDULER');
          else if (payload === 'NAV_EVENTS') setViewMode('EVENTS');
          else if (payload === 'NAV_CHAOS') setViewMode('CHAOS');
          else if (payload) setViewMode(payload as ViewMode);
      }
      if (actionType === 'open_settings') {
          setConnPanelHeight(580);
          setIsCollapsed(false);
      }
      if (actionType === 'CONNECT') {
          onConnect(session.endpointUrl, session.securityMode, session.securityPolicy, session.authSettings, session.connectionOptions);
      }
      if (actionType === 'DISCONNECT') {
          if (isConnected) onDisconnect();
      }
      if (actionType === 'EXECUTE_PLAN') {
          const plan = payload as PendingAIAction;
          if (plan.type === 'CREATE_SESSION' || plan.type === 'CREATE_SESSIONS') {
              if (onCreateSessions) { onCreateSessions(plan.data.count || 1); addLog('success', `AI: Created ${plan.data.count || 1} new sessions.`); }
          }
          if (plan.type === 'DUPLICATE_SESSION') {
              if (onDuplicateSession) { onDuplicateSession(plan.data.target || 'current', plan.data.count || 1); addLog('success', `AI: Duplicating ${plan.data.target} session (${plan.data.count} copies).`); }
          }
          if (plan.type === 'DELETE_SESSION') {
              if (plan.data.target === 'current') { if (onDeleteSession) onDeleteSession(session.id); } else if (plan.data.target === 'all') { if (onDeleteAllSessions) onDeleteAllSessions(); }
          }
          if (plan.type === 'CONNECT_SESSION') { onConnect(session.endpointUrl, session.securityMode, session.securityPolicy, session.authSettings, session.connectionOptions); }
          if (plan.type === 'DISCONNECT_SESSION') { if (isConnected) onDisconnect(); }
          if (plan.type === 'ADD_NODE' || plan.type === 'ADD_RW_NODE') {
              const nodeId = plan.data.nodeId;
              const node: OpcNode = { internalId: `ai-${Date.now()}`, nodeId: nodeId, displayName: nodeId, dataType: 'Int32', value: 0, statusCode: 'Good', sourceTimestamp: '-' };
              setPendingRWNodes(prev => [...prev, node]);
              setViewMode('READ_WRITE');
              addLog('success', `AI: Added node ${nodeId} to Data Access.`);
          }
          if (plan.type === 'SETUP_DEMO') {
              const demoNodes: OpcNode[] = Array.from({length: 10}, (_, i) => ({ internalId: `auto-${i}`, nodeId: `ns=2;s=Demo.Tag${i}`, displayName: `Auto Tag ${i}`, dataType: 'Int32' as OpcDataType, value: 0, statusCode: 'Good', sourceTimestamp: new Date().toISOString() }));
              const subItems: MonitoredItem[] = demoNodes.map((n, i) => ({ ...n, clientHandle: 1000 + i, timestamp: '-', statusCode: 'Waiting' }));
              const newConfig: SessionConfig = {
                  rwGroups: [{ id: 'auto-rw-1', name: 'Auto Generated RW', nodes: demoNodes }],
                  subscriptions: [{ viewIndex: 1, subscriptionId: 2001, status: 'Paused', publishingInterval: 500, lifetimeCount: 100, maxKeepAliveCount: 10, maxNotificationsPerPublish: 0, priority: 0, publishTimeout: 60000, samplingInterval: 250, queueSize: 10, discardOldest: true, items: subItems }],
                  trendGroups: [{ id: 'auto-trend-1', name: 'Auto Trend', nodes: demoNodes.slice(0, 3) }],
                  schedulerGroups: [{ id: 'auto-sched-1', name: 'Auto Map', defaultInterval: 200, sourceList: demoNodes.slice(0, 2), targetList: demoNodes.slice(2, 4), tasks: [] }]
              };
              onUpdateSessionConfig(session.id, newConfig);
              onUpdateSession({ autoRead: true, autoSubscribe: true });
              addLog('success', 'AI: Demo project configuration applied successfully.');
              setViewMode('DASHBOARD');
          }
      }
  };

  const isResizingConn = useRef(false);
  const connStartY = useRef(0);
  const connStartHeight = useRef(0);
  
  const handleUpdateRwGroups = useCallback((groups: BatchGroup[]) => { onUpdateSessionConfig(session.id, { rwGroups: groups }); }, [session.id, onUpdateSessionConfig]);
  const handleUpdateSubscriptions = useCallback((subs: Subscription[]) => { onUpdateSessionConfig(session.id, { subscriptions: subs }); }, [session.id, onUpdateSessionConfig]);
  const handleUpdateTrendGroups = useCallback((groups: BatchGroup[]) => { onUpdateSessionConfig(session.id, { trendGroups: groups }); const allIds = new Set(groups.flatMap(g => g.nodes.map(n => n.nodeId))); setExistingTrendIds(allIds); }, [session.id, onUpdateSessionConfig]);
  const handleUpdateSchedulerGroups = useCallback((groups: SchedulerGroup[]) => { onUpdateSessionConfig(session.id, { schedulerGroups: groups }); }, [session.id, onUpdateSessionConfig]);
  
  const handleDisconnect = () => { onDisconnect(); setIsCollapsed(false); setConnPanelHeight(580); };

  useEffect(() => {
      if (session.config?.trendGroups) {
          const allIds = new Set(session.config.trendGroups.flatMap(g => g.nodes.map(n => n.nodeId)));
          setExistingTrendIds(allIds);
      }
  }, [session.config?.trendGroups]);
  
  // -- ADD TO HANDLERS --
  const handleAddToReadWrite = (refs: ReferenceDescription[], targetGroupIds?: string[]) => {
      const nodes: OpcNode[] = refs.map(r => createOpcNode(r, true)); 
      
      if (targetGroupIds && targetGroupIds.length > 0) {
          const currentGroups = session.config?.rwGroups || [];
          const updatedGroups = currentGroups.map(g => {
              if (targetGroupIds.includes(g.id)) {
                  const existingIds = new Set(g.nodes.map(n => n.nodeId));
                  const uniqueNew = nodes.filter(n => !existingIds.has(n.nodeId));
                  return { ...g, nodes: [...g.nodes, ...uniqueNew] };
              }
              return g;
          });
          onUpdateSessionConfig(session.id, { rwGroups: updatedGroups });
          handleAddLog('success', `Added nodes to ${targetGroupIds.length} Read/Write group(s).`);
      } else {
          // If no target group selected (or explicit default), use pending mechanism
          setPendingRWNodes(nodes);
          setViewMode('READ_WRITE');
          handleAddLog('success', `Sent ${nodes.length} nodes to Data Access Panel.`);
      }
  };

  const handleAddToSubscription = (refs: ReferenceDescription[], targetSubIds?: number[]) => {
      const nodes: OpcNode[] = refs.map(r => createOpcNode(r, false)); 
      if (targetSubIds && targetSubIds.length > 0) {
          const currentSubs = session.config?.subscriptions || [];
          const updatedSubs = currentSubs.map(s => {
              if (targetSubIds.includes(s.subscriptionId)) {
                  const newItems: MonitoredItem[] = nodes.map((n) => ({
                      internalId: Math.random().toString(36).substr(2, 9),
                      clientHandle: Math.floor(Math.random() * 1000000) + 1,
                      nodeId: n.nodeId,
                      displayName: n.displayName,
                      dataType: n.dataType,
                      value: null,
                      timestamp: '-',
                      statusCode: 'Waiting' 
                  }));
                  return { ...s, items: [...s.items, ...newItems] };
              }
              return s;
          });
          onUpdateSessionConfig(session.id, { subscriptions: updatedSubs });
          handleAddLog('success', `Added ${nodes.length} items to ${targetSubIds.length} subscription view(s).`);
      } else {
          setPendingSubNodes(nodes);
          setViewMode('SUBSCRIPTION');
          handleAddLog('success', `Sent ${nodes.length} nodes to Subscription Panel.`);
      }
  };

  const handleAddToTrend = (refs: ReferenceDescription[], targetGroupIds?: string[]) => {
      const nodes: OpcNode[] = refs.map(r => createOpcNode(r, false));
      if (targetGroupIds && targetGroupIds.length > 0) {
          const currentGroups = session.config?.trendGroups || [];
          const updatedGroups = currentGroups.map(g => {
              if (targetGroupIds.includes(g.id)) {
                  const existingIds = new Set(g.nodes.map(n => n.nodeId));
                  const uniqueNew = nodes.filter(n => !existingIds.has(n.nodeId));
                  return { ...g, nodes: [...g.nodes, ...uniqueNew] };
              }
              return g;
          });
          onUpdateSessionConfig(session.id, { trendGroups: updatedGroups });
          handleAddLog('success', `Added nodes to ${targetGroupIds.length} Trend group(s).`);
      } else {
          setPendingTrendNodes(nodes);
          setViewMode('TREND');
          handleAddLog('success', `Sent ${nodes.length} nodes to Trend View.`);
      }
  };

  const handleAddToScheduler = (refs: ReferenceDescription[], targetGroupId?: string, listType: 'source' | 'target' = 'source') => {
      const nodes: OpcNode[] = refs.map(r => createOpcNode(r, true)); 
      setPendingSchedulerNodes({ nodes, targetGroupId, listType });
      if (!targetGroupId) setViewMode('SCHEDULER');
      handleAddLog('success', `Added ${nodes.length} nodes to Scheduler.`);
  };

  const onRWConsumed = () => setPendingRWNodes([]);
  const onSubConsumed = () => setPendingSubNodes([]);
  const onTrendConsumed = () => setPendingTrendNodes([]);
  const onSchedulerConsumed = () => setPendingSchedulerNodes(null);

  const prevStatusRef = useRef(session.status);

  useEffect(() => {
    const currentStatus = session.status;
    const previous = prevStatusRef.current;
    if (currentStatus !== previous) {
        if (currentStatus === ConnectionStatus.CONNECTED) {
            setConnPanelHeight(48);
            setIsCollapsed(true);
        } else if (currentStatus === ConnectionStatus.ERROR || (currentStatus === ConnectionStatus.DISCONNECTED && previous !== ConnectionStatus.DISCONNECTED)) {
            setConnPanelHeight(580);
            setIsCollapsed(false);
        }
        prevStatusRef.current = currentStatus;
    }
  }, [session.status]);

  useEffect(() => {
      if (isVisible && status !== ConnectionStatus.CONNECTED && isCollapsed) {
          setIsCollapsed(false);
          setConnPanelHeight(580);
      }
  }, [isVisible, status]);

  const startResizingConn = useCallback((e: React.MouseEvent) => { if ((e.target as HTMLElement).tagName === 'BUTTON') return; e.preventDefault(); isResizingConn.current = true; connStartY.current = e.clientY; connStartHeight.current = connPanelHeight; document.addEventListener('mousemove', resizeConn); document.addEventListener('mouseup', stopResizingConn); document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; }, [connPanelHeight]);
  const stopResizingConn = useCallback((e: MouseEvent) => { isResizingConn.current = false; document.removeEventListener('mousemove', resizeConn); document.removeEventListener('mouseup', stopResizingConn); document.body.style.cursor = ''; document.body.style.userSelect = ''; }, []);
  const resizeConn = useCallback((e: MouseEvent) => { if (isResizingConn.current) { const delta = e.clientY - connStartY.current; const newHeight = Math.max(48, Math.min(connStartHeight.current + delta, 800)); setConnPanelHeight(newHeight); if (newHeight < 100) setIsCollapsed(true); else setIsCollapsed(false); } }, []);
  const toggleConnectionPanel = (forceState?: boolean) => { const newState = forceState !== undefined ? forceState : !isCollapsed; if (newState) { setConnPanelHeight(48); setIsCollapsed(true); } else { setConnPanelHeight(580); setIsCollapsed(false); } };

  const getStatusText = (s: ConnectionStatus) => {
      switch (s) {
          case ConnectionStatus.CONNECTED: return t.status.connected;
          case ConnectionStatus.CONNECTING: return t.status.connecting;
          case ConnectionStatus.DISCONNECTED: return t.status.disconnected;
          case ConnectionStatus.ERROR: return t.status.error;
          default: return s;
      }
  };

  const handleDrop = (e: React.DragEvent, mode: ViewMode) => {
      e.preventDefault();
      try {
          const data = e.dataTransfer.getData('application/opcua-node');
          if (data) {
              const node = JSON.parse(data) as ReferenceDescription;
              
              // Delegate to specific handlers based on drop target mode
              if (mode === 'READ_WRITE') {
                  handleAddToReadWrite([node]);
              } else if (mode === 'SUBSCRIPTION') {
                  handleAddToSubscription([node]);
              } else if (mode === 'TREND') {
                  handleAddToTrend([node]);
              } else if (mode === 'SCHEDULER') { 
                  handleAddToScheduler([node], undefined, 'source');
              }
          }
      } catch (err) { console.error("Drop failed", err); }
  };

  return (
    <div className={`flex flex-col h-full bg-slate-100 dark:bg-slate-950 ${isVisible ? 'flex' : 'hidden'}`}>
       <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
           
           <CopilotWidget 
               insights={insights} 
               onClear={() => setInsights([])} 
               onAction={handleCopilotAction}
               systemLogs={logs || []}
               activeSession={session}
               currentView={viewMode}
           />

           <div style={{ height: connPanelHeight }} className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10 flex-shrink-0 shadow-sm relative flex flex-col overflow-hidden transition-[height] duration-300 ease-in-out will-change-transform">
              <div className="flex-1 overflow-hidden relative">
                  <div className={`absolute inset-0 px-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 transition-opacity duration-200 ${isCollapsed ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <div className="flex items-center gap-3">
                          <h2 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{t.connection.title}</h2>
                          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${status === ConnectionStatus.CONNECTED ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : status === ConnectionStatus.CONNECTING ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>{status === ConnectionStatus.CONNECTED ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}{getStatusText(status)}</div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{session.endpointUrl}</span>
                      </div>
                      <div className="flex items-center gap-3">
                          <button onClick={() => { if(isConnected) handleDisconnect(); }} disabled={status !== ConnectionStatus.CONNECTED} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline disabled:opacity-50">{t.connection.btn.disconnect}</button>
                          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700"></div>
                          <button 
                              onClick={() => toggleConnectionPanel(false)} 
                              className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-full text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shadow-sm flex items-center gap-1.5 text-xs font-bold transition-colors"
                              title={t.connection.btn.expand}
                          >
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{t.connection.btn.expand}</span>
                          </button>
                      </div>
                  </div>
                  
                  <div className={`absolute inset-0 transition-opacity duration-200 ${!isCollapsed ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <ConnectionPanel session={session} onConnect={onConnect} onDisconnect={handleDisconnect} onUpdateSession={onUpdateSession} />
                  </div>
              </div>
              <div onMouseDown={startResizingConn} className="h-4 w-full bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border-t border-slate-200 dark:border-slate-800 cursor-row-resize flex items-center justify-center group flex-shrink-0 transition-colors relative">
                  <div className="w-16 h-1 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors"></div>
                  {!isCollapsed && (
                      <button 
                          onClick={(e) => { e.stopPropagation(); toggleConnectionPanel(true); }} 
                          className="absolute right-6 -top-3.5 px-3 py-1 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-full text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer z-20 shadow-sm flex items-center gap-1.5 text-xs font-bold transition-colors"
                          title={t.connection.btn.collapse}
                      >
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t.connection.btn.collapse}</span>
                      </button>
                  )}
              </div>
           </div>

           <div className="px-4 pt-4 bg-slate-100 dark:bg-slate-950 flex gap-1 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 overflow-x-auto scrollbar-thin z-10">
               <NavTab mode="DASHBOARD" icon={Gauge} label={t.workspace.tabDash} colorClass="text-indigo-600 dark:text-indigo-400" currentMode={viewMode} setViewMode={setViewMode} />
               <NavTab mode="READ_WRITE" icon={LayoutList} label={t.workspace.tabRW} colorClass="text-blue-600 dark:text-blue-400" canDrop={true} currentMode={viewMode} setViewMode={setViewMode} onDrop={handleDrop} dropHint={t.workspace.dropHint} />
               <NavTab mode="SUBSCRIPTION" icon={Activity} label={t.workspace.tabSub} colorClass="text-emerald-600 dark:text-emerald-400" canDrop={true} currentMode={viewMode} setViewMode={setViewMode} onDrop={handleDrop} dropHint={t.workspace.dropHint} />
               <NavTab mode="BROWSER" icon={FolderTree} label={t.workspace.tabBrowser} colorClass="text-amber-600 dark:text-amber-400" currentMode={viewMode} setViewMode={setViewMode} />
               <NavTab mode="TREND" icon={TrendingUp} label={t.workspace.tabTrend} colorClass="text-sky-500 dark:text-sky-400" canDrop={true} currentMode={viewMode} setViewMode={setViewMode} onDrop={handleDrop} dropHint={t.workspace.dropHint} />
               <NavTab mode="SCHEDULER" icon={ArrowRightLeft} label={t.workspace.tabScheduler} colorClass="text-rose-500 dark:text-rose-400" canDrop={true} currentMode={viewMode} setViewMode={setViewMode} onDrop={handleDrop} dropHint="Drop nodes to create schedule tasks" />
               <NavTab mode="EVENTS" icon={Bell} label={t.workspace.tabEvents} colorClass="text-purple-600 dark:text-purple-400" currentMode={viewMode} setViewMode={setViewMode} />
               <NavTab mode="CHAOS" icon={Skull} label={t.workspace.tabChaos} colorClass="text-red-600 dark:text-red-400" currentMode={viewMode} setViewMode={setViewMode} />
           </div>

           <div className="flex-1 bg-white dark:bg-slate-900 relative overflow-hidden shadow-inner">
               <div className={`absolute inset-0 ${viewMode === 'DASHBOARD' ? 'block' : 'hidden'}`}>
                   <DashboardPanel isConnected={isConnected} dropCount={session.dropCount} isVisible={isVisible && viewMode === 'DASHBOARD'} />
               </div>
               <div className={`absolute inset-0 p-3 ${viewMode === 'READ_WRITE' ? 'block' : 'hidden'}`}>
                   <ReadWritePanel isConnected={isConnected} connectionStatus={session.status} sessionId={session.backendId} addLog={handleAddLog} pendingNodes={pendingRWNodes} onNodesConsumed={onRWConsumed} onSyncIds={setExistingRwIds} initialGroups={session.config?.rwGroups} onGroupsChange={handleUpdateRwGroups} autoReadEnabled={session.autoRead} isVisible={isVisible && viewMode === 'READ_WRITE'} />
               </div>
               <div className={`absolute inset-0 ${viewMode === 'SUBSCRIPTION' ? 'block' : 'hidden'}`}>
                   <SubscriptionPanel isVisible={isVisible && viewMode === 'SUBSCRIPTION'} isConnected={isConnected} sessionId={session.backendId} addLog={handleAddLog} pendingNodes={pendingSubNodes} onNodesConsumed={onSubConsumed} onSyncIds={setExistingSubIds} initialSubscriptions={session.config?.subscriptions} onSubscriptionsChange={handleUpdateSubscriptions} autoSubscribeEnabled={session.autoSubscribe} />
               </div>
               <div className={`absolute inset-0 p-3 ${viewMode === 'BROWSER' ? 'block' : 'hidden'}`}>
                   <BrowserPanel isConnected={isConnected} sessionId={session.backendId} addLog={handleAddLog} onAddToReadWrite={handleAddToReadWrite} onAddToSubscription={handleAddToSubscription} onAddToTrend={handleAddToTrend} onAddToScheduler={handleAddToScheduler} existingRwIds={existingRwIds} existingSubIds={existingSubIds} existingTrendIds={existingTrendIds} rwGroups={session.config?.rwGroups} subscriptions={session.config?.subscriptions} trendGroups={session.config?.trendGroups} schedulerGroups={session.config?.schedulerGroups} isVisible={isVisible && viewMode === 'BROWSER'} />
               </div>
               <div className={`absolute inset-0 ${viewMode === 'TREND' ? 'block' : 'hidden'}`}>
                   <TrendPanel isConnected={isConnected} sessionId={session.backendId} initialGroups={session.config?.trendGroups} onGroupsChange={handleUpdateTrendGroups} pendingNodes={pendingTrendNodes} onNodesConsumed={onTrendConsumed} isVisible={isVisible && viewMode === 'TREND'} />
               </div>
               <div className={`absolute inset-0 p-3 ${viewMode === 'SCHEDULER' ? 'block' : 'hidden'}`}>
                   <SchedulerPanel isConnected={isConnected} connectionStatus={session.status} sessionId={session.backendId} addLog={handleAddLog} pendingNodes={pendingSchedulerNodes} onNodesConsumed={onSchedulerConsumed} initialGroups={session.config?.schedulerGroups} onGroupsChange={handleUpdateSchedulerGroups} autoScheduleEnabled={session.autoSchedule} isVisible={isVisible && viewMode === 'SCHEDULER'} />
               </div>
               <div className={`absolute inset-0 p-3 ${viewMode === 'EVENTS' ? 'block' : 'hidden'}`}>
                   <EventPanel isConnected={isConnected} sessionId={session.backendId} isVisible={isVisible && viewMode === 'EVENTS'} />
               </div>
               <div className={`absolute inset-0 ${viewMode === 'CHAOS' ? 'block' : 'hidden'}`}>
                   <ChaosPanel session={session} addLog={handleAddLog} isVisible={isVisible && viewMode === 'CHAOS'} />
               </div>
           </div>
       </div>
    </div>
  );
};

const memoizedSessionWorkspace = React.memo(SessionWorkspace, (prev, next) => {
    return prev.isVisible === next.isVisible && 
           prev.session === next.session;
    // We intentionally ignore changes to inline functions (addLog, onConnect, etc.)
    // because they are referentially volatile but functionally stable.
    // We also ignore 'logs' because logs change constantly and the panel is background.
    // If it's visible, it shouldn't hold back render unless necessary, but logs
    // are only used by the CopilotWidget which can afford slightly stale logs if we 
    // wanted to be strict. However, to allow the current session to get new logs:
    // actually, we should allow it to re-render if it is visible.
});

// Since we need to update logs when visible:
export default React.memo(SessionWorkspace, (prev, next) => {
    if (prev.isVisible !== next.isVisible) return false;
    if (prev.session !== next.session) return false;
    // only compare logs if the component is visible, otherwise keep it cached
    if (prev.isVisible && prev.logs !== next.logs) return false;
    return true;
});
