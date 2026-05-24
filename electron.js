const { app, BrowserWindow } = require('electron');
const path = require('path');

// Maintain a reference to the window object to prevent it from being closed automatically
let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    title: "OPC UA Client Dashboard",
    backgroundColor: '#0f172a', // Match app theme background to prevent white flash
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Allowed for this local simulation app
      webSecurity: false // Simplifies loading local resources
    },
    // Icon handling
    icon: path.join(__dirname, 'public/favicon.ico') 
  });

  // Remove standard menu bar for a cleaner "App-like" feel
  mainWindow.setMenuBarVisibility(false);

  // Load the app
  // Logic: In Dev -> localhost:5173 (Vite); In Prod -> Local file from ./dist/index.html
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Open DevTools in dev mode only, or if explicitly requested via env
  if (process.env.ELECTRON_START_URL) {
      mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron lifecycle methods
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});