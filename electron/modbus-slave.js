const { ipcMain } = require('electron');
const net = require('net');
const os = require('os');
const { VirtualServer, VirtualSocket } = require('./virtual-modbus');

let modbusModule = null;
const sessions = new Map();
const sharedServers = new Map(); // key `${ip}:${port}` -> { netServer, sockets, unitMap }

async function getModbus() {
    if (!modbusModule) {
        try {
            const mod = await import("jsmodbus");
            modbusModule = mod.default || mod;

            try {
                // Patch jsmodbus to fix slow FC 1, 2, 15 (Read/Write Coils/Discrete)
                const ResponseHandler = require('jsmodbus/dist/modbus-server-response-handler.js').default;
                const { isWriteMultipleCoilsRequestBody } = require('jsmodbus/dist/request/index.js');
                const { WriteMultipleCoilsResponseBody } = require('jsmodbus/dist/response/index.js');
                const ReadCoilsResponseBody = require('jsmodbus/dist/response/read-coils.js').default;
                const ReadDiscreteInputsResponseBody = require('jsmodbus/dist/response/read-discrete-inputs.js').default;

                // Patch FC 15
                if (ResponseHandler && ResponseHandler.prototype._handleWriteMultipleCoils) {
                    ResponseHandler.prototype._handleWriteMultipleCoils = function(request, cb) {
                        if (!isWriteMultipleCoilsRequestBody(request.body)) {
                            throw new Error(`InvalidRequestClass - Expected WriteMultipleCoilsRequestBody but received ${request.body.name}`);
                        }
                        if (!this._server.coils) {
                            this._server.emit('writeMultipleCoils', request, cb);
                            return;
                        }
                        this._server.emit('preWriteMultipleCoils', request, cb);
                        const responseBody = WriteMultipleCoilsResponseBody.fromRequest(request.body);
                        
                        const start = request.body.address;
                        const quantity = request.body.quantity;
                        const reqBuffer = request.body.valuesAsBuffer;
                        
                        for (let i = 0; i < quantity; i++) {
                            const reqByteIdx = Math.floor(i / 8);
                            const reqBitIdx = i % 8;
                            const val = (reqBuffer[reqByteIdx] & (1 << reqBitIdx)) !== 0;
                            
                            const targetIdx = start + i;
                            const byteIndex = Math.floor(targetIdx / 8);
                            const bitIndex = targetIdx % 8;
                            
                            if (byteIndex < this._server.coils.length) {
                                if (val) {
                                    this._server.coils[byteIndex] |= (1 << bitIndex);
                                } else {
                                    this._server.coils[byteIndex] &= ~(1 << bitIndex);
                                }
                            }
                        }
                        
                        this._server.emit('writeMultipleCoils', this._server.coils, []);
                        this._server.emit('postWriteMultipleCoils', this._server.coils, []);
                        
                        const response = this._fromRequest(request, responseBody);
                        const payload = response.createPayload();
                        cb(payload);
                        this._server.emit('postWriteMultipleCoils', request, cb);
                        return response;
                    };
                }

                // Patch FC 1
                if (ReadCoilsResponseBody && ReadCoilsResponseBody.fromRequest) {
                    ReadCoilsResponseBody.fromRequest = function(requestBody, coils) {
                        const start = requestBody.start;
                        const count = requestBody.count;
                        const byteCount = Math.ceil(count / 8);
                        const coilsSegment = Buffer.alloc(byteCount);
                        for (let i = 0; i < count; i++) {
                            const targetIdx = start + i;
                            const byteIndex = Math.floor(targetIdx / 8);
                            const bitIndex = targetIdx % 8;
                            if (byteIndex < coils.length) {
                                const val = (coils[byteIndex] & (1 << bitIndex)) !== 0;
                                if (val) {
                                    const segByteIdx = Math.floor(i / 8);
                                    const segBitIdx = i % 8;
                                    coilsSegment[segByteIdx] |= (1 << segBitIdx);
                                }
                            }
                        }
                        return new ReadCoilsResponseBody(coilsSegment, byteCount);
                    };
                }

                // Patch FC 2
                if (ReadDiscreteInputsResponseBody && ReadDiscreteInputsResponseBody.fromRequest) {
                    ReadDiscreteInputsResponseBody.fromRequest = function(requestBody, discreteInputs) {
                        const start = requestBody.start;
                        const count = requestBody.count;
                        const byteCount = Math.ceil(count / 8);
                        const segmentStatus = Buffer.alloc(byteCount);
                        for (let i = 0; i < count; i++) {
                            const targetIdx = start + i;
                            const byteIndex = Math.floor(targetIdx / 8);
                            const bitIndex = targetIdx % 8;
                            if (byteIndex < discreteInputs.length) {
                                const val = (discreteInputs[byteIndex] & (1 << bitIndex)) !== 0;
                                if (val) {
                                    const segByteIdx = Math.floor(i / 8);
                                    const segBitIdx = i % 8;
                                    segmentStatus[segByteIdx] |= (1 << segBitIdx);
                                }
                            }
                        }
                        return new ReadDiscreteInputsResponseBody(segmentStatus, byteCount);
                    };
                }

            } catch (patchErr) {
                console.error("[Modbus Slave] Failed to patch jsmodbus performance issue:", patchErr);
            }

        } catch (err) {
            console.error("[Modbus Slave] Failed to load jsmodbus:", err);
            throw new Error("Modbus Driver not found.");
        }
    }
    return modbusModule;
}

module.exports = {
    hasActiveSessions: () => sessions.size > 0,

    closeAll: async () => {
        for (const [key, shared] of sharedServers.entries()) {
            try {
                shared.sockets.forEach(s => s.destroy());
                shared.netServer.close();
            } catch(e) {}
        }
        sharedServers.clear();
        
        for (const [id, s] of sessions.entries()) {
            try {
                if (s.server && typeof s.server.close === 'function') {
                    s.server.close();
                }
            } catch (e) { console.error(`Modbus Slave Close Error (${id}):`, e.message); }
        }
        sessions.clear();
    },

    register: (ipcMain, updatePowerSave, sendToWindow) => {
        
        // --- START SERVER ---
        ipcMain.handle('modbus-slave:start', async (_, sessionId, port, unitId, memorySize = 10000, localBindIp, ignoreUnitId = false) => {
            try {
                const jsmodbus = await getModbus();
                const cleanLocalIp = (localBindIp || '0.0.0.0').trim();
                const sKey = `${cleanLocalIp}:${port}`;
                
                return new Promise((resolve) => {
                    if (sessions.has(sessionId)) {
                        resolve({ success: false, error: "Session already exists" });
                        return;
                    }

                    let shared = sharedServers.get(sKey);
                    let isNewServer = false;

                    if (!shared) {
                        shared = {
                            netServer: new net.Server(),
                            sockets: new Set(),
                            unitMap: new Map(),
                            port,
                            cleanLocalIp
                        };
                        isNewServer = true;

                        shared.netServer.on('connection', (realSocket) => {
                            realSocket.setKeepAlive(true, 2000);
                            shared.sockets.add(realSocket);

                            // Distribute connection notice to all units sharing this port
                            const updateClients = () => {
                                for (const vServer of shared.unitMap.values()) {
                                    sendToWindow('modbus-slave:client-changed', {
                                        sessionId: vServer._sessionId,
                                        clientCount: shared.sockets.size,
                                        clients: Array.from(shared.sockets).map(c => ({ ip: c.remoteAddress, port: c.remotePort }))
                                    });
                                }
                            };
                            
                            const msgConn = `[Modbus Shared] Connection from ${realSocket.remoteAddress}:${realSocket.remotePort}`;
                            for (const vServer of shared.unitMap.values()) {
                                sendToWindow('modbus-slave:log', { sessionId: vServer._sessionId, message: msgConn });
                            }
                            updateClients();

                            realSocket.on('data', (data) => {
                                realSocket._mbBuffer = Buffer.concat([realSocket._mbBuffer || Buffer.alloc(0), data]);
                                
                                while (realSocket._mbBuffer.length >= 7) {
                                    const len = realSocket._mbBuffer.readUInt16BE(4);
                                    const frameLen = 6 + len;
                                    
                                    if (realSocket._mbBuffer.length < frameLen) break;
                                    
                                    const frame = realSocket._mbBuffer.slice(0, frameLen);
                                    realSocket._mbBuffer = realSocket._mbBuffer.slice(frameLen);
                                    
                                    const frameUnitId = frame[6];
                                    let vServer = shared.unitMap.get(frameUnitId);
                                    
                                    // If exact match not found, find a server configured to ignore Unit ID
                                    if (!vServer) {
                                        for (const vs of shared.unitMap.values()) {
                                            if (vs._ignoreUnitId) {
                                                vServer = vs;
                                                break;
                                            }
                                        }
                                    }
                                    
                                    if (vServer) {
                                        const routeUnitId = vServer._unitId; // Use the configured unitId of the server to index the socket
                                        if (!realSocket._vSockets) realSocket._vSockets = {};
                                        let vSocket = realSocket._vSockets[routeUnitId];
                                        if (!vSocket) {
                                            vSocket = new VirtualSocket(realSocket);
                                            
                                            // Hook virtual write logger
                                            const originalWrite = vSocket.write;
                                            vSocket.write = function(chunk, encoding, callback) {
                                                try {
                                                    const hexStr = Buffer.isBuffer(chunk) ? chunk.toString('hex') : Buffer.from(chunk).toString('hex');
                                                    if (hexStr) sendToWindow('modbus-slave:log', { sessionId: vServer._sessionId, message: `[Modbus Slave ${vServer._sessionId}] Data to ${realSocket.remoteAddress}: ${hexStr}` });
                                                } catch(e) {}
                                                return originalWrite.apply(vSocket, arguments);
                                            };

                                            realSocket._vSockets[routeUnitId] = vSocket;
                                            vServer.emit('connection', vSocket);
                                        }
                                        
                                        // Log incoming data
                                        try {
                                            const hexStr = Buffer.isBuffer(frame) ? frame.toString('hex') : Buffer.from(frame).toString('hex');
                                            sendToWindow('modbus-slave:log', { sessionId: vServer._sessionId, message: `[Modbus Slave ${vServer._sessionId}] Data from ${realSocket.remoteAddress}: ${hexStr}` });
                                        } catch(e) {}

                                        vSocket.push(frame); // feed jsmodbus
                                    } else {
                                        // Drop unknown unit ID
                                        console.warn(`[Modbus Proxy] Dropping frame for unknown unitId ${frameUnitId} on ${sKey}`);
                                    }
                                }
                            });

                            realSocket.on('close', (hadError) => {
                                shared.sockets.delete(realSocket);
                                const msgClosed = `[Modbus Shared] Connection closed from ${realSocket.remoteAddress}${hadError ? ' (with error)' : ''}`;
                                
                                // Propagate close to all virtual sockets
                                if (realSocket._vSockets) {
                                    for (const unitId in realSocket._vSockets) {
                                        realSocket._vSockets[unitId].emit('close', hadError);
                                        realSocket._vSockets[unitId].destroy();
                                    }
                                }

                                for (const vServer of shared.unitMap.values()) {
                                    sendToWindow('modbus-slave:log', { sessionId: vServer._sessionId, message: msgClosed });
                                    if(hadError) sendToWindow('modbus-slave:drop', { sessionId: vServer._sessionId, error: 'Connection closed', port: realSocket.remotePort, ip: realSocket.remoteAddress });
                                }
                                updateClients();
                            });

                            realSocket.on('error', (err) => {
                                shared.sockets.delete(realSocket);
                                const msgErr = `[Modbus Shared] Connection error from ${realSocket.remoteAddress}: ${err.message}`;
                                
                                // Propagate error to all virtual sockets
                                if (realSocket._vSockets) {
                                    for (const unitId in realSocket._vSockets) {
                                        realSocket._vSockets[unitId].emit('error', err);
                                        realSocket._vSockets[unitId].destroy();
                                    }
                                }

                                for (const vServer of shared.unitMap.values()) {
                                    sendToWindow('modbus-slave:log', { sessionId: vServer._sessionId, message: msgErr });
                                    sendToWindow('modbus-slave:drop', { sessionId: vServer._sessionId, error: err.message, port: realSocket.remotePort, ip: realSocket.remoteAddress });
                                }
                                updateClients();
                            });
                        });
                        
                        shared.netServer.on('error', (err) => {
                            for (const vServer of shared.unitMap.values()) {
                                if (!shared.netServer.listening) resolve({ success: false, error: err.message });
                                else sendToWindow('modbus-slave:error', { sessionId: vServer._sessionId, error: err.message });
                            }
                        });

                        sharedServers.set(sKey, shared);
                    }

                    if (shared.unitMap.has(Number(unitId))) {
                        resolve({ success: false, error: `Unit ID ${unitId} is already in use on ${sKey}` });
                        return;
                    }

                    // --- Setup Virtual Server for this Unit ID ---
                    const vServer = new VirtualServer();
                    vServer._sessionId = sessionId;
                    vServer._sKey = sKey;
                    vServer._unitId = Number(unitId);
                    vServer._ignoreUnitId = ignoreUnitId === true;
                    shared.unitMap.set(Number(unitId), vServer);

                    // Allocate memory buffers based on memorySize
                    const holding = Buffer.alloc(memorySize * 2); 
                    const coils = Buffer.alloc(memorySize * 2);
                    const inputs = Buffer.alloc(memorySize * 2);
                    const discrete = Buffer.alloc(memorySize * 2);

                    const modbusServer = new jsmodbus.server.TCP(vServer, {
                        holding: holding,
                        coils: coils,
                        inputs: inputs,
                        discrete: discrete
                    });

                    // Utility to push state down immediately
                    const dispatchCurrentState = () => {
                        const holdingArray = [];
                        for (let i = 0; i < holding.length; i += 2) holdingArray.push(holding.readUInt16BE(i));
                        const inputsArray = [];
                        for (let i = 0; i < inputs.length; i += 2) inputsArray.push(inputs.readUInt16BE(i));

                        sendToWindow('modbus-slave:memory-update', {
                            sessionId,
                            memory: {
                                holding: holdingArray,
                                coils: Array.from(new Uint8Array(coils.buffer, coils.byteOffset, coils.byteLength)),
                                inputs: inputsArray,
                                discrete: Array.from(new Uint8Array(discrete.buffer, discrete.byteOffset, discrete.byteLength))
                            }
                        });
                    };

                    sessions.set(sessionId, { 
                        server: vServer, 
                        modbusServer,
                        buffers: { holding, coils, inputs, discrete },
                        clients: shared.sockets
                    });

                    if (isNewServer) {
                        shared.netServer.listen(port, cleanLocalIp, () => {
                            console.log(`[Modbus Shared] Listening on ${cleanLocalIp}:${port}`);
                            updatePowerSave();
                            dispatchCurrentState();
                            resolve({ success: true });
                        });
                    } else {
                        // Shared server is already listening
                        console.log(`[Modbus Proxy] Bound Virtual Server on Unit ${unitId} to shared socket ${sKey}`);
                        updatePowerSave();
                        dispatchCurrentState();
                        
                        // Hydrate existing clients to the UI
                        sendToWindow('modbus-slave:client-changed', {
                            sessionId: sessionId,
                            clientCount: shared.sockets.size,
                            clients: Array.from(shared.sockets).map(c => ({ ip: c.remoteAddress, port: c.remotePort }))
                        });
                        
                        resolve({ success: true });
                    }

                    // Listen to write events to notify frontend
                    const handleRequestEvent = (req, type, action) => {
                        if (!req || !req.body) return;
                        
                        const addr = req.body.address;
                        const qty = req.body.count || req.body.quantity || 1;
                        const unitId = req.unitId || 0;
                        const timestamp = new Date().toISOString();
                        
                        const msg = `Master ${action} ${qty} ${type} at address ${addr} (UnitID: ${unitId})`;
                        console.log(`[Modbus Slave ${sessionId}] ${msg}`);
                        
                        sendToWindow('modbus-slave:log', { 
                            sessionId, 
                            level: 'info', 
                            message: msg,
                            timestamp 
                        });

                        sendToWindow('modbus-slave:data-changed', { 
                            sessionId, 
                            type: type === 'coil' ? 'coils' : type, 
                            address: addr, 
                            length: qty, 
                            action 
                        });
                    };

                    modbusServer.on('postReadCoils', (req) => handleRequestEvent(req, 'coils', 'read'));
                    modbusServer.on('postReadDiscreteInputs', (req) => handleRequestEvent(req, 'discrete', 'read'));
                    modbusServer.on('postReadHoldingRegisters', (req) => handleRequestEvent(req, 'holding', 'read'));
                    modbusServer.on('postReadInputRegisters', (req) => handleRequestEvent(req, 'inputs', 'read'));
                    
                    modbusServer.on('postWriteSingleCoil', (req) => handleRequestEvent(req, 'coil', 'write'));
                    modbusServer.on('postWriteSingleRegister', (req) => handleRequestEvent(req, 'holding', 'write'));
                    modbusServer.on('postWriteMultipleCoils', (req) => handleRequestEvent(req, 'coils', 'write'));
                    modbusServer.on('postWriteMultipleRegisters', (req) => handleRequestEvent(req, 'holding', 'write'));

                    modbusServer.on('error', (err) => {
                        console.error(`[Modbus Slave ${sessionId}] Server Error:`, err);
                    });
                });
            } catch (e) { return { success: false, error: e.message }; }
        });

        // --- STOP SERVER ---
        ipcMain.handle('modbus-slave:stop', async (_, sessionId) => {
            try {
                const s = sessions.get(sessionId);
                if (s) {
                    console.log(`[Modbus Proxy] Stopping Virtual Server for session ${sessionId}`);
                    
                    if (s.server && s.server._sKey) {
                        const sKey = s.server._sKey;
                        const unitId = s.server._unitId;
                        
                        const shared = sharedServers.get(sKey);
                        if (shared) {
                            shared.unitMap.delete(unitId);
                            
                            if (shared.unitMap.size === 0) {
                                console.log(`[Modbus Shared] No more virtual servers on ${sKey}, closing physical socket`);
                                shared.sockets.forEach(sock => { try { sock.destroy(); } catch(e){} });
                                shared.sockets.clear();
                                shared.netServer.close();
                                sharedServers.delete(sKey);
                            } else {
                                console.log(`[Modbus Shared] Removed Unit ${unitId} from ${sKey}. Remaining units: ${shared.unitMap.size}`);
                            }
                        }
                    } else if (s.server && typeof s.server.close === 'function') {
                        s.server.close();
                    }

                    sessions.delete(sessionId);
                    updatePowerSave();
                    return { success: true };
                }
                return { success: false, error: 'Session not found' };
            } catch (err) {
                console.error(`[Modbus Slave] Error stopping server ${sessionId}:`, err);
                return { success: false, error: err.message };
            }
        });

        // --- READ MEMORY (Frontend -> Backend) ---
        ipcMain.handle('modbus-slave:read-memory', async (_, sessionId, type, address, length) => {
            try {
                const s = sessions.get(sessionId);
                if (!s) {
                    // Only warn if it's a real session ID (not mock or empty)
                    if (sessionId && sessionId !== 'mock-session') {
                        // console.warn(`[Modbus Slave] read-memory failed: Session ${sessionId} not found`);
                    }
                    return { success: false, error: "Server not running" };
                }
                
                const buffer = s.buffers[type];
                if (!buffer) return { success: false, error: "Invalid memory type" };

                let data = [];
                if (type === 'holding' || type === 'inputs') {
                    for (let i = 0; i < length; i++) {
                        const offset = (address + i) * 2;
                        if (offset + 1 < buffer.length) {
                            data.push(buffer.readUInt16BE(offset));
                        } else {
                            data.push(0);
                        }
                    }
                } else {
                    // Coils / Discrete
                    for (let i = 0; i < length; i++) {
                        const bitAddr = address + i;
                        const byteIndex = Math.floor(bitAddr / 8);
                        const bitIndex = bitAddr % 8;
                        if (byteIndex < buffer.length) {
                            const val = (buffer[byteIndex] & (1 << bitIndex)) !== 0;
                            data.push(val ? 1 : 0);
                        } else {
                            data.push(0);
                        }
                    }
                }
                return { success: true, data };
            } catch (e) {
                console.error(`[Modbus Slave ${sessionId}] Error reading memory:`, e.message);
                return { success: false, error: e.message };
            }
        });

        // --- WRITE MEMORY (Frontend -> Backend) ---
        ipcMain.handle('modbus-slave:write-memory', async (_, sessionId, type, address, values) => {
            const s = sessions.get(sessionId);
            if (!s) return { error: "Server not running" };
            
            try {
                const buffer = s.buffers[type];
                if (!buffer) return { error: "Invalid memory type" };

                if (type === 'holding' || type === 'inputs') {
                    for (let i = 0; i < values.length; i++) {
                        const offset = (address + i) * 2;
                        if (offset + 1 < buffer.length) {
                            buffer.writeUInt16BE(values[i] & 0xFFFF, offset);
                        }
                    }
                } else {
                    for (let i = 0; i < values.length; i++) {
                        const byteIndex = Math.floor((address + i) / 8);
                        const bitIndex = (address + i) % 8;
                        if (byteIndex < buffer.length) {
                            if (values[i]) {
                                buffer[byteIndex] |= (1 << bitIndex);
                            } else {
                                buffer[byteIndex] &= ~(1 << bitIndex);
                            }
                        }
                    }
                }
                return { success: true };
            } catch (e) {
                return { error: e.message };
            }
        });
    }
};
