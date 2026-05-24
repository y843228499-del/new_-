import { useEffect, useRef } from 'react';
import { ModbusSlaveSessionInfo } from '../../types';
import { modbusSlaveService } from '../services/modbusSlaveService';

export function useModbusSimulation(sessions: ModbusSlaveSessionInfo[]) {
    const valuesRef = useRef<Record<string, number>>({});
    const lastUpdateRef = useRef<Record<string, number>>({});
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        let isRunning = true;

        const loop = () => {
            if (!isRunning) return;
            const now = Date.now();

            sessions.forEach(session => {
                if (session.status !== 'CONNECTED') return;

                const simulatedRegisters = session.config?.registers?.filter(r => r.simulation?.enabled) || [];

                simulatedRegisters.forEach(reg => {
                    const sim = reg.simulation!;
                    const key = `${session.id}-${reg.type}-${reg.address}`;
                    const interval = Math.max(100, sim.interval || 1000);

                    if (!lastUpdateRef.current[key]) {
                        lastUpdateRef.current[key] = now;
                        if (valuesRef.current[key] === undefined) {
                            valuesRef.current[key] = sim.type === 'random' ? (sim.min || 0) : 0;
                        }
                    }

                    if (now - lastUpdateRef.current[key] >= interval) {
                        lastUpdateRef.current[key] = now;
                        
                        let val = valuesRef.current[key];
                        
                        switch (sim.type) {
                            case 'random':
                                const min = sim.min || 0;
                                const max = sim.max || 100;
                                val = Math.random() * (max - min) + min;
                                break;
                            case 'increment':
                                val += (sim.step || 1);
                                if (val > (sim.max || 10000)) val = 0;
                                break;
                            case 'decrement':
                                val -= (sim.step || 1);
                                if (val < 0) val = (sim.max || 10000);
                                break;
                            case 'sinusoidal':
                                const time = now / 1000;
                                val = Math.sin(time) * (sim.max || 100) + (sim.min || 0);
                                break;
                        }

                        valuesRef.current[key] = val;

                        // Write to Modbus
                        let valuesToWrite: number[] = [];
                        if (reg.dataType === 'Boolean') {
                            valuesToWrite = [val > 0.5 ? 1 : 0];
                        } else if (reg.dataType === 'Int16' || reg.dataType === 'UInt16') {
                            valuesToWrite = [Math.floor(val) & 0xFFFF];
                        } else if (reg.dataType === 'Int32' || reg.dataType === 'UInt32' || reg.dataType === 'Float32') {
                            const buffer = new ArrayBuffer(4);
                            const view = new DataView(buffer);
                            if (reg.dataType === 'Float32') view.setFloat32(0, val, false);
                            else if (reg.dataType === 'Int32') view.setInt32(0, Math.floor(val), false);
                            else view.setUint32(0, Math.floor(val), false);
                            
                            const endianness = reg.endianness || 'ABCD';
                            let littleEndianWord = false;
                            if (endianness === 'BADC' || endianness === 'DCBA') {
                                littleEndianWord = true;
                            }
                            
                            let word0 = view.getUint16(0, littleEndianWord);
                            let word1 = view.getUint16(2, littleEndianWord);
                            
                            if (endianness === 'CDAB' || endianness === 'DCBA') {
                                valuesToWrite = [word1, word0];
                            } else {
                                valuesToWrite = [word0, word1];
                            }
                        } else if (reg.dataType === 'Float64') {
                            const buffer = new ArrayBuffer(8);
                            const view = new DataView(buffer);
                            view.setFloat64(0, val, false);
                            
                            const endianness = reg.endianness || 'ABCD';
                            let littleEndianWord = false;
                            if (endianness === 'BADC' || endianness === 'DCBA') {
                                littleEndianWord = true;
                            }
                            
                            let word0 = view.getUint16(0, littleEndianWord);
                            let word1 = view.getUint16(2, littleEndianWord);
                            let word2 = view.getUint16(4, littleEndianWord);
                            let word3 = view.getUint16(6, littleEndianWord);
                            
                            if (endianness === 'CDAB') {
                                valuesToWrite = [word1, word0, word3, word2];
                            } else if (endianness === 'DCBA') {
                                valuesToWrite = [word3, word2, word1, word0];
                            } else {
                                valuesToWrite = [word0, word1, word2, word3];
                            }
                        }

                        if (valuesToWrite.length > 0) {
                            modbusSlaveService.writeMemory(session.id, reg.type, reg.address, valuesToWrite, session.transport).catch(console.error);
                        }
                    }
                });
            });

            if (isRunning) {
                animationFrameRef.current = requestAnimationFrame(loop);
            }
        };

        animationFrameRef.current = requestAnimationFrame(loop);

        return () => {
            isRunning = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [sessions]);
}
