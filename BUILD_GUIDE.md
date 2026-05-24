# Professional OPC UA Client - Developer & User Manual

This application is a high-performance OPC UA client built with React 19 and Electron, designed for industrial commissioning, stress testing, and data bridging.

## 🚀 Core Features

### 1. Connection Management
- **Endpoint Discovery**: Click the globe icon to automatically find server security configurations.
- **Security Support**: Supports `None`, `Sign`, and `SignAndEncrypt` with policies like `Basic256Sha256`.
- **Identity**: Anonymous, Username/Password, and Certificate-based authentication.
- **Auto-Automation**: Toggle `Auto Reconnect`, `Auto Read`, and `Auto Subscribe` for hands-off operation.

### 2. Data Access (Read/Write)
- **Batch Processing**: Group nodes and perform cyclic reads/writes.
- **Smart Auto-Increment**: Enable `Auto +1` to simulate PLC data changes. Includes integer wrap-around (e.g., Byte 255 -> 0) and string suffix incrementing (e.g., `Job_01` -> `Job_02`).
- **Value Inspector**: Double-click complex types (Arrays/Matrices) to view in a grid or paste data directly from Excel.

### 3. Subscription (Real-time Monitoring)
- **Change Detection**: Efficiently monitor data changes using the OPC UA Pub/Sub model.
- **Data Recording**: Buffer incoming data in real-time and export to CSV with millisecond precision.
- **High Volume**: Optimized virtualized rendering handles thousands of monitored items with low CPU overhead.

### 4. Address Space Browser
- **Virtual Tree**: Navigate massive server hierarchies smoothly.
- **Variable Basket**: A staging area to collect nodes before mass-adding them to functional panels.

### 5. Data Scheduler (Bridging)
- **Logic Engine**: Map Source Nodes to Target Nodes for automatic data forwarding.
- **Type Safety**: Automatic detection of data type mismatches between mapped pairs.

---

## 🛠️ Developer Information

### Architecture
- **Frontend**: React 19 + Tailwind CSS. State is managed via React hooks with heavy use of `useRef` for performance-critical live data.
- **Backend**: Electron (Node.js). Handles the `node-opcua` stack.
- **Bridge**: Communication via `ipcMain` and `ipcRenderer` (see `electron/preload.js`).

### Service Layer (`services/opcuaService.ts`)
Programmers can use the `opcuaService` singleton to interact with the backend:
```typescript
// Example: Reading nodes
const results = await opcuaService.readNodes(sessionId, ["ns=2;s=MyTag"], typeMap);

// Example: Creating a subscription
const subId = await opcuaService.registerSubscription(sessionId, subConfig, callback);
```

### Installation & Build
1.  **Install**: `npm install`
2.  **Dev Mode**: `npm run electron:dev`
3.  **Build EXE**: `npm run electron:build`

---

## 📝 Compliance
- **Specification**: OPC UA 1.04 Compliant.
- **Protocol**: TCP Binary (`opc.tcp`).
- **Author**: Yan Weiping (Lead Engineer).
