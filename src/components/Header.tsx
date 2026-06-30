import React from 'react';
import { Trophy, Trash2, Cloud, Archive } from 'lucide-react';

interface HeaderProps {
  tournamentName: string;
  setTournamentName: (name: string) => void;
  onClearAll: () => void;
  hasData: boolean;
  saveStatus: 'idle' | 'saving' | 'saved';
  onOpenEventsModal: () => void;
  savedEventsCount: number;
  isPublicView?: boolean;
}

export const Header: React.FC<HeaderProps & { onLogout: () => void; currentUser: string | null }> = ({
  tournamentName,
  setTournamentName,
  onClearAll,
  hasData,
  saveStatus,
  onOpenEventsModal,
  savedEventsCount,
  onLogout,
  currentUser,
  isPublicView = false,
}) => {
  return (
    <header className="bg-slate-900 text-white rounded-2xl p-5 md:p-6 mb-6 shadow-xl border border-slate-800 no-print">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="bg-red-600 p-2.5 rounded-xl shadow-sm shadow-red-600/20">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
              MY-TKD BBUIDER
            </h1>
            <p className="text-xs text-sky-400 font-bold tracking-wider uppercase mt-0.5">
              TOURNAMENT MANAGER
            </p>
          </div>
        </div>

        {/* Live Input Field */}
        <div className="flex-1 max-w-sm md:mx-6 flex items-center gap-4">
          <input
            id="tournamentName"
            type="text"
            className="w-full bg-slate-800/80 border border-slate-700 focus:border-amber-500 text-white placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm transition-all outline-none focus:ring-1 focus:ring-amber-500/50 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Type tournament name..."
            value={tournamentName}
            onChange={(e) => setTournamentName(e.target.value)}
            disabled={!currentUser || isPublicView}
          />
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {isPublicView && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 font-extrabold font-mono tracking-wider">
              <span>🌎 PUBLIC REPORT VIEW</span>
            </div>
          )}
          {currentUser && !isPublicView && (
            <>
              <div className="hidden lg:flex items-center gap-2 px-3 mr-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-bold text-slate-300">
                  {currentUser}
                </span>
              </div>

              <button
                onClick={onLogout}
                className="text-xs font-bold text-slate-400 hover:text-amber-400 transition-colors mr-2"
                title="Sign out of current session"
              >
                Sign Out
              </button>

              {saveStatus !== 'idle' && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 font-medium">
                  <Cloud className={`w-4 h-4 ${saveStatus === 'saving' ? 'animate-pulse text-amber-400' : 'text-emerald-400'}`} />
                  <span>{saveStatus === 'saving' ? 'Saving...' : 'Saved'}</span>
                </div>
              )}

              <button
                onClick={onOpenEventsModal}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-slate-600 rounded-xl transition-all cursor-pointer active:scale-95"
                title="Manage saved tournaments & previous events"
              >
                <Archive className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Event Archives</span>
                {savedEventsCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 font-mono text-[10px] font-black text-slate-950 shrink-0">
                    {savedEventsCount}
                  </span>
                )}
              </button>

              <button
                onClick={onClearAll}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-rose-200 border border-slate-700 hover:border-rose-900/30 rounded-xl transition-all cursor-pointer active:scale-95"
                title="Reset roster, categories, and matches"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
