import React, { useState, useRef, useEffect } from 'react';
import { EipClass1SessionInfo, EipClass1Slave, EipClass1Connection, EipClass1DatasetItem } from '../../type-definitions/eip-class1';
import { Plus, Trash2, Download, Settings, Activity, Network, FileText, X, Copy, RefreshCw, RefreshCcw, AlertTriangle, CheckCircle2, Search, BarChart3, WifiOff } from 'lucide-react';
import { EipClass1ScanModal } from './EipClass1ScanModal';
import { parseEDS } from '../services/edsService';
import { edsLibraryService, EdsEntry } from '../services/edsLibraryService';
import { toast } from 'sonner';

import { IOMappingTab } from './IOMappingTab';
import { SlaveInfoTab } from './SlaveInfoTab';
import { SlaveStatusTab } from './SlaveStatusTab';
import { EipClass1Dashboard } from './EipClass1Dashboard';

const DATA_TYPES: Record<string, number> = {
    'BYTE': 8,
    'LREAL': 64,
    'REAL': 32,
    'LWORD': 64,
    'DWORD': 32,
    'WORD': 16,
    'ULINT': 64,
    'LINT': 64,
    'UDINT': 32,
    'DINT': 32,
    'USINT': 8,
    'SINT': 8,
    'UINT': 16,
    'INT': 16,
    'BOOL': 1
};

interface Props {
    session: EipClass1SessionInfo;
    onUpdate: (updates: Partial<EipClass1SessionInfo> | ((prev: EipClass1SessionInfo) => Partial<EipClass1SessionInfo>)) => void;
    isConnected: boolean;
    stats?: Record<string, any>;
}

const adjustDataset = (dataset: any[], targetSize: number, defaultName: string): any[] => {
    if (targetSize === 0) return [];
    const targetBits = targetSize * 8;
    const currentBits = (dataset || []).reduce((sum, item) => sum + item.bitLength, 0);
    
    if (currentBits === targetBits) return dataset;
    
    if (!dataset || dataset.length === 0) {
        return [{ id: Math.random().toString(36).substr(2, 9), name: defaultName, dataType: 'BYTE', bitLength: targetBits, helpString: '' }];
    }
    
    const newDataset = dataset.map(item => ({ ...item }));
    let diff = targetBits - currentBits;
    
    if (diff > 0) {
        newDataset[newDataset.length - 1].bitLength += diff;
    } else {
        let bitsToRemove = -diff;
        while (bitsToRemove > 0 && newDataset.length > 0) {
            const lastItem = newDataset[newDataset.length - 1];
            if (lastItem.bitLength > bitsToRemove) {
                lastItem.bitLength -= bitsToRemove;
                bitsToRemove = 0;
            } else {
                bitsToRemove -= lastItem.bitLength;
                newDataset.pop();
            }
        }
        if (newDataset.length === 0) {
            return [{ id: Math.random().toString(36).substr(2, 9), name: defaultName, dataType: 'BYTE', bitLength: targetBits, helpString: '' }];
        }
    }
    return newDataset;
};

const resizeDataArray = (oldArray: number[] | undefined, targetSize: number): number[] => {
    const size = Math.max(0, targetSize);
    const arr = new Array(size).fill(0);
    if (oldArray && Array.isArray(oldArray)) {
        for (let i = 0; i < Math.min(oldArray.length, size); i++) {
            arr[i] = oldArray[i];
        }
    }
    return arr;
};

export const EipClass1ScannerView: React.FC<Props> = ({ session, onUpdate, isConnected, stats }) => {
    const [selectedSlaveId, setSelectedSlaveId] = useState<string | null>(null);
    const [activeSlaveTab, setActiveSlaveTab] = useState<'general' | 'connections' | 'params' | 'mapping' | 'status' | 'info'>('general');
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [showAddSlaveModal, setShowAddSlaveModal] = useState(false);
    const [library, setLibrary] = useState<EdsEntry[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Resizable slaves list column
    const [slavesListWidth, setSlavesListWidth] = useState(360);
    const isDraggingSlavesRef = useRef(false);

    // Connection Management State
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [selectedDatasetItemId, setSelectedDatasetItemId] = useState<string | null>(null);
    const [activeBottomTab, setActiveBottomTab] = useState<'dataset' | 'config'>('dataset');
    const [showAddConnectionModal, setShowAddConnectionModal] = useState(false);
    const [showEditConnectionModal, setShowEditConnectionModal] = useState(false);
    const [addConnectionType, setAddConnectionType] = useState<'generic' | 'predefined'>('generic');
    const [selectedPredefinedConnectionIndex, setSelectedPredefinedConnectionIndex] = useState<number>(0);
    const [editingConnection, setEditingConnection] = useState<any>(null);

    // Generic Connection State
    const [genericCfg, setGenericCfg] = useState({ enabled: true, classId: '4', instanceId: '0', attributeId: '3' });
    const [genericO2T, setGenericO2T] = useState({ enabled: true, classId: '4', instanceId: '0', attributeId: '3' });
    const [genericT2O, setGenericT2O] = useState({ enabled: true, classId: '4', instanceId: '0', attributeId: '3' });
    const [genericPathStr, setGenericPathStr] = useState('20 04 24 00 2C 00 2C 00');
    const [isGenericPathManual, setIsGenericPathManual] = useState(false);

    useEffect(() => {
        if (isGenericPathManual) return;
        
        const formatSegment = (segmentType: number, hexStr: string) => {
            let num = parseInt(hexStr, 16);
            if (isNaN(num)) return [];
            if (num <= 0xFF) {
                return [segmentType.toString(16).toUpperCase().padStart(2, '0'), num.toString(16).toUpperCase().padStart(2, '0')];
            } else {
                return [(segmentType + 1).toString(16).toUpperCase().padStart(2, '0'), (num & 0xFF).toString(16).toUpperCase().padStart(2, '0'), ((num >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0')];
            }
        };

        let arr: string[] = [];
        if (genericCfg.enabled) {
            arr.push(...formatSegment(0x20, genericCfg.classId));
            arr.push(...formatSegment(0x24, genericCfg.instanceId));
        }
        if (genericO2T.enabled) {
            arr.push(...formatSegment(0x2C, genericO2T.instanceId));
        }
        if (genericT2O.enabled) {
            arr.push(...formatSegment(0x2C, genericT2O.instanceId));
        }
        setGenericPathStr(arr.join(' '));
    }, [genericCfg, genericO2T, genericT2O, isGenericPathManual]);

    const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
    const [lastClickedId, setLastClickedId] = useState<string | null>(null);
    const [addQuantity, setAddQuantity] = useState<number>(1);
    const [editingCell, setEditingCell] = useState<{ id: string, field: string } | null>(null);
    const [editingDatasetCell, setEditingDatasetCell] = useState<{ id: string, type: 'o2t' | 't2o' } | null>(null);
    const [confirmClearErrorId, setConfirmClearErrorId] = useState<string | null>(null);
    const [showScanModal, setShowScanModal] = useState(false);

    const selectedSlave = session.scannerConfig.slaves.find(s => s.id === selectedSlaveId);

    // Initialize multiSelectedIds if empty and slaves exist
    useEffect(() => {
        if (multiSelectedIds.length === 0 && session.scannerConfig.slaves.length > 0) {
            setMultiSelectedIds([session.scannerConfig.slaves[0].id]);
        }
    }, [session.scannerConfig.slaves.length]);

    useEffect(() => {
        if (selectedSlave && selectedSlave.connections && selectedSlave.connections.length > 0) {
            if (!selectedSlave.connections.find(c => c.id === selectedConnectionId)) {
                setSelectedConnectionId(selectedSlave.connections[0].id);
            }
        } else {
            setSelectedConnectionId(null);
        }
    }, [selectedSlaveId, selectedSlave?.connections]);

    useEffect(() => {
        if (showLibraryModal) {
            setLibrary(edsLibraryService.getLibrary());
        }
    }, [showLibraryModal]);

    // Resizable slave list
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingSlavesRef.current) return;
            // Calculate width based on the fact that sidebar is on the left
            // and this columns starts after sidebar. We can just use the
            // movement or calculate relative to container... Wait, we don't have the current container x position.
            // Better to use movement.
            setSlavesListWidth(prev => {
                let newWidth = prev + e.movementX;
                if (newWidth < 200) newWidth = 200;
                if (newWidth > 600) newWidth = 600;
                return newWidth;
            });
        };

        const handleMouseUp = () => {
            isDraggingSlavesRef.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Fix existing slaves' datasets if they don't match the connection sizes
    useEffect(() => {
        let needsUpdate = false;
        const newSlaves = session.scannerConfig.slaves.map(slave => {
            let slaveUpdated = false;
            const newConns = slave.connections?.map(conn => {
                let connUpdated = false;
                const o2tBits = (conn.o2tDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const t2oBits = (conn.t2oDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                
                let newO2tDataset = conn.o2tDataset;
                let newT2oDataset = conn.t2oDataset;
                
                if (o2tBits !== (conn.o2tSize || 0) * 8) {
                    newO2tDataset = adjustDataset(conn.o2tDataset || [], conn.o2tSize || 0, 'Outputs_Param0');
                    connUpdated = true;
                }
                if (t2oBits !== (conn.t2oSize || 0) * 8) {
                    newT2oDataset = adjustDataset(conn.t2oDataset || [], conn.t2oSize || 0, 'Inputs_Param0');
                    connUpdated = true;
                }
                
                if (connUpdated) {
                    slaveUpdated = true;
                    return { ...conn, o2tDataset: newO2tDataset, t2oDataset: newT2oDataset };
                }
                return conn;
            }) || [];
            
            if (slaveUpdated) {
                needsUpdate = true;
                return { ...slave, connections: newConns };
            }
            return slave;
        });
        
        if (needsUpdate) {
            onUpdate({
                scannerConfig: {
                    ...session.scannerConfig,
                    slaves: newSlaves
                }
            });
        }
    }, [session.scannerConfig.slaves, onUpdate]);

    const handleSlaveClick = (e: React.MouseEvent, id: string) => {
        if (e.shiftKey && lastClickedId) {
            const slaves = session.scannerConfig.slaves;
            const startIdx = slaves.findIndex(s => s.id === lastClickedId);
            const endIdx = slaves.findIndex(s => s.id === id);
            if (startIdx !== -1 && endIdx !== -1) {
                const minIdx = Math.min(startIdx, endIdx);
                const maxIdx = Math.max(startIdx, endIdx);
                const rangeIds = slaves.slice(minIdx, maxIdx + 1).map(s => s.id);
                setMultiSelectedIds(Array.from(new Set([...multiSelectedIds, ...rangeIds])));
            }
        } else if (e.ctrlKey || e.metaKey) {
            if (multiSelectedIds.includes(id)) {
                setMultiSelectedIds(multiSelectedIds.filter(i => i !== id));
            } else {
                setMultiSelectedIds([...multiSelectedIds, id]);
            }
        } else {
            setMultiSelectedIds([id]);
        }
        setLastClickedId(id);
        setSelectedSlaveId(id);
    };

    const handleBatchDelete = () => {
        const newSlaves = session.scannerConfig.slaves.filter(s => !multiSelectedIds.includes(s.id));
        onUpdate({
            scannerConfig: { ...session.scannerConfig, slaves: newSlaves }
        });
        setMultiSelectedIds([]);
        if (selectedSlaveId && multiSelectedIds.includes(selectedSlaveId)) {
            setSelectedSlaveId(newSlaves.length > 0 ? newSlaves[0].id : null);
        }
    };

    const handleConnectionInlineEdit = (connId: string, field: string, value: string) => {
        setEditingCell(null);
        if (!selectedSlave) return;
        const numValue = parseInt(value, 10);
        if (isNaN(numValue) || numValue < 0) return;

        const newConns = selectedSlave.connections?.map(c => {
            if (c.id === connId) {
                const updatedConn = { ...c, [field]: numValue };
                
                if (field === 'o2tSize') {
                    const oSize = numValue;
                    updatedConn.o2tData = resizeDataArray(updatedConn.o2tData, oSize);
                    updatedConn.o2tDataset = adjustDataset(updatedConn.o2tDataset, oSize, 'Outputs_Param0');
                } else if (field === 't2oSize') {
                    const tSize = numValue;
                    updatedConn.t2oData = resizeDataArray(updatedConn.t2oData, tSize);
                    updatedConn.t2oDataset = adjustDataset(updatedConn.t2oDataset, tSize, 'Inputs_Param0');
                } else if (field === 'targetConfigSize' || field === 'configSize') {
                    const cSize = field === 'targetConfigSize' ? numValue : (updatedConn.targetConfigSize || numValue);
                    updatedConn.configData = resizeDataArray(updatedConn.configData, cSize);
                }
                return updatedConn;
            }
            return c;
        }) || [];
        
        handleUpdateSlave(selectedSlave.id, { connections: newConns });
    };

    const handleDatasetBitLengthEdit = (itemId: string, type: 'o2t' | 't2o', value: string) => {
        setEditingDatasetCell(null);
        if (!selectedSlave || !selectedConnectionId) return;
        const numValue = parseInt(value, 10);
        if (isNaN(numValue) || numValue < 0) return;

        const newConns = selectedSlave.connections?.map(c => {
            if (c.id === selectedConnectionId) {
                const updatedConn = { ...c };
                if (type === 'o2t') {
                    updatedConn.o2tDataset = (updatedConn.o2tDataset || []).map(item => 
                        item.id === itemId ? { ...item, bitLength: numValue } : item
                    );
                    const totalBits = updatedConn.o2tDataset.reduce((sum, item) => sum + item.bitLength, 0);
                    const newOSize = Math.ceil(totalBits / 8);
                    updatedConn.o2tSize = newOSize;
                    updatedConn.o2tData = resizeDataArray(updatedConn.o2tData, newOSize);
                } else {
                    updatedConn.t2oDataset = (updatedConn.t2oDataset || []).map(item => 
                        item.id === itemId ? { ...item, bitLength: numValue } : item
                    );
                    const totalBits = updatedConn.t2oDataset.reduce((sum, item) => sum + item.bitLength, 0);
                    const newTSize = Math.ceil(totalBits / 8);
                    updatedConn.t2oSize = newTSize;
                    updatedConn.t2oData = resizeDataArray(updatedConn.t2oData, newTSize);
                }
                return updatedConn;
            }
            return c;
        }) || [];
        
        handleUpdateSlave(selectedSlave.id, { connections: newConns });
    };

    const handleDeleteConnection = () => {
        if (!selectedSlave || !selectedConnectionId) return;
        const newConns = selectedSlave.connections?.filter(c => c.id !== selectedConnectionId) || [];
        handleUpdateSlave(selectedSlave.id, { connections: newConns });
    };

    const handleAddTagConnection = () => {
        if (!selectedSlave) return;
        const newConn = {
            id: Math.random().toString(36).substr(2, 9),
            name: '消费者标签',
            rpi: 50,
            o2tSize: 0,
            t2oSize: 4,
            configSize: 0,
            connectionPath: 'tag0',
            o2tData: [],
            t2oData: new Array(4).fill(0),
            configData: [],
            o2tDataset: [],
            t2oDataset: [{ id: Math.random().toString(36).substr(2, 9), name: 'Inputs_Param0', dataType: 'BYTE', bitLength: 32, helpString: '' }],
            configDataset: [],
            triggerType: 'Cyclic',
            transportType: 'Exclusive Owner',
            timeoutMultiplier: 4,
            o2tConnectionType: 'P2P',
            o2tPriority: 'Scheduled',
            o2tFixedVariable: 'Fixed',
            t2oConnectionType: 'P2P',
            t2oPriority: 'Scheduled',
            t2oFixedVariable: 'Fixed'
        };
        const currentConnections = selectedSlave.connections || [];
        const defaultConnection = currentConnections.find(c => (c.o2tSize || 0) > 0 && c.connectionPath && c.connectionPath.trim() !== '' && !c.connectionPath.includes('Symbolic')) || 
                                 currentConnections.find(c => c.connectionPath && c.connectionPath.trim() !== '') || 
                                 currentConnections[0];
        const currentSelectedId = selectedConnectionId || defaultConnection?.id;

        handleUpdateSlave(selectedSlave.id, { 
            connections: [...currentConnections, newConn as any] 
        });
        
        setSelectedConnectionId(newConn.id);
    };

    const handleAddConnectionSubmit = () => {
        if (!selectedSlave) return;
        let newConn: any;
        
        if (addConnectionType === 'generic') {
            newConn = {
                id: Math.random().toString(36).substr(2, 9),
                name: '通用连接',
                rpi: 20,
                o2tSize: Math.ceil((genericO2T.enabled ? 32 : 0) / 8) * 8 || 32, // Provide some default size
                t2oSize: Math.ceil((genericT2O.enabled ? 32 : 0) / 8) * 8 || 32,
                configSize: 0,
                targetConfigSize: 0,
                connectionPath: genericPathStr,
                o2tData: new Array(32).fill(0),
                t2oData: new Array(32).fill(0),
                configData: [],
                o2tDataset: genericO2T.enabled ? [{ id: Math.random().toString(36).substr(2, 9), name: 'Outputs_Param', dataType: 'DINT', bitLength: 256, helpString: '' }] : [],
                t2oDataset: genericT2O.enabled ? [{ id: Math.random().toString(36).substr(2, 9), name: 'Inputs_Param', dataType: 'DINT', bitLength: 256, helpString: '' }] : [],
                configDataset: [],
                triggerType: 'Cyclic', transportType: 'Exclusive Owner', timeoutMultiplier: 4,
                o2tConnectionType: 'P2P', o2tPriority: 'Scheduled', o2tFixedVariable: 'Fixed',
                t2oConnectionType: 'P2P', t2oPriority: 'Scheduled', t2oFixedVariable: 'Fixed'
            };
        } else if (addConnectionType === 'predefined') {
            const edsEntry = library.find(e => e.productName === selectedSlave.edsFile);
            const predefined = edsEntry?.connections?.[selectedPredefinedConnectionIndex];
            if (predefined) {
                newConn = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: predefined.name,
                    rpi: 50,
                    o2tSize: predefined.o2tSize || 0,
                    t2oSize: predefined.t2oSize || 0,
                    configSize: predefined.configSize || 0,
                    targetConfigSize: predefined.targetConfigSize || 0,
                    connectionPath: predefined.path || '20 04 24 78 2C 64 2C 6E',
                    o2tData: new Array(predefined.o2tSize || 0).fill(0),
                    t2oData: new Array(predefined.t2oSize || 0).fill(0),
                    configData: new Array(predefined.targetConfigSize || 0).fill(0),
                    o2tDataset: adjustDataset(predefined.o2tDataset, predefined.o2tSize || 0, 'Outputs_Param0'),
                    t2oDataset: adjustDataset(predefined.t2oDataset, predefined.t2oSize || 0, 'Inputs_Param0'),
                    configDataset: predefined.configDataset || [],
                    triggerType: 'Cyclic', transportType: 'Exclusive Owner', timeoutMultiplier: 4,
                    o2tConnectionType: 'P2P', o2tPriority: 'Scheduled', o2tFixedVariable: 'Fixed',
                    t2oConnectionType: 'P2P', t2oPriority: 'Scheduled', t2oFixedVariable: 'Fixed'
                };
            } else {
                return;
            }
        } else {
            return;
        }
        
        const currentConnections = selectedSlave.connections || [];
        const defaultConnection = currentConnections.find(c => (c.o2tSize || 0) > 0 && c.connectionPath && c.connectionPath.trim() !== '' && !c.connectionPath.includes('Symbolic')) || 
                                 currentConnections.find(c => c.connectionPath && c.connectionPath.trim() !== '') || 
                                 currentConnections[0];
        const currentSelectedId = selectedConnectionId || defaultConnection?.id;

        handleUpdateSlave(selectedSlave.id, { 
            connections: [...currentConnections, newConn] 
        });
        
        setSelectedConnectionId(newConn.id);
        setShowAddConnectionModal(false);
    };

    const handleEditConnectionSubmit = () => {
        if (!selectedSlave || !editingConnection) return;
        
        const updatedConn = { ...editingConnection };
        const oSize = Math.max(0, updatedConn.o2tSize || 0);
        const tSize = Math.max(0, updatedConn.t2oSize || 0);
        
        updatedConn.o2tData = resizeDataArray(updatedConn.o2tData, oSize);
        updatedConn.t2oData = resizeDataArray(updatedConn.t2oData, tSize);

        updatedConn.o2tDataset = adjustDataset(updatedConn.o2tDataset, oSize, 'Outputs_Param0');
        updatedConn.t2oDataset = adjustDataset(updatedConn.t2oDataset, tSize, 'Inputs_Param0');

        const newConns = selectedSlave.connections?.map(c => c.id === updatedConn.id ? updatedConn : c) || [];
        handleUpdateSlave(selectedSlave.id, { connections: newConns });
        setShowEditConnectionModal(false);
    };

    const handleAddSlave = () => {
        setLibrary(edsLibraryService.getLibrary());
        setShowAddSlaveModal(true);
    };

    const ipToLong = (ip: string) => {
        const parts = ip.split('.');
        if (parts.length !== 4) return 0;
        return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    };
    
    const longToIp = (long: number) => [ (long >>> 24), (long >> 16) & 255, (long >> 8) & 255, long & 255 ].join('.');
    
    const getNextIp = (ip: string) => {
        const long = ipToLong(ip);
        if (long === 0) return ip;
        return longToIp(long + 1);
    };
    
    const getUniqueIp = (existingIps: Set<string>, startIp: string = '192.168.1.1') => {
        let currentIp = startIp;
        let attempts = 0;
        while (existingIps.has(currentIp) && attempts < 1000) {
            currentIp = getNextIp(currentIp);
            attempts++;
        }
        return currentIp;
    };

    const getUniqueName = (baseName: string, existingNames: Set<string>) => {
        const match = baseName.match(/^(.*?)(?:_(\d+))?$/);
        const cleanBase = match ? match[1] : baseName;
        
        if (!existingNames.has(cleanBase)) return cleanBase;
        
        let counter = 1;
        while (existingNames.has(`${cleanBase}_${counter}`)) {
            counter++;
        }
        return `${cleanBase}_${counter}`;
    };

    const handleConfirmAddSlave = (entry: EdsEntry) => {
        const existingNames = new Set(session.scannerConfig.slaves.map(s => s.name));
        const existingIps = new Set(session.scannerConfig.slaves.map(s => s.ipAddress));
        
        const newSlaves: EipClass1Slave[] = [];
        let currentIp = '192.168.1.1';
        
        for (let i = 0; i < addQuantity; i++) {
            const uniqueName = getUniqueName(entry.productName, existingNames);
            existingNames.add(uniqueName);
            
            const uniqueIp = getUniqueIp(existingIps, currentIp);
            existingIps.add(uniqueIp);
            currentIp = uniqueIp;
            
            const newSlaveId = Math.random().toString(36).substr(2, 9);
            newSlaves.push({
                id: newSlaveId,
                name: uniqueName,
                ipAddress: uniqueIp,
                status: 'Disconnected',
                edsFile: entry.productName === 'Generic Device (通用设备)' ? undefined : entry.productName,
                keyingMode: 'Compatible',
                checkDeviceType: true,
                deviceType: entry.deviceType,
                checkVendorId: true,
                vendorId: entry.vendorId,
                checkProductCode: true,
                productCode: entry.productCode,
                checkMajorRevision: true,
                majorRevision: entry.majorRevision,
                checkMinorRevision: false,
                minorRevision: entry.minorRevision,
                params: entry.params,
                connections: (() => {
                    const defaultConn = (entry.connections || []).find(c => (c.o2tSize || 0) > 0 && c.path && c.path.trim() !== '' && !c.path.includes('Symbolic')) || 
                                        (entry.connections || []).find(c => c.path && c.path.trim() !== '') || 
                                        (entry.connections || [])[0];
                    return defaultConn ? [{
                        id: Math.random().toString(36).substr(2, 9),
                        name: defaultConn.name,
                        rpi: 50,
                        o2tSize: defaultConn.o2tSize,
                        t2oSize: defaultConn.t2oSize,
                        configSize: defaultConn.configSize,
                        targetConfigSize: defaultConn.targetConfigSize,
                        connectionPath: defaultConn.path,
                        o2tData: new Array(defaultConn.o2tSize || 0).fill(0),
                        t2oData: new Array(defaultConn.t2oSize || 0).fill(0),
                        configData: new Array(defaultConn.targetConfigSize || defaultConn.configSize || 0).fill(0),
                        o2tDataset: adjustDataset(defaultConn.o2tDataset, defaultConn.o2tSize || 0, 'Outputs_Param0'),
                        t2oDataset: adjustDataset(defaultConn.t2oDataset, defaultConn.t2oSize || 0, 'Inputs_Param0'),
                        configDataset: defaultConn.configDataset || [],
                        triggerType: 'Cyclic',
                        transportType: 'Exclusive Owner',
                        timeoutMultiplier: 4,
                        o2tConnectionType: 'P2P',
                        o2tPriority: 'Scheduled',
                        o2tFixedVariable: 'Fixed',
                        t2oConnectionType: 'P2P',
                        t2oPriority: 'Scheduled',
                        t2oFixedVariable: 'Fixed'
                    }] : [];
                })()
            });
        }
        
        onUpdate({
            scannerConfig: {
                ...session.scannerConfig,
                slaves: [...session.scannerConfig.slaves, ...newSlaves]
            }
        });
        setSelectedSlaveId(newSlaves[0].id);
        setMultiSelectedIds([newSlaves[0].id]);
        setShowAddSlaveModal(false);
        setAddQuantity(1);
    };

    const handleDuplicateSlave = (e: React.MouseEvent, slave: EipClass1Slave) => {
        e.stopPropagation();
        const existingNames = new Set(session.scannerConfig.slaves.map(s => s.name));
        const existingIps = new Set(session.scannerConfig.slaves.map(s => s.ipAddress));
        
        const uniqueName = getUniqueName(slave.name, existingNames);
        const uniqueIp = getUniqueIp(existingIps, slave.ipAddress);
        
        const newSlaveId = Math.random().toString(36).substr(2, 9);
        const duplicatedSlave: EipClass1Slave = JSON.parse(JSON.stringify(slave));
        duplicatedSlave.id = newSlaveId;
        duplicatedSlave.name = uniqueName;
        duplicatedSlave.ipAddress = uniqueIp;
        duplicatedSlave.connections = duplicatedSlave.connections.map(c => ({
            ...c,
            id: Math.random().toString(36).substr(2, 9)
        }));
        
        onUpdate({
            scannerConfig: {
                ...session.scannerConfig,
                slaves: [...session.scannerConfig.slaves, duplicatedSlave]
            }
        });
        setSelectedSlaveId(newSlaveId);
        setMultiSelectedIds([newSlaveId]);
    };

    const handleUpdateSlave = (id: string, updates: Partial<EipClass1Slave>) => {
        onUpdate({
            scannerConfig: {
                ...session.scannerConfig,
                slaves: session.scannerConfig.slaves.map(s => s.id === id ? { ...s, ...updates } : s)
            }
        });
    };

    const handleDeleteSlave = (id: string) => {
        const newSlaves = session.scannerConfig.slaves.filter(s => s.id !== id);
        onUpdate({
            scannerConfig: {
                ...session.scannerConfig,
                slaves: newSlaves
            }
        });
        if (selectedSlaveId === id) {
            setSelectedSlaveId(newSlaves[0]?.id || null);
        }
    };

    const handleAddDatasetItem = (direction: 'o2t' | 't2o') => {
        if (!selectedSlave || !selectedConnectionId) return;
        const conn = selectedSlave.connections?.find(c => c.id === selectedConnectionId);
        if (!conn) return;

        const datasetKey = direction === 'o2t' ? 'o2tDataset' : 't2oDataset';
        const currentDataset = conn[datasetKey] || [];
        const prefix = direction === 'o2t' ? 'Outputs_Param' : 'Inputs_Param';
        
        const newItem: EipClass1DatasetItem = {
            id: Math.random().toString(36).substr(2, 9),
            name: `${prefix}${currentDataset.length}`,
            dataType: 'BYTE',
            bitLength: 8,
            helpString: ''
        };

        const newConnections = selectedSlave.connections?.map(c => {
            if (c.id === selectedConnectionId) {
                const updatedConn = { ...c, [datasetKey]: [...currentDataset, newItem] };
                const o2tBits = (updatedConn.o2tDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const t2oBits = (updatedConn.t2oDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const newOSize = Math.ceil(o2tBits / 8);
                const newTSize = Math.ceil(t2oBits / 8);
                updatedConn.o2tSize = newOSize;
                updatedConn.t2oSize = newTSize;
                updatedConn.o2tData = resizeDataArray(updatedConn.o2tData, newOSize);
                updatedConn.t2oData = resizeDataArray(updatedConn.t2oData, newTSize);
                return updatedConn;
            }
            return c;
        });
        handleUpdateSlave(selectedSlave.id, { connections: newConnections });
    };

    const handleUpdateDatasetItem = (direction: 'o2t' | 't2o', itemId: string, updates: Partial<EipClass1DatasetItem>) => {
        if (!selectedSlave || !selectedConnectionId) return;
        const conn = selectedSlave.connections?.find(c => c.id === selectedConnectionId);
        if (!conn) return;

        const datasetKey = direction === 'o2t' ? 'o2tDataset' : 't2oDataset';
        const currentDataset = conn[datasetKey] || [];
        
        const newDataset = currentDataset.map(item => {
            if (item.id === itemId) {
                const updated = { ...item, ...updates };
                if (updates.dataType && DATA_TYPES[updates.dataType]) {
                    updated.bitLength = DATA_TYPES[updates.dataType];
                }
                return updated;
            }
            return item;
        });

        const newConnections = selectedSlave.connections?.map(c => {
            if (c.id === selectedConnectionId) {
                const updatedConn = { ...c, [datasetKey]: newDataset };
                const o2tBits = (updatedConn.o2tDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const t2oBits = (updatedConn.t2oDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const newOSize = Math.ceil(o2tBits / 8);
                const newTSize = Math.ceil(t2oBits / 8);
                updatedConn.o2tSize = newOSize;
                updatedConn.t2oSize = newTSize;
                updatedConn.o2tData = resizeDataArray(updatedConn.o2tData, newOSize);
                updatedConn.t2oData = resizeDataArray(updatedConn.t2oData, newTSize);
                return updatedConn;
            }
            return c;
        });
        handleUpdateSlave(selectedSlave.id, { connections: newConnections });
    };

    const handleDeleteDatasetItem = (direction: 'o2t' | 't2o', itemId: string) => {
        if (!selectedSlave || !selectedConnectionId) return;
        const conn = selectedSlave.connections?.find(c => c.id === selectedConnectionId);
        if (!conn) return;

        const datasetKey = direction === 'o2t' ? 'o2tDataset' : 't2oDataset';
        const currentDataset = conn[datasetKey] || [];
        
        const newDataset = currentDataset.filter(item => item.id !== itemId);

        const newConnections = selectedSlave.connections?.map(c => {
            if (c.id === selectedConnectionId) {
                const updatedConn = { ...c, [datasetKey]: newDataset };
                const o2tBits = (updatedConn.o2tDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const t2oBits = (updatedConn.t2oDataset || []).reduce((sum, item) => sum + item.bitLength, 0);
                const newOSize = Math.ceil(o2tBits / 8);
                const newTSize = Math.ceil(t2oBits / 8);
                updatedConn.o2tSize = newOSize;
                updatedConn.t2oSize = newTSize;
                updatedConn.o2tData = resizeDataArray(updatedConn.o2tData, newOSize);
                updatedConn.t2oData = resizeDataArray(updatedConn.t2oData, newTSize);
                return updatedConn;
            }
            return c;
        });
        handleUpdateSlave(selectedSlave.id, { connections: newConnections });
    };

    const handleImportEDS = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedSlaveId) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const content = evt.target?.result as string;
            const parsed = parseEDS(content);
            if (parsed) {
                handleUpdateSlave(selectedSlaveId, {
                    name: parsed.productName,
                    vendorId: parsed.vendorId,
                    deviceType: parsed.deviceType,
                    productCode: parsed.productCode,
                    majorRevision: parsed.majorRevision,
                    minorRevision: parsed.minorRevision,
                    edsFile: file.name,
                    params: parsed.params,
                    connections: parsed.connections.map(conn => ({
                        id: Math.random().toString(36).substr(2, 9),
                        name: conn.name,
                        rpi: 50,
                        o2tSize: conn.o2tSize,
                        t2oSize: conn.t2oSize,
                        configSize: conn.configSize,
                        targetConfigSize: conn.targetConfigSize,
                        connectionPath: conn.path,
                        o2tData: new Array(conn.o2tSize).fill(0),
                        t2oData: new Array(conn.t2oSize).fill(0),
                        configData: new Array(conn.targetConfigSize || 0).fill(0),
                        o2tDataset: conn.o2tDataset && conn.o2tDataset.length > 0 ? conn.o2tDataset : (conn.o2tSize > 0 ? [{ id: Math.random().toString(36).substr(2, 9), name: 'Outputs_Param0', dataType: 'BYTE', bitLength: conn.o2tSize * 8, helpString: '' }] : []),
                        t2oDataset: conn.t2oDataset && conn.t2oDataset.length > 0 ? conn.t2oDataset : (conn.t2oSize > 0 ? [{ id: Math.random().toString(36).substr(2, 9), name: 'Inputs_Param0', dataType: 'BYTE', bitLength: conn.t2oSize * 8, helpString: '' }] : []),
                        configDataset: conn.configDataset || []
                    }))
                });
                toast.success(`成功导入 EDS: ${parsed.productName}`);
            } else {
                toast.error("解析 EDS 文件失败，格式不正确");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <div className="flex h-full w-full">
            <input 
                type="file" 
                accept=".eds" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleImportEDS} 
            />
            {/* Slaves List */}
            <div 
                style={{ width: `${slavesListWidth}px` }}
                className="bg-white border-r border-slate-200 flex flex-col shrink-0 relative"
            >
                <div 
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-slate-300 z-50 group transition-colors"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        isDraggingSlavesRef.current = true;
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                    }}
                >
                    <div className="absolute inset-y-0 right-0 w-4 -translate-x-1.5 cursor-col-resize" />
                </div>
                <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">目标设备 ({session.scannerConfig.slaves.length})</span>
                    <div className="flex items-center gap-1">
                        {multiSelectedIds.length > 0 && (
                            <button onClick={handleBatchDelete} disabled={isConnected} className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50" title="批量删除">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={() => setShowScanModal(true)} disabled={isConnected} className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50" title="扫描网络中的设备">
                            <Search className="w-4 h-4" />
                        </button>
                        <button onClick={handleAddSlave} disabled={isConnected} className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50" title="添加设备">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50 select-none">
                    {session.scannerConfig.slaves.map((slave, index) => {
                        const isSelected = multiSelectedIds.includes(slave.id);
                        const isActive = selectedSlaveId === slave.id;
                        const isIpConflict = session.scannerConfig.slaves.some(s => s.id !== slave.id && s.ipAddress === slave.ipAddress);
                        return (
                            <React.Fragment key={slave.id}>
                                <div 
                                    onClick={(e) => handleSlaveClick(e, slave.id)}
                                    className={`p-2.5 rounded-lg cursor-pointer border text-xs flex items-start justify-between group shadow-sm transition-colors ${
                                        isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 
                                        isActive ? 'bg-white border-indigo-400 text-indigo-700 shadow-md ring-1 ring-indigo-400/20' : 
                                        'bg-white border-slate-200 hover:border-indigo-200 text-slate-700'
                                    }`}
                                >
                                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                                        <div className={`p-1.5 rounded-md mt-0.5 shrink-0 ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                            <Network className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-semibold truncate leading-tight mb-1">{slave.name}</span>
                                            <span className={`font-mono text-[10px] truncate ${isIpConflict ? 'text-red-500 line-through opacity-80' : 'text-slate-500'}`}>{slave.ipAddress}</span>
                                            {isIpConflict && (
                                                <span className="mt-1 text-[10px] text-red-600 font-bold flex flex-wrap items-center gap-1 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    IP地址重复
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {slave.status === 'Connected' && !slave.hasErrorHistory && (
                                                <div title="已连接" className="p-0.5 rounded-full bg-green-50 border border-green-200">
                                                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                                </div>
                                            )}
                                        {slave.status === 'Connected' && slave.hasErrorHistory && (
                                            <div 
                                                className="relative cursor-pointer hover:opacity-80 p-0.5 rounded-full bg-green-50 border border-green-200" 
                                                title={`已连接 (曾掉线，累计掉线次数: ${slave.dropCount || 0}) - 点击清除掉线报警`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmClearErrorId(slave.id);
                                                }}
                                            >
                                                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                                <div className="absolute -bottom-1 -right-1 bg-white rounded-full">
                                                    <AlertTriangle className="w-3 h-3 text-red-500 shadow-sm" />
                                                </div>
                                            </div>
                                        )}
                                        {slave.status === 'Error' && (
                                            <div className="relative p-0.5 rounded-full bg-red-50 border border-red-200" title="通讯掉线">
                                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                            </div>
                                        )}
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={(e) => handleDuplicateSlave(e, slave)}
                                                disabled={isConnected}
                                                className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-0"
                                                title="复制设备"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    if (multiSelectedIds.length > 1 && multiSelectedIds.includes(slave.id)) {
                                                        handleBatchDelete();
                                                    } else {
                                                        handleDeleteSlave(slave.id); 
                                                    }
                                                }}
                                                disabled={isConnected}
                                                className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-0"
                                                title="删除设备"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                {index < session.scannerConfig.slaves.length - 1 && (
                                    <div className="h-px bg-slate-200/50 mx-2"></div>
                                )}
                            </React.Fragment>
                        );
                    })}
                    {session.scannerConfig.slaves.length === 0 && (
                        <div className="text-center p-4 text-xs text-slate-400">
                            暂无从站设备，请点击右上角添加
                        </div>
                    )}
                </div>
            </div>

            {/* Slave Configuration */}
            <div className="flex-1 bg-white overflow-hidden flex">
                {selectedSlave ? (
                    <>
                        {/* Vertical Tabs */}
                        <div className="w-48 bg-slate-50 border-r border-slate-200 flex flex-col pt-2">
                            {[
                                { id: 'general', label: '通用' },
                                { id: 'connections', label: '连接' },
                                { id: 'params', label: '用户参数' },
                                { id: 'mapping', label: 'EtherNet/IP I/O映射' },
                                { id: 'status', label: '状态' },
                                { id: 'info', label: '信息' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSlaveTab(tab.id as any)}
                                    className={`px-4 py-2 text-left text-xs transition-colors ${activeSlaveTab === tab.id ? 'bg-white text-indigo-600 border-l-4 border-indigo-600 font-bold' : 'text-slate-600 hover:bg-slate-100 border-l-4 border-transparent'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-white">
                            {activeSlaveTab === 'general' && (() => {
                                const isIpDuplicate = session.scannerConfig.slaves.some(s => s.id !== selectedSlave.id && s.ipAddress === selectedSlave.ipAddress);
                                return (
                                <div className="max-w-2xl space-y-8">
                                    {/* General Settings */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                            <h3 className="font-bold text-slate-800">地址设置</h3>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setShowLibraryModal(true)}
                                                    disabled={isConnected}
                                                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                                >
                                                    <FileText className="w-3.5 h-3.5" /> 从 EDS 库选择
                                                </button>
                                                <button 
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={isConnected}
                                                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-300 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                                >
                                                    <Download className="w-3.5 h-3.5" /> 导入 EDS
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <label className="text-xs font-bold text-slate-600 w-24 mt-2">IP地址</label>
                                            <div>
                                                <input 
                                                    value={selectedSlave.ipAddress} 
                                                    onChange={e => handleUpdateSlave(selectedSlave.id, { ipAddress: e.target.value })}
                                                    disabled={isConnected}
                                                    className={`w-48 px-3 py-1.5 border rounded text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100 ${isIpDuplicate ? 'border-red-500 bg-red-50/50 text-red-700' : 'border-slate-300'}`}
                                                />
                                                {isIpDuplicate && <p className="text-xs text-red-500 mt-1">IP地址与列表中其他设备重复</p>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Electronic Keying */}
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-2">电子键控</h3>
                                        <div className="border border-slate-200 rounded p-4 space-y-4 bg-slate-50/50">
                                            <div className="font-bold text-xs text-slate-700 mb-2">键控选项</div>
                                            <div className="space-y-2">
                                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                                    <input type="radio" name="keying" value="Compatible" checked={selectedSlave.keyingMode === 'Compatible'} onChange={() => handleUpdateSlave(selectedSlave.id, { keyingMode: 'Compatible' })} disabled={isConnected} className="text-indigo-600" />
                                                    兼容性检查
                                                </label>
                                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                                    <input type="radio" name="keying" value="Exact" checked={selectedSlave.keyingMode === 'Exact'} onChange={() => handleUpdateSlave(selectedSlave.id, { keyingMode: 'Exact' })} disabled={isConnected} className="text-indigo-600" />
                                                    严格的身份检查
                                                </label>
                                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                                    <input type="radio" name="keying" value="Disabled" checked={selectedSlave.keyingMode === 'Disabled'} onChange={() => handleUpdateSlave(selectedSlave.id, { keyingMode: 'Disabled' })} disabled={isConnected} className="text-indigo-600" />
                                                    禁止匹配
                                                </label>
                                            </div>

                                            <div className="mt-6 space-y-3">
                                                {[
                                                    { key: 'checkDeviceType', valKey: 'deviceType', label: '检查设备类型' },
                                                    { key: 'checkVendorId', valKey: 'vendorId', label: '检查供应商代码' },
                                                    { key: 'checkProductCode', valKey: 'productCode', label: '检查产品代码' },
                                                    { key: 'checkMajorRevision', valKey: 'majorRevision', label: '检查主版本' },
                                                    { key: 'checkMinorRevision', valKey: 'minorRevision', label: '检查次版本' }
                                                ].map(item => (
                                                    <div key={item.key} className="flex items-center gap-4">
                                                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer w-40">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={(selectedSlave as any)[item.key]} 
                                                                onChange={(e) => handleUpdateSlave(selectedSlave.id, { [item.key]: e.target.checked })}
                                                                disabled={isConnected || selectedSlave.keyingMode === 'Disabled'}
                                                                className="rounded text-indigo-600"
                                                            />
                                                            {item.label}
                                                        </label>
                                                        <input 
                                                            type="number" 
                                                            value={(selectedSlave as any)[item.valKey]}
                                                            onChange={(e) => handleUpdateSlave(selectedSlave.id, { [item.valKey]: Number(e.target.value) })}
                                                            disabled={isConnected || !(selectedSlave as any)[item.key] || selectedSlave.keyingMode === 'Disabled'}
                                                            className="w-24 px-2 py-1 border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="pt-4">
                                                <button disabled={isConnected} className="px-4 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                                                    恢复默认值
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                );
                            })()}

                            {activeSlaveTab === 'connections' && (() => {
                                const connections = selectedSlave.connections || [];
                                // 精确识别专有所有者：有连接路径 且 O->T 大小 > 0
                                const defaultConnection = connections.find(c => (c.o2tSize || 0) > 0 && c.connectionPath && c.connectionPath.trim() !== '' && !c.connectionPath.includes('Symbolic')) || 
                                                         connections.find(c => c.connectionPath && c.connectionPath.trim() !== '') || 
                                                         connections[0];
                                
                                const selectedConnection = connections.find(c => c.id === selectedConnectionId) || defaultConnection;
                                
                                return (
                                <div className="h-full flex flex-col p-2 bg-slate-50 overflow-hidden">
                                    {/* Top Table - Dropdown Mode */}
                                    <div className="border border-slate-300 bg-white overflow-hidden flex flex-col h-[400px] shrink-0">
                                        <table className="w-full text-xs text-left whitespace-nowrap">
                                            <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                                                <tr>
                                                    <th className="px-3 py-2 font-normal border-r border-slate-300">连接名称</th>
                                                    <th className="px-3 py-2 font-normal border-r border-slate-300">RPI(ms)</th>
                                                    <th className="px-3 py-2 font-normal border-r border-slate-300">O--&gt;T 大小(byte)</th>
                                                    <th className="px-3 py-2 font-normal border-r border-slate-300">T--&gt;O 大小(byte)</th>
                                                    <th className="px-3 py-2 font-normal border-r border-slate-300">代理配置大小(byte)</th>
                                                    <th className="px-3 py-2 font-normal border-r border-slate-300">目标配置大小(byte)</th>
                                                    <th className="px-3 py-2 font-normal">连接路径</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {connections.map((conn) => (
                                                    <tr 
                                                        key={conn.id} 
                                                        className={`cursor-pointer border-b border-slate-200 ${selectedConnection?.id === conn.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                                        onClick={() => setSelectedConnectionId(conn.id)}
                                                    >
                                                        <td className="px-3 py-2 border-r border-slate-300">
                                                            {conn.name}
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-slate-300" onDoubleClick={() => !isConnected && setEditingCell({ id: conn.id, field: 'rpi' })}>
                                                            {editingCell?.id === conn.id && editingCell?.field === 'rpi' ? (
                                                                <input autoFocus defaultValue={conn.rpi} onBlur={(e) => handleConnectionInlineEdit(conn.id, 'rpi', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                            ) : conn.rpi}
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-slate-300" onDoubleClick={() => !isConnected && setEditingCell({ id: conn.id, field: 'o2tSize' })}>
                                                            {editingCell?.id === conn.id && editingCell?.field === 'o2tSize' ? (
                                                                <input autoFocus defaultValue={conn.o2tSize} onBlur={(e) => handleConnectionInlineEdit(conn.id, 'o2tSize', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                            ) : conn.o2tSize}
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-slate-300" onDoubleClick={() => !isConnected && setEditingCell({ id: conn.id, field: 't2oSize' })}>
                                                            {editingCell?.id === conn.id && editingCell?.field === 't2oSize' ? (
                                                                <input autoFocus defaultValue={conn.t2oSize} onBlur={(e) => handleConnectionInlineEdit(conn.id, 't2oSize', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                            ) : conn.t2oSize}
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-slate-300" onDoubleClick={() => !isConnected && setEditingCell({ id: conn.id, field: 'configSize' })}>
                                                            {editingCell?.id === conn.id && editingCell?.field === 'configSize' ? (
                                                                <input autoFocus defaultValue={conn.configSize} onBlur={(e) => handleConnectionInlineEdit(conn.id, 'configSize', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                            ) : conn.configSize}
                                                        </td>
                                                        <td className="px-3 py-2 border-r border-slate-300" onDoubleClick={() => !isConnected && setEditingCell({ id: conn.id, field: 'targetConfigSize' })}>
                                                            {editingCell?.id === conn.id && editingCell?.field === 'targetConfigSize' ? (
                                                                <input autoFocus defaultValue={conn.targetConfigSize || 0} onBlur={(e) => handleConnectionInlineEdit(conn.id, 'targetConfigSize', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                            ) : (conn.targetConfigSize || 0)}
                                                        </td>
                                                        <td className="px-3 py-2">{conn.connectionPath}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Middle Buttons */}
                                    <div className="flex gap-2 py-2 shrink-0">
                                        <button onClick={() => setShowAddConnectionModal(true)} disabled={isConnected} className="px-4 py-1 bg-slate-50 border border-slate-300 rounded text-xs hover:bg-slate-100 disabled:opacity-50">添加连接...</button>
                                        <button onClick={handleAddTagConnection} disabled={isConnected} className="px-4 py-1 bg-slate-50 border border-slate-300 rounded text-xs hover:bg-slate-100 disabled:opacity-50">添加标签连接...</button>
                                        <button onClick={handleDeleteConnection} disabled={isConnected || !selectedConnectionId} className="px-4 py-1 bg-slate-50 border border-slate-300 rounded text-xs hover:bg-slate-100 disabled:opacity-50">删除...</button>
                                        <button onClick={() => {
                                            const conn = selectedSlave.connections?.find(c => c.id === selectedConnectionId);
                                            if (conn) {
                                                setEditingConnection(conn);
                                                setShowEditConnectionModal(true);
                                            }
                                        }} disabled={isConnected || !selectedConnectionId} className="px-4 py-1 bg-slate-50 border border-slate-300 rounded text-xs hover:bg-slate-100 disabled:opacity-50">编辑...</button>
                                    </div>

                                    {/* Bottom Split View */}
                                    <div className="flex-1 flex flex-col border border-slate-300 bg-white min-h-0">
                                        <div className="flex bg-slate-100 border-b border-slate-300 shrink-0">
                                            <button 
                                                onClick={() => setActiveBottomTab('dataset')}
                                                className={`px-4 py-1 text-xs border-r border-slate-300 ${activeBottomTab === 'dataset' ? 'bg-white border-t-2 border-t-indigo-500' : 'text-slate-600 hover:bg-slate-200'}`}>
                                                数据集
                                            </button>
                                            <button 
                                                onClick={() => setActiveBottomTab('config')}
                                                className={`px-4 py-1 text-xs border-r border-slate-300 ${activeBottomTab === 'config' ? 'bg-white border-t-2 border-t-indigo-500' : 'text-slate-600 hover:bg-slate-200'}`}>
                                                配置数据
                                            </button>
                                        </div>
                                        
                                        {activeBottomTab === 'dataset' ? (
                                            <div className="flex-1 flex overflow-hidden">
                                                {/* Left: Outputs */}
                                                <div className="flex-1 border-r border-slate-300 flex flex-col overflow-hidden relative">
                                                    {selectedSlave.connections?.find(c => c.id === selectedConnectionId)?.o2tSize === 0 && (
                                                        <div className="absolute inset-0 bg-slate-100/50 z-10 cursor-not-allowed"></div>
                                                    )}
                                                    <div className="px-2 py-1 text-xs font-bold bg-slate-100 border-b border-slate-300 shrink-0">输出数据集 "Outputs" (O--&gt;T)</div>
                                                    <div className="flex gap-2 px-2 py-1 bg-slate-50 border-b border-slate-300 text-xs shrink-0">
                                                        <button onClick={() => handleAddDatasetItem('o2t')} disabled={isConnected} className="flex items-center gap-1 hover:text-indigo-600 disabled:opacity-50"><Plus className="w-3 h-3"/> Add</button>
                                                        <button onClick={() => selectedDatasetItemId && handleDeleteDatasetItem('o2t', selectedDatasetItemId)} disabled={isConnected} className={`flex items-center gap-1 ${selectedDatasetItemId && !isConnected ? 'hover:text-red-600' : 'text-slate-400'} disabled:opacity-50`}><X className="w-3 h-3"/> Delete</button>
                                                        <button className="flex items-center gap-1 text-slate-400">↑ Move Up</button>
                                                        <button className="flex items-center gap-1 text-slate-400">↓ Move Down</button>
                                                    </div>
                                                    <div className="flex-1 overflow-auto">
                                                        <table className="w-full text-xs text-left whitespace-nowrap">
                                                            <thead className="bg-slate-100 border-b border-slate-300 sticky top-0">
                                                                <tr>
                                                                    <th className="px-2 py-1.5 font-normal border-r border-slate-300">名称</th>
                                                                    <th className="px-2 py-1.5 font-normal border-r border-slate-300">数据类型</th>
                                                                    <th className="px-2 py-1.5 font-normal border-r border-slate-300">位长度</th>
                                                                    <th className="px-2 py-1.5 font-normal">帮助字符串</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(selectedSlave.connections?.find(c => c.id === selectedConnectionId)?.o2tDataset || []).map((item) => (
                                                                    <tr key={item.id} 
                                                                        className={`cursor-pointer ${selectedDatasetItemId === item.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                                                        onClick={() => setSelectedDatasetItemId(item.id)}>
                                                                        <td className="px-2 py-1.5 border-r border-slate-300 border-b border-slate-200">
                                                                            <input type="text" value={item.name} onChange={(e) => handleUpdateDatasetItem('o2t', item.id, { name: e.target.value })} className="w-full bg-transparent outline-none" disabled={isConnected} />
                                                                        </td>
                                                                        <td className="px-2 py-1.5 border-r border-slate-300 border-b border-slate-200">
                                                                            <select value={item.dataType} onChange={(e) => handleUpdateDatasetItem('o2t', item.id, { dataType: e.target.value })} className="w-full bg-transparent outline-none" disabled={isConnected}>
                                                                                {Object.keys(DATA_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                                                                            </select>
                                                                        </td>
                                                                        <td className="px-2 py-1.5 border-r border-slate-300 border-b border-slate-200" onDoubleClick={() => !isConnected && setEditingDatasetCell({ id: item.id, type: 'o2t' })}>
                                                                            {editingDatasetCell?.id === item.id && editingDatasetCell?.type === 'o2t' && !isConnected ? (
                                                                                <input autoFocus defaultValue={item.bitLength} onBlur={(e) => handleDatasetBitLengthEdit(item.id, 'o2t', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                                            ) : item.bitLength}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 border-b border-slate-200">
                                                                            <input type="text" value={item.helpString} onChange={(e) => handleUpdateDatasetItem('o2t', item.id, { helpString: e.target.value })} className="w-full bg-transparent outline-none" disabled={isConnected} />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                {/* Right: Inputs */}
                                                <div className="flex-1 flex flex-col overflow-hidden">
                                                    <div className="px-2 py-1 text-xs font-bold bg-slate-100 border-b border-slate-300 shrink-0">输入数据集 "Inputs" (T--&gt;O)</div>
                                                    <div className="flex gap-2 px-2 py-1 bg-slate-50 border-b border-slate-300 text-xs shrink-0">
                                                        <button onClick={() => handleAddDatasetItem('t2o')} disabled={isConnected} className="flex items-center gap-1 hover:text-indigo-600 disabled:opacity-50"><Plus className="w-3 h-3"/> Add</button>
                                                        <button onClick={() => selectedDatasetItemId && handleDeleteDatasetItem('t2o', selectedDatasetItemId)} disabled={isConnected} className={`flex items-center gap-1 ${selectedDatasetItemId && !isConnected ? 'hover:text-red-600' : 'text-slate-400'} disabled:opacity-50`}><X className="w-3 h-3"/> Delete</button>
                                                        <button className="flex items-center gap-1 text-slate-400">↑ Move Up</button>
                                                        <button className="flex items-center gap-1 text-slate-400">↓ Move Down</button>
                                                    </div>
                                                    <div className="flex-1 overflow-auto">
                                                        <table className="w-full text-xs text-left whitespace-nowrap">
                                                            <thead className="bg-slate-100 border-b border-slate-300 sticky top-0">
                                                                <tr>
                                                                    <th className="px-2 py-1.5 font-normal border-r border-slate-300">名称</th>
                                                                    <th className="px-2 py-1.5 font-normal border-r border-slate-300">数据类型</th>
                                                                    <th className="px-2 py-1.5 font-normal border-r border-slate-300">位长度</th>
                                                                    <th className="px-2 py-1.5 font-normal">帮助字符串</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(selectedSlave.connections?.find(c => c.id === selectedConnectionId)?.t2oDataset || []).map((item) => (
                                                                    <tr key={item.id} 
                                                                        className={`cursor-pointer ${selectedDatasetItemId === item.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                                                                        onClick={() => setSelectedDatasetItemId(item.id)}>
                                                                        <td className="px-2 py-1.5 border-r border-slate-300 border-b border-slate-200">
                                                                            <input type="text" value={item.name} onChange={(e) => handleUpdateDatasetItem('t2o', item.id, { name: e.target.value })} className="w-full bg-transparent outline-none" disabled={isConnected} />
                                                                        </td>
                                                                        <td className="px-2 py-1.5 border-r border-slate-300 border-b border-slate-200">
                                                                            <select value={item.dataType} onChange={(e) => handleUpdateDatasetItem('t2o', item.id, { dataType: e.target.value })} className="w-full bg-transparent outline-none" disabled={isConnected}>
                                                                                {Object.keys(DATA_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                                                                            </select>
                                                                        </td>
                                                                        <td className="px-2 py-1.5 border-r border-slate-300 border-b border-slate-200" onDoubleClick={() => !isConnected && setEditingDatasetCell({ id: item.id, type: 't2o' })}>
                                                                            {editingDatasetCell?.id === item.id && editingDatasetCell?.type === 't2o' && !isConnected ? (
                                                                                <input autoFocus defaultValue={item.bitLength} onBlur={(e) => handleDatasetBitLengthEdit(item.id, 't2o', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="w-16 px-1 border border-indigo-500 outline-none" />
                                                                            ) : item.bitLength}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 border-b border-slate-200">
                                                                            <input type="text" value={item.helpString} onChange={(e) => handleUpdateDatasetItem('t2o', item.id, { helpString: e.target.value })} className="w-full bg-transparent outline-none" disabled={isConnected} />
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col overflow-hidden">
                                                <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border-b border-slate-300 shrink-0">
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <label className="flex items-center gap-1">
                                                            <input type="checkbox" className="rounded border-slate-300" />
                                                            原始数据值
                                                        </label>
                                                        <label className="flex items-center gap-1">
                                                            <input type="checkbox" defaultChecked className="rounded border-slate-300" />
                                                            显示参数组
                                                        </label>
                                                    </div>
                                                    <button className="px-3 py-0.5 text-xs bg-white border border-slate-300 rounded hover:bg-slate-50">默认</button>
                                                </div>
                                                <div className="flex-1 overflow-auto">
                                                    <table className="w-full text-xs text-left whitespace-nowrap">
                                                        <thead className="bg-slate-100 border-b border-slate-300 sticky top-0">
                                                            <tr>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300 w-1/3">参数</th>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300">值</th>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300">单元</th>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300">数据类型</th>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300">最小</th>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300">最大</th>
                                                                <th className="px-2 py-1 font-normal border-r border-slate-300">默认</th>
                                                                <th className="px-2 py-1 font-normal">帮助字符串</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            <tr>
                                                                <td colSpan={8} className="px-2 py-1 border-b border-slate-200 font-bold bg-slate-50">
                                                                    - {selectedSlave.connections?.find(c => c.id === selectedConnectionId)?.name || 'Connection'}
                                                                </td>
                                                            </tr>
                                                            <tr>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200 pl-6">
                                                                    - 目标配置数据
                                                                </td>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200"></td>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200"></td>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200"></td>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200"></td>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200"></td>
                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200"></td>
                                                                <td className="px-2 py-1 border-b border-slate-200"></td>
                                                            </tr>
                                                            {(() => {
                                                                const conn = selectedSlave.connections?.find(c => c.id === selectedConnectionId);
                                                                const configItems = conn?.configDataset || [];
                                                                
                                                                // Fallback to library if selectedSlave.params is missing
                                                                let slaveParams = selectedSlave.params;
                                                                if (!slaveParams || slaveParams.length === 0) {
                                                                    const libEntry = library.find(e => 
                                                                        e.vendorId === selectedSlave.vendorId &&
                                                                        e.deviceType === selectedSlave.deviceType &&
                                                                        e.productCode === selectedSlave.productCode
                                                                    );
                                                                    if (libEntry && libEntry.params) {
                                                                        slaveParams = libEntry.params;
                                                                    }
                                                                }

                                                                if (configItems.length > 0) {
                                                                    return configItems.map((item, index) => {
                                                                        const param = slaveParams?.find(p => p.name === item.name);
                                                                        const displayValue = item.value !== undefined ? item.value : (param?.defaultValue ?? 0);
                                                                        
                                                                        return (
                                                                            <tr key={item.id} className="hover:bg-slate-50">
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200 pl-10">
                                                                                    {item.name}
                                                                                </td>
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200 bg-blue-50/50">
                                                                                    <input 
                                                                                        type="text" 
                                                                                        value={displayValue} 
                                                                                        onChange={(e) => {
                                                                                            const newItems = [...configItems];
                                                                                            newItems[index] = { ...newItems[index], value: e.target.value };
                                                                                            const newConns = selectedSlave.connections?.map(c => 
                                                                                                c.id === conn.id ? { ...c, configDataset: newItems } : c
                                                                                            );
                                                                                            handleUpdateSlave(selectedSlave.id, { connections: newConns });
                                                                                        }}
                                                                                        className="w-full bg-transparent outline-none" 
                                                                                    />
                                                                                </td>
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{param?.units || ''}</td>
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{item.dataType}</td>
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{param?.min ?? ''}</td>
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{param?.max ?? ''}</td>
                                                                                <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{param?.defaultValue ?? ''}</td>
                                                                                <td className="px-2 py-1 border-b border-slate-200">{item.helpString}</td>
                                                                            </tr>
                                                                        );
                                                                    });
                                                                } else if (conn?.targetConfigSize) {
                                                                    return (
                                                                        <tr>
                                                                            <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200 pl-10 text-slate-500">
                                                                                Config Size: {conn.targetConfigSize} bytes
                                                                            </td>
                                                                            <td colSpan={7} className="px-2 py-1 border-b border-slate-200 text-slate-400 italic">
                                                                                (No configuration parameters found in EDS)
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                } else {
                                                                    return null;
                                                                }
                                                            })()}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                );
                            })()}

                            {activeSlaveTab === 'mapping' && selectedSlave && (
                                <IOMappingTab 
                                    slave={selectedSlave} 
                                    onWriteData={(slaveId, connId, data) => {
                                        onUpdate(prev => {
                                            const slaves = [...prev.scannerConfig.slaves];
                                            const slaveIdx = slaves.findIndex(s => s.id === slaveId);
                                            if (slaveIdx >= 0) {
                                                const slave = { ...slaves[slaveIdx] };
                                                if (slave.connections) {
                                                    slave.connections = slave.connections.map(conn => {
                                                        if (conn.id === connId as any) {
                                                            return { ...conn, o2tData: data };
                                                        }
                                                        return conn;
                                                    });
                                                }
                                                slaves[slaveIdx] = slave;
                                                
                                                if (isConnected && (window as any).electronAPI) {
                                                    (window as any).electronAPI.eipClass1UpdateData(prev.id, slave.ipAddress, connId, data);
                                                }
                                                
                                                return { scannerConfig: { ...prev.scannerConfig, slaves } };
                                            }
                                            return {};
                                        });
                                    }}
                                />
                            )}

                            {activeSlaveTab === 'info' && selectedSlave && (
                                <SlaveInfoTab slave={selectedSlave} />
                            )}

                            {activeSlaveTab === 'status' && selectedSlave && (
                                <SlaveStatusTab slave={selectedSlave} stats={stats} />
                            )}

                            {['params'].includes(activeSlaveTab) && (
                                <div className="flex items-center justify-center h-full text-slate-400">
                                    此功能正在开发中...
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center w-full h-full text-slate-400">
                        <p>请在左侧选择一个从站设备查看组态</p>
                    </div>
                )}
            </div>

            {/* EDS Library Modal */}
            {showLibraryModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500" />
                                从 EDS 库选择设备
                            </h3>
                            <button onClick={() => setShowLibraryModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            {library.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    EDS 库为空，请先在 "EDS Library" 标签页中导入设备。
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {library.map(entry => (
                                        <div 
                                            key={entry.id} 
                                            className="border border-slate-200 rounded-lg p-4 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all"
                                            onClick={() => {
                                                if (selectedSlaveId) {
                                                    handleUpdateSlave(selectedSlaveId, {
                                                        name: entry.productName,
                                                        vendorId: entry.vendorId,
                                                        deviceType: entry.deviceType,
                                                        productCode: entry.productCode,
                                                        majorRevision: entry.majorRevision,
                                                        minorRevision: entry.minorRevision,
                                                        edsFile: entry.productName,
                                                        params: entry.params,
                                                        connections: entry.connections && entry.connections.length > 0 ? entry.connections.map(c => ({
                                                            id: Math.random().toString(36).substr(2, 9),
                                                            name: c.name,
                                                            rpi: 50,
                                                            o2tSize: c.o2tSize,
                                                            t2oSize: c.t2oSize,
                                                            configSize: c.configSize || 0,
                                                            targetConfigSize: c.targetConfigSize || 0,
                                                            connectionPath: c.path || '20 04 24 78 2C 64 2C 6E',
                                                            o2tData: new Array(c.o2tSize).fill(0),
                                                            t2oData: new Array(c.t2oSize).fill(0),
                                                            configData: new Array(c.targetConfigSize || 0).fill(0),
                                                            o2tDataset: c.o2tDataset && c.o2tDataset.length > 0 ? c.o2tDataset : (c.o2tSize > 0 ? [{ id: Math.random().toString(36).substr(2, 9), name: 'Outputs_Param0', dataType: 'BYTE', bitLength: c.o2tSize * 8, helpString: '' }] : []),
                                                            t2oDataset: c.t2oDataset && c.t2oDataset.length > 0 ? c.t2oDataset : (c.t2oSize > 0 ? [{ id: Math.random().toString(36).substr(2, 9), name: 'Inputs_Param0', dataType: 'BYTE', bitLength: c.t2oSize * 8, helpString: '' }] : []),
                                                            configDataset: c.configDataset || []
                                                        })) : [
                                                            {
                                                                id: Math.random().toString(36).substr(2, 9),
                                                                name: 'Exclusive Owner',
                                                                rpi: 50,
                                                                o2tSize: 4,
                                                                t2oSize: 4,
                                                                configSize: 0,
                                                                connectionPath: '20 04 24 78 2C 64 2C 6E',
                                                                o2tData: new Array(4).fill(0),
                                                                t2oData: new Array(4).fill(0)
                                                            }
                                                        ]
                                                    });
                                                    setShowLibraryModal(false);
                                                    toast.success(`已应用配置: ${entry.productName}`);
                                                }
                                            }}
                                        >
                                            <div className="font-bold text-slate-800 mb-1">{entry.productName}</div>
                                            <div className="text-xs text-slate-500">Vendor ID: {entry.vendorId} | Device Type: {entry.deviceType}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Connection Modal */}
            {showAddConnectionModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded shadow-xl w-[600px] flex flex-col">
                        <div className="p-2 border-b border-slate-200 bg-slate-100 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-800">新建连接</h3>
                            <button onClick={() => setShowAddConnectionModal(false)} className="text-slate-500 hover:text-slate-800">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 flex flex-col gap-4">
                            <div className="flex-1 space-y-4">
                                <label className="flex items-center gap-2 text-xs">
                                    <input type="radio" name="addConnType" checked={addConnectionType === 'generic'} onChange={() => setAddConnectionType('generic')} className="text-indigo-600" />
                                    通用连接(自由配置)
                                </label>
                                {addConnectionType === 'generic' && (
                                    <div className="pl-6 border border-slate-200 bg-slate-50 p-3 rounded">
                                        <div className="text-xs font-bold mb-2">连接路径设置</div>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-xs text-blue-600 font-bold mb-1">
                                                <input type="radio" checked readOnly className="text-blue-600" /> 普通连接
                                            </div>
                                            
                                            <div className="space-y-3 pl-4 text-xs">
                                                <div className="flex items-center gap-4">
                                                    <label className="flex items-center gap-2 font-semibold w-28">
                                                        <input type="checkbox" checked={genericCfg.enabled} onChange={(e) => setGenericCfg({...genericCfg, enabled: e.target.checked})} className="text-indigo-600" />
                                                        组合配置
                                                    </label>
                                                    <div className="flex items-center gap-2">类ID: 16# <input type="text" value={genericCfg.classId} onChange={e => setGenericCfg({...genericCfg, classId: e.target.value})} disabled={!genericCfg.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                    <div className="flex items-center gap-2">实例ID: 16# <input type="text" value={genericCfg.instanceId} onChange={e => setGenericCfg({...genericCfg, instanceId: e.target.value})} disabled={!genericCfg.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                    <div className="flex items-center gap-2 opacity-50">属性ID: 16# <input type="text" value={genericCfg.attributeId} readOnly disabled={!genericCfg.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <label className="flex items-center gap-2 font-semibold w-28">
                                                        <input type="checkbox" checked={genericO2T.enabled} onChange={(e) => setGenericO2T({...genericO2T, enabled: e.target.checked})} className="text-indigo-600" />
                                                        组合消耗(O--&gt;T)
                                                    </label>
                                                    <div className="flex items-center gap-2">类ID: 16# <input type="text" value={genericO2T.classId} onChange={e => setGenericO2T({...genericO2T, classId: e.target.value})} disabled={!genericO2T.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                    <div className="flex items-center gap-2">实例ID: 16# <input type="text" value={genericO2T.instanceId} onChange={e => setGenericO2T({...genericO2T, instanceId: e.target.value})} disabled={!genericO2T.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                    <div className="flex items-center gap-2 opacity-50">属性ID: 16# <input type="text" value={genericO2T.attributeId} readOnly disabled={!genericO2T.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <label className="flex items-center gap-2 font-semibold w-28">
                                                        <input type="checkbox" checked={genericT2O.enabled} onChange={(e) => setGenericT2O({...genericT2O, enabled: e.target.checked})} className="text-indigo-600" />
                                                        组合生产(T--&gt;O)
                                                    </label>
                                                    <div className="flex items-center gap-2">类ID: 16# <input type="text" value={genericT2O.classId} onChange={e => setGenericT2O({...genericT2O, classId: e.target.value})} disabled={!genericT2O.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                    <div className="flex items-center gap-2">实例ID: 16# <input type="text" value={genericT2O.instanceId} onChange={e => setGenericT2O({...genericT2O, instanceId: e.target.value})} disabled={!genericT2O.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                    <div className="flex items-center gap-2 opacity-50">属性ID: 16# <input type="text" value={genericT2O.attributeId} readOnly disabled={!genericT2O.enabled} className="w-12 px-1 border border-slate-300 disabled:bg-slate-100" /></div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200 text-xs">
                                                <div className="font-semibold w-16">连接路径</div>
                                                <input 
                                                    type="text" 
                                                    className="flex-1 px-2 py-1 border border-slate-300 font-mono text-[10px]" 
                                                    value={genericPathStr} 
                                                    onChange={e => {
                                                        setIsGenericPathManual(true);
                                                        setGenericPathStr(e.target.value);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <label className="flex items-center gap-2 text-xs">
                                    <input type="radio" name="addConnType" checked={addConnectionType === 'predefined'} onChange={() => setAddConnectionType('predefined')} className="text-indigo-600" />
                                    预定义连接(EDS文件)
                                </label>
                                
                                {addConnectionType === 'predefined' && (
                                    <div className="pl-6">
                                        <div className="text-xs mb-1">选择一个连接</div>
                                        <div className="border border-slate-300 h-40 overflow-y-auto bg-white">
                                            <table className="w-full text-xs text-left whitespace-nowrap">
                                                <thead className="bg-slate-100 border-b border-slate-300 sticky top-0">
                                                    <tr>
                                                        <th className="px-2 py-1 font-normal border-r border-slate-300">连接名称</th>
                                                        <th className="px-2 py-1 font-normal border-r border-slate-300">O--&gt;T 大小(byte)</th>
                                                        <th className="px-2 py-1 font-normal border-r border-slate-300">T--&gt;O 大小(byte)</th>
                                                        <th className="px-2 py-1 font-normal border-r border-slate-300">代理配置大小(byte)</th>
                                                        <th className="px-2 py-1 font-normal">目标配置大小(byte)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {library.find(e => e.productName === selectedSlave?.edsFile)?.connections?.map((conn, idx) => (
                                                        <tr 
                                                            key={idx} 
                                                            className={`cursor-pointer ${selectedPredefinedConnectionIndex === idx ? "bg-blue-100" : "hover:bg-slate-50"}`}
                                                            onClick={() => setSelectedPredefinedConnectionIndex(idx)}
                                                        >
                                                            <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{conn.name}</td>
                                                            <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{conn.o2tSize}</td>
                                                            <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{conn.t2oSize}</td>
                                                            <td className="px-2 py-1 border-r border-slate-300 border-b border-slate-200">{conn.configSize || 0}</td>
                                                            <td className="px-2 py-1 border-b border-slate-200">0</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50 shrink-0">
                            <button onClick={handleAddConnectionSubmit} className="px-6 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs">确定</button>
                            <button onClick={() => setShowAddConnectionModal(false)} className="px-6 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs">取消</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Slave Modal */}
            {showAddSlaveModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 className="text-sm font-semibold text-slate-800">添加目标设备 (Add Slave)</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-slate-600">添加数量:</label>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="100" 
                                        value={addQuantity} 
                                        onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-16 px-2 py-1 border border-slate-300 rounded text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <button onClick={() => setShowAddSlaveModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <div className="space-y-2">
                                {library.map((entry, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => handleConfirmAddSlave(entry)}
                                        className="p-3 border border-slate-200 rounded hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer transition-colors flex justify-between items-center"
                                    >
                                        <div>
                                            <div className="font-medium text-slate-800">{entry.productName}</div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                Vendor ID: {entry.vendorId} | Device Type: {entry.deviceType} | Product Code: {entry.productCode}
                                            </div>
                                        </div>
                                        <Plus className="w-5 h-5 text-indigo-500 opacity-0 group-hover:opacity-100" />
                                    </div>
                                ))}
                                {library.length === 0 && (
                                    <div className="text-center p-4 text-xs text-slate-500">
                                        EDS库为空，请先在EDS库中导入设备。
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Connection Modal */}
            {showEditConnectionModal && editingConnection && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-50 rounded shadow-xl w-[700px] max-h-[90vh] flex flex-col border border-slate-300">
                        <div className="p-2 border-b border-slate-300 bg-slate-100 flex justify-between items-center shrink-0">
                            <h3 className="text-xs font-bold text-slate-800">编辑连接</h3>
                            <button onClick={() => setShowEditConnectionModal(false)} className="text-slate-500 hover:text-slate-800">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                            <div className="space-y-4">
                                {/* General Params */}
                                <div>
                                    <div className="text-xs font-bold mb-2">通用参数</div>
                                    <div className="grid grid-cols-[100px_1fr] gap-2 items-center mb-2">
                                        <label className="text-xs text-right pr-2">连接路径</label>
                                        <input type="text" value={editingConnection.connectionPath} onChange={e => setEditingConnection({...editingConnection, connectionPath: e.target.value})} className="border border-blue-400 px-2 py-1 text-xs w-full outline-none" />
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr_80px_1fr] gap-2 items-center">
                                        <label className="text-xs text-right pr-2">触发类型</label>
                                        <select value={editingConnection.triggerType || 'Cyclic'} onChange={e => setEditingConnection({...editingConnection, triggerType: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                            <option value="Cyclic">循环的</option>
                                            <option value="Change of State">状态改变</option>
                                            <option value="Application Object">应用对象</option>
                                        </select>
                                        <label className="text-xs text-right pr-2">RPI(ms)</label>
                                        <input type="number" value={editingConnection.rpi} onChange={e => setEditingConnection({...editingConnection, rpi: Number(e.target.value)})} className="border border-slate-300 px-2 py-1 text-xs outline-none" />
                                        
                                        <label className="text-xs text-right pr-2">传输类型</label>
                                        <select value={editingConnection.transportType || 'Exclusive Owner'} onChange={e => setEditingConnection({...editingConnection, transportType: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                            <option value="Exclusive Owner">专有所有者</option>
                                            <option value="Listen Only">仅监听</option>
                                            <option value="Input Only">仅输入</option>
                                        </select>
                                        <label className="text-xs text-right pr-2">超时倍增</label>
                                        <select value={editingConnection.timeoutMultiplier || 4} onChange={e => setEditingConnection({...editingConnection, timeoutMultiplier: Number(e.target.value)})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                            <option value={4}>4</option>
                                            <option value={8}>8</option>
                                            <option value={16}>16</option>
                                            <option value={32}>32</option>
                                            <option value={64}>64</option>
                                            <option value={128}>128</option>
                                            <option value={256}>256</option>
                                            <option value={512}>512</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* O->T */}
                                    <div>
                                        <div className="text-xs font-bold mb-2">扫描到目标(输出)</div>
                                        <div className="grid grid-cols-[120px_1fr] gap-2 items-center mb-4">
                                            <label className="text-xs text-right pr-2">O--&gt;T 大小(Bytes)</label>
                                            <input type="number" value={editingConnection.o2tSize} onChange={e => setEditingConnection({...editingConnection, o2tSize: Number(e.target.value)})} className="border border-blue-400 px-2 py-1 text-xs outline-none" />
                                            <label className="text-xs text-right pr-2">代理配置大小(Bytes)</label>
                                            <input type="number" value={editingConnection.configSize} onChange={e => setEditingConnection({...editingConnection, configSize: Number(e.target.value)})} className="border border-blue-400 px-2 py-1 text-xs outline-none" />
                                            <label className="text-xs text-right pr-2">目标配置大小(Bytes)</label>
                                            <input type="number" value={editingConnection.targetConfigSize || 0} onChange={e => setEditingConnection({...editingConnection, targetConfigSize: Number(e.target.value)})} className="border border-blue-400 px-2 py-1 text-xs outline-none" />
                                        </div>
                                        <div className="grid grid-cols-[120px_1fr] gap-2 items-center">
                                            <label className="text-xs text-right pr-2">连接类型</label>
                                            <select value={editingConnection.o2tConnectionType || 'P2P'} onChange={e => setEditingConnection({...editingConnection, o2tConnectionType: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option value="P2P">点对点</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">连接优先级</label>
                                            <select value={editingConnection.o2tPriority || 'Scheduled'} onChange={e => setEditingConnection({...editingConnection, o2tPriority: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option value="Scheduled">Scheduled</option>
                                                <option value="High">High</option>
                                                <option value="Low">Low</option>
                                                <option value="Urgent">Urgent</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">固定/变量</label>
                                            <select value={editingConnection.o2tFixedVariable || 'Fixed'} onChange={e => setEditingConnection({...editingConnection, o2tFixedVariable: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option value="Fixed">固定</option>
                                                <option value="Variable">变量</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">转换格式</label>
                                            <select className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option>32 Bit 运行/空闲</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">禁止时间(ms)</label>
                                            <input type="number" value={0} disabled className="border border-slate-300 px-2 py-1 text-xs outline-none bg-slate-100" />
                                        </div>
                                    </div>

                                    {/* T->O */}
                                    <div>
                                        <div className="text-xs font-bold mb-2">从目标到扫描(输入)</div>
                                        <div className="grid grid-cols-[120px_1fr] gap-2 items-center mb-4">
                                            <label className="text-xs text-right pr-2">T--&gt;O 大小(字节)</label>
                                            <input type="number" value={editingConnection.t2oSize} onChange={e => setEditingConnection({...editingConnection, t2oSize: Number(e.target.value)})} className="border border-blue-400 px-2 py-1 text-xs outline-none" />
                                        </div>
                                        <div className="mt-[68px] grid grid-cols-[120px_1fr] gap-2 items-center">
                                            <label className="text-xs text-right pr-2">连接类型</label>
                                            <select value={editingConnection.t2oConnectionType || 'P2P'} onChange={e => setEditingConnection({...editingConnection, t2oConnectionType: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option value="P2P">点对点</option>
                                                <option value="Multicast">多播</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">连接优先级</label>
                                            <select value={editingConnection.t2oPriority || 'Scheduled'} onChange={e => setEditingConnection({...editingConnection, t2oPriority: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option value="Scheduled">Scheduled</option>
                                                <option value="High">High</option>
                                                <option value="Low">Low</option>
                                                <option value="Urgent">Urgent</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">固定/变量</label>
                                            <select value={editingConnection.t2oFixedVariable || 'Fixed'} onChange={e => setEditingConnection({...editingConnection, t2oFixedVariable: e.target.value})} className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option value="Fixed">固定</option>
                                                <option value="Variable">变量</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">转换格式</label>
                                            <select className="border border-slate-300 px-2 py-1 text-xs outline-none">
                                                <option>纯数据</option>
                                            </select>
                                            <label className="text-xs text-right pr-2">禁止时间(ms)</label>
                                            <input type="number" value={0} disabled className="border border-slate-300 px-2 py-1 text-xs outline-none bg-slate-100" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50 shrink-0">
                            <button onClick={handleEditConnectionSubmit} className="px-6 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs">确定</button>
                            <button onClick={() => setShowEditConnectionModal(false)} className="px-6 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs">取消</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Error Confirmation Modal */}
            {confirmClearErrorId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                清除掉线报警
                            </h3>
                            <button onClick={() => setConfirmClearErrorId(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4 text-sm text-slate-600">
                            是否确认清除该设备的掉线状态标志？
                        </div>
                        <div className="p-4 flex justify-end gap-2 border-t border-slate-200 bg-slate-50 shrink-0">
                            <button 
                                onClick={() => {
                                    const newSlaves = [...session.scannerConfig.slaves];
                                    const idx = newSlaves.findIndex(s => s.id === confirmClearErrorId);
                                    if (idx >= 0) {
                                        newSlaves[idx] = { ...newSlaves[idx], hasErrorHistory: false };
                                        onUpdate({ scannerConfig: { ...session.scannerConfig, slaves: newSlaves } });
                                    }
                                    setConfirmClearErrorId(null);
                                }} 
                                className="px-6 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs shadow-sm shadow-indigo-200"
                            >
                                确认
                            </button>
                            <button 
                                onClick={() => setConfirmClearErrorId(null)} 
                                className="px-6 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs shadow-sm"
                            >
                                否
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Scan Modal */}
            {showScanModal && (
                <EipClass1ScanModal 
                    library={library} 
                    existingSlaves={session.scannerConfig.slaves}
                    onClose={() => setShowScanModal(false)}
                    onAddDevices={(additions, overwrites) => {
                        const existingSlaves = [...session.scannerConfig.slaves];
                        
                        const newSlaves = additions.map(({device, match}) => {
                            const newSlave: EipClass1Slave = {
                                id: crypto.randomUUID(),
                                name: match ? match.productName : device.productName,
                                ipAddress: device.ipAddress,
                                status: 'Disconnected',
                                vendorId: device.vendorId,
                                deviceType: device.deviceType,
                                productCode: device.productCode,
                                majorRevision: device.majorRevision,
                                minorRevision: device.minorRevision,
                                keyingMode: 'Compatible',
                                checkDeviceType: true,
                                checkVendorId: true,
                                checkProductCode: true,
                                checkMajorRevision: true,
                                checkMinorRevision: false,
                                connections: []
                            };

                            if (match && match.connections && match.connections.length > 0) {
                                const defaultConn = match.connections.find(c => (c.o2tSize || 0) > 0 && c.path && c.path.trim() !== '' && !c.path.includes('Symbolic')) || 
                                                    match.connections.find(c => c.path && c.path.trim() !== '') || 
                                                    match.connections[0];
                                newSlave.connections = defaultConn ? [{
                                    id: crypto.randomUUID(),
                                    name: defaultConn.name,
                                    rpi: 50,
                                    o2tSize: defaultConn.o2tSize,
                                    t2oSize: defaultConn.t2oSize,
                                    configSize: defaultConn.configSize,
                                    targetConfigSize: defaultConn.targetConfigSize,
                                    connectionPath: defaultConn.path,
                                    o2tData: new Array(defaultConn.o2tSize || 0).fill(0),
                                    t2oData: new Array(defaultConn.t2oSize || 0).fill(0),
                                    configData: new Array(defaultConn.targetConfigSize || defaultConn.configSize || 0).fill(0),
                                    o2tDataset: adjustDataset(defaultConn.o2tDataset, defaultConn.o2tSize || 0, 'Outputs_Param0'),
                                    t2oDataset: adjustDataset(defaultConn.t2oDataset, defaultConn.t2oSize || 0, 'Inputs_Param0'),
                                    configDataset: defaultConn.configDataset || [],
                                    triggerType: 'Cyclic',
                                    transportType: 'Exclusive Owner',
                                    timeoutMultiplier: 4,
                                    o2tConnectionType: 'P2P',
                                    o2tPriority: 'Scheduled',
                                    o2tFixedVariable: 'Fixed',
                                    t2oConnectionType: 'P2P',
                                    t2oPriority: 'Scheduled',
                                    t2oFixedVariable: 'Fixed'
                                }] : [];
                            } else {
                                newSlave.connections = [{
                                    id: crypto.randomUUID(),
                                    name: 'Exclusive Owner',
                                    connectionPath: '20 04 24 64 2C 65 2C 66',
                                    transportType: 'Exclusive Owner',
                                    rpi: 50,
                                    o2tSize: 32,
                                    t2oSize: 32,
                                    configSize: 0,
                                    targetConfigSize: 0,
                                    o2tData: new Array(32).fill(0),
                                    t2oData: new Array(32).fill(0),
                                    configData: [],
                                    o2tDataset: adjustDataset([], 32, 'Outputs_Param0'),
                                    t2oDataset: adjustDataset([], 32, 'Inputs_Param0'),
                                    configDataset: [],
                                    triggerType: 'Cyclic',
                                    timeoutMultiplier: 4,
                                    o2tConnectionType: 'P2P',
                                    o2tPriority: 'Scheduled',
                                    o2tFixedVariable: 'Fixed',
                                    t2oConnectionType: 'P2P',
                                    t2oPriority: 'Scheduled',
                                    t2oFixedVariable: 'Fixed'
                                }];
                            }
                            return newSlave;
                        });

                        overwrites.forEach(({device, match, existingId}) => {
                            const idx = existingSlaves.findIndex(s => s.id === existingId);
                            if (idx >= 0) {
                                const oldSlave = existingSlaves[idx];
                                const updatedSlave: EipClass1Slave = {
                                    ...oldSlave,
                                    name: match ? match.productName : device.productName,
                                    ipAddress: device.ipAddress,
                                    vendorId: device.vendorId,
                                    deviceType: device.deviceType,
                                    productCode: device.productCode,
                                    majorRevision: device.majorRevision,
                                    minorRevision: device.minorRevision,
                                };
                                
                                // Optionally we could also replace connections if match is found, but normally overwrite means 
                                // updating the identity. If they want connections replaced, we would do it here.
                                // For now, let's keep existing connections or update if there's a match.
                                if (match && match.connections && match.connections.length > 0) {
                                    const defaultConn = match.connections.find(c => (c.o2tSize || 0) > 0 && c.path && c.path.trim() !== '' && !c.path.includes('Symbolic')) || 
                                                        match.connections.find(c => c.path && c.path.trim() !== '') || 
                                                        match.connections[0];
                                    updatedSlave.connections = defaultConn ? [{
                                        id: crypto.randomUUID(),
                                        name: defaultConn.name,
                                        rpi: 50,
                                        o2tSize: defaultConn.o2tSize,
                                        t2oSize: defaultConn.t2oSize,
                                        configSize: defaultConn.configSize,
                                        targetConfigSize: defaultConn.targetConfigSize,
                                        connectionPath: defaultConn.path,
                                        o2tData: new Array(defaultConn.o2tSize || 0).fill(0),
                                        t2oData: new Array(defaultConn.t2oSize || 0).fill(0),
                                        configData: new Array(defaultConn.targetConfigSize || defaultConn.configSize || 0).fill(0),
                                        o2tDataset: adjustDataset(defaultConn.o2tDataset, defaultConn.o2tSize || 0, 'Outputs_Param0'),
                                        t2oDataset: adjustDataset(defaultConn.t2oDataset, defaultConn.t2oSize || 0, 'Inputs_Param0'),
                                        configDataset: defaultConn.configDataset || [],
                                        triggerType: 'Cyclic',
                                        transportType: 'Exclusive Owner',
                                        timeoutMultiplier: 4,
                                        o2tConnectionType: 'P2P',
                                        o2tPriority: 'Scheduled',
                                        o2tFixedVariable: 'Fixed',
                                        t2oConnectionType: 'P2P',
                                        t2oPriority: 'Scheduled',
                                        t2oFixedVariable: 'Fixed'
                                    }] : [];
                                }
                                
                                existingSlaves[idx] = updatedSlave;
                            }
                        });

                        onUpdate({ 
                            scannerConfig: { 
                                ...session.scannerConfig, 
                                slaves: [...existingSlaves, ...newSlaves] 
                            } 
                        });
                        
                        if (newSlaves.length > 0) {
                            setSelectedSlaveId(newSlaves[0].id);
                        } else if (overwrites.length > 0) {
                            setSelectedSlaveId(overwrites[0].existingId);
                        }
                        
                        setShowScanModal(false);
                    }}
                />
            )}
        </div>
    );
};
