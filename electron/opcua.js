
const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net'); // Required for raw TCP chaos

let opcuaModule = null;
const sessions = new Map();
let isChaosRunning = false; // Global flag for Emergency Stop
let globalUpdatePowerSave = () => {};

function destroySession(sessionId) {
    const s = sessions.get(sessionId);
    if (s) {
        console.log(`[OPCUA] Safe-destroying session ${sessionId}...`);
        if (s.heartbeatInterval) {
            clearInterval(s.heartbeatInterval);
            s.heartbeatInterval = null;
        }
        if (s.subs) {
            for (const [subId, sub] of s.subs.entries()) {
                sub.terminate().catch(() => {});
            }
            s.subs.clear();
        }
        if (s.session) {
            s.session.close().catch(() => {});
        }
        if (s.client) {
            s.client.disconnect().catch(() => {});
        }
        sessions.delete(sessionId);
        try {
            globalUpdatePowerSave();
        } catch (e) {
            console.error("[OPCUA] Error updating powersave during destroy:", e);
        }
    }
}

// IPC BATCHING FOR DATA CHANGES
const pendingDataChanges = new Map();
let flushDataChangesTimeout = null;

function flushDataChanges(sendToWindow) {
    if (pendingDataChanges.size === 0) return;
    
    const batches = [];
    for (const [key, itemsMap] of pendingDataChanges.entries()) {
        const [sessionId, subIdStr] = key.split('_');
        const subId = Number(subIdStr);
        if (itemsMap.size > 0) {
            batches.push({
                sessionId,
                subId,
                items: Array.from(itemsMap.values())
            });
        }
    }
    
    if (batches.length > 0) {
        sendToWindow('opcua:data:change:batch', batches);
    }
    
    pendingDataChanges.clear();
    flushDataChangesTimeout = null;
}

// Helper for PKI paths
function getPkiFolder(type) {
    const userData = app.getPath('userData');
    const pkiRoot = path.join(userData, 'pki');
    switch (type) {
        case 'trusted': return path.join(pkiRoot, 'trusted', 'certs');
        case 'rejected': return path.join(pkiRoot, 'rejected', 'certs');
        case 'own': return path.join(pkiRoot, 'own', 'certs');
        case 'root': return pkiRoot;
        default: return pkiRoot;
    }
}

async function getOpcua() {
    if (!opcuaModule) {
        try {
            console.log("[OPCUA] Loading node-opcua...");
            opcuaModule = await import("node-opcua");
        } catch (err) {
            console.error("[OPCUA] Failed to load node-opcua:", err);
            throw err;
        }
    }
    return opcuaModule;
}

// Recursively clean values for IPC (handle BigInt, Date, TypedArrays)
function safeValue(v) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(safeValue);
    // Convert TypedArrays to standard Arrays to ensure recursive safeValue works (e.g. for BigInt64Array)
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
        return Array.from(v).map(safeValue);
    }
    if (typeof v === 'object' && v.toJSON) return safeValue(v.toJSON());
    if (typeof v === 'object') {
        const out = {};
        for (const k in v) {
            out[k] = safeValue(v[k]);
        }
        return out;
    }
    return v;
}

// Helper: Coerce values from JSON (Frontend) back to Node-OPCUA Native Types
function coerceWriteValue(dataTypeName, value, DataTypeEnum) {
    if (value === null || value === undefined) return value;
    
    // 1. Array Handling
    if (Array.isArray(value)) {
        return value.map(v => coerceWriteValue(dataTypeName, v, DataTypeEnum));
    }

    // 2. DateTime Handling (String -> Date)
    if (dataTypeName === 'DateTime') {
        const d = new Date(value);
        // Fallback to now if invalid to prevent crash, or let node-opcua handle it
        return isNaN(d.getTime()) ? new Date() : d;
    }

    // 3. 64-bit Integer Handling (String -> String for node-opcua to parse)
    if (['Int64', 'UInt64', 'LINT', 'ULINT', 'LWORD', 'LTIME'].includes(dataTypeName)) {
        if (typeof value === 'string') {
            return value.replace(/n$/, '');
        }
        return String(value);
    }

    // 4. Basic Numeric Types (Ensure Number, not String)
    if (['SByte', 'Byte', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Float', 'Double'].includes(dataTypeName)) {
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    }

    // 5. GUID Handling
    if (dataTypeName === 'Guid' && typeof value === 'string') {
        return value; // node-opcua handles string GUIDs usually, or might need parse
    }

    return value;
}

// Helper: Fix Int64 Scalar appearing as Array[2] or Buffer on READ
function fixReadValue(variant, DataType) {
    if (!variant || variant.value === null || variant.value === undefined) return null;
    
    // Check for Scalar Int64/UInt64 that might be malformed as Array/Buffer
    // Note: variant.arrayType might be Scalar even if value is array in some edge cases with node-opcua
    if (variant.dataType === DataType.Int64 || variant.dataType === DataType.UInt64) {
        const val = variant.value;
        
        // Already BigInt? Good.
        if (typeof val === 'bigint') return val;

        // If it's a Buffer of 8 bytes, convert to BigInt
        if (Buffer.isBuffer(val) && val.length === 8) {
            return variant.dataType === DataType.Int64 ? val.readBigInt64LE(0) : val.readBigUInt64LE(0);
        }

        // If it's an Array of 2 numbers [high, low] (common legacy issue), merge them
        if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'number') {
             try {
                // node-opcua represents Int64 as [high, low]
                const buf = Buffer.alloc(8);
                buf.writeUInt32LE(val[1] >>> 0, 0); // low
                buf.writeUInt32LE(val[0] >>> 0, 4); // high
                return variant.dataType === DataType.Int64 ? buf.readBigInt64LE(0) : buf.readBigUInt64LE(0);
             } catch(e) { 
                 return val; // Fallback
             }
        }

        // Handle Array of Int64/UInt64
        if (Array.isArray(val)) {
            return val.map(item => {
                if (typeof item === 'bigint') return item;
                if (Buffer.isBuffer(item) && item.length === 8) {
                    return variant.dataType === DataType.Int64 ? item.readBigInt64LE(0) : item.readBigUInt64LE(0);
                }
                if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'number') {
                    try {
                        const buf = Buffer.alloc(8);
                        buf.writeUInt32LE(item[1] >>> 0, 0); // low
                        buf.writeUInt32LE(item[0] >>> 0, 4); // high
                        return variant.dataType === DataType.Int64 ? buf.readBigInt64LE(0) : buf.readBigUInt64LE(0);
                    } catch(e) {
                        return item;
                    }
                }
                return item;
            });
        }
    }
    return variant.value;
}

// Helper: Reconstruct flat array into nested array based on dimensions
function reconstructMatrix(flatValues, dimensions) {
    if (!dimensions || dimensions.length < 2) return flatValues;

    // Convert TypedArray to normal array if needed for slicing/nesting simplicity
    const flat = ArrayBuffer.isView(flatValues) ? Array.from(flatValues) : flatValues;
    if (!Array.isArray(flat)) return flat;

    // 2D Matrix
    if (dimensions.length === 2) {
        const rows = dimensions[0];
        const cols = dimensions[1];
        const res = [];
        for (let i = 0; i < rows; i++) {
            res.push(flat.slice(i * cols, (i + 1) * cols));
        }
        return res;
    }

    // 3D Matrix
    if (dimensions.length === 3) {
        const d1 = dimensions[0];
        const d2 = dimensions[1];
        const d3 = dimensions[2];
        const sliceSize = d2 * d3;
        const res = [];
        for (let i = 0; i < d1; i++) {
            const slice2D = [];
            const base = i * sliceSize;
            for (let j = 0; j < d2; j++) {
                slice2D.push(flat.slice(base + j * d3, base + (j + 1) * d3));
            }
            res.push(slice2D);
        }
        return res;
    }

    // Fallback for >3D (Return flat, UI handles up to 3D currently)
    return flat;
}

// Helper: Resolve DataType NodeId (e.g. i=6) to String (e.g. "Int32")
function resolveDataTypeName(dataTypeNodeId, DataTypeEnum) {
    if (!dataTypeNodeId) return undefined;
    // Check if it's a standard type (ns=0)
    if (dataTypeNodeId.namespace === 0 && dataTypeNodeId.value) {
        // Reverse lookup in the DataType enum object
        for (const [key, val] of Object.entries(DataTypeEnum)) {
            if (val === dataTypeNodeId.value) return key;
        }
    }
    // Strict String conversion for custom NodeIds
    if (typeof dataTypeNodeId.toString === 'function') {
        return dataTypeNodeId.toString();
    }
    return String(dataTypeNodeId);
}

// Helper: Analyze array depth and flatten for Matrix support
function getMatrixInfo(value) {
    if (!Array.isArray(value)) return null;
    
    // Check for 2D
    if (value.length > 0 && Array.isArray(value[0])) {
        const dim1 = value.length;
        const dim2 = value[0].length;
        
        // Check for 3D
        if (dim2 > 0 && Array.isArray(value[0][0])) {
            const dim3 = value[0][0].length;
            // 3D Matrix
            return {
                dimensions: [dim1, dim2, dim3],
                flatValue: value.flat(2)
            };
        }
        
        // 2D Matrix
        return {
            dimensions: [dim1, dim2],
            flatValue: value.flat()
        };
    }
    
    return null; // 1D or empty
}

// *** SAFETY HELPER ***
// Yields control to the Event Loop to allow other tasks (KeepAlive, UI) to run.
const breathe = () => new Promise(resolve => setImmediate(resolve));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    hasActiveSessions: () => sessions.size > 0,

    closeAll: async () => {
        isChaosRunning = false;
        const keys = Array.from(sessions.keys());
        for (const id of keys) {
            try {
                destroySession(id);
            } catch (e) {
                console.error(`[OPCUA] Error destroying session ${id} during closeAll:`, e);
            }
        }
        sessions.clear();
    },

    register: (ipcMain, updatePowerSave, sendToWindow) => {
        globalUpdatePowerSave = updatePowerSave;
        // --- CONNECT ---
        ipcMain.handle('opcua:connect', async (_, sessionId, endpointUrl, config) => {
            try {
                const { OPCUAClient, MessageSecurityMode, SecurityPolicy } = await getOpcua();
                const { securityMode, securityPolicy, auth, options } = config;
                
                const pkiRoot = path.join(app.getPath('userData'), 'pki');
                
                const client = OPCUAClient.create({
                    clientName: options?.sessionName || 'ClientSession',
                    endpointMustExist: false,
                    securityMode: MessageSecurityMode[securityMode] || MessageSecurityMode.None,
                    securityPolicy: SecurityPolicy[securityPolicy] || SecurityPolicy.None,
                    keepSessionAlive: true,
                    requestedSessionTimeout: options?.sessionTimeout || 60000,
                    connectionStrategy: { maxRetry: 0, initialDelay: 500, maxDelay: 2000 },
                    pkiManager: { location: pkiRoot }
                });

                // Override internal naming to prevent appending auto-incrementing numbers (e.g. Session 21)
                if (options?.sessionName) {
                    client._nextSessionName = () => options.sessionName;
                }
                
                client.on("connection_lost", () => { 
                    sendToWindow('opcua:connection:drop', sessionId);
                    destroySession(sessionId);
                });
                
                await client.connect(endpointUrl);
                
                let userIdentity = { type: 0 };
                if (auth.mode === 'Username') userIdentity = { type: 1, userName: auth.username, password: auth.password };
                
                const session = await client.createSession(userIdentity);
                
                let secureChannelId = 0;
                try {
                    const channel = session.channel || session._channel || (client ? client._secureChannel : null);
                    if (channel) {
                        secureChannelId = channel.channelId || channel.secureChannelId || 0;
                    }
                } catch (e) {}

                const sessionNodeId = session.sessionId ? session.sessionId.toString() : "ns=0;i=0";
                
                const heartbeatInterval = setInterval(async () => { 
                    try {
                        if (sessions.has(sessionId)) {
                            const s = sessions.get(sessionId);
                            if (s && s.session && s.session.read) {
                                await s.session.read({ nodeId: "ns=0;i=2259", attributeId: 13 });
                            }
                        }
                    } catch (e) {
                        console.error("[OPCUA Heartbeat Error]", e);
                    } 
                }, options?.keepAliveInterval || 5000);
                
                sessions.set(sessionId, { client, session, subs: new Map(), heartbeatInterval });
                updatePowerSave();
                
                return { success: true, secureChannelId, sessionNodeId };
            } catch (err) { 
                return { success: false, error: String(err.message || err) }; 
            }
        });

        // --- DISCONNECT ---
        ipcMain.handle('opcua:disconnect', async (_, sessionId) => {
            try {
                destroySession(sessionId);
            } catch (err) {
                console.error("[OPCUA] Disconnect error:", err);
            }
            return { success: true };
        });

        // --- DISCOVERY ---
        ipcMain.handle('opcua:getEndpoints', async (_, endpointUrl) => {
            try {
                const { OPCUAClient, MessageSecurityMode, SecurityPolicy } = await getOpcua();
                const discoveryClient = OPCUAClient.create({ 
                    endpointMustExist: false,
                    securityMode: MessageSecurityMode.None,
                    securityPolicy: SecurityPolicy.None,
                    connectionStrategy: { maxRetry: 0 }
                });
                await discoveryClient.connect(endpointUrl);
                const endpoints = await discoveryClient.getEndpoints();
                await discoveryClient.disconnect();
                return endpoints.map(e => ({ 
                    endpointUrl: e.endpointUrl, 
                    securityMode: MessageSecurityMode[e.securityMode], 
                    securityPolicyUri: e.securityPolicyUri, 
                    securityLevel: e.securityLevel 
                }));
            } catch (err) { throw new Error(String(err.message || err)); }
        });

        // --- READ ---
        ipcMain.handle('opcua:read', async (_, sessionId, nodes) => {
            const { AttributeIds, resolveNodeId, StatusCodes, VariantArrayType, DataType } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            const start = Date.now();
            try {
                const validIndices = [];
                const validNodesToRead = [];
                const results = new Array(nodes.length);

                for (let i = 0; i < nodes.length; i++) {
                    const n = nodes[i];
                    try {
                        resolveNodeId(n.nodeId); 
                        validIndices.push(i);
                        validNodesToRead.push({ nodeId: n.nodeId, attributeId: AttributeIds.Value });
                    } catch (e) {
                        results[i] = {
                            value: null,
                            statusCode: { name: 'BadNodeIdInvalid', value: StatusCodes.BadNodeIdInvalid.value },
                            sourceTimestamp: new Date().toISOString(),
                            serverDuration: 0
                        };
                    }
                }

                if (validNodesToRead.length > 0) {
                    const dataValues = await s.session.read(validNodesToRead);
                    const duration = Date.now() - start;
                    
                    dataValues.forEach((dv, idx) => {
                        const originalIndex = validIndices[idx];
                        
                        let rawValue = null;
                        
                        // FIX: Detect and Fix Int64 split Array issues
                        if (dv.value) {
                            rawValue = fixReadValue(dv.value, DataType);
                            
                            // FIX: Detect Matrix via VariantArrayType and reconstruct nested array
                            // Only apply if it wasn't fixed by Int64 handler (which returns scalar BigInt)
                            if (typeof rawValue !== 'bigint' && dv.value.arrayType === VariantArrayType.Matrix && dv.value.dimensions) {
                                rawValue = reconstructMatrix(rawValue, dv.value.dimensions);
                            }
                        }

                        results[originalIndex] = {
                            value: safeValue(rawValue),
                            statusCode: { name: dv.statusCode.name, value: dv.statusCode.value },
                            sourceTimestamp: dv.sourceTimestamp,
                            serverDuration: duration
                        };
                    });
                }
                
                return results;
            } catch (err) { throw new Error(String(err.message || err)); }
        });

        // --- WRITE ---
        ipcMain.handle('opcua:write', async (_, sessionId, nodes) => {
            const { AttributeIds, DataType, resolveNodeId, Variant, VariantArrayType } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            try {
                const validIndices = [];
                const validNodesToWrite = [];
                const results = new Array(nodes.length);

                for (let i = 0; i < nodes.length; i++) {
                    const n = nodes[i];
                    try {
                        resolveNodeId(n.nodeId);

                        // FIX: Explicitly coerce values for special types (DateTime, Int64, UInt64)
                        // This prevents string-to-Date mismatch and BigInt serialization crashes
                        const coercedValue = coerceWriteValue(n.dataType, n.value, DataType);
                        
                        // Map IEC 61131-3 types to OPC UA standard types
                        let mappedDataType = n.dataType;
                        if (mappedDataType === 'LINT') mappedDataType = 'Int64';
                        if (mappedDataType === 'ULINT' || mappedDataType === 'LWORD' || mappedDataType === 'LTIME') mappedDataType = 'UInt64';
                        
                        // FIX: Detect Matrix (nested array) vs Array (1D)
                        const matrixInfo = getMatrixInfo(coercedValue);
                        let variantDef;

                        if (matrixInfo) {
                            // It's a 2D or 3D Matrix -> Must Flatten and provide Dimensions
                            variantDef = {
                                dataType: DataType[mappedDataType] || DataType.Double,
                                arrayType: VariantArrayType.Matrix,
                                dimensions: matrixInfo.dimensions,
                                value: matrixInfo.flatValue
                            };
                        } else {
                            // Standard 1D Array or Scalar
                            const isArray = Array.isArray(n.value);
                            variantDef = {
                                dataType: DataType[mappedDataType] || DataType.Double,
                                arrayType: isArray ? VariantArrayType.Array : VariantArrayType.Scalar,
                                value: coercedValue
                            };
                        }

                        validNodesToWrite.push({
                            nodeId: n.nodeId,
                            attributeId: AttributeIds.Value,
                            indexRange: n.indexRange,
                            value: { value: new Variant(variantDef) }
                        });
                        
                        // CRITICAL FIX: Only push to validIndices if Variant creation succeeds
                        validIndices.push(i);
                    } catch (e) {
                        console.error("[OPCUA Write Error] Prep failed:", e.message);
                        results[i] = 'BadNodeIdInvalid';
                    }
                }

                if (validNodesToWrite.length > 0) {
                    const statusCodes = await s.session.write(validNodesToWrite);
                    statusCodes.forEach((sc, idx) => {
                        const originalIndex = validIndices[idx];
                        results[originalIndex] = sc.name;
                    });
                }
                
                // Ensure all results are populated (fallback for any unhandled indices)
                for (let i = 0; i < results.length; i++) {
                    if (results[i] === undefined) results[i] = 'BadInternalError';
                }
                
                return results;
            } catch (err) { 
                throw new Error(String(err.message || err)); 
            }
        });

        // --- BROWSE ---
        ipcMain.handle('opcua:browse', async (_, sessionId, nodeId, limit) => {
            const { NodeClass, AttributeIds, DataType, StatusCodes } = await getOpcua(); 
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            
            try {
                const browseOptions = {
                    nodeId,
                    browseDirection: 0, 
                    includeSubtypes: true,
                    referenceTypeId: "HierarchicalReferences", 
                    nodeClassMask: 0,
                    resultMask: 63
                };

                // Set the session's requestedMaxReferencesPerNode before browsing
                const previousLimit = s.session.requestedMaxReferencesPerNode;
                s.session.requestedMaxReferencesPerNode = limit || 0;

                let references = [];
                let browseResult;
                try {
                    browseResult = await s.session.browse(browseOptions);
                } finally {
                    // Restore the previous limit to avoid side effects on other browse operations
                    s.session.requestedMaxReferencesPerNode = previousLimit;
                }
                
                if (browseResult.statusCode.value !== StatusCodes.Good.value) {
                    return [];
                }

                if (browseResult.references) {
                    references = references.concat(browseResult.references);
                }

                // Follow continuation points
                let continuationPoint = browseResult.continuationPoint;
                let loopCount = 0;
                while (continuationPoint && loopCount < 1000) {
                    loopCount++;
                    const nextResult = await s.session.browseNext(continuationPoint, false);
                    if (nextResult.statusCode.value === StatusCodes.Good.value) {
                        if (nextResult.references) {
                            references = references.concat(nextResult.references);
                        }
                        continuationPoint = nextResult.continuationPoint;
                    } else {
                        continuationPoint = null;
                    }
                }

                // Enrich Variables with DataType
                const variables = references.filter(r => r.nodeClass === NodeClass.Variable);
                if (variables.length > 0) {
                    const BATCH_SIZE = 100;
                    for (let i = 0; i < variables.length; i += BATCH_SIZE) {
                        const batch = variables.slice(i, i + BATCH_SIZE);
                        const nodesToRead = [];
                        batch.forEach(r => {
                            nodesToRead.push({ nodeId: r.nodeId, attributeId: AttributeIds.DataType });
                            nodesToRead.push({ nodeId: r.nodeId, attributeId: AttributeIds.ValueRank });
                            nodesToRead.push({ nodeId: r.nodeId, attributeId: AttributeIds.ArrayDimensions });
                        });

                        try {
                            const readResults = await s.session.read(nodesToRead);
                            batch.forEach((r, idx) => {
                                const base = idx * 3;
                                const dtVal = readResults[base];
                                const vrVal = readResults[base+1];
                                const adVal = readResults[base+2];

                                if (dtVal?.statusCode.value === StatusCodes.Good.value && dtVal.value?.value) {
                                    r.resolvedDataType = resolveDataTypeName(dtVal.value.value, DataType) || 'BaseDataType';
                                }
                                if (vrVal?.statusCode.value === StatusCodes.Good.value && vrVal.value) {
                                    r.resolvedValueRank = vrVal.value.value;
                                }
                                if (adVal?.statusCode.value === StatusCodes.Good.value && adVal.value?.value) {
                                    const dims = adVal.value.value;
                                    // CRITICAL FIX: Ensure ArrayDimensions is converted to a plain Array.
                                    // node-opcua often returns UInt32Array which doesn't serialize well over IPC.
                                    if (dims && (Array.isArray(dims) || ArrayBuffer.isView(dims))) {
                                        r.resolvedArrayDimensions = Array.from(dims);
                                    } else if (typeof dims === 'number') {
                                        r.resolvedArrayDimensions = [dims];
                                    }
                                }
                            });
                        } catch (readErr) {
                            console.warn("[OPCUA] Enrichment batch failed:", readErr.message);
                        }
                    }
                }

                return references.map(ref => {
                    let ncStr = "Unknown";
                    if (ref.nodeClass !== undefined && NodeClass[ref.nodeClass]) {
                        ncStr = NodeClass[ref.nodeClass].toString();
                    } else if (typeof ref.nodeClass === 'string') {
                        ncStr = ref.nodeClass;
                    }

                    // STRICT Safety: Ensure dataType is absolutely a string to prevent frontend JSON issues
                    let safeDataType = ref.resolvedDataType;
                    if (safeDataType && typeof safeDataType !== 'string') {
                        safeDataType = String(safeDataType);
                    }

                    return {
                        referenceTypeId: ref.referenceTypeId ? ref.referenceTypeId.toString() : "",
                        isForward: ref.isForward,
                        nodeId: ref.nodeId.toString(),
                        browseName: ref.browseName.toString(),
                        displayName: ref.displayName.text || ref.browseName.toString(),
                        nodeClass: ncStr,
                        typeDefinition: ref.typeDefinition.toString(),
                        dataType: safeDataType,
                        valueRank: ref.resolvedValueRank,
                        arrayDimensions: ref.resolvedArrayDimensions
                    };
                });

            } catch (err) { 
                throw new Error(String(err.message || err)); 
            }
        });

        // --- SUBSCRIPTIONS ---
        ipcMain.handle('opcua:sub:create', async (_, sessionId, options) => {
            try {
                const s = sessions.get(sessionId);
                if (!s) throw new Error("Session not active");
                const subscription = await s.session.createSubscription2({
                    requestedPublishingInterval: options.publishingInterval || 1000,
                    requestedLifetimeCount: options.lifetimeCount || 100,
                    requestedMaxKeepAliveCount: options.maxKeepAliveCount || 10,
                    maxNotificationsPerPublish: options.maxNotificationsPerPublish || 0,
                    publishingEnabled: true,
                    priority: options.priority || 0
                });
                s.subs.set(options.subscriptionId, subscription);
                return { success: true, subscriptionId: subscription.subscriptionId };
            } catch (err) {
                throw new Error(String(err.message || err));
            }
        });

        ipcMain.handle('opcua:sub:delete', async (_, sessionId, subId) => { 
            try {
                const s = sessions.get(sessionId); 
                if (s) { 
                    const sub = s.subs.get(subId); 
                    if (sub) { 
                        await sub.terminate().catch(() => {}); 
                        s.subs.delete(subId); 
                    } 
                } 
                return { success: true };
            } catch (err) {
                throw new Error(String(err.message || err));
            }
        });

        ipcMain.handle('opcua:sub:setMode', async (_, sessionId, subId, enabled) => {
            try {
                const s = sessions.get(sessionId);
                if (!s) throw new Error("Session not active");
                const sub = s.subs.get(subId);
                if (sub) {
                    await sub.setPublishingMode(enabled);
                }
                return { success: true };
            } catch (err) {
                throw new Error(String(err.message || err));
            }
        });

        ipcMain.handle('opcua:sub:monitor', async (_, sessionId, subId, items, settings) => {
            // FIX: Destructure VariantArrayType here
            const { TimestampsToReturn, AttributeIds, resolveNodeId, VariantArrayType, DataType } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            const sub = s.subs.get(subId);
            if (!sub) throw new Error("Subscription not found");
            
            const itemsToMonitor = [];
            const validHandles = [];
            
            for (const item of items) {
                if (item?.nodeId) {
                    try {
                        const resolvedId = resolveNodeId(String(item.nodeId));
                        // FIX: Explicitly pass clientHandle to node-opcua request
                        // This fixes the issue where backend handle starts at 1 despite frontend counter
                        itemsToMonitor.push({ 
                            nodeId: resolvedId, 
                            attributeId: AttributeIds.Value,
                            clientHandle: Number(item.clientHandle) 
                        });
                        validHandles.push(Number(item.clientHandle));
                    } catch(e) {
                        console.warn(`[OPCUA] Failed to resolve NodeId for monitoring: ${item.nodeId}`);
                    }
                }
            }

            if (itemsToMonitor.length === 0) return [];
            
            try {
                const group = await sub.monitorItems(
                    itemsToMonitor,
                    {
                        samplingInterval: settings?.samplingInterval ?? 500,
                        queueSize: settings?.queueSize ?? 10,
                        discardOldest: settings?.discardOldest ?? true
                    },
                    TimestampsToReturn.Both
                );
                
                const resultEntries = [];
                
                group.monitoredItems.forEach((monitoredItem, index) => {
                    const frontendHandle = validHandles[index];
                    monitoredItem._frontendHandle = frontendHandle; 
                    
                    resultEntries.push({
                        clientHandle: frontendHandle,
                        monitoredItemId: monitoredItem.monitoredItemId,
                        statusCode: monitoredItem.statusCode ? monitoredItem.statusCode.name : 'Good'
                    });
                });

                group.on("changed", (monitoredItem, dataValue) => {
                    if (monitoredItem._frontendHandle) {
                        
                        let rawValue = null;
                        if (dataValue.value) {
                             rawValue = fixReadValue(dataValue.value, DataType);
                             
                             // FIX: Detect Matrix via VariantArrayType and reconstruct nested array for Subscriptions
                             if (typeof rawValue !== 'bigint' && dataValue.value.arrayType === VariantArrayType.Matrix && dataValue.value.dimensions) {
                                  rawValue = reconstructMatrix(rawValue, dataValue.value.dimensions);
                             }
                        }

                        const changeItem = {
                            clientHandle: monitoredItem._frontendHandle,
                            value: safeValue(rawValue),
                            statusCode: dataValue.statusCode ? dataValue.statusCode.name : 'Good',
                            timestamp: dataValue.sourceTimestamp || new Date()
                        };

                        const key = `${sessionId}_${subId}`;
                        if (!pendingDataChanges.has(key)) {
                            pendingDataChanges.set(key, new Map());
                        }
                        // Use a Map to collapse fast updates for the same handle and save memory
                        pendingDataChanges.get(key).set(monitoredItem._frontendHandle, changeItem);

                        if (!flushDataChangesTimeout) {
                            flushDataChangesTimeout = setTimeout(() => flushDataChanges(sendToWindow), 150);
                        }
                    }
                });

                return resultEntries;
            } catch (e) {
                console.error("[OPCUA] Monitor failed:", e);
                return items.map(i => ({ clientHandle: i.clientHandle, statusCode: 'BadInternalError' }));
            }
        });

        ipcMain.handle('opcua:sub:unmonitor', async (_, sessionId, subId, handles) => {
            const s = sessions.get(sessionId);
            if (!s) return;
            const sub = s.subs.get(subId);
            if (sub && Array.isArray(handles)) {
                const allItems = Object.values(sub.monitoredItems);
                for (const handle of handles) {
                    const target = allItems.find(i => i._frontendHandle === Number(handle));
                    if (target) await target.terminate();
                }
            }
        });

        // --- ATTRIBUTES & METHODS & HISTORY ---
        ipcMain.handle('opcua:readAttributes', async (_, sessionId, nodeId) => {
            const { AttributeIds, NodeClass, DataType } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            const attributesToRead = [
                { nodeId, attributeId: AttributeIds.NodeClass },
                { nodeId, attributeId: AttributeIds.BrowseName },
                { nodeId, attributeId: AttributeIds.DisplayName },
                { nodeId, attributeId: AttributeIds.Description },
                { nodeId, attributeId: AttributeIds.DataType },
                { nodeId, attributeId: AttributeIds.ValueRank },
                { nodeId, attributeId: AttributeIds.AccessLevel },
                { nodeId, attributeId: AttributeIds.UserAccessLevel },
                { nodeId, attributeId: AttributeIds.MinimumSamplingInterval }
            ];
            try {
                const results = await s.session.read(attributesToRead);
                const resolveType = (v) => { 
                    if (!v || !v.value) return "Null"; 
                    return resolveDataTypeName(v.value, DataType) || v.value.toString(); 
                };
                return {
                    nodeId: nodeId,
                    nodeClass: NodeClass[results[0].value.value] || results[0].value.value,
                    browseName: results[1].value?.value ? results[1].value.value.toString() : "",
                    displayName: results[2].value?.value ? results[2].value.value.text : "",
                    description: results[3].value?.value ? results[3].value.value.text : "",
                    dataType: resolveType(results[4]),
                    valueRank: results[5].value?.value,
                    accessLevel: results[6].value?.value,
                    userAccessLevel: results[7].value?.value,
                    minSamplingInterval: results[8].value?.value
                };
            } catch (err) { throw new Error(String(err.message || err)); }
        });

        ipcMain.handle('opcua:getMethodMetadata', async (_, sessionId, nodeId) => {
            const s = sessions.get(sessionId);
            if (!s) return null;
            try {
                if (s.session.getArgumentDefinition) {
                    const args = await s.session.getArgumentDefinition(nodeId);
                    return { objectId: nodeId, methodId: nodeId, name: "Method", inputArguments: args.inputArguments, outputArguments: args.outputArguments };
                }
                return null;
            } catch(e) { return null; }
        });

        ipcMain.handle('opcua:callMethod', async (_, sessionId, objectId, methodId, args) => {
            const { Variant } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            try {
                const callMethodRequest = { objectId: objectId, methodId: methodId, inputArguments: args.map(a => new Variant(a)) };
                const result = await s.session.call(callMethodRequest);
                return [result.statusCode.name, result.outputArguments.map(v => safeValue(v.value))];
            } catch (err) { throw new Error(String(err.message || err)); }
        });

        ipcMain.handle('opcua:historyRead', async (_, sessionId, nodeId, startTime, endTime) => {
            const s = sessions.get(sessionId);
            if (!s) return { success: false, error: "Session not active" };
            try {
                const start = new Date(startTime);
                const end = new Date(endTime);
                const result = await s.session.readHistoryValue({ nodeId }, start, end, 1000, false);
                return { success: true, statusCode: result.statusCode.name, data: result.historyData.dataValues.map(dv => ({ value: safeValue(dv.value ? dv.value.value : null), sourceTimestamp: dv.sourceTimestamp, statusCode: dv.statusCode.name })) };
            } catch (e) { return { success: false, error: e.message }; }
        });

        // --- PKI MANAGEMENT ---
        ipcMain.handle('opcua:pki:list', async (_, type) => {
            const folder = getPkiFolder(type);
            if (!fs.existsSync(folder)) return { success: true, files: [] };
            try {
                const files = fs.readdirSync(folder).filter(f => f.endsWith('.pem') || f.endsWith('.der')).map(f => ({ name: f, path: path.join(folder, f), type }));
                return { success: true, files };
            } catch(e) { return { success: false, error: e.message }; }
        });
        ipcMain.handle('opcua:pki:trust', async (_, filename) => {
            const src = path.join(getPkiFolder('rejected'), filename); const dest = path.join(getPkiFolder('trusted'), filename);
            try { if (fs.existsSync(src)) { fs.renameSync(src, dest); return { success: true }; } return { success: false, error: "File not found" }; } catch(e) { return { success: false, error: e.message }; }
        });
        ipcMain.handle('opcua:pki:reject', async (_, filename) => {
            const src = path.join(getPkiFolder('trusted'), filename); const dest = path.join(getPkiFolder('rejected'), filename);
            try { if (fs.existsSync(src)) { fs.renameSync(src, dest); return { success: true }; } return { success: false, error: "File not found" }; } catch(e) { return { success: false, error: e.message }; }
        });
        ipcMain.handle('opcua:pki:delete', async (_, type, filename) => {
            const src = path.join(getPkiFolder(type), filename);
            try { if (fs.existsSync(src)) { fs.unlinkSync(src); return { success: true }; } return { success: false, error: "File not found" }; } catch(e) { return { success: false, error: e.message }; }
        });
        ipcMain.handle('opcua:pki:open', async (_, type) => { const { shell } = require('electron'); await shell.openPath(getPkiFolder(type)); });

        // Stubs for events
        ipcMain.handle('opcua:events:subscribe', async () => ({ success: true }));
        ipcMain.handle('opcua:events:unsubscribe', async () => ({ success: true }));

        // ====================================================================
        // ADVANCED CHAOS TESTING HANDLERS (OPTIMIZED SAFETY + CONFIG)
        // ====================================================================
        
        ipcMain.handle('opcua:chaos:stop', async () => {
            isChaosRunning = false; // Emergency Stop Trigger
            return { success: true };
        });

        // 1. Session Flood (Safety optimized: batches + yield)
        ipcMain.handle('opcua:chaos:flood', async (_, endpointUrl, config) => {
            isChaosRunning = true;
            const { OPCUAClient } = await getOpcua();
            const count = config.count || 10;
            const delay = config.delayMs ?? 50;
            const batchSize = 5; // Fixed small batch to prevent choking
            const timeout = config.timeoutMs ?? 5000;
            const keepAlive = config.keepAlive ?? 0;

            let successCount = 0;
            let errorCount = 0;
            const details = [];
            const tempClients = [];

            // SAFETY: Execute in batches to not choke Node.js event loop
            for (let i = 0; i < count; i += batchSize) {
                if (!isChaosRunning) break;
                
                const batchPromises = [];
                for (let j = 0; j < batchSize && (i + j) < count; j++) {
                    batchPromises.push((async () => {
                        let client = null;
                        let session = null;
                        try {
                            client = OPCUAClient.create({
                                endpointMustExist: false,
                                connectionStrategy: { maxRetry: 0, initialDelay: 100 },
                                requestedSessionTimeout: timeout
                            });
                            await client.connect(endpointUrl);
                            session = await client.createSession();
                            tempClients.push({ client, session });
                            successCount++;
                            // Optional hold time
                            if (keepAlive > 0) await sleep(keepAlive);
                        } catch (e) {
                            errorCount++;
                            if (details.length < 5) details.push(e.message);
                            if (client) {
                                try { await client.disconnect(); } catch(err) {}
                            }
                        }
                    })());
                }
                
                await Promise.all(batchPromises);
                // Configurable delay + yield
                if (delay > 0) await sleep(delay);
                else await breathe(); 
            }

            // Cleanup immediately & gently
            for (const c of tempClients) {
                try {
                    await c.session.close();
                    await c.client.disconnect();
                } catch(e) {}
            }
            isChaosRunning = false;
            return { category: 'Session Flood', totalSent: count, successCount, errorCount, details };
        });

        // 2. NodeId Fuzzing (Yielding added)
        ipcMain.handle('opcua:chaos:fuzzRead', async (_, sessionId, config) => {
            isChaosRunning = true;
            const { AttributeIds } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");

            const count = config.count || 50;
            const delay = config.delayMs ?? 0;
            const strategy = config.strategy || 'Mixed';
            const len = config.length || 1000;
            
            let successCount = 0; 
            let errorCount = 0;   
            const details = [];
            
            // Generate nodes based on strategy
            const nodesToRead = [];
            for(let i=0; i<count; i++) {
                let badId = "";
                if (strategy === 'Empty' || (strategy === 'Mixed' && i % 4 === 0)) badId = "";
                else if (strategy === 'Oversized' || (strategy === 'Mixed' && i % 4 === 1)) badId = `ns=2;s=${'A'.repeat(len)}`;
                else if (strategy === 'SpecialChars' || (strategy === 'Mixed' && i % 4 === 2)) badId = `ns=2;s=Test!@#$%^&*()_+${Math.random()}`;
                else if (strategy === 'Null' || (strategy === 'Mixed' && i % 4 === 3)) badId = null; // Some stacks handle null specifically
                else badId = `ns=${Math.floor(Math.random()*10)};s=Fuzz-${Math.random().toString(36)}`;

                if (badId !== null) nodesToRead.push({ nodeId: badId, attributeId: AttributeIds.Value });
            }

            try {
                if (isChaosRunning) {
                    // Split into chunks to avoid blocking
                    const CHUNK_SIZE = config.batchSize || 20;
                    for (let i = 0; i < nodesToRead.length; i += CHUNK_SIZE) {
                        if (!isChaosRunning) break;
                        
                        const chunk = nodesToRead.slice(i, i + CHUNK_SIZE);
                        const results = await s.session.read(chunk);
                        
                        results.forEach(r => {
                            if (r.statusCode.name.includes('Bad')) {
                                successCount++; 
                            } else {
                                errorCount++; 
                                if(details.length < 5) details.push(`Unexpected Good: ${r.statusCode.name}`);
                            }
                        });
                        
                        if (delay > 0) await sleep(delay);
                        else await breathe();
                    }
                }
            } catch (e) {
                errorCount = count;
                details.push(e.message);
            }
            isChaosRunning = false;
            return { category: 'NodeId Fuzzing', totalSent: count, successCount, errorCount, details };
        });

        // 3. Type Mismatch Write
        ipcMain.handle('opcua:chaos:mismatchWrite', async (_, sessionId, nodeId, config) => {
            isChaosRunning = true;
            const { AttributeIds, DataType, Variant } = await getOpcua();
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");

            const count = config.count || 20;
            const delay = config.delayMs ?? 10;
            const fakeType = config.fakeType || 'String';
            const payloadSize = config.payloadSize || 100;

            // Generate payload
            let payload = "ChaosPayload";
            if (fakeType === 'String' || fakeType === 'ByteString') {
                payload = 'X'.repeat(payloadSize);
            }

            let successCount = 0;
            let errorCount = 0;
            const details = [];

            try {
                if (isChaosRunning) {
                    for(let i=0; i<count; i++) {
                        if (!isChaosRunning) break;
                        
                        const nodesToWrite = [{
                            nodeId: nodeId,
                            attributeId: AttributeIds.Value,
                            value: new Variant({ dataType: DataType[fakeType] || DataType.String, value: payload })
                        }];
                        
                        const results = await s.session.write(nodesToWrite);
                        results.forEach(code => {
                            if (code.name === 'BadTypeMismatch') successCount++;
                            else {
                                errorCount++;
                                if(details.length < 5) details.push(code.name);
                            }
                        });
                        
                        if (delay > 0) await sleep(delay);
                        else await breathe();
                    }
                }
            } catch (e) {
                errorCount = count;
                details.push(e.message);
            }
            isChaosRunning = false;
            return { category: 'Type Mismatch', totalSent: count, successCount, errorCount, details };
        });

        // 4. Malformed Packet (Raw TCP with Cleanup)
        ipcMain.handle('opcua:chaos:malformed', async (_, endpointUrl, config) => {
            isChaosRunning = true;
            const count = config.count || 10;
            const delay = config.delayMs ?? 50;
            const packetSize = config.packetSize || 4294967040;
            const partial = config.partialWrite === 'Yes';

            let successCount = 0;
            let errorCount = 0;
            const details = [];

            let host = 'localhost';
            let port = 4840;
            try {
                const match = endpointUrl.match(/opc\.tcp:\/\/([^:]+)(?::(\d+))?/);
                if (match) { host = match[1]; port = match[2] ? parseInt(match[2]) : 4840; }
            } catch(e) {}

            for(let i=0; i<count; i++) {
                if (!isChaosRunning) break;
                try {
                    await new Promise((resolve, reject) => {
                        const socket = new net.Socket();
                        socket.setTimeout(2000);
                        socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
                        socket.connect(port, host, () => {
                            const buffer = Buffer.alloc(32);
                            buffer.write('HEL', 0);
                            buffer.write('F', 3);
                            // Custom Malformed Length
                            buffer.writeUInt32LE(packetSize, 4); 
                            
                            if (partial) {
                                socket.write(buffer.slice(0, 10)); // Partial header
                            } else {
                                socket.write(buffer); // Full header but lying about length
                            }

                            setTimeout(() => { socket.destroy(); successCount++; resolve(); }, 50);
                        });
                        socket.on('error', (err) => { socket.destroy(); reject(err); });
                    });
                } catch(e) {
                    errorCount++;
                    if (details.length < 5) details.push(e.message);
                }
                if (delay > 0) await sleep(delay);
                else await breathe();
            }
            isChaosRunning = false;
            return { category: 'Malformed Packet', totalSent: count, successCount, errorCount, details };
        });

        // 5. Subscription Storm
        ipcMain.handle('opcua:chaos:subStorm', async (_, endpointUrl, config) => {
            isChaosRunning = true;
            const { AttributeIds, OPCUAClient } = await getOpcua();

            const count = config.count || 500;
            const sampling = config.samplingInterval ?? 0;
            const qSize = config.queueSize || 10;
            const discard = config.discardOldest === 'True';

            let successCount = 0;
            let errorCount = 0;
            const details = [];

            let stormClient = null;
            let stormSession = null;
            let subscription = null;

            try {
                stormClient = OPCUAClient.create({
                    endpointMustExist: false,
                    connectionStrategy: { maxRetry: 0 }
                });
                await stormClient.connect(endpointUrl);
                stormSession = await stormClient.createSession();

                if (isChaosRunning) {
                    subscription = await stormSession.createSubscription2({
                        requestedPublishingInterval: 0, // Force fastest publish
                        requestedLifetimeCount: 1000,
                        requestedMaxKeepAliveCount: 10,
                        maxNotificationsPerPublish: 0,
                        publishingEnabled: true,
                        priority: 255
                    });

                    const itemsToMonitor = [];
                    for(let i=0; i<count; i++) {
                        itemsToMonitor.push({ nodeId: "ns=0;i=2258", attributeId: AttributeIds.Value });
                    }

                    await subscription.monitorItems(itemsToMonitor, { 
                        samplingInterval: sampling, 
                        queueSize: qSize, 
                        discardOldest: discard 
                    });
                    successCount = itemsToMonitor.length;
                    
                    // Wait until stopped
                    while(isChaosRunning) {
                        await sleep(200);
                    }
                }
            } catch(e) {
                errorCount = 1;
                details.push(e.message);
            } finally {
                if (subscription) {
                    try { await subscription.terminate(); } catch(e) {}
                }
                if (stormSession) {
                    try { await stormSession.close(); } catch(e) {}
                }
                if (stormClient) {
                    try { await stormClient.disconnect(); } catch(e) {}
                }
            }
            isChaosRunning = false;
            return { category: 'Subscription Storm', totalSent: 1, successCount, errorCount, details };
        });

        // 6. Connection Flapping (Throttled)
        ipcMain.handle('opcua:chaos:flapping', async (_, endpointUrl, config) => {
            isChaosRunning = true;
            const { OPCUAClient } = await getOpcua();
            
            const count = config.count || 20;
            const delay = config.delayMs ?? 50;

            let successCount = 0;
            let errorCount = 0;
            const details = [];

            for(let i=0; i<count; i++) {
                if (!isChaosRunning) break;
                // Create a new client instance for each connection attempt to ensure clean state
                const client = OPCUAClient.create({ endpointMustExist: false, connectionStrategy: { maxRetry: 0 } });
                try {
                    await client.connect(endpointUrl);
                    successCount++;
                } catch (e) {
                    errorCount++;
                    if (details.length < 5) details.push(e.message);
                } finally {
                    try { await client.disconnect(); } catch(err) {}
                }
                if (delay > 0) await sleep(delay);
                else await breathe();
            }
            isChaosRunning = false;
            return { category: 'Connection Flapping', totalSent: count, successCount, errorCount, details };
        });

        // 7. Protocol Downgrade
        ipcMain.handle('opcua:chaos:downgrade', async (_, endpointUrl, config) => {
            isChaosRunning = true;
            const { OPCUAClient, MessageSecurityMode, SecurityPolicy } = await getOpcua();
            
            const count = config.count || 5;
            const delay = config.delayMs ?? 100;
            const mode = config.mode || 'None'; // 'None' or 'Sign'

            let successCount = 0; 
            let errorCount = 0;   
            const details = [];

            const targetMode = mode === 'Sign' ? MessageSecurityMode.Sign : MessageSecurityMode.None;
            const targetPolicy = mode === 'Sign' ? SecurityPolicy.Basic256Sha256 : SecurityPolicy.None;

            for(let i=0; i<count; i++) {
                if (!isChaosRunning) break;
                const client = OPCUAClient.create({
                    endpointMustExist: false,
                    securityMode: targetMode,
                    securityPolicy: targetPolicy,
                    connectionStrategy: { maxRetry: 0 }
                });

                try {
                    await client.connect(endpointUrl);
                    errorCount++; 
                    details.push(`Connected with ${mode} (Risk)`);
                } catch (e) {
                    successCount++; // Rejected is Success for this test
                } finally {
                    try { await client.disconnect(); } catch(err) {}
                }
                if (delay > 0) await sleep(delay);
                else await breathe();
            }
            isChaosRunning = false;
            return { category: 'Protocol Downgrade', totalSent: count, successCount, errorCount, details };
        });

        // 8. Secure Channel Stress (Cleaned up)
        ipcMain.handle('opcua:chaos:secureStress', async (_, endpointUrl, config) => {
            isChaosRunning = true;
            const { OPCUAClient, MessageSecurityMode, SecurityPolicy } = await getOpcua();
            
            const count = config.count || 10;
            const delay = config.delayMs ?? 50;
            const policyName = config.policy || 'Basic256Sha256';

            const policy = SecurityPolicy[policyName] || SecurityPolicy.Basic256Sha256;

            let successCount = 0;
            let errorCount = 0;
            
            for(let i=0; i<count; i++) {
                if (!isChaosRunning) break;
                // Create a new client instance for each connection attempt
                const client = OPCUAClient.create({
                    endpointMustExist: false,
                    securityMode: MessageSecurityMode.SignAndEncrypt,
                    securityPolicy: policy,
                    connectionStrategy: { maxRetry: 0 }
                });
                try {
                    await client.connect(endpointUrl);
                    successCount++;
                } catch(e) {
                    errorCount++;
                } finally {
                    try { await client.disconnect(); } catch(err) {}
                }
                if (delay > 0) await sleep(delay);
                else await breathe();
            }
            isChaosRunning = false;
            return { category: 'Secure Stress', totalSent: count, successCount, errorCount, details: [] };
        });

        // 9. Recursive Browse (Yielding)
        ipcMain.handle('opcua:chaos:recursive', async (_, sessionId, config) => {
            isChaosRunning = true;
            const s = sessions.get(sessionId);
            if (!s) throw new Error("Session not active");
            let browsedCount = 0;
            
            const count = config.count || 100;
            const delay = config.delayMs ?? 0; 
            const maxDepth = config.depth ?? 5;
            const refType = config.references === 'Aggregates' ? "Aggregates" : "HierarchicalReferences";

            const browseRecursive = async (nodeId, depth) => {
                if (!isChaosRunning || depth > maxDepth || browsedCount >= count) return;
                
                // Safety yield
                if (browsedCount % 10 === 0) {
                    if (delay > 0) await sleep(delay);
                    else await breathe();
                }

                try {
                    const result = await s.session.browse({ nodeId, referenceTypeId: refType, includeSubtypes: true, nodeClassMask: 0, resultMask: 63 });
                    browsedCount++;
                    if (result.references) {
                        for(const ref of result.references) {
                            if (ref.isForward) await browseRecursive(ref.nodeId.toString(), depth + 1);
                        }
                    }
                } catch(e) {}
            };

            await browseRecursive("ns=0;i=85", 0); 
            isChaosRunning = false;
            return { category: 'Recursive Browse', totalSent: count, successCount: browsedCount, errorCount: 0, details: [`Browsed ${browsedCount} nodes`] };
        });
    }
};
