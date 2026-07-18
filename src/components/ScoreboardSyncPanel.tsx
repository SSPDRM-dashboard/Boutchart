import React, { useState } from 'react';
import { Share2, Link as LinkIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { db, doc, setDoc } from '../lib/firebase';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';
import { BracketModel, Athlete, WeightCategory } from '../types';

interface ScoreboardSyncPanelProps {
  brackets: Record<string, BracketModel>;
  roster: Athlete[];
  categories: WeightCategory[];
  tournamentName: string;
}

export function ScoreboardSyncPanel({ brackets, roster, categories, tournamentName }: ScoreboardSyncPanelProps) {
  const [targetEventId, setTargetEventId] = useState('');
  const [targetProjectId, setTargetProjectId] = useState(() => localStorage.getItem('sync_project_id') || 'ai-studio-remixmytkdtourna-6a1b99c0-f6c0-4222-8f42-65efa43f63d1');
  const [targetApiKey, setTargetApiKey] = useState(() => localStorage.getItem('sync_api_key') || '');
  const [targetDatabaseId, setTargetDatabaseId] = useState(() => localStorage.getItem('sync_database_id') || '(default)');
  const [showAdvanced, setShowAdvanced] = useState(false);
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

    // Save config settings to local storage
    localStorage.setItem('sync_project_id', targetProjectId.trim());
    localStorage.setItem('sync_api_key', targetApiKey.trim());
    localStorage.setItem('sync_database_id', targetDatabaseId.trim());

    try {
      const payload = {
        tournamentName,
        categories,
        brackets,
        roster,
        updatedAt: new Date().toISOString()
      };
      
      const eventId = targetEventId.trim();
      const cleanProjectId = targetProjectId.trim();
      const cleanApiKey = targetApiKey.trim();
      const cleanDbId = targetDatabaseId.trim();

      // Initialize secondary target Firebase App / Firestore if Project ID and API Key are supplied
      let scoreboardDb;
      if (cleanProjectId && cleanApiKey) {
        const appName = `scoreboardApp_${cleanProjectId.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const targetConfig = {
          apiKey: cleanApiKey,
          projectId: cleanProjectId,
          authDomain: `${cleanProjectId}.firebaseapp.com`,
          storageBucket: `${cleanProjectId}.firebasestorage.app`
        };
        const scoreboardApp = getApps().find(app => app.name === appName) || initializeApp(targetConfig, appName);
        scoreboardDb = getFirestore(scoreboardApp, cleanDbId === '(default)' ? undefined : cleanDbId);
      } else {
        // Fallback to default app
        if (cleanProjectId && cleanProjectId !== firebaseConfigData.projectId) {
          throw new Error('Please enter the Target API Key to connect to an external project.');
        }
        const defaultApp = getApp();
        scoreboardDb = getFirestore(defaultApp, cleanDbId === '(default)' ? undefined : cleanDbId);
      }

      const payloadStr = JSON.stringify(payload);
      const bracketsStr = JSON.stringify(brackets);

      // We strip undefined to avoid Firestore errors
      const cleanPayload = JSON.parse(JSON.stringify(payload));

      if (cleanPayload.brackets) {
        Object.keys(cleanPayload.brackets).forEach(key => {
          const bracket = cleanPayload.brackets[key];
          if (bracket.nodes && Array.isArray(bracket.nodes)) {
            const nodesMap: Record<string, any> = {};
            bracket.nodes.forEach((round: any, i: number) => {
              nodesMap[i.toString()] = round;
            });
            bracket.nodes = nodesMap;
          }
        });
      }

      // Merge both structured and stringified representations into the single 'events' document.
      // This guarantees compatibility with any Scoreboard app expectations, while only writing to the
      // standard 'events' collection which is already permitted in target security rules.
      const mergedPayload = {
        ...cleanPayload,
        payload: payloadStr,
        brackets_stringified: bracketsStr,
        data: payloadStr,
        updatedAt: payload.updatedAt
      };

      // Set up a 10-second timeout so the UI never hangs indefinitely in a loading state
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Connection timed out. Please check your Target Event ID, Target API Key, and internet connection.'));
        }, 10000);
      });

      await Promise.race([
        setDoc(doc(scoreboardDb, 'events', eventId), mergedPayload),
        timeoutPromise
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

        {/* Advanced Target Database Configuration */}
        <div className="pt-3 border-t border-slate-200/50">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 rounded px-1"
          >
            {showAdvanced ? 'Hide Database Settings ▴' : 'Show Database Settings (Target Project/API Key) ▾'}
          </button>
          
          {showAdvanced && (
            <div className="mt-4 p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-2xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label htmlFor="targetProjectId" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Target Project ID
                  </label>
                  <input
                    id="targetProjectId"
                    type="text"
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    placeholder="Enter Target Firebase Project ID..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label htmlFor="targetDatabaseId" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Target Database ID
                  </label>
                  <input
                    id="targetDatabaseId"
                    type="text"
                    value={targetDatabaseId}
                    onChange={(e) => setTargetDatabaseId(e.target.value)}
                    placeholder="(default) or database ID..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="targetApiKey" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Target API Key (Copy from Scoreboard app's config)
                </label>
                <input
                  id="targetApiKey"
                  type="text"
                  value={targetApiKey}
                  onChange={(e) => setTargetApiKey(e.target.value)}
                  placeholder="Paste Target API Key (starts with AIzaSy...)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                />
                <p className="text-[10px] text-slate-400 font-medium">
                  Provide the API Key of the destination scoreboard applet to allow authenticating and writing data.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-500 space-y-1.5 pt-2 border-t border-slate-200">
          <p><strong>Step A:</strong> Copy the Event Sync ID from the scoreboard app and paste it above.</p>
          <p><strong>Step B:</strong> Click "Publish to Scoreboard" when your brackets are finalized. This securely uploads the matches and advancement mappings.</p>
          <p><strong>Step C:</strong> In the scoreboard app, click "Fetch from Firebase" or "Listen for Live Sync" to apply the bracket.</p>
        </div>
      </div>
    </div>
  );
}
