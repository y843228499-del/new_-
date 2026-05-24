
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, X, Braces, List, Grid, Layers, Eye, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, Square, Edit3, Clipboard, ClipboardPaste, MinusSquare, Check, Hash, Binary } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ValueDisplayProps {
  value: any;
  dataType?: string;
  nodeId?: string; // If provided, enables write features
  onWrite?: (writes: { indexRange: string, value: any }[]) => Promise<void>; // The parent handles the actual write
}

const ROW_HEIGHT = 30; // Fixed row height for virtualization
const BUFFER = 5; // Extra rows to render

const safeStringify = (val: any, space?: number) => {
    try {
        return JSON.stringify(val, (key, value) => typeof value === 'bigint' ? value.toString() : value, space);
    } catch (e) {
        return String(val);
    }
};

const ValueDisplay: React.FC<ValueDisplayProps> = ({ value, dataType, nodeId, onWrite }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSlice, setActiveSlice] = useState(0); // For 3D arrays
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Selection & Write State
  const [selectedIndices, setSelectedIndices] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<string | null>(null);
  const [writeVal, setWriteVal] = useState('');
  const [isWriting, setIsWriting] = useState(false);

  // INLINE EDIT STATE
  const [editingIndex, setEditingIndex] = useState<string | null>(null); // "0" or "0,1"
  const [inlineWriteVal, setInlineWriteVal] = useState("");

  // DISPLAY FORMAT STATE (NEW)
  const [displayRadix, setDisplayRadix] = useState<'DEC' | 'HEX'>('DEC');

  // Drag State - Initial offset shifted right by 100px to avoid sidebar overlap
  const [offset, setOffset] = useState({ x: 100, y: 0 });
  const dragRef = useRef<{ startX: number, startY: number, initialOffX: number, initialOffY: number } | null>(null);

  // Reset state when modal opens or value changes significantly (length change)
  useEffect(() => {
      if (isOpen) {
          setScrollTop(0);
          setSelectedIndices(new Set());
          setWriteVal('');
          setIsWriting(false);
          setEditingIndex(null);
          setOffset({ x: 100, y: 0 }); // Reset position to slight right
      }
  }, [isOpen]);

  // --- DRAG HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
      // Only allow dragging from header (left click)
      if (e.button !== 0) return;
      e.preventDefault();
      
      dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          initialOffX: offset.x,
          initialOffY: offset.y
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      
      // Round to integers to prevent sub-pixel rendering blur
      setOffset({
          x: Math.round(dragRef.current.initialOffX + dx),
          y: Math.round(dragRef.current.initialOffY + dy)
      });
  };

  const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
  };

  // Cleanup listeners on unmount
  useEffect(() => {
      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, []);

  // --- HELPERS ---

  const isComplex = (val: any) => val !== null && val !== undefined && typeof val === 'object';
  
  const getArrayDimensions = (val: any): number[] => {
      if (!Array.isArray(val)) return [];
      const dims = [val.length];
      if (val.length > 0 && Array.isArray(val[0])) {
          dims.push(val[0].length);
          if (val[0].length > 0 && Array.isArray(val[0][0])) {
              dims.push(val[0][0].length);
          }
      }
      return dims;
  };

  const formatDimensions = (dims: number[]) => {
      if (dims.length === 0) return '';
      return `[${dims.join(',')}]`;
  };

  // Basic parser to handle input string -> type (simplified, parent does heavy lifting or we assume basic types)
  const parseWriteValue = (str: string, type: string = 'Int32') => {
      const s = str.trim();
      
      // FIX HERE: Extract base type to handle arrays like "Boolean[5]" or "Int32[10]"
      const baseType = type.includes('[') ? type.split('[')[0] : type;

      // FIX: Added check for Object {} syntax to support structs
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
          try { return JSON.parse(s); } catch(e) {}
      }
      
      if (baseType === 'Boolean') return s.toLowerCase() === 'true' || s === '1';
      
      // Handle 64-bit integers (return string to avoid precision loss and BigInt serialization errors)
      if (baseType.includes('Int64') || baseType.includes('UInt64') || baseType.includes('LINT') || baseType.includes('ULINT') || baseType.includes('LWORD') || baseType.includes('LTIME')) {
          if (s.toLowerCase().startsWith('0x')) {
              try {
                  return BigInt(s).toString();
              } catch(e) { return s; }
          }
          return s;
      }

      // Handle Hex Input for other types
      if (s.toLowerCase().startsWith('0x')) {
          return parseInt(s, 16);
      }
      
      if (baseType.includes('Int') || baseType.includes('TIME') || baseType.includes('DATE') || baseType.includes('TOD') || baseType.includes('DT')) return parseInt(s, 10);
      if (baseType.includes('Float') || baseType.includes('Double') || baseType.includes('REAL')) return parseFloat(s);
      return s;
  };

  // --- INLINE EDIT LOGIC ---
  const handleItemDoubleClick = (key: string, currentVal: any, e: React.MouseEvent) => {
      e.stopPropagation(); // CRITICAL: Stop bubbling to row
      if (!onWrite) return;
      
      setEditingIndex(key);
      
      // Boolean UX: Pre-populate nicely or toggle
      if (typeof currentVal === 'boolean') {
           setInlineWriteVal(String(!currentVal)); 
      } else {
           // If showing HEX, edit in HEX? Or standard decimal?
           // Usually safer to edit in default string representation, user can type 0x if they want.
           // Or prepopulate what is seen.
           if (typeof currentVal === 'number' && displayRadix === 'HEX') {
               setInlineWriteVal('0x' + currentVal.toString(16).toUpperCase());
           } else if (typeof currentVal === 'string' && dataType && (dataType.includes('Int64') || dataType.includes('UInt64') || dataType.includes('LINT') || dataType.includes('ULINT') || dataType.includes('LWORD') || dataType.includes('LTIME')) && displayRadix === 'HEX') {
               try {
                   let bigVal = BigInt(currentVal);
                   let hexStr = bigVal < 0n ? (BigInt.asUintN(64, bigVal)).toString(16).toUpperCase() : bigVal.toString(16).toUpperCase();
                   setInlineWriteVal('0x' + hexStr);
               } catch(e) {
                   setInlineWriteVal(String(currentVal));
               }
           } else if (typeof currentVal === 'object') {
               setInlineWriteVal(safeStringify(currentVal));
           } else {
               setInlineWriteVal(String(currentVal));
           }
      }
  };

  const handleInlineCommit = async () => {
      if (!editingIndex || !onWrite) return;
      
      const parsed = parseWriteValue(inlineWriteVal, dataType);
      
      // We need to clone the full array and update the specific index
      // because `handleArrayWrite` in parent expects full array in value
      let newValue;
      try {
          newValue = JSON.parse(safeStringify(value));
      } catch (e) {
          newValue = [...value];
      }

      const dims = getArrayDimensions(newValue);
      
      if (dims.length === 1) {
          const idx = Number(editingIndex);
          if (idx >= 0 && idx < newValue.length) newValue[idx] = parsed;
      } else if (dims.length === 2) {
          const [r, c] = editingIndex.split(',').map(Number);
          if (newValue[r] !== undefined) newValue[r][c] = parsed;
      } else if (dims.length === 3) {
          const [r, c] = editingIndex.split(',').map(Number);
          if (newValue[activeSlice] && newValue[activeSlice][r]) newValue[activeSlice][r][c] = parsed;
      }

      try {
          await onWrite([{ indexRange: undefined as any, value: newValue }]);
      } catch (e) {
          console.error("Inline Write Failed", e);
      } finally {
          setEditingIndex(null);
      }
  };

  const handleBatchWrite = async () => {
      if (!onWrite || selectedIndices.size === 0) return;
      setIsWriting(true);
      
      const parsedValue = parseWriteValue(writeVal, dataType);
      
      // OPTIMIZED: Full Array Write (Unified)
      if (Array.isArray(value)) {
          let newValue;
          try {
              newValue = JSON.parse(safeStringify(value));
          } catch (e) {
              newValue = [...value];
          }

          const dims = getArrayDimensions(newValue);

          if (dims.length === 1) {
              selectedIndices.forEach(idxStr => {
                  const idx = Number(idxStr);
                  if (idx >= 0 && idx < newValue.length) {
                      newValue[idx] = parsedValue;
                  }
              });
          } else if (dims.length === 2) {
              selectedIndices.forEach(idxStr => {
                  const [r, c] = idxStr.split(',').map(Number);
                  if (newValue[r] && newValue[r][c] !== undefined) {
                      newValue[r][c] = parsedValue;
                  }
              });
          } else if (dims.length === 3) {
              // 3D: Apply to activeSlice
              selectedIndices.forEach(idxStr => {
                  const [r, c] = idxStr.split(',').map(Number);
                  if (newValue[activeSlice] && newValue[activeSlice][r] && newValue[activeSlice][r][c] !== undefined) {
                      newValue[activeSlice][r][c] = parsedValue;
                  }
              });
          }

          const writes = [{
              indexRange: undefined as any,
              value: newValue
          }];

          try {
              await onWrite(writes);
          } catch (e) {
              console.error("Write failed", e);
          } finally {
              setIsWriting(false);
          }
      } else {
          // Scalar fallback
          const writes = Array.from(selectedIndices).map(idx => ({
              indexRange: idx,
              value: parsedValue
          }));
          try {
              await onWrite(writes);
          } catch (e) {
              console.error("Write failed", e);
          } finally {
              setIsWriting(false);
          }
      }
  };

  const handleCopyData = () => {
      if (!Array.isArray(value)) return;
      const dims = getArrayDimensions(value);
      let text = '';

      if (dims.length === 1) {
          text = value.join('\n'); // 1D Column
      } else if (dims.length === 2) {
          text = value.map(row => (Array.isArray(row) ? row.join('\t') : String(row))).join('\n'); // Excel friendly
      } else {
          text = safeStringify(value, 2);
      }
      
      navigator.clipboard.writeText(text);
  };

  const handlePasteInput = async () => {
      try {
          const text = await navigator.clipboard.readText();
          if (!text) return;
          
          const lines = text.trim().split(/\r?\n/);
          
          if (lines.length > 1 || lines[0].includes('\t')) {
              // It looks like table data
              const matrix = lines.map(line => {
                  const cells = line.split('\t').map(cell => {
                      const c = cell.trim();
                      if (c.toLowerCase() === 'true') return true;
                      if (c.toLowerCase() === 'false') return false;
                      const num = parseFloat(c);
                      return isNaN(num) ? c : num;
                  });
                  return cells.length === 1 ? cells[0] : cells;
              });
              
              let finalData = matrix;
              if (matrix.length > 0) {
                 const first = matrix[0];
                 if (Array.isArray(first) && first.length === 1) {
                    finalData = matrix.map(r => Array.isArray(r) ? r[0] : r);
                 }
              }
              
              setWriteVal(safeStringify(finalData));
          } else {
              setWriteVal(text.trim());
          }
      } catch (e) {
          console.error("Paste failed", e);
      }
  };

  // --- RENDERERS ---

  const renderSimpleValue = (val: any) => {
      if (val === null || val === undefined) return <span className="text-slate-300 italic">null</span>;
      
      const isBool = dataType === 'Boolean' || typeof val === 'boolean';
      if (isBool) {
          const bVal = val === true || val === 1 || String(val).toLowerCase() === 'true';
          return <span className={bVal ? 'text-emerald-600 font-bold' : 'text-slate-400'}>{bVal ? 'TRUE' : 'FALSE'}</span>;
      }

      if (typeof val === 'number') {
          if (displayRadix === 'HEX') {
              let hexStr = val.toString(16).toUpperCase();
              if (val < 0) {
                  hexStr = (val >>> 0).toString(16).toUpperCase(); 
              }
              if (hexStr.length === 1) hexStr = '0' + hexStr;
              return <span className="text-blue-700 font-mono font-bold">0x{hexStr}</span>;
          }
          return <span className="text-blue-600 font-mono">{val}</span>;
      }
      
      if (typeof val === 'string') {
          if (dataType && (dataType.includes('Int64') || dataType.includes('UInt64') || dataType.includes('LINT') || dataType.includes('ULINT') || dataType.includes('LWORD') || dataType.includes('LTIME'))) {
              if (displayRadix === 'HEX') {
                  try {
                      let bigVal = BigInt(val);
                      let hexStr = bigVal < 0n ? (BigInt.asUintN(64, bigVal)).toString(16).toUpperCase() : bigVal.toString(16).toUpperCase();
                      if (hexStr.length === 1) hexStr = '0' + hexStr;
                      return <span className="text-blue-700 font-mono font-bold">0x{hexStr}</span>;
                  } catch(e) {
                      return <span className="text-blue-600 font-mono">{val}</span>;
                  }
              }
              return <span className="text-blue-600 font-mono">{val}</span>;
          }
          return <span className="text-amber-700">"{val}"</span>;
      }
      if (typeof val === 'object' && !Array.isArray(val)) {
          try {
              return <span className="text-slate-500 truncate">{safeStringify(val)}</span>;
          } catch (e) {
              return <span className="text-red-400 font-mono text-[10px]">[Render Error]</span>;
          }
      }
      return <span>{String(val)}</span>;
  };

  const previewContent = useMemo(() => {
      if (!isComplex(value)) return renderSimpleValue(value);

      if (Array.isArray(value)) {
          const dims = getArrayDimensions(value);
          
          let Icon = List;
          if (dims.length === 2) Icon = Grid;
          if (dims.length === 3) Icon = Layers;

          let displayLabel = dataType || 'Data';
          if (dataType && dataType.includes('[')) {
             displayLabel = dataType;
          } else {
             let baseType = dataType || 'Data';
             if (baseType.includes('[')) baseType = baseType.split('[')[0];
             const dimStr = formatDimensions(dims);
             displayLabel = `${baseType}${dimStr}`;
          }

          let previewText = '';
          if (dims.length === 1) {
              const previewItems = value.slice(0, 3).map(v => typeof v === 'object' ? '{..}' : String(v));
              previewText = `[${previewItems.join(', ')}${value.length > 3 ? '...' : ''}]`;
          }

          return (
            <div className="flex items-center gap-2 overflow-hidden w-full">
                <button 
                    onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
                    onDoubleClick={(e) => e.stopPropagation()} // Stop bubble
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold transition-colors shadow-sm flex-shrink-0"
                >
                    <Icon className="w-3 h-3 flex-shrink-0" />
                    <span className="whitespace-nowrap">{displayLabel}</span>
                </button>
                {previewText && (
                    <span className="text-[10px] text-slate-400 truncate opacity-70 flex-shrink-1 font-mono" title={safeStringify(value)}>
                        {previewText}
                    </span>
                )}
            </div>
          );
      }

      return (
        <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold transition-colors shadow-sm"
        >
            <Braces className="w-3 h-3" />
            <span>Object</span>
        </button>
      );
  }, [value, dataType]);

  const handleSelectAll = () => {
      if (!Array.isArray(value)) return;
      const dims = getArrayDimensions(value);
      
      if (selectedIndices.size > 0) {
          setSelectedIndices(new Set());
          return;
      }

      const newSet = new Set<string>();

      if (dims.length === 1) {
          for (let i = 0; i < value.length; i++) newSet.add(String(i));
      } else if (dims.length === 2) {
          for (let r = 0; r < dims[0]; r++) {
              for (let c = 0; c < dims[1]; c++) newSet.add(`${r},${c}`);
          }
      } else if (dims.length === 3) {
          const rows = dims[1];
          const cols = dims[2];
          for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) newSet.add(`${r},${c}`);
          }
      }
      setSelectedIndices(newSet);
  };

  const toggleSelection = (key: string, e: React.MouseEvent) => {
      const newSet = new Set(selectedIndices);
      
      if (e.shiftKey && lastClickedIndex) {
          const isMatrix = key.includes(',');
          
          if (isMatrix) {
              const [r1, c1] = lastClickedIndex.split(',').map(Number);
              const [r2, c2] = key.split(',').map(Number);
              
              if (!isNaN(r1) && !isNaN(c1) && !isNaN(r2) && !isNaN(c2)) {
                  const minR = Math.min(r1, r2);
                  const maxR = Math.max(r1, r2);
                  const minC = Math.min(c1, c2);
                  const maxC = Math.max(c1, c2);
                  
                  for (let r = minR; r <= maxR; r++) {
                      for (let c = minC; c <= maxC; c++) {
                          newSet.add(`${r},${c}`);
                      }
                  }
              }
          } else {
              const start = parseInt(lastClickedIndex);
              const end = parseInt(key);
              if (!isNaN(start) && !isNaN(end)) {
                  const low = Math.min(start, end);
                  const high = Math.max(start, end);
                  for (let i = low; i <= high; i++) {
                      newSet.add(String(i));
                  }
              }
          }
      } else if (e.ctrlKey) {
          if (newSet.has(key)) newSet.delete(key);
          else newSet.add(key);
          setLastClickedIndex(key);
      } else {
          if (!newSet.has(key) || newSet.size > 1) {
              newSet.clear();
              newSet.add(key);
          } else {
              newSet.delete(key);
          }
          setLastClickedIndex(key);
      }
      setSelectedIndices(newSet);
  };

  // --- VIRTUAL LIST RENDERER (1D) ---

  const renderVirtualList = (data: any[]) => {
      const totalCount = data.length;
      const totalHeight = totalCount * ROW_HEIGHT;
      const viewportHeight = scrollContainerRef.current?.clientHeight || 500;
      
      const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
      const endIndex = Math.min(totalCount, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER);
      
      const visibleItems = [];
      for (let i = startIndex; i < endIndex; i++) {
          visibleItems.push({ index: i, value: data[i] });
      }

      return (
          <div 
              ref={scrollContainerRef}
              className="overflow-auto border border-slate-200 rounded-b-lg flex-1 min-h-0 relative bg-white"
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
              <div style={{ height: totalHeight, width: '100%' }}>
                  {visibleItems.map(({ index, value }) => {
                      const isSelected = selectedIndices.has(String(index));
                      const isEditing = String(index) === editingIndex;
                      
                      return (
                      <div 
                          key={index}
                          onClick={(e) => onWrite && toggleSelection(String(index), e)}
                          onDoubleClick={(e) => handleItemDoubleClick(String(index), value, e)}
                          className={`absolute w-full flex border-b border-slate-100 transition-colors cursor-pointer ${isSelected ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-slate-50'}`}
                          style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                      >
                          <div className="w-20 px-4 flex items-center font-mono text-slate-400 bg-slate-50/50 border-r border-slate-100 text-[10px] flex-shrink-0">
                              {onWrite && (
                                  <div className={`mr-2 ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>
                                      {isSelected ? <CheckSquare className="w-3.5 h-3.5"/> : <Square className="w-3.5 h-3.5"/>}
                                  </div>
                              )}
                              [{index}]
                          </div>
                          <div className="flex-1 px-4 flex items-center font-mono text-xs break-all overflow-hidden text-ellipsis">
                              {isEditing ? (
                                  <div className="flex items-center gap-1 w-full animate-in zoom-in-95 duration-75">
                                      <input 
                                          autoFocus
                                          className="flex-1 border border-blue-500 rounded px-1 py-0.5 outline-none bg-white text-xs font-mono"
                                          value={inlineWriteVal}
                                          onChange={e => setInlineWriteVal(e.target.value)}
                                          onKeyDown={e => {
                                              if (e.key === 'Enter') handleInlineCommit();
                                              if (e.key === 'Escape') setEditingIndex(null);
                                          }}
                                          onBlur={() => setEditingIndex(null)}
                                          onClick={e => e.stopPropagation()}
                                      />
                                      <button 
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={handleInlineCommit} 
                                          className="p-0.5 bg-blue-500 text-white rounded"
                                      >
                                          <Check className="w-3 h-3"/>
                                      </button>
                                  </div>
                              ) : (
                                  renderSimpleValue(value)
                              )}
                          </div>
                      </div>
                  )})}
              </div>
          </div>
      );
  };

  // --- VIRTUAL MATRIX RENDERER (2D) ---

  const renderVirtualMatrix = (rows: any[][]) => {
      const totalCount = rows.length;
      const totalHeight = totalCount * ROW_HEIGHT;
      const viewportHeight = scrollContainerRef.current?.clientHeight || 500;
      
      const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
      const endIndex = Math.min(totalCount, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER);
      
      const visibleRows = [];
      for (let i = startIndex; i < endIndex; i++) {
          visibleRows.push({ index: i, row: rows[i] });
      }

      const colCount = rows[0]?.length || 0;

      return (
          <div 
              ref={scrollContainerRef}
              className="overflow-auto border border-slate-200 rounded-b-lg flex-1 min-h-0 relative bg-white"
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
              <div style={{ height: totalHeight }}>
                  <table className="w-full text-xs text-center border-collapse table-fixed" style={{ minWidth: colCount * 80 + 50 }}>
                      <thead className="bg-slate-100 font-bold text-slate-500 sticky top-0 z-20 shadow-sm h-[30px]">
                          <tr>
                              <th className="border w-12 bg-slate-200 sticky left-0 z-30">#</th>
                              {Array.from({length: colCount}).map((_, colIdx) => (
                                  <th key={colIdx} className="border w-20 px-1 truncate font-mono">[{colIdx}]</th>
                              ))}
                          </tr>
                      </thead>
                      <tbody>
                          {visibleRows.map(({ index, row }) => (
                              <tr 
                                  key={index} 
                                  className="absolute w-full flex"
                                  style={{ top: (index * ROW_HEIGHT) + 30, height: ROW_HEIGHT }} 
                              >
                                  <td className="border bg-slate-50 font-mono text-slate-500 font-bold text-[10px] w-12 sticky left-0 z-10 flex items-center justify-center h-full">
                                      [{index}]
                                  </td>
                                  {row.map((cell, colIdx) => {
                                      const key = `${index},${colIdx}`;
                                      const isSelected = selectedIndices.has(key);
                                      const isEditing = key === editingIndex;

                                      return (
                                          <td 
                                              key={colIdx} 
                                              onClick={(e) => onWrite && toggleSelection(key, e)}
                                              onDoubleClick={(e) => handleItemDoubleClick(key, cell, e)}
                                              className={`border font-mono w-20 flex items-center justify-center h-full px-1 truncate cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border-blue-200' : 'hover:bg-blue-50'}`}
                                          >
                                              {isEditing ? (
                                                  <input 
                                                      autoFocus
                                                      className="w-full h-full border-none outline-none bg-white text-center text-xs font-mono px-0 focus:ring-1 focus:ring-blue-500"
                                                      value={inlineWriteVal}
                                                      onChange={e => setInlineWriteVal(e.target.value)}
                                                      onKeyDown={e => {
                                                          if (e.key === 'Enter') handleInlineCommit();
                                                          if (e.key === 'Escape') setEditingIndex(null);
                                                      }}
                                                      onBlur={handleInlineCommit}
                                                      onClick={e => e.stopPropagation()}
                                                  />
                                              ) : (
                                                  renderSimpleValue(cell)
                                              )}
                                          </td>
                                      )
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  };

  const renderArrayContent = () => {
      if (!Array.isArray(value)) return null;
      const dims = getArrayDimensions(value);

      // 1D ARRAY
      if (dims.length === 1) {
          return (
              <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex items-center px-4 py-2 bg-slate-100 font-bold text-slate-500 uppercase border border-b-0 border-slate-200 rounded-t-lg shadow-sm text-xs">
                      <div className="w-20">Index</div>
                      <div className="flex-1">Value</div>
                  </div>
                  {renderVirtualList(value)}
                  <div className="text-[10px] text-slate-400 p-1 text-right bg-white border border-t-0 border-slate-200 rounded-b-lg">
                      Total Items: {value.length}
                  </div>
              </div>
          );
      }

      // 2D MATRIX
      if (dims.length === 2) {
          return (
              <div className="flex flex-col h-full overflow-hidden">
                  {renderVirtualMatrix(value)}
                  <div className="text-[10px] text-slate-400 p-1 text-right bg-white border border-t-0 border-slate-200 rounded-b-lg">
                      Matrix Size: [{dims[0]}][{dims[1]}]
                  </div>
              </div>
          );
      }

      // 3D CUBE
      if (dims.length === 3) {
          const currentSlice = value[activeSlice];
          if (!currentSlice) return <div>Invalid Slice</div>;

          return (
              <div className="flex flex-col h-full gap-4 overflow-hidden">
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 flex-shrink-0">
                      <span className="text-xs font-bold text-slate-500 uppercase flex-shrink-0 mr-2">Layer (Z):</span>
                      {value.map((_: any, i: number) => (
                          <button
                              key={i}
                              onClick={() => { setActiveSlice(i); setScrollTop(0); }}
                              className={`px-3 py-1 rounded text-xs font-bold transition-all border flex-shrink-0 font-mono ${activeSlice === i ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                          >
                              [{i}]
                          </button>
                      ))}
                  </div>
                  
                  <div className="flex-1 relative min-h-0 flex flex-col">
                        <div className="absolute top-2 right-4 px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded z-20 shadow-sm pointer-events-none opacity-80 font-mono">
                            Layer [{activeSlice}] ({dims[1]}x{dims[2]})
                        </div>
                        {renderVirtualMatrix(currentSlice)}
                  </div>
              </div>
          );
      }
      
      return <div>Unsupported Array Dimension</div>;
  };

  return (
    <>
        {previewContent}

        {isOpen && createPortal(
            <div 
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" 
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                onDoubleClick={(e) => e.stopPropagation()} // STOP PROPAGATION
                onDragStart={(e) => e.stopPropagation()} // Prevent drag bubbling
            >
                <div 
                    className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200" 
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                        transform: `translate(${offset.x}px, ${offset.y}px)`,
                        transition: 'none' // Disable transition during drag for smoothness
                    }}
                >
                    {/* Header - DRAGGABLE */}
                    <div 
                        className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 flex-shrink-0 cursor-move select-none active:bg-slate-100"
                        onMouseDown={handleMouseDown}
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                                {Array.isArray(value) ? (getArrayDimensions(value).length === 2 ? <Grid className="w-5 h-5 text-blue-600"/> : getArrayDimensions(value).length === 3 ? <Layers className="w-5 h-5 text-indigo-600"/> : <List className="w-5 h-5 text-emerald-600"/>) : <Braces className="w-5 h-5 text-slate-600"/>}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                    {t.valueDisplay.title} 
                                    {nodeId && <span className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">{nodeId}</span>}
                                </h3>
                                {Array.isArray(value) && (
                                    <div className="text-xs font-mono text-slate-500 mt-0.5">
                                        Type: <span className="text-blue-600 font-bold">{dataType || 'Unknown'}</span> • 
                                        Format: <span className="font-bold">{
                                            dataType && dataType.includes('[') 
                                            ? dataType.substring(dataType.indexOf('[')) 
                                            : formatDimensions(getArrayDimensions(value))
                                        }</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2 items-center" onMouseDown={e => e.stopPropagation()}>
                            {/* HEX/DEC Toggle */}
                            <div className="flex bg-slate-200 rounded p-0.5 border border-slate-300">
                                <button 
                                    onClick={() => setDisplayRadix('DEC')}
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${displayRadix === 'DEC' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    DEC
                                </button>
                                <button 
                                    onClick={() => setDisplayRadix('HEX')}
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${displayRadix === 'HEX' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    HEX
                                </button>
                            </div>
                            
                            <div className="w-px h-4 bg-slate-300 mx-1"></div>

                            <button onClick={handleCopyData} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-bold flex items-center gap-1 transition-colors">
                                <Clipboard className="w-3.5 h-3.5" />
                                {t.valueDisplay.copyExcel}
                            </button>
                            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X className="w-6 h-6" /></button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden p-4 bg-slate-50 flex flex-col min-h-0">
                         {Array.isArray(value) ? (
                             <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 overflow-hidden flex flex-col min-h-0 relative">
                                 {renderArrayContent()}
                             </div>
                         ) : (
                             <div className="h-full bg-white rounded-xl border border-slate-200 shadow-sm p-4 overflow-auto">
                                <pre className="font-mono text-xs text-slate-700 whitespace-pre-wrap select-text">{safeStringify(value, 2)}</pre>
                             </div>
                         )}
                    </div>

                    {/* Footer - Write Controls */}
                    <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center flex-shrink-0">
                        <div className="flex-1 flex items-center gap-4">
                            {onWrite && Array.isArray(value) && (
                                <>
                                    <button 
                                        onClick={handleSelectAll} 
                                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold text-slate-600 transition-colors"
                                    >
                                        {selectedIndices.size > 0 ? <MinusSquare className="w-3.5 h-3.5 text-blue-600"/> : <CheckSquare className="w-3.5 h-3.5 text-slate-400"/>}
                                        {selectedIndices.size > 0 ? `${selectedIndices.size} Selected` : "Select All"}
                                    </button>

                                    {selectedIndices.size > 0 && (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                            <div className="relative">
                                                <input 
                                                    className="border border-slate-300 rounded pl-2 pr-8 py-1.5 text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                                                    placeholder="Value (or Paste JSON)"
                                                    value={writeVal}
                                                    onChange={e => setWriteVal(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleBatchWrite()}
                                                />
                                                <button onClick={handlePasteInput} className="absolute right-1 top-1 bottom-1 text-slate-400 hover:text-blue-500 p-1 rounded" title={t.valueDisplay.pasteExcel}>
                                                    <ClipboardPaste className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <button 
                                                onClick={handleBatchWrite} 
                                                disabled={isWriting}
                                                className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 flex items-center gap-2 shadow-sm disabled:opacity-50"
                                            >
                                                {isWriting ? <span className="animate-spin">...</span> : <Edit3 className="w-3.5 h-3.5" />}
                                                Write Selected
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <button onClick={() => setIsOpen(false)} className="px-5 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-sm font-bold shadow-md transition-all">{t.valueDisplay.close}</button>
                    </div>
                </div>
            </div>,
            document.body
        )}
    </>
  );
};

export default ValueDisplay;
