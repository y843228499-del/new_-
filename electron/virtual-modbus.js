const { Duplex } = require('stream');
const EventEmitter = require('events');

class VirtualSocket extends Duplex {
    constructor(realSocket) {
        super();
        this.realSocket = realSocket;
        this.remoteAddress = realSocket.remoteAddress;
        this.remotePort = realSocket.remotePort;
        this.on('error', () => {
            // Ignore to prevent uncaught exceptions on ECONNRESET
        });
    }
    
    _read(size) {}
    
    _write(chunk, encoding, callback) {
        if (!this.realSocket.destroyed) {
            this.realSocket.write(chunk, encoding, callback);
        } else {
            callback();
        }
    }

    // Mock Methods used by jsmodbus
    setKeepAlive() {}
    setTimeout() {}
    destroy() {
        // We only destroy the real socket if necessary, 
        // but typically virtual socket destruction shouldn't kill shared physical socket.
    }
}

class VirtualServer extends EventEmitter {
    constructor() {
        super();
    }
    listen() {}
    close() {}
}

module.exports = { VirtualSocket, VirtualServer };
