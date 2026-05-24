
import React, { createContext, useContext, useRef, useCallback } from 'react';
import { SessionInfo, EipSessionInfo, ModbusSessionInfo, ModbusSlaveSessionInfo, EipClass1SessionInfo } from '../types';

interface ProjectContextType {
    registerOpcUaGetter: (getter: () => SessionInfo[]) => void;
    registerEipGetter: (getter: () => EipSessionInfo[]) => void;
    registerModbusGetter: (getter: () => ModbusSessionInfo[]) => void;
    registerModbusSlaveGetter: (getter: () => ModbusSlaveSessionInfo[]) => void;
    registerEipClass1Getter: (getter: () => EipClass1SessionInfo[]) => void;
    setDirty: (isDirty: boolean) => void;
    isDirty: () => boolean;
    getAllData: () => { opcua: SessionInfo[], eip: EipSessionInfo[], modbus: ModbusSessionInfo[], modbusSlave: ModbusSlaveSessionInfo[], eipClass1: EipClass1SessionInfo[] };
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const opcUaGetterRef = useRef<(() => SessionInfo[]) | null>(null);
    const eipGetterRef = useRef<(() => EipSessionInfo[]) | null>(null);
    const modbusGetterRef = useRef<(() => ModbusSessionInfo[]) | null>(null);
    const modbusSlaveGetterRef = useRef<(() => ModbusSlaveSessionInfo[]) | null>(null);
    const eipClass1GetterRef = useRef<(() => EipClass1SessionInfo[]) | null>(null);
    const isDirtyRef = useRef(false);

    const registerOpcUaGetter = useCallback((getter: () => SessionInfo[]) => {
        opcUaGetterRef.current = getter;
    }, []);

    const registerEipGetter = useCallback((getter: () => EipSessionInfo[]) => {
        eipGetterRef.current = getter;
    }, []);

    const registerModbusGetter = useCallback((getter: () => ModbusSessionInfo[]) => {
        modbusGetterRef.current = getter;
    }, []);

    const registerModbusSlaveGetter = useCallback((getter: () => ModbusSlaveSessionInfo[]) => {
        modbusSlaveGetterRef.current = getter;
    }, []);

    const registerEipClass1Getter = useCallback((getter: () => EipClass1SessionInfo[]) => {
        eipClass1GetterRef.current = getter;
    }, []);

    const setDirty = useCallback((dirty: boolean) => {
        isDirtyRef.current = dirty;
    }, []);

    const isDirty = useCallback(() => {
        return isDirtyRef.current;
    }, []);

    const getAllData = useCallback(() => {
        const opcua = opcUaGetterRef.current ? opcUaGetterRef.current() : [];
        const eip = eipGetterRef.current ? eipGetterRef.current() : [];
        const modbus = modbusGetterRef.current ? modbusGetterRef.current() : [];
        const modbusSlave = modbusSlaveGetterRef.current ? modbusSlaveGetterRef.current() : [];
        const eipClass1 = eipClass1GetterRef.current ? eipClass1GetterRef.current() : [];
        return { opcua, eip, modbus, modbusSlave, eipClass1 };
    }, []);

    return (
        <ProjectContext.Provider value={{ registerOpcUaGetter, registerEipGetter, registerModbusGetter, registerModbusSlaveGetter, registerEipClass1Getter, setDirty, isDirty, getAllData }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProject = () => {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error("useProject must be used within a ProjectProvider");
    }
    return context;
};
