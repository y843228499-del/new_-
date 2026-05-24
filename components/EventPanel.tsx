
import React, { useEffect, useState, useRef } from 'react';
import { OpcEvent } from '../types';
import { opcuaService } from '../services/opcuaService';
import { AlertTriangle, Bell, Trash2, StopCircle, Play, Pause, X, Info, ZapOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface EventPanelProps {
  isConnected: boolean;
  sessionId?: string;
  isVisible?: boolean;
}

const EventPanel: React.FC<EventPanelProps> = ({ isConnected, sessionId, isVisible = true }) => {
  const { t } = useLanguage();
  const [events, setEvents] = useState<OpcEvent[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<OpcEvent | null>(null);
  
  // Ref to track if we manually stopped subscription vs connection drop
  const isManualStop = useRef(false);

  // Handle Disconnect: Reset state
  useEffect(() => {
    if (!isConnected) {
        setIsSubscribed(false);
        isManualStop.current = false;
    }
  }, [isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        if (isSubscribed && sessionId && isConnected) {
            opcuaService.unsubscribeEvents(sessionId);
        }
    };
  }, [isSubscribed, sessionId, isConnected]);

  // --- NEW: Listen for Connection Drops & Inject Local Event ---
  useEffect(() => {
      // Register global listener for drop events specifically for this session
      const removeListener = opcuaService.onDrop((droppedBackendId) => {
          if (droppedBackendId === sessionId) {
              const dropEvent: OpcEvent = {
                  eventId: `sys-drop-${Date.now()}`,
                  time: new Date().toLocaleTimeString(),
                  message: "Connection lost unexpectedly. (Socket Closed / Timeout)",
                  severity: 1000, // Max Severity
                  sourceName: "System Monitor",
                  eventType: "ConnectionFailure"
              };
              
              setEvents(prev => [dropEvent, ...prev].slice(0, 200));
          }
      });

      return () => {
          removeListener();
      };
  }, [sessionId]);

  const toggleSubscription = async () => {
      if (!isConnected || !sessionId) return;

      if (isSubscribed) {
          isManualStop.current = true;
          await opcuaService.unsubscribeEvents(sessionId);
          setIsSubscribed(false);
      } else {
          isManualStop.current = false;
          try {
              await opcuaService.subscribeToEvents(sessionId, (evt) => {
                  setEvents(prev => [evt, ...prev].slice(0, 200)); 
              });
              setIsSubscribed(true);
          } catch(e) {
              console.error("Failed to subscribe events", e);
          }
      }
  };

  const getSeverityColor = (sev: number) => {
      // System Critical (Local Generation)
      if (sev >= 1000) return 'bg-rose-600 text-white border-rose-700 font-bold shadow-sm';
      // Server Critical
      if (sev >= 800) return 'bg-red-100 text-red-700 border-red-200 font-bold';
      // Warning
      if (sev >= 500) return 'bg-amber-50 text-amber-700 border-amber-200';
      // Info
      return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const getSourceStyle = (source: string) => {
      if (source === 'System Monitor') return 'text-rose-600 font-black';
      return 'text-slate-700 font-bold';
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-slate-200 relative">
        {/* Detail Modal */}
        {selectedEvent && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4 animate-in fade-in duration-200">
                <div className={`bg-white w-full max-w-lg rounded-xl shadow-2xl border-2 overflow-hidden flex flex-col max-h-[90%] ${selectedEvent.severity >= 800 ? 'border-red-400' : selectedEvent.severity >= 500 ? 'border-amber-400' : 'border-blue-400'}`}>
                    <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Info className="w-5 h-5 text-slate-500" />
                            Event Details
                        </h3>
                        <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6 overflow-y-auto space-y-4">
                        <div className="flex items-start gap-4">
                            <div className={`px-3 py-1 rounded text-sm font-bold border ${getSeverityColor(selectedEvent.severity)}`}>
                                Severity: {selectedEvent.severity}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-1">{selectedEvent.time}</div>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Message</label>
                            <p className="text-lg font-medium text-slate-800 leading-relaxed bg-slate-50 p-3 rounded border border-slate-100">
                                {selectedEvent.message}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Source Name</label>
                                <div className={`text-sm font-mono bg-slate-50 p-2 rounded border border-slate-100 truncate ${getSourceStyle(selectedEvent.sourceName)}`} title={selectedEvent.sourceName}>{selectedEvent.sourceName}</div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Event Type</label>
                                <div className="text-sm font-mono text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 truncate" title={selectedEvent.eventType}>{selectedEvent.eventType}</div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Event ID</label>
                            <div className="text-[10px] font-mono text-slate-500 break-all bg-slate-50 p-2 rounded border border-slate-100">{selectedEvent.eventId}</div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                        <button onClick={() => setSelectedEvent(null)} className="px-4 py-2 bg-slate-800 text-white rounded text-sm font-bold hover:bg-slate-700 transition-colors">Close</button>
                    </div>
                </div>
            </div>
        )}

        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 flex items-center gap-2"><Bell className="w-5 h-5 text-amber-500" /> {t.events.title}</h3>
            <div className="flex gap-2 items-center">
                <button 
                    onClick={toggleSubscription} 
                    disabled={!isConnected}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${isSubscribed ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:bg-slate-300'}`}
                >
                    {isSubscribed ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isSubscribed ? "Pause Events" : "Start Events"}
                </button>
                
                <div className="w-px h-4 bg-slate-300 mx-1"></div>

                <button onClick={() => setEvents([])} className="p-1.5 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded transition-colors" title="Clear">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase sticky top-0 shadow-sm z-10">
                    <tr>
                        <th className="p-3 border-b w-24">{t.events.time}</th>
                        <th className="p-3 border-b w-20 text-center">{t.events.severity}</th>
                        <th className="p-3 border-b w-32">{t.events.source}</th>
                        <th className="p-3 border-b">{t.events.message}</th>
                        <th className="p-3 border-b w-32">{t.events.type}</th>
                    </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-100 select-text cursor-pointer">
                    {events.length === 0 && (
                        <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                {isSubscribed ? t.events.waiting : "Event monitoring is paused. Click Start to begin."}
                            </td>
                        </tr>
                    )}
                    {events.map((evt) => (
                        <tr 
                            key={evt.eventId} 
                            className={`transition-colors ${evt.sourceName === 'System Monitor' ? 'bg-rose-50 hover:bg-rose-100' : 'hover:bg-blue-50'}`}
                            onClick={() => setSelectedEvent(evt)}
                        >
                            <td className="p-3 font-mono text-slate-500">{evt.time}</td>
                            <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded border text-[10px] ${getSeverityColor(evt.severity)}`}>
                                    {evt.severity}
                                </span>
                            </td>
                            <td className={`p-3 truncate max-w-[150px] ${getSourceStyle(evt.sourceName)}`} title={evt.sourceName}>{evt.sourceName}</td>
                            <td className="p-3 text-slate-600 truncate max-w-[300px]">
                                <div className="flex items-center gap-2">
                                    {evt.sourceName === 'System Monitor' ? <ZapOff className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" /> : (evt.severity >= 800 && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />)}
                                    <span className="truncate">{evt.message}</span>
                                </div>
                            </td>
                            <td className="p-3 font-mono text-slate-400 truncate max-w-[150px]" title={evt.eventType}>{evt.eventType}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default React.memo(EventPanel);
