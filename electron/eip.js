
const { ipcMain } = require('electron');
const net = require('net');

let eipLib = null;
const sessions = new Map();

const DEFAULT_TIMEOUT = 5000;

function getEip() {
    if (!eipLib) {
        try {
            const lib = require('ethernet-ip');
            if (lib && lib.Controller) eipLib = lib;
            else if (lib && lib.default && lib.default.Controller) eipLib = lib.default;
            else throw new Error("EIP Controller class missing");
        } catch (err) {
            console.error("[EIP] Failed to load ethernet-ip:", err);
            throw new Error("EIP Driver not found.");
        }
    }
    return eipLib;
}

function estimateTagSize(tagName) { return 20 + tagName.length; }

const withTimeout = (promise, ms = DEFAULT_TIMEOUT, label = "Operation") => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} Timed out (${ms}ms)`)), ms))
    ]);
};

function safeDestroy(plc) {
    if (!plc || plc._isSafeDestroying) return;
    plc._isSafeDestroying = true;
    try {
        plc.removeAllListeners();
        if (plc.client) {
            plc.client.removeAllListeners();
            plc.client.on('error', () => {});
            plc.client.destroy();
        }
        if (typeof plc.destroy === 'function') plc.destroy();
    } catch (e) {}
}

module.exports = {
    hasActiveSessions: () => sessions.size > 0,

    closeAll: async () => {
        for (const s of sessions.values()) {
            if (s.PLC) safeDestroy(s.PLC);
        }
        sessions.clear();
    },

    register: (ipcMainRef, updatePowerSave, sendToWindow) => {
        ipcMainRef.handle('eip:connect', async (_, sessionId, address, slot, connectionSize = 502) => {
            const cleanAddress = (address || '').trim();
            const targetSlot = Number(slot);
            
            if (net.isIP(cleanAddress) === 0) return { success: false, error: `Invalid IP: ${cleanAddress}` };

            // CLEANUP OLD
            const existing = sessions.get(sessionId);
            if (existing) { safeDestroy(existing.PLC); sessions.delete(sessionId); }

            try {
                const { Controller } = getEip();
                const PLC = new Controller();
                
                PLC.on('error', (err) => {
                    console.error(`[EIP-${sessionId}] Controller Error:`, err.message);
                    if (sendToWindow) sendToWindow('eip:connection:drop', { sessionId, error: err.message });
                });
                
                PLC.on('close', () => {
                    sessions.delete(sessionId);
                    updatePowerSave();
                    if (sendToWindow) sendToWindow('eip:connection:drop', { sessionId, error: "Closed" });
                });

                if (connectionSize > 511) PLC.connectionSize = connectionSize;

                // Explicit Timeout on Connect
                await withTimeout(PLC.connect(cleanAddress, targetSlot), 3000, "PLC Connect"); 
                
                sessions.set(sessionId, { PLC, address: cleanAddress, slot: targetSlot, connectionSize });
                updatePowerSave();
                return { success: true };

            } catch (e) { 
                if (sessions.has(sessionId)) { safeDestroy(sessions.get(sessionId).PLC); sessions.delete(sessionId); }
                return { success: false, error: e.message }; 
            }
        });

        ipcMainRef.handle('eip:disconnect', async (_, sessionId) => {
            const s = sessions.get(sessionId);
            if (s && s.PLC) { safeDestroy(s.PLC); sessions.delete(sessionId); updatePowerSave(); }
            return { success: true };
        });

        ipcMainRef.handle('eip:readTag', async (_, sessionId, tagName) => {
            const s = sessions.get(sessionId);
            if (!s || !s.PLC) return { value: null, status: 'Bad', error: "Not connected" };
            try {
                const { Tag } = getEip();
                const tag = new Tag(tagName);
                await withTimeout(s.PLC.readTag(tag), 2000, "Read Tag");
                return { value: tag.value, status: 'Good' };
            } catch (e) { return { value: null, status: 'Bad', error: e.message }; }
        });

        ipcMainRef.handle('eip:readMulti', async (_, sessionId, tagNames) => {
            const s = sessions.get(sessionId);
            if (!s || !s.PLC) return { error: "Not connected" };
            try {
                const { Tag } = getEip();
                const maxPayload = (s.connectionSize || 502) - 80; 
                const batches = [];
                let currentBatch = [];
                let currentSize = 0;

                for (const name of tagNames) {
                    const itemSize = estimateTagSize(name);
                    if (currentSize + itemSize > maxPayload && currentBatch.length > 0) {
                        batches.push(currentBatch);
                        currentBatch = [];
                        currentSize = 0;
                    }
                    currentBatch.push(new Tag(name));
                    currentSize += itemSize;
                }
                if (currentBatch.length > 0) batches.push(currentBatch);

                const allResults = [];
                await Promise.all(batches.map(async (batchTags) => {
                    try {
                        await Promise.all(batchTags.map(tag => 
                            withTimeout(s.PLC.readTag(tag), 2000, "Batch Read")
                                .catch(e => { tag.error = e.message; })
                        ));
                    } catch (batchErr) { batchTags.forEach(tag => tag.error = "Batch Error"); }
                    allResults.push(...batchTags);
                }));

                const results = allResults.map(tag => ({
                    name: tag.name,
                    value: tag.error ? null : tag.value,
                    status: tag.error ? 'Bad' : 'Good',
                    error: tag.error
                }));
                return { results };
            } catch (e) { return { error: e.message }; }
        });

        ipcMainRef.handle('eip:writeTag', async (_, sessionId, tagName, value, dataType) => {
            const s = sessions.get(sessionId);
            if (!s || !s.PLC) return { success: false, error: "Not connected" };
            try {
                const { Tag } = getEip();
                const tag = new Tag(tagName);
                tag.value = value; 
                await withTimeout(s.PLC.writeTag(tag), 2000, "Write Tag");
                return { success: true };
            } catch (e) { return { success: false, error: e.message }; }
        });

        ipcMainRef.handle('eip:writeMulti', async (_, sessionId, tags) => {
            const s = sessions.get(sessionId);
            if (!s || !s.PLC) return { error: "Not connected" };
            try {
                const { Tag } = getEip();
                const tagObjects = tags.map(item => {
                    const t = new Tag(item.tagName);
                    t.value = item.value;
                    return t;
                });
                await Promise.all(tagObjects.map(tag => 
                    s.PLC.writeTag(tag).catch(e => { tag.error = e.message; })
                ));
                const results = tagObjects.map(tag => ({
                    name: tag.name,
                    status: tag.error ? 'Bad' : 'Good',
                    error: tag.error
                }));
                return { results };
            } catch (e) { return { error: e.message }; }
        });
    }
};
