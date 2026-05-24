import { parseEDS } from './edsService';

export interface EdsEntry {
    id: string;
    vendorId: number;
    vendorName?: string;
    deviceType: number;
    productCode: number;
    majorRevision: number;
    minorRevision: number;
    productName: string;
    catalog: string;
    rawContent: string;
    connections: EdsConnection[];
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

export interface EdsConnection {
    name: string;
    o2tSize: number;
    t2oSize: number;
    configSize: number;
    targetConfigSize?: number;
    path: string;
    o2tDataset?: any[];
    t2oDataset?: any[];
    configDataset?: any[];
}

export const GENERIC_EDS_ENTRY: EdsEntry = {
    id: 'generic-eds-entry',
    vendorId: 0,
    vendorName: 'Generic',
    deviceType: 0,
    productCode: 0,
    majorRevision: 1,
    minorRevision: 1,
    productName: 'Generic Device (通用设备)',
    catalog: 'Generic',
    rawContent: '',
    connections: [
        {
            name: 'Exclusive Owner',
            o2tSize: 4,
            t2oSize: 4,
            configSize: 0,
            targetConfigSize: 0,
            path: '20 04 24 64 2C 65 2C 66',
            o2tDataset: [],
            t2oDataset: [],
            configDataset: []
        }
    ],
    params: []
};

class EdsLibraryService {
    private readonly STORAGE_KEY = 'eip_class1_eds_library';

    getLibrary(): EdsEntry[] {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            let library: EdsEntry[] = [];
            if (data) {
                library = JSON.parse(data);
                
                // Re-parse rawContent to ensure latest parsing logic is applied to existing entries
                library = library.map(entry => {
                    if (entry.rawContent) {
                        const parsed = parseEDS(entry.rawContent);
                        if (parsed) {
                            return {
                                ...entry,
                                connections: parsed.connections || [],
                                params: parsed.params || []
                            };
                        }
                    }
                    return entry;
                });
            }
            
            // Always ensure Generic Device is at the top
            return [GENERIC_EDS_ENTRY, ...library.filter(e => e.id !== 'generic-eds-entry')];
        } catch (e) {
            console.error("Failed to load EDS library", e);
            return [GENERIC_EDS_ENTRY];
        }
    }

    saveLibrary(library: EdsEntry[]) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(library));
        } catch (e) {
            console.error("Failed to save EDS library", e);
        }
    }

    addEntry(entry: EdsEntry) {
        const lib = this.getLibrary();
        // Check if exists (by vendor, type, code, rev)
        const existingIdx = lib.findIndex(e => 
            e.vendorId === entry.vendorId && 
            e.deviceType === entry.deviceType && 
            e.productCode === entry.productCode &&
            e.majorRevision === entry.majorRevision
        );
        if (existingIdx >= 0) {
            lib[existingIdx] = entry; // Update
        } else {
            lib.push(entry);
        }
        this.saveLibrary(lib);
    }

    removeEntry(id: string) {
        const lib = this.getLibrary();
        this.saveLibrary(lib.filter(e => e.id !== id));
    }
}

export const edsLibraryService = new EdsLibraryService();
