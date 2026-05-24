
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const iconv = require('iconv-lite'); // Replaced native buffer.transcode

// --- InoDriver Context ---
let lib = null;
let InoApi = null;
const activeInstances = new Map(); 
let watchdogInterval = null;

// --- Type Constants ---
const ERROR_NO = {
    SUCCESS: 0,
    ERR_EIP_STOPED: -2,
    OTHER_ERROR: -1,
    ERRI_INVALID_CONNECTION_INSTANCE_SPECIFIED: 1,
    ERRI_CONN_CONFIG_FAILED_INVALID_NETWORK_PATH: 2,
    ERRI_CONNECTION_COUNT_LIMIT_REACHED: 3,
    ERRI_OUT_OF_MEMORY: 4,
    ERRR_CONN_CONFIG_FAILED_INVALID_NETWORK_PATH: 5,
    ERRR_CONN_CONFIG_FAILED_NO_RESPONSE: 6,
    ERRR_CONN_CONFIG_FAILED_ERROR_RESPONSE: 7,
    ERRR_INVALID_DESTINATION: 8,
    ERRR_TAGNAME_TOO_LONG: 9,
    ERRR_REQUEST_DATA_TOO_LARGE: 10,
    ERRR_CONN_CONNECTION_TIMED_OUT: 11,
    ERRR_TAGNAME_CONVERT_FAILED: 12,
    ERRR_WRITE_DATASIZE_UNCONSISTENT: 13,
    ERRR_SCAN_ERROR: 14
};

function getErrorName(code) {
    for (const [key, val] of Object.entries(ERROR_NO)) {
        if (val === code) return key;
    }
    return `UNKNOWN_ERROR_${code}`;
}

const CONNECTION_STATE = {
    NON_EXISTENT: 0, 
    CONFIGURING: 1,  
    ESTABLISHED: 3,  
    TIMED_OUT: 4,    
    CLOSING: 6       
};

const TAG_TYPE = {
    UNDEFINE: -1,
    BOOL: 0xC1, SINT: 0xC2, INT: 0xC3, DINT: 0xC4, LINT: 0xC5,
    USINT: 0xC6, UINT: 0xC7, UDINT: 0xC8, ULINT: 0xC9,
    REAL: 0xCA, LREAL: 0xCB, STRING: 0xD0, WSTRING: 0xD5,
    BYTE: 0xD1, WORD: 0xD2, DWORD: 0xD3, LWORD: 0xD4,
    STRUCT: 0xA2, TIME: 0xDB, LTIME: 0xD7, DATE: 0xCD,
    TIME_OF_DAY: 0xCE, DATE_AND_TIME: 0xCF, ARRAY: 0xA3
};

// NOTE: STRUCT and ARRAY are deliberately removed from here to prevent
// parseInoData from treating them as arrays of 1-byte integers during READ.
const TAG_SIZE = {
    [TAG_TYPE.BOOL]: 1, [TAG_TYPE.SINT]: 1, [TAG_TYPE.INT]: 2, [TAG_TYPE.DINT]: 4, [TAG_TYPE.LINT]: 8,
    [TAG_TYPE.USINT]: 1, [TAG_TYPE.UINT]: 2, [TAG_TYPE.UDINT]: 4, [TAG_TYPE.ULINT]: 8,
    [TAG_TYPE.REAL]: 4, [TAG_TYPE.LREAL]: 8, [TAG_TYPE.BYTE]: 1, [TAG_TYPE.WORD]: 2,
    [TAG_TYPE.DWORD]: 4, [TAG_TYPE.LWORD]: 8,
    [TAG_TYPE.TIME]: 4, [TAG_TYPE.LTIME]: 8, [TAG_TYPE.DATE]: 4, 
    [TAG_TYPE.TIME_OF_DAY]: 4, [TAG_TYPE.DATE_AND_TIME]: 4
};

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

// CRITICAL FIX: Safe Buffer Allocation with Padding
function toGbkBuffer(str, minCapacity = 0) {
    const s = str || "";
    try {
        const gbkBuf = iconv.encode(String(s), 'cp936');
        const realLen = gbkBuf.length + 1; // +1 for null terminator

        // 1. Align to 8-byte boundary for safety
        let allocSize = (realLen + 7) & ~7;
        
        // 2. Enforce minimum capacity (Safety Padding for Tag Names)
        if (allocSize < minCapacity) allocSize = minCapacity;

        // 3. Allocate and Zero-Fill
        const finalBuf = Buffer.alloc(allocSize);
        gbkBuf.copy(finalBuf);
        
        // 4. Attach actual data length for protocol use
        finalBuf.actualLength = realLen;

        return finalBuf;
    } catch (e) {
        console.warn("[InoDriver] GBK Encode Failed:", e);
        const b = Buffer.from(String(s), 'utf8');
        const realLen = b.length + 1;
        let allocSize = (realLen + 7) & ~7;
        if (allocSize < minCapacity) allocSize = minCapacity;
        
        const f = Buffer.alloc(allocSize);
        b.copy(f);
        f.actualLength = realLen;
        return f;
    }
}

async function loadDll() {
    if (InoApi) return InoApi;

    try {
        const koffi = require('koffi');
        
        const possiblePaths = [
            path.join(process.resourcesPath, 'dll', 'EipTagSimple.dll'),
            path.join(process.resourcesPath, 'dlls', 'EipTagSimple.dll'),
            path.join(process.cwd(), 'resources', 'dll', 'EipTagSimple.dll'),
            path.join(process.cwd(), 'resources', 'dlls', 'EipTagSimple.dll'),
            path.join(process.cwd(), 'dll', 'EipTagSimple.dll'),
        ];

        const dllPath = possiblePaths.find(p => fs.existsSync(p));
        
        if (!dllPath) {
            console.error("[InoDriver] DLL NOT FOUND. Searched:", possiblePaths);
            throw new Error(`Critical: EipTagSimple.dll missing.`);
        }
        
        const dllDir = path.dirname(dllPath);
        const oldPath = process.env.PATH;
        process.env.PATH = `${oldPath}${path.delimiter}${dllDir}`;

        try {
            lib = koffi.load(dllPath);
        } catch (loadErr) {
            throw new Error(`koffi.load failed: ${loadErr.message}`);
        } finally {
            process.env.PATH = oldPath;
        }

        // --- STRUCTS ---
        const TagReadDataBase = koffi.struct('TagReadDataBase', {
            pName: 'char *',       
            iElementCount: 'int'   
        });

        const TagRetValue = koffi.struct('TagRetValue', {
            pData: 'uint8*',       
            eType: 'int',          
            iDataLength: 'int'     
        });

        const TagWriteDataBase = koffi.struct('TagWriteDataBase', {
            pName: 'char *', 
            pData: 'uint8*',       
            eType: 'int',
            iDataLength: 'int',
            iElementCount: 'int'
        });

        InoApi = {
            EipStartExt: lib.func('bool EipStartExt(string pIpAddress, uint iPort)'),
            EipStop: lib.func('void EipStop()'),
            
            EipOpenConnection: lib.func('int EipOpenConnection(string pIpAddress, _Out_ int *pInstanceID)'),
            EipCloseConnection: lib.func('int EipCloseConnection(int iInstanceID)'),
            EipGetConnectionState: lib.func('int EipGetConnectionState(int iInstanceID)'),
            
            EipReadTagExt2: lib.func('int EipReadTagExt2(int iInstanceID, TagReadDataBase *pTagReadData, _Out_ TagRetValue *pTagDest)'),
            EipWriteTagExt2: lib.func('int EipWriteTagExt2(int iInstanceID, TagWriteDataBase *pTagWritenData)'),
            
            EipReadTagListExt: lib.func('int EipReadTagListExt(int iInstanceID, int iNumOfTags, _In_ TagReadDataBase *pTagList, _Out_ TagRetValue *pDest)'),
            EipWriteTagListExt: lib.func('int EipWriteTagListExt(int iInstanceID, int iNumOfTags, _In_ TagWriteDataBase *pTagWritenData)'),

            EipReadTagWithAlignment: lib.func('int EipReadTagWithAlignment(int iInstanceID, int eAlignType, TagReadDataBase *pTagReadData, _Out_ TagRetValue *pTagDest)'),
            EipWriteTagWithAlignment: lib.func('int EipWriteTagWithAlignment(int iInstanceID, int eAlignType, TagWriteDataBase *pTagWritenData)'),

            EipReadTagListWithAlignment: lib.func('int EipReadTagListWithAlignment(int iInstanceID, int iNumOfTags, int eAlignType, _In_ TagReadDataBase *pTagList, _Out_ TagRetValue *pDest)'),
            EipWriteTagListWithAlignment: lib.func('int EipWriteTagListWithAlignment(int iInstanceID, int iNumOfTags, int eAlignType, _In_ TagWriteDataBase *pTagWritenData)'),

            DeleteTagListStru: lib.func('bool DeleteTagListStru(TagRetValue *pRetValue, int iNumOfTags)'),
            ResetTagInfo: lib.func('void ResetTagInfo()'),
            
            TagReadDataBase,
            TagRetValue,
            TagWriteDataBase
        };

        console.log("[InoDriver] DLL Loaded successfully:", dllPath);
        return InoApi;

    } catch (e) {
        console.error("[InoDriver] Load Failed:", e);
        throw e;
    }
}

function readSingleValue(buf, offset, type) {
    try {
        switch (type) {
            case TAG_TYPE.BOOL: return buf[offset] > 0;
            case TAG_TYPE.SINT: return buf.readInt8(offset);
            case TAG_TYPE.INT: return buf.readInt16LE(offset);
            case TAG_TYPE.DINT:
            case TAG_TYPE.TIME:
            case TAG_TYPE.TIME_OF_DAY:
            case TAG_TYPE.DATE_AND_TIME: 
            case TAG_TYPE.DATE:
                return buf.readInt32LE(offset);
            case TAG_TYPE.LINT:
            case TAG_TYPE.LTIME: 
                return Number(buf.readBigInt64LE(offset));
            case TAG_TYPE.USINT: return buf.readUInt8(offset);
            case TAG_TYPE.UINT: 
                return buf.readUInt16LE(offset);
            case TAG_TYPE.UDINT: return buf.readUInt32LE(offset);
            case TAG_TYPE.ULINT: return Number(buf.readBigUInt64LE(offset));
            case TAG_TYPE.REAL: return Number(buf.readFloatLE(offset).toFixed(4));
            case TAG_TYPE.LREAL: return Number(buf.readDoubleLE(offset).toFixed(6));
            case TAG_TYPE.BYTE: return buf.readUInt8(offset);
            case TAG_TYPE.WORD: return buf.readUInt16LE(offset);
            case TAG_TYPE.DWORD: return buf.readUInt32LE(offset);
            case TAG_TYPE.LWORD: return Number(buf.readBigUInt64LE(offset));

            case TAG_TYPE.STRING: {
                let end = offset;
                while (end < buf.length && buf[end] !== 0) end++;
                const slice = buf.slice(offset, end);
                return iconv.decode(slice, 'cp936');
            }
            case TAG_TYPE.WSTRING: {
                let end = offset;
                while (end < buf.length - 1 && (buf[end] !== 0 || buf[end+1] !== 0)) end += 2;
                const slice = buf.slice(offset, end);
                return slice.toString('utf16le');
            }
            
            // Fallback for complex types to show Hex
            case TAG_TYPE.STRUCT: 
            case TAG_TYPE.ARRAY: 
                return (buf.slice(offset).toString('hex').toUpperCase().match(/.{1,2}/g) || []).join(' ');
                
            default: return 0;
        }
    } catch (e) { return 0; }
}

function parseInoData(buffer, type, dataLength) {
    if (!buffer || buffer.length === 0) return 0;
    const buf = Buffer.from(buffer);
    
    if (type === TAG_TYPE.STRING) {
        let end = buf.indexOf(0);
        if (end === -1) end = buf.length;
        return iconv.decode(buf.slice(0, end), 'cp936');
    }
    if (type === TAG_TYPE.WSTRING) {
        let end = 0;
        while (end < buf.length - 1 && (buf[end] !== 0 || buf[end+1] !== 0)) end += 2;
        return buf.slice(0, end).toString('utf16le');
    }
    
    // READ FIX: Treat STRUCT/ARRAY as blob (Hex String)
    // Since TAG_SIZE does not contain STRUCT, this is the primary handler for them.
    if (type === TAG_TYPE.STRUCT || type === TAG_TYPE.ARRAY) {
        return (buf.toString('hex').toUpperCase().match(/.{1,2}/g) || []).join(' ');
    }

    const itemSize = TAG_SIZE[type] || 0;
    if (itemSize > 0) {
        const count = Math.floor(dataLength / itemSize);
        if (count > 1) {
            const arr = [];
            for (let i = 0; i < count; i++) arr.push(readSingleValue(buf, i * itemSize, type));
            return arr;
        }
    }
    return readSingleValue(buf, 0, type);
}

function encodeInoData(value, type) {
    let values = Array.isArray(value) ? value : [value];
    
    if (type === TAG_TYPE.STRING) {
        const strVal = String(value);
        return toGbkBuffer(strVal, 512); 
    }
    if (type === TAG_TYPE.WSTRING) {
        const strVal = String(value);
        const u16Buf = Buffer.from(strVal, 'utf16le');
        const count = u16Buf.length;
        const finalBuf = Buffer.alloc(Math.max(512, count + 2)); 
        u16Buf.copy(finalBuf);
        finalBuf.actualLength = count + 2;
        return finalBuf;
    }
    
    // WRITE FIX (Error 13):
    // If type is STRUCT/ARRAY (not in TAG_SIZE), we must force itemSize to 1 (Byte).
    // This allows writing byte arrays to structs correctly.
    let itemSize = TAG_SIZE[type];
    if (!itemSize) {
        if (type === TAG_TYPE.STRUCT || type === TAG_TYPE.ARRAY || type === TAG_TYPE.BYTE) {
            itemSize = 1;
        } else {
            itemSize = 4; // Fallback
        }
    }

    const totalLogicalSize = itemSize * values.length;
    
    const alignedSize = (totalLogicalSize + 7) & ~7; 
    const buf = Buffer.alloc(alignedSize);
    
    values.forEach((v, i) => {
        const offset = i * itemSize;
        const num = Number(v) || 0;
        try {
            switch (type) {
                case TAG_TYPE.BOOL: buf.writeUInt8(v ? 1 : 0, offset); break;
                case TAG_TYPE.SINT: buf.writeInt8(num, offset); break;
                case TAG_TYPE.INT: buf.writeInt16LE(num, offset); break;
                case TAG_TYPE.DINT:
                case TAG_TYPE.TIME:
                case TAG_TYPE.TIME_OF_DAY:
                case TAG_TYPE.DATE_AND_TIME: 
                case TAG_TYPE.DATE:
                    buf.writeInt32LE(num, offset); break;
                case TAG_TYPE.LINT:
                case TAG_TYPE.LTIME: 
                    buf.writeBigInt64LE(BigInt(num), offset); break;
                case TAG_TYPE.USINT: buf.writeUInt8(num, offset); break;
                case TAG_TYPE.UINT: 
                    buf.writeUInt16LE(num, offset); break;
                case TAG_TYPE.UDINT: buf.writeUInt32LE(num, offset); break;
                case TAG_TYPE.ULINT: buf.writeBigUInt64LE(BigInt(num), offset); break;
                case TAG_TYPE.REAL: buf.writeFloatLE(num, offset); break;
                case TAG_TYPE.LREAL: buf.writeDoubleLE(num, offset); break;
                
                // Write single byte for STRUCT/ARRAY/BYTE
                case TAG_TYPE.STRUCT: 
                case TAG_TYPE.ARRAY:
                case TAG_TYPE.BYTE: 
                    buf.writeUInt8(num, offset); 
                    break;
                    
                case TAG_TYPE.WORD: buf.writeUInt16LE(num, offset); break;
                case TAG_TYPE.DWORD: buf.writeUInt32LE(num, offset); break;
                case TAG_TYPE.LWORD: buf.writeBigUInt64LE(BigInt(num), offset); break;
                default: buf.writeInt32LE(num, offset); break;
            }
        } catch(e) {}
    });
    
    buf.actualLength = totalLogicalSize;
    return buf;
}

function startWatchdog(sendToWindow) {
    if (watchdogInterval) return;
    watchdogInterval = setInterval(() => {
        if (!InoApi || activeInstances.size === 0) return;
        for (const [instanceId, sessionData] of activeInstances.entries()) {
            const { sessionId, lastState } = sessionData;
            try {
                const state = InoApi.EipGetConnectionState(instanceId);
                if (sendToWindow) sendToWindow('eip:session:state', { sessionId, state });
                sessionData.lastState = state;
            } catch (e) { console.error(`[InoDriver] Watchdog Check Failed: ${e.message}`); }
        }
    }, 1000);
}

// --- CORE HANDLERS ---
async function doRead(instanceId, tagName, alignType, elementCount) {
    if (!InoApi) return { success: false, error: "Driver not loaded" };
    const koffi = require('koffi');
    const count = Math.max(1, parseInt(elementCount) || 1);
    
    const nameBuf = toGbkBuffer(tagName, 64);
    
    const readReq = { pName: nameBuf, iElementCount: count };
    const retVal = {}; 
    
    let ret;
    if (alignType === 1) ret = InoApi.EipReadTagWithAlignment(instanceId, 1, readReq, retVal);
    else ret = InoApi.EipReadTagExt2(instanceId, readReq, retVal);

    if (ret === ERROR_NO.SUCCESS) {
        let val = null;
        if (retVal.pData && retVal.iDataLength > 0) {
            const raw = koffi.decode(retVal.pData, 'uint8', retVal.iDataLength);
            val = parseInoData(raw, retVal.eType, retVal.iDataLength);
        }
        
        InoApi.DeleteTagListStru(retVal, 1);
        
        return { success: true, value: val, dataType: retVal.eType };
    } else { 
        return { success: false, error: `${getErrorName(ret)} (${ret})` }; 
    }
}

async function doWrite(instanceId, tagName, value, dataType, alignType, elementCount) {
    if (!InoApi) return { success: false };
    const count = Math.max(1, parseInt(elementCount) || 1);
    
    const buffer = encodeInoData(value, dataType);
    const nameBuf = toGbkBuffer(tagName, 64);
    
    const writeReq = { 
        pName: nameBuf, 
        pData: buffer, 
        eType: dataType, 
        iDataLength: buffer.actualLength || buffer.length, 
        iElementCount: count 
    };
    
    let ret;
    if (alignType === 1) ret = InoApi.EipWriteTagWithAlignment(instanceId, 1, writeReq);
    else ret = InoApi.EipWriteTagExt2(instanceId, writeReq);
    
    if (ret === ERROR_NO.SUCCESS) return { success: true };
    else return { success: false, error: `${getErrorName(ret)} (${ret})` };
}

module.exports = {
    register: (ipcMain, sendToWindow) => {
        startWatchdog(sendToWindow);

        ipcMain.handle('inovance:getLocalIps', () => getLocalIPs());

        ipcMain.handle('inovance:connect', async (_, params) => {
            const { localIp, targetIp, sessionId } = params;
            try {
                const api = await loadDll();
                api.ResetTagInfo(); 
                
                const bindIp = localIp || "0.0.0.0";
                api.EipStartExt(bindIp, 0); 
                const ptrInstanceID = Buffer.alloc(4); 
                const ret = api.EipOpenConnection(targetIp, ptrInstanceID);
                if (ret !== ERROR_NO.SUCCESS) throw new Error(`${getErrorName(ret)} (${ret})`);
                const instanceId = ptrInstanceID.readInt32LE(0);
                activeInstances.set(instanceId, { sessionId, lastState: 3 });
                console.log(`[InoDriver] Connected. Real ID: ${instanceId}`);
                return { success: true, instanceId };
            } catch (e) { return { success: false, error: e.message }; }
        });

        ipcMain.handle('inovance:disconnect', async (_, instanceId) => {
            if (!InoApi) return { success: true };
            const ret = InoApi.EipCloseConnection(instanceId);
            activeInstances.delete(instanceId);
            return { success: ret === ERROR_NO.SUCCESS, error: ret !== ERROR_NO.SUCCESS ? getErrorName(ret) : undefined };
        });

        // --- SINGLE READ ---
        ipcMain.handle('inovance:read', async (_, instanceId, tagName, alignType = 0, elementCount = 1) => {
            return await doRead(instanceId, tagName, alignType, elementCount);
        });

        // --- LIST READ ---
        ipcMain.handle('inovance:readList', async (_, instanceId, tags, alignType = 0) => {
            if (!InoApi) return { success: false, error: "Driver not loaded" };
            const koffi = require('koffi');
            
            // REMOVED STRING FALLBACK to ensure correct List API usage as requested
            // Direct List API Usage
            const count = tags.length;
            const readReqs = tags.map(t => ({ 
                pName: toGbkBuffer(t.tagName, 64),
                iElementCount: t.elementCount || 1 
            }));
            
            const TagRetValueSize = koffi.sizeof(InoApi.TagRetValue);
            const outputBuffer = Buffer.alloc(count * TagRetValueSize);
            
            let ret;
            if (alignType === 1) {
                // Call Alignment API
                ret = InoApi.EipReadTagListWithAlignment(instanceId, count, 1, readReqs, outputBuffer);
            } else {
                // Call Standard API
                ret = InoApi.EipReadTagListExt(instanceId, count, readReqs, outputBuffer);
            }

            if (ret === ERROR_NO.SUCCESS) {
                const results = [];
                for (let i = 0; i < count; i++) {
                    const structBuf = outputBuffer.slice(i * TagRetValueSize, (i + 1) * TagRetValueSize);
                    const retVal = koffi.decode(structBuf, InoApi.TagRetValue);
                    
                    let val = null;
                    if (retVal.pData && retVal.iDataLength > 0) {
                        const raw = koffi.decode(retVal.pData, 'uint8', retVal.iDataLength);
                        val = parseInoData(raw, retVal.eType, retVal.iDataLength);
                    }
                    results.push({ success: true, value: val, dataType: retVal.eType });
                }
                InoApi.DeleteTagListStru(outputBuffer, count);
                return { success: true, results };
            } else {
                return { success: false, error: `${getErrorName(ret)} (${ret})` };
            }
        });

        // --- SINGLE WRITE ---
        ipcMain.handle('inovance:write', async (_, instanceId, tagName, value, dataType, alignType = 0, elementCount = 1) => {
            return await doWrite(instanceId, tagName, value, dataType, alignType, elementCount);
        });

        // --- LIST WRITE ---
        ipcMain.handle('inovance:writeList', async (_, instanceId, tags, alignType = 0) => {
            if (!InoApi) return { success: false };
            const count = tags.length;
            
            // REMOVED STRING FALLBACK to ensure correct List API usage as requested
            // Direct List API Usage
            const writeReqs = tags.map(t => {
                const cnt = Math.max(1, parseInt(t.elementCount) || 1);
                const buf = encodeInoData(t.value, t.dataType);
                const nameBuf = toGbkBuffer(t.tagName, 64);
                
                return {
                    pName: nameBuf, 
                    pData: buf,
                    eType: t.dataType,
                    iDataLength: buf.actualLength || buf.length,
                    iElementCount: cnt
                };
            });

            let ret;
            if (alignType === 1) {
                // Call Alignment API
                ret = InoApi.EipWriteTagListWithAlignment(instanceId, count, 1, writeReqs);
            } else {
                // Call Standard API
                ret = InoApi.EipWriteTagListExt(instanceId, count, writeReqs);
            }

            if (ret === ERROR_NO.SUCCESS) return { success: true };
            else return { success: false, error: `${getErrorName(ret)} (${ret})` };
        });

        ipcMain.handle('inovance:resetCache', async () => { if (InoApi) InoApi.ResetTagInfo(); return { success: true }; });
        ipcMain.handle('inovance:startStack', async (_, localIp) => { try { if (!InoApi) await loadDll(); return { success: InoApi.EipStartExt(localIp || "0.0.0.0", 0) }; } catch(e) { return { success: false, error: e.message }; } });
        ipcMain.handle('inovance:stopStack', async () => { if (InoApi) InoApi.EipStop(); return { success: true }; });
    }
};
