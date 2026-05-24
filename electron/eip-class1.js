const { ipcMain } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const net = require('net');
const { performance } = require('perf_hooks');

const sessions = new Map();

class ForwardOpenBuilder {
    constructor() {
        this.priorityTimeTick = 0x0A;
        this.timeoutTicks = 0x0A;
        this.o2tConnId = 0;
        this.t2oConnId = 0;
        this.connSerial = Math.floor(Math.random() * 0xFFFF) || 1;
        this.vendorId = 0x0001;
        this.originatorSerial = Math.floor(Math.random() * 0xFFFFFFFF) || 1;
        this.timeoutMultiplier = 2; // Default 16
        this.o2tRpi = 0;
        
        // Internal variables to keep track of full properties
        this.o2tActualSize = 0;
        this.o2tFlags = 0; // Will hold priority/type abstractly
        this.t2oActualSize = 0;
        this.t2oFlags = 0;
        
        this.o2tParams = 0x4800; // Default P2P, Scheduled
        this.t2oRpi = 0;
        this.t2oParams = 0x4800; // Default P2P, Scheduled
        this.transportTrigger = 0x01; // Cyclic
        this.connectionPath = Buffer.alloc(0);
    }

    setO2TConnectionId(id) { this.o2tConnId = id; return this; }
    setT2OConnectionId(id) { this.t2oConnId = id; return this; }
    setConnectionSerialNumber(serial) { this.connSerial = serial; return this; }
    setOriginatorVendorId(vid) { this.vendorId = vid; return this; }
    setOriginatorSerialNumber(serial) { this.originatorSerial = serial; return this; }
    
    setTimeoutMultiplier(multValue) {
        if (multValue === 4) this.timeoutMultiplier = 0;
        else if (multValue === 8) this.timeoutMultiplier = 1;
        else if (multValue === 16) this.timeoutMultiplier = 2;
        else if (multValue === 32) this.timeoutMultiplier = 3;
        else if (multValue === 64) this.timeoutMultiplier = 4;
        else if (multValue === 128) this.timeoutMultiplier = 5;
        else if (multValue === 256) this.timeoutMultiplier = 6;
        else if (multValue === 512) this.timeoutMultiplier = 7;
        else this.timeoutMultiplier = 2; // Default to 16
        return this;
    }

    setTransportTrigger(triggerStr, transportStr) {
        let trigger = 0; // Cyclic
        if (triggerStr === 'Change of State') trigger = 1;
        else if (triggerStr === 'Application Object') trigger = 2;
        
        // Direction is Client (0), Class is 1
        this.transportTrigger = (trigger << 4) | 0x01;
        return this;
    }

    setO2TRPI(rpiMicroseconds) { this.o2tRpi = rpiMicroseconds; return this; }
    setT2ORPI(rpiMicroseconds) { this.t2oRpi = rpiMicroseconds; return this; }
    
    setO2TParams(size, isTagConnection, connType, priority, fixedVar) {
        let connSize = size + (isTagConnection ? 0 : 4);
        this.o2tActualSize = connSize;
        let flags16 = 0;
        let flags32 = 0; // For Large Fwd Open
        
        // Priority
        if (priority === 'Low') { flags16 |= 0x0000; flags32 |= 0x00000000; }
        else if (priority === 'High') { flags16 |= 0x0400; flags32 |= 0x04000000; }
        else if (priority === 'Urgent') { flags16 |= 0x0C00; flags32 |= 0x0C000000; }
        else { flags16 |= 0x0800; flags32 |= 0x08000000; }
        
        // Variable/Fixed
        if (fixedVar === 'Variable') { flags16 |= 0x0200; flags32 |= 0x02000000; }
        
        // Type
        if (connType === 'Multicast') { flags16 |= 0x2000; flags32 |= 0x10000000; } // Wait, Multicast 16-bit: 0x2000 (1 << 13). 32-bit: 0x10000000 (1 << 28)
        else if (connType === 'Null') { flags16 |= 0x0000; flags32 |= 0x00000000; }
        else { flags16 |= 0x4000; flags32 |= 0x20000000; } // P2P
        
        this.o2tParams16 = flags16 | (connSize & 0x01FF);
        this.o2tParams32 = flags32 | (connSize & 0xFFFF);
        return this;
    }

    setT2OParams(size, isTagConnection, connType, priority, fixedVar) {
        let connSize = size;
        this.t2oActualSize = connSize;
        let flags16 = 0;
        let flags32 = 0;
        
        // Priority
        if (priority === 'Low') { flags16 |= 0x0000; flags32 |= 0x00000000; }
        else if (priority === 'High') { flags16 |= 0x0400; flags32 |= 0x04000000; }
        else if (priority === 'Urgent') { flags16 |= 0x0C00; flags32 |= 0x0C000000; }
        else { flags16 |= 0x0800; flags32 |= 0x08000000; }
        
        // Variable/Fixed
        if (fixedVar === 'Variable') { flags16 |= 0x0200; flags32 |= 0x02000000; }
        
        // Type
        if (connType === 'Multicast') { flags16 |= 0x2000; flags32 |= 0x10000000; }
        else if (connType === 'Null') { flags16 |= 0x0000; flags32 |= 0x00000000; }
        else { flags16 |= 0x4000; flags32 |= 0x20000000; }
        
        this.t2oParams16 = flags16 | (connSize & 0x01FF);
        this.t2oParams32 = flags32 | (connSize & 0xFFFF);
        return this;
    }

    setConnectionPath(pathBuffer) {
        this.connectionPath = pathBuffer;
        return this;
    }

    build() {
        // Decide whether to use Large Forward Open (0x5B) or Standard (0x54)
        const isLarge = this.o2tActualSize > 511 || this.t2oActualSize > 511;
        const cipLength = isLarge ? (46 + this.connectionPath.length) : (42 + this.connectionPath.length);
        const cip = Buffer.alloc(cipLength);
        let offset = 0;
        
        cip.writeUInt8(isLarge ? 0x5B : 0x54, offset++); // Service
        cip.writeUInt8(2, offset++); // Path Size (words)
        cip.writeUInt8(0x20, offset++); // Class Segment
        cip.writeUInt8(0x06, offset++); // Class 6 (Connection Manager)
        cip.writeUInt8(0x24, offset++); // Instance Segment
        cip.writeUInt8(0x01, offset++); // Instance 1
        
        cip.writeUInt8(this.priorityTimeTick, offset++);
        cip.writeUInt8(this.timeoutTicks, offset++);
        
        cip.writeUInt32LE(this.o2tConnId, offset); offset += 4;
        cip.writeUInt32LE(this.t2oConnId, offset); offset += 4;
        
        cip.writeUInt16LE(this.connSerial, offset); offset += 2;
        cip.writeUInt16LE(this.vendorId, offset); offset += 2;
        cip.writeUInt32LE(this.originatorSerial, offset); offset += 4;
        
        cip.writeUInt8(this.timeoutMultiplier, offset++);
        cip.writeUInt8(0, offset++); // Reserved
        cip.writeUInt16LE(0, offset); offset += 2; // Reserved
        
        cip.writeUInt32LE(this.o2tRpi, offset); offset += 4;
        if (isLarge) {
            cip.writeUInt32LE(this.o2tParams32, offset); offset += 4;
        } else {
            cip.writeUInt16LE(this.o2tParams16, offset); offset += 2;
        }
        
        cip.writeUInt32LE(this.t2oRpi, offset); offset += 4;
        if (isLarge) {
            cip.writeUInt32LE(this.t2oParams32, offset); offset += 4;
        } else {
            cip.writeUInt16LE(this.t2oParams16, offset); offset += 2;
        }
        
        cip.writeUInt8(this.transportTrigger, offset++);
        cip.writeUInt8(Math.ceil(this.connectionPath.length / 2), offset++); // Connection Path Size (words)
        
        this.connectionPath.copy(cip, offset);
        
        return cip;
    }
}

class ForwardOpenClient {
    constructor(ip, options) {
        this.ip = ip;
        this.options = options; // { rpi, o2tSize, t2oSize, configSize, path }
        this.sessionHandle = 0;
        this.socket = new net.Socket();
        this.t2oConnId = Math.floor(Math.random() * 0x7FFFFFF0) + 1000;
        this.o2tConnId = this.t2oConnId + 1;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            let isResolved = false;
            let connectTimer = null;
            
            // Re-create the socket so connect can be called multiple times
            if (this.socket && !this.socket.destroyed) {
                try { this.socket.destroy(); } catch(e) {}
            }
            this.socket = new net.Socket();
            
            const cleanupAndReject = (err) => {
                if (isResolved) return;
                isResolved = true;
                if (connectTimer) clearTimeout(connectTimer);
                try { this.socket.destroy(); } catch (e) {}
                reject(err);
            };

            connectTimer = setTimeout(() => cleanupAndReject(new Error("TCP Timeout")), 3000);

            this.socket.setTimeout(3000);
            this.socket.on('error', cleanupAndReject);
            this.socket.on('timeout', () => cleanupAndReject(new Error("TCP Timeout")));
            
            this.socket.connect(44818, this.ip, async () => {
                if (isResolved) return;
                try {
                    await this.registerSession();
                    await this.forwardOpen();
                    if (!isResolved) {
                        isResolved = true;
                        if (connectTimer) clearTimeout(connectTimer);
                        resolve({ o2tConnId: this.o2tConnId, t2oConnId: this.t2oConnId });
                    }
                } catch (e) {
                    cleanupAndReject(e);
                }
            });
        });
    }

    async registerSession() {
        return new Promise((resolve, reject) => {
            const req = Buffer.alloc(28);
            req.writeUInt16LE(0x0065, 0); // Register Session
            req.writeUInt16LE(4, 2); // Length
            req.writeUInt16LE(1, 24); // Protocol Version
            req.writeUInt16LE(0, 26); // Options

            this.socket.once('data', (data) => {
                if (data.length >= 24 && data.readUInt16LE(0) === 0x0065 && data.readUInt32LE(8) === 0) {
                    this.sessionHandle = data.readUInt32LE(4);
                    resolve();
                } else {
                    reject(new Error("Register Session Failed"));
                }
            });
            this.socket.write(req);
        });
    }

    async forwardOpen() {
        return new Promise((resolve, reject) => {
            // Parse connection path string (e.g., "20 04 24 78 2C 64 2C 6E")
            let pathBytes = Buffer.from([0x20, 0x04, 0x24, 0x64, 0x2C, 0x65, 0x2C, 0x66]); // Default
            let isTagConnection = false;
            if (this.options.path && typeof this.options.path === 'string') {
                const pathStr = this.options.path.trim();
                if (/^([0-9A-Fa-f]{2}\s*)+$/.test(pathStr)) {
                    const parts = pathStr.split(/\s+/);
                    const bytes = parts.map(p => parseInt(p, 16)).filter(n => !isNaN(n));
                    if (bytes.length > 0 && bytes.length % 2 === 0) {
                        pathBytes = Buffer.from(bytes);
                    }
                } else if (pathStr.length > 0) {
                    // Tag connection (ANSI Extended Symbol Segment)
                    isTagConnection = true;
                    const tagBuf = Buffer.from(pathStr, 'utf8');
                    const segmentLen = 2 + tagBuf.length + (tagBuf.length % 2 !== 0 ? 1 : 0);
                    pathBytes = Buffer.alloc(segmentLen);
                    pathBytes.writeUInt8(0x91, 0); // ANSI Extended Symbol Segment
                    pathBytes.writeUInt8(tagBuf.length, 1); // Length of string
                    tagBuf.copy(pathBytes, 2);
                }
            }
            
            // Prepend Electronic Keying if enabled
            if (this.options.keyingMode === 'Exact' || this.options.keyingMode === 'Compatible') {
                const keyingSegment = Buffer.alloc(10);
                keyingSegment.writeUInt8(0x34, 0); // Electronic Key Segment (0x34)
                keyingSegment.writeUInt8(0x04, 1); // Key Format (4)
                keyingSegment.writeUInt16LE(this.options.vendorId || 0, 2);
                keyingSegment.writeUInt16LE(this.options.deviceType || 0, 4);
                keyingSegment.writeUInt16LE(this.options.productCode || 0, 6);
                
                const majorRev = (this.options.majorRevision || 1) & 0x7F;
                const compatBit = this.options.keyingMode === 'Compatible' ? 0x80 : 0x00;
                keyingSegment.writeUInt8(compatBit | majorRev, 8);
                keyingSegment.writeUInt8(this.options.minorRevision || 1, 9);
                
                pathBytes = Buffer.concat([keyingSegment, pathBytes]);
            }
            
            const builder = new ForwardOpenBuilder()
                .setO2TConnectionId(this.o2tConnId)
                .setT2OConnectionId(this.t2oConnId)
                .setOriginatorVendorId(this.options.vendorId || 0x0001)
                .setTimeoutMultiplier(this.options.timeoutMultiplier || 4)
                .setTransportTrigger(this.options.triggerType || 'Cyclic', this.options.transportType || 'Exclusive Owner')
                .setO2TRPI(this.options.rpi * 1000)
                .setT2ORPI(this.options.rpi * 1000)
                .setO2TParams(this.options.o2tSize, isTagConnection, this.options.o2tConnectionType || 'Point-to-Point', this.options.o2tPriority || 'Scheduled', this.options.o2tFixedVariable || 'Fixed')
                .setT2OParams(this.options.t2oSize, isTagConnection, this.options.t2oConnectionType || 'Point-to-Point', this.options.t2oPriority || 'Scheduled', this.options.t2oFixedVariable || 'Fixed')
                .setConnectionPath(pathBytes);
                
            this.connSerial = builder.connSerial;
            this.originatorVendorId = builder.vendorId;
            this.originatorSerial = builder.originatorSerial;
            this.connectionPath = pathBytes;

            const cip = builder.build();

            // Build ENIP SendRRData
            const enip = Buffer.alloc(24 + 16 + cip.length);
            enip.writeUInt16LE(0x006F, 0); // SendRRData
            enip.writeUInt16LE(16 + cip.length, 2); // Length
            enip.writeUInt32LE(this.sessionHandle, 4);
            
            enip.writeUInt32LE(0, 24); // Interface Handle
            enip.writeUInt16LE(0, 28); // Timeout
            enip.writeUInt16LE(2, 30); // Item Count
            enip.writeUInt16LE(0x0000, 32); // Null Address Item
            enip.writeUInt16LE(0, 34);
            enip.writeUInt16LE(0x00B2, 36); // Unconnected Data Item
            enip.writeUInt16LE(cip.length, 38);
            cip.copy(enip, 40);

            this.socket.once('data', (data) => {
                if (data.length >= 44 && data.readUInt32LE(8) === 0) {
                    const cipStatus = data.readUInt8(42);
                    if (cipStatus === 0x00) {
                        // Extract actual Connection IDs from the response by parsing ENIP items
                        let o2t = this.o2tConnId;
                        let t2o = this.t2oConnId;
                        try {
                            if (data.length >= 40) {
                                const itemCount = data.readUInt16LE(30);
                                let offset = 32;
                                for (let i = 0; i < itemCount; i++) {
                                    if (offset + 4 > data.length) break;
                                    const itemType = data.readUInt16LE(offset);
                                    const itemLength = data.readUInt16LE(offset + 2);
                                    offset += 4;
                                    
                                    if (itemType === 0x00B2 && offset + itemLength <= data.length) { // Unconnected Data Item
                                        const service = data.readUInt8(offset);
                                        if (service === 0xD4) { // Forward Open Response
                                            const extStatusSize = data.readUInt8(offset + 3);
                                            const dataOffset = offset + 4 + extStatusSize * 2;
                                            if (dataOffset + 8 <= offset + itemLength) {
                                                o2t = data.readUInt32LE(dataOffset);
                                                t2o = data.readUInt32LE(dataOffset + 4);
                                            }
                                        }
                                    }
                                    offset += itemLength;
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing Forward Open Response:", e);
                        }
                        
                        this.o2tConnId = o2t;
                        this.t2oConnId = t2o;
                        resolve({ o2tConnId: this.o2tConnId, t2oConnId: this.t2oConnId });
                    } else {
                        // Extract extended status if available
                        let extStatus = '';
                        let extStatusCode = 0;
                        if (data.length >= 46) {
                            const extStatusSize = data.readUInt8(43);
                            if (extStatusSize > 0 && data.length >= 44 + extStatusSize * 2) {
                                extStatusCode = data.readUInt16LE(44);
                                extStatus = ` (Ext: 0x${extStatusCode.toString(16).padStart(4, '0')})`;
                            }
                        }
                        
                        let errorMessage = `Forward Open Failed with CIP Status 0x${cipStatus.toString(16).padStart(2, '0')}${extStatus}`;
                        
                        if (cipStatus === 0x01) {
                            const extMap = {
                                0x0100: "Connection in use or duplicate Forward Open",
                                0x0103: "Transport Class and Trigger unsupported",
                                0x0106: "Ownership Conflict",
                                0x0107: "Connection not found at target",
                                0x0108: "Invalid network connection parameter",
                                0x0109: "Invalid connection size",
                                0x0110: "Target for connection not configured",
                                0x0111: "RPI not supported",
                                0x0113: "Connection Manager cannot support any more connections",
                                0x0114: "Vendor Id or Product Code mismatch",
                                0x0115: "Device Type mismatch",
                                0x0116: "Revision mismatch",
                                0x0118: "Configuration size format invalid",
                                0x0127: "Invalid O->T size",
                                0x0128: "Invalid T->O size",
                                0x012A: "Invalid O->T application path",
                                0x012B: "Invalid T->O application path",
                                0x0203: "Connection timed out",
                                0x0204: "Unconnected request timed out",
                                0x0205: "Parameter error in unconnected request",
                                0x0206: "Message too large for unconnected message",
                                0x0301: "No buffer memory available",
                                0x0311: "Port not available",
                                0x0312: "Link address not valid",
                                0x0315: "Invalid segment in connection path",
                                0x0318: "Path target object cannot be connected",
                            };
                            if (extMap[extStatusCode]) {
                                errorMessage = `Connection failure, Extended: ${extMap[extStatusCode]}`;
                            } else {
                                errorMessage = `Connection failure, Extended status: 0x${extStatusCode.toString(16).padStart(4, '0')}`;
                            }
                        } else if (cipStatus === 0x08) {
                            errorMessage = "Service not supported";
                        } else if (cipStatus === 0x11) {
                            errorMessage = "Reply data too large";
                        }
                        
                        reject(new Error(errorMessage));
                    }
                } else {
                    reject(new Error("Invalid Forward Open Response"));
                }
            });
            this.socket.write(enip);
        });
    }

    async forwardClose() {
        return new Promise((resolve, reject) => {
            if (!this.sessionHandle || !this.connectionPath) {
                return resolve(); // Nothing to close or not opened successfully
            }
            
            const cipLength = 18 + this.connectionPath.length;
            const cip = Buffer.alloc(cipLength);
            let offset = 0;
            
            cip.writeUInt8(0x4E, offset++); // Forward Close Service
            cip.writeUInt8(2, offset++); // Path Size (words) - Connection Manager
            cip.writeUInt8(0x20, offset++); // Class Segment
            cip.writeUInt8(0x06, offset++); // Class 6 (Connection Manager)
            cip.writeUInt8(0x24, offset++); // Instance Segment
            cip.writeUInt8(0x01, offset++); // Instance 1
            
            cip.writeUInt8(0x01, offset++); // Priority/Time_Tick
            cip.writeUInt8(0x0E, offset++); // Timeout_ticks
            
            cip.writeUInt16LE(this.connSerial || 0, offset); offset += 2;
            cip.writeUInt16LE(this.originatorVendorId || 0, offset); offset += 2;
            cip.writeUInt32LE(this.originatorSerial || 0, offset); offset += 4;
            
            cip.writeUInt8(this.connectionPath.length / 2, offset++); // Connection Path Size
            cip.writeUInt8(0, offset++); // Reserved
            
            this.connectionPath.copy(cip, offset);
            
            // Build ENIP SendRRData
            const enip = Buffer.alloc(24 + 16 + cip.length);
            enip.writeUInt16LE(0x006F, 0); // SendRRData
            enip.writeUInt16LE(16 + cip.length, 2); // Length
            enip.writeUInt32LE(this.sessionHandle, 4);
            
            enip.writeUInt32LE(0, 24); // Interface Handle
            enip.writeUInt16LE(0, 28); // Timeout
            enip.writeUInt16LE(2, 30); // Item Count
            enip.writeUInt16LE(0, 32); // Null Address Type
            enip.writeUInt16LE(0, 34); // Null Address Length
            enip.writeUInt16LE(0xB2, 36); // Unconnected Data Item
            enip.writeUInt16LE(cip.length, 38); // CIP Length
            
            cip.copy(enip, 40);
            
            this.socket.once('data', (data) => {
                resolve(); // Don't care if it fails, just wait for response
            });
            
            this.socket.write(enip);
            
            // Timeout if no response
            setTimeout(() => resolve(), 500); 
        });
    }

    async close() {
        try { 
            if (this.socket && !this.socket.destroyed) {
                await this.forwardClose();
                this.socket.destroy(); 
            }
        } catch (e) {}
    }
}

class EipClass1Node {
    constructor(sessionId, config, sendToWindow) {
        this.sessionId = sessionId;
        this.config = config;
        this.sendToWindow = sendToWindow;
        this.worker = null;
        this.lastIpcSent = new Map();
        this.tcpClients = [];
        this.tcpServer = null; // TCP Server for Adapter mode
        this.activeSockets = [];
    }

    async start() {
        const cleanup = () => {
            if (this.worker) {
                this.worker.postMessage({ type: 'stop' });
                this.worker.terminate();
                this.worker = null;
            }
            if (this.tcpClients) {
                for (const client of this.tcpClients) {
                    try { client.close(); } catch(e) {}
                }
                this.tcpClients = [];
            }
            if (this.tcpServer) {
                try { this.tcpServer.close(); } catch(e) {}
                this.tcpServer = null;
            }
            if (this.activeSockets) {
                for (const socket of this.activeSockets) {
                    try { socket.destroy(); } catch(e) {}
                }
                this.activeSockets = [];
            }
        };

        try {
            console.log(`[EIP-Class1-${this.sessionId}] Starting session in ${this.config.mode} mode...`);
            
            // Perform Forward Open for Scanner mode
            if (this.config.mode === 'Scanner') {
                if (!this.config.scannerConfig || !this.config.scannerConfig.slaves) {
                    throw new Error("Scanner configuration is missing or invalid.");
                }

                const connectionPromises = [];

                for (const slave of this.config.scannerConfig.slaves) {
                    const connections = slave.connections && slave.connections.length > 0 ? slave.connections : [slave];
                    
                    for (const conn of connections) {
                        const client = new ForwardOpenClient(slave.ipAddress, {
                            rpi: conn.rpi || 10,
                            o2tSize: conn.o2tSize !== undefined ? conn.o2tSize : 32,
                            t2oSize: conn.t2oSize !== undefined ? conn.t2oSize : 32,
                            path: conn.connectionPath,
                            vendorId: slave.vendorId,
                            keyingMode: slave.keyingMode,
                            deviceType: slave.deviceType,
                            productCode: slave.productCode,
                            majorRevision: slave.majorRevision,
                            minorRevision: slave.minorRevision,
                            triggerType: conn.triggerType,
                            transportType: conn.transportType,
                            timeoutMultiplier: conn.timeoutMultiplier,
                            o2tConnectionType: conn.o2tConnectionType,
                            o2tPriority: conn.o2tPriority,
                            o2tFixedVariable: conn.o2tFixedVariable,
                            t2oConnectionType: conn.t2oConnectionType,
                            t2oPriority: conn.t2oPriority,
                            t2oFixedVariable: conn.t2oFixedVariable
                        });
                        
                        const connectPromise = (async () => {
                            try {
                                console.log(`[EIP-Class1-${this.sessionId}] Initiating Forward Open to ${slave.ipAddress} (Conn: ${conn.name})...`);
                                const connIds = await client.connect();
                                console.log(`[EIP-Class1-${this.sessionId}] Forward Open successful for ${slave.ipAddress} (Conn: ${conn.name})`, connIds);
                                this.tcpClients.push(client);
                                conn.o2tConnId = connIds.o2tConnId;
                                conn.t2oConnId = connIds.t2oConnId;
                                conn.isDropped = false;
                                slave.status = 'Connected';
                            } catch (e) {
                                console.error(`[EIP-Class1-${this.sessionId}] Forward Open failed for ${slave.ipAddress} (Conn: ${conn.name}):`, e.message);
                                conn.isDropped = true;
                                slave.status = 'Error';
                                slave.lastError = e.message;
                                
                                // Schedule a reconnect attempt shortly after worker starts
                                setTimeout(() => {
                                    this.sendToWindow('eip-class1:conn-dropped', { sessionId: this.sessionId, ip: slave.ipAddress, connId: conn.id, reason: e.message });
                                    this.attemptReconnect(slave.ipAddress, conn.id);
                                }, 1000);
                            }
                        })();
                        
                        connectionPromises.push(connectPromise);
                    }
                }
                
                await Promise.all(connectionPromises);
            } 
            // NEW: Active TCP Port 44818 Server for Adapter Mode (Production level)
            else if (this.config.mode === 'Adapter') {
                const localBindIp = this.config.localBindIp && this.config.localBindIp !== '0.0.0.0' ? this.config.localBindIp : '0.0.0.0';
                
                this.tcpServer = net.createServer((socket) => {
                    this.activeSockets.push(socket);
                    socket.on('close', () => {
                        const idx = this.activeSockets.indexOf(socket);
                        if (idx >= 0) this.activeSockets.splice(idx, 1);
                    });
                    
                    const remoteIp = socket.remoteAddress ? socket.remoteAddress.replace(/^::ffff:/, '') : '';
                    let registeredSession = 0;
                    let rxBuffer = Buffer.alloc(0);
                    
                    socket.on('data', (rawData) => {
                        try {
                            rxBuffer = Buffer.concat([rxBuffer, rawData]);
                            
                            while (rxBuffer.length >= 24) {
                                const length = rxBuffer.readUInt16LE(2);
                                const totalPacketLength = 24 + length;
                                
                                if (rxBuffer.length < totalPacketLength) {
                                    break; // Wait for more data
                                }
                                
                                const data = rxBuffer.slice(0, totalPacketLength);
                                rxBuffer = rxBuffer.slice(totalPacketLength);
                                
                                const command = data.readUInt16LE(0);
                                
                                // 0. List Services (0x0004)
                                if (command === 0x0004) {
                                    const resp = Buffer.alloc(24 + 26);
                                    resp.writeUInt16LE(0x0004, 0);
                                    resp.writeUInt16LE(26, 2);
                                    resp.writeUInt32LE(0, 4);
                                    resp.writeUInt32LE(0, 8);
                                    data.copy(resp, 12, 12, 20);
                                    resp.writeUInt32LE(0, 20);
                                    resp.writeUInt16LE(1, 24);
                                    resp.writeUInt16LE(0x0100, 26);
                                    resp.writeUInt16LE(22, 28);
                                    resp.writeUInt16LE(1, 30);
                                    resp.writeUInt16LE(0, 32);
                                    Buffer.from("Communications", "ascii").copy(resp, 34);
                                    socket.write(resp);
                                }
                                // 0. List Interfaces (0x0064)
                                if (command === 0x0064) {
                                    const resp = Buffer.alloc(24 + 2);
                                    resp.writeUInt16LE(0x0064, 0);
                                    resp.writeUInt16LE(2, 2);
                                    resp.writeUInt32LE(0, 4);
                                    resp.writeUInt32LE(0, 8);
                                    data.copy(resp, 12, 12, 20);
                                    resp.writeUInt32LE(0, 20);
                                    resp.writeUInt16LE(0, 24);
                                    socket.write(resp);
                                }
                                // 1. Register Session
                                else if (command === 0x0065) {
                                    registeredSession = Math.floor(Math.random() * 0x7FFFFFF0) + 0x10000000;
                                    const resp = Buffer.alloc(28);
                                    resp.writeUInt16LE(0x0065, 0);
                                    resp.writeUInt16LE(4, 2);
                                    resp.writeUInt32LE(registeredSession, 4);
                                    resp.writeUInt32LE(0, 8);
                                    data.copy(resp, 12, 12, 20);
                                    resp.writeUInt32LE(0, 20);
                                    resp.writeUInt16LE(1, 24);
                                    resp.writeUInt16LE(0, 26);
                                    socket.write(resp);
                                }
                                // 2. SendRRData (Forward Open / Close)
                                else if (command === 0x006F) {
                                if (data.length < 40) return;
                                const sessionHandle = data.readUInt32LE(4);
                                const itemCount = data.readUInt16LE(30);
                                
                                let offset = 32;
                                let unconnectedDataItem = null;
                                for (let i = 0; i < itemCount; i++) {
                                    if (offset + 4 > data.length) break;
                                    const itemType = data.readUInt16LE(offset);
                                    const itemLen = data.readUInt16LE(offset + 2);
                                    offset += 4;
                                    if (itemType === 0x00B2 && offset + itemLen <= data.length) {
                                        unconnectedDataItem = data.slice(offset, offset + itemLen);
                                    }
                                    offset += itemLen;
                                }
                                
                                if (unconnectedDataItem && unconnectedDataItem.length >= 6) {
                                    const service = unconnectedDataItem.readUInt8(0);
                                    const isLarge = service === 0x5B;
                                    const isForwardOpen = service === 0x54 || isLarge;
                                    
                                    if (isForwardOpen) {
                                        let cipOffset = 6;
                                        const priorityTimeTick = unconnectedDataItem.readUInt8(cipOffset++);
                                        const timeoutTicks = unconnectedDataItem.readUInt8(cipOffset++);
                                        
                                        const o2tConnId = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        let t2oConnId = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        if (!t2oConnId) {
                                            t2oConnId = Math.floor(Math.random() * 0x7FFFFFF0) + 0x10000;
                                        }
                                        const connSerial = unconnectedDataItem.readUInt16LE(cipOffset); cipOffset += 2;
                                        const vendorId = unconnectedDataItem.readUInt16LE(cipOffset); cipOffset += 2;
                                        const originatorSerial = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        
                                        const timeoutMultiplier = unconnectedDataItem.readUInt8(cipOffset++);
                                        cipOffset += 3; // Reserved
                                        
                                        const o2tRpi = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        let o2tParams = 0;
                                        if (isLarge) {
                                            o2tParams = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        } else {
                                            o2tParams = unconnectedDataItem.readUInt16LE(cipOffset); cipOffset += 2;
                                        }
                                        
                                        const t2oRpi = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        let t2oParams = 0;
                                        if (isLarge) {
                                            t2oParams = unconnectedDataItem.readUInt32LE(cipOffset); cipOffset += 4;
                                        } else {
                                            t2oParams = unconnectedDataItem.readUInt16LE(cipOffset); cipOffset += 2;
                                        }
                                        
                                        console.log(`[EIP Class 1 Slave] Forward Open Request from ${remoteIp}`);
                                        
                                        // Auto-bind or match to existing adapter configuration connection slot
                                        let targetConn = null;
                                        let pathBuffer = Buffer.alloc(0);
                                        let actualPathBuffer = Buffer.alloc(0);
                                        let reqTagName = null;

                                        if (this.config.adapterConfig && this.config.adapterConfig.connections) {
                                            try {
                                                // Extract connectionPath from request
                                                const pathSizeWords = unconnectedDataItem.readUInt8(isLarge ? 45 : 41);
                                                pathBuffer = unconnectedDataItem.slice(isLarge ? 46 : 42, (isLarge ? 46 : 42) + pathSizeWords * 2);
                                                const pathHex = Array.from(pathBuffer).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                                                console.log(`[EIP Class 1 Slave] Incoming Connection Path Hex: ${pathHex}`);

                                                // Detect and skip Electronic Keying Segment if present (starts with 0x34)
                                                actualPathBuffer = pathBuffer;
                                                if (pathBuffer.length >= 2 && pathBuffer[0] === 0x34) {
                                                    const keyFormat = pathBuffer[1];
                                                    const keyingLen = 2 + keyFormat * 2;
                                                    if (pathBuffer.length >= keyingLen) {
                                                        actualPathBuffer = pathBuffer.slice(keyingLen);
                                                        console.log(`[EIP Class 1 Slave] Electronic Keying Segment detected (length: ${keyingLen} bytes). Skipping to actual path payload.`);
                                                    }
                                                }
                                                
                                                const actualPathHex = Array.from(actualPathBuffer).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                                                console.log(`[EIP Class 1 Slave] Actual Connection Path Hex (after keying filter): ${actualPathHex}`);

                                                // Extract instance IDs from actualPathBuffer if standard format
                                                let reqO2TInstance = null;
                                                let reqT2OInstance = null;
                                                
                                                if (actualPathBuffer.length >= 6 && actualPathBuffer[0] === 0x20 && actualPathBuffer[1] === 0x04) {
                                                    let pOffset = 2;
                                                    // O->T Assembly Segment (0x24 = 8-bit Instance, 0x25 = 16-bit Instance)
                                                    if (actualPathBuffer[pOffset] === 0x24) {
                                                        reqO2TInstance = actualPathBuffer[pOffset + 1];
                                                        pOffset += 2;
                                                    } else if (actualPathBuffer[pOffset] === 0x25) {
                                                        reqO2TInstance = actualPathBuffer.readUInt16LE(pOffset + 1);
                                                        pOffset += 3;
                                                    }
                                                    // T->O Assembly Segment (0x2C = 8-bit Instance, 0x2D = 16-bit Instance)
                                                    if (actualPathBuffer[pOffset] === 0x2C) {
                                                        reqT2OInstance = actualPathBuffer[pOffset + 1];
                                                    } else if (actualPathBuffer[pOffset] === 0x2D) {
                                                        reqT2OInstance = actualPathBuffer.readUInt16LE(pOffset + 1);
                                                    }
                                                }
                                                console.log(`[EIP Class 1 Slave] Extracted Instances O->T: ${reqO2TInstance}, T->O: ${reqT2OInstance}`);

                                                // Parse Tag Name if ANSI Extended Symbol Segment (0x91) is present
                                                if (actualPathBuffer.length >= 3 && actualPathBuffer[0] === 0x91) {
                                                    const tagLen = actualPathBuffer[1];
                                                    if (actualPathBuffer.length >= 2 + tagLen) {
                                                        reqTagName = actualPathBuffer.slice(2, 2 + tagLen).toString('utf8');
                                                        console.log(`[EIP Class 1 Slave] Parsed Incoming Tag Name: "${reqTagName}"`);
                                                    }
                                                }

                                                // 1. Precise Match by Assembly Instance IDs
                                                if (reqO2TInstance !== null && reqT2OInstance !== null) {
                                                    targetConn = this.config.adapterConfig.connections.find(c => 
                                                        c.o2tInstance === reqO2TInstance && c.t2oInstance === reqT2OInstance
                                                    );
                                                }

                                                // 2. Precise Match by connectionPath Hex string
                                                if (!targetConn) {
                                                    targetConn = this.config.adapterConfig.connections.find(c => 
                                                        c.connectionPath && typeof c.connectionPath === 'string' && c.connectionPath.replace(/\s+/g, '').toUpperCase() === actualPathHex.replace(/\s+/g, '').toUpperCase()
                                                    );
                                                }

                                                // 3. Precise Match by Tag Name (Case-insensitive, self-adaptive)
                                                if (!targetConn && reqTagName !== null) {
                                                    targetConn = this.config.adapterConfig.connections.find(c => {
                                                        const isTag = c.connectionType === 'TAG' || 
                                                            (c.connectionPath && typeof c.connectionPath === 'string' && !/^([0-9A-Fa-f]{2}\s*)+$/.test(c.connectionPath.trim()));
                                                        return isTag && c.connectionPath && c.connectionPath.trim().toLowerCase() === reqTagName.trim().toLowerCase();
                                                    });
                                                }
                                            } catch (pathErr) {
                                                console.error("[EIP Class 1 Slave] Error parsing incoming connection path:", pathErr);
                                            }

                                            // If no matching connection is found, reject the Forward Open request
                                            if (!targetConn) {
                                                const actualPathHex = Array.from(actualPathBuffer || pathBuffer).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                                                const configuredPaths = this.config.adapterConfig.connections.map(c => 
                                                    ` - Connection Name: "${c.name}", UI Path: [${c.connectionPath}] (O2T Assembly: ${c.o2tInstance}, T2O Assembly: ${c.t2oInstance})`
                                                ).join('\n');
                                                
                                                console.log(`[EIP Class 1 Slave] Forward Open Rejected: Incoming Connection Path (${actualPathHex}) does not match any configured connection paths.\nConfigured connections in integration platform:\n${configuredPaths}`);
                                                
                                                // CIP Forward Open Error Response (compliant with EtherNet/IP specification)
                                                const cipResponseLength = 14;
                                                const cipResp = Buffer.alloc(cipResponseLength);
                                                let rOffset = 0;
                                                cipResp.writeUInt8(isLarge ? 0xDB : 0xD4, rOffset++); // Service
                                                cipResp.writeUInt8(0, rOffset++); // Reserved (always 0 in response header)
                                                cipResp.writeUInt8(0x01, rOffset++); // General Status: Connection Failure (0x01)
                                                cipResp.writeUInt8(1, rOffset++); // Size of additional status (1 word = 2 bytes)
                                                cipResp.writeUInt16LE(0x0127, rOffset); rOffset += 2; // Extended Status: 0x0127 (Connection path invalid or not supported)
                                                cipResp.writeUInt16LE(connSerial, rOffset); rOffset += 2; // Connection Serial Number
                                                cipResp.writeUInt16LE(vendorId, rOffset); rOffset += 2; // Originator Vendor ID
                                                cipResp.writeUInt32LE(originatorSerial, rOffset); rOffset += 4; // Originator Serial Number
                                                
                                                const enipResp = Buffer.alloc(24 + 16 + cipResponseLength);
                                                enipResp.writeUInt16LE(0x006F, 0); // SendRRData
                                                enipResp.writeUInt16LE(16 + cipResponseLength, 2);
                                                enipResp.writeUInt32LE(sessionHandle, 4);
                                                enipResp.writeUInt32LE(0, 8);
                                                data.copy(enipResp, 12, 12, 20); // Sender Context
                                                enipResp.writeUInt32LE(0, 20); // Options
                                                enipResp.writeUInt32LE(0, 24); // Interface Handle (0)
                                                enipResp.writeUInt16LE(0, 28); // Timeout (0)
                                                enipResp.writeUInt16LE(2, 30); // Item Count
                                                enipResp.writeUInt16LE(0x0000, 32); // Null Address Item
                                                enipResp.writeUInt16LE(0, 34); // Length (0)
                                                enipResp.writeUInt16LE(0x00B2, 36); // Unconnected Data Item
                                                enipResp.writeUInt16LE(cipResponseLength, 38);
                                                cipResp.copy(enipResp, 40);
                                                
                                                socket.write(enipResp);
                                                return; // Strict rejection: stop processing!
                                            }
                                        }
                                        
                                        if (targetConn) {
                                            targetConn.o2tConnId = o2tConnId;
                                            targetConn.t2oConnId = t2oConnId;
                                            targetConn.rpi = Math.floor(t2oRpi / 1000) || 50;
                                            
                                            const rawO2TSize = isLarge ? (o2tParams & 0xFFFF) : (o2tParams & 0x01FF);
                                            const rawT2OSize = isLarge ? (t2oParams & 0xFFFF) : (t2oParams & 0x01FF);
                                            
                                            const isTagConnection = targetConn.connectionType === 'TAG' || 
                                                (targetConn.connectionPath && typeof targetConn.connectionPath === 'string' && !/^([0-9A-Fa-f]{2}\s*)+$/.test(targetConn.connectionPath.trim()));
                                            
                                            if (isTagConnection) {
                                                // Preserve UI configured sizes (e.g. 4 bytes) instead of overwriting with Scanner's request size
                                            } else {
                                                // Robust O->T sizing: detect standard size + 4 (Run/Idle), legacy size + 6, or fall back to standard -4.
                                                if (rawO2TSize === targetConn.o2tSize + 6) {
                                                    targetConn.o2tSize = rawO2TSize - 6;
                                                } else if (rawO2TSize === targetConn.o2tSize + 4) {
                                                    targetConn.o2tSize = rawO2TSize - 4;
                                                } else {
                                                    targetConn.o2tSize = rawO2TSize >= 4 ? rawO2TSize - 4 : rawO2TSize;
                                                }
                                                
                                                // Robust T->O sizing: detect legacy size + 2, or use standard raw size.
                                                if (rawT2OSize === targetConn.t2oSize + 2) {
                                                    targetConn.t2oSize = rawT2OSize - 2;
                                                } else {
                                                    targetConn.t2oSize = rawT2OSize;
                                                }
                                            }
                                            
                                            targetConn.targetIp = remoteIp;
                                            targetConn.status = 'Connected';
                                            
                                            this.sendToWindow('eip-class1:conn-recovered', {
                                                sessionId: this.sessionId,
                                                ip: remoteIp,
                                                connId: targetConn.id
                                            });
                                            
                                            // Notify Worker to active Dynamic UDP transmission
                                            if (this.worker) {
                                                this.worker.postMessage({
                                                    type: 'updateIds',
                                                    ip: remoteIp,
                                                    connIdStr: targetConn.id,
                                                    o2tConnId: o2tConnId,
                                                    t2oConnId: t2oConnId,
                                                    rpi: targetConn.rpi,
                                                    o2tSize: targetConn.o2tSize,
                                                    t2oSize: targetConn.t2oSize,
                                                    o2tDataset: targetConn.o2tDataset,
                                                    t2oDataset: targetConn.t2oDataset,
                                                    loopbackMappings: targetConn.loopbackMappings,
                                                    bulkLoopback: targetConn.bulkLoopback,
                                                    connectionType: targetConn.connectionType
                                                });
                                            }
                                        }
                                        
                                        // CIP Forward Open Success Response
                                        const cipResponseLength = 30; // Standard is always 30
                                        const cipResp = Buffer.alloc(cipResponseLength);
                                        let rOffset = 0;
                                        cipResp.writeUInt8(isLarge ? 0xDB : 0xD4, rOffset++);
                                        cipResp.writeUInt8(0, rOffset++);
                                        cipResp.writeUInt8(0, rOffset++);
                                        cipResp.writeUInt8(0, rOffset++);
                                        cipResp.writeUInt32LE(o2tConnId, rOffset); rOffset += 4;
                                        cipResp.writeUInt32LE(t2oConnId, rOffset); rOffset += 4;
                                        cipResp.writeUInt16LE(connSerial, rOffset); rOffset += 2;
                                        cipResp.writeUInt16LE(vendorId, rOffset); rOffset += 2;
                                        cipResp.writeUInt32LE(originatorSerial, rOffset); rOffset += 4;
                                        cipResp.writeUInt32LE(o2tRpi, rOffset); rOffset += 4;
                                        cipResp.writeUInt32LE(t2oRpi, rOffset); rOffset += 4;
                                        cipResp.writeUInt8(0, rOffset++); // Application Reply Size
                                        cipResp.writeUInt8(0, rOffset++); // Reserved
                                        
                                        const enipResp = Buffer.alloc(24 + 16 + cipResponseLength);
                                        enipResp.writeUInt16LE(0x006F, 0);
                                        enipResp.writeUInt16LE(16 + cipResponseLength, 2);
                                        enipResp.writeUInt32LE(sessionHandle, 4);
                                        enipResp.writeUInt32LE(0, 8);
                                        data.copy(enipResp, 12, 12, 20);
                                        enipResp.writeUInt32LE(0, 20);
                                        enipResp.writeUInt32LE(0, 24);
                                        enipResp.writeUInt16LE(0, 28);
                                        enipResp.writeUInt16LE(2, 30);
                                        enipResp.writeUInt16LE(0x0000, 32);
                                        enipResp.writeUInt16LE(0, 34);
                                        enipResp.writeUInt16LE(0x00B2, 36);
                                        enipResp.writeUInt16LE(cipResponseLength, 38);
                                        cipResp.copy(enipResp, 40);
                                        
                                        socket.write(enipResp);
                                    } else if (service === 0x4E) {
                                        // CIP Forward Close
                                        let targetConn = null;
                                        if (this.config.adapterConfig && this.config.adapterConfig.connections) {
                                            targetConn = this.config.adapterConfig.connections.find(c => c.targetIp === remoteIp);
                                        }
                                        if (targetConn) {
                                            targetConn.status = 'Disconnected';
                                            this.sendToWindow('eip-class1:conn-dropped', {
                                                sessionId: this.sessionId,
                                                ip: remoteIp,
                                                connId: targetConn.id,
                                                reason: "Master Connection Closed (Forward Close)"
                                            });
                                        }
                                        
                                        const cipResp = Buffer.alloc(10);
                                        cipResp.writeUInt8(0xCE, 0);
                                        cipResp.writeUInt8(0, 1);
                                        cipResp.writeUInt8(0, 2);
                                        cipResp.writeUInt8(0, 3);
                                        data.copy(cipResp, 4, 40 + 8, 40 + 14);
                                        
                                        const enipResp = Buffer.alloc(24 + 16 + cipResp.length);
                                        enipResp.writeUInt16LE(0x006F, 0);
                                        enipResp.writeUInt16LE(16 + cipResp.length, 2);
                                        enipResp.writeUInt32LE(sessionHandle, 4);
                                        data.copy(enipResp, 12, 12, 20);
                                        enipResp.writeUInt32LE(0, 24);
                                        enipResp.writeUInt16LE(0, 28);
                                        enipResp.writeUInt16LE(2, 30);
                                        enipResp.writeUInt16LE(0x0000, 32);
                                        enipResp.writeUInt16LE(0, 34);
                                        enipResp.writeUInt16LE(0x00B2, 36);
                                        enipResp.writeUInt16LE(cipResp.length, 38);
                                        cipResp.copy(enipResp, 40);
                                        socket.write(enipResp);
                                    }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error("[EIP Class 1 Slave] TCP parsing error:", err.message);
                        }
                    });
                    
                    socket.on('error', () => {});
                });
                
                this.tcpServer.on('error', (err) => {
                    this.sendToWindow('eip-class1:error', {
                        sessionId: this.sessionId,
                        error: `TCP Server bind failed on 44818: ${err.message}`
                    });
                });
            }

            console.log(`[EIP-Class1-${this.sessionId}] Spawning worker thread...`);
            await new Promise((resolve, reject) => {
                const workerPath = path.join(__dirname, 'eip-class1-worker.js');
                this.worker = new Worker(workerPath, {
                    workerData: {
                        sessionId: this.sessionId,
                        config: this.config
                    }
                });

                this.worker.on('message', (msg) => {
                    if (msg.type === 'bound') {
                        console.log(`[EIP-Class1-${this.sessionId}] Worker UDP socket bound successfully.`);
                        resolve();
                    } else if (msg.type === 'data') {
                        const now = performance.now();
                        const throttleKey = `${msg.ip}_${msg.connId}`;
                        const lastSent = this.lastIpcSent.get(throttleKey) || 0;
                        if (now - lastSent > 100) {
                            this.lastIpcSent.set(throttleKey, now);
                            this.sendToWindow('eip-class1:data', { 
                                sessionId: this.sessionId, 
                                ip: msg.ip,
                                connId: msg.connId,
                                data: msg.data,
                                o2tData: msg.o2tData,
                                t2oData: msg.t2oData
                            });
                        }
                    } else if (msg.type === 'stats') {
                        this.sendToWindow('eip-class1:stats', {
                            sessionId: this.sessionId,
                            stats: msg.stats
                        });
                    } else if (msg.type === 'connDropped') {
                        console.log(`[EIP-Class1-${this.sessionId}] Connection dropped for ${msg.ip} (Conn ID: ${msg.connId}).`);
                        this.sendToWindow('eip-class1:conn-dropped', { sessionId: this.sessionId, ip: msg.ip, connId: msg.connId, reason: "UDP T->O Connection Timeout" });
                        this.attemptReconnect(msg.ip, msg.connId);
                    } else if (msg.type === 'connRecovered') {
                        if (this.reconnectTimers && this.reconnectTimers.has(msg.connId)) {
                            clearTimeout(this.reconnectTimers.get(msg.connId));
                            this.reconnectTimers.delete(msg.connId);
                        }
                        this.sendToWindow('eip-class1:conn-recovered', { sessionId: this.sessionId, ip: msg.ip, connId: msg.connId });
                    } else if (msg.type === 'error') {
                        console.error(`[EIP-Class1-${this.sessionId}] Worker reported error: ${msg.error}`);
                        this.sendToWindow('eip-class1:error', { sessionId: this.sessionId, error: msg.error });
                        reject(new Error(msg.error));
                    } else if (msg.type === 'debug') {
                        console.log(`[EIP-Class1-${this.sessionId} Worker] ${msg.msg}`);
                    }
                });

                this.worker.on('error', (err) => {
                    console.error(`[EIP-Class1-${this.sessionId}] Worker Error:`, err);
                    reject(err);
                });

                this.worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`[EIP-Class1-${this.sessionId}] Worker stopped with exit code ${code}`);
                    }
                });
            });

            // Start TCP listening after worker is bound to ensure no race conditions where incoming Forward Open is received before worker exists
            if (this.config.mode === 'Adapter' && this.tcpServer) {
                const localBindIp = this.config.localBindIp && this.config.localBindIp !== '0.0.0.0' ? this.config.localBindIp : '0.0.0.0';
                this.tcpServer.listen(44818, localBindIp, () => {
                    console.log(`[EIP Class 1 Slave] TCP Server listening on ${localBindIp}:44818`);
                });
            }

            console.log(`[EIP-Class1-${this.sessionId}] Session started successfully.`);
        } catch (err) {
            cleanup();
            throw err;
        }
    }

    async attemptReconnect(ip, connIdStr) {
        if (this.config.mode !== 'Scanner') return; // Adapters wait for Scanners to connect
        if (!this.config.scannerConfig) return;
        
        let targetSlave = null;
        let targetConn = null;
        
        for (const slave of this.config.scannerConfig.slaves) {
            if (slave.ipAddress !== ip) continue;
            const connections = slave.connections && slave.connections.length > 0 ? slave.connections : [slave];
            for (const conn of connections) {
                if (conn.id === connIdStr) {
                    targetSlave = slave;
                    targetConn = conn;
                    break;
                }
            }
            if (targetSlave) break;
        }
        
        if (!targetConn) return;

        this.reconnectTimers = this.reconnectTimers || new Map();
        if (this.reconnectTimers.has(connIdStr)) return; // Already attempting reconnect

        // Cleanup old client
        const oldClientIdx = this.tcpClients.findIndex(c => c.ip === ip && c.options.path === targetConn.connectionPath);
        if (oldClientIdx >= 0) {
            this.tcpClients[oldClientIdx].close();
            this.tcpClients.splice(oldClientIdx, 1);
        }

        const client = new ForwardOpenClient(ip, {
            rpi: targetConn.rpi || 10,
            o2tSize: targetConn.o2tSize !== undefined ? targetConn.o2tSize : 32,
            t2oSize: targetConn.t2oSize !== undefined ? targetConn.t2oSize : 32,
            path: targetConn.connectionPath,
            vendorId: targetSlave.vendorId,
            keyingMode: targetSlave.keyingMode,
            deviceType: targetSlave.deviceType,
            productCode: targetSlave.productCode,
            majorRevision: targetSlave.majorRevision,
            minorRevision: targetSlave.minorRevision,
            triggerType: targetConn.triggerType,
            transportType: targetConn.transportType,
            timeoutMultiplier: targetConn.timeoutMultiplier,
            o2tConnectionType: targetConn.o2tConnectionType,
            o2tPriority: targetConn.o2tPriority,
            o2tFixedVariable: targetConn.o2tFixedVariable,
            t2oConnectionType: targetConn.t2oConnectionType,
            t2oPriority: targetConn.t2oPriority,
            t2oFixedVariable: targetConn.t2oFixedVariable
        });

        // Use a detached loop for reconnect with intervals based on RPI (capped at 5s)
        const multiplier = targetConn.timeoutMultiplier || 4;
        const retryDelay = Math.min(Math.max((targetConn.rpi || 10) * multiplier, 2000), 5000);
        
        const reconnectLoop = async () => {
            if (!this.worker || !this.reconnectTimers.has(connIdStr)) return; // Session stopped or recovered naturally
            try {
                console.log(`[EIP-Class1-${this.sessionId}] Attempting reconnect to ${ip} (Conn: ${targetConn.name})...`);
                const connIds = await client.connect();
                console.log(`[EIP-Class1-${this.sessionId}] Reconnect successful for ${ip} (Conn: ${targetConn.name})`, connIds);
                this.tcpClients.push(client);
                this.reconnectTimers.delete(connIdStr);
                
                // Tell worker about the new connection IDs to resume UDP
                targetConn.o2tConnId = connIds.o2tConnId;
                targetConn.t2oConnId = connIds.t2oConnId;
                this.worker.postMessage({
                    type: 'updateIds',
                    ip: ip,
                    connIdStr: connIdStr,
                    o2tConnId: connIds.o2tConnId,
                    t2oConnId: connIds.t2oConnId,
                    o2tSize: targetConn.o2tSize,
                    t2oSize: targetConn.t2oSize,
                    connectionType: targetConn.connectionType
                });
            } catch (e) {
                console.log(`[EIP-Class1-${this.sessionId}] Reconnect failed for ${ip}: ${e.message}. Retrying in ${retryDelay}ms...`);
                // Schedule next attempt
                if (this.worker && this.reconnectTimers.has(connIdStr)) {
                    this.reconnectTimers.set(connIdStr, setTimeout(reconnectLoop, retryDelay));
                }
            }
        };

        this.reconnectTimers.set(connIdStr, setTimeout(reconnectLoop, retryDelay));
    }

    updateData(targetIp, connId, dataArray) {
        if (this.worker) {
            this.worker.postMessage({
                type: 'updateData',
                targetIp,
                connId,
                dataArray
            });
        }
    }

    async stop() {
        if (this.reconnectTimers) {
            for (const timer of this.reconnectTimers.values()) {
                clearTimeout(timer);
            }
            this.reconnectTimers.clear();
        }

        if (this.tcpClients) {
            await Promise.all(this.tcpClients.map(client => client.close()));
            this.tcpClients = [];
        }

        if (this.tcpServer) {
            try { this.tcpServer.close(); } catch(e) {}
            this.tcpServer = null;
        }

        if (this.activeSockets) {
            for (const socket of this.activeSockets) {
                try { socket.destroy(); } catch(e) {}
            }
            this.activeSockets = [];
        }

        if (this.worker) {
            this.worker.postMessage({ type: 'stop' });
            // Terminate after a short delay if it doesn't exit gracefully
            setTimeout(() => {
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
                }
            }, 1000);
        }
    }
}

module.exports = {
    register: (ipcMainRef, sendToWindow) => {
        ipcMainRef.handle('eip-class1:start', async (_, sessionId, config) => {
            if (sessions.has(sessionId)) {
                await sessions.get(sessionId).stop();
                sessions.delete(sessionId);
            }

            try {
                const node = new EipClass1Node(sessionId, config, sendToWindow);
                await node.start();
                sessions.set(sessionId, node);
                return { success: true, config: node.config };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        ipcMainRef.handle('eip-class1:stop', async (_, sessionId) => {
            const node = sessions.get(sessionId);
            if (node) {
                await node.stop();
                sessions.delete(sessionId);
            }
            return { success: true };
        });

        ipcMainRef.handle('eip-class1:updateData', async (_, sessionId, targetIp, connId, dataArray) => {
            const node = sessions.get(sessionId);
            if (node) {
                node.updateData(targetIp, connId, dataArray);
                return { success: true };
            }
            return { success: false, error: "Session not found" };
        });

        ipcMainRef.handle('eip-class1:scan', async (_, timeoutMs = 3000) => {
            return new Promise((resolve) => {
                const dgram = require('dgram');
                const os = require('os');
                const devices = [];
                const sockets = [];

                const interfaces = os.networkInterfaces();
                const ifaces = [];
                for (const name of Object.keys(interfaces)) {
                    for (const iface of interfaces[name]) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            ifaces.push(iface);
                        }
                    }
                }
                
                // Add a fallback for 0.0.0.0
                ifaces.push({ address: '0.0.0.0', netmask: '0.0.0.0' });

                ifaces.forEach(iface => {
                    try {
                        const socket = dgram.createSocket('udp4');
                        sockets.push(socket);

                        socket.on('message', (msg, rinfo) => {
                            try {
                                if (msg.length >= 24 && msg.readUInt16LE(0) === 0x0063) {
                                    const itemCount = msg.readUInt16LE(24);
                                    if (itemCount > 0) {
                                        const itemType = msg.readUInt16LE(26);
                                        const itemLength = msg.readUInt16LE(28);
                                        
                                        if (itemType === 0x000C && msg.length >= 30 + itemLength) {
                                            // Identity object starts at offset 30
                                            // EncapVer(2) + SockAddr(16) = 18 bytes offset
                                            // So VendorID is at 30 + 18 = 48
                                            const vendorId = msg.readUInt16LE(48);
                                            const deviceType = msg.readUInt16LE(50);
                                            const productCode = msg.readUInt16LE(52);
                                            const majorRevision = msg.readUInt8(54);
                                            const minorRevision = msg.readUInt8(55);
                                            const serialNumber = msg.readUInt32LE(58);
                                            const productNameLength = msg.readUInt8(62);
                                            const productName = msg.slice(63, 63 + productNameLength).toString('utf8');

                                            devices.push({
                                                ipAddress: rinfo.address,
                                                productName,
                                                vendorId,
                                                deviceType,
                                                productCode,
                                                majorRevision,
                                                minorRevision,
                                                serialNumber
                                            });
                                        }
                                    }
                                }
                            } catch (e) {
                                // ignore parsing errors
                            }
                        });

                        socket.on('listening', () => {
                            try {
                                socket.setBroadcast(true);
                                const req = Buffer.alloc(24);
                                req.writeUInt16LE(0x0063, 0); // ListIdentity
                                
                                socket.send(req, 0, req.length, 44818, '255.255.255.255');
                                
                                if (iface.address !== '0.0.0.0') {
                                    const ipParts = iface.address.split('.').map(Number);
                                    const maskParts = iface.netmask.split('.').map(Number);
                                    const bcastParts = ipParts.map((p, i) => p | (~maskParts[i] & 255));
                                    const bcastAddress = bcastParts.join('.');
                                    socket.send(req, 0, req.length, 44818, bcastAddress);
                                }
                            } catch (e) {
                                // ignore send errors
                            }
                        });

                        socket.bind(0, iface.address);
                    } catch (e) {
                        // ignore socket creation errors
                    }
                });

                setTimeout(() => {
                    sockets.forEach(s => {
                        try { s.close(); } catch(e) {}
                    });
                    const unique = [];
                    const ips = new Set();
                    for (const d of devices) {
                        if (!ips.has(d.ipAddress)) {
                            ips.add(d.ipAddress);
                            unique.push(d);
                        }
                    }
                    resolve({ success: true, devices: unique });
                }, timeoutMs);
            });
        });
    },
    closeAll: async () => {
        for (const [id, node] of sessions) {
            try { await node.stop(); } catch(e) {}
        }
        sessions.clear();
    },
    hasActiveSessions: () => {
        return sessions.size > 0;
    }
};
