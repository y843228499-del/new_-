const { PassThrough } = require('stream');

let SerialPort = null;
try {
    const serialport = require('serialport');
    SerialPort = serialport.SerialPort;
} catch (e) {
    console.error("Failed to load serialport module.", e);
}

const sharedPorts = new Map();

class SharedSerialPort {
    constructor(comPort, options) {
        this.comPort = comPort;
        this.options = options;
        this.refCount = 0;
        this.realPort = new SerialPort({
            path: comPort,
            baudRate: Number(options.baudRate) || 9600,
            dataBits: Number(options.dataBits) || 8,
            stopBits: Number(options.stopBits) || 1,
            parity: options.parity || 'none',
            autoOpen: false
        });
        this.realPort.setMaxListeners(100);
        
        // Handle error to prevent crash
        this.realPort.on('error', (err) => {
            console.error(`[SharedSerialPort ${comPort}] Error:`, err);
        });
    }

    acquire(onOpen) {
        this.refCount++;
        if (this.realPort.isOpen) {
            process.nextTick(() => onOpen(null));
        } else if (this.refCount === 1) {
            this.realPort.open((err) => {
                onOpen(err);
            });
        } else {
            // Wait for it to open or fail
            const checkOpen = () => {
                if (this.realPort.isOpen) {
                    onOpen(null);
                } else if (!this.realPort.opening) {
                    // If it's not opening and not open, it probably failed
                    onOpen(new Error("Port failed to open"));
                } else {
                    setTimeout(checkOpen, 100);
                }
            };
            checkOpen();
        }
        return this.realPort;
    }

    release() {
        this.refCount--;
        if (this.refCount <= 0) {
            if (this.realPort.isOpen) {
                this.realPort.close();
            }
            sharedPorts.delete(this.comPort);
        }
    }
}

module.exports = {
    getSharedPort: (comPort, options) => {
        if (!SerialPort) return null;
        if (!sharedPorts.has(comPort)) {
            sharedPorts.set(comPort, new SharedSerialPort(comPort, options));
        }
        return sharedPorts.get(comPort);
    }
};
