const { parentPort, workerData } = require('worker_threads');
const dgram = require('dgram');
const { performance } = require('perf_hooks');

const { sessionId, config } = workerData;

const socket = dgram.createSocket('udp4');
let running = true;
let sequenceCount = 0;

function ipEquals(ip1, ip2) {
    if (!ip1 || !ip2) return false;
    const clean1 = ip1.replace(/^::ffff:/, '');
    const clean2 = ip2.replace(/^::ffff:/, '');
    return clean1 === clean2;
}

const DATA_TYPES_BITS = {
    'BOOL': 1, 'BYTE': 8, 'SINT': 8, 'USINT': 8, 'INT': 16, 'UINT': 16, 'WORD': 16,
    'DINT': 32, 'UDINT': 32, 'DWORD': 32, 'LINT': 64, 'ULINT': 64, 'LWORD': 64,
    'REAL': 32, 'LREAL': 64
};

function getValueFromBuffer(buffer, offset, bitOffset, dataType) {
    if (!buffer || offset >= buffer.length) return 0;
    const typeBits = DATA_TYPES_BITS[dataType] || 8;
    const typeBytes = Math.ceil(typeBits / 8);
    if (offset + typeBytes > buffer.length) return 0;
    
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, typeBytes);
    try {
        switch (dataType) {
            case 'BOOL':
                return ((buffer[offset] >> bitOffset) & 1);
            case 'SINT':
                return view.getInt8(0);
            case 'USINT':
            case 'BYTE':
                return view.getUint8(0);
            case 'INT':
                return view.getInt16(0, true);
            case 'UINT':
            case 'WORD':
                return view.getUint16(0, true);
            case 'DINT':
                return view.getInt32(0, true);
            case 'UDINT':
            case 'DWORD':
                return view.getUint32(0, true);
            case 'LINT':
                return view.getBigInt64(0, true);
            case 'ULINT':
            case 'LWORD':
                return view.getBigUint64(0, true);
            case 'REAL':
                return view.getFloat32(0, true);
            case 'LREAL':
                return view.getFloat64(0, true);
            default:
                return 0;
        }
    } catch (e) {
        return 0;
    }
}

function writeValueToBuffer(buffer, offset, bitOffset, dataType, value) {
    if (!buffer || offset >= buffer.length) return;
    const typeBits = DATA_TYPES_BITS[dataType] || 8;
    const typeBytes = Math.ceil(typeBits / 8);
    if (offset + typeBytes > buffer.length) return;
    
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, typeBytes);
    try {
        switch (dataType) {
            case 'BOOL':
                const bVal = value ? 1 : 0;
                if (bVal) {
                    buffer[offset] |= (1 << bitOffset);
                } else {
                    buffer[offset] &= ~(1 << bitOffset);
                }
                break;
            case 'SINT':
                view.setInt8(0, Number(value));
                break;
            case 'USINT':
            case 'BYTE':
                view.setUint8(0, Number(value));
                break;
            case 'INT':
                view.setInt16(0, Number(value), true);
                break;
            case 'UINT':
            case 'WORD':
                view.setUint16(0, Number(value), true);
                break;
            case 'DINT':
                view.setInt32(0, Number(value), true);
                break;
            case 'UDINT':
            case 'DWORD':
                view.setUint32(0, Number(value), true);
                break;
            case 'LINT':
                view.setBigInt64(0, BigInt(value), true);
                break;
            case 'ULINT':
            case 'LWORD':
                view.setBigUint64(0, BigInt(value), true);
                break;
            case 'REAL':
                view.setFloat32(0, Number(value), true);
                break;
            case 'LREAL':
                view.setFloat64(0, Number(value), true);
                break;
        }
    } catch (e) {
        // Safe catch
    }
}

let scannerConns = [];
if (config.mode === 'Scanner') {
    for (const s of config.scannerConfig.slaves) {
        const connections = s.connections && s.connections.length > 0 ? s.connections : [s];
        for (const conn of connections) {
            scannerConns.push({
                ip: s.ipAddress,
                connIdStr: conn.id,
                rpi: conn.rpi || 10,
                timeoutMultiplier: conn.timeoutMultiplier || 4,
                o2tSize: conn.o2tSize || 0,
                t2oSize: conn.t2oSize || 0,
                data: Buffer.from(conn.o2tData || []),
                o2tConnId: conn.o2tConnId,
                t2oConnId: conn.t2oConnId,
                isTagConnection: !!conn.connectionType && conn.connectionType === 'TAG',
                nextTick: 0,
                isDropped: conn.isDropped || false,
                lastPayload: null,
                stats: {
                    txPackets: 0, rxPackets: 0, droppedPackets: 0, seqErrors: 0, timeouts: 0,
                    lastRxTime: 0, rxRpiSum: 0, rxRpiCount: 0, rxJitterMax: 0, rxJitterSum: 0,
                    lastTxTime: 0, txRpiSum: 0, txRpiCount: 0, txJitterMax: 0, txJitterSum: 0,
                    lastSeq: -1,
                    startTime: performance.now()
                }
            });
        }
    }
}

let adapterConns = config.mode === 'Adapter' ? config.adapterConfig.connections.map(c => {
    const isTag = c.connectionType === 'TAG';
    return {
        ip: c.targetIp,
        connIdStr: c.id,
        rpi: c.rpi,
        timeoutMultiplier: c.timeoutMultiplier || 4,
        o2tSize: c.o2tSize || 0,
        t2oSize: c.t2oSize || 0,
        data: Buffer.from(c.t2oData || []),
        t2oConnId: c.t2oConnId,
        o2tConnId: c.o2tConnId,
        o2tDataset: c.o2tDataset || [],
        t2oDataset: c.t2oDataset || [],
        loopbackMappings: c.loopbackMappings || [],
        bulkLoopback: c.bulkLoopback || false,
        connectionType: isTag ? 'TAG' : 'IO',
        nextTick: 0,
        isDropped: false,
        lastPayload: null,
        stats: {
            txPackets: 0, rxPackets: 0, droppedPackets: 0, seqErrors: 0, timeouts: 0,
            lastRxTime: 0, rxRpiSum: 0, rxRpiCount: 0, rxJitterMax: 0, rxJitterSum: 0,
            lastTxTime: 0, txRpiSum: 0, txRpiCount: 0, txJitterMax: 0, txJitterSum: 0,
            lastSeq: -1,
            startTime: performance.now()
        }
    };
}) : [];

parentPort.on('message', (msg) => {
    if (msg.type === 'stop') {
        running = false;
        try { socket.close(); } catch(e) {}
        process.exit(0);
    } else if (msg.type === 'updateData') {
        if (config.mode === 'Scanner') {
            const conn = msg.connId ? scannerConns.find(c => c.o2tConnId === msg.connId || c.connIdStr === msg.connId) : scannerConns.find(c => c.ip === msg.targetIp);
            if (conn) {
                conn.data = Buffer.from(msg.dataArray);
                parentPort.postMessage({ type: 'debug', msg: `Updated data for Scanner connId ${msg.connId}, size: ${conn.data.length}` });
            } else {
                parentPort.postMessage({ type: 'debug', msg: `Failed to find Scanner connId ${msg.connId} for updateData` });
            }
        } else {
            const conn = msg.connId ? adapterConns.find(c => c.t2oConnId === msg.connId || c.connIdStr === msg.connId) : adapterConns.find(c => c.ip === msg.targetIp);
            if (conn) {
                conn.data = Buffer.from(msg.dataArray);
                parentPort.postMessage({ type: 'debug', msg: `Updated data for Adapter connId ${msg.connId}, size: ${conn.data.length}` });
            } else {
                parentPort.postMessage({ type: 'debug', msg: `Failed to find Adapter connId ${msg.connId} for updateData` });
            }
        }
    } else if (msg.type === 'updateIds') {
        const conn = config.mode === 'Scanner' 
            ? scannerConns.find(c => c.connIdStr === msg.connIdStr)
            : adapterConns.find(c => c.connIdStr === msg.connIdStr);
        if (conn) {
            conn.ip = msg.ip;
            conn.o2tConnId = msg.o2tConnId;
            conn.t2oConnId = msg.t2oConnId;
            if (msg.rpi) conn.rpi = msg.rpi;
            if (msg.o2tSize !== undefined) conn.o2tSize = msg.o2tSize;
            if (msg.t2oSize !== undefined) conn.t2oSize = msg.t2oSize;
            if (msg.o2tDataset) conn.o2tDataset = msg.o2tDataset;
            if (msg.t2oDataset) conn.t2oDataset = msg.t2oDataset;
            if (msg.loopbackMappings) conn.loopbackMappings = msg.loopbackMappings;
            if (msg.bulkLoopback !== undefined) conn.bulkLoopback = msg.bulkLoopback;
            if (msg.connectionType) conn.connectionType = msg.connectionType;
            conn.isDropped = false;
            
            // Reset timers
            conn.stats.lastRxTime = 0;
            conn.stats.lastTxTime = 0;
            conn.stats.startTime = performance.now();
            conn.nextTick = performance.now();

            parentPort.postMessage({ type: 'debug', msg: `Updated Connection IDs for ${msg.ip} (${msg.connIdStr}), RPI: ${conn.rpi}` });
        }
    }
});

socket.on('message', (msg, rinfo) => {
    // Parse CIP I/O Packet
    if (msg.length >= 20) {
        const itemCount = msg.readUInt16LE(0);
        if (itemCount >= 2) {
            const item1Type = msg.readUInt16LE(2);
            const item1Len = msg.readUInt16LE(4);
            
            let offset = 6 + item1Len;
            if (offset + 4 <= msg.length) {
                const item2Type = msg.readUInt16LE(offset);
                const item2Len = msg.readUInt16LE(offset + 2);
                
                if (item2Type === 0x00B1 && offset + 4 + item2Len <= msg.length) {
                    // Extract 16-bit sequence count from Connected Data Item
                    const seqCount = msg.readUInt16LE(offset + 4);
                    const data = msg.slice(offset + 6, offset + 4 + item2Len);
                    const connId = msg.readUInt32LE(6);
                    
                    const now = performance.now();
                    let conn = null;
                    if (config.mode === 'Scanner') {
                        conn = scannerConns.find(c => ipEquals(c.ip, rinfo.address) && c.t2oConnId === connId);
                    } else {
                        conn = adapterConns.find(c => ipEquals(c.ip, rinfo.address) && c.o2tConnId === connId);
                    }
                    
                    if (!conn) {
                        // Keep a fallback just in case of race condition, but only if there's exactly 1 connection for this IP
                        if (config.mode === 'Scanner') {
                            const ipConns = scannerConns.filter(c => ipEquals(c.ip, rinfo.address));
                            if (ipConns.length === 1 && !ipConns[0].t2oConnId) conn = ipConns[0];
                        } else {
                            const ipConns = adapterConns.filter(c => ipEquals(c.ip, rinfo.address));
                            if (ipConns.length === 1 && !ipConns[0].o2tConnId) conn = ipConns[0];
                        }
                    }
                    
                    let payload = data;
                    if (conn) {
                        const expectedSize = config.mode === 'Scanner' ? conn.t2oSize : conn.o2tSize;
                        const isTag = conn.connectionType === 'TAG';
                        if (isTag) {
                            payload = data.slice(0, expectedSize);
                        } else {
                            if (data.length >= expectedSize + 4) {
                                const header = data.readUInt32LE(0);
                                if (header === 0 || header === 1) {
                                    // 32-bit Run/Idle header present
                                    payload = data.slice(4, 4 + expectedSize);
                                } else {
                                    payload = data.slice(0, expectedSize);
                                }
                            } else if (data.length > expectedSize) {
                                payload = data.slice(0, expectedSize);
                            }
                        }
                    }
                    
                    if (conn) {
                        if (conn.stats) {
                            conn.stats.rxPackets++;
                            if (conn.stats.lastSeq !== -1) {
                                const expectedSeq = (conn.stats.lastSeq + 1) & 0xFFFF;
                                if (seqCount !== expectedSeq) {
                                    let diff = (seqCount - conn.stats.lastSeq) & 0xFFFF;
                                    
                                    // Provide a window for slightly out-of-order or duplicate packets
                                    if (diff === 0) {
                                        // Exactly the same sequence number (duplicate) - do not count as error or drop
                                    } else if (diff > 32768) {
                                        // Negative diff (out of order, late arrival)
                                        conn.stats.seqErrors++;
                                        if ((0xFFFF - diff) < 1000) {
                                            // Packet is realistically delayed (less than 1000 packets late)
                                            // Discard the old packet entirely without updating lastSeq
                                            return;
                                        } else {
                                            // Massive jump backwards (device likely restarted or reset seq count)
                                            // Accept it and allow lastSeq to be updated below
                                        }
                                    } else {
                                        // Positive diff > 1 (missed packets)
                                        conn.stats.seqErrors++;
                                        if (diff < 1000) {
                                            // Calculate how many packets were actually skipped
                                            conn.stats.droppedPackets += (diff - 1);
                                        }
                                    }
                                }
                            }
                            conn.stats.lastSeq = seqCount;
                            
                            if (conn.isDropped) {
                                conn.isDropped = false;
                                parentPort.postMessage({ type: 'connRecovered', connId: conn.connIdStr, ip: conn.ip });
                            }
                            
                            if (conn.stats.lastRxTime > 0) {
                                const actualRpi = now - conn.stats.lastRxTime;
                                conn.stats.rxRpiSum += actualRpi;
                                conn.stats.rxRpiCount++;
                                const jitter = Math.abs(actualRpi - conn.rpi);
                                conn.stats.rxJitterSum += jitter;
                                if (jitter > conn.stats.rxJitterMax) {
                                    conn.stats.rxJitterMax = jitter;
                                }
                            }
                            conn.stats.lastRxTime = now;
                        }

                        // Perform Loopback Copying!
                        let isLoopbackUpdated = false;
                        if (config.mode === 'Adapter') {
                            if (conn.bulkLoopback) {
                                payload.copy(conn.data, 0, 0, Math.min(payload.length, conn.data.length));
                                isLoopbackUpdated = true;
                            } else if (conn.loopbackMappings && conn.loopbackMappings.length > 0) {
                                conn.loopbackMappings.forEach(mapping => {
                                    let srcConn = conn;
                                    if (mapping.sourceConnId && mapping.sourceConnId !== conn.connIdStr) {
                                        srcConn = adapterConns.find(c => c.connIdStr === mapping.sourceConnId);
                                    }
                                    if (!srcConn) return;

                                    const srcVar = srcConn.o2tDataset.find(v => v.id === mapping.sourceId);
                                    const tgtVar = conn.t2oDataset.find(v => v.id === mapping.targetId);
                                    if (srcVar && tgtVar) {
                                        const srcMatch = srcVar.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
                                        const tgtMatch = tgtVar.helpString.match(/Offset:\s*(\d+)B,\s*(\d+)b/);
                                        if (srcMatch && tgtMatch) {
                                            const srcByte = parseInt(srcMatch[1]);
                                            const srcBit = parseInt(srcMatch[2]);
                                            const tgtByte = parseInt(tgtMatch[1]);
                                            const tgtBit = parseInt(tgtMatch[2]);
                                            
                                            const sourceBuffer = (srcConn === conn) ? payload : srcConn.lastPayload;
                                            if (sourceBuffer) {
                                                const val = getValueFromBuffer(sourceBuffer, srcByte, srcBit, srcVar.dataType);
                                                writeValueToBuffer(conn.data, tgtByte, tgtBit, tgtVar.dataType, val);
                                                isLoopbackUpdated = true;
                                            }
                                        }
                                    }
                                });
                            }
                        }

                        // Performance optimization: Only notify UI on CoS (Change of State) or if Loopback executed
                        if (!conn.lastPayload || Buffer.compare(payload, conn.lastPayload) !== 0 || isLoopbackUpdated) {
                            conn.lastPayload = Buffer.from(payload);
                            parentPort.postMessage({
                                type: 'data',
                                ip: rinfo.address,
                                connId: conn.connIdStr,
                                data: Array.from(payload),
                                o2tData: config.mode === 'Scanner' ? Array.from(conn.data) : Array.from(payload),
                                t2oData: config.mode === 'Scanner' ? Array.from(payload) : Array.from(conn.data)
                            });
                        }
                    }
                }
            }
        }
    }
});

socket.on('error', (err) => {
    let errorMsg = err.message;
    if (err.code === 'EADDRINUSE') {
        errorMsg = `UDP Port 2222 is already in use. Please close other EtherNet/IP software.`;
    }
    parentPort.postMessage({ type: 'error', error: errorMsg });
    // Don't close immediately, let the main process handle the error state
});

const bindIp = config.localBindIp && config.localBindIp !== '0.0.0.0' ? config.localBindIp : '0.0.0.0';

socket.bind(2222, bindIp, () => {
    parentPort.postMessage({ type: 'bound' });
    
    const now = performance.now();
    for (const s of scannerConns) s.nextTick = now + (s.rpi || 50);
    for (const c of adapterConns) c.nextTick = now + (c.rpi || 50);

    function loop() {
        if (!running) return;
        
        const currentTime = performance.now();
        let nextWakeup = currentTime + 1000;

        if (config.mode === 'Scanner') {
            for (let i = 0; i < scannerConns.length; i++) {
                const s = scannerConns[i];
                
                // Active check: if neither connection ID is set, it's not active yet
                if (!s.o2tConnId && !s.t2oConnId) {
                    continue;
                }
                
                // Timeout check: only if we have a valid T->O (receive) Connection ID
                if (s.t2oConnId && !s.isDropped && s.stats) {
                    const timeSinceLastRx = currentTime - (s.stats.lastRxTime > 0 ? s.stats.lastRxTime : s.stats.startTime);
                    const timeoutMs = Math.max((s.rpi || 50) * s.timeoutMultiplier, 2000); // CIP specified timeout
                    if (timeSinceLastRx > timeoutMs) {
                        s.isDropped = true;
                        s.stats.timeouts++;
                        parentPort.postMessage({ type: 'connDropped', connId: s.connIdStr, ip: s.ip });
                    }
                }

                // Periodic Tx: only if we have a valid O->T (send) Connection ID
                if (s.o2tConnId && currentTime >= s.nextTick) {
                    if (!s.isDropped) {
                        if (s.stats) {
                            s.stats.txPackets++;
                            if (s.stats.lastTxTime > 0) {
                                const actualTxRpi = currentTime - s.stats.lastTxTime;
                                s.stats.txRpiSum += actualTxRpi;
                                s.stats.txRpiCount++;
                                const jitter = Math.abs(actualTxRpi - (s.rpi || 50));
                                s.stats.txJitterSum += jitter;
                                if (jitter > s.stats.txJitterMax) s.stats.txJitterMax = jitter;
                            }
                            s.stats.lastTxTime = currentTime;
                        }
                        sendImplicit(s, s.ip, s.data, s.o2tConnId, s.o2tSize, true, s.isTagConnection);
                    }
                    s.nextTick += (s.rpi || 50);
                    // Catch up if we fell behind significantly
                    if (currentTime >= s.nextTick) s.nextTick = currentTime + (s.rpi || 50);
                }
                if (s.nextTick < nextWakeup) nextWakeup = s.nextTick;
            }
        } else {
            for (let i = 0; i < adapterConns.length; i++) {
                const c = adapterConns[i];
                
                // Active check: if neither connection ID is set, it's not active yet
                if (!c.o2tConnId && !c.t2oConnId) {
                    continue;
                }
                
                // Timeout check: only if we have a valid O->T (receive) Connection ID and size > 0
                const isTag = c.connectionType === 'TAG';
                if (!isTag && c.o2tConnId && c.o2tSize > 0 && !c.isDropped && c.stats && c.stats.lastRxTime > 0) {
                    const timeSinceLastRx = currentTime - (c.stats.lastRxTime > 0 ? c.stats.lastRxTime : c.stats.startTime);
                    const timeoutMs = Math.max((c.rpi || 50) * c.timeoutMultiplier, 2000);
                    if (timeSinceLastRx > timeoutMs) {
                        c.isDropped = true;
                        c.stats.timeouts++;
                        parentPort.postMessage({ type: 'connDropped', connId: c.connIdStr, ip: c.ip });
                    }
                }

                // Periodic Tx: only if we have a valid T->O (send) Connection ID
                if (c.t2oConnId && currentTime >= c.nextTick) {
                    if (!c.isDropped) {
                        if (c.stats) {
                            c.stats.txPackets++;
                            if (c.stats.lastTxTime > 0) {
                                const actualTxRpi = currentTime - c.stats.lastTxTime;
                                c.stats.txRpiSum += actualTxRpi;
                                c.stats.txRpiCount++;
                                const jitter = Math.abs(actualTxRpi - (c.rpi || 50));
                                c.stats.txJitterSum += jitter;
                                if (jitter > c.stats.txJitterMax) c.stats.txJitterMax = jitter;
                            }
                            c.stats.lastTxTime = currentTime;
                        }
                        const isTag = c.connectionType === 'TAG';
                        sendImplicit(c, c.ip, c.data, c.t2oConnId, c.t2oSize, false, isTag);
                    }
                    c.nextTick += (c.rpi || 50);
                    if (currentTime >= c.nextTick) c.nextTick = currentTime + (c.rpi || 50);
                }
                if (c.nextTick < nextWakeup) nextWakeup = c.nextTick;
            }
        }

        const delay = nextWakeup - performance.now();
        
        // High precision yielding
        // Windows default timer resolution is ~15.6ms. 
        // To ensure accuracy for RPIs < 16ms, we must use setImmediate to spin-wait.
        if (delay > 16) {
            setTimeout(loop, Math.floor(delay) - 16);
        } else {
            setImmediate(loop);
        }
    }
    
    loop();

    // Stats reporting interval
    setInterval(() => {
        if (!running) return;
        const statsData = {};
        const conns = config.mode === 'Scanner' ? scannerConns : adapterConns;
        
        for (const conn of conns) {
            if (!conn.stats) continue;
            const id = conn.connIdStr;
            const avgRxRpi = conn.stats.rxRpiCount > 0 ? (conn.stats.rxRpiSum / conn.stats.rxRpiCount) : 0;
            const avgTxRpi = conn.stats.txRpiCount > 0 ? (conn.stats.txRpiSum / conn.stats.txRpiCount) : 0;
            
            const avgRxJitter = conn.stats.rxRpiCount > 0 ? (conn.stats.rxJitterSum / conn.stats.rxRpiCount) : 0;
            const avgTxJitter = conn.stats.txRpiCount > 0 ? (conn.stats.txJitterSum / conn.stats.txRpiCount) : 0;
            
            const uptimeSecs = Math.floor((performance.now() - conn.stats.startTime) / 1000);
            const hours = Math.floor(uptimeSecs / 3600).toString().padStart(2, '0');
            const mins = Math.floor((uptimeSecs % 3600) / 60).toString().padStart(2, '0');
            const secs = (uptimeSecs % 60).toString().padStart(2, '0');
            
            statsData[id] = {
                txPackets: conn.stats.txPackets,
                rxPackets: conn.stats.rxPackets,
                droppedPackets: conn.stats.droppedPackets,
                seqErrors: conn.stats.seqErrors,
                timeouts: conn.stats.timeouts,
                isDropped: conn.isDropped,
                rxJitterAvg: avgRxJitter.toFixed(1),
                rxJitterMax: conn.stats.rxJitterMax.toFixed(1),
                rxActualRpi: avgRxRpi.toFixed(1),
                txJitterAvg: avgTxJitter.toFixed(1),
                txJitterMax: conn.stats.txJitterMax.toFixed(1),
                txActualRpi: avgTxRpi.toFixed(1),
                uptime: `${hours}:${mins}:${secs}`
            };
            
            // Reset RPI accumulators for next interval to get moving average
            conn.stats.rxRpiSum = 0;
            conn.stats.rxRpiCount = 0;
            conn.stats.rxJitterSum = 0;
            
            conn.stats.txRpiSum = 0;
            conn.stats.txRpiCount = 0;
            conn.stats.txJitterSum = 0;
        }
        
        parentPort.postMessage({
            type: 'stats',
            stats: statsData
        });
    }, 1000);
});

function sendImplicit(conn, targetIp, dataBuffer, connId, configuredSize, isScanner, isTagConnection = false) {
    conn.sequenceCount = ((conn.sequenceCount || 0) + 1) % 0xFFFFFFFF;
    const sequenceCount = conn.sequenceCount;
    
    // Use configured size directly, no artificial 4-byte alignment
    const actualDataSize = configuredSize || 0;
    
    // For Scanner O->T, we must prepend a 32-bit Run/Idle header, UNLESS it's a Tag connection
    const hasRunIdleHeader = isScanner && !isTagConnection;
    const payloadSize = (hasRunIdleHeader ? 4 : 0) + actualDataSize;
    
    const has16BitSeqCount = true;
    const item2HeaderSize = 6;
    
    const packet = Buffer.alloc(14 + item2HeaderSize + payloadSize);
    packet.writeUInt16LE(2, 0); // Item Count
    
    // Item 1
    packet.writeUInt16LE(0x8002, 2); // Type ID
    packet.writeUInt16LE(8, 4); // Length
    packet.writeUInt32LE(connId || 0, 6); // Connection ID
    packet.writeUInt32LE(sequenceCount, 10); // Sequence Number
    
    // Item 2
    packet.writeUInt16LE(0x00B1, 14); // Type ID
    packet.writeUInt16LE((has16BitSeqCount ? 2 : 0) + payloadSize, 16); // Length
    
    let dataOffset = 18;
    if (has16BitSeqCount) {
        packet.writeUInt16LE(sequenceCount & 0xFFFF, 18); // 16-bit Sequence Count
        dataOffset += 2;
    }
    
    if (hasRunIdleHeader) {
        packet.writeUInt32LE(0x00000001, dataOffset); // 1 = Run
        dataOffset += 4;
    }
    
    if (dataBuffer.length > 0 && actualDataSize > 0) {
        dataBuffer.copy(packet, dataOffset, 0, Math.min(dataBuffer.length, actualDataSize));
    }
    
    try {
        socket.send(packet, 2222, targetIp);
        // Send debug info to parent every 100 packets to avoid flooding
        if (sequenceCount % 100 === 0) {
            parentPort.postMessage({ type: 'debug', msg: `Sent O->T packet to ${targetIp}:2222 (ConnID: 0x${(connId || 0).toString(16)}, Size: ${packet.length})` });
        }
    } catch (err) {
        parentPort.postMessage({ type: 'debug', msg: `UDP Send Error to ${targetIp}: ${err.message}` });
    }
}
