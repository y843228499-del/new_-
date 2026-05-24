
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing OPCUA / Modbus bridges ...
  // --- OPC UA ---
  connect: (sessionId, endpointUrl, options) => ipcRenderer.invoke('opcua:connect', sessionId, endpointUrl, options),
  disconnect: (sessionId) => ipcRenderer.invoke('opcua:disconnect', sessionId),
  getEndpoints: (endpointUrl) => ipcRenderer.invoke('opcua:getEndpoints', endpointUrl),
  browse: (sessionId, nodeId, limit) => ipcRenderer.invoke('opcua:browse', sessionId, nodeId, limit),
  read: (sessionId, nodes) => ipcRenderer.invoke('opcua:read', sessionId, nodes),
  write: (sessionId, nodes) => ipcRenderer.invoke('opcua:write', sessionId, nodes),
  readAttributes: (sessionId, nodeId) => ipcRenderer.invoke('opcua:readAttributes', sessionId, nodeId),
  getMethodMetadata: (sessionId, methodId) => ipcRenderer.invoke('opcua:getMethodMetadata', sessionId, methodId),
  callMethod: (sessionId, objectId, methodId, args) => ipcRenderer.invoke('opcua:callMethod', sessionId, objectId, methodId, args),
  createSubscription: (sessionId, options) => ipcRenderer.invoke('opcua:sub:create', sessionId, options), 
  deleteSubscription: (sessionId, subId) => ipcRenderer.invoke('opcua:sub:delete', sessionId, subId),
  setPublishingMode: (sessionId, subId, enabled) => ipcRenderer.invoke('opcua:sub:setMode', sessionId, subId, enabled),
  monitorItems: (sessionId, subId, items, settings) => ipcRenderer.invoke('opcua:sub:monitor', sessionId, subId, items, settings),
  removeMonitoredItems: (sessionId, subId, handles) => ipcRenderer.invoke('opcua:sub:unmonitor', sessionId, subId, handles),
  subscribeEvents: (sessionId) => ipcRenderer.invoke('opcua:events:subscribe', sessionId),
  unsubscribeEvents: (sessionId) => ipcRenderer.invoke('opcua:events:unsubscribe', sessionId),
  
  // --- CHAOS TESTING ---
  chaosStop: () => ipcRenderer.invoke('opcua:chaos:stop'),
  chaosFlood: (endpointUrl, count) => ipcRenderer.invoke('opcua:chaos:flood', endpointUrl, count),
  chaosFuzzRead: (sessionId, count) => ipcRenderer.invoke('opcua:chaos:fuzzRead', sessionId, count),
  chaosMismatchWrite: (sessionId, nodeId, count) => ipcRenderer.invoke('opcua:chaos:mismatchWrite', sessionId, nodeId, count),
  chaosMalformedPacket: (endpointUrl, count) => ipcRenderer.invoke('opcua:chaos:malformed', endpointUrl, count),
  chaosSubscriptionStorm: (endpointUrl, count) => ipcRenderer.invoke('opcua:chaos:subStorm', endpointUrl, count),
  chaosFlapping: (endpointUrl, count) => ipcRenderer.invoke('opcua:chaos:flapping', endpointUrl, count),
  chaosProtocolDowngrade: (endpointUrl, count) => ipcRenderer.invoke('opcua:chaos:downgrade', endpointUrl, count),
  chaosSecureChannelStress: (endpointUrl, count) => ipcRenderer.invoke('opcua:chaos:secureStress', endpointUrl, count),
  chaosRecursiveBrowse: (sessionId, count) => ipcRenderer.invoke('opcua:chaos:recursive', sessionId, count),

  // --- EtherNet/IP (Generic) ---
  eipConnect: (sessionId, address, slot, connectionSize) => ipcRenderer.invoke('eip:connect', sessionId, address, slot, connectionSize),
  eipDisconnect: (sessionId) => ipcRenderer.invoke('eip:disconnect', sessionId),
  eipReadTag: (sessionId, tagName) => ipcRenderer.invoke('eip:readTag', sessionId, tagName),
  eipReadMulti: (sessionId, tagNames) => ipcRenderer.invoke('eip:readMulti', sessionId, tagNames),
  eipWriteTag: (sessionId, tagName, value, dataType) => ipcRenderer.invoke('eip:writeTag', sessionId, tagName, value, dataType),
  eipWriteMulti: (sessionId, tags) => ipcRenderer.invoke('eip:writeMulti', sessionId, tags),

  // --- EtherNet/IP Class 1 (Implicit) ---
  eipClass1Start: (sessionId, config) => ipcRenderer.invoke('eip-class1:start', sessionId, config),
  eipClass1Stop: (sessionId) => ipcRenderer.invoke('eip-class1:stop', sessionId),
  eipClass1UpdateData: (sessionId, targetIp, connId, dataArray) => ipcRenderer.invoke('eip-class1:updateData', sessionId, targetIp, connId, dataArray),
  eipClass1Scan: (timeoutMs) => ipcRenderer.invoke('eip-class1:scan', timeoutMs),
  onEipClass1Data: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip-class1:data', sub);
      return () => ipcRenderer.removeListener('eip-class1:data', sub);
  },
  onEipClass1Error: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip-class1:error', sub);
      return () => ipcRenderer.removeListener('eip-class1:error', sub);
  },
  onEipClass1Stats: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip-class1:stats', sub);
      return () => ipcRenderer.removeListener('eip-class1:stats', sub);
  },
  onEipClass1ConnDropped: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip-class1:conn-dropped', sub);
      return () => ipcRenderer.removeListener('eip-class1:conn-dropped', sub);
  },
  onEipClass1ConnRecovered: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip-class1:conn-recovered', sub);
      return () => ipcRenderer.removeListener('eip-class1:conn-recovered', sub);
  },

  // --- Inovance DLL (Native) ---
  inovanceGetLocalIps: () => ipcRenderer.invoke('inovance:getLocalIps'),
  inovanceConnect: (localIp, targetIp, sessionId) => ipcRenderer.invoke('inovance:connect', { localIp, targetIp, sessionId }),
  inovanceDisconnect: (instanceId) => ipcRenderer.invoke('inovance:disconnect', instanceId),
  
  // Single Ops
  inovanceRead: (instanceId, tagName, alignType, elementCount) => ipcRenderer.invoke('inovance:read', instanceId, tagName, alignType, elementCount),
  inovanceWrite: (instanceId, tagName, value, dataType, alignType, elementCount) => ipcRenderer.invoke('inovance:write', instanceId, tagName, value, dataType, alignType, elementCount),
  
  // NEW: List Ops
  inovanceReadList: (instanceId, tags, alignType) => ipcRenderer.invoke('inovance:readList', instanceId, tags, alignType),
  inovanceWriteList: (instanceId, tags, alignType) => ipcRenderer.invoke('inovance:writeList', instanceId, tags, alignType),

  inovanceResetCache: () => ipcRenderer.invoke('inovance:resetCache'),
  inovanceStartStack: (localIp) => ipcRenderer.invoke('inovance:startStack', localIp),
  inovanceStopStack: () => ipcRenderer.invoke('inovance:stopStack'),
  
  // --- Modbus TCP & RTU ---
  modbusConnect: (sessionId, ip, port, unitId, timeout, useActiveProbe, localBindIp) => ipcRenderer.invoke('modbus:connect', sessionId, ip, port, unitId, timeout, useActiveProbe, localBindIp),
  modbusRtuConnect: (sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, timeout, useActiveProbe, transport) => ipcRenderer.invoke('modbus:rtu:connect', sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, timeout, useActiveProbe, transport),
  modbusListPorts: () => ipcRenderer.invoke('modbus:list-ports'),
  modbusDisconnect: (sessionId) => ipcRenderer.invoke('modbus:disconnect', sessionId),
  modbusWrite: (sessionId, fc, address, value) => ipcRenderer.invoke('modbus:write', sessionId, fc, address, value),
  modbusStartPoll: (sessionId, registers, interval) => ipcRenderer.invoke('modbus:poll:start', sessionId, registers, interval),
  modbusStopPoll: (sessionId) => ipcRenderer.invoke('modbus:poll:stop', sessionId),
  modbusUpdateConfig: (sessionId, registers, interval) => ipcRenderer.invoke('modbus:poll:update', sessionId, registers, interval),
  modbusTrigger: (sessionId, register) => ipcRenderer.invoke('modbus:trigger', sessionId, register),
  onModbusData: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus:data', sub);
      return () => ipcRenderer.removeListener('modbus:data', sub);
  },
  onModbusLog: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus:log', sub);
      return () => ipcRenderer.removeListener('modbus:log', sub);
  },

  // --- Modbus TCP Slave ---
  modbusSlaveStart: (sessionId, port, unitId, memorySize, localBindIp, ignoreUnitId) => ipcRenderer.invoke('modbus-slave:start', sessionId, port, unitId, memorySize, localBindIp, ignoreUnitId),
  modbusSlaveStop: (sessionId) => ipcRenderer.invoke('modbus-slave:stop', sessionId),
  modbusSlaveReadMemory: (sessionId, type, address, length) => ipcRenderer.invoke('modbus-slave:read-memory', sessionId, type, address, length),
  modbusSlaveWriteMemory: (sessionId, type, address, values) => ipcRenderer.invoke('modbus-slave:write-memory', sessionId, type, address, values),
  
  // --- Modbus RTU Slave ---
  modbusRtuSlaveStart: (sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, memorySize, transport) => ipcRenderer.invoke('modbus-rtu-slave:start', sessionId, comPort, baudRate, dataBits, stopBits, parity, unitId, memorySize, transport),
  modbusRtuSlaveStop: (sessionId) => ipcRenderer.invoke('modbus-rtu-slave:stop', sessionId),
  modbusRtuSlaveReadMemory: (sessionId, type, address, length) => ipcRenderer.invoke('modbus-rtu-slave:read-memory', sessionId, type, address, length),
  modbusRtuSlaveWriteMemory: (sessionId, type, address, values) => ipcRenderer.invoke('modbus-rtu-slave:write-memory', sessionId, type, address, values),

  onModbusRtuSlaveDataChanged: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-rtu-slave:data-changed', sub);
      return () => ipcRenderer.removeListener('modbus-rtu-slave:data-changed', sub);
  },
  onModbusRtuSlaveError: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-rtu-slave:error', sub);
      return () => ipcRenderer.removeListener('modbus-rtu-slave:error', sub);
  },
  onModbusRtuSlaveLog: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-rtu-slave:log', sub);
      return () => ipcRenderer.removeListener('modbus-rtu-slave:log', sub);
  },
  onModbusRtuSlaveDrop: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-rtu-slave:drop', sub);
      return () => ipcRenderer.removeListener('modbus-rtu-slave:drop', sub);
  },

  onModbusSlaveDataChanged: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-slave:data-changed', sub);
      return () => ipcRenderer.removeListener('modbus-slave:data-changed', sub);
  },
  onModbusSlaveClientChanged: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-slave:client-changed', sub);
      return () => ipcRenderer.removeListener('modbus-slave:client-changed', sub);
  },
  onModbusSlaveError: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-slave:error', sub);
      return () => ipcRenderer.removeListener('modbus-slave:error', sub);
  },
  onModbusSlaveLog: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-slave:log', sub);
      return () => ipcRenderer.removeListener('modbus-slave:log', sub);
  },
  onModbusSlaveDrop: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-slave:drop', sub);
      return () => ipcRenderer.removeListener('modbus-slave:drop', sub);
  },
  onModbusSlaveMemoryUpdate: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('modbus-slave:memory-update', sub);
      return () => ipcRenderer.removeListener('modbus-slave:memory-update', sub);
  },

  // --- Common ---
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  modbusAutoSaveLog: (prefix, content) => ipcRenderer.invoke('modbus:auto-save-log', prefix, content),
  modbusOpenLogsDir: () => ipcRenderer.invoke('modbus:open-logs-dir'),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  openPath: (pathStr) => ipcRenderer.invoke('shell:openPath', pathStr),
  openPkiFolder: (type) => ipcRenderer.invoke('opcua:pki:open', type),
  getAppPaths: () => ipcRenderer.invoke('app:getPaths'),
  getNetworkInterfaces: () => ipcRenderer.invoke('app:getNetworkInterfaces'),
  openDevTools: () => ipcRenderer.invoke('app:openDevTools'),
  pkiList: (type) => ipcRenderer.invoke('opcua:pki:list', type),
  pkiTrust: (filename) => ipcRenderer.invoke('opcua:pki:trust', filename),
  pkiReject: (filename) => ipcRenderer.invoke('opcua:pki:reject', filename),
  pkiDelete: (type, filename) => ipcRenderer.invoke('opcua:pki:delete', type, filename),
  readHistory: (sessionId, nodeId, startTime, endTime) => ipcRenderer.invoke('opcua:historyRead', sessionId, nodeId, startTime, endTime),
  
  // Events
  onEventData: (callback) => ipcRenderer.on('opcua:events:data', (_event, value) => callback(value)),
  onDataChange: (callback) => ipcRenderer.on('opcua:data:change', (_event, value) => callback(value)),
  onDataChangeBatch: (callback) => ipcRenderer.on('opcua:data:change:batch', (_event, batches) => callback(batches)),
  onOpcuaConnectionDrop: (callback) => ipcRenderer.on('opcua:connection:drop', (_event, value) => callback(value)),
  onEipConnectionDrop: (callback) => {
      const sub = (_event, value) => callback(value.sessionId);
      ipcRenderer.on('eip:connection:drop', sub);
      return () => ipcRenderer.removeListener('eip:connection:drop', sub);
  },
  
  // NEW: Debug Logs
  onEipDebug: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip:debug', sub);
      return () => ipcRenderer.removeListener('eip:debug', sub);
  },
  
  // --- NEW: Receive real-time status code from Watchdog ---
  onEipSessionState: (callback) => {
      const sub = (_event, value) => callback(value);
      ipcRenderer.on('eip:session:state', sub);
      return () => ipcRenderer.removeListener('eip:session:state', sub);
  },
  
  onModbusConnectionDrop: (callback) => {
      const sub = (_event, value) => callback(value.sessionId);
      ipcRenderer.on('modbus:connection:drop', sub);
      return () => ipcRenderer.removeListener('modbus:connection:drop', sub);
  },
  onDebugLog: (callback) => ipcRenderer.on('opcua:debug', (_event, value) => callback(value)),
  onCloseRequest: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('window:close-request', subscription);
    return () => ipcRenderer.removeListener('window:close-request', subscription);
  },
  confirmClose: () => ipcRenderer.send('window:close-confirmed')
});
