import React, { useState } from 'react';
import { Share2, Link as LinkIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, doc, setDoc } from '../lib/firebase';
import { BracketModel, Athlete, WeightCategory } from '../types';

interface ScoreboardSyncPanelProps {
  brackets: Record<string, BracketModel>;
  roster: Athlete[];
  categories: WeightCategory[];
  tournamentName: string;
}

export function ScoreboardSyncPanel({ brackets, roster, categories, tournamentName }: ScoreboardSyncPanelProps) {
  const [targetEventId, setTargetEventId] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handlePublish = async () => {
    if (!targetEventId.trim()) {
      setErrorMessage('Please enter a Target Event ID.');
      setSyncStatus('error');
      return;
    }

    setSyncStatus('syncing');
    setErrorMessage('');

    try {
      const cleanPayload = JSON.parse(JSON.stringify({
        tournamentName,
        categories,
        brackets,
        roster,
        updatedAt: new Date().toISOString()
      }));
      
      const payloadStr = JSON.stringify(cleanPayload);
      const bracketsStr = JSON.stringify(brackets);
      
      const dataToSave = {
        tournamentName,
        categories: JSON.stringify(categories),
        brackets: bracketsStr,
        bracket: bracketsStr,
        roster: JSON.stringify(roster),
        payload: payloadStr,
        data: payloadStr,
        updatedAt: cleanPayload.updatedAt
      };

      // Save to multiple potential paths since the exact schema expected by the external Scoreboard app is unknown
      const eventId = targetEventId.trim();
      await Promise.all([
        setDoc(doc(db, 'events', eventId), dataToSave),
        setDoc(doc(db, 'brackets', eventId), dataToSave),
        setDoc(doc(db, 'event', eventId), dataToSave),
        setDoc(doc(db, 'bracket', eventId), dataToSave)
      ]);
      
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 5000);
    } catch (err: any) {
      console.error('Failed to sync to scoreboard:', err);
      setErrorMessage(err.message || 'Failed to sync to scoreboard. Check permissions or network.');
      setSyncStatus('error');
    }
  };

  return (
    <div className="bg-white border border-indigo-200/80 rounded-2xl p-6 shadow-sm no-print mt-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
      
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-500/20 text-indigo-600">
          <Share2 className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">External Scoreboard Sync</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Push live brackets directly to your Scoreboard display app</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="space-y-2">
          <label htmlFor="targetEventId" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Target Event ID
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="w-4 h-4 text-slate-400" />
              </div>
              <input
                id="targetEventId"
                type="text"
                placeholder="Paste Event Sync ID from Scoreboard App..."
                value={targetEventId}
                onChange={(e) => setTargetEventId(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-shadow"
              />
            </div>
            
            <button
              onClick={handlePublish}
              disabled={syncStatus === 'syncing' || Object.keys(brackets).length === 0}
              className={`whitespace-nowrap px-6 py-3 rounded-xl font-extrabold text-sm transition-all shadow-sm flex items-center justify-center gap-2
                ${syncStatus === 'syncing' ? 'bg-indigo-400 text-white cursor-wait' : 
                  syncStatus === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 
                  Object.keys(brackets).length === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :
                  'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-500/30 active:scale-95 cursor-pointer'
                }`}
            >
              {syncStatus === 'syncing' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Publishing...
                </>
              ) : syncStatus === 'success' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Published Successfully
                </>
              ) : (
                'Publish to Scoreboard'
              )}
            </button>
          </div>
        </div>

        {syncStatus === 'error' && (
          <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="text-xs text-slate-500 space-y-1.5 pt-2 border-t border-slate-200">
          <p><strong>Step A:</strong> Copy the Event Sync ID from the scoreboard app and paste it above.</p>
          <p><strong>Step B:</strong> Click "Publish to Scoreboard" when your brackets are finalized. This securely uploads the matches and advancement mappings.</p>
          <p><strong>Step C:</strong> In the scoreboard app, click "Fetch from Firebase" or "Listen for Live Sync" to apply the bracket.</p>
        </div>
      </div>
    </div>
  );
}
