
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ReferenceDescription, MethodMetadata, BatchGroup, Subscription, SchedulerGroup, OpcDataType } from '../types';
import { opcuaService } from '../services/opcuaService';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Plus, ShoppingBasket, Trash2, CheckSquare, Square, X, AlertCircle, RefreshCw, Copy, Info, Check, Edit3, MinusSquare, Home, Split, ArrowRightLeft, Layers, Cpu, Activity, GripVertical, Settings } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

interface BrowserPanelProps {
  isConnected: boolean;
  sessionId?: string;
  addLog: (level: 'info' | 'error' | 'success' | 'warn', msg: string) => void;
  onAddToReadWrite: (nodes: ReferenceDescription[], targetGroupIds?: string[]) => void;
  onAddToSubscription: (nodes: ReferenceDescription[], targetSubIds?: number[]) => void;
  onAddToTrend: (nodes: ReferenceDescription[], targetGroupIds?: string[]) => void;
  onAddToScheduler: (nodes: ReferenceDescription[], targetGroupId?: string, listType?: 'source' | 'target') => void;
  existingRwIds?: Set<string>;
  existingSubIds?: Set<string>;
  existingTrendIds?: Set<string>;
  rwGroups?: BatchGroup[];
  subscriptions?: Subscription[];
  trendGroups?: BatchGroup[];
  schedulerGroups?: SchedulerGroup[];
  isVisible?: boolean;
}

// --- TYPES FOR VIRTUAL TREE ---

interface FlatNode extends ReferenceDescription {
    level: number;
    parentKey: string | null;
    expanded: boolean;
    loading: boolean;
    hasChildren: boolean;
    key: string;
}

const ROW_HEIGHT = 26;
const BASKET_ROW_HEIGHT = 30;

const formatTypeSignature = (dataType?: string, valueRank?: number, arrayDimensions?: string | number[]) => {
    if (!dataType) return '';
    if (valueRank && valueRank >= 1) {
        let dims = '';
        if (arrayDimensions) {
            dims = Array.isArray(arrayDimensions) ? arrayDimensions.join(',') : String(arrayDimensions);
        }
        // Handle cases where dims might be empty but rank implies array
        if (!dims) return `${dataType}[]`;
        return `${dataType}[${dims}]`;
    }
    return dataType;
};

// --- STYLES & COMPONENTS ---

const HEADER_CELL_BASE = "flex-shrink-0 border-r border-slate-200 px-2 flex items-center font-bold text-[10px] text-slate-500 uppercase relative overflow-hidden group/header";
const CELL_BASE = "flex-shrink-0 border-r border-slate-50 px-2 flex items-center truncate";

const ResizeHandle = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-400 z-20 group-hover/header:bg-slate-200 hover:!bg-amber-400 transition-colors"
        onMouseDown={onMouseDown}
        onClick={e => e.stopPropagation()}
    />
);

// --- MODALS ---

const AttributesModal: React.FC<{ isOpen: boolean; onClose: () => void; attributes: any }> = ({ isOpen, onClose, attributes }) => {
    const { t } = useLanguage();
    if (!isOpen || !attributes) return null;
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-[500px] max-h-[90%] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Info className="w-5 h-5 text-blue-500"/> {t.browser.attributesModal.title}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                            {Object.entries(attributes).map(([key, val]) => (
                                <tr key={key}><td className="py-2 font-bold text-slate-500 w-40 capitalize">{key}</td><td className="py-2 font-mono text-slate-700">{String(val)}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t border-slate-200 flex justify-end bg-slate-50">
                     <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-white rounded text-xs font-bold hover:bg-slate-700">{t.browser.attributesModal.close}</button>
                </div>
            </div>
        </div>
    );
};

const TargetSelectionModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (ids: string[]) => void; title: string; items: { id: string, name: string }[] }> = ({ isOpen, onClose, onConfirm, title, items }) => {
    const { t } = useLanguage();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    
    // Auto-select first item if list has items
    useEffect(() => {
        if (isOpen) {
            if (items.length > 0) {
                // If single item, select it. If multiple, maybe clear or select first?
                // Defaulting to first item for UX convenience if list is short, or empty.
                setSelected(new Set([items[0].id]));
            } else {
                setSelected(new Set());
            }
        }
    }, [isOpen, items]);

    const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
    
    if (!isOpen) return null;
    
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-96 max-h-[80%] flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">{title}</h3>
                    <button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                    {items.length === 0 ? (
                        <div className="text-center text-slate-400 italic py-4">{t.browser.targetModal.emptyGroups}<br/>{t.browser.targetModal.createDefault}</div>
                    ) : (
                        <div className="space-y-2">
                            {items.map(item => (
                                <label key={item.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="w-4 h-4 text-blue-600 rounded" />
                                    <span className="text-sm font-medium text-slate-700">{item.name}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
                    <button onClick={onClose} className="px-3 py-2 text-slate-600 hover:bg-slate-200 rounded text-xs font-bold">{t.browser.targetModal.cancel}</button>
                    <button onClick={() => onConfirm(Array.from(selected))} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50">{t.browser.targetModal.confirm}</button>
                </div>
            </div>
        </div>
    );
};

const SchedulerTargetModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (groupId: string | undefined, listType: 'source' | 'target') => void; items: { id: string, name: string }[] }> = ({ isOpen, onClose, onConfirm, items }) => {
    const { t } = useLanguage();
    const [selectedGroup, setSelectedGroup] = useState<string>('');
    const [listType, setListType] = useState<'source' | 'target'>('source');

    useEffect(() => {
        if (isOpen && items.length > 0) setSelectedGroup(items[0].id);
        else setSelectedGroup('');
        setListType('source');
    }, [isOpen, items]);

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
            <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-96 flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">{t.browser.schedulerModal.title}</h3>
                    <button onClick={onClose}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
                </div>
                
                <div className="p-6 flex flex-col gap-6">
                    {items.length === 0 ? (
                        <div className="text-center text-slate-400 italic">{t.browser.schedulerModal.noGroups}<br/>{t.browser.targetModal.createDefault}</div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t.browser.schedulerModal.targetGroup}</label>
                                <select 
                                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                                    value={selectedGroup}
                                    onChange={(e) => setSelectedGroup(e.target.value)}
                                >
                                    {items.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">{t.browser.schedulerModal.listType}</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <label className={`flex flex-col items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${listType === 'source' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                        <input type="radio" name="listType" className="hidden" checked={listType === 'source'} onChange={() => setListType('source')} />
                                        <ArrowRightLeft className="w-6 h-6 rotate-180" />
                                        <span className="text-xs font-bold">{t.browser.schedulerModal.sourceList}</span>
                                    </label>
                                    <label className={`flex flex-col items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all ${listType === 'target' ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                        <input type="radio" name="listType" className="hidden" checked={listType === 'target'} onChange={() => setListType('target')} />
                                        <ArrowRightLeft className="w-6 h-6" />
                                        <span className="text-xs font-bold">{t.browser.schedulerModal.targetList}</span>
                                    </label>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
                    <button onClick={onClose} className="px-3 py-2 text-slate-600 hover:bg-slate-200 rounded text-xs font-bold">{t.browser.targetModal.cancel}</button>
                    <button onClick={() => onConfirm(selectedGroup || undefined, listType)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50">{t.browser.targetModal.confirm}</button>
                </div>
            </div>
        </div>
    );
};

interface BrowserContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onRefresh: () => void;
    onSelectAllChildren: () => void;
    onDeselectAllChildren: () => void;
    onViewAttributes: () => void;
    onCopyNodeId: () => void;
    hasChildren: boolean;
}

const BrowserContextMenu: React.FC<BrowserContextMenuProps> = ({ x, y, onClose, onRefresh, onSelectAllChildren, onDeselectAllChildren, onViewAttributes, onCopyNodeId, hasChildren }) => {
    const { t } = useLanguage();
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={menuRef} className="fixed z-50 bg-white border border-slate-200 shadow-xl rounded-lg py-1 w-48 flex flex-col text-slate-700 animate-in fade-in zoom-in-95 duration-100" style={{ left: x, top: y }}>
            <button onClick={onRefresh} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5"/> {t.browser.contextMenu.refresh}</button>
            <div className="h-px bg-slate-100 my-1"></div>
            {hasChildren && (
                <>
                    <button onClick={onSelectAllChildren} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><CheckSquare className="w-3.5 h-3.5 text-blue-600"/> {t.browser.contextMenu.selectAllChildren}</button>
                    <button onClick={onDeselectAllChildren} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><Square className="w-3.5 h-3.5 text-slate-400"/> {t.browser.contextMenu.deselectAllChildren}</button>
                    <div className="h-px bg-slate-100 my-1"></div>
                </>
            )}
            <button onClick={onViewAttributes} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><Info className="w-3.5 h-3.5"/> {t.browser.contextMenu.viewAttributes}</button>
            <button onClick={onCopyNodeId} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2"><Copy className="w-3.5 h-3.5"/> {t.browser.contextMenu.copyNodeId}</button>
        </div>
    );
};

const Breadcrumbs: React.FC<{ flatNodes: FlatNode[], focusedIndex: number | null, onNavigate: (key: string) => void }> = ({ flatNodes, focusedIndex, onNavigate }) => {
    if (focusedIndex === null || flatNodes.length === 0) return <div className="h-8 border-b border-slate-200 bg-slate-50"></div>;
    
    const path: FlatNode[] = [];
    let current = flatNodes[focusedIndex];
    while (current) {
        path.unshift(current);
        if (!current.parentKey) break;
        const parent = flatNodes.find(n => n.key === current.parentKey);
        if (!parent) break;
        current = parent;
    }

    return (
        <div className="flex items-center px-2 h-8 bg-slate-50 border-b border-slate-200 text-xs overflow-x-auto scrollbar-none whitespace-nowrap">
            <button onClick={() => onNavigate(flatNodes[0].key)} className="p-1 hover:bg-slate-200 rounded"><Home className="w-3.5 h-3.5 text-slate-500"/></button>
            {path.map((node, i) => (
                <React.Fragment key={node.key}>
                    <ChevronRight className="w-3 h-3 text-slate-400 mx-0.5 flex-shrink-0" />
                    <button 
                        onClick={() => onNavigate(node.key)}
                        className={`hover:underline px-1 rounded truncate max-w-[100px] ${i === path.length - 1 ? 'font-bold text-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        title={node.displayName}
                    >
                        {node.displayName}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
};

// --- MAIN COMPONENT ---

const BrowserPanel: React.FC<BrowserPanelProps> = ({ isConnected, sessionId, addLog, onAddToReadWrite, onAddToSubscription, onAddToTrend, onAddToScheduler, existingRwIds, existingSubIds, existingTrendIds, rwGroups, subscriptions, trendGroups, schedulerGroups }) => {
  const { t } = useLanguage();
  
  // -- VIRTUAL TREE STATE --
  const [flatNodes, setFlatNodes] = useState<FlatNode[]>([]);
  const [nodeCache, setNodeCache] = useState<Map<string, ReferenceDescription[]>>(new Map()); 
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // -- BROWSE SETTINGS --
  const [browseLimit, setBrowseLimit] = useState<number>(1000);

  // -- SELECTION STATE --
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number | null>(null);
  const [checkedTreeNodes, setCheckedTreeNodes] = useState<Map<string, ReferenceDescription>>(new Map());
  
  // -- BASKET --
  const [basketItems, setBasketItems] = useState<ReferenceDescription[]>([]);
  const [checkedBasketIds, setCheckedBasketIds] = useState<Set<string>>(new Set());
  const [basketScrollTop, setBasketScrollTop] = useState(0);
  const basketContainerRef = useRef<HTMLDivElement>(null);
  const basketHeaderRef = useRef<HTMLDivElement>(null);

  // -- RESIZABLE COLUMNS --
  const [basketColWidths, setBasketColWidths] = useState({
      index: 50,
      id: 670, 
      name: 180,
      type: 120
  });
  const basketResizingRef = useRef<{ col: keyof typeof basketColWidths, startX: number, startWidth: number } | null>(null);

  // -- MODALS & UI --
  const [attributesModalOpen, setAttributesModalOpen] = useState(false);
  const [nodeAttributes, setNodeAttributes] = useState<any>(null);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetModalType, setTargetModalType] = useState<'RW' | 'SUB' | 'TREND'>('RW');
  const [targetItems, setTargetItems] = useState<{id: string, name: string}[]>([]);
  const [schedulerModalOpen, setSchedulerModalOpen] = useState(false);
  const [schedulerTargetItems, setSchedulerTargetItems] = useState<{id: string, name: string}[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeIndex: number } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(400); 
  const isResizing = useRef(false);

  // Initialize Root
  useEffect(() => {
      if (isConnected && flatNodes.length === 0) {
          const root: FlatNode = {
              nodeId: 'ns=0;i=84',
              browseName: 'Root',
              displayName: 'Root',
              nodeClass: 'Object',
              referenceTypeId: '',
              isForward: true,
              typeDefinition: '',
              level: 0,
              parentKey: null,
              expanded: false,
              loading: false,
              hasChildren: true,
              key: 'ns=0;i=84'
          };
          setFlatNodes([root]);
      } else if (!isConnected) {
          setFlatNodes([]);
          setNodeCache(new Map()); 
          setCheckedTreeNodes(new Map()); // Clear checked nodes on disconnect
          setSelectedNodeIds(new Set()); // Clear highlighted nodes
          setFocusedNodeIndex(null); // Clear focus
      }
  }, [isConnected]);

  // -- BASKET RESIZING --
  const startBasketResizing = useCallback((col: keyof typeof basketColWidths, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      basketResizingRef.current = { col, startX: e.clientX, startWidth: basketColWidths[col] };
      document.addEventListener('mousemove', handleBasketResizeMove);
      document.addEventListener('mouseup', handleBasketResizeUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }, [basketColWidths]);

  const handleBasketResizeMove = useCallback((e: MouseEvent) => {
      if (!basketResizingRef.current) return;
      const { col, startX, startWidth } = basketResizingRef.current;
      const diff = e.clientX - startX;
      setBasketColWidths(prev => ({ ...prev, [col]: Math.max(50, startWidth + diff) }));
  }, []);

  const handleBasketResizeUp = useCallback(() => {
      basketResizingRef.current = null;
      document.removeEventListener('mousemove', handleBasketResizeMove);
      document.removeEventListener('mouseup', handleBasketResizeUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
  }, [handleBasketResizeMove]);

  const handleBasketScroll = (e: React.UIEvent<HTMLDivElement>) => {
      setBasketScrollTop(e.currentTarget.scrollTop);
      if (basketHeaderRef.current) {
          basketHeaderRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
  };

  const basketSet = useMemo(() => new Set(basketItems.map(i => i.nodeId)), [basketItems]);

  const totalHeight = flatNodes.length * ROW_HEIGHT;
  const viewportHeight = scrollContainerRef.current?.clientHeight || 600;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const endIndex = Math.min(flatNodes.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + 2);
  
  const visibleNodes = useMemo(() => {
      return flatNodes.slice(startIndex, endIndex).map((node, i) => ({ node, index: startIndex + i }));
  }, [flatNodes, startIndex, endIndex]);

  const totalBasketHeight = basketItems.length * BASKET_ROW_HEIGHT;
  const basketViewportHeight = basketContainerRef.current?.clientHeight || 400;
  const startBasket = Math.max(0, Math.floor(basketScrollTop / BASKET_ROW_HEIGHT) - 2);
  const endBasket = Math.min(basketItems.length, Math.floor((basketScrollTop + basketViewportHeight) / BASKET_ROW_HEIGHT) + 2);

  const visibleBasketItems = useMemo(() => {
      return basketItems.slice(startBasket, endBasket).map((item, i) => ({ item, index: startBasket + i }));
  }, [basketItems, startBasket, endBasket]);

  const totalBasketWidth = 40 + basketColWidths.index + basketColWidths.id + basketColWidths.name + basketColWidths.type + 80;

  const handleToggleExpand = async (index: number, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const node = flatNodes[index];
      if (!node.hasChildren) return;

      if (node.expanded) {
          const nextNodes = [...flatNodes];
          nextNodes[index] = { ...node, expanded: false };
          let removeCount = 0;
          for (let i = index + 1; i < nextNodes.length; i++) {
              if (nextNodes[i].level > node.level) removeCount++; else break;
          }
          nextNodes.splice(index + 1, removeCount);
          setFlatNodes(nextNodes);
      } else {
          if (nodeCache.has(node.key)) {
              const cachedChildren = nodeCache.get(node.key)!;
              const nodesToInsert = cachedChildren.map(c => convertToFlat(c, node.level + 1, node.key));
              setFlatNodes(prev => {
                  const idx = prev.findIndex(n => n.key === node.key);
                  if (idx === -1) return prev;
                  const updatedParent = { ...prev[idx], loading: false, expanded: true };
                  return [ ...prev.slice(0, idx), updatedParent, ...nodesToInsert, ...prev.slice(idx + 1) ];
              });
              return;
          }
          setFlatNodes(prev => { const nextArr = [...prev]; nextArr[index] = { ...nextArr[index], loading: true, expanded: true }; return nextArr; });
          try {
              let children: ReferenceDescription[] = [];
              if (sessionId) children = await opcuaService.browse(sessionId, node.nodeId, browseLimit);
              children.sort((a, b) => { const numA = Number(a.browseName); const numB = Number(b.browseName); if (!isNaN(numA) && !isNaN(numB)) return numA - numB; return a.browseName.localeCompare(b.browseName); });
              setNodeCache(prev => new Map(prev).set(node.key, children));
              const nodesToInsert = children.map(c => convertToFlat(c, node.level + 1, node.key));
              setFlatNodes(prev => {
                  const idx = prev.findIndex(n => n.key === node.key);
                  if (idx === -1) return prev;
                  const updatedParent = { ...prev[idx], loading: false, expanded: true };
                  return [ ...prev.slice(0, idx), updatedParent, ...nodesToInsert, ...prev.slice(idx + 1) ];
              });
          } catch (err: any) {
              addLog('error', `Browse failed: ${err.message}`);
              setFlatNodes(prev => { const newArr = [...prev]; const idx = newArr.findIndex(n => n.key === node.key); if (idx !== -1) newArr[idx] = { ...newArr[idx], loading: false, expanded: false }; return newArr; });
          }
      }
  };

  const convertToFlat = (node: ReferenceDescription, level: number, parentKey: string): FlatNode => {
      const isContainer = node.nodeClass === 'Object' || node.nodeClass === 'ObjectType';
      return { ...node, level, parentKey, expanded: false, loading: false, hasChildren: isContainer || node.nodeClass === 'Variable', key: node.nodeId };
  };

  const handleNodeClick = (index: number, node: FlatNode, ctrl: boolean, shift: boolean) => {
      setFocusedNodeIndex(index);
      if (ctrl) { const next = new Set(selectedNodeIds); if (next.has(node.nodeId)) next.delete(node.nodeId); else next.add(node.nodeId); setSelectedNodeIds(next); }
      else if (shift && focusedNodeIndex !== null) { const start = Math.min(focusedNodeIndex, index); const end = Math.max(focusedNodeIndex, index); const next = new Set(selectedNodeIds); for (let i = start; i <= end; i++) next.add(flatNodes[i].nodeId); setSelectedNodeIds(next); }
      else { setSelectedNodeIds(new Set([node.nodeId])); }
  };

  const handleNavigateToNode = (key: string) => {
      const index = flatNodes.findIndex(n => n.key === key);
      if (index !== -1) {
          setFocusedNodeIndex(index);
          handleNodeClick(index, flatNodes[index], false, false);
          if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = index * ROW_HEIGHT;
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (focusedNodeIndex === null) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); const next = Math.min(flatNodes.length - 1, focusedNodeIndex + 1); setFocusedNodeIndex(next); handleNodeClick(next, flatNodes[next], false, false); if (next * ROW_HEIGHT > scrollTop + viewportHeight - ROW_HEIGHT) scrollContainerRef.current?.scrollTo({ top: (next - 5) * ROW_HEIGHT }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const prev = Math.max(0, focusedNodeIndex - 1); setFocusedNodeIndex(prev); handleNodeClick(prev, flatNodes[prev], false, false); if (prev * ROW_HEIGHT < scrollTop) scrollContainerRef.current?.scrollTo({ top: prev * ROW_HEIGHT }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); const node = flatNodes[focusedNodeIndex]; if (!node.expanded) handleToggleExpand(focusedNodeIndex); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); const node = flatNodes[focusedNodeIndex]; if (node.expanded) handleToggleExpand(focusedNodeIndex); }
      else if (e.key === ' ') { e.preventDefault(); if (selectedNodeIds.size > 0) { const node = flatNodes[focusedNodeIndex]; const isChecked = checkedTreeNodes.has(node.nodeId); batchCheckHighlights(!isChecked); } }
  };

  const toggleCheck = (node: ReferenceDescription) => { setCheckedTreeNodes(prev => { const next = new Map(prev); if (next.has(node.nodeId)) next.delete(node.nodeId); else next.set(node.nodeId, node); return next; }); };
  const batchCheckHighlights = (check: boolean) => { if (selectedNodeIds.size === 0) return; setCheckedTreeNodes(prev => { const next = new Map(prev); flatNodes.forEach(node => { if (selectedNodeIds.has(node.nodeId)) { if (check) { if (node.nodeClass === 'Variable') next.set(node.nodeId, node); } else { next.delete(node.nodeId); } } }); return next; }); };
  const addCheckedToBasket = () => { setBasketItems(prev => { const existing = new Set(prev.map(n => n.nodeId)); const newItems = [...prev]; checkedTreeNodes.forEach(node => { if (!existing.has(node.nodeId)) newItems.push(node); }); return newItems; }); addLog('success', `Added ${checkedTreeNodes.size} items to variable table.`); };
  const toggleBasketCheck = (nodeId: string, index: number, e: React.MouseEvent) => { const newSet = new Set(checkedBasketIds); const isTargetChecked = !newSet.has(nodeId); if (e.shiftKey && lastBasketClickIndex !== null) { const start = Math.min(lastBasketClickIndex, index); const end = Math.max(lastBasketClickIndex, index); for (let i = start; i <= end; i++) { if (basketItems[i]) { if (isTargetChecked) newSet.add(basketItems[i].nodeId); else newSet.delete(basketItems[i].nodeId); } } } else { if (isTargetChecked) newSet.add(nodeId); else newSet.delete(nodeId); setLastBasketClickIndex(index); } setCheckedBasketIds(newSet); };
  const [lastBasketClickIndex, setLastBasketClickIndex] = useState<number|null>(null);
  
  const handleExpandBasketItem = (item: ReferenceDescription) => {
      let dims: number[] = [];
      if (item.arrayDimensions) { if (Array.isArray(item.arrayDimensions)) dims = item.arrayDimensions.map(Number); else dims = String(item.arrayDimensions).split(',').map(s => Number(s.trim())); } else if (item.valueRank && item.valueRank >= 1) { addLog('warn', 'Array dimensions missing, cannot expand automatically.'); return; }
      dims = dims.filter(d => d > 0);
      if (dims.length === 0) { addLog('warn', 'Cannot expand array: Invalid dimension size (0).'); return; }
      const generateIndices = (dimensions: number[]): string[] => { const results: string[] = []; const helper = (currentCoords: number[], depth: number) => { if (depth === dimensions.length) { results.push(currentCoords.join(',')); return; } for (let i = 0; i < dimensions[depth]; i++) helper([...currentCoords, i], depth + 1); }; helper([], 0); return results; };
      const indices = generateIndices(dims);
      
      const doExpand = () => {
          const newItems: ReferenceDescription[] = indices.map(idxStr => ({ ...item, nodeId: `${item.nodeId}[${idxStr}]`, displayName: `${item.displayName}[${idxStr}]`, browseName: `${item.browseName}[${idxStr}]`, valueRank: -1, arrayDimensions: undefined }));
          setBasketItems(prev => { const idx = prev.findIndex(n => n.nodeId === item.nodeId); if (idx === -1) return prev; const newList = [...prev]; newList.splice(idx, 1, ...newItems); return newList; });
          setCheckedBasketIds(prev => { const next = new Set(prev); if (next.has(item.nodeId)) next.delete(item.nodeId); return next; });
          addLog('success', `Expanded multi-dimensional array into ${indices.length} elements.`);
      };

      if (indices.length > 2000) { 
          toast(`This array contains ${indices.length} elements. Expanding it might slow down the view temporarily. Continue?`, {
              action: {
                  label: 'Continue',
                  onClick: doExpand
              },
              cancel: {
                  label: 'Cancel',
                  onClick: () => {}
              }
          });
          return; 
      }
      
      doExpand();
  };

  const handleCopySelectedBasketIds = () => { const selectedNodes = basketItems.filter(n => checkedBasketIds.has(n.nodeId)); if (selectedNodes.length === 0) return; const text = selectedNodes.map(n => n.nodeId).join('\n'); navigator.clipboard.writeText(text); addLog('success', `Copied ${selectedNodes.length} NodeIds to clipboard.`); };
  const startResizing = useCallback((e: React.MouseEvent) => { e.preventDefault(); isResizing.current = true; document.addEventListener('mousemove', resize); document.addEventListener('mouseup', stopResizing); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }, []);
  const stopResizing = useCallback(() => { isResizing.current = false; document.removeEventListener('mousemove', resize); document.removeEventListener('mouseup', stopResizing); document.body.style.cursor = ''; document.body.style.userSelect = ''; }, []);
  const resize = useCallback((e: MouseEvent) => { if (isResizing.current) setSidebarWidth(Math.max(200, Math.min(e.clientX - 288, 800))); }, []); 
  const handleContextMenu = (e: React.MouseEvent, index: number) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, nodeIndex: index }); };
  const handleRefreshNode = () => { if (!contextMenu) return; const index = contextMenu.nodeIndex; const node = flatNodes[index]; setContextMenu(null); setNodeCache(prev => { const next = new Map(prev); next.delete(node.key); return next; }); if (node.expanded) { handleToggleExpand(index).then(() => { setTimeout(() => handleToggleExpand(index), 50); }); } else { handleToggleExpand(index); } };
  const handleSelectAllChildren = () => { if (!contextMenu) return; const index = contextMenu.nodeIndex; const node = flatNodes[index]; setContextMenu(null); const nextMap = new Map(checkedTreeNodes); if (!node.expanded) { addLog('warn', 'Please expand the folder first to select its children.'); return; } for (let i = index + 1; i < flatNodes.length; i++) { const child = flatNodes[i]; if (child.level <= node.level) break; nextMap.set(child.nodeId, child); } setCheckedTreeNodes(nextMap); };
  const handleDeselectAllChildren = () => { if (!contextMenu) return; const index = contextMenu.nodeIndex; const node = flatNodes[index]; setContextMenu(null); const nextMap = new Map(checkedTreeNodes); for (let i = index + 1; i < flatNodes.length; i++) { const child = flatNodes[i]; if (child.level <= node.level) break; nextMap.delete(child.nodeId); } setCheckedTreeNodes(nextMap); };
  const handleCopyNodeId = () => { if (!contextMenu) return; const node = flatNodes[contextMenu.nodeIndex]; navigator.clipboard.writeText(node.nodeId); setContextMenu(null); addLog('success', `Copied NodeId: ${node.nodeId}`); };
  const handleViewAttributes = async () => { if (!sessionId || !contextMenu) return; const node = flatNodes[contextMenu.nodeIndex]; setContextMenu(null); try { const attrs = await opcuaService.readAttributes(sessionId, node.nodeId); setNodeAttributes(attrs); setAttributesModalOpen(true); } catch (e: any) { addLog('error', e.message); } };
  
  const validateAndAction = (targetSet: Set<string> | undefined, action: (items: ReferenceDescription[], ids: string[] | undefined) => void, type: 'RW' | 'SUB' | 'TREND') => { 
      const items = basketItems.filter(n => checkedBasketIds.has(n.nodeId)); 
      if (items.length === 0) { alert(t.browser.noSelectionMsg); return; } 
      
      const groups = type === 'RW' ? rwGroups : (type === 'TREND' ? trendGroups : subscriptions); 
      
      // Checking hasGroups
      const hasGroups = Array.isArray(groups) && groups.length > 0; 
      
      if (!hasGroups && type !== 'SUB') { 
          // If no groups, call action with undefined IDs -> triggers creation or pending logic in workspace
          action(items, undefined); 
      } else { 
          setTargetItems(groups?.map(g => ({ 
              id: String((g as any).id || (g as any).subscriptionId), 
              name: (g as any).name || `View ${(g as any).viewIndex}` 
          })) || []); 
          setTargetModalType(type); 
          setTargetModalOpen(true); 
      } 
  };

  const handleTargetConfirm = (ids: string[]) => { 
      const items = basketItems.filter(n => checkedBasketIds.has(n.nodeId)); 
      // Ensure ids are passed correctly. RW/Trend use string[], Sub uses number[] usually but mapped in handler.
      if (targetModalType === 'RW') onAddToReadWrite(items, ids); 
      else if (targetModalType === 'TREND') onAddToTrend(items, ids); 
      else onAddToSubscription(items, ids.map(Number)); 
      setTargetModalOpen(false); 
  };
  
  const handleSchedulerAdd = () => { const items = basketItems.filter(n => checkedBasketIds.has(n.nodeId)); if (items.length === 0) { alert(t.browser.noSelectionMsg); return; } setSchedulerTargetItems(schedulerGroups?.map(g => ({ id: g.id, name: g.name })) || []); setSchedulerModalOpen(true); };
  
  const handleSchedulerConfirm = (groupId: string | undefined, listType: 'source' | 'target') => { 
      const items = basketItems.filter(n => checkedBasketIds.has(n.nodeId)); 
      // Pass raw items to avoid messing up DataType string with formatted signature (e.g. Int32[2,2])
      // Downstream components handle rank/dims logic
      onAddToScheduler(items, groupId, listType); 
      setSchedulerModalOpen(false); 
  };

  const handleBasketDragStart = (e: React.DragEvent, item: ReferenceDescription) => {
      e.dataTransfer.setData('application/opcua-node', JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex h-full bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden relative select-none">
       <AttributesModal isOpen={attributesModalOpen} onClose={()=>setAttributesModalOpen(false)} attributes={nodeAttributes} />
       <TargetSelectionModal isOpen={targetModalOpen} onClose={()=>setTargetModalOpen(false)} onConfirm={handleTargetConfirm} title={targetModalType==='RW'?t.browser.targetModal.titleRW:(targetModalType==='TREND'?t.browser.targetModal.titleTrend:t.browser.targetModal.titleSub)} items={targetItems} />
       <SchedulerTargetModal isOpen={schedulerModalOpen} onClose={()=>setSchedulerModalOpen(false)} onConfirm={handleSchedulerConfirm} items={schedulerTargetItems} />
       {contextMenu && ( <BrowserContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onRefresh={handleRefreshNode} onSelectAllChildren={handleSelectAllChildren} onDeselectAllChildren={handleDeselectAllChildren} onViewAttributes={handleViewAttributes} onCopyNodeId={handleCopyNodeId} hasChildren={flatNodes[contextMenu.nodeIndex]?.hasChildren} /> )}
       
       {/* LEFT: Virtual Tree */}
       <div style={{ width: sidebarWidth }} className="flex flex-col bg-slate-50/50 flex-shrink-0 border-r border-slate-200">
           <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
               <div className="font-bold text-xs text-slate-600 uppercase flex items-center gap-2">
                   <Layers className="w-4 h-4"/> 
                   <div className="flex flex-col">
                       <span>{t.browser.title}</span>
                       <div className="flex items-center gap-1 mt-0.5">
                           <span className="text-[9px] text-slate-400 font-normal">Limit:</span>
                           <input 
                               type="number" 
                               className="w-12 h-4 text-[10px] border border-slate-300 rounded px-1 bg-white text-center focus:ring-1 focus:ring-blue-400 outline-none"
                               value={browseLimit}
                               onChange={(e) => setBrowseLimit(Math.max(0, Number(e.target.value)))}
                               title="Max Refs per node (0 = unlimited)"
                           />
                       </div>
                   </div>
               </div>
               <div className="flex gap-1 items-center">
                   <button onClick={() => batchCheckHighlights(true)} disabled={selectedNodeIds.size === 0} className="p-1 hover:bg-blue-100 rounded text-blue-600 disabled:opacity-30 disabled:hover:bg-transparent" title={t.browser.checkHighlights}><CheckSquare className="w-4 h-4"/></button>
                   <button onClick={() => batchCheckHighlights(false)} disabled={selectedNodeIds.size === 0} className="p-1 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent" title={t.browser.uncheckHighlights}><Square className="w-4 h-4"/></button>
                   <div className="w-px h-4 bg-slate-300 mx-1"></div>
                   <button onClick={() => setCheckedTreeNodes(new Map())} disabled={checkedTreeNodes.size===0} className="text-[10px] text-slate-400 hover:text-red-500 disabled:opacity-30 mr-2">{t.browser.clearSelection}</button>
                   <button onClick={addCheckedToBasket} disabled={checkedTreeNodes.size===0} className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] rounded font-bold shadow-sm disabled:opacity-50"><Plus className="w-3 h-3"/> {t.browser.addChecked}</button>
               </div>
           </div>
           <Breadcrumbs flatNodes={flatNodes} focusedIndex={focusedNodeIndex} onNavigate={handleNavigateToNode} />
           <div ref={scrollContainerRef} className="flex-1 overflow-auto relative outline-none" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} tabIndex={0} onKeyDown={handleKeyDown}>
               {!isConnected ? ( <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2"><Activity className="w-8 h-8 opacity-20" /><span className="text-xs italic">{t.browser.connectFirst}</span></div> ) : ( <div style={{ minHeight: totalHeight, position: 'relative' }}> <div style={{ height: startIndex * ROW_HEIGHT }}></div> {visibleNodes.map(({ node, index }) => { const isSelected = selectedNodeIds.has(node.nodeId); const isChecked = checkedTreeNodes.has(node.nodeId); const isAdded = basketSet.has(node.nodeId); const isMethod = node.nodeClass === 'Method'; const isVariable = node.nodeClass === 'Variable'; const typeSignature = formatTypeSignature(node.dataType, node.valueRank, node.arrayDimensions); return ( <div key={node.key} draggable onDragStart={(e) => { e.dataTransfer.setData('application/opcua-node', JSON.stringify(node)); e.dataTransfer.effectAllowed = 'copy'; }} className={`flex items-center px-2 hover:bg-slate-100 transition-colors w-max min-w-full ${isSelected ? 'bg-blue-100 hover:bg-blue-200' : ''}`} style={{ height: ROW_HEIGHT, paddingLeft: `${node.level * 16 + 8}px` }} onClick={(e) => handleNodeClick(index, node, e.ctrlKey || e.metaKey, e.shiftKey)} onContextMenu={(e) => handleContextMenu(e, index)}> <div className="w-4 h-4 flex items-center justify-center mr-1 cursor-pointer z-10 flex-shrink-0" onClick={(e) => handleToggleExpand(index, e)}> {node.loading ? <RefreshCw className="w-3 h-3 animate-spin text-blue-500" /> : node.hasChildren ? (node.expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />) : <div className="w-3.5 h-3.5"></div>} </div> {isVariable ? ( <div onClick={(e) => { e.stopPropagation(); toggleCheck(node); }} className={`mr-2 cursor-pointer flex-shrink-0 ${isChecked ? 'text-blue-600' : 'text-slate-300 hover:text-blue-400'}`}> {isChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />} </div> ) : <div className="w-6 flex-shrink-0"></div>} <div className="flex-shrink-0 mr-2"> {node.nodeClass === 'Object' ? (node.expanded ? <FolderOpen className="w-4 h-4 text-amber-500" /> : <Folder className="w-4 h-4 text-amber-400" />) : isMethod ? <Cpu className="w-4 h-4 text-purple-500" /> : <FileText className={`w-4 h-4 ${isVariable ? 'text-sky-500' : 'text-slate-400'}`} />} </div> <span className={`text-xs whitespace-nowrap mr-2 ${isMethod ? 'font-medium text-purple-700' : 'text-slate-700'}`}>{node.displayName}</span> {isAdded && ( <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200 mr-2 flex-shrink-0 animate-in fade-in zoom-in"> <Check className="w-3 h-3" /> {t.browser.alreadyAdded} </span> )} {typeSignature && <span className="ml-auto text-[9px] text-slate-400 bg-slate-50 px-1 rounded border border-slate-100 whitespace-nowrap">{typeSignature}</span>} </div> ); })} <div style={{ height: (flatNodes.length - endIndex) * ROW_HEIGHT }}></div> </div> )}
           </div>
       </div>
       
       <div onMouseDown={startResizing} className="w-1 bg-slate-200 hover:bg-blue-500 cursor-col-resize z-20 transition-colors flex items-center justify-center flex-shrink-0"><div className="h-4 w-0.5 bg-slate-400 rounded"></div></div>
       
       {/* RIGHT: Variable Table (Basket) */}
       <div className="flex-1 flex flex-col min-h-0 bg-white">
           <div className="flex flex-col h-full">
               <div className="px-4 py-2 border-b border-slate-200 flex justify-between items-center bg-white h-12 flex-shrink-0">
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-700"><ShoppingBasket className="w-5 h-5 text-sky-600"/> {t.browser.basket} ({basketItems.length})</div>
                    <div className="flex gap-2">
                        <button onClick={() => setCheckedBasketIds(new Set())} disabled={checkedBasketIds.size===0} className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs hover:bg-slate-200 disabled:opacity-50 font-medium" title={t.browser.uncheckAll}><MinusSquare className="w-3.5 h-3.5 inline mr-1" />{t.browser.uncheckAll}</button>
                        <button onClick={handleCopySelectedBasketIds} disabled={checkedBasketIds.size===0} className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs hover:bg-slate-200 disabled:opacity-50" title="Copy Selected NodeIds"><Copy className="w-3.5 h-3.5"/></button>
                        <button onClick={() => { setBasketItems(prev=>prev.filter(n=>!checkedBasketIds.has(n.nodeId))); setCheckedBasketIds(new Set()); }} disabled={checkedBasketIds.size===0} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs hover:bg-red-100 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => validateAndAction(existingRwIds, (items, ids) => onAddToReadWrite(items, ids), 'RW')} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 shadow-sm">{t.browser.addToRW}</button>
                        <button onClick={() => validateAndAction(existingSubIds, (items, ids) => onAddToSubscription(items, ids?.map(Number)), 'SUB')} className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 shadow-sm">{t.browser.addToSub}</button>
                        <button onClick={() => validateAndAction(existingTrendIds, (items, ids) => onAddToTrend(items, ids), 'TREND')} className="px-3 py-1 bg-amber-500 text-white rounded text-xs font-bold hover:bg-amber-600 shadow-sm">{t.browser.addToTrend}</button>
                        <button onClick={handleSchedulerAdd} className="px-3 py-1 bg-rose-500 text-white rounded text-xs font-bold hover:bg-rose-600 shadow-sm"><ArrowRightLeft className="w-3.5 h-3.5 inline mr-1"/>{t.browser.addToScheduler}</button>
                    </div>
               </div>
               <div className="flex-1 flex flex-col min-h-0 bg-white relative">
                    {/* HEADER - NOW RESIZABLE */}
                    <div ref={basketHeaderRef} className="flex items-center bg-slate-50 border-b border-slate-200 h-8 flex-shrink-0 text-[10px] font-bold text-slate-500 uppercase z-10 overflow-hidden" style={{ minWidth: '100%' }}>
                        <div className="w-10 flex justify-center items-center h-full border-r border-slate-100 flex-shrink-0">
                            <div onClick={() => { if (checkedBasketIds.size > 0) { setCheckedBasketIds(new Set()); } else { setCheckedBasketIds(new Set(basketItems.map(n => n.nodeId))); } }} className="cursor-pointer text-slate-400 hover:text-blue-500">
                                {basketItems.length > 0 && checkedBasketIds.size === basketItems.length ? <CheckSquare className="w-4 h-4 text-blue-600"/> : checkedBasketIds.size > 0 ? <MinusSquare className="w-4 h-4 text-blue-600"/> : <Square className="w-4 h-4"/>}
                            </div>
                        </div>
                        <div style={{ width: basketColWidths.index }} className={HEADER_CELL_BASE}>#<ResizeHandle onMouseDown={(e) => startBasketResizing('index', e)} /></div>
                        <div style={{ width: basketColWidths.id }} className={HEADER_CELL_BASE}>ID<ResizeHandle onMouseDown={(e) => startBasketResizing('id', e)} /></div>
                        <div style={{ width: basketColWidths.name }} className={HEADER_CELL_BASE}>Name<ResizeHandle onMouseDown={(e) => startBasketResizing('name', e)} /></div>
                        <div style={{ width: basketColWidths.type }} className={HEADER_CELL_BASE}>Type<ResizeHandle onMouseDown={(e) => startBasketResizing('type', e)} /></div>
                        <div className="w-20 flex justify-center items-center flex-shrink-0 border-l border-slate-100 h-full">Action</div>
                    </div>

                    {/* BODY - VIRTUALIZED & RESIZABLE */}
                    <div ref={basketContainerRef} className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300" onScroll={handleBasketScroll}>
                        {basketItems.length === 0 ? ( <div className="p-8 text-center text-slate-400 text-xs italic">{t.browser.empty}</div> ) : ( 
                            <div style={{ height: totalBasketHeight, position: 'relative', minWidth: totalBasketWidth }}> 
                                {visibleBasketItems.map(({ item, index }) => ( 
                                    <div key={item.nodeId} draggable onDragStart={(e) => handleBasketDragStart(e, item)} style={{ top: index * BASKET_ROW_HEIGHT, height: BASKET_ROW_HEIGHT, left: 0, right: 0, width: 'max-content' }} onClick={(e) => toggleBasketCheck(item.nodeId, index, e)} className={`absolute flex items-center border-b border-slate-50 text-xs cursor-pointer transition-colors ${checkedBasketIds.has(item.nodeId) ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'}`}> 
                                        <div className="w-10 flex justify-center items-center flex-shrink-0 h-full border-r border-slate-50 text-slate-300"> 
                                            {checkedBasketIds.has(item.nodeId) ? <CheckSquare className="w-4 h-4 text-blue-600"/> : <Square className="w-4 h-4"/>} 
                                        </div> 
                                        <div style={{ width: basketColWidths.index }} className={CELL_BASE}> <span className="w-full text-center text-slate-400">{index + 1}</span> </div>
                                        <div style={{ width: basketColWidths.id }} className={`${CELL_BASE} font-mono text-slate-600 h-full`} title={item.nodeId}> {item.nodeId} </div> 
                                        <div style={{ width: basketColWidths.name }} className={`${CELL_BASE} text-slate-700 h-full`} title={item.displayName}> {item.displayName} </div> 
                                        <div style={{ width: basketColWidths.type }} className={`${CELL_BASE} text-slate-400 h-full`}> {formatTypeSignature(item.dataType, item.valueRank, item.arrayDimensions)} </div> 
                                        <div className="w-20 flex justify-center items-center flex-shrink-0 h-full gap-1 border-l border-slate-50"> 
                                            {item.valueRank && item.valueRank >= 1 && ( <button onClick={(e) => { e.stopPropagation(); handleExpandBasketItem(item); }} className="text-slate-300 hover:text-purple-500" title="Expand Array"> <Split className="w-3.5 h-3.5" /> </button> )} 
                                            <button onClick={(e)=>{e.stopPropagation(); navigator.clipboard.writeText(item.nodeId); addLog('success', 'Copied NodeId');}} className="text-slate-300 hover:text-blue-500" title="Copy NodeId"> <Copy className="w-3.5 h-3.5"/> </button> 
                                            <button onClick={(e)=>{e.stopPropagation();setBasketItems(prev=>prev.filter(n=>n.nodeId!==item.nodeId));}} className="text-slate-300 hover:text-red-500" title="Remove"> <X className="w-3.5 h-3.5"/> </button> 
                                            <GripVertical className="w-3 h-3 text-slate-300 cursor-grab" />
                                        </div> 
                                    </div> 
                                ))} 
                            </div> 
                        )}
                    </div>
               </div>
           </div>
       </div>
    </div>
  );
};

export default React.memo(BrowserPanel);
