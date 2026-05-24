// ... (imports remain the same, just keeping the top part concise for replacement)
import { 
    OpcNode, 
    OpcDataType, 
    ReferenceDescription, 
    MethodMetadata, 
    SessionStatistics, 
    OpcEvent, 
    AuthSettings, 
    MessageSecurityMode, 
    SecurityPolicy, 
    EndpointDescription, 
    MonitoredItem, 
    ConnectionOptions, 
    Subscription,
    CertificateFile,
    HistoryReadResult,
    ChaosResult
  } from '../types';
  
  const getElectron = () => {
      if (typeof window === 'undefined') return null;
      return (window as any).electronAPI || null;
  };
  
  // FIX: Robust BigInt Sanitization
  const sanitizeValue = (val: any, depth = 0): any => {
      if (depth > 10) return '[Deep Object]';
      if (val === null || val === undefined) return val;
      
      // Scalar BigInt
      if (typeof val === 'bigint') return val.toString();
      
      if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') return val;
      if (val instanceof Date) return val.toISOString();
      
      // TypedArrays
      if (val instanceof Int8Array || val instanceof Uint8Array || val instanceof Uint8ClampedArray ||
          val instanceof Int16Array || val instanceof Uint16Array || 
          val instanceof Int32Array || val instanceof Uint32Array || 
          val instanceof Float32Array || val instanceof Float64Array ||
          val instanceof BigInt64Array || val instanceof BigUint64Array) {
             
             // Convert to standard array first, then map to handle BigInt inside TypedArray
             if (val.length > 50000) return `[Large Binary/Array size=${val.length}]`;
             return Array.from(val as any).map((v: any) => typeof v === 'bigint' ? v.toString() : v);
      }
      
      if (val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
          if (val.data.length > 5000) return `[Binary Buffer size=${val.data.length} bytes]`;
          return val.data;
      }
      
      if (Array.isArray(val)) {
          const limit = 50000;
          if (val.length > limit) return `[Array(${val.length}) - Too large to display]`;
          return val.map(v => sanitizeValue(v, depth + 1));
      }
      
      if (typeof val === 'object') {
          if (Object.prototype.hasOwnProperty.call(val, 'text') && Object.prototype.hasOwnProperty.call(val, 'locale')) {
              return val.text || '';
          }
          const cleanObj: any = {};
          let keyCount = 0;
          for (const k in val) {
              if (Object.prototype.hasOwnProperty.call(val, k)) {
                  if (keyCount > 50) {
                      cleanObj['_truncated'] = '...Object too large...';
                      break;
                  }
                  cleanObj[k] = sanitizeValue(val[k], depth + 1);
                  keyCount++;
              }
          }
          return cleanObj;
      }
      return String(val);
  };

  class OpcUaService {
      // ... (keeping existing private vars) ...
      private _stats: SessionStatistics = {
          uptime: 0, bytesRead: 0, bytesWritten: 0, opsPerSec: 0, itemsPerSec: 0, avgRtt: 0, lastRtt: 0, rttHistory: [], throughputHistory: [], healthScore: 100, slowOps: []
      };
      
      private _accumulators = { ops: 0, items: 0, bytesIn: 0, bytesOut: 0 };
      private _statInterval: any = null;
      private _eventCallback: ((e: OpcEvent) => void) | null = null;
      private _connectStartTime: number = 0;
      private _isConnected: boolean = false;
      private _dropListeners: ((sessionId: string) => void)[] = [];
      private _intentionalDisconnects: Set<string> = new Set();
      private _subscriptionCallbacks = new Map<string, (sid: number, items: any) => void>();
  
      constructor() {
          const electron = getElectron();
          if (electron) {
             this._attachElectronListeners(electron);
          } else {
              // Retry once in case of load timing issues
              setTimeout(() => {
                  const retryElectron = getElectron();
                  if (retryElectron) this._attachElectronListeners(retryElectron);
              }, 1000);
          }
          this._startStatsCycle();
      }
      
      private _startStatsCycle() {
          if (this._statInterval) clearInterval(this._statInterval);
          this._statInterval = setInterval(() => {
              this._stats.opsPerSec = this._accumulators.ops;
              this._stats.itemsPerSec = this._accumulators.items;
              this._stats.bytesRead += this._accumulators.bytesIn;
              this._stats.bytesWritten += this._accumulators.bytesOut;
              this._stats.throughputHistory.push(this._accumulators.items);
              if (this._stats.throughputHistory.length > 50) this._stats.throughputHistory.shift();
              this._accumulators = { ops: 0, items: 0, bytesIn: 0, bytesOut: 0 };
              if (this._isConnected && this._connectStartTime > 0) {
                  this._stats.uptime = Math.floor((Date.now() - this._connectStartTime) / 1000);
              }
          }, 1000);
      }

      private _getCallbackKey(sessionId: string, subId: number) { return `${sessionId}::${subId}`; }

      private _attachElectronListeners(electron: any) {
          if (electron.onDebugLog) {
              electron.onDebugLog((payload: any) => {
                  if (payload.data) { console.log(`%c[BACKEND] ${payload.msg}`, 'color: #d946ef; font-weight: bold;', payload.data); } else { console.log(`%c[BACKEND] ${payload.msg}`, 'color: #d946ef; font-weight: bold;'); }
              });
          }
          if (electron.onDataChangeBatch) {
              electron.onDataChangeBatch((batches: any[]) => {
                  let totalItemsCount = 0;
                  batches.forEach(data => {
                      const subId = Number(data.subId);
                      const sessionId = data.sessionId; 
                      const itemCount = data.items?.length || 0;
                      totalItemsCount += itemCount;
                      if (!sessionId) return;
                      const key = this._getCallbackKey(sessionId, subId);
                      const cb = this._subscriptionCallbacks.get(key);
                      if (cb) {
                          const cleanItems = data.items.map((i: any) => {
                              let val = i.value;
                              if (val && typeof val === 'object' && val.value !== undefined && !Array.isArray(val) && !(val instanceof Date)) { val = val.value; }
                              
                              const t = typeof val;
                              const needSanitize = val && (t === 'object' || t === 'bigint');
                              
                              return {
                                  ...i,
                                  clientHandle: Number(i.clientHandle),
                                  value: needSanitize ? sanitizeValue(val) : val,
                                  timestamp: i.timestamp instanceof Date ? i.timestamp.toISOString() : (i.timestamp || new Date().toISOString())
                              };
                          });
                          cb(subId, cleanItems);
                      }
                  });
                  this._accumulators.items += totalItemsCount;
                  this._accumulators.bytesIn += totalItemsCount * 128;
              });
          }
          
          electron.onEventData((payload: { sessionId: string, event: OpcEvent }) => {
              this._accumulators.items += 1;
              try {
                  this._accumulators.bytesIn += JSON.stringify(payload.event, (key, value) => typeof value === 'bigint' ? value.toString() : value).length;
              } catch (e) {
                  this._accumulators.bytesIn += 100;
              }
              if (this._eventCallback) {
                  this._eventCallback(payload.event);
              }
          });
          
          electron.onOpcuaConnectionDrop((sessionId: string) => {
              if (this._intentionalDisconnects.has(sessionId)) {
                  this._intentionalDisconnects.delete(sessionId);
                  return;
              }
              console.warn(`[Service] Unexpected Connection Drop for ${sessionId}`);
              this._dropListeners.forEach(cb => cb(sessionId));
          });
      }
      
      public onDrop(callback: (sessionId: string) => void) {
          this._dropListeners.push(callback);
          return () => { this._dropListeners = this._dropListeners.filter(cb => cb !== callback); };
      }
  
      private _estimateSize(obj: any): number { try { const str = JSON.stringify(obj); return str ? str.length : 0; } catch { return 100; } }

      private _recordOpStat(type: 'Read'|'Write'|'Browse'|'Method', duration: number, itemCount: number, reqSize: number, resSize: number, details: string) {
          this._accumulators.ops += 1;
          this._accumulators.items += itemCount;
          this._accumulators.bytesOut += reqSize;
          this._accumulators.bytesIn += resSize;
          this._stats.lastRtt = duration;
          this._stats.rttHistory.push(duration);
          if (this._stats.rttHistory.length > 50) this._stats.rttHistory.shift();
          const sum = this._stats.rttHistory.reduce((a, b) => a + b, 0);
          this._stats.avgRtt = Math.round(sum / this._stats.rttHistory.length);
          let score = 100;
          if (this._stats.avgRtt > 100) score -= 10;
          if (this._stats.avgRtt > 500) score -= 30;
          if (this._stats.avgRtt > 2000) score -= 50;
          this._stats.healthScore = Math.max(0, score);
          if (duration > 150) {
              this._stats.slowOps.unshift({ id: `slow-${Date.now()}-${Math.random().toString(36).substr(2,5)}`, operation: type, details: details, duration: duration, timestamp: new Date().toLocaleTimeString() });
              if (this._stats.slowOps.length > 10) this._stats.slowOps.pop();
          }
      }
  
      getStats(): SessionStatistics { return { ...this._stats }; }
      getStackInfo() { return { vendor: 'React OPC UA', name: 'Web Client Stack', version: '2.4.0', protocolVersion: '1.04' }; }
  
      async getEndpoints(url: string): Promise<EndpointDescription[]> {
          if (!url) throw new Error("URL is required");
          if (!url.startsWith('opc.tcp://')) url = 'opc.tcp://' + url;
          const electron = getElectron();
          if (electron) { try { return await electron.getEndpoints(url); } catch (e: any) { throw new Error(`Discovery failed: ${e.message}`); } }
          // BROWSER FALLBACK: Return a mock endpoint for simulation
          console.warn(`[Service] Browser environment: Returning mock endpoint for ${url}`);
          return [{
              endpointUrl: url,
              securityMode: MessageSecurityMode.None,
              securityPolicyUri: 'http://opcfoundation.org/UA/SecurityPolicy#None',
              transportProfileUri: 'http://opcfoundation.org/UA-Profile/Transport/uatcp-uasc-uabinary'
          } as any];
      }
  
      async connect(url: string, mode: MessageSecurityMode, policy: SecurityPolicy, auth: AuthSettings, options?: ConnectionOptions): Promise<{ backendId: string, secureChannelId: number, sessionNodeId: string }> {
          if (!url) throw new Error("Endpoint URL is required.");
          if (!url.startsWith('opc.tcp://')) url = 'opc.tcp://' + url;
          const backendId = 'session-' + Math.random().toString(36).substr(2, 9);
          const electron = getElectron();
          
          if (electron) {
              try {
                  console.log(`[Service] Connecting to ${url} via Electron IPC...`);
                  const connectionPromise = electron.connect(backendId, url, { securityMode: mode, securityPolicy: policy, auth, options });
                  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Connection request timed out (Backend Unresponsive)")), 15000));
                  const result: any = await Promise.race([connectionPromise, timeoutPromise]);
                  if (!result || !result.success) throw new Error(result.error || "Connection failed.");
                  this._connectStartTime = Date.now();
                  this._isConnected = true;
                  return { backendId: backendId, secureChannelId: result.secureChannelId, sessionNodeId: result.sessionNodeId };
              } catch (e: any) { 
                  console.error(`[Service] Connection failed for ${url}:`, e); 
                  throw new Error(e.message || "Connection failed."); 
              }
          } else {
              // BROWSER FALLBACK: Simulation Mode
              console.warn(`[Service] Browser environment detected. Falling back to Simulation Mode for ${url}`);
              const simBackendId = 'sim-' + Math.random().toString(36).substr(2, 9);
              this._connectStartTime = Date.now();
              this._isConnected = true;
              return { 
                  backendId: simBackendId, 
                  secureChannelId: 12345, 
                  sessionNodeId: 'ns=1;s=SimulatedSession' 
              };
          }
      }
  
      async disconnect(backendId: string): Promise<void> {
          if (backendId) this._intentionalDisconnects.add(backendId);
          const electron = getElectron();
          if (electron && backendId) { try { await electron.disconnect(backendId); } catch (e) { console.warn("Disconnect error:", e); } }
          this._connectStartTime = 0;
          this._isConnected = false;
      }
  
      async browse(backendId: string, nodeId: string, limit?: number): Promise<ReferenceDescription[]> {
          const electron = getElectron();
          if (!backendId) throw new Error("Session Not Connected");
          const start = Date.now();
          if (electron) {
              try {
                const res = await electron.browse(backendId, nodeId, limit);
                this._recordOpStat('Browse', Date.now() - start, res.length, 100, this._estimateSize(res), nodeId);
                return res;
              } catch(e: any) { throw new Error(`Browse failed: ${e.message}`); }
          }
          
          // BROWSER FALLBACK: Mock Browse
          if (backendId.startsWith('sim-')) {
              console.log(`[Service] Simulating Browse for ${nodeId}`);
              const mockNodes = [
                  { nodeId: 'ns=1;s=Temperature', browseName: 'Temperature', displayName: 'Temperature', nodeClass: 2, typeDefinition: 'ns=0;i=63' },
                  { nodeId: 'ns=1;s=Pressure', browseName: 'Pressure', displayName: 'Pressure', nodeClass: 2, typeDefinition: 'ns=0;i=63' },
                  { nodeId: 'ns=1;s=Status', browseName: 'Status', displayName: 'Status', nodeClass: 2, typeDefinition: 'ns=0;i=63' },
                  { nodeId: 'ns=1;s=Control', browseName: 'Control', displayName: 'Control', nodeClass: 1, typeDefinition: 'ns=0;i=58' },
              ];
              return mockNodes as any;
          }
          
          throw new Error("No Backend");
      }

      async readAttributes(backendId: string, nodeId: string): Promise<any> {
          const electron = getElectron();
          const start = Date.now();
          if (electron) {
              try { const res = await electron.readAttributes(backendId, nodeId); this._recordOpStat('Read', Date.now() - start, 1, 50, 500, `${nodeId} (Attributes)`); return res; } catch (e: any) { throw new Error(`Read Attributes failed: ${e.message}`); }
          }
          
          // BROWSER FALLBACK: Mock Attributes
          if (backendId.startsWith('sim-')) {
              return {
                  nodeId,
                  browseName: nodeId.split('=').pop(),
                  displayName: nodeId.split('=').pop(),
                  description: 'Simulated Node',
                  nodeClass: 'Variable',
                  dataType: 'Double',
                  accessLevel: 'CurrentRead | CurrentWrite',
                  userAccessLevel: 'CurrentRead | CurrentWrite'
              };
          }
          
          throw new Error("No Backend");
      }
  
      async readNodes(backendId: string, nodeIds: string[], typeMap: Map<string, OpcDataType>): Promise<{value: any, statusCode: string, sourceTimestamp: string, lastRtt: number}[]> {
          const electron = getElectron();
          if (!backendId) throw new Error("Session Not Connected");
          const start = Date.now();
          if (electron) {
              try {
                  const nodesToRead = nodeIds.map(id => ({ nodeId: id }));
                  const results = await electron.read(backendId, nodesToRead);
                  const duration = Date.now() - start;
                  const reqSize = nodeIds.reduce((acc, id) => acc + id.length + 10, 0); 
                  const resSize = this._estimateSize(results);
                  const details = nodeIds.length === 1 ? nodeIds[0] : `Batch Read (${nodeIds.length} items)`;
                  this._recordOpStat('Read', duration, nodeIds.length, reqSize, resSize, details);
                  return results.map((r: any) => ({
                      value: sanitizeValue(r.value),
                      statusCode: r.statusCode?.name || 'Good',
                      sourceTimestamp: r.sourceTimestamp ? new Date(r.sourceTimestamp).toISOString() : new Date().toISOString(),
                      lastRtt: r.serverDuration || duration 
                  }));
              } catch (e: any) { 
                  // If backend error, return BAD status for all, do not mock success
                  return nodeIds.map(() => ({ value: null, statusCode: 'BadInternalError', sourceTimestamp: new Date().toISOString(), lastRtt: 0 })); 
              }
          }
          
          // BROWSER FALLBACK: Mock Read
          if (backendId.startsWith('sim-')) {
              return nodeIds.map(id => {
                  let val: any = 0;
                  if (id.includes('Temperature')) val = 20 + Math.random() * 10;
                  else if (id.includes('Pressure')) val = 100 + Math.random() * 5;
                  else if (id.includes('Status')) val = Math.random() > 0.1;
                  else val = Math.floor(Math.random() * 100);
                  
                  return {
                      value: val,
                      statusCode: 'Good',
                      sourceTimestamp: new Date().toISOString(),
                      lastRtt: 10 + Math.random() * 20
                  };
              });
          }
          
          throw new Error("No Backend");
      }
  
      async writeNode(backendId: string, nodeId: string, value: any, dataType: OpcDataType): Promise<number> { return (await this.writeNodes(backendId, [{nodeId, value, dataType}])).duration; }
      
      async writeNodes(backendId: string, nodes: {nodeId: string, value: any, dataType: OpcDataType, indexRange?: string}[]): Promise<{duration: number, results: string[]}> {
          const electron = getElectron();
          if (!backendId) throw new Error("Session Not Connected");
          const start = Date.now();
          if (electron) {
              const results: string[] = await electron.write(backendId, nodes);
              const duration = Date.now() - start;
              const reqSize = this._estimateSize(nodes); 
              const resSize = results.length * 4; 
              const details = nodes.length === 1 ? `${nodes[0].nodeId} = ${String(nodes[0].value).substring(0, 20)}` : `Batch Write (${nodes.length} items)`;
              this._recordOpStat('Write', duration, nodes.length, reqSize, resSize, details);
              return { duration, results };
          }
          
          // BROWSER FALLBACK: Mock Write
          if (backendId.startsWith('sim-')) {
              console.log(`[Service] Simulating Write for ${nodes.length} nodes`);
              return { duration: 5 + Math.random() * 10, results: nodes.map(() => 'Good') };
          }
          
          throw new Error("No Backend");
      }
  
      registerSubscriptionCallback(sessionId: string, subId: number, callback: (subId: number, items: MonitoredItem[]) => void) { const key = this._getCallbackKey(sessionId, subId); this._subscriptionCallbacks.set(key, callback); }

      async registerSubscription(backendId: string, sub: Subscription, callback: (subId: number, items: MonitoredItem[]) => void): Promise<number> {
          const key = this._getCallbackKey(backendId, sub.subscriptionId);
          this._subscriptionCallbacks.set(key, callback);
          const electron = getElectron();
          if (electron) {
               const start = Date.now();
               const res = await electron.createSubscription(backendId, sub);
               this._recordOpStat('Method', Date.now() - start, 0, 100, 50, `Create Sub (View ${sub.viewIndex})`);
               return res.subscriptionId;
          }
          
          // BROWSER FALLBACK: Mock Subscription
          if (backendId.startsWith('sim-')) {
              console.log(`[Service] Simulating Subscription for backend ${backendId}`);
              return sub.subscriptionId;
          }
          
          throw new Error("No Backend");
      }

      async monitorItemsWithSettings(backendId: string, subId: number, items: MonitoredItem[], settings: any): Promise<any[]> {
          const electron = getElectron();
          if (electron) {
              if (!Array.isArray(items) || items.length === 0) return [];
              const start = Date.now();
              const payload = items.map(i => ({ nodeId: String(i.nodeId), clientHandle: Number(i.clientHandle), attributeId: 13 }));
              const res = await electron.monitorItems(backendId, subId, payload, settings);
              this._recordOpStat('Method', Date.now() - start, items.length, payload.length * 50, res.length * 20, `Monitor ${items.length} Items`);
              return res;
          }
          return [];
      }
  
      async pauseSubscription(backendId: string, id: number) { const electron = getElectron(); if (electron) await electron.setPublishingMode(backendId, id, false); }
      async resumeSubscription(backendId: string, id: number) { const electron = getElectron(); if (electron) await electron.setPublishingMode(backendId, id, true); }
      async deleteSubscription(backendId: string, id: number) { 
          const electron = getElectron();
          const key = this._getCallbackKey(backendId, id);
          this._subscriptionCallbacks.delete(key);
          if (electron) electron.deleteSubscription(backendId, id);
      }
      async removeMonitoredItems(backendId: string, subId: number, handles: number[]) { const electron = getElectron(); if (electron) electron.removeMonitoredItems(backendId, subId, handles); }
      async subscribeToEvents(sessionId: string, callback: (e: OpcEvent) => void): Promise<number> { this._eventCallback = callback; const electron = getElectron(); if (electron) { await electron.subscribeEvents(sessionId); return 1; } return 0; }
      async unsubscribeEvents(sessionId: string) { this._eventCallback = null; const electron = getElectron(); if (electron) await electron.unsubscribeEvents(sessionId); }
      async getMethodMetadata(backendId: string, nodeId: string): Promise<MethodMetadata | null> { const electron = getElectron(); if (electron) return await electron.getMethodMetadata(backendId, nodeId); return null; }
      async callMethod(backendId: string, objectId: string, methodId: string, args: any[]): Promise<any[]> { const electron = getElectron(); if (electron) return await electron.callMethod(backendId, objectId, methodId, args); return [false, "No Backend"]; }
      async getCertificates(type: 'trusted' | 'rejected' | 'own'): Promise<CertificateFile[]> { const electron = getElectron(); if (electron) { const res = await electron.pkiList(type); if (res.success) return res.files; throw new Error(res.error); } return []; }
      async trustCertificate(filename: string): Promise<void> { const electron = getElectron(); if (electron) { const res = await electron.pkiTrust(filename); if (!res.success) throw new Error(res.error); } }
      async rejectCertificate(filename: string): Promise<void> { const electron = getElectron(); if (electron) { const res = await electron.pkiReject(filename); if (!res.success) throw new Error(res.error); } }
      async deleteCertificate(type: 'trusted' | 'rejected' | 'own', filename: string): Promise<void> { const electron = getElectron(); if (electron) { const res = await electron.pkiDelete(type, filename); if (!res.success) throw new Error(res.error); } }
      async readHistory(sessionId: string, nodeId: string, startTime: Date, endTime: Date): Promise<HistoryReadResult> {
          const electron = getElectron();
          if (!sessionId) throw new Error("Session not connected");
          if (electron) {
              const start = startTime.toISOString();
              const end = endTime.toISOString();
              try {
                  const res = await electron.readHistory(sessionId, nodeId, start, end);
                  if (res.success) { return { nodeId, statusCode: res.statusCode, data: res.data.map((d: any) => ({ value: sanitizeValue(d.value), timestamp: d.sourceTimestamp })) }; }
                  throw new Error(res.error || "History Read Failed");
              } catch (e: any) { throw new Error(`History Read Error: ${e.message}`); }
          }
          throw new Error("No Backend");
      }

      // --- CHAOS TESTING ---
      async chaosStop(): Promise<void> { const electron = getElectron(); if (electron) await electron.chaosStop(); }
      async chaosFlood(endpointUrl: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("No Backend"); return await electron.chaosFlood(endpointUrl, config); }
      async chaosFuzzRead(sessionId: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("Not Connected"); return await electron.chaosFuzzRead(sessionId, config); }
      async chaosMismatchWrite(sessionId: string, targetNodeId: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("Not Connected"); return await electron.chaosMismatchWrite(sessionId, targetNodeId, config); }
      async chaosMalformedPacket(endpointUrl: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("No Backend"); return await electron.chaosMalformedPacket(endpointUrl, config); }
      async chaosSubscriptionStorm(endpointUrl: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("No Backend"); return await electron.chaosSubscriptionStorm(endpointUrl, config); }
      async chaosFlapping(endpointUrl: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("No Backend"); return await electron.chaosFlapping(endpointUrl, config); }
      async chaosProtocolDowngrade(endpointUrl: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("No Backend"); return await electron.chaosProtocolDowngrade(endpointUrl, config); }
      async chaosSecureChannelStress(endpointUrl: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("No Backend"); return await electron.chaosSecureChannelStress(endpointUrl, config); }
      async chaosRecursiveBrowse(sessionId: string, config: any): Promise<ChaosResult> { const electron = getElectron(); if (!electron) throw new Error("Not Connected"); return await electron.chaosRecursiveBrowse(sessionId, config); }
  }
  
  export const opcuaService = new OpcUaService();