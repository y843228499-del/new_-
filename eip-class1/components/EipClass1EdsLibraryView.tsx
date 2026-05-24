import React, { useState, useEffect } from 'react';
import { Download, Trash2, FileText, Plus } from 'lucide-react';
import { edsLibraryService, EdsEntry } from '../services/edsLibraryService';
import { parseEDS } from '../services/edsService';

export const EipClass1EdsLibraryView: React.FC = () => {
    const [library, setLibrary] = useState<EdsEntry[]>([]);

    useEffect(() => {
        setLibrary(edsLibraryService.getLibrary());
    }, []);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const parsed = parseEDS(content);
            if (parsed) {
                const newEntry: EdsEntry = {
                    id: Math.random().toString(36).substring(2, 9),
                    ...parsed,
                    catalog: parsed.productName, // Fallback
                    rawContent: content,
                    connections: parsed.connections || [],
                    params: parsed.params || []
                };
                edsLibraryService.addEntry(newEntry);
                setLibrary(edsLibraryService.getLibrary());
            } else {
                alert("Failed to parse EDS file.");
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };

    const handleDelete = (id: string) => {
        // In an iframe environment, confirm() might be blocked or not visible.
        // We will just delete it directly for now, or you could implement a custom modal.
        edsLibraryService.removeEntry(id);
        setLibrary(edsLibraryService.getLibrary());
    };

    const groupedLibrary = library.reduce((acc, entry) => {
        let groupName = '第三方厂商'; // Third-party Vendors
        if (entry.vendorName?.toLowerCase().includes('inovance')) {
            groupName = 'Inovance Devices';
        } else if (entry.id === 'generic-eds-entry') {
            groupName = 'Generic Devices';
        }
        if (!acc[groupName]) acc[groupName] = [];
        acc[groupName].push(entry);
        return acc;
    }, {} as Record<string, EdsEntry[]>);

    return (
        <div className="h-full flex flex-col bg-white">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-500" />
                    EDS Library
                </h2>
                <div>
                    <input 
                        type="file" 
                        accept=".eds" 
                        id="eds-library-upload" 
                        className="hidden" 
                        onChange={handleImport}
                    />
                    <label 
                        htmlFor="eds-library-upload"
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 cursor-pointer text-xs font-medium transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Import EDS File
                    </label>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {library.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <FileText className="w-16 h-16 mb-4 text-slate-300" />
                        <p>No EDS files imported yet.</p>
                        <p className="text-xs mt-2">Click "Import EDS File" to add devices to your library.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(groupedLibrary).sort(([a], [b]) => {
                            if (a === 'Generic Devices') return -1;
                            if (b === 'Generic Devices') return 1;
                            if (a === 'Inovance Devices') return -1;
                            if (b === 'Inovance Devices') return 1;
                            return a.localeCompare(b);
                        }).map(([groupName, entries]) => (
                            <div key={groupName} className="space-y-3">
                                <h3 className="font-bold text-slate-700 border-b border-slate-200 pb-1">{groupName}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {entries.map(entry => (
                                        <div key={entry.id} className="border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow bg-white relative group">
                                            {entry.id !== 'generic-eds-entry' && (
                                                <button 
                                                    onClick={() => handleDelete(entry.id)}
                                                    className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Delete EDS"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-xs line-clamp-1" title={entry.productName}>{entry.productName}</h3>
                                                    <p className="text-xs text-slate-500">Vendor ID: {entry.vendorId}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                                <div><span className="text-slate-400">Device Type:</span> {entry.deviceType}</div>
                                                <div><span className="text-slate-400">Product Code:</span> {entry.productCode}</div>
                                                <div><span className="text-slate-400">Revision:</span> {entry.majorRevision}.{entry.minorRevision}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
