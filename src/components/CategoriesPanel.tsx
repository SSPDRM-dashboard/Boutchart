import React, { useState } from 'react';
import { Layers, Activity, Dumbbell, ShieldAlert, CheckCircle2, RotateCcw, HelpCircle, Search, Sparkles, X, Shuffle, Printer, Trash2 } from 'lucide-react';
import { WeightCategory } from '../types';

interface CategoriesPanelProps {
  categories: Record<string, WeightCategory>;
  ringCount: number;
  setRingCount: (count: number) => void;
  onAutoAssignRings: () => void;
  onUpdateCategoryRing: (categoryKey: string, ring: number) => void;
  shuffleSeed: boolean;
  setShuffleSeed: (shuffle: boolean) => void;
  onGenerateBrackets: (targetRing?: number) => void;
  ringLabelFormat: 'number' | 'letter';
  setRingLabelFormat: (format: 'number' | 'letter') => void;
  onExportPdf: () => void;
  hasBrackets: boolean;
  onDeleteCategory?: (categoryKey: string) => void;
}

export const CategoriesPanel: React.FC<CategoriesPanelProps> = ({
  categories,
  ringCount,
  setRingCount,
  onAutoAssignRings,
  onUpdateCategoryRing,
  shuffleSeed,
  setShuffleSeed,
  onGenerateBrackets,
  ringLabelFormat,
  setRingLabelFormat,
  onExportPdf,
  hasBrackets,
  onDeleteCategory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedCatKey, setDraggedCatKey] = useState<string | null>(null);
  const [dragOverRing, setDragOverRing] = useState<number | null>(null);
  const [selectedGenRing, setSelectedGenRing] = useState<string>('all');

  const catKeys = Object.keys(categories);
  const eligibleKeys = catKeys.filter(k => categories[k].count >= 1);

  // Unassigned keys (categories where ring is 0 or undefined)
  const unassignedKeys = catKeys.filter(
    (key) => !categories[key].ring || categories[key].ring === 0
  );

  // Filter unassigned keys by search query
  const filteredUnassignedKeys = unassignedKeys.filter(key => 
    key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get categories allocated to a specific ring
  const getCategoriesForRing = (rVal: number) => {
    return catKeys.filter((key) => categories[key].ring === rVal);
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

          <button
            onClick={onAutoAssignRings}
            className="flex items-center gap-1.5 bg-slate-200/80 hover:bg-slate-200 text-slate-800 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer animate-pulse"
            title="Auto assign rings round-robin"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Auto Split</span>
          </button>
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
                
                <div className="text-xs text-slate-500 font-bold bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  {unassignedKeys.length} classes unassigned
                </div>
              </div>

              {/* Top Unassigned table details */}
              <div className="overflow-x-auto rounded-xl border border-slate-150">
                <table className="w-full text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                      <th className="px-4 py-3">Weight Class</th>
                      <th className="px-4 py-3">Entrants Count</th>
                      <th className="px-4 py-3">Matches Needed</th>
                      <th className="px-4 py-3">Bracket Layout Size</th>
                      <th className="px-4 py-3">Status Info</th>
                      <th className="px-4 py-3 text-right">Target Arena / Ring</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                    {filteredUnassignedKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-slate-400 italic text-xs">
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
                            
                            {/* Count */}
                            <td className="px-4 py-3.5 font-mono text-slate-600 font-semibold">
                              {cat.count} athlete{cat.count === 1 ? '' : 's'}
                            </td>
                            
                            {/* Match counts */}
                            <td className="px-4 py-3.5 text-xs text-slate-500 font-mono">
                              {hasMatches ? `${cat.count - 1} matches` : '—'}
                            </td>
                            
                            {/* Bracket layout size */}
                            <td className="px-4 py-3.5 font-mono text-xs font-medium text-slate-600">
                              {hasMatches ? `${cat.size}-draw bracket` : 'None'}
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

            {/* Grid structure for columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: ringCount }, (_, idx) => {
                const rVal = idx + 1;
                const rLabel = ringLabelFormat === 'letter' ? String.fromCharCode(64 + rVal) : String(rVal);
                const ringCats = getCategoriesForRing(rVal);
                const isOver = dragOverRing === rVal;

                return (
                  <div
                    key={rVal}
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
                    className={`bg-slate-50 border-2 rounded-xl p-4 flex flex-col min-h-[180px] transition-all duration-200 ${
                      isOver 
                        ? 'border-amber-400 bg-amber-50/20 ring-4 ring-amber-500/5 scale-[1.02] shadow-sm' 
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    {/* Ring Header */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                      <span className="text-xs font-black text-slate-800 tracking-wider uppercase font-mono">
                        Ring {rLabel}
                      </span>
                      <span className="text-[10px] font-extrabold bg-slate-200/80 text-slate-700 px-2.5 py-0.5 rounded-full font-mono">
                        {ringCats.length} {ringCats.length === 1 ? 'class' : 'classes'}
                      </span>
                    </div>

                    {/* Allocated Cards Pool container */}
                    <div className="space-y-2 flex-1 flex flex-col justify-start">
                      {ringCats.length === 0 ? (
                        <div className="flex-1 border border-dashed border-slate-200/80 rounded-lg flex flex-col items-center justify-center p-4 text-center select-none text-slate-400">
                          <Layers className="w-5 h-5 text-slate-300 mb-1" />
                          <span className="text-[10px] font-bold text-slate-400">Drop &amp; Assign Here</span>
                        </div>
                      ) : (
                        ringCats.map((catKey) => {
                          const cat = categories[catKey];
                          return (
                            <div
                              key={catKey}
                              draggable
                              onDragStart={(e) => handleDragStart(e, catKey)}
                              onDragEnd={handleDragEnd}
                              className="bg-white border border-slate-250 rounded-lg p-2.5 shadow-sm hover:border-amber-500 hover:shadow-md transition-all duration-150 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing relative group/card"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Dumbbell className="w-3.5 h-3.5 text-slate-400 group-hover/card:text-amber-500 shrink-0 transition-colors" />
                                  <span className="font-extrabold text-xs text-slate-900 truncate">
                                    {catKey}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
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

                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold font-mono">
                                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{cat.count} athletes</span>
                                <span className="text-slate-400">{cat.size}-draw</span>
                              </div>

                              {/* Re-route allocation selector right on the card */}
                              <div className="flex items-center gap-1 border-t border-slate-100 pt-2 mt-0.5">
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
              
              <button
                type="button"
                onClick={onExportPdf}
                disabled={!hasBrackets}
                className="w-full sm:w-auto px-8 py-3 text-sm font-bold bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer active:scale-95 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>Export / Print Data</span>
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
