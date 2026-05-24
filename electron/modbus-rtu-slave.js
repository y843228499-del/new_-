
const { ipcMain } = require('electron');
const ModbusRTU = require('modbus-serial');
const { Transform } = require('stream');
const calculateLrc = require('modbus-serial/utils/lrc');
const crc16 = require('modbus-serial/utils/crc16');

class AsciiToRtuTransform extends Transform {
    constructor() {
        super();
        this.buffer = Buffer.alloc(0);
    }
    _transform(chunk, encoding, cb) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
            const frame = this.buffer.slice(0, idx + 1);
            this.buffer = this.buffer.slice(idx + 1);
            
            if (frame[0] === 0x3A) { // ':'
                try {
                    const asciiStr = frame.toString('ascii').trim();
                    if (asciiStr.length >= 7) { // Minimum: ':' + UnitID(2) + FC(2) + LRC(2) = 7
                        const hexStr = asciiStr.substring(1); // remove ':'
                        const bufDecoded = Buffer.from(hexStr, 'hex');
                        if (bufDecoded.length >= 3) {
                            const lrcIn = bufDecoded[bufDecoded.length - 1];
                            const calcLrc = calculateLrc(bufDecoded.slice(0, -1));
                            if (lrcIn === calcLrc) {
                                // Convert to RTU frame (add CRC)
                                const rtuBuf = Buffer.alloc(bufDecoded.length + 1);
                                bufDecoded.copy(rtuBuf, 0, 0, bufDecoded.length - 1);
                                const crc = crc16(rtuBuf.slice(0, -2));
                                rtuBuf.writeUInt16LE(crc, rtuBuf.length - 2);
                                this.push(rtuBuf);
                            } else {
                                console.warn(`[Modbus ASCII] LRC mismatch: expected ${calcLrc.toString(16)}, got ${lrcIn.toString(16)}`);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[Modbus ASCII] Frame parsing error:`, e);
                }
            }
        }
        cb();
    }
}

class RtuToAsciiTransform extends Transform {
    _transform(chunk, encoding, cb) {
        if (chunk.length >= 4) {
            // chunk is an RTU frame with CRC
            const data = chunk.slice(0, -2);
            const lrc = calculateLrc(data);
            const asciiStr = ':' + data.toString('hex').toUpperCase() + lrc.toString(16).padStart(2, '0').toUpperCase() + '\r\n';
            this.push(Buffer.from(asciiStr, 'ascii'));
        }
        cb();
    }
}

class FakeAsciiPort extends require('events') {
    constructor(realPort) {
        super();
        this.realPort = realPort;
        this._realPort = realPort; // For raw logging
        this.asciiToRtu = new AsciiToRtuTransform();
        this.rtuToAscii = new RtuToAsciiTransform();
        
        this.realPort.pipe(this.asciiToRtu);
        this.rtuToAscii.pipe(this.realPort);
        
        this.realPort.on('open', () => this.emit('open'));
        this.realPort.on('close', () => this.emit('close'));
        this.realPort.on('error', (err) => this.emit('error', err));
        
        this.on('error', () => {}); // Catch all propagated errors
    }
    pipe(dest) {
        return this.asciiToRtu.pipe(dest);
    }
    write(data) {
        this.rtuToAscii.write(data);
    }
    close(cb) {
        this.realPort.close(cb);
    }
    get isOpen() {
        return this.realPort.isOpen;
    }
}

let SerialPort = null;
try {
    const serialport = require('serialport');
    SerialPort = serialport.SerialPort;
} catch (e) {
    console.error("Failed to load serialport module for Modbus RTU Slave.", e);
}

const sessions = new Map();

module.exports = {
    hasActiveSessions: () => sessions.size > 0,

    closeAll: async () => {
        for (const [id, s] of sessions.entries()) {
            try {
                if (s.server) s.server.close();
            } catch (e) { console.error(`Modbus RTU Slave Close Error (${id}):`, e.message); }
        }
        sessions.clear();
    },

    register: (ipcMain, updatePowerSave, sendToWindow) => {
        
        // --- START RTU/ASCII SLAVE ---
        ipcMain.handle('modbus-rtu-slave:start', async (_, sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, memorySize = 20000, transport = 'RTU') => {
            try {
                if (sessions.has(sessionId)) {
                    return { success: false, error: "Session already exists" };
                }

                if (!SerialPort) {
                    return { success: false, error: "SerialPort module not available" };
                }

                console.log(`[Modbus RTU Slave ${sessionId}] Initializing with options:`, { comPort, baudRate, unitId });
                sendToWindow('modbus-rtu-slave:log', { 
                    sessionId, 
                    level: 'info', 
                    message: `正在初始化 Modbus RTU 从站: ${comPort} (${baudRate}), SerialPort 可用: ${!!SerialPort}`,
                    timestamp: new Date().toISOString()
                });

                // Allocate memory buffers (same as TCP Slave for consistency)
                const holding = Buffer.alloc(memorySize * 2); 
                const coils = Buffer.alloc(memorySize * 2);
                const inputs = Buffer.alloc(memorySize * 2);
                const discrete = Buffer.alloc(memorySize * 2);

                const vector = {
                    getCoil: (addr) => {
                        const byteIndex = Math.floor(addr / 8);
                        const bitIndex = addr % 8;
                        if (byteIndex >= coils.length) return false;
                        const val = (coils[byteIndex] & (1 << bitIndex)) !== 0;
                        
                        sendToWindow('modbus-rtu-slave:log', { 
                            sessionId, 
                            level: 'info', 
                            message: `主站读取线圈 (Coil) 地址 ${addr}: ${val}`,
                            timestamp: new Date().toISOString()
                        });
                        return val;
                    },
                    getDiscreteInput: (addr) => {
                        const byteIndex = Math.floor(addr / 8);
                        const bitIndex = addr % 8;
                        if (byteIndex >= discrete.length) return false;
                        const val = (discrete[byteIndex] & (1 << bitIndex)) !== 0;

                        sendToWindow('modbus-rtu-slave:log', { 
                            sessionId, 
                            level: 'info', 
                            message: `主站读取离散输入 (Discrete Input) 地址 ${addr}: ${val}`,
                            timestamp: new Date().toISOString()
                        });
                        return val;
                    },
                    getHoldingRegister: (addr) => {
                        const offset = addr * 2;
                        if (offset + 1 >= holding.length) return 0;
                        const val = holding.readUInt16BE(offset);

                        sendToWindow('modbus-rtu-slave:log', { 
                            sessionId, 
                            level: 'info', 
                            message: `主站读取保持寄存器 (Holding Register) 地址 ${addr}: ${val}`,
                            timestamp: new Date().toISOString()
                        });
                        return val;
                    },
                    getInputRegister: (addr) => {
                        const offset = addr * 2;
                        if (offset + 1 >= inputs.length) return 0;
                        const val = inputs.readUInt16BE(offset);

                        sendToWindow('modbus-rtu-slave:log', { 
                            sessionId, 
                            level: 'info', 
                            message: `主站读取输入寄存器 (Input Register) 地址 ${addr}: ${val}`,
                            timestamp: new Date().toISOString()
                        });
                        return val;
                    },
                    setCoil: (addr, val) => {
                        const byteIndex = Math.floor(addr / 8);
                        const bitIndex = addr % 8;
                        if (byteIndex < coils.length) {
                            if (val) {
                                coils[byteIndex] |= (1 << bitIndex);
                            } else {
                                coils[byteIndex] &= ~(1 << bitIndex);
                            }
                            
                            sendToWindow('modbus-rtu-slave:data-changed', { 
                                sessionId, 
                                type: 'coils', 
                                address: addr, 
                                length: 1, 
                                action: 'write' 
                            });

                            sendToWindow('modbus-rtu-slave:log', { 
                                sessionId, 
                                level: 'info', 
                                message: `主站写入线圈 (Coil) 地址 ${addr}: ${val}`,
                                timestamp: new Date().toISOString()
                            });
                        }
                    },
                    setRegister: (addr, val) => {
                        const offset = addr * 2;
                        if (offset + 1 < holding.length) {
                            holding.writeUInt16BE(val, offset);
                            
                            sendToWindow('modbus-rtu-slave:data-changed', { 
                                sessionId, 
                                type: 'holding', 
                                address: addr, 
                                length: 1, 
                                action: 'write' 
                            });

                            sendToWindow('modbus-rtu-slave:log', { 
                                sessionId, 
                                level: 'info', 
                                message: `主站写入保持寄存器 (Holding Register) 地址 ${addr}: ${val}`,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                };

                const modbusKeys = Object.keys(ModbusRTU);
                console.log(`[Modbus RTU Slave ${sessionId}] ModbusRTU keys:`, modbusKeys);
                sendToWindow('modbus-rtu-slave:log', { 
                    sessionId, 
                    level: 'info', 
                    message: `驱动库可用接口: ${modbusKeys.join(', ')}`,
                    timestamp: new Date().toISOString()
                });

                const options = {
                    path: comPort,
                    baudRate: Number(baudRate) || 9600,
                    parity: parity || 'none',
                    unitID: Number(unitId) || 1
                };
                
                const serialportOptions = {
                    dataBits: Number(dataBits) || 8,
                    stopBits: Number(stopBits) || 1
                };

                let serverRTU;
                let sharedPort;
                let realPort;

                return new Promise((resolve) => {
                    try {
                        sharedPort = require('./shared-serial-port').getSharedPort(comPort, {
                            baudRate: Number(baudRate) || 9600,
                            dataBits: Number(dataBits) || 8,
                            stopBits: Number(stopBits) || 1,
                            parity: parity || 'none'
                        });

                        if (!sharedPort) {
                            resolve({ success: false, error: "SerialPort module not available" });
                            return;
                        }

                        realPort = sharedPort.realPort;

                        if (transport === 'ASCII') {
                            if (typeof ModbusRTU.ServerSerial !== 'function') {
                                resolve({ success: false, error: 'ModbusRTU.ServerSerial is not available for ASCII transport' });
                                return;
                            }
                            console.log(`[Modbus ASCII Slave ${sessionId}] Using ASCII Wrapper`);
                            
                            const fakePort = new FakeAsciiPort(realPort);
                            
                            // Instantiate ServerSerial with options (including unitID) but don't open it automatically
                            serverRTU = new ModbusRTU.ServerSerial(vector, options, { autoOpen: false });
                            
                            // Override the internal _serverPath write method to use our fake port
                            if (serverRTU._serverPath) {
                                // Add empty error listener to prevent uncaught exceptions when emitting error
                                serverRTU._serverPath.on('error', () => {});
                                
                                serverRTU._serverPath.write = function(data) {
                                    fakePort.write(data);
                                };
                                
                                // Propagate errors from realPort to _serverPath so ServerSerial can handle them
                                realPort.on('error', (err) => {
                                    serverRTU._serverPath.emit('error', err);
                                });
                            }
                            
                            // Override close to cleanup
                            serverRTU.close = function(cb) {
                                console.log(`[Modbus ASCII Slave ${sessionId}] Closing session`);
                                sharedPort.release();
                                if (cb) cb();
                            };
                            
                            // Pipe our fake port (which emits complete RTU frames) to the server's parser
                            if (serverRTU._server) {
                                fakePort.pipe(serverRTU._server);
                            }
                            
                            sharedPort.acquire((err) => {
                                if (err) {
                                    sharedPort.release();
                                    resolve({ success: false, error: `串口打开失败: ${err.message}` });
                                } else {
                                    // Manually emit 'open' on the dummy port to trigger ServerSerial's internal initialization
                                    if (serverRTU._serverPath) {
                                        serverRTU._serverPath.emit('open');
                                    }
                                    finishStart();
                                }
                            });
                            return;
                        }

                        if (typeof ModbusRTU.ServerSerial === 'function') {
                            console.log(`[Modbus RTU Slave ${sessionId}] Using ModbusRTU.ServerSerial with shared port`);
                            sendToWindow('modbus-rtu-slave:log', { 
                                sessionId, 
                                level: 'info', 
                                message: `使用共享串口模式`,
                                timestamp: new Date().toISOString()
                            });
                            
                            serverRTU = new ModbusRTU.ServerSerial(vector, options, { autoOpen: false });
                            
                            if (serverRTU._serverPath) {
                                serverRTU._serverPath.on('error', () => {});
                                serverRTU._serverPath.write = function(data) {
                                    realPort.write(data);
                                };
                                realPort.on('error', (err) => {
                                    serverRTU._serverPath.emit('error', err);
                                });
                            }
                            
                            // Override close to cleanup
                            serverRTU.close = function(cb) {
                                console.log(`[Modbus RTU Slave ${sessionId}] Closing session`);
                                sharedPort.release();
                                if (cb) cb();
                            };
                            
                            if (serverRTU._server) {
                                // Pipe realPort data to this server's parser
                                // We use a PassThrough to avoid max listeners or pipe issues if needed, 
                                // but direct pipe is also fine since Node streams handle multiple destinations.
                                realPort.pipe(serverRTU._server);
                            }
                            
                            sharedPort.acquire((err) => {
                                if (err) {
                                    console.error(`[Modbus RTU Slave ${sessionId}] Open Error:`, err);
                                    sharedPort.release();
                                    sendToWindow('modbus-rtu-slave:log', { 
                                        sessionId, 
                                        level: 'error', 
                                        message: `串口打开失败: ${err.message}`,
                                        timestamp: new Date().toISOString()
                                    });
                                    resolve({ success: false, error: `串口打开失败: ${err.message}` });
                                } else {
                                    sendToWindow('modbus-rtu-slave:log', { 
                                        sessionId, 
                                        level: 'success', 
                                        message: `串口已成功打开: ${comPort}`,
                                        timestamp: new Date().toISOString()
                                    });
                                    if (serverRTU._serverPath) {
                                        serverRTU._serverPath.emit('open');
                                    }
                                    finishStart();
                                }
                            });
                        } else {
                            console.log(`[Modbus RTU Slave ${sessionId}] ModbusRTU.ServerSerial not found, falling back to base class`);
                            sendToWindow('modbus-rtu-slave:log', { 
                                sessionId, 
                                level: 'warning', 
                                message: `未找到 ModbusRTU.ServerSerial，无法使用共享串口模式`,
                                timestamp: new Date().toISOString()
                            });
                            serverRTU = new ModbusRTU(vector);
                            
                            const tryListen = (methodName) => {
                                if (typeof serverRTU[methodName] === 'function') {
                                    serverRTU[methodName](comPort, { ...options, ...serialportOptions }, (err) => {
                                        if (err) {
                                            resolve({ success: false, error: `${methodName} 失败: ${err.message}` });
                                            return;
                                        }
                                        finishStart();
                                    });
                                    return true;
                                }
                                return false;
                            };

                            let started = false;
                            if (tryListen('listenSerial')) started = true;
                            else if (tryListen('listenRTU')) started = true;
                            else if (tryListen('listenRTUBuffered')) started = true;

                            if (!started) {
                                setTimeout(() => {
                                    finishStart();
                                }, 1000);
                            }
                        }
                    } catch (initErr) {
                        console.error(`[Modbus RTU Slave ${sessionId}] Initialization Error:`, initErr);
                        sendToWindow('modbus-rtu-slave:log', { 
                            sessionId, 
                            level: 'error', 
                            message: `初始化实例失败: ${initErr.message}`,
                            timestamp: new Date().toISOString()
                        });
                        resolve({ success: false, error: `初始化失败: ${initErr.message}` });
                    }

                    function finishStart() {
                        if (typeof serverRTU.setID === 'function') {
                            serverRTU.setID(Number(unitId) || 1);
                        }
                        
                        // 尝试挂载原始报文监听 (RX/TX)
                        const hookPort = () => {
                            let hooked = false;
                            
                            // 对于接收 (RX): 监听 _server (因为它是从真实的管道中出来的完整解析报文或者是由 parser 组装好的完整帧)
                            let parser = serverRTU._server;
                            if (transport === 'ASCII') {
                                // For ASCII, fakePort is piped into serverRTU._server. 
                                // To see RAW ASCII strings, we could hook realPort, but that's fragmented.
                                // We can also just hook the parser.
                            }
                            
                            if (parser && typeof parser.on === 'function') {
                                parser.on('data', (data) => {
                                    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                                    if (buf.length === 0) return;
                                    const hex = buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                                    sendToWindow('modbus-rtu-slave:log', { 
                                        sessionId, 
                                        level: 'debug', 
                                        message: `[原始报文] RX: ${hex}`,
                                        timestamp: new Date().toISOString()
                                    });
                                });
                                hooked = true;
                            } else {
                                // 备用: Hook realPort
                                if (realPort && typeof realPort.on === 'function') {
                                    realPort.on('data', (data) => {
                                        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                                        const hex = buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                                        sendToWindow('modbus-rtu-slave:log', { 
                                            sessionId, 
                                            level: 'debug', 
                                            message: `[原始报文] RX: ${hex}`,
                                            timestamp: new Date().toISOString()
                                        });
                                    });
                                    hooked = true;
                                }
                            }

                            // 拦截发送数据 (TX): Hook _serverPath.write
                            let pathObj = serverRTU._serverPath || serverRTU._port || serverRTU.port;
                            if (transport === 'ASCII') {
                                pathObj = realPort; // Since we write directly to realPort inside fakePort
                            }
                            
                            if (pathObj && typeof pathObj.write === 'function') {
                                const originalWrite = pathObj.write;
                                pathObj.write = function(data, encoding, callback) {
                                    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                                    const hex = buf.toString('hex').toUpperCase().match(/.{1,2}/g)?.join(' ') || '';
                                    sendToWindow('modbus-rtu-slave:log', { 
                                        sessionId, 
                                        level: 'debug', 
                                        message: `[原始报文] TX: ${hex}`,
                                        timestamp: new Date().toISOString()
                                    });
                                    return originalWrite.apply(this, arguments);
                                };
                                hooked = true;
                            }

                            return hooked;
                        };

                        if (!hookPort()) {
                            // 如果当前没有 parser，尝试在 open 事件中获取
                            serverRTU.on('open', () => {
                                console.log(`[Modbus RTU Slave ${sessionId}] Port opened, attempting to hook...`);
                                hookPort();
                            });
                        }

                        console.log(`[Modbus RTU Slave ${sessionId}] Started on ${comPort} (ID: ${unitId})`);
                        
                        const holdingArray = [];
                        for (let i = 0; i < holding.length; i += 2) holdingArray.push(holding.readUInt16BE(i));
                        const inputsArray = [];
                        for (let i = 0; i < inputs.length; i += 2) inputsArray.push(inputs.readUInt16BE(i));

                        // 立即同步一次初始内存状态到前端，确保显示 0 而非空白
                        sendToWindow('modbus-slave:memory-update', {
                            sessionId,
                            memory: {
                                holding: holdingArray,
                                coils: Array.from(new Uint8Array(coils.buffer, coils.byteOffset, coils.byteLength)),
                                inputs: inputsArray,
                                discrete: Array.from(new Uint8Array(discrete.buffer, discrete.byteOffset, discrete.byteLength))
                            }
                        });

                        sendToWindow('modbus-rtu-slave:log', { 
                            sessionId, 
                            level: 'success', 
                            message: `Modbus RTU 从站已启动: ${comPort} (ID: ${unitId})`,
                            timestamp: new Date().toISOString()
                        });

                        sessions.set(sessionId, {
                            server: serverRTU,
                            buffers: { holding, coils, inputs, discrete },
                            comPort
                        });

                        updatePowerSave();
                        
                        serverRTU.on('error', (err) => {
                            console.error(`[Modbus RTU Slave ${sessionId}] Server Error:`, err);
                            sendToWindow('modbus-rtu-slave:error', { sessionId, error: err.message });
                            sendToWindow('modbus-rtu-slave:log', { 
                                sessionId, 
                                level: 'error', 
                                message: `从站运行错误: ${err.message}`,
                                timestamp: new Date().toISOString()
                            });
                        });
                        
                        resolve({ success: true });
                    }
                });

            } catch (e) {
                console.error(`[Modbus RTU Slave] Start Exception:`, e);
                return { success: false, error: e.message };
            }
        });

        // --- STOP RTU SLAVE ---
        ipcMain.handle('modbus-rtu-slave:stop', async (_, sessionId) => {
            try {
                const s = sessions.get(sessionId);
                if (s) {
                    console.log(`[Modbus RTU Slave] Stopping session ${sessionId}`);
                    if (s.server) {
                        s.server.close();
                    }
                    sessions.delete(sessionId);
                    updatePowerSave();
                    return { success: true };
                }
                return { success: false, error: 'Session not found' };
            } catch (err) {
                console.error(`[Modbus RTU Slave] Stop Error:`, err);
                return { success: false, error: err.message };
            }
        });

        // --- READ/WRITE MEMORY (Shared with TCP Slave logic) ---
        // We can reuse the same IPC handlers if we want, but usually it's better to keep them separate or unified.
        // Since modbus-slave.js already handles modbus-slave:read-memory, we can just let it handle both if we use the same sessions map?
        // No, they have different sessions maps.
        // I'll add RTU specific memory handlers or unify them.
        // Let's unify them by making both modules share a common session manager or just duplicate for now for safety.
        
        ipcMain.handle('modbus-rtu-slave:read-memory', async (_, sessionId, type, address, length) => {
            try {
                const s = sessions.get(sessionId);
                if (!s) return { success: false, error: "Server not running" };
                
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
            } catch (e) { return { success: false, error: e.message }; }
        });

        ipcMain.handle('modbus-rtu-slave:write-memory', async (_, sessionId, type, address, values) => {
            try {
                const s = sessions.get(sessionId);
                if (!s) return { success: false, error: "Server not running" };
                
                const buffer = s.buffers[type];
                if (!buffer) return { success: false, error: "Invalid memory type" };

                if (type === 'holding' || type === 'inputs') {
                    values.forEach((val, i) => {
                        const offset = (address + i) * 2;
                        if (offset + 1 < buffer.length) {
                            buffer.writeUInt16BE(Number(val) & 0xFFFF, offset);
                        }
                    });
                } else {
                    values.forEach((val, i) => {
                        const bitAddr = address + i;
                        const byteIndex = Math.floor(bitAddr / 8);
                        const bitIndex = bitAddr % 8;
                        if (byteIndex < buffer.length) {
                            if (val) {
                                buffer[byteIndex] |= (1 << bitIndex);
                            } else {
                                buffer[byteIndex] &= ~(1 << bitIndex);
                            }
                        }
                    });
                }
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        });
    }
};
