const fs = require('fs');
const mainPath = './electron/main.js';
let main = fs.readFileSync(mainPath, 'utf8');
main = main.replace(
    'await closeAllActiveSessions();',
    'await Promise.race([closeAllActiveSessions(), new Promise(r => setTimeout(r, 1000))]);'
);
fs.writeFileSync(mainPath, main));

const opcuaPath = './electron/opcua.js';
let opcua = fs.readFileSync(opcuaPath, 'utf8');
opcua = opcua.replace(
    /closeAll: async \(\) => \\{[\\s\\S]*?sessions\\.clear\(\);\n    \\},/,
    `closeAll: async () => {
        isChaosRunning = false; // Stop chaos on close
        const promises = Array.from(sessions.entries()).map(async ([id, s]) => {
            try {
                if (s.heartbeatInterval) clearInterval(s.heartbeatInterval);
                if (s.session) await s.session.close(false).catch(() => {});
                if (s.client) await s.client.disconnect().catch(() => {});
            } catch (e) { console.error(\ opcua Close Error (${id}):\`, e.message); }
        });
        await Promise.all(promises);
        sessions.clear();
    },`
);
fs.writeFileSync(opcuaPath, opcua);

console.log('Fixed shutdown logic.');