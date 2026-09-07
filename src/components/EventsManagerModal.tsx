import React, { useState } from 'react';
import { X, Trash2, FolderOpen, Save, Plus, Clock, Calendar, Award, AlertCircle, RefreshCw } from 'lucide-react';
import { SavedEvent } from '../types';

interface EventsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedEvents: SavedEvent[];
  currentEventId: string | null;
  onLoadEvent: (id: string) => void;
  onSaveCurrentEvent: (name?: string) => void;
  onDeleteEvent: (id: string) => void;
  onOverwriteEvent: (id: string) => void;
  onCreateNewBlankEvent: () => void;
  tournamentName: string;
  hasData: boolean;
}

export const EventsManagerModal: React.FC<EventsManagerModalProps> = ({
  isOpen,
  onClose,
  savedEvents,
  currentEventId,
  onLoadEvent,
  onSaveCurrentEvent,
  onDeleteEvent,
  onOverwriteEvent,
  onCreateNewBlankEvent,
  tournamentName,
  hasData,
}) => {
  const [newEventName, setNewEventName] = useState('');
  const [showForm, setShowForm] = useState(false);

  if (!isOpen) return null;

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newEventName.trim() || tournamentName || 'Untitled Event';
    onSaveCurrentEvent(name);
    setNewEventName('');
    setShowForm(false);
  };

  const activeEvent = savedEvents.find(e => e.id === currentEventId);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto no-print">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-2xl border border-slate-100 flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="bg-slate-900 px-6 py-5 flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-400">
                <BookmarkIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Event Archives & History</h3>
                <p className="text-xs text-slate-400 font-medium">Create, switch, and manage historical event brackets</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-slate-800 p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Quick Actions Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCreateNewBlankEvent}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <Plus className="w-4 h-4 text-slate-500" />
                  <span>New Blank Event</span>
                </button>

                {hasData && !showForm && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewEventName(tournamentName || '');
                      setShowForm(true);
                    }}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Current Event</span>
                  </button>
                )}
              </div>

              {currentEventId && activeEvent && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-emerald-800 text-xs font-medium">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="truncate">
                    Current: <strong className="font-bold">{activeEvent.tournamentName || 'Untitled'}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Save Current Event Form */}
            {showForm && (
              <form onSubmit={handleSaveNew} className="bg-slate-50 border border-slate-200/65 rounded-xl p-4.5 space-y-3.5 animated-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-700 font-mono flex items-center gap-1.5">
                    <Save className="w-3.5 h-3.5 text-amber-500" />
                    <span>Save Snapshot Payload as New Event</span>
                  </h4>
                  <button 
                    type="button" 
                    onClick={() => setShowForm(false)} 
                    className="text-slate-400 hover:text-slate-650 text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    placeholder="E.g., Taekwondo National Open 2026"
                    className="flex-1 bg-white border border-slate-200 hover:border-slate-300 focus:border-amber-500 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all focus:ring-1 focus:ring-amber-500/30"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 hover:text-amber-300 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95 shrink-0"
                  >
                    Confirm Save
                  </button>
                </div>
              </form>
            )}

            {/* List of Previous Events */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                Saved Events Archive ({savedEvents.length})
              </h4>

              {savedEvents.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                  <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-600">No events saved yet</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto px-4">
                    Your active drafts autosave locally. Save snapshots here to preserve multiple different tournament draws simultaneously!
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 max-h-[360px] overflow-y-auto pr-1">
                  {savedEvents
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((item) => {
                      const isActive = item.id === currentEventId;
                      const formattedDate = new Date(item.timestamp).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={item.id}
                          className={`group relative border rounded-xl p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                            isActive
                              ? 'border-amber-500 bg-amber-50/20 shadow-sm'
                              : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
                          }`}
                        >
                          {/* Event info */}
                          <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2">
                              <h5 className="font-extrabold text-slate-900 truncate text-[14px]">
                                {item.tournamentName || 'Untitled Event'}
                              </h5>
                              {isActive && (
                                <span className="bg-amber-100 text-amber-900 text-[9px] font-black uppercase font-mono px-2 py-0.5 rounded-full shrink-0">
                                  Current
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-y-1.5 gap-x-3.5 text-[11px] font-mono text-slate-500 font-medium">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 shrink-0" />
                                <span>{formattedDate}</span>
                              </span>
                              <span className="flex items-center gap-1 text-slate-650">
                                <Award className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  <strong>{item.athleteCount}</strong> players
                                </span>
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  <strong>{item.bracketCount}</strong> draws
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Quick buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Load Button */}
                            {!isActive ? (
                              <button
                                onClick={() => onLoadEvent(item.id)}
                                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-900 font-extrabold hover:bg-slate-800 text-white rounded-lg text-xs transition-colors cursor-pointer active:scale-95"
                              >
                                <FolderOpen className="w-3.5 h-3.5" />
                                <span>Load</span>
                              </button>
                            ) : (
                              hasData && (
                                <button
                                  onClick={() => onOverwriteEvent(item.id)}
                                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-500 font-extrabold hover:bg-amber-400 text-slate-950 rounded-lg text-xs transition-colors cursor-pointer active:scale-95"
                                  title="Overwrite saved slot with current live data"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Overwrite</span>
                                </button>
                              )
                            )}

                            {/* Delete Button */}
                            <button
                              onClick={() => onDeleteEvent(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete this event record from history"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-100 text-slate-500 font-medium text-[11px] shrink-0 font-mono">
            <span>Storage source: Web browser LocalStorage</span>
            <span>Data is persistent until browser cache cleared</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Subtle icon component block for modal header
const BookmarkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);
