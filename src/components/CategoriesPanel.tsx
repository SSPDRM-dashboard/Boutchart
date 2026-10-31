import React, { useState } from 'react';
import { Layers, Activity, Dumbbell, ShieldAlert, CheckCircle2, RotateCcw, HelpCircle, Search, Sparkles, X, Shuffle, Trash2, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { WeightCategory } from '../types';
import {
  compareCategoriesByAgeAndWeight,
  getCategoryGender,
  DEFAULT_EVENT_SEQUENCE,
  ALL_STANDARD_EVENTS,
  getCategoryEventInfo,
  getEventOrderRank
} from '../utils/bracketUtils';

interface CategoriesPanelProps {
  categories: Record<string, WeightCategory>;
  ringCount: number;
  setRingCount: (count: number) => void;
  onAutoAssignRings: () => void;
  onAutoAssignRingsSequential?: () => void;
  onUpdateCategoryRing: (categoryKey: string, ring: number) => void;
  onBulkUpdateRing?: (keys: string[], ring: number) => void;
  onUpdateCategorySystemType?: (categoryKey: string, systemType: 'kyorugi-pk' | 'poomsae-pk' | 'poomsae-cutoff') => void;
  onBulkUpdateSystemType?: (keys: string[], systemType: 'kyorugi-pk' | 'poomsae-pk' | 'poomsae-cutoff') => void;
  ringGenderSequence?: string;
  onUpdateRingGenderSequence?: (mode: any) => void;
  shuffleSeed: boolean;
  setShuffleSeed: (shuffle: boolean) => void;
  onGenerateBrackets: (targetRing?: number) => void;
  ringLabelFormat: 'number' | 'letter';
  setRingLabelFormat: (format: 'number' | 'letter') => void;
  boutLabelFormat: 'alpha-2' | 'thousands-3';
  setBoutLabelFormat: (format: 'alpha-2' | 'thousands-3') => void;
  boutSequenceOrder: 'sequential' | 'stages';
  setBoutSequenceOrder: (order: 'sequential' | 'stages') => void;
  ringSequenceOrders?: Record<number, 'sequential' | 'stages'>;
  onUpdateRingSequenceOrder?: (ring: number, order: 'sequential' | 'stages') => void;
  eventSequenceOrder?: string[];
  onUpdateEventSequenceOrder?: (sequence: string[]) => void;
  ringEventSequences?: Record<number, string[]>;
  onUpdateRingEventSequence?: (ring: number, sequence: string[]) => void;
  continuousBouts?: boolean;
  onToggleContinuousBouts?: (enabled: boolean) => void;
  onExportPdf: () => void;
  onDownloadSearchablePdf?: (ringFilter: 'all' | number) => void;
  hasBrackets: boolean;
  onDeleteCategory?: (categoryKey: string) => void;
  onResetBrackets?: () => void;
  onReorderCategory?: (categoryKey: string, direction: 'up' | 'down') => void;
  onReorderCategoryTo?: (sourceKey: string, targetKey: string) => void;
  showEstimatedTime?: boolean;
  onToggleShowEstimatedTime?: (show: boolean) => void;
  competitionStartTime?: string;
  onUpdateCompetitionStartTime?: (time: string) => void;
  boutGapMinutes?: number;
  onUpdateBoutGapMinutes?: (gap: number) => void;
}

export const CategoriesPanel: React.FC<CategoriesPanelProps> = ({
  categories,
  ringCount,
  setRingCount,
  onAutoAssignRings,
  onAutoAssignRingsSequential,
  onUpdateCategoryRing,
  onBulkUpdateRing,
  onUpdateCategorySystemType,
  onBulkUpdateSystemType,
  ringGenderSequence = 'all',
  onUpdateRingGenderSequence,
  shuffleSeed,
  setShuffleSeed,
  onGenerateBrackets,
  ringLabelFormat,
  setRingLabelFormat,
  boutLabelFormat,
  setBoutLabelFormat,
  boutSequenceOrder,
  setBoutSequenceOrder,
  ringSequenceOrders,
  onUpdateRingSequenceOrder,
  eventSequenceOrder = DEFAULT_EVENT_SEQUENCE,
  onUpdateEventSequenceOrder,
  ringEventSequences,
  onUpdateRingEventSequence,
  continuousBouts = false,
  onToggleContinuousBouts,
  onExportPdf,
  onDownloadSearchablePdf,
  hasBrackets,
  onDeleteCategory,
  onResetBrackets,
  onReorderCategory,
  onReorderCategoryTo,
  showEstimatedTime = false,
  onToggleShowEstimatedTime,
  competitionStartTime = '09:00',
  onUpdateCompetitionStartTime,
  boutGapMinutes = 5,
  onUpdateBoutGapMinutes,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedCatKey, setDraggedCatKey] = useState<string | null>(null);
  const [dragOverRing, setDragOverRing] = useState<number | null>(null);
  const [dragOverCatKey, setDragOverCatKey] = useState<string | null>(null);
  const [selectedGenRing, setSelectedGenRing] = useState<string>('all');
  const [selectedDownloadRing, setSelectedDownloadRing] = useState<string>('all');

  const catKeys = Object.keys(categories).sort((a, b) => {
    const orderA = categories[a]?.order ?? 99999;
    const orderB = categories[b]?.order ?? 99999;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
  const eligibleKeys = catKeys.filter(k => categories[k].count >= 1);

  // Unassigned keys (categories where ring is 0 or undefined)
  const unassignedKeys = catKeys.filter(
    (key) => !categories[key].ring || categories[key].ring === 0
  );

  // Filter unassigned keys by search query
  const filteredUnassignedKeys = unassignedKeys.filter(key => 
    key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get categories allocated to a specific ring (sorted by Event Sequence decided by Admin)
  const getCategoriesForRing = (rVal: number) => {
    let keys = catKeys.filter((key) => categories[key].ring === rVal);

    if (ringGenderSequence === 'male-only' || ringGenderSequence === 'male-only-oldest-first') {
      keys = keys.filter((k) => getCategoryGender(k, categories[k]) === 'male');
    } else if (ringGenderSequence === 'female-only' || ringGenderSequence === 'female-only-oldest-first') {
      keys = keys.filter((k) => getCategoryGender(k, categories[k]) === 'female');
    }

    const effectiveEventSeq = (ringEventSequences && ringEventSequences[rVal]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;

    return keys.sort((a, b) => {
      const catA = categories[a];
      const catB = categories[b];
      const evA = getCategoryEventInfo(catA?.systemType, catA?.event, a, catA?.name).id;
      const evB = getCategoryEventInfo(catB?.systemType, catB?.event, b, catB?.name).id;
      const rankA = getEventOrderRank(evA, effectiveEventSeq);
      const rankB = getEventOrderRank(evB, effectiveEventSeq);
      if (rankA !== rankB) return rankA - rankB;

      const orderA = catA?.order;
      const orderB = catB?.order;
      if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
        return orderA - orderB;
      }

      return compareCategoriesByAgeAndWeight(a, b, catA, catB, ringGenderSequence as any);
    });
  };

  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    setDraggedCatKey(key);
  };

  const handleDragEnd = () => {
    setDraggedCatKey(null);
    setDragOverRing(null);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 mb-6 shadow-sm no-print">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500 text-slate-950 text-xs font-extrabold font-mono">
              2
            </span>
            Weight classes detected
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Assign weight divisions to rings to distribute bouts. Bouts sequence sequentially within each ring.
          </p>
        </div>

        {/* Ring setup controls + Setting Dashboard Selection for label layout */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <label htmlFor="ringInput" className="text-xs font-bold text-slate-700 tracking-wide uppercase px-1">
              Total Rings
            </label>
            <input
              id="ringInput"
              type="number"
              min={1}
              max={20}
              className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:border-amber-500 text-center"
              value={ringCount}
              onChange={(e) => setRingCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>

          {/* Setting Dashboard Selector (Change ring labeling format from 1 to A / ring A to 1) */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setRingLabelFormat('number')}
              className={`px-2.5 py-1 rounded text-xs font-extrabold transition-all cursor-pointer ${
                ringLabelFormat === 'number'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="Label rings numerically (e.g. Ring 1, Ring 2, Bout 101)"
            >
              Ring "1"
            </button>
            <button
              type="button"
              onClick={() => setRingLabelFormat('letter')}
              className={`px-2.5 py-1 rounded text-xs font-extrabold transition-all cursor-pointer ${
                ringLabelFormat === 'letter'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="Label rings alphabetically (e.g. Ring A, Ring B, Bout A01)"
            >
              Ring "A"
            </button>
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>

          {/* Bout format switcher: allow admin to change between X01 and X001 */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setBoutLabelFormat('alpha-2')}
              className={`px-2.5 py-1 rounded text-xs font-extrabold transition-all cursor-pointer ${
                boutLabelFormat === 'alpha-2'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="2-digit format starting from X01 for each ring (e.g. Ring A: A01, Ring B: B01, Ring C: C01)"
            >
              X01 (e.g. A01)
            </button>
            <button
              type="button"
              onClick={() => setBoutLabelFormat('thousands-3')}
              className={`px-2.5 py-1 rounded text-xs font-extrabold transition-all cursor-pointer ${
                boutLabelFormat === 'thousands-3'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="3-digit format starting from X001 for each ring (e.g. Ring A: A001, Ring B: B001, Ring C: C001)"
            >
              X001 (e.g. A001)
            </button>
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>

          {/* ESTIMATED BOUT TIME CONTROL (Photo 1) */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => onToggleShowEstimatedTime?.(!showEstimatedTime)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-black transition-all cursor-pointer ${
                showEstimatedTime
                  ? 'bg-amber-500 text-slate-950 shadow-xs hover:bg-amber-400'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
              title={showEstimatedTime ? 'Click to hide estimated bout start times on brackets' : 'Click to show estimated bout start times on brackets'}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{showEstimatedTime ? '⏰ Est. Time: ON' : '⏰ Est. Time: OFF'}</span>
            </button>

            {showEstimatedTime && (
              <div className="flex items-center gap-2.5 pl-1.5 border-l border-slate-200 animate-in fade-in duration-200">
                {/* Competition Start Time */}
                <div className="flex items-center gap-1.5 text-xs">
                  <label htmlFor="compStartTime" className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Start:
                  </label>
                  <input
                    id="compStartTime"
                    type="time"
                    value={competitionStartTime || '09:00'}
                    onChange={(e) => onUpdateCompetitionStartTime?.(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 cursor-pointer"
                    title="Competition start time for Bout 1 in each ring (e.g. 09:00 AM)"
                  />
                </div>

                <div className="h-4 w-[1px] bg-slate-200"></div>

                {/* Bout Gap Minutes */}
                <div className="flex items-center gap-1.5 text-xs">
                  <label htmlFor="boutGapInput" className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Gap:
                  </label>
                  <div className="flex items-center">
                    <input
                      id="boutGapInput"
                      type="number"
                      min={1}
                      max={60}
                      value={boutGapMinutes ?? 5}
                      onChange={(e) => onUpdateBoutGapMinutes?.(Math.max(1, parseInt(e.target.value, 10) || 5))}
                      className="w-12 bg-slate-50 border border-slate-200 rounded-l px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 text-center focus:outline-none focus:border-amber-500"
                      title="Minutes interval per bout"
                    />
                    <span className="bg-slate-100 border border-l-0 border-slate-200 rounded-r px-1.5 py-0.5 text-[10px] font-extrabold text-slate-500 uppercase font-mono">
                      min
                    </span>
                  </div>
                </div>

                {/* Quick Gap Preset Pills */}
                <div className="hidden sm:flex items-center gap-1">
                  {[3, 5, 8, 10].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onUpdateBoutGapMinutes?.(m)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition-all cursor-pointer ${
                        boutGapMinutes === m
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                      title={`Set bout interval to ${m} minutes`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>

          {/* 2 Separate Bout Sequences indicator badge */}
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-250 px-2.5 py-1 rounded-lg text-xs font-bold" title="Kyorugi and Poomsae have 2 separate bout numbering sequences (e.g. Kyorugi A01, Poomsae PA01) so they are never mixed together">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Separate Bout Series: Kyorugi & Poomsae</span>
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>

          {/* ADMIN DECIDES SEQUENCE OF EVENTS */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-1 shadow-2xs" title="Admin controls: Sequence of events in each ring (e.g. Poomsae first, then Sparring)">
            <span className="text-[10px] font-black uppercase text-amber-950 px-1.5 flex items-center gap-1">
              <span>🎯</span>
              <span>Event Order:</span>
            </span>
            <button
              type="button"
              onClick={() => onUpdateEventSequenceOrder?.(['poomsae-cutoff', 'poomsae-pk', 'kyorugi-pk'])}
              className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wide transition-all cursor-pointer ${
                (eventSequenceOrder[0] || '').includes('poomsae')
                  ? 'bg-slate-900 text-amber-400 shadow-xs'
                  : 'bg-white/80 text-slate-700 hover:bg-white border border-amber-200'
              }`}
              title="Run Poomsae first (Cut-off & PK), then Sparring in each ring"
            >
              🥋 Poomsae 1st → 🥊 Sparring
            </button>
            <button
              type="button"
              onClick={() => onUpdateEventSequenceOrder?.(['kyorugi-pk', 'poomsae-pk', 'poomsae-cutoff'])}
              className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wide transition-all cursor-pointer ${
                (eventSequenceOrder[0] || '').includes('kyorugi')
                  ? 'bg-slate-900 text-amber-400 shadow-xs'
                  : 'bg-white/80 text-slate-700 hover:bg-white border border-amber-200'
              }`}
              title="Run Sparring first, then Poomsae in each ring"
            >
              🥊 Sparring 1st → 🥋 Poomsae
            </button>
            <button
              type="button"
              onClick={() => onUpdateEventSequenceOrder?.(['poomsae-pk', 'poomsae-cutoff', 'kyorugi-pk'])}
              className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wide transition-all cursor-pointer ${
                eventSequenceOrder[0] === 'poomsae-pk'
                  ? 'bg-slate-900 text-amber-400 shadow-xs'
                  : 'bg-white/80 text-slate-700 hover:bg-white border border-amber-200'
              }`}
              title="Run Poomsae PK first, then Cut-off, then Sparring"
            >
              🥋 PK 1st → Cut-off → Sparring
            </button>
            <button
              type="button"
              onClick={() => onUpdateEventSequenceOrder?.(['kyorugi-pk', 'poomsae-cutoff', 'poomsae-pk'])}
              className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wide transition-all cursor-pointer ${
                eventSequenceOrder[0] === 'kyorugi-pk' && eventSequenceOrder[1] === 'poomsae-cutoff'
                  ? 'bg-slate-900 text-amber-400 shadow-xs'
                  : 'bg-white/80 text-slate-700 hover:bg-white border border-amber-200'
              }`}
              title="Run Sparring first, then Cut-off, then Poomsae PK"
            >
              🥊 Sparring → Cut-off → PK
            </button>
            <div className="flex items-center gap-0.5 pl-1 border-l border-amber-300/80">
              {eventSequenceOrder.map((evId, idx) => {
                const info = ALL_STANDARD_EVENTS.find(e => e.id === evId) || { label: evId, icon: '🥋', shortLabel: evId };
                return (
                  <div key={evId} className="flex items-center gap-0.5 bg-white border border-amber-200 rounded px-1.5 py-0.5 text-[9px] font-black text-slate-800 shadow-2xs">
                    <span>{idx + 1}.</span>
                    <span>{info.icon}</span>
                    <span>{info.shortLabel}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx > 0) {
                          const nextSeq = [...eventSequenceOrder];
                          const item = nextSeq.splice(idx, 1)[0];
                          nextSeq.splice(idx - 1, 0, item);
                          onUpdateEventSequenceOrder?.(nextSeq);
                        }
                      }}
                      disabled={idx === 0}
                      className="text-slate-400 hover:text-slate-900 disabled:opacity-20 cursor-pointer pl-0.5"
                      title="Move earlier"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx < eventSequenceOrder.length - 1) {
                          const nextSeq = [...eventSequenceOrder];
                          const item = nextSeq.splice(idx, 1)[0];
                          nextSeq.splice(idx + 1, 0, item);
                          onUpdateEventSequenceOrder?.(nextSeq);
                        }
                      }}
                      disabled={idx === eventSequenceOrder.length - 1}
                      className="text-slate-400 hover:text-slate-900 disabled:opacity-20 cursor-pointer"
                      title="Move later"
                    >
                      ▶
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>
          
          {/* SEQUENCE ORDER TOGGLE */}
          <div className="flex bg-white rounded-md border border-slate-200 p-0.5" title="Bout Sequence Order within each Ring">
            <button
              type="button"
              onClick={() => setBoutSequenceOrder('sequential')}
              className={`px-2.5 py-1 rounded text-[10px] uppercase font-black tracking-wide transition-all cursor-pointer ${
                boutSequenceOrder === 'sequential'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="Sequential: Finish one category completely before starting the next"
            >
              Sequential
            </button>
            <button
              type="button"
              onClick={() => setBoutSequenceOrder('stages')}
              className={`px-2.5 py-1 rounded text-[10px] uppercase font-black tracking-wide transition-all cursor-pointer ${
                boutSequenceOrder === 'stages'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
              title="By Stages: Process all Round of 64s, then all Round of 32s, etc."
            >
              By Stages
            </button>
          </div>

          <div className="h-6 w-[1px] bg-slate-200"></div>

          {/* Allocation Actions: Sequential by Ring vs Round Robin */}
          <div className="flex items-center gap-1.5">
            {onAutoAssignRingsSequential && (
              <button
                type="button"
                onClick={onAutoAssignRingsSequential}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95"
                title="Fill Ring A completely first, then Ring B, then Ring C, D, E, F, G sequentially"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                <span>Fill Ring A 1st → B → C...</span>
              </button>
            )}

            <button
              type="button"
              onClick={onAutoAssignRings}
              className="flex items-center gap-1.5 bg-slate-200/80 hover:bg-slate-200 text-slate-800 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer"
              title="Auto split categories round-robin across rings"
            >
              <span>Auto Split</span>
            </button>
          </div>
        </div>
      </div>

      {catKeys.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          No categories parsed yet. Bring in your roster above.
        </div>
      ) : (
        <>
          {unassignedKeys.length === 0 ? (
            <div className="my-5 text-center py-8 bg-emerald-50/40 border border-dashed border-emerald-250 rounded-xl p-6">
              <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2 animate-bounce" />
              <p className="text-sm font-bold text-slate-800">All weight classes assigned to Rings!</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No remaining unassigned divisions. You can view, drag-and-drop, or customize allocations in the 
                <strong> Competition Ring Allocation</strong> lanes below.
              </p>
              <button
                type="button"
                onClick={() => {
                  catKeys.forEach(k => onUpdateCategoryRing(k, 0));
                }}
                className="mt-4 bg-slate-900 hover:bg-slate-850 text-white font-semibold px-4.5 py-2 rounded-xl text-xs transition-all cursor-pointer hover:shadow-md"
              >
                Reset All Allocations
              </button>
            </div>
          ) : (
            <>
              {/* Search bar inside the group */}
              <div className="my-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-slate-100/70 border border-slate-200/80 rounded-xl px-3.5 py-2 max-w-md flex-1">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search unallocated weight classes..."
                    className="bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-400 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const val = e.target.value as 'kyorugi-pk' | 'poomsae-pk' | 'poomsae-cutoff';
                      if (!val) return;
                      const targetKeys = filteredUnassignedKeys.length > 0 ? filteredUnassignedKeys : catKeys;
                      if (onBulkUpdateSystemType) {
                        onBulkUpdateSystemType(targetKeys, val);
                      } else if (onUpdateCategorySystemType) {
                        targetKeys.forEach((k) => onUpdateCategorySystemType(k, val));
                      }
                      e.target.value = '';
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl px-3 py-2 border border-amber-400 outline-none cursor-pointer transition-all shadow-sm active:scale-98 flex items-center gap-1.5"
                    title="Set System Type for ALL categories currently shown in table"
                  >
                    <option value="" disabled>⚡ Choose System Type for All ({filteredUnassignedKeys.length})...</option>
                    <option value="kyorugi-pk">Set All ({filteredUnassignedKeys.length}) → Sparring (Kyorugi PK)</option>
                    <option value="poomsae-pk">Set All ({filteredUnassignedKeys.length}) → Poomsae (PK/Bracket)</option>
                    <option value="poomsae-cutoff">Set All ({filteredUnassignedKeys.length}) → Poomsae (Cut-off Score)</option>
                  </select>

                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const ringVal = parseInt(e.target.value, 10);
                      if (isNaN(ringVal)) return;
                      const targetKeys = filteredUnassignedKeys.length > 0 ? filteredUnassignedKeys : catKeys;
                      if (onBulkUpdateRing) {
                        onBulkUpdateRing(targetKeys, ringVal);
                      } else {
                        targetKeys.forEach((k) => onUpdateCategoryRing(k, ringVal));
                      }
                      e.target.value = '';
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold text-xs rounded-xl px-3 py-2 border border-slate-700 outline-none cursor-pointer transition-all shadow-sm active:scale-98 flex items-center gap-1.5"
                    title="Assign ALL categories currently shown in table to a specific ring"
                  >
                    <option value="" disabled>🎯 Assign All to Ring ({filteredUnassignedKeys.length})...</option>
                    <option value="0">Assign All → Unassigned</option>
                    {Array.from({ length: ringCount }, (_, idx) => {
                      const val = idx + 1;
                      const label = ringLabelFormat === 'letter' ? String.fromCharCode(64 + val) : String(val);
                      return (
                        <option key={val} value={val}>
                          Assign All ({filteredUnassignedKeys.length}) → Ring {label}
                        </option>
                      );
                    })}
                  </select>

                  <div className="text-xs text-slate-500 font-bold bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 shrink-0">
                    {unassignedKeys.length} classes unassigned
                  </div>
                </div>
              </div>

              {/* Top Unassigned table details */}
              <div className="overflow-x-auto rounded-xl border border-slate-150">
                <table className="w-full text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                      <th className="px-4 py-3">Weight Class</th>
                      <th className="px-4 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          <span className="font-extrabold text-slate-700">System Type</span>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const val = e.target.value as 'kyorugi-pk' | 'poomsae-pk' | 'poomsae-cutoff';
                              if (!val) return;
                              const targetKeys = filteredUnassignedKeys.length > 0 ? filteredUnassignedKeys : catKeys;
                              if (onBulkUpdateSystemType) {
                                onBulkUpdateSystemType(targetKeys, val);
                              } else if (onUpdateCategorySystemType) {
                                targetKeys.forEach((k) => onUpdateCategorySystemType(k, val));
                              }
                              e.target.value = '';
                            }}
                            className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-extrabold text-[10px] rounded-lg px-2 py-1 outline-none cursor-pointer transition-all shadow-2xs normal-case font-sans tracking-normal"
                            title="Set System Type for ALL categories in this table"
                          >
                            <option value="" disabled>⚡ Set All ({filteredUnassignedKeys.length})...</option>
                            <option value="kyorugi-pk">Set All → Sparring (Kyorugi PK)</option>
                            <option value="poomsae-pk">Set All → Poomsae (PK/Bracket)</option>
                            <option value="poomsae-cutoff">Set All → Poomsae (Cut-off Score)</option>
                          </select>
                        </div>
                      </th>
                      <th className="px-4 py-3">Entrants Count</th>
                      <th className="px-4 py-3">Matches Needed</th>
                      <th className="px-4 py-3">Bracket Layout Size</th>
                      <th className="px-4 py-3">Status Info</th>
                      <th className="px-4 py-2.5 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="font-extrabold text-slate-700">Target Arena / Ring</span>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const ringVal = parseInt(e.target.value, 10);
                              if (isNaN(ringVal)) return;
                              const targetKeys = filteredUnassignedKeys.length > 0 ? filteredUnassignedKeys : catKeys;
                              if (onBulkUpdateRing) {
                                onBulkUpdateRing(targetKeys, ringVal);
                              } else {
                                targetKeys.forEach((k) => onUpdateCategoryRing(k, ringVal));
                              }
                              e.target.value = '';
                            }}
                            className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-extrabold text-[10px] rounded-lg px-2 py-1 outline-none cursor-pointer transition-all shadow-2xs normal-case font-sans tracking-normal"
                            title="Assign ALL categories in this table to a specific Competition Ring"
                          >
                            <option value="" disabled>🎯 Assign All ({filteredUnassignedKeys.length})...</option>
                            <option value="0">Assign All → Unassigned</option>
                            {Array.from({ length: ringCount }, (_, idx) => {
                              const val = idx + 1;
                              const label = ringLabelFormat === 'letter' ? String.fromCharCode(64 + val) : String(val);
                              return (
                                <option key={val} value={val}>
                                  Assign All → Ring {label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {filteredUnassignedKeys.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-slate-400 italic text-xs">
                          No unallocated weight classes match your search query.
                        </td>
                      </tr>
                    ) : (
                      filteredUnassignedKeys.map((key) => {
                        const cat = categories[key];
                        const hasMatches = cat.count >= 1;
                        
                        return (
                          <tr
                            key={key}
                            draggable
                            onDragStart={(e) => handleDragStart(e, key)}
                            onDragEnd={handleDragEnd}
                            className="hover:bg-slate-50/50 transition-colors group cursor-grab active:cursor-grabbing"
                            title="Drag this row to allocate directly to a Ring below!"
                          >
                            {/* Name */}
                            <td className="px-4 py-3.5 font-semibold text-slate-900 flex items-center gap-2">
                              <Dumbbell className="w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
                              <span>{key}</span>
                              <span className="text-[9px] bg-slate-100 font-mono text-slate-400 font-medium px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                                drag me
                              </span>
                            </td>

                            {/* System Type Select */}
                            <td className="px-4 py-3.5">
                              <select
                                value={cat.systemType || 'kyorugi-pk'}
                                onChange={(e) => {
                                  const val = e.target.value as any;
                                  if (onUpdateCategorySystemType) {
                                    onUpdateCategorySystemType(key, val);
                                  }
                                }}
                                className="bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-amber-500 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer transition-all"
                              >
                                <option value="kyorugi-pk">Sparring (Kyorugi PK)</option>
                                <option value="poomsae-pk">Poomsae (PK/Bracket)</option>
                                <option value="poomsae-cutoff">Poomsae (Cut-off Score)</option>
                              </select>
                            </td>
                            
                            {/* Count */}
                            <td className="px-4 py-3.5 font-mono text-slate-600 font-semibold">
                              {cat.count} athlete{cat.count === 1 ? '' : 's'}
                            </td>
                            
                            {/* Match counts */}
                            <td className="px-4 py-3.5 text-xs text-slate-500 font-mono">
                              {cat.systemType === 'poomsae-cutoff' ? '— (Scoring)' : (hasMatches ? `${cat.count - 1} matches` : '—')}
                            </td>
                            
                            {/* Bracket layout size */}
                            <td className="px-4 py-3.5 font-mono text-xs font-medium text-slate-600">
                              {cat.systemType === 'poomsae-cutoff' ? 'Cut-off Sheet' : (hasMatches ? `${cat.size}-draw bracket` : 'None')}
                            </td>
                            
                            {/* Status */}
                            <td className="px-4 py-3.5">
                              {cat.status === 'ready' && (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-bold border border-emerald-100">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Ready to draw</span>
                                </span>
                              )}
                              {cat.status === 'warn' && (
                                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full text-xs font-bold border border-amber-100">
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 animate-bounce" />
                                  <span>Over 64 (top 64 seeded)</span>
                                </span>
                              )}
                              {cat.status === 'bad' && (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-100">
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                  <span>Empty category</span>
                                </span>
                              )}
                            </td>
                            
                            {/* Ring selector dropdown inside the row */}
                            <td className="px-4 py-3.5 text-right">
                              <div className="inline-flex items-center justify-end gap-2 w-full">
                                {hasMatches ? (
                                  <div className="inline-flex items-center gap-2">
                                    <span className="text-xs text-slate-400 font-semibold">Ring</span>
                                    <select
                                      value={cat.ring || 0}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value, 10) || 0;
                                        onUpdateCategoryRing(key, val);
                                      }}
                                      className="bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-850 outline-none cursor-pointer transition-all"
                                    >
                                      <option value="0">Select...</option>
                                      {Array.from({ length: ringCount }, (_, idx) => {
                                        const val = idx + 1;
                                        const label = ringLabelFormat === 'letter' ? String.fromCharCode(64 + val) : String(val);
                                        return (
                                          <option key={val} value={val}>
                                            {label}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                ) : (
                                  <span className="text-slate-350 italic text-xs">Exempted</span>
                                )}
                                {onDeleteCategory && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteCategory(key);
                                    }}
                                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all shrink-0 cursor-pointer"
                                    title={`Delete Weight Class "${key}"`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* 1. COMPETITION RING ALLOCATION SECTION BELOW THE WEIGHT CLASSES */}
          <div className="mt-8 pt-6 border-t border-slate-150 unallocated-lanes">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4.5 h-4.5 text-amber-500" />
                  <span>Competition Ring Allocation</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Drag and drop classes, or use the selectors to organize divisions into competition rings.
                </p>
              </div>

              {/* Drag instruction notice */}
              <div className="hidden md:flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 rounded-lg text-[10px] font-bold">
                <span>💡 Drag weight cards directly to moves rings quickly</span>
              </div>
            </div>

            {/* Ring Sequencing & Gender Ordering Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white rounded-xl p-3.5 mb-4 shadow-sm border border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500 text-slate-950 rounded-lg font-black text-xs shrink-0">
                  ⚙️ Ring Sequencing
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                    Gender &amp; Age Sequencing Rule
                  </span>
                  <span className="text-[11px] text-slate-300">
                    Auto-arranges categories by age (youngest → oldest or oldest → youngest) automatically when assigned.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Gender &amp; Age Sequencing:</span>
                <select
                  value={ringGenderSequence}
                  onChange={(e) => onUpdateRingGenderSequence?.(e.target.value)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl px-3.5 py-2 border border-amber-400 outline-none cursor-pointer transition-all shadow-sm"
                  title="Choose Gender & Age Sequencing for all Competition Rings"
                >
                  <option value="all">🚻 All Genders (Sorted Youngest → Oldest Age)</option>
                  <option value="all-oldest-first">🚻 All Genders (Sorted Oldest → Youngest Age)</option>
                  <option value="male-first">♂️ Male First → ♀️ Female (Sorted Youngest → Oldest Age)</option>
                  <option value="male-first-oldest-first">♂️ Male First → ♀️ Female (Sorted Oldest → Youngest Age)</option>
                  <option value="female-first">♀️ Female First → ♂️ Male (Sorted Youngest → Oldest Age)</option>
                  <option value="female-first-oldest-first">♀️ Female First → ♂️ Male (Sorted Oldest → Youngest Age)</option>
                  <option value="male-only">♂️ Filter: Male Divisions Only (Youngest → Oldest)</option>
                  <option value="male-only-oldest-first">♂️ Filter: Male Divisions Only (Oldest → Youngest)</option>
                  <option value="female-only">♀️ Filter: Female Divisions Only (Youngest → Oldest)</option>
                  <option value="female-only-oldest-first">♀️ Filter: Female Divisions Only (Oldest → Youngest)</option>
                </select>
              </div>
            </div>

            {/* Grid structure for columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: ringCount }, (_, idx) => {
                const rVal = idx + 1;
                const rLabel = ringLabelFormat === 'letter' ? String.fromCharCode(64 + rVal) : String(rVal);
                const ringCats = getCategoriesForRing(rVal);
                const isOver = dragOverRing === rVal;
                const ringOrder = (ringSequenceOrders && ringSequenceOrders[rVal]) || boutSequenceOrder;

                return (
                  <div key={rVal} className="flex flex-col gap-2">
                    {/* On top of each ring: Sequential / By Stages selector */}
                    <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-xl px-3 py-2 shadow-2xs">
                      <span className="text-xs font-black font-mono text-slate-800 uppercase tracking-wide">
                        Ring {rLabel}
                      </span>
                      <div className="flex bg-slate-100 rounded-lg border border-slate-200/80 p-0.5" title={`Bout sequence order for Ring ${rLabel}`}>
                        <button
                          type="button"
                          onClick={() => onUpdateRingSequenceOrder?.(rVal, 'sequential')}
                          className={`px-2.5 py-1 text-[10px] uppercase font-black tracking-wide rounded-md transition-all cursor-pointer ${
                            ringOrder === 'sequential'
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                          title={`Ring ${rLabel}: Sequential - finish one division completely before starting the next`}
                        >
                          Sequential
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateRingSequenceOrder?.(rVal, 'stages')}
                          className={`px-2.5 py-1 text-[10px] uppercase font-black tracking-wide rounded-md transition-all cursor-pointer ${
                            ringOrder === 'stages'
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                          title={`Ring ${rLabel}: By Stages - play prelims for all divisions first, then semis, then finals`}
                        >
                          By Stages
                        </button>
                      </div>
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverRing(rVal);
                      }}
                      onDragLeave={() => {
                        if (dragOverRing === rVal) setDragOverRing(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverRing(null);
                        const catKey = e.dataTransfer.getData('text/plain');
                        if (catKey && categories[catKey]) {
                          onUpdateCategoryRing(catKey, rVal);
                        }
                      }}
                      className={`bg-slate-50 border-2 rounded-xl p-4 flex flex-col flex-1 min-h-[180px] transition-all duration-200 ${
                        isOver 
                          ? 'border-amber-400 bg-amber-50/20 ring-4 ring-amber-500/5 scale-[1.02] shadow-sm' 
                          : 'border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                    {/* Ring Header */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                      <span className="text-xs font-black text-slate-800 tracking-wider uppercase font-mono">
                        Ring {rLabel}
                      </span>
                      <span className="text-[10px] font-extrabold bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded-full font-mono">
                        {ringCats.length} {ringCats.length === 1 ? 'class' : 'classes'}
                      </span>
                    </div>

                    {/* Ring Events Overview & Sequence Override */}
                    {(() => {
                      const effectiveEventSeq = (ringEventSequences && ringEventSequences[rVal]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;
                      const ringEventMap: Record<string, string[]> = {};
                      ringCats.forEach(k => {
                        const cat = categories[k];
                        const evInfo = getCategoryEventInfo(cat?.systemType, cat?.event, k, cat?.name);
                        if (!ringEventMap[evInfo.id]) ringEventMap[evInfo.id] = [];
                        ringEventMap[evInfo.id].push(k);
                      });
                      const ringEvIds = Object.keys(ringEventMap).sort((a, b) => {
                        return getEventOrderRank(a, effectiveEventSeq) - getEventOrderRank(b, effectiveEventSeq);
                      });

                      if (ringEvIds.length > 1) {
                        return (
                          <div className="flex items-center justify-between bg-amber-50 border border-amber-250 rounded-lg px-2 py-1 mb-2.5">
                            <div className="flex items-center gap-1 text-[9px] font-black uppercase text-amber-950 flex-wrap">
                              <span className="bg-amber-200 text-amber-900 px-1 py-0.2 rounded font-mono text-[8px]">
                                {ringEvIds.length} EVENTS
                              </span>
                              {ringEvIds.map((evId, evI) => {
                                const inf = ALL_STANDARD_EVENTS.find(e => e.id === evId) || { shortLabel: evId, icon: '🥋' };
                                return (
                                  <span key={evId} className="flex items-center gap-0.5">
                                    {evI > 0 && <span className="text-amber-500 font-bold">→</span>}
                                    <span>{inf.icon}</span>
                                    <span>{inf.shortLabel}</span>
                                  </span>
                                );
                              })}
                            </div>
                            {onUpdateRingEventSequence && (
                              <button
                                type="button"
                                onClick={() => onUpdateRingEventSequence(rVal, [...ringEvIds].reverse())}
                                className="text-[9px] font-black text-amber-800 hover:text-amber-950 underline cursor-pointer shrink-0 ml-1"
                                title="Swap event sequence for this ring"
                              >
                                ⇄ Swap
                              </button>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Allocated Cards Pool container */}
                    <div className="space-y-2 flex-1 flex flex-col justify-start">
                      {ringCats.length === 0 ? (
                        <div className="flex-1 border border-dashed border-slate-200/80 rounded-lg flex flex-col items-center justify-center p-4 text-center select-none text-slate-400">
                          <Layers className="w-5 h-5 text-slate-300 mb-1" />
                          <span className="text-[10px] font-bold text-slate-400">Drop &amp; Assign Here</span>
                        </div>
                      ) : (
                        ringCats.map((catKey, index, arr) => {
                          const cat = categories[catKey];
                          const isCatOver = dragOverCatKey === catKey;
                          const effectiveEventSeq = (ringEventSequences && ringEventSequences[rVal]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;
                          const evInfo = getCategoryEventInfo(cat?.systemType, cat?.event, catKey, cat?.name);
                          const prevCat = index > 0 ? categories[arr[index - 1]] : null;
                          const prevEvId = prevCat ? getCategoryEventInfo(prevCat?.systemType, prevCat?.event, arr[index - 1], prevCat?.name).id : null;
                          const isFirstOfEvent = !prevEvId || prevEvId !== evInfo.id;
                          const currentEventOrderIdx = getEventOrderRank(evInfo.id, effectiveEventSeq) + 1;

                          return (
                            <React.Fragment key={catKey}>
                              {isFirstOfEvent && (
                                <div className={`flex items-center justify-between rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border shadow-2xs mt-2 first:mt-0 ${evInfo.badgeBg} ${evInfo.badgeBorder} ${evInfo.badgeText}`}>
                                  <div className="flex items-center gap-1.5">
                                    <span>{evInfo.icon}</span>
                                    <span>Event {currentEventOrderIdx}: {evInfo.label}</span>
                                  </div>
                                  <span className="font-mono opacity-80">Ring {rLabel}</span>
                                </div>
                              )}
                              <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, catKey)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverCatKey(catKey);
                              }}
                              onDragLeave={() => {
                                if (dragOverCatKey === catKey) setDragOverCatKey(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverCatKey(null);
                                const sourceKey = e.dataTransfer.getData('text/plain');
                                if (sourceKey && sourceKey !== catKey && onReorderCategoryTo) {
                                  onReorderCategoryTo(sourceKey, catKey);
                                } else if (sourceKey && sourceKey !== catKey && onUpdateCategoryRing) {
                                  // Fallback: if dropped from another ring, just assign to this ring
                                  onUpdateCategoryRing(sourceKey, rVal);
                                }
                              }}
                              className={`bg-white border rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all duration-150 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing relative group/card ${isCatOver ? 'border-amber-500 bg-amber-50/50 scale-105 z-10' : 'border-slate-250 hover:border-amber-500'}`}
                            >
                              {/* Card Action Controls (top-right) */}
                              <div className="flex items-center justify-end -mt-0.5">
                                <div className="flex items-center gap-0.5 shrink-0 bg-slate-50/80 rounded p-0.5 border border-slate-200/60">
                                  {onReorderCategory && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onReorderCategory(catKey, 'up');
                                        }}
                                        disabled={index === 0}
                                        className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent p-1 rounded transition-all cursor-pointer animate-in fade-in"
                                        title="Move Up"
                                      >
                                        <ChevronUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onReorderCategory(catKey, 'down');
                                        }}
                                        disabled={index === arr.length - 1}
                                        className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent p-1 rounded transition-all cursor-pointer animate-in fade-in"
                                        title="Move Down"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                  {onDeleteCategory && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteCategory(catKey);
                                      }}
                                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-all shrink-0 cursor-pointer animate-in fade-in"
                                      title={`Delete Weight Class "${catKey}"`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onUpdateCategoryRing(catKey, 0)}
                                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-all shrink-0 cursor-pointer"
                                    title="Unassign weight class and return to top list"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Centered Weight Class Name */}
                              <div className="flex items-center justify-center text-center px-1 my-0.5">
                                <span 
                                  className="font-extrabold text-xs text-slate-900 break-words leading-snug text-center group-hover/card:text-amber-600 transition-colors"
                                  title={catKey}
                                >
                                  {catKey}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold font-mono">
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{cat.count} athletes</span>
                                {cat.systemType === 'poomsae-cutoff' ? (
                                  <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                                    Poomsae Cut-off
                                  </span>
                                ) : cat.systemType === 'poomsae-pk' ? (
                                  <span className="bg-cyan-100 text-cyan-800 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                                    Poomsae PK
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[9px]">
                                    {`${cat.size}-draw Sparring`}
                                  </span>
                                )}
                              </div>

                              {/* System Type select right on the card */}
                              <div className="flex items-center gap-1 border-t border-slate-100 pt-2 mt-0.5">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono font-bold">Type:</span>
                                <select
                                  value={cat.systemType || 'kyorugi-pk'}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    if (onUpdateCategorySystemType) {
                                      onUpdateCategorySystemType(catKey, val);
                                    }
                                  }}
                                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-extrabold text-slate-700 outline-none cursor-pointer transition-all w-full shrink-0"
                                >
                                  <option value="kyorugi-pk">Sparring (Kyorugi PK)</option>
                                  <option value="poomsae-pk">Poomsae (PK)</option>
                                  <option value="poomsae-cutoff">Poomsae (Cut-off)</option>
                                </select>
                              </div>

                              {/* Re-route allocation selector right on the card */}
                              <div className="flex items-center gap-1 border-t border-slate-100 pt-1.5 mt-0.5">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">Move:</span>
                                <select
                                  value={cat.ring || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 0;
                                    onUpdateCategoryRing(catKey, val);
                                  }}
                                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-extrabold text-slate-700 outline-none cursor-pointer transition-all w-full shrink-0"
                                >
                                  {Array.from({ length: ringCount }, (_, iIdx) => {
                                    const val = iIdx + 1;
                                    const label = ringLabelFormat === 'letter' ? String.fromCharCode(64 + val) : String(val);
                                    return (
                                      <option key={val} value={val}>
                                        Ring {label}
                                      </option>
                                    );
                                  })}
                                  <option value="0">Unallocate (Pool)</option>
                                </select>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })
                    )}
                    </div>

                    {/* Ring Draw Action button */}
                    {ringCats.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onGenerateBrackets(rVal)}
                        className="mt-4 w-full bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 py-2 px-3 rounded-xl text-[10px] font-extrabold border border-slate-950 tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 text-center shadow-sm"
                        title={`Draw tournament brackets exclusively for Ring ${rLabel}`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Draw Ring {rLabel} Brackets</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-4 border-t border-slate-150">
            {/* Seed randomization checkbox */}
            <label className="flex items-center gap-2.5 text-slate-700 hover:text-slate-900 select-none cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 accent-amber-500"
                checked={shuffleSeed}
                onChange={(e) => setShuffleSeed(e.target.checked)}
              />
              <span className="text-sm font-semibold">Randomize bracket seedings &amp; positions</span>
            </label>

            {/* Build buttons */}
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <button
                type="button"
                onClick={() => onGenerateBrackets()}
                disabled={eligibleKeys.length === 0}
                className="px-5 py-3 text-sm font-black text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-45 rounded-xl shadow-lg shadow-amber-500/10 border border-amber-500 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                title="Generate all brackets following the categories you set in Competition Ring Allocation: Ring A finishes 1st, then Ring B, then Ring C, D, E, F, G"
              >
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>Generate by Ring (A → B → C...)</span>
              </button>

              <div className="flex items-center bg-amber-500 rounded-xl shadow-lg shadow-amber-500/10 border border-amber-600/20 overflow-hidden w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => onGenerateBrackets(selectedGenRing === 'all' ? undefined : Number(selectedGenRing))}
                  disabled={eligibleKeys.length === 0}
                  className="px-6 py-3 text-sm font-extrabold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-45 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 border-r border-amber-650/20 flex-1 sm:flex-none"
                >
                  <Layers className="w-4 h-4" />
                  <span>
                    {selectedGenRing === 'all' 
                      ? 'Generate All Brackets' 
                      : `Draw Ring ${ringLabelFormat === 'letter' ? String.fromCharCode(64 + Number(selectedGenRing)) : selectedGenRing} Brackets`}
                  </span>
                </button>
                <select
                  value={selectedGenRing}
                  onChange={(e) => setSelectedGenRing(e.target.value)}
                  className="bg-amber-500 text-slate-950 font-extrabold text-xs px-2.5 py-3 h-full outline-none cursor-pointer hover:bg-amber-400 transition-colors border-none min-h-[44px]"
                  title="Target generating and scheduling brackets to all rings or a specific ring"
                >
                  <option value="all">All Rings (A → B → C...)</option>
                  {Array.from({ length: ringCount }, (_, idx) => {
                    const rVal = idx + 1;
                    const rLabel = ringLabelFormat === 'letter' ? String.fromCharCode(64 + rVal) : String(rVal);
                    return (
                      <option key={rVal} value={rVal}>
                        Ring {rLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
              
              {hasBrackets && onResetBrackets && (
                <button
                  type="button"
                  onClick={onResetBrackets}
                  className="w-full sm:w-auto px-6 py-3 text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                  title="Clear generated tournament brackets and return to Ring Allocation"
                >
                  <RotateCcw className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>Reset Brackets</span>
                </button>
              )}
              
              {hasBrackets && onDownloadSearchablePdf && (
                <div className="flex items-stretch overflow-hidden border border-amber-650/30 rounded-xl shadow-xs bg-amber-500 hover:bg-amber-400 group w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onDownloadSearchablePdf(selectedDownloadRing === 'all' ? 'all' : Number(selectedDownloadRing))}
                    disabled={!hasBrackets}
                    className="px-6 py-3 text-sm font-bold bg-amber-500 hover:bg-amber-450 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 border-r border-amber-650/20 flex-1 sm:flex-none"
                    title="Download fully searchable vector PDF file of brackets"
                  >
                    <Search className="w-4 h-4 text-slate-950 shrink-0" />
                    <span>
                      {selectedDownloadRing === 'all'
                        ? 'Download PDF'
                        : `Download Ring ${ringLabelFormat === 'letter' ? String.fromCharCode(64 + Number(selectedDownloadRing)) : selectedDownloadRing} PDF`}
                    </span>
                  </button>
                  <select
                    value={selectedDownloadRing}
                    onChange={(e) => setSelectedDownloadRing(e.target.value)}
                    disabled={!hasBrackets}
                    className="bg-amber-500 text-slate-950 font-extrabold text-xs px-2.5 py-3 h-full outline-none cursor-pointer hover:bg-amber-400 transition-colors border-none min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Select whether to download all rings or a specific ring's brackets"
                  >
                    <option value="all">All Rings</option>
                    {Array.from({ length: ringCount }, (_, idx) => {
                      const rVal = idx + 1;
                      const rLabel = ringLabelFormat === 'letter' ? String.fromCharCode(64 + rVal) : String(rVal);
                      return (
                        <option key={rVal} value={rVal}>
                          Ring {rLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
              
            </div>
          </div>
        </>
      )}
    </section>
  );
};
