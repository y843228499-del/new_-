
const { ipcMain } = require('electron');
const net = require('net');
let SerialPort = null;
try {
    const serialport = require('serialport');
    SerialPort = serialport.SerialPort;
} catch (e) {
    console.error("Failed to load serialport module. RTU features will be disabled.", e);
}

let modbusModule = null;
const sessions = new Map();

// --- BUFFER UTILITIES ---
class ModbusAsciiWrapper {
    constructor(client) {
        this.client = client;
    }
    async writeSingleCoil(addr, val) { return this.client.writeCoil(addr, val); }
    async writeSingleRegister(addr, val) { return this.client.writeRegister(addr, val); }
    async writeMultipleCoils(addr, arr) { return this.client.writeCoils(addr, arr); }
    async writeMultipleRegisters(addr, arr) { return this.client.writeRegisters(addr, arr); }
    
    async _wrapRead(promise) {
        const res = await promise;
        return {
            response: {
                body: {
                    valuesAsArray: res.data,
                    valuesAsBuffer: res.buffer
                }
            }
        };
    }
    async readCoils(addr, len) { return this._wrapRead(this.client.readCoils(addr, len)); }
    async readDiscreteInputs(addr, len) { return this._wrapRead(this.client.readDiscreteInputs(addr, len)); }
    async readInputRegisters(addr, len) { return this._wrapRead(this.client.readInputRegisters(addr, len)); }
    async readHoldingRegisters(addr, len) { return this._wrapRead(this.client.readHoldingRegisters(addr, len)); }
}

function decodeBuffer(buffer, type, endianness) {
    if (!buffer || buffer.length === 0) return 0;
    
    if (type === 'Boolean') return buffer[0] > 0;

    let buf = Buffer.from(buffer); // Copy
    
    // 16-bit
    if (type === 'Int16' || type === 'UInt16') {
        if (buf.length < 2) return 0;
        if (type === 'Int16') return buf.readInt16BE(0);
        return buf.readUInt16BE(0);
    }

    // 32-bit (4 bytes)
    if (['Int32', 'UInt32', 'Float32'].includes(type)) {
        if (buf.length < 4) return 0;
        const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3];
        const target = Buffer.allocUnsafe(4);

        if (endianness === 'ABCD') { target[0]=b0; target[1]=b1; target[2]=b2; target[3]=b3; }
        else if (endianness === 'CDAB') { target[0]=b2; target[1]=b3; target[2]=b0; target[3]=b1; }
        else if (endianness === 'BADC') { target[0]=b1; target[1]=b0; target[2]=b3; target[3]=b2; }
        else if (endianness === 'DCBA') { target[0]=b3; target[1]=b2; target[2]=b1; target[3]=b0; }
        else { target[0]=b0; target[1]=b1; target[2]=b2; target[3]=b3; } 

        if (type === 'Int32') return target.readInt32BE(0);
        if (type === 'UInt32') return target.readUInt32BE(0);
        if (type === 'Float32') return Number(target.readFloatBE(0).toFixed(4));
    }

    // 64-bit (8 bytes)
    if (['Int64', 'UInt64', 'Float64'].includes(type)) {
        if (buf.length < 8) return 0;
        if (endianness === 'DCBA') buf.swap64(); 
        
        if (type === 'Int64') return Number(buf.readBigInt64BE(0));
        if (type === 'UInt64') return Number(buf.readBigUInt64BE(0));
        if (type === 'Float64') return Number(buf.readDoubleBE(0).toFixed(4));
    }

    if (type === 'Hex') return buf.toString('hex').toUpperCase().match(/.{1,2}/g).join(' ');
    if (type === 'String') return buf.toString('ascii').replace(/\x00/g, '');

    return 0;
}

function prepareWriteData(value, type, endianness) {
    if (type === 'Boolean') return !!value;

    const num = Number(value) || 0;
    
    // 16-bit
    if (type === 'Int16') {
        const buf = Buffer.alloc(2);
        buf.writeInt16BE(num);
        return [buf.readUInt16BE(0)]; 
    }
    if (type === 'UInt16') return [num & 0xFFFF];

    // 32-bit
    if (['Int32', 'UInt32', 'Float32'].includes(type)) {
        const buf = Buffer.alloc(4);
        if (type === 'Int32') buf.writeInt32BE(num);
        else if (type === 'UInt32') buf.writeUInt32BE(num);
        else buf.writeFloatBE(num);
        
        const b = buf;
        let words = [];
        // Swap logic
        if (endianness === 'ABCD') words = [(b[0]<<8)|b[1], (b[2]<<8)|b[3]];
        else if (endianness === 'CDAB') words = [(b[2]<<8)|b[3], (b[0]<<8)|b[1]];
        else if (endianness === 'BADC') words = [(b[1]<<8)|b[0], (b[3]<<8)|b[2]];
        else if (endianness === 'DCBA') words = [(b[3]<<8)|b[2], (b[1]<<8)|b[0]];
        else words = [(b[0]<<8)|b[1], (b[2]<<8)|b[3]];
        
        return words; 
    }
    
    // 64-bit
    if (['Float64', 'Int64', 'UInt64'].includes(type)) {
        const buf = Buffer.alloc(8);
        if (type === 'Float64') buf.writeDoubleBE(num);
        else buf.writeBigInt64BE(BigInt(Math.floor(num))); // simplified
        
        const words = [];
        for(let i=0; i<4; i++) words.push(buf.readUInt16BE(i*2));
        
        if (endianness === 'DCBA') words.reverse();
        return words;
    }

    return [num & 0xFFFF];
}

// --- HELPER: PROMISE TIMEOUT ---
function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} Timeout`)), ms))
    ]);
}

// --- HIGH RES POLLING MANAGER ---
// Use setImmediate loop + hrtime instead of setInterval to bypass Windows Timer Coalescing
class PollingManager {
    constructor(session, updatePowerSave, sendToWindow) {
        this.session = session;
        this.updatePowerSave = updatePowerSave;
        this.sendToWindow = sendToWindow;
        
        this.isScanning = false;
        this.registers = [];
        
        // Polling Strategy State
        this.globalInterval = 0; // 0 = Individual Mode, >0 = Global Override
        this.nextRunTime = 0;    // Used for global mode
        
        // Individual Mode State
        this.nextRunMap = new Map(); // register.id -> timestamp
        
        this.isRunningLoop = false;
    }

    updateConfig(registers, globalInterval) {
        this.registers = registers;
        this.globalInterval = Number(globalInterval); // 0 or positive integer
        
        // Clean up removed registers from map to prevent memory leak
        const currentIds = new Set(registers.map(r => r.id));
        for (const id of this.nextRunMap.keys()) {
            if (!currentIds.has(id)) this.nextRunMap.delete(id);
        }
        
        // If switching to global mode, reset global next run time to immediate
        if (this.globalInterval > 0 && this.isScanning) {
             // If we were in individual mode, this ensures immediate kickstart
             if (this.nextRunTime < Date.now()) this.nextRunTime = Date.now();
        }
    }

    start() {
        if (this.isScanning) return;
        this.isScanning = true;
        this.updatePowerSave();
        
        // Initialize Timers
        const now = Date.now();
        if (this.globalInterval > 0) {
            this.nextRunTime = now;
        } else {
            // Individual mode: Start all fresh
            this.registers.forEach(r => this.nextRunMap.set(r.id, now));
        }
        
        if (!this.isRunningLoop) {
            this.isRunningLoop = true;
            this.loop();
        }
    }

    stop() {
        this.isScanning = false;
        // Don't set isRunningLoop false immediately, allow current cycle to finish
        this.updatePowerSave();
    }

    // The Active Loop: Prevents CPU sleep by running frequently
    loop() {
        if (!this.isScanning) {
            this.isRunningLoop = false;
            return;
        }

        const now = Date.now();
        let registersToRun = [];
        let timeToNextRun = 1000; // Default safety sleep

        if (this.globalInterval > 0) {
            // --- GLOBAL MODE ---
            if (now >= this.nextRunTime) {
                registersToRun = this.registers;
                this.nextRunTime = now + this.globalInterval;
                timeToNextRun = this.globalInterval;
            } else {
                timeToNextRun = Math.max(10, this.nextRunTime - now);
            }
        } else {
            // --- INDIVIDUAL MODE ---
            let minNext = Infinity;
            
            for (const reg of this.registers) {
                if (reg.triggerType === 'Event') continue; // Skip event triggers
                
                const nextT = this.nextRunMap.get(reg.id) || 0; // Default 0 means run now
                
                if (now >= nextT) {
                    registersToRun.push(reg);
                } else {
                    if (nextT < minNext) minNext = nextT;
                }
            }

            if (registersToRun.length === 0) {
                if (minNext !== Infinity) {
                    timeToNextRun = Math.max(10, minNext - now);
                } else {
                    timeToNextRun = 100; // Empty list default
                }
            }
        }

        // Execute if tasks found
        if (registersToRun.length > 0) {
            this.executeCycle(registersToRun).then(() => {
                // Update next run times for individual mode AFTER execution start
                if (this.globalInterval <= 0) {
                    const afterNow = Date.now();
                    registersToRun.forEach(r => {
                        const interval = Math.max(10, r.scanRate || 1000);
                        this.nextRunMap.set(r.id, afterNow + interval);
                    });
                }
                // Yield to event loop
                setImmediate(() => this.loop());
            });
        } else {
            // Wait logic
            if (timeToNextRun > 50) {
                setTimeout(() => this.loop(), 20); 
            } else {
                setImmediate(() => this.loop());
            }
        }
    }

    async executeSingleRegister(reg) {
        return await this.executeCycle([reg], true);
    }

    async executeCycle(registersToProcess, isManual = false) {
        const startTime = Date.now();
        const { client, socket, sessionId } = this.session;

        // Check connection health
        if (!socket || socket.destroyed || !socket.writable || (socket.isOpen === false)) {
            this.isScanning = false; 
            return;
        }

        const updates = {};
        let hasUpdates = false;
        const requestTimeout = this.session.timeout || 2000;

        for (const reg of registersToProcess) {
            if (!this.isScanning && !isManual) break;
            
            // Double check trigger type in case config changed mid-loop
            if (!isManual && reg.triggerType === 'Event') continue;

            try {
                let res;
                let readLen = reg.length;
                
                // Calculate correct Read Length for Registers
                if (['Int32', 'UInt32', 'Float32'].includes(reg.dataType)) readLen = reg.length * 2;
                else if (['Int64', 'UInt64', 'Float64'].includes(reg.dataType)) readLen = reg.length * 4;
                readLen = Math.max(1, readLen);

                // --- WRITE FUNCTION CODES (Cyclic Write) ---
                if (['05', '06', '15', '16'].includes(reg.functionCode)) {
                    
                    if (reg.functionCode === '05') {
                        // Write Single Coil (expects boolean)
                        res = await withTimeout(client.writeSingleCoil(reg.address, !!reg.value), requestTimeout, 'WriteCoil');
                    } else if (reg.functionCode === '06') {
                        // Write Single Register (expects UInt16 value, not array)
                        const words = prepareWriteData(reg.value, reg.dataType, reg.endianness);
                        res = await withTimeout(client.writeSingleRegister(reg.address, words[0]), requestTimeout, 'WriteReg');
                    } else if (reg.functionCode === '15') {
                        // Write Multiple Coils (expects boolean array)
                        const arr = Array.isArray(reg.value) ? reg.value.map(v => !!v) : [!!reg.value];
                        res = await withTimeout(client.writeMultipleCoils(reg.address, arr), requestTimeout, 'WriteMultiCoils');
                    } else if (reg.functionCode === '16') {
                        // Write Multiple Registers (expects UInt16 array)
                        let payload = [];
                        if (Array.isArray(reg.value)) {
                            // If user provided array of values (e.g. 5 Int32s), flatten them to words
                            for(const v of reg.value) {
                                payload = payload.concat(prepareWriteData(v, reg.dataType, reg.endianness));
                            }
                        } else {
                            // Single value (e.g. one Int32 spanning 2 registers)
                            payload = prepareWriteData(reg.value, reg.dataType, reg.endianness);
                        }
                        res = await withTimeout(client.writeMultipleRegisters(reg.address, payload), requestTimeout, 'WriteMultiRegs');
                    }
                    
                    // For writes, we don't get a read-back value. Just mark status.
                    updates[reg.id] = { status: 'Good (Write)', lastLatency: Date.now() - startTime };
                    hasUpdates = true;

                } else {
                    // --- READ FUNCTION CODES ---
                    if (['01'].includes(reg.functionCode)) {
                        res = await withTimeout(client.readCoils(reg.address, readLen), requestTimeout, 'ReadCoils');
                    } else if (['02'].includes(reg.functionCode)) {
                        res = await withTimeout(client.readDiscreteInputs(reg.address, readLen), requestTimeout, 'ReadDiscrete');
                    } else if (['04'].includes(reg.functionCode)) {
                        res = await withTimeout(client.readInputRegisters(reg.address, readLen), requestTimeout, 'ReadInput');
                    } else {
                        // Default to 03 Holding Registers
                        res = await withTimeout(client.readHoldingRegisters(reg.address, readLen), requestTimeout, 'ReadHolding');
                    }

                    // Process Read Response
                    const body = res.response.body;
                    let rawValue;

                    if (['01', '02'].includes(reg.functionCode)) {
                        const bits = body.valuesAsArray || body.values; 
                        rawValue = (reg.length === 1) ? bits[0] : bits.slice(0, reg.length);
                    } else {
                        const buffer = body.valuesAsBuffer; 
                        if (reg.length > 1) {
                            const itemByteSize = (readLen * 2) / reg.length; 
                            const arr = [];
                            for(let k=0; k<reg.length; k++) {
                                const chunk = buffer.slice(k*itemByteSize, (k+1)*itemByteSize);
                                arr.push(decodeBuffer(chunk, reg.dataType, reg.endianness));
                            }
                            rawValue = arr;
                        } else {
                            rawValue = decodeBuffer(buffer, reg.dataType, reg.endianness);
                        }
                    }
                    updates[reg.id] = { value: rawValue, status: 'Good', lastLatency: Date.now() - startTime };
                    hasUpdates = true;
                }

            } catch (e) {
                updates[reg.id] = { status: 'Bad', error: e.message };
                hasUpdates = true;
                if (e.message.includes('Closed') || e.message.includes('destroyed')) {
                    this.isScanning = false;
                    break; 
                }
            }
        }

        if (hasUpdates) {
            this.sendToWindow('modbus:data', { sessionId, updates });
        }
    }
}

async function getModbus() {
    if (!modbusModule) {
        try {
            const mod = await import("jsmodbus");
            modbusModule = mod.default || mod;
        } catch (err) {
            console.error("[Modbus] Failed to load jsmodbus:", err);
            throw new Error("Modbus Driver not found.");
        }
    }
    return modbusModule;
}

module.exports = {
    hasActiveSessions: () => sessions.size > 0,

    closeAll: async () => {
        for (const [id, s] of sessions.entries()) {
            try {
                if (s.poller) s.poller.stop();
                if (s.socket) {
                    s.socket.removeAllListeners();
                    s.socket.end();
                    s.socket.destroy();
                }
            } catch (e) { console.error(`Modbus Close Error (${id}):`, e.message); }
        }
        sessions.clear();
    },

    register: (ipcMain, updatePowerSave, sendToWindow) => {
        
        // --- CONNECT ---
        ipcMain.handle('modbus:connect', async (_, sessionId, ip, port, unitId, timeout, useActiveProbe, localBindIp) => {
            try {
                const cleanIp = (ip || '').trim();
                const cleanLocalIp = (localBindIp || '').trim();
                if (net.isIP(cleanIp) === 0) return { success: false, error: `Invalid IP: ${cleanIp}` };
                
                const reqTimeout = Number(timeout) || 1000;
                const jsmodbus = await getModbus();
                
                return new Promise((resolve) => {
                    const socket = new net.Socket();
                    const client = new jsmodbus.client.TCP(socket, unitId);
                    let isResolved = false;

                    const cleanup = () => {
                        socket.removeAllListeners('connect');
                        socket.removeAllListeners('error');
                        socket.removeAllListeners('close');
                        socket.removeAllListeners('timeout');
                    };

                    const handleFailure = (reason) => {
                        if (isResolved) return;
                        isResolved = true;
                        cleanup();
                        socket.destroy(); 
                        resolve({ success: false, error: reason });
                    };

                    socket.setTimeout(3000); 
                    socket.on('timeout', () => handleFailure("Connection Timed Out"));
                    socket.on('error', (err) => handleFailure(`Socket Error: ${err.message}`));
                    socket.on('close', () => handleFailure("Socket Closed"));

                    socket.on('connect', async () => {
                        socket.setTimeout(0); 
                        
                        // Hook raw frames
                        socket.on('data', (data) => {
                            const hex = data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                            sendToWindow('modbus:log', { 
                                sessionId, 
                                level: 'debug', 
                                message: `[原始报文] RX: ${hex}`,
                                timestamp: new Date().toISOString()
                            });
                        });
                        
                        const originalWrite = socket.write;
                        socket.write = function(data, encoding, callback) {
                            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                            const hex = buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                            sendToWindow('modbus:log', { 
                                sessionId, 
                                level: 'debug', 
                                message: `[原始报文] TX: ${hex}`,
                                timestamp: new Date().toISOString()
                            });
                            return originalWrite.apply(this, arguments);
                        };
                        
                        if (useActiveProbe) {
                            try {
                                await withTimeout(client.readHoldingRegisters(0, 1), reqTimeout + 500, "ActiveProbe");
                            } catch (e) {
                                // Ignore probe failures
                            }
                        }

                        if (isResolved) return;
                        isResolved = true;
                        cleanup();

                        // AGGRESSIVE KEEPALIVE
                        socket.setNoDelay(true); // Disable Nagle algorithm
                        socket.setKeepAlive(true, 500); // Send TCP KeepAlive every 500ms
                        socket.ref(); 

                        socket.on('close', () => {
                            const s = sessions.get(sessionId);
                            if (s) {
                                if (s.poller) s.poller.stop();
                                sendToWindow('modbus:connection:drop', { sessionId });
                                sessions.delete(sessionId);
                                updatePowerSave();
                            }
                        });
                        
                        socket.on('error', (e) => console.error(`[Modbus ${sessionId}] Error: ${e.message}`));

                        const poller = new PollingManager({ client, socket, sessionId, timeout: reqTimeout }, updatePowerSave, sendToWindow);
                        sessions.set(sessionId, { client, socket, poller });
                        updatePowerSave();
                        
                        resolve({ success: true, clientPort: socket.localPort });
                    });

                    const connectOptions = { host: cleanIp, port: port };
                    if (cleanLocalIp && net.isIP(cleanLocalIp)) {
                        connectOptions.localAddress = cleanLocalIp;
                        console.log(`[Modbus ${sessionId}] Binding to local IP: ${cleanLocalIp}`);
                    }
                    socket.connect(connectOptions);
                });
            } catch (e) { return { success: false, error: e.message }; }
        });

        // --- RTU/ASCII CONNECT ---
        ipcMain.handle('modbus:rtu:connect', async (_, sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, timeout, useActiveProbe, transport = 'RTU') => {
            try {
                if (!SerialPort) return { success: false, error: 'serialport module is not installed. Please run npm install.' };
                if (!comPort) return { success: false, error: 'COM Port is required' };
                
                const reqTimeout = Number(timeout) || 1000;
                const jsmodbus = await getModbus();
                
                return new Promise((resolve) => {
                    if (transport === 'ASCII') {
                        try {
                            const ModbusRTU = require("modbus-serial");
                            const mClient = new ModbusRTU();
                            mClient.setTimeout(reqTimeout);
                            
                            mClient.connectAsciiSerial(comPort, {
                                baudRate: Number(baudRate) || 9600,
                                dataBits: Number(dataBits) || 8,
                                stopBits: Number(stopBits) || 1,
                                parity: parity || 'none'
                            }, async (err) => {
                                if (err) {
                                    return resolve({ success: false, error: `Failed to open port: ${err.message}` });
                                }
                                
                                mClient.setID(unitId);
                                const client = new ModbusAsciiWrapper(mClient);
                                
                                // Hook raw frames
                                let port = mClient._port || mClient.port || mClient._serialPort || mClient.serialPort;
                                if (port && port._realPort) port = port._realPort;
                                
                                if (port && typeof port.on === 'function') {
                                    port.on('data', (data) => {
                                        const hex = data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                                        sendToWindow('modbus:log', { 
                                            sessionId, 
                                            level: 'debug', 
                                            message: `[原始报文] RX: ${hex}`,
                                            timestamp: new Date().toISOString()
                                        });
                                    });
                                    
                                    const originalWrite = port.write;
                                    if (typeof originalWrite === 'function') {
                                        port.write = function(data, encoding, callback) {
                                            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                                            const hex = buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                                            sendToWindow('modbus:log', { 
                                                sessionId, 
                                                level: 'debug', 
                                                message: `[原始报文] TX: ${hex}`,
                                                timestamp: new Date().toISOString()
                                            });
                                            return originalWrite.apply(this, arguments);
                                        };
                                    }
                                }

                                const socket = {
                                    get isOpen() { return mClient.isOpen; },
                                    get destroyed() { return !mClient.isOpen; },
                                    get writable() { return mClient.isOpen; },
                                    close: () => mClient.close()
                                };
                                
                                if (useActiveProbe) {
                                    try {
                                        await withTimeout(client.readHoldingRegisters(0, 1), reqTimeout + 500, "ActiveProbe");
                                    } catch (e) {
                                        // Ignore probe failures
                                    }
                                }
                                
                                const poller = new PollingManager({ client, socket, sessionId, timeout: reqTimeout }, updatePowerSave, sendToWindow);
                                sessions.set(sessionId, { client, socket, poller, mClient });
                                updatePowerSave();
                                
                                mClient.on('close', () => {
                                    const s = sessions.get(sessionId);
                                    if (s) {
                                        if (s.poller) s.poller.stop();
                                        sendToWindow('modbus:connection:drop', { sessionId });
                                        sessions.delete(sessionId);
                                        updatePowerSave();
                                    }
                                });
                                
                                resolve({ success: true, clientPort: comPort });
                            });
                        } catch (e) {
                            resolve({ success: false, error: e.message });
                        }
                        return;
                    }

                    const socket = new SerialPort({
                        path: comPort,
                        baudRate: Number(baudRate) || 9600,
                        dataBits: Number(dataBits) || 8,
                        stopBits: Number(stopBits) || 1,
                        parity: parity || 'none',
                        autoOpen: false
                    });
                    
                    const client = new jsmodbus.client.RTU(socket, unitId);
                    let isResolved = false;

                    const cleanup = () => {
                        socket.removeAllListeners('open');
                        socket.removeAllListeners('error');
                        socket.removeAllListeners('close');
                    };

                    const handleFailure = (reason) => {
                        if (isResolved) return;
                        isResolved = true;
                        cleanup();
                        if (socket.isOpen) socket.close();
                        resolve({ success: false, error: reason });
                    };

                    socket.on('error', (err) => handleFailure(`SerialPort Error: ${err.message}`));
                    socket.on('close', () => handleFailure("SerialPort Closed"));

                    socket.open(async (err) => {
                        if (err) {
                            return handleFailure(`Failed to open port: ${err.message}`);
                        }
                        
                        // Hook raw frames
                        socket.on('data', (data) => {
                            const hex = data.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                            sendToWindow('modbus:log', { 
                                sessionId, 
                                level: 'debug', 
                                message: `[原始报文] RX: ${hex}`,
                                timestamp: new Date().toISOString()
                            });
                        });
                        
                        const originalWrite = socket.write;
                        socket.write = function(data, encoding, callback) {
                            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                            const hex = buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                            sendToWindow('modbus:log', { 
                                sessionId, 
                                level: 'debug', 
                                message: `[原始报文] TX: ${hex}`,
                                timestamp: new Date().toISOString()
                            });
                            return originalWrite.apply(this, arguments);
                        };
                        
                        if (useActiveProbe) {
                            try {
                                await withTimeout(client.readHoldingRegisters(0, 1), reqTimeout + 500, "ActiveProbe");
                            } catch (e) {
                                // Ignore probe failures
                            }
                        }

                        if (isResolved) return;
                        isResolved = true;
                        cleanup();

                        socket.on('close', () => {
                            const s = sessions.get(sessionId);
                            if (s) {
                                if (s.poller) s.poller.stop();
                                sendToWindow('modbus:connection:drop', { sessionId });
                                sessions.delete(sessionId);
                                updatePowerSave();
                            }
                        });
                        
                        socket.on('error', (e) => console.error(`[Modbus RTU ${sessionId}] Error: ${e.message}`));

                        // RTU client uses the same PollingManager, but we need to ensure the socket interface matches what PollingManager expects
                        // PollingManager checks `!socket || socket.destroyed || !socket.writable`
                        // SerialPort has `isOpen` instead of `destroyed`/`writable`, but we can mock or adapt it if needed.
                        // Actually, SerialPort is a Duplex stream, so it has `writable` and `destroyed`.
                        const poller = new PollingManager({ client, socket, sessionId, timeout: reqTimeout }, updatePowerSave, sendToWindow);
                        sessions.set(sessionId, { client, socket, poller });
                        updatePowerSave();
                        
                        resolve({ success: true, clientPort: comPort });
                    });
                });
            } catch (e) { return { success: false, error: e.message }; }
        });

        // --- LIST COM PORTS ---
        ipcMain.handle('modbus:list-ports', async () => {
            try {
                if (!SerialPort) return { success: true, ports: [] };
                const ports = await SerialPort.list();
                return { success: true, ports: ports.map(p => p.path) };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        // --- TCP SERVER START ---
        ipcMain.handle('modbus:tcp:server:start', async (_, sessionId, ip, port, unitId) => {
            try {
                const cleanIp = (ip || '').trim() || '0.0.0.0';
                const cleanPort = Number(port) || 502;
                
                const jsmodbus = await getModbus();
                
                return new Promise((resolve) => {
                    const netServer = new net.Server();
                    
                    // Allocate memory: 10000 registers (20000 bytes) for holding/input, 10000 bytes for coils/discrete
                    const buffers = {
                        holding: Buffer.alloc(20000),
                        input: Buffer.alloc(20000),
                        coils: Buffer.alloc(10000),
                        discrete: Buffer.alloc(10000)
                    };
                    
                    const modbusServer = new jsmodbus.server.TCP(netServer, {
                        holding: buffers.holding,
                        input: buffers.input,
                        coils: buffers.coils,
                        discrete: buffers.discrete
                    });

                    modbusServer.on('error', (err) => {
                        console.error('[Modbus Server] jsmodbus Server Error:', err);
                    });

                    netServer.on('error', (err) => {
                        resolve({ success: false, error: err.message });
                    });
                    
                    netServer.on('connection', (socket) => {
                        socket.on('error', (err) => {
                            console.error('[Modbus Server] Client socket error:', err.message);
                        });
                    });

                    netServer.listen(cleanPort, cleanIp, () => {
                        sessions.set(sessionId, { 
                            isServer: true, 
                            netServer, 
                            modbusServer, 
                            buffers 
                        });
                        
                        // Listen for writes from clients
                        modbusServer.on('postWriteSingleCoil', (req) => {
                            sendToWindow('modbus:server:written', { sessionId, type: 'coils', address: req.address, value: req.value });
                        });
                        modbusServer.on('postWriteSingleRegister', (req) => {
                            sendToWindow('modbus:server:written', { sessionId, type: 'holding', address: req.address, value: req.value });
                        });
                        modbusServer.on('postWriteMultipleCoils', (req) => {
                            sendToWindow('modbus:server:written', { sessionId, type: 'coils', address: req.address, length: req.quantity });
                        });
                        modbusServer.on('postWriteMultipleRegisters', (req) => {
                            sendToWindow('modbus:server:written', { sessionId, type: 'holding', address: req.address, length: req.quantity });
                        });

                        resolve({ success: true, clientPort: cleanPort });
                    });
                });
            } catch (e) { return { success: false, error: e.message }; }
        });

        // --- SERVER DISCONNECT ---
        // Handled by existing modbus:disconnect which we will update to support servers

        // --- SERVER READ MEMORY ---
        ipcMain.handle('modbus:server:read', (_, sessionId, type, address, length, dataType, endianness) => {
            const s = sessions.get(sessionId);
            if (!s || !s.isServer) return null;
            
            try {
                const buf = s.buffers[type];
                if (!buf) return null;

                if (type === 'coils' || type === 'discrete') {
                    // jsmodbus uses 1 byte per coil/discrete in its buffer representation internally?
                    // Actually jsmodbus uses 1 byte per coil in the buffer.
                    // Let's read it as bytes.
                    const val = buf.readUInt8(address);
                    return val > 0;
                } else {
                    // holding or input
                    const byteOffset = address * 2;
                    let readLen = length * 2;
                    if (['Int32', 'UInt32', 'Float32'].includes(dataType)) readLen = length * 4;
                    else if (['Int64', 'UInt64', 'Float64'].includes(dataType)) readLen = length * 8;
                    
                    const chunk = buf.slice(byteOffset, byteOffset + readLen);
                    return decodeBuffer(chunk, dataType, endianness);
                }
            } catch (e) {
                console.error("Server Read Error:", e);
                return null;
            }
        });

        // --- SERVER WRITE MEMORY ---
        ipcMain.handle('modbus:server:write', (_, sessionId, type, address, value, dataType, endianness) => {
            const s = sessions.get(sessionId);
            if (!s || !s.isServer) return false;
            
            try {
                const buf = s.buffers[type];
                if (!buf) return false;

                if (type === 'coils' || type === 'discrete') {
                    buf.writeUInt8(value ? 1 : 0, address);
                } else {
                    const byteOffset = address * 2;
                    const words = prepareWriteData(value, dataType, endianness);
                    for (let i = 0; i < words.length; i++) {
                        buf.writeUInt16BE(words[i], byteOffset + (i * 2));
                    }
                }
                return true;
            } catch (e) {
                console.error("Server Write Error:", e);
                return false;
            }
        });

        // --- DISCONNECT ---
        ipcMain.handle('modbus:disconnect', async (_, sessionId) => {
            const s = sessions.get(sessionId);
            if (s) {
                if (s.isServer) {
                    if (s.netServer) {
                        s.netServer.close();
                    }
                } else {
                    if (s.poller) s.poller.stop();
                    if (s.mClient) s.mClient.close();
                    if (s.socket) { 
                        if (s.socket.end) s.socket.end(); 
                        if (s.socket.destroy) s.socket.destroy(); 
                        if (s.socket.close && s.socket.isOpen) s.socket.close(); // For SerialPort
                    }
                }
                sessions.delete(sessionId);
                updatePowerSave();
            }
            return { success: true };
        });

        // --- POLLING CONTROLS ---
        ipcMain.handle('modbus:poll:start', async (_, sessionId, registers, interval) => {
            const s = sessions.get(sessionId);
            if (s && s.poller) {
                s.poller.updateConfig(registers, interval);
                s.poller.start();
                return { success: true };
            }
            return { error: "Session not active" };
        });

        ipcMain.handle('modbus:poll:stop', async (_, sessionId) => {
            const s = sessions.get(sessionId);
            if (s && s.poller) {
                s.poller.stop();
                return { success: true };
            }
            return { error: "Session not active" };
        });

        ipcMain.handle('modbus:poll:update', async (_, sessionId, registers, interval) => {
            const s = sessions.get(sessionId);
            if (s && s.poller) {
                s.poller.updateConfig(registers, interval);
                return { success: true };
            }
            return { error: "Session not active" };
        });

        // --- DIRECT WRITE ---
        ipcMain.handle('modbus:write', async (_, sessionId, fc, address, value) => {
            const s = sessions.get(sessionId);
            if (!s) return { error: "Not connected" };
            try {
                let res;
                const writeTimeout = 2000;
                
                if (fc === '05') res = await withTimeout(s.client.writeSingleCoil(address, value), writeTimeout, 'WriteSingleCoil');
                else if (fc === '06') res = await withTimeout(s.client.writeSingleRegister(address, value), writeTimeout, 'WriteSingleReg');
                else if (fc === '15') res = await withTimeout(s.client.writeMultipleCoils(address, value), writeTimeout, 'WriteMultiCoil');
                else if (fc === '16') res = await withTimeout(s.client.writeMultipleRegisters(address, value), writeTimeout, 'WriteMultiReg');
                else return { error: "Unsupported Write FC " + fc };
                
                return { success: true };
            } catch (e) {
                if (e.message.includes('Timeout')) {
                    console.warn(`[Backend] Write Timeout. Destroying socket.`);
                    if(s.socket) s.socket.destroy();
                }
                return { error: e.message };
            }
        });

        ipcMain.handle('modbus:trigger', async (_, sessionId, register) => {
            const s = sessions.get(sessionId);
            if (s && s.poller) {
                try {
                    await s.poller.executeSingleRegister(register);
                    return { success: true };
                } catch (e) {
                    return { error: e.message };
                }
            }
            return { error: "Session not active" };
        });
        
        ipcMain.handle('modbus:read', async () => ({ error: "Deprecated. Use Polling." }));
    }
};