
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { OpcNode, BatchGroup } from '../types';
import { opcuaService } from '../services/opcuaService';
import { Play, Pause, X, TrendingUp, Trash2, CheckSquare, Square, Download, Plus, List, Edit3, ArrowLeft, ArrowRight, LayoutGrid, Layers, Minimize2, Activity, Binary, MinusSquare, Search, AlertCircle, Clock, ZoomIn, ZoomOut, RefreshCcw, Move, Lock, Unlock, Settings2, Crosshair, ChevronDown, Eye, EyeOff, Maximize2, MousePointer2, MoveVertical, MoveHorizontal, Ruler, Target, Hash, ChevronsLeft, ChevronsRight, GripVertical, Minus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface TrendPanelProps {
  isConnected: boolean;
  sessionId?: string;
  initialGroups?: BatchGroup[];
  onGroupsChange?: (groups: BatchGroup[]) => void;
  pendingNodes?: OpcNode[];
  onNodesConsumed?: () => void;
  isVisible?: boolean;
}

// Data Point Structure
interface TrendPoint {
    v: number; // Value
    t: number; // Timestamp (ms)
}

// --- HELPER: TIMEOUT PROMISE ---
const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} Timed out (${ms}ms)`)), ms))
    ]);
};

// --- HELPER COMPONENT: HYBRID INPUT (Input + Select) ---
interface HybridInputProps {
    value: number;
    onChange: (val: number) => void;
    options: number[];
    unit?: string;
    label?: string;
    min?: number;
    step?: number;
    width?: string;
}

const HybridInput: React.FC<HybridInputProps> = ({ value, onChange, options, unit, label, min = 1, step = 1, width = "w-24" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCommit = (val: string) => {
        let num = Number(val);
        if (isNaN(num)) num = min;
        if (num < min) num = min;
        onChange(num);
    };

    return (
        <div className="flex items-center gap-2" ref={containerRef}>
            {label && <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{label}</span>}
            <div className={`relative flex items-center bg-white border border-slate-300 rounded h-6 ${width} hover:border-blue-400 transition-colors`}>
                <input 
                    type="number" 
                    min={min}
                    step={step}
                    className="w-full h-full px-2 text-xs font-mono outline-none bg-transparent rounded-l text-right"
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))} // Intermediate updates
                    onBlur={(e) => handleCommit(e.target.value)} // Strict validation on blur
                />
                {unit && <span className="text-[9px] text-slate-400 mr-1 pointer-events-none select-none">{unit}</span>}
                <button 
                    className="h-full px-1 border-l border-slate-200 hover:bg-slate-100 text-slate-500 rounded-r flex items-center justify-center"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <ChevronDown className="w-3 h-3" />
                </button>

                {isOpen && (
                    <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-40 overflow-y-auto min-w-[100px]">
                        {options.map(opt => (
                            <div 
                                key={opt} 
                                className="px-3 py-1.5 text-xs hover:bg-blue-50 cursor-pointer text-slate-700 font-mono border-b border-slate-50 last:border-0"
                                onClick={() => { onChange(opt); setIsOpen(false); }}
                            >
                                {opt} {unit}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const isArrayLike = (val: any): val is any[] => {
    return Array.isArray(val) || (ArrayBuffer.isView(val) && !(val instanceof DataView));
};

// --- HELPER COMPONENT: ARRAY INDEX SELECTOR (Visual [][]) ---
interface ArrayIndexSelectorProps {
    nodeId: string;
    value: any; // The raw array value from OPC UA (might be null/stale)
    indexStr: string; // The stored "0,1" string
    onChange: (newStr: string) => void;
}

const ArrayIndexSelector: React.FC<ArrayIndexSelectorProps> = ({ nodeId, value, indexStr, onChange }) => {
    // 1. Determine Dimensions based on indexStr (Source of Truth for UI)
    const indices = useMemo(() => {
        const parts = indexStr ? indexStr.toString().split(',') : [];
        if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) return ['0'];
        return parts.map(s => s.trim());
    }, [indexStr]);

    const handleDimChange = (dimIndex: number, newVal: string) => {
        const newIndices = [...indices];
        newIndices[dimIndex] = newVal;
        onChange(newIndices.join(','));
    };

    const addDimension = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange([...indices, '0'].join(','));
    };

    const removeDimension = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (indices.length > 1) {
            onChange(indices.slice(0, -1).join(','));
        }
    };

    // Calculate validity for each dimension level
    // This allows [0] (valid) -> [100] (invalid) rendering immediately
    const checkValidity = (dimIndex: number, valStr: string): boolean => {
        if (!isArrayLike(value)) return true; // Can't validate yet (or value not loaded)
        
        const idx = parseInt(valStr);
        if (isNaN(idx) || idx < 0) return false;

        // Dim 0 check
        if (dimIndex === 0) return idx < value.length;

        // Dim 1 check (requires Dim 0 to be valid)
        if (dimIndex === 1) {
            const idx0 = parseInt(indices[0]);
            if (isNaN(idx0) || idx0 < 0 || idx0 >= value.length) return false; // Parent invalid
            const subArr = value[idx0];
            return isArrayLike(subArr) && idx < subArr.length;
        }

        // Dim 2 check
        if (dimIndex === 2) {
            const idx0 = parseInt(indices[0]);
            const idx1 = parseInt(indices[1]);
            if (isNaN(idx0) || idx0 < 0 || idx0 >= value.length) return false;
            const subArr1 = value[idx0];
            if (!isArrayLike(subArr1) || idx1 < 0 || idx1 >= subArr1.length) return false;
            const subArr2 = subArr1[idx1];
            return isArrayLike(subArr2) && idx < subArr2.length;
        }

        return true;
    };

    return (
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            <span className="text-[9px] text-slate-400 font-bold mr-1">IDX:</span>
            {indices.map((idxVal, i) => {
                const isValid = checkValidity(i, idxVal);
                const borderColor = isValid ? 'border-slate-300 group-hover/dim:border-blue-400' : 'border-red-500 bg-red-50';
                const textColor = isValid ? 'text-slate-600' : 'text-red-600 font-bold';
                const bracketColor = isValid ? 'text-slate-400' : 'text-red-400';

                return (
                    <div key={i} className={`flex items-center border rounded px-0.5 h-4 bg-white transition-colors group/dim ${borderColor}`}>
                        <span className={`text-[9px] font-mono mr-0.5 select-none ${bracketColor}`}>[</span>
                        <input 
                            type="text" 
                            className={`w-6 h-full text-[9px] font-mono outline-none text-center bg-transparent ${textColor}`}
                            value={idxVal}
                            onChange={(e) => handleDimChange(i, e.target.value)}
                            placeholder="0"
                        />
                        <span className={`text-[9px] font-mono ml-0.5 select-none ${bracketColor}`}>]</span>
                    </div>
                );
            })}
            
            {/* Manual Controls */}
            <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={addDimension}
                    className="p-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                    title="Add Dimension"
                >
                    <Plus className="w-2.5 h-2.5" />
                </button>
                {indices.length > 1 && (
                    <button 
                        onClick={removeDimension}
                        className="p-0.5 rounded bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-500 border border-slate-200"
                        title="Remove Dimension"
                    >
                        <Minus className="w-2.5 h-2.5" />
                    </button>
                )}
            </div>
        </div>
    );
};

const ensureInternalIds = (nodes: OpcNode[]) => {
    return nodes.map(n => ({
        ...n,
        internalId: n.internalId || Math.random().toString(36).substr(2, 9)
    }));
};

const toLocalISOString = (date: Date) => {
    const tzOffset = date.getTimezoneOffset() * 60000; 
    const localTime = new Date(date.getTime() - tzOffset);
    return localTime.toISOString().slice(0, 16);
};

const formatTimeLabel = (ts: number, showDate: boolean = false) => {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    if (showDate) {
        return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
    }
    return time;
};

const formatDuration = (ms: number) => {
    const absMs = Math.abs(ms);
    if (absMs < 1000) return `${absMs.toFixed(0)} ms`;
    if (absMs < 60000) return `${(absMs / 1000).toFixed(2)} s`;
    return `${(absMs / 60000).toFixed(2)} m`;
};

const isDiscreteType = (dataType: string) => {
    if (!dataType) return false;
    return ['Boolean', 'SByte', 'Byte', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64', 'String', 'DateTime', 'Guid'].includes(dataType);
};

const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

// Reuse context menu logic
interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onRename: () => void;
    onDelete: () => void;
    onClear: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
}

const GroupContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onRename, onDelete, onClear, onMoveLeft, onMoveRight }) => {
    const { t } = useLanguage();
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div 
            ref={menuRef}
            className="fixed z-50 bg-white border border-slate-200 shadow-xl rounded-lg py-1 w-40 flex flex-col text-slate-700 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
        >
            <button onClick={onRename} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><Edit3 className="w-3.5 h-3.5"/> {t.trend.contextMenu.rename}</button>
            <button onClick={onMoveLeft} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><ArrowLeft className="w-3.5 h-3.5"/> {t.trend.contextMenu.moveLeft}</button>
            <button onClick={onMoveRight} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><ArrowRight className="w-3.5 h-3.5"/> {t.trend.contextMenu.moveRight}</button>
            <div className="h-px bg-slate-100 my-1"></div>
            <button onClick={onClear} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2 text-amber-600"><Trash2 className="w-3.5 h-3.5"/> {t.trend.contextMenu.clear}</button>
            <button onClick={onDelete} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2 text-red-600"><X className="w-3.5 h-3.5"/> {t.trend.contextMenu.delete}</button>
        </div>
    );
};

const TrendPanel: React.FC<TrendPanelProps> = ({ isConnected, sessionId, initialGroups, onGroupsChange, pendingNodes, onNodesConsumed, isVisible = true }) => {
  const { t } = useLanguage();
  // UPDATED STATE: Store Objects with Time
  const [dataPoints, setDataPoints] = useState<Record<string, TrendPoint[]>>({}); 
  const [isPaused, setIsPaused] = useState(true); 
  // Frozen Time State: Used to lock the chart view when paused
  const [frozenTime, setFrozenTime] = useState<number | null>(null);

  const [samplingInterval, setSamplingInterval] = useState(100); 
  
  // -- CHART STATE (Zoom & Pan & Scaling) --
  const [controlAxis, setControlAxis] = useState<'X' | 'Y'>('X'); // NEW: Which axis is currently controlled by mouse
  
  const [timeWindow, setTimeWindow] = useState<number>(10000); // X-Axis Zoom (Window size)
  const [timeOffset, setTimeOffset] = useState<number>(0); // X-Axis Pan
  
  const [yScale, setYScale] = useState<number>(1); // Y-Axis Zoom (1 = 100%)
  const [yOffset, setYOffset] = useState<number>(0); // Y-Axis Pan (Shift center)

  const [isLiveFollow, setIsLiveFollow] = useState(true); 
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
  
  // -- OSCILLOSCOPE CURSORS --
  const [showXCursors, setShowXCursors] = useState(false);
  const [showYCursors, setShowYCursors] = useState(false);
  // NEW: Mouse Crosshair Toggle (Default off to prevent auto-appearance)
  const [showCrosshair, setShowCrosshair] = useState(false);

  // Default values will be set on first draw or toggle
  const [xCursorA, setXCursorA] = useState<number | null>(null);
  const [xCursorB, setXCursorB] = useState<number | null>(null);
  const [yCursorA, setYCursorA] = useState<number | null>(null);
  const [yCursorB, setYCursorB] = useState<number | null>(null);
  // Drag state for cursors: 'XA', 'XB', 'YA', 'YB' or null
  const [draggingCursor, setDraggingCursor] = useState<string | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null); // For visual feedback

  // Y-Axis Config
  const [yAxisMode, setYAxisMode] = useState<'auto' | 'fixed'>('auto');
  const [yMin, setYMin] = useState<number>(0);
  const [yMax, setYMax] = useState<number>(100);

  // Grid Config (NEW)
  const [xGridInterval, setXGridInterval] = useState<number>(100);
  const [yGridInterval, setYGridInterval] = useState<number>(1);

  // Dragging State (Chart Pan)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{x: number, y: number, tOffset: number, yOffset: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const splitCanvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map()); // Refs for split view
  
  // -- MODE STATE --
  const [mode, setMode] = useState<'LIVE' | 'HISTORY'>('LIVE');
  const [historyStart, setHistoryStart] = useState<string>(toLocalISOString(new Date(Date.now() - 3600000))); 
  const [historyEnd, setHistoryEnd] = useState<string>(toLocalISOString(new Date()));
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // -- VIEW MODE STATE --
  const [viewMode, setViewMode] = useState<'OVERLAY' | 'SPLIT'>('SPLIT'); 
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [maximizedNodeId, setMaximizedNodeId] = useState<string | null>(null);
  
  // -- RENDERING SETTINGS --
  const [interpolationMode, setInterpolationMode] = useState<'linear' | 'step'>('step');
  const [historyLimit, setHistoryLimit] = useState<number>(1000); 

  // -- GROUP STATE --
  const [groups, setGroups] = useState<BatchGroup[]>(() => {
      if (initialGroups && initialGroups.length > 0) {
          return initialGroups.map(grp => ({ ...grp, nodes: ensureInternalIds(grp.nodes) }));
      }
      return [{
          id: 'default-trend',
          name: 'Trend Group 1',
          nodes: []
      }];
  });

  const [activeGroupId, setActiveGroupId] = useState<string>('default-trend');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [lastClickedGroupId, setLastClickedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, groupId: string } | null>(null);

  // -- NODE STATE (Within Active Group) --
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [lastClickedNodeId, setLastClickedNodeId] = useState<string | null>(null);
  
  // -- NEW: FROZEN NODES (Pause individual traces) --
  const [frozenNodeIds, setFrozenNodeIds] = useState<Set<string>>(new Set());
  
  // -- NEW: ARRAY INDEX SELECTOR (Map node ID to string like "0,1") --
  const [arrayIndices, setArrayIndices] = useState<Record<string, string>>({});
  // REF Optimization: Use Ref to hold latest indices for polling loop without triggering effect restart
  const arrayIndicesRef = useRef<Record<string, string>>({});
  
  // -- NEW: ARRAY INDEX ERROR TRACKING --
  // Tracks nodes that have invalid array indices to show UI feedback
  const [indexErrors, setIndexErrors] = useState<Record<string, boolean>>({});
  const indexErrorsRef = useRef<Record<string, boolean>>({});

  // -- NEW: SIDEBAR RESIZING OPTIMIZED --
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [preExpandWidth, setPreExpandWidth] = useState(300);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ startX: number, startWidth: number } | null>(null);

  // ... (Group Sync Effects) ...
  useEffect(() => {
      if (initialGroups) {
          const needsUpdate = initialGroups.length !== groups.length || !initialGroups.every((g, i) => { const localG = groups[i]; return localG && localG.id === g.id && localG.nodes.length === g.nodes.length; });
          if (needsUpdate) {
               setGroups(initialGroups.map(grp => ({ ...grp, nodes: ensureInternalIds(grp.nodes) })));
               if (!initialGroups.find(g => g.id === activeGroupId)) { if (initialGroups.length > 0) setActiveGroupId(initialGroups[0].id); }
          }
      }
  }, [initialGroups]);

  useEffect(() => { if (!groups.find(g => g.id === activeGroupId) && groups.length > 0) setActiveGroupId(groups[0].id); }, [groups, activeGroupId]);

  const updateGroupsStructurally = (newGroups: BatchGroup[]) => { setGroups(newGroups); if (onGroupsChange) onGroupsChange(newGroups); };
  const activeGroup = groups.find(g => g.id === activeGroupId);
  const nodes = activeGroup?.nodes || [];

  useEffect(() => {
      setDataPoints({});
      setHiddenNodeIds(new Set());
      setSelectedNodeIds(new Set());
      setFrozenNodeIds(new Set()); // Reset frozen state on group change
      setMaximizedNodeId(null);
      setFetchError(null);
      setMousePos(null);
      setIsLiveFollow(true);
      setTimeOffset(0);
      setFrozenTime(null);
      // Reset Y
      setYScale(1);
      setYOffset(0);
      // Reset Cursors
      setShowXCursors(false);
      setShowYCursors(false);
      setShowCrosshair(false); // Reset crosshair default off
      
      // Reset errors
      setIndexErrors({});
      indexErrorsRef.current = {};
  }, [activeGroupId]);

  useEffect(() => {
      if (mode === 'LIVE') {
          setDataPoints({});
          setFetchError(null);
          setIsLiveFollow(true);
          setTimeOffset(0);
          setFrozenTime(null);
      }
  }, [historyLimit, mode]);

  useEffect(() => {
      if (pendingNodes && pendingNodes.length > 0) {
          const hydrated = ensureInternalIds(pendingNodes);
          let newGroups = [...groups];
          if (newGroups.length === 0) { const def = { id: Math.random().toString(36).substr(2,9), name: 'Trend Group 1', nodes: [] }; newGroups = [def]; setActiveGroupId(def.id); }
          newGroups = newGroups.map(g => { if (g.id === activeGroupId || (newGroups.length === 1 && g.id === newGroups[0].id)) { const existingIds = new Set(g.nodes.map(n => n.nodeId)); const uniqueNew = hydrated.filter(n => !existingIds.has(n.nodeId)); return { ...g, nodes: [...g.nodes, ...uniqueNew] }; } return g; });
          updateGroupsStructurally(newGroups);
          if (onNodesConsumed) onNodesConsumed();
      }
  }, [pendingNodes, activeGroupId]);

  // Initialization of Data Structure
  useEffect(() => {
      setDataPoints(prev => {
          const next = { ...prev };
          nodes.forEach(n => { if (!next[n.nodeId]) next[n.nodeId] = []; });
          return next;
      });
  }, [nodes, historyLimit, mode]);

  // --- PAUSE HANDLING ---
  const togglePause = () => {
      const nextPaused = !isPaused;
      setIsPaused(nextPaused);
      if (nextPaused) {
          setFrozenTime(Date.now());
      } else {
          setFrozenTime(null);
      }
  };

  const getChartNow = useCallback(() => {
      return isPaused && frozenTime ? frozenTime : Date.now();
  }, [isPaused, frozenTime]);

  const toggleNodeFreeze = (nodeId: string) => {
      setFrozenNodeIds(prev => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
      });
  };

  const deleteSingleNode = (nodeId: string) => {
      const newGroups = groups.map(g => g.id === activeGroupId ? { ...g, nodes: g.nodes.filter(n => n.nodeId !== nodeId) } : g);
      updateGroupsStructurally(newGroups);
      if (selectedNodeIds.has(nodeId)) {
          const next = new Set(selectedNodeIds);
          next.delete(nodeId);
          setSelectedNodeIds(next);
      }
      // Also remove from hidden/frozen sets if present
      if (hiddenNodeIds.has(nodeId)) {
          setHiddenNodeIds(prev => {
              const next = new Set(prev);
              next.delete(nodeId);
              return next;
          });
      }
      if (frozenNodeIds.has(nodeId)) {
          setFrozenNodeIds(prev => {
              const next = new Set(prev);
              next.delete(nodeId);
              return next;
          });
      }
  };

  const handleRowClick = (e: React.MouseEvent, node: OpcNode, index: number) => {
      e.stopPropagation();
      const id = node.nodeId;
      const newS = new Set(selectedNodeIds);
      
      if (e.ctrlKey || e.metaKey) {
          if (newS.has(id)) newS.delete(id);
          else newS.add(id);
          setLastClickedNodeId(id);
      } else if (e.shiftKey && lastClickedNodeId) {
          const currentNodes = activeGroup?.nodes || [];
          const startIdx = currentNodes.findIndex(n => n.nodeId === lastClickedNodeId);
          const endIdx = index;
          if (startIdx !== -1) {
              const low = Math.min(startIdx, endIdx);
              const high = Math.max(startIdx, endIdx);
              if (!e.ctrlKey) newS.clear();
              for (let i = low; i <= high; i++) {
                  newS.add(currentNodes[i].nodeId);
              }
          }
      } else {
          newS.clear();
          newS.add(id);
          setLastClickedNodeId(id);
      }
      setSelectedNodeIds(newS);
  };

  const handleArrayIndexChange = (nodeId: string, value: string) => {
      // Sync Ref immediately to keep polling loop current without restarting it
      const newIndices = { ...arrayIndices, [nodeId]: value };
      arrayIndicesRef.current = newIndices;
      setArrayIndices(newIndices);
      
      // Clear data points for this node to avoid jump in chart
      setDataPoints(prev => ({ ...prev, [nodeId]: [] }));
      
      // Optimistically clear error when user types new input
      if (indexErrors[nodeId]) {
          setIndexErrors(prev => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
          });
          indexErrorsRef.current[nodeId] = false;
      }

      // TRIGGER IMMEDIATE POLL to prevent waiting for next interval
      executePoll();
  };

  // --- OPTIMIZED RESIZING HANDLERS (Direct DOM) ---
  const startResizing = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const stopResizing = useCallback(() => {
      if (resizingRef.current && sidebarRef.current) {
          // Read final width from DOM and sync React state
          const currentWidth = parseInt(sidebarRef.current.style.width, 10);
          if (!isNaN(currentWidth)) {
              setSidebarWidth(currentWidth);
          }
      }
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
      if (resizingRef.current && sidebarRef.current) {
          const delta = e.clientX - resizingRef.current.startX;
          const newWidth = Math.max(200, Math.min(resizingRef.current.startWidth + delta, 800));
          // Directly update DOM to avoid re-renders
          sidebarRef.current.style.width = `${newWidth}px`;
      }
  }, []);

  const calculateOptimalWidth = useCallback(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 400;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
      
      let maxW = 0;
      nodes.forEach(node => {
          let textW = 0;
          if (node.displayName && node.displayName !== node.nodeId) {
              const w1 = ctx.measureText(node.displayName).width;
              const w2 = ctx.measureText(node.nodeId).width;
              textW = Math.max(w1, w2);
          } else {
              textW = ctx.measureText(node.nodeId).width;
          }
          if (textW > maxW) maxW = textW;
      });
      // Padding estimate: ColorDot(20) + Padding(20) + ValueCol(70) + Buttons(30) + Scrollbar(10) ~= 150
      return Math.min(800, Math.max(300, maxW + 150));
  }, [nodes]);

  const handleAutoExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      const idealWidth = calculateOptimalWidth();
      const isExpanded = sidebarWidth >= idealWidth - 10; // Tolerance
      
      if (isExpanded) {
          // Collapse to previous or default
          const target = preExpandWidth < idealWidth ? preExpandWidth : 300;
          setSidebarWidth(target);
      } else {
          // Expand
          setPreExpandWidth(sidebarWidth);
          setSidebarWidth(idealWidth);
      }
  };

  // --- POLLING LOGIC EXTRACTED ---
  const isPollingRef = useRef(false);

  const executePoll = useCallback(async () => {
    if (mode === 'HISTORY' || !isConnected || isPaused || nodes.length === 0 || !sessionId) return;
    
    // Simple lock
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    const activeNodes = nodes.filter(n => !hiddenNodeIds.has(n.nodeId));
    if (activeNodes.length === 0) {
        isPollingRef.current = false;
        return;
    }

    const ids = activeNodes.map(n => n.nodeId);
    const typeMap = new Map();
    activeNodes.forEach(n => typeMap.set(n.nodeId, n.dataType));
    
    try {
        // ROBUSTNESS FIX: Add timeout to prevent hanging if backend is slow
        const results = await withTimeout(opcuaService.readNodes(sessionId, ids, typeMap), 5000, "Trend Poll");
        
        const now = Date.now();
        
        // Create a temporary set to track errors in this cycle
        const currentErrors: Record<string, boolean> = {};
        let errorStateChanged = false;

        setDataPoints(prev => {
            const next = { ...prev };
            results.forEach((res, i) => {
                const nodeId = ids[i];
                let val = 0;
                let isValidExtract = true;
                
                // Handle Array Indexing for Trend
                // Support syntax "1" (1D) or "1,2" (2D)
                if (isArrayLike(res.value)) {
                    // OPTIMIZATION: Use Ref to get current indices without restarting loop
                    const indexStr = arrayIndicesRef.current[nodeId] || "0";
                    const indices = indexStr.toString().split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                    if (indices.length === 0) indices.push(0);

                    let currentLevel = res.value;
                    let found = true;
                    
                    // Traverse nested arrays
                    for (const idx of indices) {
                        if (isArrayLike(currentLevel) && idx < currentLevel.length) {
                            currentLevel = currentLevel[idx];
                        } else {
                            found = false;
                            break;
                        }
                    }

                    if (found) {
                        if (typeof currentLevel === 'number') val = currentLevel;
                        else if (typeof currentLevel === 'boolean') val = currentLevel ? 1 : 0;
                        else if (isArrayLike(currentLevel)) { 
                            // Still an array? Means user didn't drill down enough.
                            // We treat this as an error for trending purposes.
                            isValidExtract = false; 
                        }
                        else val = parseFloat(String(currentLevel)) || 0;
                    } else {
                        isValidExtract = false; // Index out of bounds or mismatch
                    }
                } else if (typeof res.value === 'number') {
                    val = res.value;
                } else if (typeof res.value === 'boolean') {
                    val = res.value ? 1 : 0; 
                } else {
                    val = parseFloat(res.value) || 0;
                }

                // --- ERROR HANDLING LOGIC ---
                if (!isValidExtract) {
                    currentErrors[nodeId] = true;
                    if (!indexErrorsRef.current[nodeId]) {
                        errorStateChanged = true;
                        indexErrorsRef.current[nodeId] = true;
                    }
                    // Do NOT push bad data to chart
                } else {
                    // If valid, check if we need to clear previous error
                    if (indexErrorsRef.current[nodeId]) {
                        errorStateChanged = true;
                        indexErrorsRef.current[nodeId] = false;
                    }

                    if (next[nodeId]) {
                        // Check if specific node is frozen (paused from updating)
                        if (!frozenNodeIds.has(nodeId)) {
                            const current = next[nodeId];
                            const bufferLimit = Math.max(historyLimit * 1.5, 200); 
                            const newArr = current.length >= bufferLimit ? current.slice(current.length - bufferLimit + 1) : current;
                            newArr.push({ v: val, t: now }); 
                            next[nodeId] = newArr;
                        }
                    } else {
                        // Init even if frozen, to prevent crash
                        if (!frozenNodeIds.has(nodeId)) {
                            next[nodeId] = [{ v: val, t: now }];
                        } else {
                            next[nodeId] = [];
                        }
                    }
                }
            });
            return next;
        });

        // Update error state in React only if something changed to trigger re-render of inputs
        if (errorStateChanged) {
            setIndexErrors(prev => {
                const next = { ...prev };
                // Sync from ref
                Object.keys(indexErrorsRef.current).forEach(key => {
                    if (indexErrorsRef.current[key]) next[key] = true;
                    else delete next[key];
                });
                return next;
            });
        }

    } catch (e: any) {
        console.warn("Trend read failed or timed out:", e.message);
    } finally {
        isPollingRef.current = false;
    }

  }, [isConnected, isPaused, nodes, hiddenNodeIds, sessionId, mode, frozenNodeIds, historyLimit]); 

  // POLLING LOOP (LIVE MODE)
  useEffect(() => {
    let interval: any;
    if (isVisible) {
       interval = setInterval(executePoll, Math.max(50, samplingInterval)); // Force min 50ms safely
    }
    return () => clearInterval(interval);
  }, [executePoll, samplingInterval, isVisible]);

  // FETCH HISTORY LOGIC
  const handleFetchHistory = async () => {
      if (!isConnected || !sessionId) { setFetchError("Not connected to server."); return; }
      if (nodes.length === 0) { setFetchError("No nodes in current group."); return; }
      setIsFetchingHistory(true); setFetchError(null);
      const start = new Date(historyStart); const end = new Date(historyEnd);
      if (start >= end) { setFetchError("Start time must be before end time."); setIsFetchingHistory(false); return; }
      setDataPoints({});
      let successCount = 0; let failureCount = 0; let lastErrorMessage = "";
      
      const startTs = start.getTime();
      const endTs = end.getTime();

      for (const node of nodes) {
          if (hiddenNodeIds.has(node.nodeId)) continue;
          try {
              const res = await opcuaService.readHistory(sessionId, node.nodeId, start, end);
              if (res.statusCode === 'Good') {
                  const points: TrendPoint[] = res.data.map(d => ({ v: typeof d.value === 'number' ? d.value : (Number(d.value) || 0), t: new Date(d.timestamp).getTime() }));
                  points.sort((a,b) => a.t - b.t);
                  setDataPoints(prev => ({ ...prev, [node.nodeId]: points }));
                  if (points.length > 0) successCount++;
              } else { failureCount++; lastErrorMessage = res.statusCode; }
          } catch (e: any) { failureCount++; lastErrorMessage = e.message; }
      }
      setIsFetchingHistory(false);
      if (successCount === 0 && failureCount > 0) setFetchError(`Fetch Failed: ${lastErrorMessage}`);
      else if (successCount === 0 && failureCount === 0) setFetchError("No data found.");
      else {
          // Switch to History view logic
          setMode('HISTORY');
          const duration = endTs - startTs;
          setTimeWindow(duration);
          // Set offset so that the visible end aligns with the fetched end time
          // visibleEnd = now - offset  =>  offset = now - visibleEnd
          const offset = Date.now() - endTs;
          setTimeOffset(offset);
          setIsLiveFollow(false);
          // Pause live updates
          setIsPaused(true);
      }
  };

  // --- INTERACTION HANDLERS ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
      if (viewMode === 'SPLIT' && !maximizedNodeId) return; // Use native scroll for grid

      e.preventDefault();
      
      if (controlAxis === 'X') {
          // X-Axis Zoom (Time Window)
          const zoomFactor = 1.1;
          let newWindow = timeWindow;
          if (e.deltaY < 0) newWindow = timeWindow / zoomFactor; else newWindow = timeWindow * zoomFactor;
          newWindow = Math.max(10, Math.min(newWindow, 86400000)); // Min 10ms
          setTimeWindow(newWindow);
          // Auto-disable follow on zoom
          if (isLiveFollow) setIsLiveFollow(false);
      } else {
          // Y-Axis Zoom (Scale)
          const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
          setYScale(prev => Math.max(0.01, Math.min(prev * zoomFactor, 100)));
      }
  }, [timeWindow, viewMode, maximizedNodeId, isLiveFollow, controlAxis]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
      if (viewMode === 'SPLIT' && !maximizedNodeId) return;
      e.preventDefault();
      
      // Capture pointer to ensure we receive moves even if mouse goes outside
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const target = e.currentTarget as HTMLElement;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const LEFT_MARGIN = 50; const BOTTOM_MARGIN = 30; const RIGHT_MARGIN = 20; const TOP_MARGIN = 10;
      const graphW = rect.width - LEFT_MARGIN - RIGHT_MARGIN;
      const graphH = rect.height - BOTTOM_MARGIN - TOP_MARGIN;

      // Consistent time reference for hit testing
      const now = getChartNow();
      const visibleEnd = now - timeOffset;
      const visibleStart = visibleEnd - timeWindow;

      // Hit Test Threshold
      const HIT_DIST = 15;

      // Check Cursor Interactions if enabled
      if (showXCursors) {
          // Re-calculate pixel positions based on CURRENT time state
          const xAPix = LEFT_MARGIN + ((xCursorA! - visibleStart) / timeWindow) * graphW;
          const xBPix = LEFT_MARGIN + ((xCursorB! - visibleStart) / timeWindow) * graphW;
          
          if (Math.abs(x - xAPix) < HIT_DIST) { setDraggingCursor('XA'); return; }
          if (Math.abs(x - xBPix) < HIT_DIST) { setDraggingCursor('XB'); return; }
      }

      if (showYCursors) {
          // Y logic relies on cache from last render, which should be accurate enough
          // since re-renders happen on tick or data update
          const yAPix = cursorPixelCache.current.yA;
          const yBPix = cursorPixelCache.current.yB;
          
          if (yAPix !== null && Math.abs(y - yAPix) < HIT_DIST) { setDraggingCursor('YA'); return; }
          if (yBPix !== null && Math.abs(y - yBPix) < HIT_DIST) { setDraggingCursor('YB'); return; }
      }

      isDraggingRef.current = true;
      dragStartRef.current = { 
          x: e.clientX, 
          y: e.clientY,
          tOffset: timeOffset,
          yOffset: yOffset
      };
      // Disable auto follow if panning X
      if (controlAxis === 'X' && isLiveFollow) setIsLiveFollow(false);
  }, [timeOffset, yOffset, viewMode, maximizedNodeId, isLiveFollow, controlAxis, showXCursors, showYCursors, xCursorA, xCursorB, timeWindow, getChartNow]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setMousePos({ x, y });
      
      const LEFT_MARGIN = 50; const BOTTOM_MARGIN = 30; const RIGHT_MARGIN = 20; const TOP_MARGIN = 10;
      const graphW = rect.width - LEFT_MARGIN - RIGHT_MARGIN;
      const graphH = rect.height - BOTTOM_MARGIN - TOP_MARGIN;

      // Visual Feedback: Hover Detection (When not dragging)
      if (!draggingCursor && !isDraggingRef.current) {
          const HIT_DIST = 15;
          let newHoverCursor = null;
          
          if (showXCursors) {
              const now = getChartNow();
              const visibleEnd = now - timeOffset;
              const visibleStart = visibleEnd - timeWindow;
              const xAPix = LEFT_MARGIN + ((xCursorA! - visibleStart) / timeWindow) * graphW;
              const xBPix = LEFT_MARGIN + ((xCursorB! - visibleStart) / timeWindow) * graphW;
              if (Math.abs(x - xAPix) < HIT_DIST || Math.abs(x - xBPix) < HIT_DIST) newHoverCursor = 'col-resize';
          }
          if (!newHoverCursor && showYCursors) {
              const yAPix = cursorPixelCache.current.yA;
              const yBPix = cursorPixelCache.current.yB;
              if ((yAPix !== null && Math.abs(y - yAPix) < HIT_DIST) || (yBPix !== null && Math.abs(y - yBPix) < HIT_DIST)) newHoverCursor = 'row-resize';
          }
          if (newHoverCursor !== hoverCursor) setHoverCursor(newHoverCursor);
      }

      // Handle Cursor Dragging
      if (draggingCursor) {
          const now = getChartNow();
          const visibleEnd = now - timeOffset;
          const visibleStart = visibleEnd - timeWindow;

          if (draggingCursor === 'XA' || draggingCursor === 'XB') {
              // Convert X pixel to Timestamp
              const t = visibleStart + ((x - LEFT_MARGIN) / graphW) * timeWindow;
              if (draggingCursor === 'XA') setXCursorA(t);
              else setXCursorB(t);
          } else if (draggingCursor === 'YA' || draggingCursor === 'YB') {
              // Convert Y pixel to Value
              // We need to re-calculate range dynamically to map pixel back to value
              const { globalMin, globalMax } = rangeCache.current;
              let range = globalMax - globalMin;
              if (range === 0) range = 2;
              
              const baseCenter = (globalMin + globalMax) / 2;
              const effectiveCenter = baseCenter + (yOffset * range);
              const visibleRange = range / yScale;
              const finalMin = effectiveCenter - (visibleRange / 2);
              
              // Map Y pixel (from top) to Value
              // y = (height - BOTTOM) - ( (v - finalMin) / finalRange ) * graphH
              // (v - finalMin) / finalRange = (height - BOTTOM - y) / graphH
              // v = finalMin + ( (height - BOTTOM - y) / graphH * finalRange )
              // Note: finalRange == visibleRange
              const val = finalMin + (((rect.height - BOTTOM_MARGIN - y) / graphH) * visibleRange);
              
              if (draggingCursor === 'YA') setYCursorA(val);
              else setYCursorB(val);
          }
          return; // Skip panning if dragging cursor
      }
      
      if (isDraggingRef.current && dragStartRef.current) {
          if (controlAxis === 'X') {
              // PAN X
              const deltaX = e.clientX - dragStartRef.current.x;
              const timeShift = (deltaX / rect.width) * timeWindow;
              let newOffset = dragStartRef.current.tOffset + timeShift;
              // Allow panning into future slightly or past
              if (newOffset < -1000) newOffset = -1000; 
              setTimeOffset(newOffset);
          } else {
              const deltaY = e.clientY - dragStartRef.current.y;
              // Normalize pan movement relative to element height
              const percentShift = deltaY / rect.height;
              setYOffset(dragStartRef.current.yOffset + (percentShift / yScale)); 
          }
      }
  }, [timeWindow, controlAxis, yScale, draggingCursor, isPaused, frozenTime, timeOffset, yOffset, hoverCursor, showXCursors, showYCursors, xCursorA, xCursorB, getChartNow]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => { 
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      isDraggingRef.current = false; 
      dragStartRef.current = null; 
      setDraggingCursor(null);
  }, []);
  
  const handleMouseLeave = useCallback(() => { 
      // Do NOT cancel dragging here, Pointer Capture handles the "out of bounds" scenario.
      // Just clear the crosshair visual.
      setMousePos(null); 
      setHoverCursor(null);
  }, []);

  const handleResetY = () => {
      setYScale(1);
      setYOffset(0);
  };

  // Cursor Refs for hit testing
  const cursorPixelCache = useRef<{yA: number|null, yB: number|null}>({ yA: null, yB: null });
  const rangeCache = useRef<{globalMin: number, globalMax: number}>({ globalMin: 0, globalMax: 100 });

  // Toggle Cursors
  const toggleXCursors = () => {
      if (showXCursors) setShowXCursors(false);
      else {
          const now = getChartNow();
          const mid = now - timeOffset - (timeWindow / 2);
          setXCursorA(mid - (timeWindow / 4));
          setXCursorB(mid + (timeWindow / 4));
          setShowXCursors(true);
      }
  };

  const toggleYCursors = () => {
      if (showYCursors) setShowYCursors(false);
      else {
          // Initialize near center of current view
          const { globalMin, globalMax } = rangeCache.current;
          const range = globalMax - globalMin || 10;
          const mid = (globalMin + globalMax) / 2;
          setYCursorA(mid - (range / 4));
          setYCursorB(mid + (range / 4));
          setShowYCursors(true);
      }
  };

  // Actions
  const handleAddGroup = () => { const newGroup = { id: Math.random().toString(36).substr(2,9), name: `趋势组 ${groups.length + 1}`, nodes: [] }; updateGroupsStructurally([...groups, newGroup]); setActiveGroupId(newGroup.id); };
  const handleTabClick = (e: React.MouseEvent, groupId: string, index: number) => { setActiveGroupId(groupId); const newSelected = new Set(selectedGroupIds); if (e.ctrlKey || e.metaKey) { if (newSelected.has(groupId)) newSelected.delete(groupId); else newSelected.add(groupId); setLastClickedGroupId(groupId); } else { newSelected.clear(); newSelected.add(groupId); setLastClickedGroupId(groupId); } setSelectedGroupIds(newSelected); };
  const toggleVisibility = (id: string) => { setHiddenNodeIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const deleteSelectedNodes = () => { if (selectedNodeIds.size === 0) return; const newGroups = groups.map(g => g.id === activeGroupId ? { ...g, nodes: g.nodes.filter(n => !selectedNodeIds.has(n.nodeId)) } : g); updateGroupsStructurally(newGroups); setSelectedNodeIds(new Set()); };
  const clearNodes = () => { const newGroups = groups.map(g => g.id === activeGroupId ? { ...g, nodes: [] } : g); updateGroupsStructurally(newGroups); };
  
  const exportCsv = () => {
      if (nodes.length === 0) return;
      const visibleNodes = nodes.filter(n => !hiddenNodeIds.has(n.nodeId));
      if (visibleNodes.length === 0) return;
      const maxLen = Math.max(...visibleNodes.map(n => (dataPoints[n.nodeId] || []).length));
      const header = ["Time", ...visibleNodes.map(n => n.nodeId)];
      const rows = [];
      for (let i = 0; i < maxLen; i++) {
          const row: (number | string)[] = [];
          const firstData = dataPoints[visibleNodes[0].nodeId];
          row.push(firstData && firstData[i] ? new Date(firstData[i].t).toISOString() : '');
          visibleNodes.forEach(n => { const p = dataPoints[n.nodeId]?.[i]; row.push(p ? p.v : ''); });
          rows.push(row.join(','));
      }
      const blob = new Blob(['\uFEFF' + header.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' }); 
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `trend_${activeGroup?.name}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const startRenamingGroup = (e: React.MouseEvent | undefined, g: BatchGroup) => { if (e) e.stopPropagation(); setEditingGroupId(g.id); setEditGroupName(g.name); setContextMenu(null); };
  const saveGroupName = () => { if (editingGroupId && editGroupName.trim()) { const newGroups = groups.map(g => g.id === editingGroupId ? { ...g, name: editGroupName.trim() } : g); updateGroupsStructurally(newGroups); } setEditingGroupId(null); };
  const deleteSingleGroup = (e: React.MouseEvent | undefined, id: string) => { if(e) e.stopPropagation(); const rem = groups.filter(g => g.id !== id); updateGroupsStructurally(rem); if(rem.length > 0) { if (activeGroupId === id || !rem.find(g => g.id === activeGroupId)) setActiveGroupId(rem[0].id); } else { setActiveGroupId(''); } setContextMenu(null); };
  const moveGroup = (direction: 'left' | 'right') => { if (!contextMenu) return; const index = groups.findIndex(g => g.id === contextMenu.groupId); if (index === -1) return; const newGroups = [...groups]; if (direction === 'left' && index > 0) [newGroups[index], newGroups[index - 1]] = [newGroups[index - 1], newGroups[index]]; else if (direction === 'right' && index < newGroups.length - 1) [newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]]; updateGroupsStructurally(newGroups); setContextMenu(null); };
  const clearGroup = () => { if (!contextMenu) return; const newGroups = groups.map(g => g.id === contextMenu.groupId ? { ...g, nodes: [] } : g); updateGroupsStructurally(newGroups); setContextMenu(null); };

  // --- SCALE CALCULATOR ---
  const calculateBaseRange = (data: TrendPoint[], minT: number, maxT: number) => {
      // 1. Determine Raw Min/Max
      let min = Infinity;
      let max = -Infinity;
      
      if (yAxisMode === 'fixed') {
          min = yMin;
          max = yMax;
      } else {
          // Auto Mode logic
          let hasPoints = false;
          for (let i = 0; i < data.length; i++) {
              const p = data[i];
              if (p.t >= minT && p.t <= maxT) {
                  if (p.v < min) min = p.v;
                  if (p.v > max) max = p.v;
                  hasPoints = true;
              }
          }
          if (!hasPoints) { 
              if (data.length > 0) { min = data[data.length-1].v - 1; max = data[data.length-1].v + 1; }
              else { min = 0; max = 10; }
          }
          if (min === max) { min -= 1; max += 1; }
          
          // Add default padding for Auto
          const padding = (max - min) * 0.1; 
          min -= padding;
          max += padding;
      }
      return { min, max };
  };

  // --- ADAPTIVE GRID STEP CALCULATOR ---
  const getAdaptiveStep = (range: number, availablePixels: number, minPixelsPerTick: number = 60, userInterval: number = 0) => {
      // SAFETY: Prevent division by zero and infinite loops if container size is invalid
      if (availablePixels <= 0 || range <= 0) return Math.max(userInterval || 100, 1);

      // If user specified an interval, try to use multiples of it
      let step = userInterval > 0 ? userInterval : range / (availablePixels / minPixelsPerTick);
      
      const pxPerUnit = availablePixels / range;
      
      // If the user step results in too crowded text (less than minPixelsPerTick), scale it up
      // SAFETY: Limit iterations to prevent infinite loop if conditions are weird
      let safetyCounter = 0;
      while (step * pxPerUnit < minPixelsPerTick && safetyCounter < 50) {
          step *= 2; 
          safetyCounter++;
      }
      
      // If standard adaptive logic (no user pref or user pref failed)
      if (userInterval <= 0) {
          const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
          const residual = step / magnitude;
          if (residual > 5) step = 10 * magnitude;
          else if (residual > 2) step = 5 * magnitude;
          else if (residual > 1) step = 2 * magnitude;
          else step = 1 * magnitude;
      }

      return step;
  };

  // --- CORE DRAWING FUNCTION (Reusable) ---
  const drawTrendOnCanvas = (canvas: HTMLCanvasElement, targetNodes: OpcNode[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Handle Resizing based on parent
      if (canvas.parentElement) { 
          canvas.width = canvas.parentElement.clientWidth; 
          canvas.height = canvas.parentElement.clientHeight; 
      }
      const width = canvas.width; 
      const height = canvas.height;
      
      // SAFETY: Abort if canvas has no dimensions to prevent calculation errors
      if (width <= 0 || height <= 0) return;

      const LEFT_MARGIN = 50; const BOTTOM_MARGIN = 30; const RIGHT_MARGIN = 20; const TOP_MARGIN = 10;
      const graphW = width - LEFT_MARGIN - RIGHT_MARGIN; 
      const graphH = height - BOTTOM_MARGIN - TOP_MARGIN;
      
      // SAFETY: Check graph dimensions
      if (graphW <= 0 || graphH <= 0) return;

      ctx.clearRect(0, 0, width, height);

      // FREEZE LOGIC: Use frozenTime if paused to stop chart scrolling
      const now = getChartNow();
      const visibleEnd = now - timeOffset;
      const visibleStart = visibleEnd - timeWindow;

      const visibleNodes = targetNodes.filter(n => !hiddenNodeIds.has(n.nodeId));
      if (visibleNodes.length === 0) { 
          ctx.fillStyle = "#94a3b8"; ctx.font = "14px sans-serif"; ctx.textAlign = "center"; 
          ctx.fillText("无可见数据", width/2, height/2); return; 
      }

      try {
          // -- GRID & AXES --
          ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1; ctx.beginPath();
          ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#64748b"; ctx.font = "10px sans-serif";

          // X-Axis Grid (Adaptive)
          const safeXInterval = getAdaptiveStep(timeWindow, graphW, 60, xGridInterval);
          const startGridT = Math.ceil(visibleStart / safeXInterval) * safeXInterval;
          
          for (let t = startGridT; t <= visibleEnd; t += safeXInterval) {
              const x = LEFT_MARGIN + ((t - visibleStart) / timeWindow) * graphW;
              if (Number.isFinite(x)) {
                  ctx.moveTo(x, TOP_MARGIN); ctx.lineTo(x, height - BOTTOM_MARGIN);
                  ctx.fillText(formatTimeLabel(t, true).split(' ')[1], x, height - BOTTOM_MARGIN + 5);
              }
          }

          // Y-Axis Grid (Adaptive + Zoom + Pan)
          let globalMin = Infinity; let globalMax = -Infinity;
          
          // 1. Calculate Base Range (Auto or Fixed)
          visibleNodes.forEach(n => {
              const d = dataPoints[n.nodeId] || [];
              const { min, max } = calculateBaseRange(d, visibleStart, visibleEnd);
              if (min < globalMin) globalMin = min;
              if (max > globalMax) globalMax = max;
          });
          if (globalMin === Infinity) { globalMin = 0; globalMax = 10; }

          // Update Range Cache for mouse interaction
          rangeCache.current = { globalMin, globalMax };

          // 2. Apply Zoom & Pan Math
          let range = globalMax - globalMin;
          if (range === 0) range = 2; // Prevent divide by zero
          
          const baseCenter = (globalMin + globalMax) / 2;
          const effectiveCenter = baseCenter + (yOffset * range);
          const visibleRange = range / yScale;
          const finalMin = effectiveCenter - (visibleRange / 2);
          const finalMax = effectiveCenter + (visibleRange / 2);
          const finalRange = finalMax - finalMin;

          const safeYInterval = getAdaptiveStep(finalRange, graphH, 30, yGridInterval);
          const startGridY = Math.ceil(finalMin / safeYInterval) * safeYInterval;

          ctx.textAlign = "right"; ctx.textBaseline = "middle";
          for (let v = startGridY; v <= finalMax; v += safeYInterval) {
              if (v < finalMin) continue; 
              const y = (height - BOTTOM_MARGIN) - ((v - finalMin) / finalRange) * graphH;
              if (Number.isFinite(y)) {
                  ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(width - RIGHT_MARGIN, y);
                  ctx.fillText(Number(v).toFixed(2), LEFT_MARGIN - 5, y);
              }
          }
          ctx.stroke();
          ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.strokeRect(LEFT_MARGIN, TOP_MARGIN, graphW, graphH);

          // -- CURVES --
          visibleNodes.forEach((node) => {
              const originalIdx = nodes.findIndex(n => n.nodeId === node.nodeId);
              const colorIdx = originalIdx !== -1 ? originalIdx : 0;
              const points = dataPoints[node.nodeId] || [];
              if (points.length < 1) return; // Allow single point
              
              const color = colors[colorIdx % colors.length];
              const isHovered = hoveredNodeId === node.nodeId;
              const isDimmed = hoveredNodeId !== null && !isHovered && targetNodes.length > 1; 
              
              if (points.length === 1) {
                  const p = points[0];
                  if (p.t >= visibleStart && p.t <= visibleEnd) {
                      const x = LEFT_MARGIN + ((p.t - visibleStart) / timeWindow) * graphW;
                      const y = (height - BOTTOM_MARGIN) - ((p.v - finalMin) / finalRange) * graphH;
                      if (Number.isFinite(x) && Number.isFinite(y)) {
                          ctx.fillStyle = color;
                          ctx.beginPath(); ctx.arc(x, y, 3, 0, 2*Math.PI); ctx.fill();
                      }
                  }
              } else {
                  ctx.beginPath();
                  ctx.lineWidth = isHovered ? 3 : 2; 
                  ctx.strokeStyle = color; ctx.globalAlpha = isDimmed ? 0.2 : 1.0; ctx.lineJoin = 'round';

                  let hasStarted = false;
                  for (let j = 0; j < points.length; j++) {
                      const p = points[j];
                      if (p.t < visibleStart && (j+1 < points.length && points[j+1].t < visibleStart)) continue;
                      if (p.t > visibleEnd) {
                          const x = LEFT_MARGIN + ((p.t - visibleStart) / timeWindow) * graphW;
                          const y = (height - BOTTOM_MARGIN) - ((p.v - finalMin) / finalRange) * graphH;
                          if (!hasStarted) { if(Number.isFinite(x) && Number.isFinite(y)) ctx.moveTo(x, y); } 
                          else { if(Number.isFinite(x) && Number.isFinite(y)) ctx.lineTo(x, y); }
                          break;
                      }
                      const x = LEFT_MARGIN + ((p.t - visibleStart) / timeWindow) * graphW;
                      let y = (height - BOTTOM_MARGIN) - ((p.v - finalMin) / finalRange) * graphH;
                      
                      if (!hasStarted) { 
                          if(Number.isFinite(x) && Number.isFinite(y)) { ctx.moveTo(x, y); hasStarted = true; }
                      } 
                      else {
                          if (interpolationMode === 'step') {
                              const prev = points[j-1];
                              const prevY = (height - BOTTOM_MARGIN) - ((prev.v - finalMin) / finalRange) * graphH;
                              if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(prevY)) {
                                  ctx.lineTo(x, prevY); ctx.lineTo(x, y);
                              }
                          } else { 
                              if(Number.isFinite(x) && Number.isFinite(y)) ctx.lineTo(x, y); 
                          }
                      }
                  }
                  ctx.stroke(); ctx.globalAlpha = 1.0;
              }
          });

          // -- X-AXIS CURSORS --
          if (showXCursors) {
              const drawXCursor = (val: number, color: string, label: string) => {
                  if (val < visibleStart || val > visibleEnd) return;
                  const x = LEFT_MARGIN + ((val - visibleStart) / timeWindow) * graphW;
                  if (!Number.isFinite(x)) return;

                  ctx.beginPath();
                  ctx.moveTo(x, TOP_MARGIN);
                  ctx.lineTo(x, height - BOTTOM_MARGIN);
                  ctx.lineWidth = 2;
                  ctx.strokeStyle = color;
                  ctx.setLineDash([5, 5]);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  
                  // Handle
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.moveTo(x, TOP_MARGIN);
                  ctx.lineTo(x - 5, TOP_MARGIN - 5);
                  ctx.lineTo(x + 5, TOP_MARGIN - 5);
                  ctx.fill();
                  
                  // Label
                  ctx.font = "bold 10px sans-serif";
                  ctx.fillText(label, x + 4, height - BOTTOM_MARGIN - 10);
              };

              if (xCursorA !== null) drawXCursor(xCursorA, '#8b5cf6', 'A');
              if (xCursorB !== null) drawXCursor(xCursorB, '#f97316', 'B');
              
              // Delta Display
              if (xCursorA !== null && xCursorB !== null) {
                  const delta = Math.abs(xCursorA - xCursorB);
                  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
                  ctx.fillRect(LEFT_MARGIN + 10, TOP_MARGIN + 10, 140, 50);
                  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.strokeRect(LEFT_MARGIN + 10, TOP_MARGIN + 10, 140, 50);
                  ctx.fillStyle = "#1e293b"; ctx.textAlign = "left"; 
                  ctx.fillText(`ΔX: ${formatDuration(delta)}`, LEFT_MARGIN + 20, TOP_MARGIN + 30);
                  ctx.fillStyle = "#64748b";
                  ctx.fillText(`A: ${formatTimeLabel(xCursorA)}`, LEFT_MARGIN + 20, TOP_MARGIN + 42);
                  ctx.fillText(`B: ${formatTimeLabel(xCursorB)}`, LEFT_MARGIN + 20, TOP_MARGIN + 54);
              }
          }

          // -- Y-AXIS CURSORS --
          cursorPixelCache.current = { yA: null, yB: null };
          if (showYCursors) {
              const drawYCursor = (val: number, color: string, label: string) => {
                  if (val < finalMin || val > finalMax) return null;
                  const y = (height - BOTTOM_MARGIN) - ((val - finalMin) / finalRange) * graphH;
                  if (!Number.isFinite(y)) return null;

                  ctx.beginPath();
                  ctx.moveTo(LEFT_MARGIN, y);
                  ctx.lineTo(width - RIGHT_MARGIN, y);
                  ctx.lineWidth = 2;
                  ctx.strokeStyle = color;
                  ctx.setLineDash([5, 5]);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  
                  // Handle
                  ctx.fillStyle = color;
                  ctx.beginPath();
                  ctx.moveTo(width - RIGHT_MARGIN, y);
                  ctx.lineTo(width - RIGHT_MARGIN + 5, y - 5);
                  ctx.lineTo(width - RIGHT_MARGIN + 5, y + 5);
                  ctx.fill();

                  // Label
                  ctx.textAlign = "right";
                  ctx.font = "bold 10px sans-serif";
                  ctx.fillText(label, width - RIGHT_MARGIN - 5, y - 4);
                  return y;
              };

              const yAPix = yCursorA !== null ? drawYCursor(yCursorA, '#ec4899', 'A') : null;
              const yBPix = yCursorB !== null ? drawYCursor(yCursorB, '#14b8a6', 'B') : null;
              cursorPixelCache.current = { yA: yAPix, yB: yBPix };

              // Delta Display
              if (yCursorA !== null && yCursorB !== null) {
                  const delta = Math.abs(yCursorA - yCursorB);
                  const xPos = width - RIGHT_MARGIN - 150;
                  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
                  ctx.fillRect(xPos, TOP_MARGIN + 10, 140, 50);
                  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.strokeRect(xPos, TOP_MARGIN + 10, 140, 50);
                  ctx.fillStyle = "#1e293b"; ctx.textAlign = "left"; 
                  ctx.fillText(`ΔY: ${delta.toFixed(4)}`, xPos + 10, TOP_MARGIN + 30);
                  ctx.fillStyle = "#64748b";
                  ctx.fillText(`A: ${yCursorA.toFixed(4)}`, xPos + 10, TOP_MARGIN + 42);
                  ctx.fillText(`B: ${yCursorB.toFixed(4)}`, xPos + 10, TOP_MARGIN + 54);
              }
          }

          // -- CROSSHAIR (Only if enabled AND not using cursors) --
          if (showCrosshair && !showYCursors && !showXCursors && (targetNodes.length > 1 || maximizedNodeId)) { // Overlay or Maximized
              if (mousePos && mousePos.x >= LEFT_MARGIN && mousePos.x <= width - RIGHT_MARGIN && mousePos.y >= TOP_MARGIN && mousePos.y <= height - BOTTOM_MARGIN) {
                  const { x } = mousePos;
                  ctx.beginPath(); ctx.moveTo(x, TOP_MARGIN); ctx.lineTo(x, height - BOTTOM_MARGIN);
                  ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)'; ctx.setLineDash([4, 2]); ctx.stroke(); ctx.setLineDash([]);
                  const mouseTime = visibleStart + ((x - LEFT_MARGIN) / graphW) * timeWindow;
                  const timeText = formatTimeLabel(mouseTime, true);
                  ctx.fillStyle = '#1e293b'; ctx.fillRect(x - 60, height - 25, 120, 20);
                  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(timeText, x, height - 12);

                  visibleNodes.forEach((node) => {
                      const originalIdx = nodes.findIndex(n => n.nodeId === node.nodeId);
                      const colorIdx = originalIdx !== -1 ? originalIdx : 0;
                      
                      const points = dataPoints[node.nodeId] || [];
                      if (points.length === 0) return;
                      let closest = points[0]; let minDist = Math.abs(points[0].t - mouseTime);
                      for(let j=1; j<points.length; j++) { const dist = Math.abs(points[j].t - mouseTime); if (dist < minDist) { minDist = dist; closest = points[j]; } }
                      if (closest.t >= visibleStart && closest.t <= visibleEnd) {
                          const cx = LEFT_MARGIN + ((closest.t - visibleStart) / timeWindow) * graphW;
                          const cy = (height - BOTTOM_MARGIN) - ((closest.v - finalMin) / finalRange) * graphH;
                          if (Number.isFinite(cx) && Number.isFinite(cy)) {
                              const color = colors[colorIdx % colors.length];
                              ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2*Math.PI); ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
                              const label = closest.v.toFixed(2);
                              const labelW = ctx.measureText(label).width + 10;
                              ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(cx + 8, cy - 10, labelW, 20); ctx.strokeRect(cx + 8, cy - 10, labelW, 20);
                              ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(label, cx + 13, cy);
                          }
                      }
                  });
              }
          }
      } catch(e) {
          console.error("Canvas Render Error:", e);
      }
  };

  // --- DRAW EFFECTS ---
  
  // 1. Overlay / Maximized View
  useEffect(() => {
      if ((viewMode === 'OVERLAY' || maximizedNodeId) && canvasRef.current) {
          const targetNodes = maximizedNodeId ? nodes.filter(n => n.nodeId === maximizedNodeId) : nodes;
          drawTrendOnCanvas(canvasRef.current, targetNodes);
      }
  }, [dataPoints, hiddenNodeIds, viewMode, mousePos, interpolationMode, historyLimit, colors, nodes, mode, timeWindow, timeOffset, yAxisMode, yMin, yMax, xGridInterval, yGridInterval, maximizedNodeId, isPaused, frozenTime, yScale, yOffset, showXCursors, showYCursors, xCursorA, xCursorB, yCursorA, yCursorB, showCrosshair, arrayIndices]);

  // 2. Split View (Grid)
  useEffect(() => {
      if (viewMode === 'SPLIT' && !maximizedNodeId) {
          // Iterate all visible nodes and draw to their respective canvases
          nodes.forEach(node => {
              if (hiddenNodeIds.has(node.nodeId)) return;
              const canvas = splitCanvasRefs.current.get(node.nodeId);
              if (canvas) {
                  drawTrendOnCanvas(canvas, [node]);
              }
          });
          
          // Cleanup Ref Map
          const currentIds = new Set(nodes.map(n => n.nodeId));
          for (const key of splitCanvasRefs.current.keys()) {
              if (!currentIds.has(key)) {
                  splitCanvasRefs.current.delete(key);
              }
          }
      }
  }, [dataPoints, hiddenNodeIds, viewMode, maximizedNodeId, interpolationMode, historyLimit, colors, nodes, mode, timeWindow, timeOffset, yAxisMode, yMin, yMax, xGridInterval, yGridInterval, isPaused, frozenTime, yScale, yOffset, showXCursors, showYCursors, xCursorA, xCursorB, yCursorA, yCursorB, showCrosshair, arrayIndices]); 

  return (
    <div className="flex h-full bg-slate-50 flex-col">
        {contextMenu && (
            <GroupContextMenu 
                x={contextMenu.x} y={contextMenu.y} 
                onClose={() => setContextMenu(null)}
                onRename={() => startRenamingGroup(undefined, groups.find(g => g.id === contextMenu.groupId)!)}
                onDelete={() => deleteSingleGroup(undefined, contextMenu.groupId)}
                onClear={clearGroup}
                onMoveLeft={() => moveGroup('left')}
                onMoveRight={() => moveGroup('right')}
            />
        )}

        {/* TOP BAR: Groups */}
        <div className="flex items-end px-2 pt-2 bg-slate-100/80 border-b border-slate-200 gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 flex-shrink-0 min-h-[40px]">
             {groups.length === 0 && <button onClick={handleAddGroup} className="text-xs text-blue-600 font-bold px-3 py-1 flex items-center gap-1 hover:bg-blue-50 rounded"><Plus className="w-3.5 h-3.5"/> 新建趋势组</button>}
             {groups.map((group, idx) => (
                  <div 
                    key={group.id} 
                    onClick={(e) => handleTabClick(e, group.id, idx)} 
                    onDoubleClick={(e) => startRenamingGroup(e, group)} 
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id }); }}
                    className={`group relative flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-xs font-bold cursor-pointer transition-all border-t border-x select-none flex-shrink-0 min-w-[120px] max-w-[200px] h-8 ${activeGroupId === group.id ? 'bg-white border-slate-200 text-sky-700 shadow-sm translate-y-[1px] z-10' : 'bg-slate-200/50 border-transparent text-slate-500 hover:bg-slate-200'} ${selectedGroupIds.has(group.id) && activeGroupId !== group.id ? 'bg-sky-50 border-sky-200 text-sky-800 ring-1 ring-inset ring-sky-200' : ''}`}
                  >
                      {editingGroupId === group.id ? (<input autoFocus className="w-full bg-white border border-blue-400 rounded px-1 outline-none h-6" value={editGroupName} onChange={e => setEditGroupName(e.target.value)} onBlur={saveGroupName} onKeyDown={e => e.key === 'Enter' && saveGroupName()} onClick={e => e.stopPropagation()} />) : (<span className="truncate">{group.name}</span>)}
                      <span className="px-1.5 rounded-full text-[9px] ml-auto flex-shrink-0 bg-slate-100 text-slate-500">{group.nodes.length}</span>
                      <button onClick={(e) => deleteSingleGroup(e, group.id)} className="p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 transition-all"><X className="w-3 h-3" /></button>
                  </div>
              ))}
              <button onClick={handleAddGroup} className="p-1 mb-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600" title={t.trend.addGroups}><Plus className="w-4 h-4"/></button>
        </div>

        {/* MAIN CONTENT SPLIT */}
        <div className="flex-1 flex min-h-0">
            {/* LEFT: Node List */}
            <div ref={sidebarRef} style={{ width: sidebarWidth }} className="bg-white border-r border-slate-200 flex flex-col flex-shrink-0 relative">
                <div className="p-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><List className="w-4 h-4 text-slate-500" /> {t.trend.title}</h3>
                    <div className="flex gap-1">
                        <button onClick={exportCsv} disabled={nodes.length === 0} className="p-1.5 rounded hover:bg-slate-200 text-slate-500 transition-colors disabled:opacity-30" title={t.trend.exportCsv}><Download className="w-4 h-4" /></button>
                        {mode === 'LIVE' && ( <button onClick={togglePause} className="p-1.5 rounded hover:bg-slate-200 text-slate-500 transition-colors" title={isPaused ? "继续" : "暂停"}> {isPaused ? <Play className="w-4 h-4 text-emerald-500" /> : <Pause className="w-4 h-4 text-amber-500" />} </button> )}
                        <button onClick={deleteSelectedNodes} disabled={selectedNodeIds.size === 0} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30" title={t.trend.deleteSelected}><Trash2 className="w-4 h-4" /></button>
                        <button onClick={clearNodes} disabled={nodes.length === 0} className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30" title={t.trend.clear}><X className="w-4 h-4" /></button>
                    </div>
                </div>
                
                {/* Mode Selector */}
                <div className="flex p-2 bg-slate-100 border-b border-slate-200">
                    <button onClick={() => setMode('LIVE')} className={`flex-1 text-xs font-bold py-1 rounded transition-all ${mode === 'LIVE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>实时 (Live)</button>
                    <button onClick={() => setMode('HISTORY')} className={`flex-1 text-xs font-bold py-1 rounded transition-all ${mode === 'HISTORY' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>历史 (History)</button>
                </div>

                <div className="flex-1 overflow-y-auto p-0 select-none scrollbar-thin scrollbar-thumb-slate-300">
                    {nodes.length === 0 && ( <div className="text-xs text-slate-400 p-8 text-center italic"> {t.trend.noNodes}<br/>{t.trend.addFromRW} </div> )}
                    {nodes.map((node, i) => {
                        const isVisible = !hiddenNodeIds.has(node.nodeId);
                        const isSelected = selectedNodeIds.has(node.nodeId);
                        const isHovered = hoveredNodeId === node.nodeId;
                        const isFrozen = frozenNodeIds.has(node.nodeId);
                        const isError = indexErrors[node.nodeId];
                        const color = colors[i % colors.length];
                        const points = dataPoints[node.nodeId];
                        const lastPoint = points && points.length > 0 ? points[points.length-1] : null;
                        const lastVal = lastPoint ? lastPoint.v : 0;
                        const isInteger = isDiscreteType(node.dataType) && node.dataType !== 'Boolean';
                        
                        // Check if node is an Array (using value type or dataType name convention)
                        const isArray = isArrayLike(node.value) || (node.dataType && node.dataType.includes('['));
                        
                        return (
                        <div 
                            key={node.nodeId} 
                            onClick={(e) => handleRowClick(e, node, i)}
                            onMouseEnter={() => setHoveredNodeId(node.nodeId)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            className={`flex items-center gap-2 p-2 border-b border-slate-100 text-xs cursor-pointer transition-colors group ${isSelected ? 'bg-sky-100 text-sky-900 border-sky-200' : isHovered ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                        >
                            <div 
                                className="text-slate-400 hover:text-slate-600 cursor-pointer flex-shrink-0 pl-1 p-1" 
                                onClick={(e) => { e.stopPropagation(); toggleVisibility(node.nodeId); }}
                                title={t.trend.visibility}
                            >
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-opacity ${!isVisible ? 'opacity-30 ring-1 ring-slate-300' : 'opacity-100'}`} style={{ backgroundColor: isVisible ? color : 'transparent' }}></div>
                            </div>
                            
                            <div className="flex-1 min-w-0 flex flex-col pointer-events-none">
                                <div className={`truncate font-mono ${isVisible ? '' : 'text-slate-400 line-through'} ${isHovered || isSelected ? 'font-bold' : ''}`} title={node.nodeId}> 
                                    {node.displayName && node.displayName !== node.nodeId ? (
                                        <>
                                            <span className="font-bold block truncate">{node.displayName}</span>
                                            <span className="text-[10px] text-slate-400 block truncate">{node.nodeId}</span>
                                        </>
                                    ) : (
                                        node.nodeId
                                    )}
                                </div>
                                {isArray && (
                                    <div className="flex items-center gap-1 mt-0.5 pointer-events-auto" onClick={e => e.stopPropagation()}>
                                        <ArrayIndexSelector 
                                            nodeId={node.nodeId}
                                            value={node.value}
                                            indexStr={arrayIndices[node.nodeId] || "0"}
                                            onChange={(newStr) => handleArrayIndexChange(node.nodeId, newStr)}
                                        />
                                    </div>
                                )}
                            </div>
                            
                            <button 
                                onClick={(e) => { e.stopPropagation(); toggleNodeFreeze(node.nodeId); }}
                                className={`p-1 rounded hover:bg-slate-200 transition-colors mr-1 ${isFrozen ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100'}`}
                                title={isFrozen ? "Resume Trace" : "Freeze Trace"}
                            >
                                {isFrozen ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
                            </button>

                            <div className={`font-bold font-mono text-right w-16 truncate pointer-events-none ${isVisible ? (isFrozen ? 'text-slate-400' : 'text-slate-800') : 'text-slate-300'}`}> {lastPoint ? (isInteger ? Math.round(lastVal) : Number(lastVal).toFixed(2)) : '-'} </div>

                            {/* New Delete Button */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); deleteSingleNode(node.nodeId); }}
                                className="p-1 rounded hover:bg-red-100 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remove"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )})}
                </div>
                
                {/* Custom Resize Handle with Auto-Expand Toggle */}
                <div 
                    className="absolute top-0 right-0 bottom-0 w-4 -mr-2 z-20 flex flex-col justify-center items-center cursor-col-resize group/handle hover:bg-blue-500/10 transition-colors"
                    onMouseDown={startResizing}
                >
                    <div className="w-px h-full bg-slate-200 group-hover/handle:bg-blue-400 transition-colors"></div>
                    <button 
                        className="absolute top-1/2 -translate-y-1/2 bg-white border border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-400 rounded-full p-0.5 shadow-sm opacity-0 group-hover/handle:opacity-100 transition-opacity transform scale-75"
                        onClick={handleAutoExpand}
                        onMouseDown={e => e.stopPropagation()} 
                        title="Auto Expand / Collapse"
                    >
                        {sidebarWidth > 350 ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
                    </button>
                </div>
            </div>

            {/* RIGHT: Chart Area */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-slate-50">
                {/* CONFIG TOOLBAR */}
                <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap gap-4 items-center justify-between shadow-sm z-10">
                    {mode === 'LIVE' ? (
                        <div className="flex gap-4 items-center">
                            <HybridInput 
                                label="历史长度" 
                                value={historyLimit} 
                                onChange={setHistoryLimit} 
                                options={[100, 300, 500, 1000, 2000]} 
                                unit="点" 
                            />
                            <HybridInput 
                                label="采集周期" 
                                value={samplingInterval} 
                                onChange={setSamplingInterval} 
                                options={[10, 50, 100, 200, 300, 500, 1000]} 
                                unit="ms"
                                min={10} 
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 border border-amber-200 rounded p-0.5 bg-amber-50">
                                <input type="datetime-local" className="bg-transparent text-xs px-1 outline-none text-slate-600" value={historyStart} onChange={e => setHistoryStart(e.target.value)} />
                                <span className="text-slate-400 text-[10px]">至</span>
                                <input type="datetime-local" className="bg-transparent text-xs px-1 outline-none text-slate-600" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} />
                            </div>
                            <button onClick={handleFetchHistory} disabled={isFetchingHistory} className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded shadow-sm disabled:opacity-50"> {isFetchingHistory ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} 查询 </button>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        {/* CONTROL AXIS SELECTOR */}
                        <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200" title="Select Axis to Zoom/Pan">
                            <span className="text-[10px] font-bold text-slate-500 uppercase px-1 mr-1">控制:</span>
                            <button 
                                onClick={() => setControlAxis('X')} 
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-all ${controlAxis === 'X' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <MoveHorizontal className="w-3 h-3" /> X轴
                            </button>
                            <button 
                                onClick={() => setControlAxis('Y')} 
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-all ${controlAxis === 'Y' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <MoveVertical className="w-3 h-3" /> Y轴
                            </button>
                        </div>

                        <div className="h-4 w-px bg-slate-200"></div>

                        <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200" title="Auto Follow">
                            <button onClick={() => { setIsLiveFollow(!isLiveFollow); if(!isLiveFollow) setTimeOffset(0); }} className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-all ${isLiveFollow ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}>
                                {isLiveFollow ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                {isLiveFollow ? "锁定" : "自由"}
                            </button>
                        </div>
                        <div className="h-4 w-px bg-slate-200"></div>
                        <HybridInput 
                            label="时间窗口" 
                            value={timeWindow} 
                            onChange={(val) => { setTimeWindow(val); if(isLiveFollow) setTimeOffset(0); }} 
                            options={[100, 1000, 5000, 10000, 30000, 60000]} 
                            unit="ms"
                            width="w-28"
                        />
                    </div>
                </div>

                {/* AXIS & GRID CONFIG TOOLBAR */}
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-1.5 flex items-center gap-4 text-xs overflow-x-auto scrollbar-thin">
                    <span className="font-bold text-slate-400 flex items-center gap-1 uppercase"><Settings2 className="w-3 h-3"/> Y轴量程:</span>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded p-0.5">
                        <button onClick={() => { setYAxisMode('auto'); handleResetY(); }} className={`px-2 py-0.5 rounded transition-colors ${yAxisMode==='auto' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-100'}`}>自动</button>
                        <button onClick={() => { setYAxisMode('fixed'); handleResetY(); }} className={`px-2 py-0.5 rounded transition-colors ${yAxisMode==='fixed' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-100'}`}>固定</button>
                    </div>
                    
                    {yAxisMode === 'fixed' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                            <span className="text-slate-400">最小值:</span>
                            <input type="number" value={yMin} onChange={e => setYMin(Number(e.target.value))} className="w-12 border border-slate-300 rounded px-1 text-center bg-white outline-none focus:border-indigo-400"/>
                            <span className="text-slate-400">最大值:</span>
                            <input type="number" value={yMax} onChange={e => setYMax(Number(e.target.value))} className="w-12 border border-slate-300 rounded px-1 text-center bg-white outline-none focus:border-indigo-400"/>
                        </div>
                    )}

                    <div className="h-4 w-px bg-slate-300 mx-1"></div>
                    
                    {/* CUSTOM GRID CONTROL */}
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-400 uppercase">X轴网格(ms):</span>
                        <input type="number" min="10" step="10" value={xGridInterval} onChange={e => setXGridInterval(Number(e.target.value))} className="w-12 border border-slate-300 rounded px-1 text-center bg-white outline-none focus:border-blue-400 font-mono"/>
                        
                        <span className="font-bold text-slate-400 uppercase ml-2">Y轴网格:</span>
                        <input type="number" min="0.1" step="0.1" value={yGridInterval} onChange={e => setYGridInterval(Number(e.target.value))} className="w-12 border border-slate-300 rounded px-1 text-center bg-white outline-none focus:border-blue-400 font-mono"/>
                    </div>

                    <div className="flex-1"></div>
                    
                    {/* OSCILLOSCOPE CURSORS */}
                    <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 mr-2">
                        <button onClick={() => setShowCrosshair(!showCrosshair)} className={`px-2 py-0.5 rounded flex items-center gap-1 font-bold text-xs transition-colors ${showCrosshair ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Toggle Mouse Crosshair">
                            <Crosshair className="w-3.5 h-3.5" /> 随动
                        </button>
                        <div className="w-px h-3 bg-slate-300 mx-1"></div>
                        <button onClick={toggleXCursors} className={`px-2 py-0.5 rounded flex items-center gap-1 font-bold text-xs transition-colors ${showXCursors ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Show X Axis Cursors">
                            <Ruler className="w-3.5 h-3.5" /> X光标
                        </button>
                        <button onClick={toggleYCursors} className={`px-2 py-0.5 rounded flex items-center gap-1 font-bold text-xs transition-colors ${showYCursors ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Show Y Axis Cursors">
                            <Target className="w-3.5 h-3.5" /> Y光标
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* VIEW MODE TOGGLE */}
                        <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-300">
                            <button 
                                onClick={() => { setViewMode('OVERLAY'); setMaximizedNodeId(null); }} 
                                className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 font-bold ${viewMode === 'OVERLAY' ? 'bg-white shadow-sm text-sky-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title={t.trend.viewMode.overlay}
                            >
                                <Layers className="w-3.5 h-3.5" /> 叠加
                            </button>
                            <button 
                                onClick={() => setViewMode('SPLIT')} 
                                className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 font-bold ${viewMode === 'SPLIT' ? 'bg-white shadow-sm text-sky-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title={t.trend.viewMode.split}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" /> 分层
                            </button>
                        </div>

                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                            <button onClick={() => setInterpolationMode('linear')} className={`p-1 rounded ${interpolationMode==='linear'?'bg-white text-indigo-600 shadow-sm':'hover:bg-slate-200'}`} title="线性"><Activity className="w-3.5 h-3.5"/></button>
                            <button onClick={() => setInterpolationMode('step')} className={`p-1 rounded ${interpolationMode==='step'?'bg-white text-indigo-600 shadow-sm':'hover:bg-slate-200'}`} title="阶梯"><Binary className="w-3.5 h-3.5"/></button>
                        </div>
                    </div>
                </div>

                {viewMode === 'OVERLAY' || maximizedNodeId ? (
                    <div 
                        className={`flex-1 relative p-4 select-none touch-none ${draggingCursor ? (draggingCursor.includes('X') ? 'cursor-col-resize' : 'cursor-row-resize') : hoverCursor ? hoverCursor : (showCrosshair ? 'cursor-crosshair' : (isDraggingRef.current ? 'cursor-grabbing' : 'cursor-default'))}`}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onMouseLeave={handleMouseLeave}
                        onWheel={handleWheel}
                    >
                        <div className="w-full h-full bg-white border border-slate-200 rounded-lg shadow-inner relative overflow-hidden" onDoubleClick={handleResetY}>
                            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                            {maximizedNodeId && (
                                <button 
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setMaximizedNodeId(null); }}
                                    className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-slate-200 rounded shadow-sm text-slate-500 z-10"
                                    title="Restore View"
                                >
                                    <Minimize2 className="w-4 h-4"/>
                                </button>
                            )}
                            {/* Overlay Status */}
                            <div className="absolute top-2 right-12 flex gap-2 pointer-events-none">
                                {(yScale !== 1 || yOffset !== 0) && (
                                    <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-blue-200 flex items-center gap-1">
                                        <Search className="w-3 h-3"/> Y-Zoom: {yScale.toFixed(1)}x {yOffset !== 0 ? `(Off: ${(yOffset*100).toFixed(0)}%)` : ''}
                                    </span>
                                )}
                                {!isLiveFollow && mode === 'LIVE' && ( <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-amber-200 flex items-center gap-1"><Pause className="w-3 h-3"/> 暂停 (拖拽/缩放)</span> )}
                                {mode === 'HISTORY' && ( <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-indigo-200">历史模式</span> )}
                            </div>
                            {nodes.length === 0 && ( <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300 flex-col gap-2"><TrendingUp className="w-12 h-12 opacity-20" /><span className="font-bold text-lg">暂无趋势数据</span></div> )}
                            {fetchError && mode === 'HISTORY' && ( <div className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-white/50 backdrop-blur-sm animate-in fade-in"><div className="bg-white border border-red-200 shadow-xl rounded-lg p-6 flex flex-col items-center gap-3 max-w-md text-center"><div className="p-3 bg-red-50 rounded-full text-red-500"><AlertCircle className="w-8 h-8"/></div><h3 className="text-red-700 font-bold text-lg">数据获取警告</h3><p className="text-slate-600 text-sm">{fetchError}</p><button onClick={() => setFetchError(null)} className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-bold">关闭</button></div></div> )}
                        </div>
                    </div>
                ) : (
                    // SPLIT VIEW (GRID)
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 relative">
                        {nodes.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-300 flex-col gap-2">
                                <LayoutGrid className="w-12 h-12 opacity-20" />
                                <span className="font-bold text-lg">空网格</span>
                            </div>
                        ) : (
                            <div className="grid gap-4 pb-10 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 transition-all">
                                {nodes.map((node, i) => {
                                    if (hiddenNodeIds.has(node.nodeId)) return null;
                                    const color = colors[i % colors.length];
                                    const points = dataPoints[node.nodeId] || [];
                                    const lastVal = points.length > 0 ? points[points.length-1].v : 0;
                                    const isFrozen = frozenNodeIds.has(node.nodeId);
                                    
                                    return (
                                        <div key={node.nodeId} className="h-48 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden relative group hover:border-blue-400 transition-colors">
                                            <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></div>
                                                    <span className="text-xs font-bold truncate text-slate-700 max-w-[150px]" title={node.nodeId}>{node.displayName || node.nodeId}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => toggleNodeFreeze(node.nodeId)}
                                                        className={`p-1 rounded hover:bg-slate-200 transition-colors ${isFrozen ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-slate-500'}`}
                                                        title={isFrozen ? "Resume Trace" : "Freeze Trace"}
                                                    >
                                                        {isFrozen ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                                                    </button>
                                                    <span className={`font-mono font-bold text-sm ${isFrozen ? 'text-slate-400' : 'text-slate-800'}`} style={!isFrozen ? { color: color } : {}}>{Number(lastVal).toFixed(2)}</span>
                                                    <button onClick={() => setMaximizedNodeId(node.nodeId)} className="text-slate-400 hover:text-blue-600 p-1"><Maximize2 className="w-3.5 h-3.5"/></button>
                                                </div>
                                            </div>
                                            <div className="flex-1 relative">
                                                <canvas 
                                                    ref={(el) => { if(el) splitCanvasRefs.current.set(node.nodeId, el); else splitCanvasRefs.current.delete(node.nodeId); }} 
                                                    className="w-full h-full"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default React.memo(TrendPanel);
