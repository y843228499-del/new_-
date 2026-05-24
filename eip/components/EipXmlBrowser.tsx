

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { FileCode, ChevronRight, ChevronDown, CheckSquare, Square, Folder, FileText, Loader2, Plus, Upload, Trash2, Box, Layers, MousePointer2, ArrowDownAZ, Check, Minus, MoreHorizontal, X, ArrowRight, ShoppingBasket, Copy, MinusSquare, GripVertical, Filter } from 'lucide-react';
import { SymbolXmlParser, XmlNode } from '../utils/xmlParser';
import { EipTag, CipDataType, CipDataTypeNames } from '../../type-definitions/eip';

interface EipXmlBrowserProps {
    onImport: (tags: Partial<EipTag>[]) => void;
}

// --- CONSTANTS ---
const BASKET_ROW_HEIGHT = 32; // Fixed height for virtual scrolling
const BASKET_BUFFER = 5;      // Buffer rows

// --- BASKET ITEM DEFINITION ---
interface BasketItem {
    id: string; // Unique ID (path)
    name: string;
    dataType: CipDataType;
    dataTypeName: string;
    elementCount: number;
    rawPath: string;
}

// --- TYPE FILTER MENU COMPONENT ---
const TypeFilterMenu: React.FC<{
    x: number;
    y: number;
    stats: Map<string, number>;
    hiddenSet: Set<string>;
    onClose: () => void;
    onToggle: (type: string) => void;
    onAction: (action: 'ALL' | 'NONE' | 'INVERT') => void;
}> = ({ x, y, stats, hiddenSet, onClose, onToggle, onAction }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const sortedTypes = Array.from(stats.keys()).sort();
    
    return (
        <div ref={ref} className="fixed z-[60] bg-white border border-slate-200 shadow-xl rounded-lg w-64 text-xs text-slate-700 flex flex-col animate-in fade-in zoom-in-95 duration-100" style={{ left: x - 180, top: y + 5 }}>
             <div className="p-2 border-b border-slate-100 bg-slate-50 rounded-t-lg font-bold text-slate-500">
                 筛选数据类型 (Filter Types)
             </div>
             <div className="p-2 border-b border-slate-100 flex gap-2 bg-white">
                <button onClick={() => onAction('ALL')} className="flex-1 px-2 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded border border-slate-200 transition-colors">全选 (All)</button>
                <button onClick={() => onAction('INVERT')} className="flex-1 px-2 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded border border-slate-200 transition-colors">反选 (Inv)</button>
             </div>
             <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-slate-200">
                {sortedTypes.map(t => {
                    const isChecked = !hiddenSet.has(t);
                    return (
                        <div key={t} onClick={() => onToggle(t)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 cursor-pointer rounded transition-colors group">
                            {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-blue-600"/> : <Square className="w-3.5 h-3.5 text-slate-300"/>}
                            <span className={`flex-1 truncate font-mono ${isChecked ? 'text-slate-700' : 'text-slate-400'}`}>{t}</span>
                            <span className="text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full text-[9px] group-hover:bg-white border border-transparent group-hover:border-slate-200">{stats.get(t)}</span>
                        </div>
                    );
                })}
                {sortedTypes.length === 0 && <div className="p-4 text-center text-slate-300 italic">列表为空</div>}
             </div>
        </div>
    );
};

interface TreeNodeProps {
    node: XmlNode;
    level: number;
    checkedIds: Set<string>;
    selectedPaths: Set<string>;
    addedIds: Set<string>;
    onToggleCheck: (node: XmlNode) => void; 
    onRowClick: (e: React.MouseEvent, node: XmlNode) => void;
    onExpand: (path: string) => void;
    onContextMenu: (e: React.MouseEvent, node: XmlNode) => void;
    expandedIds: Set<string>;
}

const TreeNode: React.FC<TreeNodeProps> = React.memo(({ 
    node, 
    level, 
    checkedIds, 
    selectedPaths,
    addedIds,
    onToggleCheck, 
    onRowClick,
    onExpand, 
    onContextMenu,
    expandedIds 
}) => {
    const isChecked = checkedIds.has(node.path);
    const isSelected = selectedPaths.has(node.path);
    const isExpanded = expandedIds.has(node.path);
    const isAdded = addedIds.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const isArray = node.arrayDimensions && node.arrayDimensions.length > 0;
    const isStructDef = node.isStructDef;
    
    let typeDisplay = node.dataTypeName || 'UNK';
    if (isArray && node.arrayDimensions) {
        typeDisplay = `${typeDisplay}[${node.arrayDimensions.join(',')}]`;
    }

    let Icon = FileText;
    let iconClass = "text-blue-400";

    if (node.path.startsWith('__UDT_')) {
        Icon = Box;
        iconClass = "text-purple-500";
    } else if (hasChildren) {
        if (isArray) {
            Icon = node.cipType === CipDataType.STRUCT ? Folder : Layers; 
            iconClass = node.cipType === CipDataType.STRUCT ? (isExpanded ? "text-amber-500 fill-amber-100" : "text-amber-400") : "text-indigo-500";
        } else {
            Icon = Folder;
            iconClass = isExpanded ? "text-amber-500 fill-amber-100" : "text-amber-400";
        }
    } else {
        Icon = FileText;
        iconClass = "text-blue-400";
    }

    return (
        <div 
            className={`flex items-center gap-2 px-2 cursor-pointer select-none border-b border-slate-50 transition-colors ${isSelected ? 'bg-blue-100' : 'hover:bg-slate-100'}`}
            style={{ paddingLeft: `${level * 20 + 8}px`, height: '28px' }}
            onClick={(e) => onRowClick(e, node)}
            onContextMenu={(e) => onContextMenu(e, node)}
        >
            <div 
                onClick={(e) => { e.stopPropagation(); onExpand(node.path); }} 
                className={`w-4 h-4 flex items-center justify-center shrink-0 text-slate-400 hover:text-slate-600 ${!hasChildren ? 'invisible' : ''}`}
            >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5"/> : <ChevronRight className="w-3.5 h-3.5"/>}
            </div>

            {!isStructDef ? (
                <div 
                    onClick={(e) => { e.stopPropagation(); onToggleCheck(node); }} 
                    className={`shrink-0 ${isChecked ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}`}
                >
                    {isChecked ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                </div>
            ) : (
                <div className="w-4 h-4 shrink-0"></div>
            )}

            <div className="shrink-0 text-slate-500">
                <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
            </div>

            <span className={`text-xs truncate ${hasChildren || isStructDef ? 'font-bold text-slate-700' : 'text-slate-600'}`}>
                {node.name}
            </span>

            <div className="ml-auto flex items-center gap-2">
                {isAdded && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200 animate-in fade-in zoom-in">
                        <Check className="w-3 h-3" /> Added
                    </span>
                )}

                {!node.path.startsWith('__') && (
                    <span className={`text-[10px] px-1.5 rounded border flex items-center gap-1 font-mono ${isArray ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                        {typeDisplay}
                    </span>
                )}
            </div>
        </div>
    );
});

// Context Menu Component
const BrowserContextMenu: React.FC<{
    x: number;
    y: number;
    count: number;
    onClose: () => void;
    onCheckSelf: () => void;
    onCheckRecursive: () => void;
    onUncheckRecursive: () => void;
}> = ({ x, y, count, onClose, onCheckSelf, onCheckRecursive, onUncheckRecursive }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={ref} className="fixed z-50 bg-white border border-slate-200 shadow-xl rounded-lg py-1 w-56 flex flex-col text-slate-700 animate-in fade-in zoom-in-95 duration-100" style={{ left: x, top: y }}>
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100 mb-1">
                高亮选中 {count} 行
            </div>
            <button onClick={onCheckSelf} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600"/> 勾选高亮项 (Check)
            </button>
            <div className="h-px bg-slate-100 my-1"></div>
            <button onClick={onCheckRecursive} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-emerald-600"/> 递归勾选高亮项 (All)
            </button>
            <button onClick={onUncheckRecursive} className="px-3 py-2 text-xs text-left hover:bg-slate-100 flex items-center gap-2 text-red-600">
                <Minus className="w-3.5 h-3.5"/> 取消勾选 (Uncheck)
            </button>
        </div>
    );
};

// --- STYLING CONSTANTS ---
const HEADER_CELL_BASE = "flex-shrink-0 border-r border-slate-200 px-2 flex items-center font-bold text-[10px] text-slate-500 uppercase relative overflow-hidden group/header h-full";
const CELL_BASE = "flex-shrink-0 border-r border-slate-50 px-2 flex items-center truncate h-full";

// --- RESIZER COMPONENT ---
const Resizer = ({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) => (
    <div 
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400 z-20 group-hover/header:bg-slate-200 hover:!bg-indigo-400 transition-colors"
        onMouseDown={onMouseDown}
        onClick={e => e.stopPropagation()}
    />
);

export const EipXmlBrowser: React.FC<EipXmlBrowserProps> = ({ onImport }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState("");
    const [treeData, setTreeData] = useState<XmlNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // UI State
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(["__VAR_ROOT__", "__UDT_ROOT__"])); 
    
    // NEW: Tag Name Format State
    const [nameFormat, setNameFormat] = useState<'DOT' | 'UNDERSCORE'>('DOT');

    // Left Tree Selection State
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [checkedNodes, setCheckedNodes] = useState<Map<string, XmlNode>>(new Map());
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [lastClickedPath, setLastClickedPath] = useState<string | null>(null); 
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    // Right Basket State
    const [basket, setBasket] = useState<BasketItem[]>([]);
    const [checkedBasketIds, setCheckedBasketIds] = useState<Set<string>>(new Set());
    
    // NEW: Basket Data Type Filter State
    const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
    const [filterMenuPos, setFilterMenuPos] = useState<{x: number, y: number} | null>(null);
    
    // Basket Selection State
    const [selectedBasketIds, setSelectedBasketIds] = useState<Set<string>>(new Set());
    const [lastSelectedBasketIndex, setLastSelectedBasketIndex] = useState<number | null>(null);
    
    // Layout State
    const [sidebarWidth, setSidebarWidth] = useState(500); 
    const isResizing = useRef(false);

    // Basket Column State
    const [basketColWidths, setBasketColWidths] = useState({
        index: 50,
        name: 360,
        count: 80,
        type: 260 
    });
    const basketResizingRef = useRef<{ col: keyof typeof basketColWidths, startX: number, startWidth: number } | null>(null);

    // Virtual Scroll State
    const [basketScrollTop, setBasketScrollTop] = useState(0);
    const basketContainerRef = useRef<HTMLDivElement>(null);
    
    // Virtual Tree Scroll State
    const [treeScrollTop, setTreeScrollTop] = useState(0);
    const treeContainerRef = useRef<HTMLDivElement>(null);

    // Click Outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
                setIsSortMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const basketNodeIds = useMemo(() => new Set(basket.map(i => i.id)), [basket]);
    
    // --- BASKET FILTER LOGIC ---
    const typeStats = useMemo(() => {
        const s = new Map<string, number>();
        basket.forEach(i => s.set(i.dataTypeName, (s.get(i.dataTypeName) || 0) + 1));
        return s;
    }, [basket]);

    const filteredBasket = useMemo(() => {
        if (hiddenTypes.size === 0) return basket;
        return basket.filter(i => !hiddenTypes.has(i.dataTypeName));
    }, [basket, hiddenTypes]);

    const handleFilterToggle = (type: string) => {
        setHiddenTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
        });
    };

    const handleFilterAction = (action: 'ALL' | 'NONE' | 'INVERT') => {
        const allTypes = Array.from(typeStats.keys());
        if (action === 'ALL') {
            setHiddenTypes(new Set<string>());
        } else if (action === 'NONE') {
            // Logic not used in UI but kept for completeness: Hide All would imply selecting everything in hiddenSet
            setHiddenTypes(new Set(allTypes));
        } else if (action === 'INVERT') {
            setHiddenTypes(prev => {
                const next = new Set<string>();
                allTypes.forEach(t => {
                    if (!prev.has(t)) next.add(t);
                });
                return next;
            });
        }
    };

    // --- REUSABLE SORT LOGIC ---
    const executeSort = useCallback((nodes: XmlNode[], mode: 'TYPE_FIRST' | 'LANG_FIRST'): XmlNode[] => {
        const sortRecursive = (list: XmlNode[]): XmlNode[] => {
            const sorted = [...list].sort((a, b) => {
                const getWeight = (n: XmlNode) => {
                     if (n.cipType === CipDataType.STRUCT || n.type === 'Folder') return 30;
                     return 10;
                };
                const wA = getWeight(a);
                const wB = getWeight(b);
                if (wA !== wB) return wB - wA; 

                if (mode === 'TYPE_FIRST') {
                    const typeA = (a.dataTypeName || '').toUpperCase();
                    const typeB = (b.dataTypeName || '').toUpperCase();
                    if (typeA !== typeB) return typeA.localeCompare(typeB, 'en');
                    const dimA = a.arrayDimensions?.length || 0;
                    const dimB = b.arrayDimensions?.length || 0;
                    if (dimA !== dimB) return dimA - dimB;
                    const isAsciiA = /^[\x00-\x7F]*$/.test(a.name);
                    const isAsciiB = /^[\x00-\x7F]*$/.test(b.name);
                    if (isAsciiA && !isAsciiB) return -1;
                    if (!isAsciiA && isAsciiB) return 1;
                } else {
                    const isAsciiA = /^[\x00-\x7F]*$/.test(a.name);
                    const isAsciiB = /^[\x00-\x7F]*$/.test(b.name);
                    if (isAsciiA && !isAsciiB) return -1;
                    if (!isAsciiA && isAsciiB) return 1;
                    const typeA = (a.dataTypeName || '').toUpperCase();
                    const typeB = (b.dataTypeName || '').toUpperCase();
                    if (typeA !== typeB) return typeA.localeCompare(typeB, 'en');
                    const dimA = a.arrayDimensions?.length || 0;
                    const dimB = b.arrayDimensions?.length || 0;
                    if (dimA !== dimB) return dimA - dimB;
                }
                return a.name.localeCompare(b.name, undefined, { numeric: true });
            });
            return sorted.map(node => {
                if (node.children && node.children.length > 0) {
                    return { ...node, children: sortRecursive(node.children) };
                }
                return node;
            });
        };
        return sortRecursive(nodes);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setIsLoading(true);
        setTreeData([]);
        
        const reader = new FileReader();
        // Use arrow function and closure to access reader safely
        reader.onload = () => {
            try {
                const result = reader.result;
                if (typeof result !== 'string') {
                     throw new Error("Failed to read file as text.");
                }
                
                const parser = new SymbolXmlParser();
                const nodes = parser.parse(result as string);
                const sortedNodes = executeSort(nodes, 'TYPE_FIRST');
                setTreeData(sortedNodes);
            } catch (err: any) {
                console.error(err);
                const msg = err instanceof Error ? err.message : String(err);
                alert(`解析 XML 失败: ${msg}`);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Flatten Tree Logic for Virtualization
    const flatTreeNodes = useMemo(() => {
        const result: { node: XmlNode, level: number }[] = [];
        const traverse = (nodes: XmlNode[], level: number) => {
            for (const node of nodes) {
                result.push({ node, level });
                if (node.children && node.children.length > 0 && expandedIds.has(node.path)) {
                    traverse(node.children, level + 1);
                }
            }
        };
        traverse(treeData, 0);
        return result;
    }, [treeData, expandedIds]);

    const TREE_ROW_HEIGHT = 28;
    const TREE_BUFFER = 10;
    const totalTreeHeight = flatTreeNodes.length * TREE_ROW_HEIGHT;
    
    const treeViewportHeight = treeContainerRef.current?.clientHeight || 600;
    const startTreeIndex = Math.max(0, Math.floor(treeScrollTop / TREE_ROW_HEIGHT) - TREE_BUFFER);
    const endTreeIndex = Math.min(flatTreeNodes.length, Math.floor((treeScrollTop + treeViewportHeight) / TREE_ROW_HEIGHT) + TREE_BUFFER);
    
    const visibleTreeNodes = flatTreeNodes.slice(startTreeIndex, endTreeIndex).map((item, i) => ({ 
        ...item, 
        index: startTreeIndex + i 
    }));

    // --- LEFT TREE LOGIC ---
    const handleToggleCheck = useCallback((node: XmlNode) => {
        if (node.isStructDef) return;
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(node.path)) next.delete(node.path); else next.add(node.path);
            return next;
        });
        setCheckedNodes(prev => {
            const next = new Map(prev);
            if (next.has(node.path)) next.delete(node.path); else next.set(node.path, node);
            return next;
        });
    }, []);

    const handleRowClick = (e: React.MouseEvent, node: XmlNode) => {
        e.stopPropagation();
        const path = node.path;
        
        if (e.shiftKey && lastClickedPath) {
            // Using flatTreeNodes for selection logic is consistent with virtualization
            const startIdx = flatTreeNodes.findIndex(n => n.node.path === lastClickedPath);
            const endIdx = flatTreeNodes.findIndex(n => n.node.path === path);

            if (startIdx !== -1 && endIdx !== -1) {
                const min = Math.min(startIdx, endIdx);
                const max = Math.max(startIdx, endIdx);
                const newSelection = e.ctrlKey || e.metaKey ? new Set(selectedPaths) : new Set<string>();
                for (let i = min; i <= max; i++) {
                    newSelection.add(flatTreeNodes[i].node.path);
                }
                setSelectedPaths(newSelection);
            }
        } else if (e.ctrlKey || e.metaKey) {
            const newSet = new Set<string>(selectedPaths);
            if (newSet.has(path)) newSet.delete(path);
            else newSet.add(path);
            setSelectedPaths(newSet);
            setLastClickedPath(path);
        } else {
            setSelectedPaths(new Set([path]));
            setLastClickedPath(path);
        }
    };

    const handleExpand = (path: string) => {
        const newExpanded = new Set<string>(expandedIds);
        if (newExpanded.has(path)) newExpanded.delete(path);
        else newExpanded.add(path);
        setExpandedIds(newExpanded);
    };

    const handleSmartSort = (mode: 'TYPE_FIRST' | 'LANG_FIRST') => {
        setIsSortMenuOpen(false);
        if (treeData.length === 0) return;
        setIsLoading(true);
        setTimeout(() => {
            const newTree = executeSort(treeData, mode);
            setTreeData(newTree);
            setIsLoading(false);
        }, 10);
    };

    // --- BASKET LOGIC ---
    const handleAddToBasket = () => {
        if (checkedNodes.size === 0) { alert("请先在左侧树中勾选变量。"); return; }
        
        const newItems: BasketItem[] = [];
        const existingIds = new Set(basket.map(i => i.id));

        checkedNodes.forEach((node) => {
            if (node.isStructDef) return;
            if (existingIds.has(node.path)) return; 

            // User Request: Default element count to 1, ignore actual array size for import
            const count = 1; 
            const tagName = node.path.replace('__VAR_ROOT__.', '');
            
            newItems.push({
                id: node.path,
                rawPath: node.path,
                name: tagName,
                dataType: node.cipType,
                dataTypeName: node.dataTypeName || 'UNK',
                elementCount: count
            });
        });

        if (newItems.length > 0) {
            setBasket(prev => [...prev, ...newItems]);
        }
    };

    const handleImportFromBasket = () => {
        const itemsToImport = filteredBasket.filter(i => checkedBasketIds.has(i.id));
        if (itemsToImport.length === 0) { alert("请在右侧变量表中勾选要导入的项。"); return; }

        const tags: Partial<EipTag>[] = itemsToImport.map(i => ({
            tagName: nameFormat === 'UNDERSCORE' ? i.name.replace(/\./g, '__') : i.name, // APPLY FORMAT
            dataType: i.dataType,
            elementCount: i.elementCount,
            value: i.dataType === CipDataType.BOOL ? false : 0
        }));
        
        tags.sort((a, b) => {
            const nameA = a.tagName || '';
            const nameB = b.tagName || '';
            return nameA.localeCompare(nameB);
        });
        onImport(tags);
        setCheckedBasketIds(new Set()); 
    };

    // --- BASKET SELECTION & CHECKING (USING FILTERED LIST) ---
    const toggleBasketSelectAll = () => {
        // Only consider currently visible filtered items
        const visibleIds = filteredBasket.map(i => i.id);
        const allVisibleSelected = visibleIds.every(id => checkedBasketIds.has(id));
        
        if (allVisibleSelected && visibleIds.length > 0) {
            // Uncheck visible items
            setCheckedBasketIds(prev => {
                const next = new Set(prev);
                visibleIds.forEach(id => next.delete(id));
                return next;
            });
        } else {
            // Check visible items
            setCheckedBasketIds(prev => {
                const next = new Set(prev);
                visibleIds.forEach(id => next.add(id));
                return next;
            });
        }
    };

    const handleBasketRowClick = (e: React.MouseEvent, id: string, index: number) => {
        e.stopPropagation();
        const newSet = new Set(selectedBasketIds);

        if (e.shiftKey && lastSelectedBasketIndex !== null) {
             const start = Math.min(lastSelectedBasketIndex, index);
             const end = Math.max(lastSelectedBasketIndex, index);
             if (!e.ctrlKey) newSet.clear();
             for (let i = start; i <= end; i++) {
                 if (filteredBasket[i]) newSet.add(filteredBasket[i].id);
             }
        } else if (e.ctrlKey) {
             if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
             setLastSelectedBasketIndex(index);
        } else {
             newSet.clear();
             newSet.add(id);
             setLastSelectedBasketIndex(index);
        }
        setSelectedBasketIds(newSet);
    };

    const handleBasketCheck = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newChecked = new Set(checkedBasketIds);
        const targetState = !newChecked.has(id);
        if (selectedBasketIds.has(id) && selectedBasketIds.size > 1) {
            selectedBasketIds.forEach(selId => {
                if (targetState) newChecked.add(selId);
                else newChecked.delete(selId);
            });
        } else {
            if (targetState) newChecked.add(id);
            else newChecked.delete(id);
        }
        setCheckedBasketIds(newChecked);
    };

    const handleBasketRemoveSelected = () => {
        setBasket(prev => prev.filter(i => !checkedBasketIds.has(i.id)));
        setCheckedBasketIds(new Set());
        setSelectedBasketIds(new Set());
        setLastSelectedBasketIndex(null);
    };

    // --- SIDEBAR RESIZING (Corrected Logic) ---
    const startResizing = useCallback((e: React.MouseEvent) => { 
        e.preventDefault(); 
        isResizing.current = true; 
        document.addEventListener('mousemove', resize); 
        document.addEventListener('mouseup', stopResizing); 
        document.body.style.cursor = 'col-resize'; 
        document.body.style.userSelect = 'none'; 
    }, []);
    
    const stopResizing = useCallback(() => { 
        isResizing.current = false; 
        document.removeEventListener('mousemove', resize); 
        document.removeEventListener('mouseup', stopResizing); 
        document.body.style.cursor = ''; 
        document.body.style.userSelect = ''; 
    }, []);
    
    const resize = useCallback((e: MouseEvent) => { 
        if (isResizing.current && containerRef.current) { 
            // Correct offset calculation relative to component container
            const offset = containerRef.current.getBoundingClientRect().left;
            const newWidth = e.clientX - offset;
            setSidebarWidth(Math.max(300, Math.min(newWidth, 1200))); 
        }
    }, []);

    // --- BASKET COLUMN RESIZING ---
    // REORDERED FUNCTIONS TO FIX REFERENCE ERROR
    const handleBasketResizeMove = useCallback((e: MouseEvent) => {
        if (!basketResizingRef.current) return;
        const { col, startX, startWidth } = basketResizingRef.current;
        const diff = e.clientX - startX;
        setBasketColWidths(prev => ({ ...prev, [col]: Math.max(50, startWidth + diff) }));
    }, []);

    const handleBasketResizeUp = useCallback(() => {
        basketResizingRef.current = null;
        document.removeEventListener('mousemove', handleBasketResizeMove);
    }, [handleBasketResizeMove]);

    // Use a ref to hold the up handler so we can reference it inside itself safely
    const handleUpRef = useRef(handleBasketResizeUp);
    useEffect(() => { handleUpRef.current = handleBasketResizeUp; }, [handleBasketResizeUp]);

    const handleBasketResizeUpWrapper = useCallback(() => {
        if (handleUpRef.current) handleUpRef.current();
        document.removeEventListener('mouseup', handleBasketResizeUpWrapper);
    }, []);

    const startBasketResizing = useCallback((col: keyof typeof basketColWidths, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        basketResizingRef.current = { col, startX: e.clientX, startWidth: basketColWidths[col] };
        document.addEventListener('mousemove', handleBasketResizeMove);
        document.addEventListener('mouseup', handleBasketResizeUpWrapper);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [basketColWidths, handleBasketResizeMove, handleBasketResizeUpWrapper]);

    // --- BASKET VIRTUAL SCROLL LOGIC ---
    const handleBasketScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setBasketScrollTop(e.currentTarget.scrollTop);
    }, []);

    const visibleBasketItems = useMemo(() => {
        const total = filteredBasket.length;
        const viewportH = basketContainerRef.current?.clientHeight || 600;
        const start = Math.max(0, Math.floor(basketScrollTop / BASKET_ROW_HEIGHT) - BASKET_BUFFER);
        const end = Math.min(total, Math.floor((basketScrollTop + viewportH) / BASKET_ROW_HEIGHT) + BASKET_BUFFER);
        
        return filteredBasket.slice(start, end).map((item, i) => ({ item, index: start + i }));
    }, [filteredBasket, basketScrollTop]);

    const totalBasketHeight = filteredBasket.length * BASKET_ROW_HEIGHT;

    // Total content width for horizontal scrolling
    const minBasketTableWidth = 40 + basketColWidths.name + basketColWidths.count + basketColWidths.type + 50;

    // --- CONTEXT MENU & BATCH LOGIC ---
    const handleContextMenu = (e: React.MouseEvent, node: XmlNode) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedPaths.has(node.path)) {
            setSelectedPaths(new Set([node.path]));
            setLastClickedPath(node.path);
        }
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const traverseAndUpdate = (nodes: {node: XmlNode}[], targetPaths: Set<string>, operation: 'CHECK_SELF' | 'CHECK_ALL' | 'UNCHECK', state: { ids: Set<string>, map: Map<string, XmlNode> }) => {
        // Use flattened tree to find target nodes efficiently for CHECK_SELF
        // But for recursive ops we still need tree structure access, which XmlNode has via 'children'
        // Just use the provided logic which was recursive, but we need to start from roots or find the selected nodes.
        // Optimization: Iterate selectedPaths and find nodes in map if possible? 
        // Or iterate full treeData as before. Since parsing allows 50k nodes, iteration is okay.
        
        const process = (n: XmlNode, forceRecursive: boolean) => {
            const isTarget = targetPaths.has(n.path) || forceRecursive;
            if (isTarget) {
                if (operation === 'UNCHECK') {
                    state.ids.delete(n.path);
                    state.map.delete(n.path);
                } else {
                    if (!n.isStructDef) {
                        state.ids.add(n.path);
                        state.map.set(n.path, n);
                    }
                }
            }
            const shouldRecurse = (operation === 'CHECK_ALL' || operation === 'UNCHECK') && isTarget;
            if (n.children) {
                n.children.forEach(c => process(c, shouldRecurse));
            }
        };
        treeData.forEach(root => process(root, false));
    };

    const handleBatchAction = (operation: 'CHECK_SELF' | 'CHECK_ALL' | 'UNCHECK') => {
        if (selectedPaths.size === 0) return;
        const newCheckedIds = new Set<string>(checkedIds);
        const newCheckedNodes = new Map<string, XmlNode>(checkedNodes);
        // Pass flatTreeNodes wrappers but logic iterates treeData
        traverseAndUpdate([{node: treeData[0]}], selectedPaths, operation, { ids: newCheckedIds, map: newCheckedNodes });
        setCheckedIds(newCheckedIds);
        setCheckedNodes(newCheckedNodes);
        setContextMenu(null);
    };

    return (
        <div className="flex h-full bg-slate-50/30 overflow-hidden" ref={containerRef}>
            {contextMenu && (
                <BrowserContextMenu 
                    x={contextMenu.x} y={contextMenu.y} count={selectedPaths.size}
                    onClose={() => setContextMenu(null)}
                    onCheckSelf={() => handleBatchAction('CHECK_SELF')}
                    onCheckRecursive={() => handleBatchAction('CHECK_ALL')}
                    onUncheckRecursive={() => handleBatchAction('UNCHECK')}
                />
            )}
            
            {filterMenuPos && (
                <TypeFilterMenu 
                    x={filterMenuPos.x} y={filterMenuPos.y}
                    stats={typeStats}
                    hiddenSet={hiddenTypes}
                    onClose={() => setFilterMenuPos(null)}
                    onToggle={handleFilterToggle}
                    onAction={handleFilterAction}
                />
            )}

            {/* LEFT: XML TREE */}
            <div style={{ width: sidebarWidth }} className="flex flex-col bg-white border-r border-slate-200 flex-shrink-0">
                {/* Tree Toolbar */}
                <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center shadow-sm flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 rounded text-xs font-bold transition-colors whitespace-nowrap shadow-sm">
                            <Upload className="w-3.5 h-3.5" /> 加载 XML
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".xml" onChange={handleFileChange} />
                        <div className="text-xs text-slate-500 font-mono truncate" title={fileName}>{fileName || "No File"}</div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                         <div className="relative" ref={sortMenuRef}>
                            <button onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} disabled={treeData.length === 0} className="p-1.5 hover:bg-slate-200 rounded text-slate-500 disabled:opacity-30" title="Sort Options"><ArrowDownAZ className="w-4 h-4"/></button>
                            {isSortMenuOpen && (
                                <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-slate-200 rounded shadow-xl z-50 flex flex-col py-1 text-xs">
                                    <button onClick={() => handleSmartSort('TYPE_FIRST')} className="text-left px-3 py-2 hover:bg-slate-100">Type First</button>
                                    <button onClick={() => handleSmartSort('LANG_FIRST')} className="text-left px-3 py-2 hover:bg-slate-100">Lang First</button>
                                </div>
                            )}
                         </div>
                         <div className="w-px h-4 bg-slate-300 mx-1"></div>
                         <button onClick={handleAddToBasket} disabled={checkedNodes.size === 0} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50 transition-all active:scale-95">
                             <ArrowRight className="w-3.5 h-3.5" /> 添加到变量表
                         </button>
                    </div>
                </div>

                {/* Tree Content (Virtualized) */}
                <div 
                    className="flex-1 overflow-auto p-0 relative" 
                    onClick={() => setSelectedPaths(new Set())}
                    ref={treeContainerRef}
                    onScroll={(e) => setTreeScrollTop(e.currentTarget.scrollTop)}
                >
                    {isLoading && <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" /><span className="text-xs text-slate-500 font-bold">Processing...</span></div>}
                    {treeData.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                            <FileCode className="w-16 h-16 opacity-20" />
                            <p className="text-sm font-medium">请加载符号表文件</p>
                        </div>
                    ) : (
                        <div style={{ height: totalTreeHeight, position: 'relative' }}>
                            {visibleTreeNodes.map(({ node, level, index }) => (
                                <div key={node.path} style={{ position: 'absolute', top: index * TREE_ROW_HEIGHT, left: 0, right: 0, height: TREE_ROW_HEIGHT }}>
                                    <TreeNode 
                                        node={node} 
                                        level={level} 
                                        checkedIds={checkedIds} 
                                        selectedPaths={selectedPaths}
                                        addedIds={basketNodeIds}
                                        onToggleCheck={handleToggleCheck}
                                        onRowClick={handleRowClick}
                                        onExpand={handleExpand}
                                        onContextMenu={handleContextMenu}
                                        expandedIds={expandedIds}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="px-3 py-1 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between shrink-0">
                    <span>已选: {checkedNodes.size}</span>
                    <span>Nodes: {treeData.length > 0 ? flatTreeNodes.length : 0} (Visible)</span>
                </div>
            </div>

            {/* RESIZER */}
            <div onMouseDown={startResizing} className="w-1 bg-slate-200 hover:bg-blue-500 cursor-col-resize z-20 transition-colors flex items-center justify-center flex-shrink-0"><div className="h-4 w-0.5 bg-slate-400 rounded"></div></div>

            {/* RIGHT: VARIABLE BASKET */}
            <div className="flex-1 flex flex-col bg-white min-w-[300px]">
                {/* Basket Toolbar */}
                <div className="p-3 border-b border-slate-200 bg-indigo-50 flex justify-between items-center shadow-sm flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-800">
                        <ShoppingBasket className="w-4 h-4" /> 预选变量表 (Basket)
                        <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded text-[10px]">{basket.length}</span>
                        {hiddenTypes.size > 0 && <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded text-[10px]">Filter Active</span>}
                        {selectedBasketIds.size > 0 && <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px] ml-2">Selected: {selectedBasketIds.size}</span>}
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* Name Format Toggle */}
                        <div className="flex items-center bg-white/60 rounded p-0.5 border border-indigo-100 mr-2" title="标签名格式 (Tag Name Format)">
                             <button 
                                onClick={() => setNameFormat('DOT')} 
                                className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${nameFormat === 'DOT' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}
                             >
                                A.B
                             </button>
                             <button 
                                onClick={() => setNameFormat('UNDERSCORE')} 
                                className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${nameFormat === 'UNDERSCORE' ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400 hover:text-indigo-600'}`}
                             >
                                A__B
                             </button>
                        </div>
                        
                        <button onClick={() => { setBasket([]); setCheckedBasketIds(new Set()); setSelectedBasketIds(new Set()); setLastSelectedBasketIndex(null); }} disabled={basket.length===0} className="p-1.5 hover:bg-indigo-100 text-indigo-400 hover:text-red-500 rounded disabled:opacity-30" title="清空列表"><Trash2 className="w-3.5 h-3.5"/></button>
                        <button onClick={handleBasketRemoveSelected} disabled={checkedBasketIds.size===0} className="p-1.5 hover:bg-indigo-100 text-indigo-500 rounded disabled:opacity-30" title="移除勾选 (Checked)"><Minus className="w-3.5 h-3.5"/></button>
                        <div className="w-px h-4 bg-indigo-200 mx-1"></div>
                        <button onClick={handleImportFromBasket} disabled={checkedBasketIds.size === 0} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-1 transition-all active:scale-95">
                            <Plus className="w-3.5 h-3.5" /> 导入所选到工程
                        </button>
                    </div>
                </div>

                {/* Basket Header (Resizable + Index) */}
                <div className="flex items-center bg-slate-50 border-b border-slate-200 h-8 text-[10px] font-bold text-slate-500 uppercase flex-shrink-0 relative overflow-hidden" style={{ minWidth: minBasketTableWidth }}>
                    {/* Checkbox */}
                    <div className="w-10 flex justify-center items-center border-r border-slate-100 h-full cursor-pointer hover:bg-slate-100" onClick={toggleBasketSelectAll}>
                        {filteredBasket.length > 0 && filteredBasket.every(i => checkedBasketIds.has(i.id)) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-600"/>
                        ) : checkedBasketIds.size > 0 ? (
                            <MinusSquare className="w-3.5 h-3.5 text-blue-600"/>
                        ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300"/>
                        )}
                    </div>

                    {/* Resizable Headers */}
                    <div style={{ width: basketColWidths.index }} className={HEADER_CELL_BASE}>#<Resizer onMouseDown={(e) => startBasketResizing('index', e)} /></div>
                    <div style={{ width: basketColWidths.name }} className={HEADER_CELL_BASE}>Tag Name<Resizer onMouseDown={(e) => startBasketResizing('name', e)} /></div>
                    <div style={{ width: basketColWidths.count }} className={HEADER_CELL_BASE}>Count<Resizer onMouseDown={(e) => startBasketResizing('count', e)} /></div>
                    
                    {/* DATA TYPE HEADER WITH FILTER */}
                    <div style={{ width: basketColWidths.type }} className={`${HEADER_CELL_BASE} !overflow-visible`}>
                        <div className="flex items-center justify-between w-full">
                            <span>Data Type</span>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setFilterMenuPos({x: rect.right, y: rect.bottom});
                                }}
                                className={`p-1 rounded hover:bg-slate-200 ${hiddenTypes.size > 0 ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}
                            >
                                <Filter className="w-3 h-3" />
                            </button>
                        </div>
                        <Resizer onMouseDown={(e) => startBasketResizing('type', e)} />
                    </div>
                    
                    <div className="flex-1"></div>
                </div>

                {/* Basket Content (Virtual Scrolling) */}
                <div 
                    ref={basketContainerRef}
                    className="flex-1 overflow-auto bg-slate-50/30 relative"
                    onScroll={handleBasketScroll}
                >
                    {filteredBasket.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                            <ShoppingBasket className="w-12 h-12 opacity-20" />
                            <p className="text-xs italic">{basket.length > 0 ? "筛选结果为空" : "从左侧选择变量并添加"}</p>
                        </div>
                    ) : (
                        <div style={{ height: totalBasketHeight, position: 'relative', minWidth: minBasketTableWidth }}>
                            {visibleBasketItems.map(({ item, index }) => {
                                const isSelected = selectedBasketIds.has(item.id); // Highlight
                                const isChecked = checkedBasketIds.has(item.id);   // Checkbox Action
                                
                                // Format logic for display
                                const displayName = nameFormat === 'UNDERSCORE' ? item.name.replace(/\./g, '__') : item.name;

                                return (
                                <div 
                                    key={item.id} 
                                    style={{ position: 'absolute', top: index * BASKET_ROW_HEIGHT, height: BASKET_ROW_HEIGHT, left: 0, right: 0 }}
                                    onClick={(e) => handleBasketRowClick(e, item.id, index)}
                                    className={`flex items-center h-8 text-xs cursor-pointer select-none transition-colors border-b border-slate-100
                                        ${isSelected ? 'bg-blue-100' : 'bg-white hover:bg-slate-50'} 
                                        ${isChecked && !isSelected ? 'bg-indigo-50' : ''}
                                    `}
                                >
                                    <div 
                                        className="w-10 flex justify-center items-center text-slate-400 flex-shrink-0 cursor-pointer h-full hover:bg-black/5"
                                        onClick={(e) => handleBasketCheck(e, item.id)} // Separate check handler
                                    >
                                        {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-blue-600"/> : <Square className="w-3.5 h-3.5 text-slate-300"/>}
                                    </div>
                                    
                                    <div style={{ width: basketColWidths.index }} className={CELL_BASE}><span className="w-full text-center text-slate-400">{index + 1}</span></div>
                                    <div style={{ width: basketColWidths.name }} className={CELL_BASE} title={displayName}><span className="truncate font-medium text-slate-700">{displayName}</span></div>
                                    <div style={{ width: basketColWidths.count }} className={CELL_BASE}><span className="w-full text-center text-slate-600 font-bold">{item.elementCount}</span></div>
                                    <div style={{ width: basketColWidths.type }} className={CELL_BASE} title={item.dataTypeName}><span className="truncate text-slate-500 font-mono text-[10px]">{item.dataTypeName}</span></div>
                                </div>
                            )})}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
