
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SchedulerGroup, SchedulerTask, OpcDataType, OpcNode, ConnectionStatus } from '../types';
import { opcuaService } from '../services/opcuaService';
import { Play, Pause, Plus, Trash2, ArrowRight, Activity, Clock, Zap, RefreshCw, X, Download, Upload, RotateCcw, ArrowRightLeft, Edit3, ArrowLeft, ArrowUp, ArrowDown, ListPlus, FolderPlus, FileUp, FileDown, FileSpreadsheet, SkipForward, GripVertical, CheckSquare, Square, MinusSquare, AlertTriangle, ChevronRight, ChevronLeft, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import ValueDisplay from './ValueDisplay';
import { toast } from 'sonner';

interface SchedulerPanelProps {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  sessionId?: string;
  addLog: (level: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
  initialGroups?: SchedulerGroup[];
  onGroupsChange?: (groups: SchedulerGroup[]) => void;
  pendingNodes?: { nodes: OpcNode[], targetGroupId?: string, listType: 'source' | 'target' } | null;
  onNodesConsumed?: () => void;
  autoScheduleEnabled?: boolean;
  isVisible?: boolean;
}

const ensureInternalIds = (nodes: OpcNode[]) => {
    return nodes.map(n => ({
        ...n,
        internalId: n.internalId || Math.random().toString(36).substr(2, 9)
    }));
};

// -- CONSTANTS --
const CANDIDATE_ROW_HEIGHT = 32;
const TASK_ROW_HEIGHT = 44;
const BUFFER_ROWS = 5;
const IO_TIMEOUT = 5000;   // Hard timeout for IO operations

// Helper: Format Type Signature
// Priority: If dataType already has dimensions (e.g. Int32[2,2]), trust it.
const formatTypeSignature = (dataType?: string, value?: any) => {
    if (!dataType) return '';
    
    // Check if dimensions are already in the string (from SessionWorkspace creation)
    if (dataType.includes('[')) return dataType;

    // Fallback: simple check for array value
    if (Array.isArray(value)) {
        const dims: number[] = [value.length];
        let curr = value;
        while (curr.length > 0 && Array.isArray(curr[0])) {
            dims.push(curr[0].length);
            curr = curr[0];
        }
        // Format as Int32[2,3]
        return `${dataType}[${dims.join(',')}]`;
    }
    
    return dataType;
};

// Helper: Deep Value Comparison with AGGRESSIVE Boolean Normalization
const isValuesEqual = (prev: any, curr: any): boolean => {
    if (prev === curr) return true;
    const normalize = (v: any) => {
        if (v === true || v === 1 || v === 'true' || v === '1') return 1;
        if (v === false || v === 0 || v === 'false' || v === '0') return 0;
        return v;
    };
    const safeStringify = (val: any) => {
        try {
            return JSON.stringify(val, (key, value) => typeof value === 'bigint' ? value.toString() : value);
        } catch (e) {
            return String(val);
        }
    };
    if (Array.isArray(prev) && Array.isArray(curr)) {
        if (prev.length !== curr.length) return false;
        for (let i = 0; i < prev.length; i++) {
            const p = normalize(prev[i]);
            const c = normalize(curr[i]);
            if (p !== c) {
                if (typeof p === 'object' && typeof c === 'object' && p !== null && c !== null) {
                    if (safeStringify(p) !== safeStringify(c)) return false;
                } else {
                    return false;
                }
            }
        }
        return true;
    }
    if (ArrayBuffer.isView(prev) && ArrayBuffer.isView(curr)) return safeStringify(Array.from(prev as any)) === safeStringify(Array.from(curr as any));
    if (typeof prev === 'object' && typeof curr === 'object' && prev !== null && curr !== null) return safeStringify(prev) === safeStringify(curr);
    return normalize(prev) === normalize(curr);
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} Timed out (${ms}ms)`)), ms))
    ]);
};

const Resizer = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div className="w-1 bg-slate-200 hover:bg-rose-400 cursor-col-resize z-20 transition-colors flex items-center justify-center flex-shrink-0 shadow-sm" onMouseDown={onMouseDown}>
        <div className="h-4 w-0.5 bg-slate-400 rounded"></div>
    </div>
);

// --- MEMOIZED ROW COMPONENTS ---

interface CandidateRowProps {
    node: OpcNode;
    index: number;
    isSelected: boolean;
    isDragging: boolean;
    isDragOver: boolean;
    type: 'source' | 'target';
    onClick: (e: React.MouseEvent, id: string, index: number, type: 'source' | 'target') => void;
    onDragStart: (e: React.DragEvent, index: number, type: 'source' | 'target') => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (index: number, type: 'source' | 'target') => void;
}

const CandidateRow = React.memo(({ node, index, isSelected, isDragging, isDragOver, type, onClick, onDragStart, onDragOver, onDrop }: CandidateRowProps) => {
    const id = node.internalId || node.nodeId;
    return (
        <div 
            style={{ top: index * CANDIDATE_ROW_HEIGHT, height: CANDIDATE_ROW_HEIGHT }}
            className={`absolute left-0 right-0 flex items-center gap-2 px-2 border-b border-slate-100 text-xs cursor-pointer group ${isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-blue-50'} ${isDragging ? 'opacity-50 dashed border-2 border-blue-300' : ''} ${isDragOver ? 'border-b-2 border-b-blue-500' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, index, type)}
            onDragOver={(e) => { e.preventDefault(); onDragOver(e, index); }}
            onDrop={(e) => { e.preventDefault(); onDrop(index, type); }}
            onClick={(e) => onClick(e, id, index, type)}
        >
            <span className="font-mono text-[10px] text-slate-400 w-4 cursor-grab active:cursor-grabbing hover:text-slate-600">{index + 1}</span>
            <span className="truncate flex-1" title={node.nodeId}>{node.displayName || node.nodeId}</span>
            <span className="text-[9px] bg-slate-200 text-slate-500 px-1 rounded truncate max-w-[100px]" title={formatTypeSignature(node.dataType, node.value)}>{formatTypeSignature(node.dataType, node.value)}</span>
            <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab" />
        </div>
    );
}, (prev, next) => {
    // Optimization: Only re-render if visual state or node value structure changes
    return prev.node === next.node && prev.isSelected === next.isSelected && prev.isDragging === next.isDragging && prev.isDragOver === next.isDragOver && prev.index === next.index;
});

interface TaskRowProps {
    task: SchedulerTask;
    index: number;
    isSelected: boolean;
    dragOverInputId: string | null;
    onRowClick: (e: React.MouseEvent, id: string, index: number) => void;
    onToggleEnabled: (id: string, current: boolean) => void;
    onDelete: (id: string) => void;
    onUpdate: (id: string, field: keyof SchedulerTask, value: any) => void;
    onDragOverInput: (e: React.DragEvent, id: string) => void;
    onDragLeaveInput: () => void;
    onDropToInput: (e: React.DragEvent, id: string, field: 'source' | 'target') => void;
    placeholderSource: string;
    placeholderTarget: string;
}

const TaskRow = React.memo(({ task, index, isSelected, dragOverInputId, onRowClick, onToggleEnabled, onDelete, onUpdate, onDragOverInput, onDragLeaveInput, onDropToInput, placeholderSource, placeholderTarget }: TaskRowProps) => {
    return (
        <div 
            className={`absolute left-0 right-0 grid grid-cols-12 gap-2 px-3 items-center border-b transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100 hover:bg-slate-50'}`} 
            style={{ top: index * TASK_ROW_HEIGHT, height: TASK_ROW_HEIGHT }} 
            onClick={(e) => onRowClick(e, task.id, index)}
        >
            <div className="col-span-1 flex justify-center cursor-pointer hover:text-blue-500" onClick={(e) => { e.stopPropagation(); onRowClick(e, task.id, index); }}>
                <div className={`text-slate-300 ${isSelected ? 'text-blue-600' : 'group-hover:text-slate-400'}`}>{isSelected ? <CheckSquare className="w-3.5 h-3.5"/> : <Square className="w-3.5 h-3.5"/>}</div>
            </div>
            <div className="col-span-1 flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); onToggleEnabled(task.id, task.enabled); }} className={`w-6 h-3.5 rounded-full transition-colors relative ${task.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`w-2.5 h-2.5 bg-white rounded-full absolute top-0.5 transition-transform ${task.enabled ? 'left-3' : 'left-0.5'}`}></div></button>
                <div className={`w-2 h-2 rounded-full ${task.lastStatus === 'Good' ? 'bg-emerald-500' : task.lastStatus === 'Bad' ? 'bg-red-500' : 'bg-slate-300'}`} title={task.errorMessage || task.lastStatus}></div>
            </div>
            <div className={`col-span-4 transition-colors rounded ${dragOverInputId === `${task.id}:source` ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`} onDragOver={(e) => onDragOverInput(e, `${task.id}:source`)} onDragLeave={onDragLeaveInput} onDrop={(e) => onDropToInput(e, task.id, 'source')}>
                <input className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 focus:bg-white focus:border-blue-400 outline-none truncate font-mono text-slate-600 hover:border-blue-300 transition-colors" value={task.sourceNodeId} onChange={(e) => onUpdate(task.id, 'sourceNodeId', e.target.value)} placeholder={placeholderSource} title={task.sourceNodeId} onClick={e => e.stopPropagation()}/>
            </div>
            <div className={`col-span-4 transition-colors rounded ${dragOverInputId === `${task.id}:target` ? 'ring-2 ring-rose-400 bg-rose-50' : ''}`} onDragOver={(e) => onDragOverInput(e, `${task.id}:target`)} onDragLeave={onDragLeaveInput} onDrop={(e) => onDropToInput(e, task.id, 'target')}>
                <input className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 focus:bg-white focus:border-blue-400 outline-none truncate font-mono text-slate-600 hover:border-blue-300 transition-colors" value={task.targetNodeId} onChange={(e) => onUpdate(task.id, 'targetNodeId', e.target.value)} placeholder={placeholderTarget} title={task.targetNodeId} onClick={e => e.stopPropagation()}/>
            </div>
            <div className="col-span-2 flex items-center justify-end gap-2 overflow-hidden">
                <div className="flex flex-col items-end text-[9px] leading-none min-w-0 flex-1">
                    <div className="w-full flex justify-end min-h-[20px]">
                        {task.lastValue !== undefined ? (
                            <div className="w-full overflow-hidden flex justify-end" onClick={e => e.stopPropagation()}>
                                <ValueDisplay value={task.lastValue} dataType={task.sourceDataType} />
                            </div>
                        ) : (<span className="text-slate-300">-</span>)}
                    </div>
                    <div className="flex gap-2 mt-0.5 opacity-60 items-center">
                        {task.errorMessage === 'Skipped (No Change)' && <span className="text-slate-400 italic mr-1 scale-75 origin-right">Skipped</span>}
                        <span>R:{task.runCount}</span>
                        {task.errorCount ? <span className="text-red-500 font-bold">E:{task.errorCount}</span> : null}
                    </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
        </div>
    );
}, (prev, next) => prev.task === next.task && prev.isSelected === next.isSelected && prev.dragOverInputId === next.dragOverInputId && prev.index === next.index);

// --- MAIN COMPONENT ---

const SchedulerPanel: React.FC<SchedulerPanelProps> = ({ 
    isConnected, 
    connectionStatus,
    sessionId, 
    addLog, 
    initialGroups, 
    onGroupsChange, 
    pendingNodes, 
    onNodesConsumed,
    autoScheduleEnabled
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // -- STATE --
  const [groups, setGroups] = useState<SchedulerGroup[]>(() => {
      if (initialGroups && initialGroups.length > 0) return initialGroups;
      return [{ id: 'default-scheduler', name: 'Scheduler Group 1', defaultInterval: 100, sourceList: [], targetList: [], tasks: [] }];
  });
  
  const groupsRef = useRef<SchedulerGroup[]>(groups);
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id || 'default-scheduler');
  const [isMasterRunning, setIsMasterRunning] = useState(false);
  const hasAutoStartedRef = useRef(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [batchSize, setBatchSize] = useState(100); // Default Write Batch Size

  // -- AUTO START LOGIC --
  useEffect(() => {
      if (isConnected && sessionId && autoScheduleEnabled && !hasAutoStartedRef.current && groups.length > 0) {
          addLog('info', `Auto-Start: Activating scheduler...`);
          setIsMasterRunning(true);
          hasAutoStartedRef.current = true;
      }
  }, [isConnected, sessionId, autoScheduleEnabled, groups]);

  // Reset auto-start flag when disconnected
  useEffect(() => {
      if (!isConnected) {
          hasAutoStartedRef.current = false;
          setIsMasterRunning(false);
      }
  }, [isConnected]);

  // -- SCROLL STATE FOR VIRTUALIZATION --
  const [sourceScrollTop, setSourceScrollTop] = useState(0);
  const [targetScrollTop, setTargetScrollTop] = useState(0);
  const [taskScrollTop, setTaskScrollTop] = useState(0);
  const sourceListRef = useRef<HTMLDivElement>(null);
  const targetListRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);

  // -- SELECTION --
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [lastClickedSourceIndex, setLastClickedSourceIndex] = useState<number | null>(null);
  const [lastClickedTargetIndex, setLastClickedTargetIndex] = useState<number | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [lastClickedTaskId, setLastClickedTaskId] = useState<string | null>(null);
  
  // -- DRAG & DROP --
  const [listDragItem, setListDragItem] = useState<{ index: number, type: 'source' | 'target' } | null>(null);
  const [listDragOverIndex, setListDragOverIndex] = useState<number | null>(null);
  const [dragOverInputId, setDragOverInputId] = useState<string | null>(null); 

  // -- LAYOUT --
  const [sourceWidth, setSourceWidth] = useState(320); 
  const [targetWidth, setTargetWidth] = useState(320);
  const isResizing = useRef<{ type: 'source' | 'target', startX: number, startWidth: number } | null>(null);

  // -- PERFORMANCE --
  const isProcessingRef = useRef(false);
  const taskLastRunRef = useRef<Map<string, number>>(new Map());
  const skipNextGroupsChange = useRef(false);

  const [mismatchModal, setMismatchModal] = useState<{ isOpen: boolean, mismatches: any[], onConfirm: () => void } | null>(null);

  useEffect(() => { 
      groupsRef.current = groups; 
      if (!skipNextGroupsChange.current && onGroupsChange) {
          onGroupsChange(groups);
      }
      skipNextGroupsChange.current = false;
  }, [groups, onGroupsChange]);

  useEffect(() => {
      if (initialGroups && initialGroups.length > 0) {
          const ids = new Set(groups.map(g => g.id));
          const hasNew = initialGroups.some(g => !ids.has(g.id));
          if (hasNew || initialGroups.length !== groups.length) {
              skipNextGroupsChange.current = true;
              setGroups(initialGroups);
              if (!initialGroups.find(g => g.id === activeGroupId)) setActiveGroupId(initialGroups[0].id);
          }
      }
  }, [initialGroups]);

  useEffect(() => {
      if (connectionStatus === ConnectionStatus.DISCONNECTED) {
          setIsMasterRunning(false);
          setGroups(prev => prev.map(g => ({ ...g, tasks: g.tasks.map(t => ({ ...t, lastStatus: 'Idle' })) })));
      }
  }, [connectionStatus]);

  useEffect(() => {
      if (pendingNodes && pendingNodes.nodes.length > 0) {
          const { nodes, targetGroupId, listType } = pendingNodes;
          const hydratedNodes = ensureInternalIds(nodes);
          setGroups(prev => {
              let targetId = targetGroupId || activeGroupId;
              if (!prev.find(g => g.id === targetId)) targetId = prev[0]?.id;
              return prev.map(g => {
                  if (g.id === targetId) {
                      const existingList = listType === 'source' ? g.sourceList : g.targetList;
                      const existingIds = new Set(existingList.map(n => n.nodeId));
                      const newUnique = hydratedNodes.filter(n => !existingIds.has(n.nodeId));
                      if (listType === 'source') return { ...g, sourceList: [...g.sourceList, ...newUnique] };
                      else return { ...g, targetList: [...g.targetList, ...newUnique] };
                  }
                  return g;
              });
          });
          if (onNodesConsumed) onNodesConsumed();
      }
  }, [pendingNodes, activeGroupId, onNodesConsumed]);

  // -- SCHEDULER LOOP --
  useInterval(async () => {
      if (!isMasterRunning || !isConnected || !sessionId || isProcessingRef.current) return;
      
      isProcessingRef.current = true;
      const now = Date.now();

      try {
          const currentGroups = groupsRef.current;
          const tasksToScan: { task: SchedulerTask, groupId: string, defaultInterval: number }[] = [];
          
          currentGroups.forEach(g => {
              g.tasks.forEach(t => {
                  if (t.enabled && t.sourceNodeId && t.targetNodeId) {
                      const interval = g.defaultInterval || t.interval || 100;
                      const lastRun = taskLastRunRef.current.get(t.id) || (t.lastTransferTime ? new Date(t.lastTransferTime).getTime() : 0);
                      if (now - lastRun >= interval) {
                          tasksToScan.push({ task: t, groupId: g.id, defaultInterval: interval });
                      }
                  }
              });
          });

          if (tasksToScan.length === 0) return;

          // Use configured batchSize
          const chunks: (typeof tasksToScan)[] = [];
          for (let i = 0; i < tasksToScan.length; i += batchSize) {
              chunks.push(tasksToScan.slice(i, i + batchSize));
          }

          const taskUpdates = new Map<string, Partial<SchedulerTask>>();
          const cycleTime = Date.now();
          const timestamp = new Date().toISOString();

          for (const chunk of chunks) {
              const uniqueSourceIds = Array.from(new Set(chunk.map(i => i.task.sourceNodeId)));
              const typeMap = new Map<string, OpcDataType>();
              chunk.forEach(i => typeMap.set(i.task.sourceNodeId, i.task.sourceDataType));

              try {
                  const readResults = await withTimeout(
                      opcuaService.readNodes(sessionId, uniqueSourceIds, typeMap), 
                      IO_TIMEOUT, 
                      'Read'
                  );
                  
                  const readMap = new Map<string, any>();
                  uniqueSourceIds.forEach((id, idx) => {
                      if (readResults[idx]) readMap.set(id, readResults[idx]);
                  });

                  const writePayloads: {nodeId: string, value: any, dataType: OpcDataType, taskId: string}[] = [];

                  chunk.forEach(item => {
                      const res = readMap.get(item.task.sourceNodeId);
                      if (!res || String(res.statusCode) !== 'Good') {
                          taskUpdates.set(item.task.id, {
                              lastStatus: 'Bad',
                              errorMessage: res ? res.statusCode : 'Read Error',
                              // ERROR FIX: Do NOT calculate total errorCount here to prevent exponential growth
                              lastTransferTime: timestamp
                          });
                          taskLastRunRef.current.set(item.task.id, cycleTime);
                      } else {
                          const isChanged = !isValuesEqual(item.task.lastValue, res.value);
                          const isFirstRun = (item.task.runCount || 0) === 0;

                          if (isChanged || isFirstRun) {
                              writePayloads.push({
                                  nodeId: item.task.targetNodeId,
                                  value: res.value,
                                  dataType: item.task.sourceDataType,
                                  taskId: item.task.id
                              });
                          } else {
                              taskUpdates.set(item.task.id, {
                                  lastStatus: 'Idle',
                                  errorMessage: 'Skipped (No Change)',
                                  lastTransferTime: timestamp
                              });
                              taskLastRunRef.current.set(item.task.id, cycleTime);
                          }
                      }
                  });

                  if (writePayloads.length > 0) {
                      const apiPayload = writePayloads.map(p => ({
                          nodeId: p.nodeId,
                          value: p.value,
                          dataType: (p.dataType.includes('[') ? p.dataType.split('[')[0] : p.dataType) as OpcDataType
                      }));

                      try {
                          const { results: writeStatuses } = await withTimeout(
                              opcuaService.writeNodes(sessionId, apiPayload),
                              IO_TIMEOUT,
                              'Write'
                          );
                          
                          writePayloads.forEach((payload, idx) => {
                              const status = writeStatuses[idx];
                              if (status === 'Good') {
                                  taskUpdates.set(payload.taskId, {
                                      lastValue: payload.value,
                                      lastStatus: 'Good',
                                      // RUN COUNT updated in reducer
                                      lastTransferTime: timestamp,
                                      errorMessage: undefined
                                  });
                              } else {
                                  taskUpdates.set(payload.taskId, {
                                      lastStatus: 'Bad',
                                      errorMessage: status,
                                      // ERROR COUNT updated in reducer
                                      lastTransferTime: timestamp
                                  });
                              }
                              taskLastRunRef.current.set(payload.taskId, cycleTime);
                          });
                      } catch (writeErr: any) {
                          writePayloads.forEach(p => {
                              taskUpdates.set(p.taskId, {
                                  lastStatus: 'Bad',
                                  errorMessage: 'Write Failed/Timeout',
                                  lastTransferTime: timestamp
                              });
                              taskLastRunRef.current.set(p.taskId, cycleTime);
                          });
                      }
                  }

              } catch (readErr: any) {
                  chunk.forEach(item => {
                      taskUpdates.set(item.task.id, {
                          lastStatus: 'Bad',
                          errorMessage: 'Read Failed/Timeout',
                          lastTransferTime: timestamp
                      });
                      taskLastRunRef.current.set(item.task.id, cycleTime);
                  });
              }
          }

          if (taskUpdates.size > 0) {
              skipNextGroupsChange.current = true;
              setGroups(prev => prev.map(g => {
                  let hasUpdates = false;
                  const newTasks = g.tasks.map(t => {
                      if (taskUpdates.has(t.id)) {
                          hasUpdates = true;
                          const update = taskUpdates.get(t.id)!;
                          
                          // STATE UPDATE LOGIC: LINEAR INCREMENT
                          let newRun = t.runCount || 0;
                          let newErr = t.errorCount || 0;

                          if (update.lastStatus === 'Good') {
                              newRun++;
                          } else if (update.lastStatus === 'Bad' || (update.lastStatus && update.lastStatus.startsWith('Bad')) || update.lastStatus === 'Write Error') {
                              newErr++;
                          }
                          
                          return { ...t, ...update, runCount: newRun, errorCount: newErr };
                      }
                      return t;
                  });
                  return hasUpdates ? { ...g, tasks: newTasks } : g;
              }));
          }

      } catch (err: any) {
          addLog('error', `Scheduler Cycle Error: ${err.message}`);
      } finally {
          isProcessingRef.current = false;
      }

  }, isMasterRunning && isConnected ? 50 : null);

  // -- HELPERS --
  const activeGroup = groups.find(g => g.id === activeGroupId);

  // -- EVENTS & HANDLERS --
  const handleAddGroup = () => {
      const newGroup: SchedulerGroup = { id: Math.random().toString(36).substr(2, 9), name: `Group ${groups.length + 1}`, defaultInterval: 100, sourceList: [], targetList: [], tasks: [] };
      setGroups(prev => [...prev, newGroup]);
      setActiveGroupId(newGroup.id);
  };

  const handleDeleteGroup = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const rem = groups.filter(g => g.id !== id);
      setGroups(rem);
      if (activeGroupId === id && rem.length > 0) setActiveGroupId(rem[0].id);
  };

  const createTasks = (sources: OpcNode[], targets: OpcNode[]) => {
      if (!activeGroup) return;
      const count = Math.min(sources.length, targets.length);
      const newTasks: SchedulerTask[] = [];
      for (let i = 0; i < count; i++) {
          newTasks.push({
              id: Math.random().toString(36).substr(2, 9),
              name: `Map ${activeGroup.tasks.length + i + 1}`,
              enabled: true,
              sourceNodeId: sources[i].nodeId,
              sourceDataType: sources[i].dataType,
              targetNodeId: targets[i].nodeId,
              interval: activeGroup.defaultInterval,
              lastStatus: 'Idle',
              runCount: 0,
              errorCount: 0
          });
      }
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: [...g.tasks, ...newTasks] } : g));
      addLog('success', `Generated ${count} mapping tasks.`);
  };

  const handleGenerateTasks = () => {
      if (!activeGroup) return;
      const count = Math.min(activeGroup.sourceList.length, activeGroup.targetList.length);
      if (count === 0) {
          addLog('warn', 'Need at least one item in both lists.');
          return;
      }
      const mismatches: any[] = [];
      for (let i = 0; i < count; i++) {
          const src = activeGroup.sourceList[i];
          const tgt = activeGroup.targetList[i];
          if (src.dataType !== tgt.dataType) mismatches.push({ index: i + 1, source: src.nodeId, target: tgt.nodeId, sourceType: src.dataType, targetType: tgt.dataType });
      }
      if (mismatches.length > 0) {
          setMismatchModal({
              isOpen: true, mismatches,
              onConfirm: () => { createTasks(activeGroup.sourceList, activeGroup.targetList); setMismatchModal(null); }
          });
      } else {
          createTasks(activeGroup.sourceList, activeGroup.targetList);
      }
  };

  const handleManualAddTask = () => {
      if (!activeGroup) return;
      const newTask: SchedulerTask = { id: Math.random().toString(36).substr(2, 9), name: `Map ${activeGroup.tasks.length + 1}`, enabled: true, sourceNodeId: '', sourceDataType: 'Int32', targetNodeId: '', interval: activeGroup.defaultInterval, lastStatus: 'Idle', runCount: 0, errorCount: 0 };
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: [...g.tasks, newTask] } : g));
  };

  const handleAddAllSources = () => {
      if (!activeGroup || activeGroup.sourceList.length === 0) return;
      const newTasks: SchedulerTask[] = activeGroup.sourceList.map((src, i) => ({ id: Math.random().toString(36).substr(2, 9), name: `Map ${activeGroup.tasks.length + i + 1}`, enabled: true, sourceNodeId: src.nodeId, sourceDataType: src.dataType, targetNodeId: '', interval: activeGroup.defaultInterval, lastStatus: 'Idle', runCount: 0, errorCount: 0 }));
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: [...g.tasks, ...newTasks] } : g));
      addLog('success', `Created ${newTasks.length} tasks from Source List.`);
  };

  const handleAddAllTargets = () => {
      if (!activeGroup || activeGroup.targetList.length === 0) return;
      let targetsUsed = 0;
      let newTasks: SchedulerTask[] = [];
      const updatedTasks = activeGroup.tasks.map(t => {
          if (!t.targetNodeId && targetsUsed < activeGroup.targetList.length) {
              return { ...t, targetNodeId: activeGroup.targetList[targetsUsed++].nodeId };
          }
          return t;
      });
      if (targetsUsed < activeGroup.targetList.length) {
          const remaining = activeGroup.targetList.slice(targetsUsed);
          newTasks = remaining.map((tgt, i) => ({ id: Math.random().toString(36).substr(2, 9), name: `Map ${updatedTasks.length + i + 1}`, enabled: true, sourceNodeId: '', sourceDataType: 'Int32', targetNodeId: tgt.nodeId, interval: activeGroup.defaultInterval, lastStatus: 'Idle', runCount: 0, errorCount: 0 }));
      }
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: [...updatedTasks, ...newTasks] } : g));
      addLog('success', `Assigned ${targetsUsed} targets and created ${newTasks.length} new tasks.`);
  };

  const moveSelectedToList = (from: 'source' | 'target') => {
      if (!activeGroup) return;
      const selectedSet = from === 'source' ? selectedSourceIds : selectedTargetIds;
      if (selectedSet.size === 0) return;
      setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
              const fromList = from === 'source' ? g.sourceList : g.targetList;
              const toList = from === 'source' ? g.targetList : g.sourceList;
              const itemsToMove = fromList.filter(n => selectedSet.has(n.internalId || n.nodeId));
              const remainingItems = fromList.filter(n => !selectedSet.has(n.internalId || n.nodeId));
              const existingIds = new Set(toList.map(n => n.nodeId));
              const newUnique = itemsToMove.filter(n => !existingIds.has(n.nodeId)).map(n => ({...n, internalId: Math.random().toString(36).substr(2, 9)}));
              if (from === 'source') return { ...g, sourceList: remainingItems, targetList: [...g.targetList, ...newUnique] };
              else return { ...g, targetList: remainingItems, sourceList: [...g.sourceList, ...newUnique] };
          }
          return g;
      }));
      if (from === 'source') setSelectedSourceIds(new Set()); else setSelectedTargetIds(new Set());
  };

  const toggleListSelection = useCallback((e: React.MouseEvent, id: string, index: number, listType: 'source' | 'target') => {
      const isSource = listType === 'source';
      const selectedSet = isSource ? selectedSourceIds : selectedTargetIds;
      const setter = isSource ? setSelectedSourceIds : setSelectedTargetIds;
      const lastIndex = isSource ? lastClickedSourceIndex : lastClickedTargetIndex;
      const setLastIndex = isSource ? setLastClickedSourceIndex : setLastClickedTargetIndex;
      const list = activeGroup ? (isSource ? activeGroup.sourceList : activeGroup.targetList) : [];
      
      let newSet = new Set<string>();
      if (e.shiftKey && lastIndex !== null) {
          newSet = e.ctrlKey ? new Set(selectedSet) : new Set();
          const start = Math.min(lastIndex, index);
          const end = Math.max(lastIndex, index);
          for (let i = start; i <= end; i++) { if (list[i]) newSet.add(list[i].internalId || list[i].nodeId); }
      } else if (e.ctrlKey) {
          newSet = new Set(selectedSet);
          if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
          setLastIndex(index);
      } else {
          newSet.add(id);
          setLastIndex(index);
      }
      setter(newSet);
  }, [activeGroup, selectedSourceIds, selectedTargetIds, lastClickedSourceIndex, lastClickedTargetIndex]);

  const handleTaskRowClick = useCallback((e: React.MouseEvent, taskId: string, index: number) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const newSet = new Set(selectedTaskIds);
      if (e.ctrlKey || e.metaKey) {
          if (newSet.has(taskId)) newSet.delete(taskId); else newSet.add(taskId);
          setLastClickedTaskId(taskId);
      } else if (e.shiftKey && lastClickedTaskId && activeGroup) {
          const allIds = activeGroup.tasks.map(t => t.id);
          const start = allIds.indexOf(lastClickedTaskId);
          const end = index;
          if (start !== -1) {
              const low = Math.min(start, end);
              const high = Math.max(start, end);
              newSet.clear();
              for (let i = low; i <= high; i++) newSet.add(allIds[i]);
          }
      } else {
          newSet.clear();
          newSet.add(taskId);
          setLastClickedTaskId(taskId);
      }
      setSelectedTaskIds(newSet);
  }, [selectedTaskIds, lastClickedTaskId, activeGroup]);

  // -- DND HANDLERS --
  const handleDragOverInput = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverInputId(id); }, []);
  const handleDragLeaveInput = useCallback(() => { setDragOverInputId(null); }, []);
  const handleDropToInput = useCallback((e: React.DragEvent, taskId: string, field: 'source' | 'target') => {
      e.preventDefault();
      setDragOverInputId(null);
      let nodeId = '';
      let dataType: OpcDataType | undefined;
      try {
          const jsonStr = e.dataTransfer.getData('application/opcua-node');
          if (jsonStr) { const node = JSON.parse(jsonStr); nodeId = node.nodeId; dataType = node.dataType; }
      } catch (err) {}
      if (!nodeId) nodeId = e.dataTransfer.getData('text/plain');
      if (!nodeId) return;
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: g.tasks.map(t => t.id === taskId ? { ...t, [field === 'source' ? 'sourceNodeId' : 'targetNodeId']: nodeId, ...(field === 'source' && dataType ? { sourceDataType: dataType } : {}) } : t) } : g));
  }, [activeGroupId]);

  const handleListDragStart = useCallback((e: React.DragEvent, index: number, type: 'source' | 'target') => {
      setListDragItem({ index, type });
      e.dataTransfer.effectAllowed = 'copyMove';
      const list = type === 'source' ? activeGroup?.sourceList : activeGroup?.targetList;
      if (list && list[index]) {
          e.dataTransfer.setData('text/plain', list[index].nodeId);
          e.dataTransfer.setData('application/opcua-node', JSON.stringify(list[index]));
      }
  }, [activeGroup]);

  const handleListDragOver = useCallback((e: React.DragEvent, index: number) => { e.preventDefault(); setListDragOverIndex(index); }, []);
  const handleListDrop = useCallback((index: number, type: 'source' | 'target') => {
      if (!listDragItem || !activeGroup) return;
      const dragIndex = listDragItem.index;
      const dragType = listDragItem.type;
      
      setGroups(prev => {
          const g = prev.find(gr => gr.id === activeGroupId);
          if (!g) return prev;
          if (dragType === type) {
              const listKey = type === 'source' ? 'sourceList' : 'targetList';
              const list = [...g[listKey]];
              const [moved] = list.splice(dragIndex, 1);
              list.splice(index, 0, moved);
              return prev.map(gr => gr.id === activeGroupId ? { ...gr, [listKey]: list } : gr);
          } else {
              const srcKey = dragType === 'source' ? 'sourceList' : 'targetList';
              const tgtKey = type === 'source' ? 'sourceList' : 'targetList';
              const sList = [...g[srcKey]];
              const tList = [...g[tgtKey]];
              const [moved] = sList.splice(dragIndex, 1);
              if (!tList.find(n => n.nodeId === moved.nodeId)) tList.splice(index, 0, { ...moved, internalId: Math.random().toString(36).substr(2, 9) });
              return prev.map(gr => gr.id === activeGroupId ? { ...gr, [srcKey]: sList, [tgtKey]: tList } : gr);
          }
      });
      setListDragItem(null); setListDragOverIndex(null);
  }, [listDragItem, activeGroupId, activeGroup]);

  // -- UPDATE HANDLERS --
  const handleTaskToggle = useCallback((id: string, current: boolean) => {
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: g.tasks.map(t => t.id === id ? { ...t, enabled: !current } : t) } : g));
  }, [activeGroupId]);

  const handleTaskDelete = useCallback((id: string) => {
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: g.tasks.filter(t => t.id !== id) } : g));
      setSelectedTaskIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, [activeGroupId]);

  const handleTaskUpdate = useCallback((id: string, field: keyof SchedulerTask, value: any) => {
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: g.tasks.map(t => t.id === id ? { ...t, [field]: value } : t) } : g));
  }, [activeGroupId]);

  const handleClearErrors = useCallback(() => {
      if (!activeGroup) return;
      setGroups(prev => prev.map(g => g.id === activeGroupId ? {
          ...g,
          tasks: g.tasks.map(t => ({
              ...t,
              errorCount: 0,
              errorMessage: undefined,
              lastStatus: t.lastStatus === 'Bad' ? 'Idle' : t.lastStatus
          }))
      } : g));
      addLog('info', 'Cleared error states for all tasks in the active group.');
  }, [activeGroupId, activeGroup, addLog]);

  const moveSelectedUp = useCallback((type: 'source' | 'target') => {
      if (!activeGroup) return;
      const listKey = type === 'source' ? 'sourceList' : 'targetList';
      const selectedSet = type === 'source' ? selectedSourceIds : selectedTargetIds;
      if (selectedSet.size === 0) return;

      setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
              const list = [...g[listKey]];
              for (let i = 1; i < list.length; i++) {
                  if (selectedSet.has(list[i].internalId || list[i].nodeId) && !selectedSet.has(list[i-1].internalId || list[i-1].nodeId)) {
                      const temp = list[i];
                      list[i] = list[i-1];
                      list[i-1] = temp;
                  }
              }
              return { ...g, [listKey]: list };
          }
          return g;
      }));
  }, [activeGroupId, activeGroup, selectedSourceIds, selectedTargetIds]);

  const moveSelectedDown = useCallback((type: 'source' | 'target') => {
      if (!activeGroup) return;
      const listKey = type === 'source' ? 'sourceList' : 'targetList';
      const selectedSet = type === 'source' ? selectedSourceIds : selectedTargetIds;
      if (selectedSet.size === 0) return;

      setGroups(prev => prev.map(g => {
          if (g.id === activeGroupId) {
              const list = [...g[listKey]];
              for (let i = list.length - 2; i >= 0; i--) {
                  if (selectedSet.has(list[i].internalId || list[i].nodeId) && !selectedSet.has(list[i+1].internalId || list[i+1].nodeId)) {
                      const temp = list[i];
                      list[i] = list[i+1];
                      list[i+1] = temp;
                  }
              }
              return { ...g, [listKey]: list };
          }
          return g;
      }));
  }, [activeGroupId, activeGroup, selectedSourceIds, selectedTargetIds]);

  // -- RESIZING --
  const startResizing = (type: 'source' | 'target', e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = { type, startX: e.clientX, startWidth: type === 'source' ? sourceWidth : targetWidth };
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  };
  const handleResizeMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const { type, startX, startWidth } = isResizing.current;
      const diff = e.clientX - startX;
      const newWidth = Math.max(150, Math.min(600, startWidth + diff));
      if (type === 'source') setSourceWidth(newWidth); else setTargetWidth(newWidth);
  };
  const handleResizeUp = () => { isResizing.current = null; document.removeEventListener('mousemove', handleResizeMove); document.removeEventListener('mouseup', handleResizeUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };

  // -- VIRTUALIZATION RENDERERS --

  const renderVirtualStagingList = (type: 'source' | 'target') => {
      if (!activeGroup) return null;
      const list = type === 'source' ? activeGroup.sourceList : activeGroup.targetList;
      const selectedSet = type === 'source' ? selectedSourceIds : selectedTargetIds;
      const title = type === 'source' ? t.scheduler.candidates.source : t.scheduler.candidates.target;
      const icon = type === 'source' ? <ArrowRight className="w-4 h-4 text-slate-400 rotate-180" /> : <ArrowRight className="w-4 h-4 text-slate-400" />;
      const addAllAction = type === 'source' ? handleAddAllSources : handleAddAllTargets;
      const scrollTop = type === 'source' ? sourceScrollTop : targetScrollTop;
      const setScroll = type === 'source' ? setSourceScrollTop : setTargetScrollTop;
      const containerRef = type === 'source' ? sourceListRef : targetListRef;

      const totalHeight = list.length * CANDIDATE_ROW_HEIGHT;
      const viewportHeight = containerRef.current?.clientHeight || 400;
      const startIndex = Math.max(0, Math.floor(scrollTop / CANDIDATE_ROW_HEIGHT) - BUFFER_ROWS);
      const endIndex = Math.min(list.length, Math.floor((scrollTop + viewportHeight) / CANDIDATE_ROW_HEIGHT) + BUFFER_ROWS);
      
      const visibleItems = list.slice(startIndex, endIndex).map((node, i) => ({ node, index: startIndex + i }));

      return (
          <div className="flex flex-col h-full bg-white flex-shrink-0 relative" style={{ width: type === 'source' ? sourceWidth : targetWidth }}>
              <div className="p-2 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 h-10">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600 truncate">
                      {icon} {title} <span className="bg-slate-200 px-1.5 rounded text-[10px]">{list.length}</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 items-center">
                      <button onClick={() => moveSelectedUp(type)} disabled={selectedSet.size === 0} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30" title="Move Up"><ArrowUp className="w-3.5 h-3.5"/></button>
                      <button onClick={() => moveSelectedDown(type)} disabled={selectedSet.size === 0} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30" title="Move Down"><ArrowDown className="w-3.5 h-3.5"/></button>
                      <div className="w-px h-3 bg-slate-200 my-auto mx-0.5"></div>
                      <button onClick={() => moveSelectedToList(type)} disabled={selectedSet.size === 0} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30" title={`Move to ${type==='source'?'Target':'Source'}`}>{type === 'source' ? <ChevronRight className="w-4 h-4"/> : <ChevronLeft className="w-4 h-4"/>}</button>
                      <div className="w-px h-3 bg-slate-200 my-auto mx-0.5"></div>
                      <button onClick={addAllAction} className="p-1 px-2 hover:bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold border border-transparent hover:border-emerald-200 transition-all whitespace-nowrap" title={t.scheduler.candidates.addAll}>{t.scheduler.candidates.addAll}</button>
                      <button onClick={() => deleteListItems(type)} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
              </div>
              <div 
                  ref={containerRef} 
                  className="flex-1 overflow-y-auto bg-slate-50/30 relative"
                  onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              >
                  {list.length === 0 && <div className="text-center p-4 text-[10px] text-slate-400 italic absolute inset-0">{t.workspace.dropHint}</div>}
                  <div style={{ height: totalHeight, width: '100%' }}>
                      {visibleItems.map(({ node, index }) => (
                          <CandidateRow 
                              key={node.internalId || index}
                              index={index}
                              node={node}
                              isSelected={selectedSet.has(node.internalId || node.nodeId)}
                              isDragging={listDragItem?.type === type && listDragItem?.index === index}
                              isDragOver={listDragOverIndex === index && listDragItem?.type === type}
                              type={type}
                              onClick={toggleListSelection}
                              onDragStart={handleListDragStart}
                              onDragOver={handleListDragOver}
                              onDrop={handleListDrop}
                          />
                      ))}
                  </div>
              </div>
              {type === 'target' && (
                  <div className="absolute bottom-4 right-6 z-10">
                      <button onClick={handleGenerateTasks} className="bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all border-2 border-white flex items-center gap-2 group" title={t.scheduler.candidates.autoMap}>
                          <ArrowRightLeft className="w-5 h-5" />
                          <span className="text-xs font-bold max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap">{t.scheduler.candidates.autoMap}</span>
                      </button>
                  </div>
              )}
          </div>
      );
  };

  const renderVirtualTasks = () => {
      if (!activeGroup) return null;
      const total = activeGroup.tasks.length;
      const start = Math.max(0, Math.floor(taskScrollTop / TASK_ROW_HEIGHT) - BUFFER_ROWS);
      const end = Math.min(total, Math.floor((taskScrollTop + (taskListRef.current?.clientHeight || 600)) / TASK_ROW_HEIGHT) + BUFFER_ROWS);
      const visibleTasks = activeGroup.tasks.slice(start, end).map((task, i) => ({ task, index: start + i }));

      return (
          <div ref={taskListRef} className="flex-1 overflow-auto p-0 relative scrollbar-thin scrollbar-thumb-slate-300" onScroll={e => setTaskScrollTop(e.currentTarget.scrollTop)}>
              {!activeGroup || activeGroup.tasks.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-slate-300 italic gap-2 absolute inset-0"><ListPlus className="w-12 h-12 opacity-20" /><span>{t.scheduler.empty}</span></div>) : (
                  <div style={{ height: activeGroup.tasks.length * TASK_ROW_HEIGHT, position: 'relative' }}>
                      {visibleTasks.map(({ task, index }) => (
                          <TaskRow 
                              key={task.id}
                              task={task}
                              index={index}
                              isSelected={selectedTaskIds.has(task.id)}
                              dragOverInputId={dragOverInputId}
                              onRowClick={handleTaskRowClick}
                              onToggleEnabled={handleTaskToggle}
                              onDelete={handleTaskDelete}
                              onUpdate={handleTaskUpdate}
                              onDragOverInput={handleDragOverInput}
                              onDragLeaveInput={handleDragLeaveInput}
                              onDropToInput={handleDropToInput}
                              placeholderSource={t.scheduler.placeholders.source}
                              placeholderTarget={t.scheduler.placeholders.target}
                          />
                      ))}
                  </div>
              )}
          </div>
      );
  };

  // ... (Other handlers like handleDownloadTemplate, handleImportCsv etc. remain same as before) ...
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeGroup) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          const startIndex = lines[0].toLowerCase().includes('sourcenodeid') ? 1 : 0;
          const newTasks: SchedulerTask[] = [];
          for (let i = startIndex; i < lines.length; i++) {
              const parts = lines[i].split(',');
              if (parts.length >= 4) {
                  newTasks.push({
                      id: Math.random().toString(36).substr(2, 9),
                      name: parts[0] || `Map ${activeGroup.tasks.length + i}`,
                      enabled: parts[1]?.toLowerCase() === 'true',
                      sourceNodeId: parts[2] || '',
                      sourceDataType: 'Int32',
                      targetNodeId: parts[3] || '',
                      interval: parseInt(parts[4]) || activeGroup.defaultInterval,
                      lastStatus: 'Idle',
                      runCount: 0,
                      errorCount: 0
                  });
              }
          }
          if (newTasks.length > 0) {
              setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: [...g.tasks, ...newTasks] } : g));
              addLog('success', `Imported ${newTasks.length} tasks.`);
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const handleExportCsv = () => {
      if (!activeGroup) return;
      const header = "Name,Enabled,SourceNodeId,TargetNodeId,Interval\n";
      const rows = activeGroup.tasks.map(t => `${t.name},${t.enabled},${t.sourceNodeId},${t.targetNodeId},${t.interval || activeGroup.defaultInterval}`).join('\n');
      const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `scheduler_${activeGroup.name}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
      const csv = "Name,Enabled,SourceNodeId,TargetNodeId,Interval\nMap 1,TRUE,ns=2;s=Source1,ns=2;s=Target1,100";
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'scheduler_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const deleteListItems = (listType: 'source' | 'target') => {
      if (!activeGroup) return;
      const listKey = listType === 'source' ? 'sourceList' : 'targetList';
      const selectedSet = listType === 'source' ? selectedSourceIds : selectedTargetIds;
      if (selectedSet.size === 0) {
          toast("Clear entire list?", {
              action: {
                  label: 'Clear',
                  onClick: () => setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, [listKey]: [] } : g))
              },
              cancel: {
                  label: 'Cancel',
                  onClick: () => {}
              }
          });
          return;
      }
      const newList = activeGroup[listKey].filter(n => !selectedSet.has(n.internalId||n.nodeId));
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, [listKey]: newList } : g));
      if (listType === 'source') setSelectedSourceIds(new Set()); else setSelectedTargetIds(new Set());
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleImportCsv} accept=".csv,.txt" />
        
        {mismatchModal && mismatchModal.isOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="px-6 py-4 border-b border-slate-200 bg-amber-50 flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><AlertTriangle className="w-6 h-6"/></div>
                        <div><h3 className="font-bold text-slate-800">Type Mismatch Detected</h3><p className="text-xs text-slate-500">Some candidate pairs have different data types.</p></div>
                    </div>
                    <div className="p-6 overflow-y-auto">
                        <div className="space-y-2">
                            {mismatchModal.mismatches.map((m: any, i: number) => (
                                <div key={i} className="flex flex-col bg-slate-50 p-3 rounded border border-slate-200 text-xs">
                                    <div className="flex justify-between font-bold text-slate-700 mb-1"><span>Pair #{m.index}</span></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><span className="text-slate-400 block mb-0.5">Source ({m.sourceType})</span><code className="bg-white px-1 py-0.5 rounded border block truncate" title={m.source}>{m.source}</code></div>
                                        <div><span className="text-slate-400 block mb-0.5">Target ({m.targetType})</span><code className="bg-white px-1 py-0.5 rounded border block truncate" title={m.target}>{m.target}</code></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-slate-500 italic">Creating these tasks might result in write errors if the server enforces strict type checking.</p>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                        <button onClick={() => setMismatchModal(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-bold text-sm">Cancel</button>
                        <button onClick={mismatchModal.onConfirm} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold text-sm shadow-sm">Continue Anyway</button>
                    </div>
                </div>
            </div>
        )}

        {/* TOP BAR */}
        <div className="flex items-center justify-between bg-slate-100/50 border-b border-slate-200 pr-2">
            <div className="flex items-end overflow-x-auto scrollbar-thin max-w-[50%]">
                {groups.map(g => (
                    <div key={g.id} onClick={() => setActiveGroupId(g.id)} className={`group px-4 py-2 text-xs font-bold border-r border-slate-200 cursor-pointer flex items-center gap-2 min-w-[120px] ${activeGroupId === g.id ? 'bg-white text-indigo-600 border-t-2 border-t-indigo-500' : 'bg-slate-50 text-slate-500 hover:bg-white'}`}>
                        {editingGroupId === g.id ? (<input autoFocus className="w-20 bg-transparent outline-none" value={editGroupName} onChange={e => setEditGroupName(e.target.value)} onBlur={() => { if(editGroupName) setGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, name: editGroupName } : gr)); setEditingGroupId(null); }} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}/>) : (<span onDoubleClick={() => { setEditingGroupId(g.id); setEditGroupName(g.name); }}>{g.name}</span>)}
                        <span className="bg-slate-200 text-[9px] px-1.5 rounded-full text-slate-500">{g.tasks.length}</span>
                        <button onClick={(e) => handleDeleteGroup(e, g.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-500"><X className="w-3 h-3"/></button>
                    </div>
                ))}
                <button onClick={handleAddGroup} className="px-3 py-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 transition-colors"><Plus className="w-4 h-4"/></button>
            </div>
            <div className="flex items-center gap-2 py-1">
                <div className="flex items-center bg-white border border-slate-200 rounded overflow-hidden h-7 shadow-sm">
                    <button onClick={handleDownloadTemplate} className="px-2 h-full hover:bg-slate-50 text-slate-500 border-r border-slate-100" title={t.sub.actions.template}><FileSpreadsheet className="w-3.5 h-3.5"/></button>
                    <button onClick={() => fileInputRef.current?.click()} className="px-2 h-full hover:bg-slate-50 text-slate-500 border-r border-slate-100" title={t.scheduler.import}><FileUp className="w-3.5 h-3.5"/></button>
                    <button onClick={handleExportCsv} className="px-2 h-full hover:bg-slate-50 text-slate-500" title={t.scheduler.export}><FileDown className="w-3.5 h-3.5"/></button>
                </div>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                {activeGroup && (
                    <>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 h-7 shadow-sm" title={t.rw.readCycle}><Clock className="w-3.5 h-3.5 text-slate-400"/><input type="number" min="50" step="50" className="w-12 text-xs font-mono outline-none text-right" value={activeGroup.defaultInterval} onChange={(e) => setGroups(prev => prev.map(gr => gr.id === activeGroupId ? { ...gr, defaultInterval: Number(e.target.value) } : gr))}/><span className="text-[10px] text-slate-400 font-bold">{t.trend.cycle}(ms)</span></div>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 h-7 shadow-sm" title="Write Batch Size"><Settings className="w-3.5 h-3.5 text-slate-400"/><input type="number" min="50" step="50" className="w-12 text-xs font-mono outline-none text-right" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}/><span className="text-[10px] text-slate-400 font-bold">Batch</span></div>
                    </>
                )}
                <button onClick={() => setIsMasterRunning(!isMasterRunning)} disabled={!isConnected} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold shadow-sm transition-all ${isMasterRunning ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'}`}>{isMasterRunning ? <Pause className="w-3.5 h-3.5"/> : <Play className="w-3.5 h-3.5"/>}{isMasterRunning ? t.scheduler.stopAll : t.scheduler.startAll}</button>
            </div>
        </div>

        {/* MAIN SPLIT */}
        <div className="flex-1 flex min-h-0">
            {renderVirtualStagingList('source')}
            <Resizer onMouseDown={(e) => startResizing('source', e)} />
            {renderVirtualStagingList('target')}
            <Resizer onMouseDown={(e) => startResizing('target', e)} />
            
            {/* RIGHT COL: TASKS */}
            <div className="flex-1 flex flex-col h-full bg-slate-50 min-w-[300px]">
                <div className="px-4 py-2 border-b border-slate-200 bg-white flex justify-between items-center h-10">
                    <div className="text-xs font-bold text-slate-600 uppercase flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-500" /> {t.scheduler.activeMappings}</div>
                    <div className="flex gap-2">
                        {selectedTaskIds.size > 0 && (<button className="flex items-center gap-1 px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded text-[10px] font-bold border border-red-200 animate-in fade-in" onClick={() => { if(activeGroup && selectedTaskIds.size > 0) { setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, tasks: g.tasks.filter(t => !selectedTaskIds.has(t.id)) } : g)); setSelectedTaskIds(new Set()); } }}><Trash2 className="w-3 h-3"/> {t.scheduler.deleteSelected} ({selectedTaskIds.size})</button>)}
                        <button className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded text-[10px] font-bold border border-amber-200" onClick={handleClearErrors}><RotateCcw className="w-3 h-3"/> {t.scheduler.resetStats}</button>
                        <button className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-slate-200" onClick={handleManualAddTask}><Plus className="w-3 h-3"/> {t.scheduler.addTask}</button>
                        <button className="text-slate-400 hover:text-red-500 p-1" title={t.trend.clear} onClick={() => setGroups(prev=>prev.map(g=>g.id===activeGroupId?{...g,tasks:[]}:g))}><Trash2 className="w-4 h-4"/></button>
                    </div>
                </div>
                <div className="grid grid-cols-12 gap-2 px-3 h-8 items-center bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase flex-shrink-0">
                    <div className="col-span-1 flex justify-center cursor-pointer hover:text-blue-600" onClick={() => { if(activeGroup) { if(selectedTaskIds.size === activeGroup.tasks.length) setSelectedTaskIds(new Set()); else setSelectedTaskIds(new Set(activeGroup.tasks.map(t => t.id))); } }}>{activeGroup && selectedTaskIds.size > 0 && selectedTaskIds.size === activeGroup.tasks.length ? <CheckSquare className="w-3.5 h-3.5"/> : <Square className="w-3.5 h-3.5"/>}</div>
                    <div className="col-span-1">{t.scheduler.table.status}</div>
                    <div className="col-span-4">{t.scheduler.table.source}</div>
                    <div className="col-span-4">{t.scheduler.table.target}</div>
                    <div className="col-span-2 text-right">{t.scheduler.table.lastValue}</div>
                </div>
                {renderVirtualTasks()}
            </div>
        </div>
    </div>
  );
};

// -- Custom Interval Hook --
function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  useEffect(() => { savedCallback.current = callback; }, [callback]);
  useEffect(() => {
    if (delay !== null) {
      const id = setInterval(() => savedCallback.current(), delay);
      return () => clearInterval(id);
    }
  }, [delay]);
}

export default React.memo(SchedulerPanel);
