process.env.UV_THREADPOOL_SIZE = 128;

const { app, BrowserWindow, ipcMain, shell, dialog, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process'); 

// Protocols
const opcua = require('./opcua');
const eip = require('./eip');
const eipClass1 = require('./eip-class1');
const modbus = require('./modbus');
const modbusSlave = require('./modbus-slave');
const modbusRtuSlave = require('./modbus-rtu-slave');
const inovance = require('./inovance'); // --- NEW: Inovance DLL Wrapper ---

// --- OPTIMIZATION FLAGS (MAXIMUM PERFORMANCE) ---
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('force_high_performance_gpu');

let mainWindow;
let powerSaveId = null;

// --- POWER CONFIGURATION HELPERS ---
function enforceHighPerformance() {
    if (process.platform === 'win32') {
        console.log('[Power] Enforcing High Performance Power Scheme...');
        exec('powercfg /change standby-timeout-ac 0'); 
        exec('powercfg /change monitor-timeout-ac 0');
    }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    title: "Industrial Client Suite",
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, 
      autoplayPolicy: 'no-user-gesture-required'
    },
    icon: path.join(__dirname, '../public/favicon.ico') 
  });

  mainWindow.setMenuBarVisibility(false);

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  mainWindow.loadURL(startUrl);

  if (process.env.ELECTRON_START_URL) {
      mainWindow.webContents.openDevTools();
  }

  setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('heartbeat', Date.now());
      }
  }, 1000);

  mainWindow.on('close', (e) => {
    e.preventDefault();
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window:close-request');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function updatePowerSaveBlocker() {
    const active = opcua.hasActiveSessions() || eip.hasActiveSessions() || modbus.hasActiveSessions() || modbusSlave.hasActiveSessions() || modbusRtuSlave.hasActiveSessions();
    if (active) {
        if (powerSaveId === null) {
            powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
            try { os.setPriority(os.constants.priority.PRIORITY_HIGH || 1); } catch(e) {}
        }
    } else {
        if (powerSaveId !== null) {
            powerSaveBlocker.stop(powerSaveId);
            powerSaveId = null;
            try { os.setPriority(os.constants.priority.PRIORITY_NORMAL || 0); } catch(e) {}
        }
    }
}

function sendToWindow(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

async function closeAllActiveSessions() {
    console.log(`[Shutdown] Cleaning up...`);
    await Promise.all([
        opcua.closeAll(),
        eip.closeAll(),
        eipClass1.closeAll(),
        modbus.closeAll(),
        modbusSlave.closeAll(),
        modbusRtuSlave.closeAll()
    ]);
    if (powerSaveId !== null) {
        powerSaveBlocker.stop(powerSaveId);
        powerSaveId = null;
    }
}

// --- REGISTER PROTOCOLS ---
opcua.register(ipcMain, updatePowerSaveBlocker, sendToWindow);
eip.register(ipcMain, updatePowerSaveBlocker, sendToWindow); 
eipClass1.register(ipcMain, sendToWindow);
modbus.register(ipcMain, updatePowerSaveBlocker, sendToWindow);
modbusSlave.register(ipcMain, updatePowerSaveBlocker, sendToWindow);
modbusRtuSlave.register(ipcMain, updatePowerSaveBlocker, sendToWindow);
inovance.register(ipcMain, sendToWindow); // --- FIX: Pass sendToWindow ---

// --- APP EVENTS ---
ipcMain.on('window:close-confirmed', async () => {
  await Promise.race([closeAllActiveSessions(), new Promise(r => setTimeout(r, 1000))]);
  if (mainWindow) mainWindow.destroy();
});

app.on('before-quit', async (e) => {
    if (opcua.hasActiveSessions() || eip.hasActiveSessions() || eipClass1.hasActiveSessions() || modbus.hasActiveSessions() || modbusSlave.hasActiveSessions() || modbusRtuSlave.hasActiveSessions()) {
        e.preventDefault();
        await Promise.race([closeAllActiveSessions(), new Promise(r => setTimeout(r, 1000))]);
        app.quit();
    }
});

app.on('ready', () => {
    enforceHighPerformance();
    createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

// --- COMMON HANDLERS ---
ipcMain.handle('modbus:auto-save-log', async (_, prefix, content) => {
    try {
        const destDir = path.join(app.getPath('documents'), 'ModbusLogs');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        const p = path.join(destDir, `${prefix}.csv`);
        fs.writeFileSync(p, content, 'utf8');
        return { success: true, path: p };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('modbus:open-logs-dir', async () => {
    try {
        const { shell } = require('electron');
        const destDir = path.join(app.getPath('documents'), 'ModbusLogs');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        shell.showItemInFolder(destDir);
        return { success: true };
    } catch(e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle('app:openDevTools', () => { if (mainWindow) mainWindow.webContents.openDevTools(); });
ipcMain.handle('settings:save', async (_, settings) => { try { fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(settings, null, 2)); return { success: true }; } catch(e) { return { success: false, error: e.message }; } });
ipcMain.handle('settings:load', async () => { try { const p = path.join(app.getPath('userData'), 'settings.json'); return { success: true, settings: fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null }; } catch(e) { return { success: false, error: e.message }; } });
ipcMain.handle('project:save', async (_, data) => { const { filePath } = await dialog.showSaveDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] }); if (filePath) { fs.writeFileSync(filePath, data); return { success: true, filePath }; } return { success: false }; });
ipcMain.handle('project:open', async () => { const { filePaths } = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] }); if (filePaths && filePaths.length > 0) return { success: true, data: fs.readFileSync(filePaths[0], 'utf8'), filePath: filePaths[0] }; return { success: false }; });
ipcMain.handle('shell:openPath', async (_, p) => { if (!p) p = app.getPath('userData'); await shell.openPath(p); });
ipcMain.handle('app:getPaths', async () => ({ pkiRoot: path.join(app.getPath('userData'), 'pki'), logsDir: app.getPath('logs') }));

ipcMain.handle('app:getNetworkInterfaces', async () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const result = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                result.push({ name, address: iface.address });
            }
        }
    }
    return result;
});
