import { EipClass1SessionInfo } from '../../type-definitions/eip-class1';

export interface ParsedEDS {
    vendorId: number;
    vendorName?: string;
    deviceType: number;
    productCode: number;
    majorRevision: number;
    minorRevision: number;
    productName: string;
    connections: {
        name: string;
        o2tSize: number;
        t2oSize: number;
        configSize: number;
        targetConfigSize?: number;
        path: string;
        o2tData?: number[];
        t2oData?: number[];
        configData?: number[];
        o2tDataset?: any[];
        t2oDataset?: any[];
        configDataset?: any[];
    }[];
    params?: {
        id: number;
        name: string;
        dataType: string;
        dataSize: number;
        units: string;
        helpString: string;
        min: number;
        max: number;
        defaultValue: number;
    }[];
}

export const parseEDS = (edsContent: string): ParsedEDS | null => {
    try {
        const lines = edsContent.split('\n').map(l => l.trim());
        
        let vendorId = 1;
        let deviceType = 12;
        let productCode = 1;
        let majorRevision = 1;
        let minorRevision = 1;
        let productName = 'Unknown Device';
        let vendorName = 'Unknown Vendor';

        let inDeviceSection = false;

        for (const line of lines) {
            if (line.startsWith('[Device]')) {
                inDeviceSection = true;
                continue;
            }
            if (line.startsWith('[') && line !== '[Device]') {
                inDeviceSection = false;
            }

            if (inDeviceSection) {
                const match = line.match(/^([^=]+)=(.*);?/);
                if (match) {
                    const key = match[1].trim().toLowerCase();
                    const value = match[2].trim().replace(/;$/, '').replace(/^"|"$/g, '');
                    
                    if (key === 'vendcode') vendorId = parseInt(value);
                    if (key === 'vendname') vendorName = value;
                    if (key === 'prodtype') deviceType = parseInt(value);
                    if (key === 'prodcode') productCode = parseInt(value);
                    if (key === 'majrev') majorRevision = parseInt(value);
                    if (key === 'minrev') minorRevision = parseInt(value);
                    if (key === 'prodname') productName = value;
                }
            }
        }

        // Parse Params first so we can use them in Assemblies
        const cleanContent = edsContent.replace(/\$.*$/gm, '');
        const params: any[] = [];
        const paramRegex = /Param(\d+)\s*=\s*([^;]+);/gi;
        let match;
        while ((match = paramRegex.exec(cleanContent)) !== null) {
            const id = parseInt(match[1]);
            const parts = match[2].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.trim());
            if (parts.length >= 12) {
                const dataTypeHex = parts[4].toUpperCase();
                let dataType = 'Unknown';
                const typeMap: Record<string, string> = {
                    '0XC1': 'BOOL', '0XC2': 'SINT', '0XC3': 'INT', '0XC4': 'DINT', '0XC5': 'LINT',
                    '0XC6': 'USINT', '0XC7': 'UINT', '0XC8': 'UDINT', '0XC9': 'ULINT', '0XCA': 'REAL',
                    '0XCB': 'LREAL', '0XD1': 'BYTE', '0XD2': 'WORD', '0XD3': 'DWORD', '0XD4': 'LWORD'
                };
                if (typeMap[dataTypeHex]) {
                    dataType = typeMap[dataTypeHex];
                } else {
                    dataType = dataTypeHex;
                }

                params.push({
                    id,
                    name: parts[6].replace(/^"|"$/g, ''),
                    dataType,
                    dataSize: parseInt(parts[5]) || 0,
                    units: parts[7].replace(/^"|"$/g, ''),
                    helpString: parts[8].replace(/^"|"$/g, ''),
                    min: parts[9] && !isNaN(Number(parts[9])) ? Number(parts[9]) : 0,
                    max: parts[10] && !isNaN(Number(parts[10])) ? Number(parts[10]) : 0,
                    defaultValue: parts[11] && !isNaN(Number(parts[11])) ? Number(parts[11]) : 0
                });
            }
        }

        // Parse Assemblies
        const assemblies = new Map<number, { size: number, members: { bitSize: number, paramId: number }[] }>();
        const assemRegex = /Assem(\d+)\s*=\s*([^;]+);/gi;
        while ((match = assemRegex.exec(cleanContent)) !== null) {
            const id = parseInt(match[1]);
            const parts = match[2].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.trim());
            
            const members: { bitSize: number, paramId: number }[] = [];
            let calculatedBitSize = 0;
            for (let i = 6; i < parts.length; i += 2) {
                if (parts[i] && parts[i+1]) {
                    const bitSize = parseInt(parts[i]);
                    const paramMatch = parts[i+1].match(/Param(\d+)/i);
                    if (!isNaN(bitSize) && paramMatch) {
                        members.push({
                            bitSize,
                            paramId: parseInt(paramMatch[1])
                        });
                        calculatedBitSize += bitSize;
                    }
                }
            }
            
            let size = 0;
            if (parts[2] && !isNaN(parseInt(parts[2]))) {
                size = parseInt(parts[2]);
            } else {
                size = Math.ceil(calculatedBitSize / 8);
            }
            
            assemblies.set(id, { size, members });
        }

        const connections: any[] = [];
        const connRegex = /Connection\d+\s*=\s*([^;]+);/gi;
        while ((match = connRegex.exec(cleanContent)) !== null) {
            const parts = match[1].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.trim());
            if (parts.length >= 11) {
                const resolveSize = (sizePart: string, formatPart: string): number | null => {
                    // Try direct number (Network Connection Parameter)
                    if (sizePart && sizePart.trim() !== '') {
                        const val = parseInt(sizePart);
                        if (!isNaN(val)) {
                            if (val > 0xFFFF) {
                                return val & 0xFFFF;
                            } else {
                                return val & 0x01FF;
                            }
                        }
                    }
                    // Try to resolve from Assem
                    const formatMatch = formatPart?.match(/Assem(\d+)/i);
                    if (formatMatch && assemblies.has(parseInt(formatMatch[1]))) {
                        return assemblies.get(parseInt(formatMatch[1]))?.size || 0;
                    }
                    // Try to resolve from Param
                    const paramMatch = sizePart?.match(/Param(\d+)/i);
                    if (paramMatch) {
                        const paramId = parseInt(paramMatch[1]);
                        const param = params.find(p => p.id === paramId);
                        if (param) {
                            return param.defaultValue;
                        }
                    }
                    // Try to extract Assembly Instance from CIP path
                    if (formatPart) {
                        const pathMatch = formatPart.match(/20\s+04\s+24\s+([0-9A-Fa-f]{2})/i);
                        if (pathMatch) {
                            const instanceId = parseInt(pathMatch[1], 16);
                            if (assemblies.has(instanceId)) {
                                return assemblies.get(instanceId)?.size || 0;
                            }
                        }
                    }
                    return null;
                };

                const resolveAssemblyId = (formatPart: string): number | null => {
                    const formatMatch = formatPart?.match(/Assem(\d+)/i);
                    if (formatMatch) return parseInt(formatMatch[1]);
                    
                    if (formatPart) {
                        const pathMatch = formatPart.match(/20\s+04\s+24\s+([0-9A-Fa-f]{2})/i);
                        if (pathMatch) return parseInt(pathMatch[1], 16);
                    }
                    return null;
                };

                let o2tSize = resolveSize(parts[3], parts[4]);
                if (o2tSize === null) o2tSize = 4;
                
                let t2oSize = resolveSize(parts[6], parts[7]);
                if (t2oSize === null) t2oSize = 4;

                let configSize = resolveSize(parts[8], parts[9]);
                if (configSize === null) configSize = 0;

                let targetConfigSize = resolveSize(parts[10], parts[11]);
                if (targetConfigSize === null) targetConfigSize = 0;

                const o2tAssemId = resolveAssemblyId(parts[4]);
                const t2oAssemId = resolveAssemblyId(parts[7]);
                const targetConfigAssemId = resolveAssemblyId(parts[11]);

                const mapDataset = (assemId: number | null): any[] => {
                    if (assemId && assemblies.has(assemId)) {
                        const assem = assemblies.get(assemId)!;
                        return assem.members.map(m => {
                            const param = params.find(p => p.id === m.paramId);
                            return {
                                id: Math.random().toString(36).substr(2, 9),
                                name: param ? param.name : `Param${m.paramId}`,
                                dataType: param ? param.dataType : 'BYTE',
                                bitLength: m.bitSize,
                                helpString: param ? param.helpString : '',
                                value: param ? param.defaultValue : 0
                            };
                        });
                    }
                    return [];
                };

                const adjustDataset = (dataset: any[], targetSize: number): any[] => {
                    if (targetSize === 0) return [];
                    const targetBits = targetSize * 8;
                    const currentBits = dataset.reduce((sum, item) => sum + item.bitLength, 0);
                    
                    if (currentBits === targetBits) return dataset;
                    
                    if (dataset.length === 0) {
                        return [{
                            id: Math.random().toString(36).substr(2, 9),
                            name: 'Param0',
                            dataType: 'BYTE',
                            bitLength: targetBits,
                            helpString: '',
                            value: 0
                        }];
                    }
                    
                    const newDataset = dataset.map(item => ({ ...item }));
                    let diff = targetBits - currentBits;
                    
                    if (diff > 0) {
                        newDataset[newDataset.length - 1].bitLength += diff;
                    } else {
                        let bitsToRemove = -diff;
                        while (bitsToRemove > 0 && newDataset.length > 0) {
                            const lastItem = newDataset[newDataset.length - 1];
                            if (lastItem.bitLength > bitsToRemove) {
                                lastItem.bitLength -= bitsToRemove;
                                bitsToRemove = 0;
                            } else {
                                bitsToRemove -= lastItem.bitLength;
                                newDataset.pop();
                            }
                        }
                        if (newDataset.length === 0) {
                            return [{
                                id: Math.random().toString(36).substr(2, 9),
                                name: dataset[0].name,
                                dataType: 'BYTE',
                                bitLength: targetBits,
                                helpString: '',
                                value: 0
                            }];
                        }
                    }
                    return newDataset;
                };

                const o2tDataset = adjustDataset(mapDataset(o2tAssemId), o2tSize);
                const t2oDataset = adjustDataset(mapDataset(t2oAssemId), t2oSize);
                const configDataset = adjustDataset(mapDataset(targetConfigAssemId), configSize);

                const nameIndex = parts.findIndex(p => p && p.startsWith('"'));
                const connName = nameIndex !== -1 ? parts[nameIndex].replace(/^"|"$/g, '') : 'Exclusive Owner';

                let connectionPath = '20 04 24 64 2C 65 2C 66';
                const pathMatch = parts.find(p => p && p.match(/^"?(?:[0-9A-Fa-f]{2}\s+)+[0-9A-Fa-f]{2}"?$/i));
                if (pathMatch) {
                    connectionPath = pathMatch.replace(/"/g, '').trim();
                } else if (parts.length > 14 && parts[14]) {
                    connectionPath = parts[14].replace(/"/g, '').trim();
                }

                connections.push({
                    name: connName,
                    o2tSize,
                    t2oSize,
                    configSize,
                    targetConfigSize,
                    path: connectionPath,
                    o2tData: new Array(o2tSize).fill(0),
                    t2oData: new Array(t2oSize).fill(0),
                    configData: new Array(targetConfigSize).fill(0),
                    o2tDataset,
                    t2oDataset,
                    configDataset
                });
            }
        }

        return {
            vendorId,
            vendorName,
            deviceType,
            productCode,
            majorRevision,
            minorRevision,
            productName,
            connections,
            params
        };
    } catch (e) {
        console.error("Failed to parse EDS:", e);
        return null;
    }
};

export const generateEDS = (config: EipClass1SessionInfo['adapterConfig']): string => {
    const date = new Date();
    const dateStr = `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
    const timeStr = `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;

    let eds = `$ EZ-EDS Generated EDS File
$ 
[File]
        DescText = "${config.productName}";
        CreateDate = ${dateStr};
        CreateTime = ${timeStr};
        ModDate = ${dateStr};
        ModTime = ${timeStr};
        Revision = 1.0;

[Device]
        VendCode = ${config.vendorId};
        VendName = "Custom Vendor";
        ProdType = ${config.deviceType};
        ProdTypeStr = "Communications Adapter";
        ProdCode = ${config.productCode};
        MajRev = ${config.majorRevision};
        MinRev = ${config.minorRevision};
        ProdName = "${config.productName}";
        Catalog = "${config.productName}";

[Device Classification]
        Class1 = EtherNetIP;

[Params]
        Param1 = 
            0,                      $ reserved, shall equal 0
            ,,                      $ Link Path Size, Link Path
            0x0000,                 $ Descriptor
            0xC8,                   $ Data Type : UDINT
            4,                      $ Data Size in bytes
            "RPI",                  $ name
            "ms",                   $ units
            "Requested Packet Interval", $ help string
            5000,500000000,50000,   $ min, max, default data values
            ,,,,                    $ mult, div, base, offset scaling
            ,,,,                    $ mult, div, base, offset links
            ;                       $ decimal places
        Param2 = 
            0,                      $ reserved, shall equal 0
            ,,                      $ Link Path Size, Link Path
            0x0000,                 $ Descriptor
            0xC7,                   $ Data Type : UINT
            2,                      $ Data Size in bytes
            "Connection Size",      $ name
            "bytes",                $ units
            "Connection Size in bytes", $ help string
            1,500,100,              $ min, max, default data values
            ,,,,                    $ mult, div, base, offset scaling
            ,,,,                    $ mult, div, base, offset links
            ;                       $ decimal places
`;

    eds += `
[Assembly]
`;
    
    // Always generate 32 connections for the static EDS definition (adjacent instances)
    for (let index = 0; index < 32; index++) {
        const o2tInstance = 100 + index * 2;
        const t2oInstance = 101 + index * 2;

        eds += `        Assem${o2tInstance} =
            "O->T Data Connection ${index + 1}",
            "",
            100,
            0x0000;
`;
        eds += `        Assem${t2oInstance} =
            "T->O Data Connection ${index + 1}",
            "",
            100,
            0x0000;
`;
    }

    eds += `
[Connection Manager]
`;

    for (let index = 0; index < 32; index++) {
        const o2tInstance = 100 + index * 2;
        const t2oInstance = 101 + index * 2;

        const o2tHex = o2tInstance.toString(16).toUpperCase().padStart(2, '0');
        const t2oHex = t2oInstance.toString(16).toUpperCase().padStart(2, '0');

        eds += `        Connection${index + 1} =
            0x04010002,             $ Trigger & Transport
            0x44640405,             $ Connection Parameters
            Param1,                 $ O->T RPI
            Param2,                 $ O->T Size
            Assem${o2tInstance},    $ O->T Format
            Param1,                 $ T->O RPI
            Param2,                 $ T->O Size
            Assem${t2oInstance},    $ T->O Format
            ,,                      $ Proxy Config
            ,,                      $ Target Config
            "Exclusive Owner Connection ${index + 1}", $ Connection Name
            "",                     $ Help String
            "20 04 2C ${o2tHex} 2C ${t2oHex}"; $ Connection Path
`;
    }

    return eds;
};
