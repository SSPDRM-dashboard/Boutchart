import React, { useState } from 'react';
import { Athlete, WeightCategory } from '../types';
import { Trophy, School, Users, Medal, Shield } from 'lucide-react';
import { getCategoryEventInfo } from '../utils/bracketUtils';

interface StatisticsPanelProps {
  roster: Athlete[];
  categories: Record<string, WeightCategory>;
}

interface EventMedalStats {
  eventId: string;
  label: string;
  shortLabel: string;
  icon: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
  categoryCount: number;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ roster, categories }) => {
  const [demographicType, setDemographicType] = useState<'school' | 'club'>('school');

  // Calculate unique counts of schools and clubs
  const schoolsSet = new Set<string>();
  const clubsSet = new Set<string>();
  roster.forEach(a => {
    if (a.school && a.school.trim() !== '') {
      schoolsSet.add(a.school.trim());
    }
    if (a.club && a.club.trim() !== '') {
      clubsSet.add(a.club.trim());
    }
  });
  const totalSchools = schoolsSet.size;
  const totalClubs = clubsSet.size;

  // Players by selected demographic type and gender
  const stats: Record<string, { total: number; m: number; f: number; u: number }> = {};
  
  roster.forEach(athlete => {
    const key = (demographicType === 'school' ? athlete.school : athlete.club) || 'Unspecified';
    const genderRaw = athlete.gender?.toLowerCase() || '';
    let g = 'u';
    if (genderRaw.startsWith('m')) g = 'm';
    else if (genderRaw.startsWith('f')) g = 'f';
    
    if (!stats[key]) {
      stats[key] = { total: 0, m: 0, f: 0, u: 0 };
    }
    
    stats[key].total += 1;
    if (g === 'm') stats[key].m += 1;
    else if (g === 'f') stats[key].f += 1;
    else stats[key].u += 1;
  });

  const sortedStats = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);

  // 2. Medals calculation overall and by event
  let totalGold = 0;
  let totalSilver = 0;
  let totalBronze = 0;

  const eventMedalsMap: Record<string, EventMedalStats> = {};

  (Object.entries(categories) as [string, WeightCategory][]).forEach(([catKey, cat]) => {
    const count = cat.count || 0;
    const g = count >= 1 ? 1 : 0;
    const s = count >= 2 ? 1 : 0;
    const b = count >= 4 ? 2 : (count === 3 ? 1 : 0);
    const t = g + s + b;

    totalGold += g;
    totalSilver += s;
    totalBronze += b;

    const evInfo = getCategoryEventInfo(cat.systemType, cat.event, catKey, cat.name);
    if (!eventMedalsMap[evInfo.id]) {
      eventMedalsMap[evInfo.id] = {
        eventId: evInfo.id,
        label: evInfo.label,
        shortLabel: evInfo.shortLabel,
        icon: evInfo.icon,
        gold: 0,
        silver: 0,
        bronze: 0,
        total: 0,
        categoryCount: 0,
      };
    }

    eventMedalsMap[evInfo.id].gold += g;
    eventMedalsMap[evInfo.id].silver += s;
    eventMedalsMap[evInfo.id].bronze += b;
    eventMedalsMap[evInfo.id].total += t;
    eventMedalsMap[evInfo.id].categoryCount += 1;
  });

  const totalMedals = totalGold + totalSilver + totalBronze;
  const eventMedalsList = Object.values(eventMedalsMap);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-sky-500/10 p-3 rounded-xl border border-sky-500/20">
          <Trophy className="w-6 h-6 text-sky-500" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
            Tournament Statistics
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Overview of player demographics and required medals by event.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Medals Summary & By Event Breakdown */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 animate-fade-in flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Medal className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-800">Required Medals</h3>
              </div>
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2.5 py-1 rounded-md shadow-2xs">
                Total: {totalMedals} Medals Needed
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-white border border-amber-200 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-black text-amber-500">{totalGold}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Gold</div>
              </div>
              <div className="bg-white border border-slate-300 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-black text-slate-500">{totalSilver}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Silver</div>
              </div>
              <div className="bg-white border border-amber-700/30 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-black text-amber-700">{totalBronze}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">Bronze</div>
              </div>
            </div>

            {/* Breakdown by Event */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <span>⚡</span>
                <span>Medals Breakdown by Event:</span>
              </h4>
              <div className="space-y-2">
                {eventMedalsList.map(ev => (
                  <div key={ev.eventId} className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{ev.icon}</span>
                      <div>
                        <div className="text-xs font-extrabold text-slate-800">{ev.label}</div>
                        <div className="text-[10px] text-slate-400 font-bold">{ev.categoryCount} Division{ev.categoryCount === 1 ? '' : 's'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono font-bold">
                      <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200" title="Gold">
                        🥇 {ev.gold}
                      </span>
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200" title="Silver">
                        🥈 {ev.silver}
                      </span>
                      <span className="bg-amber-950/10 text-amber-900 px-2 py-0.5 rounded border border-amber-800/20" title="Bronze">
                        🥉 {ev.bronze}
                      </span>
                      <span className="bg-slate-900 text-amber-400 px-2.5 py-0.5 rounded font-black" title="Total Medals">
                        {ev.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Players Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Players Overview</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Athletes</div>
              <div className="text-xl md:text-2xl font-black text-slate-900">{roster.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Schools</div>
              <div className="text-xl md:text-2xl font-black text-slate-900">{totalSchools}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm text-center">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Clubs</div>
              <div className="text-xl md:text-2xl font-black text-slate-900">{totalClubs}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Demographics Selector Toggle and Table */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 px-1">
          <div className="flex items-center gap-2">
            {demographicType === 'school' ? (
              <School className="w-5 h-5 text-slate-600 animate-pulse" />
            ) : (
              <Shield className="w-5 h-5 text-slate-600 animate-pulse" />
            )}
            <h3 className="font-bold text-slate-800">
              Demographics by {demographicType === 'school' ? 'School' : 'Club / Team'}
            </h3>
          </div>
          
          {/* Toggle Buttons */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto shadow-sm">
            <button
              onClick={() => setDemographicType('school')}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                demographicType === 'school'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏫 School
            </button>
            <button
              onClick={() => setDemographicType('club')}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                demographicType === 'club'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🛡️ Club / Team
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="px-4 py-3">
                  {demographicType === 'school' ? 'School Name' : 'Club / Team Name'}
                </th>
                <th className="px-4 py-3 text-center">Male</th>
                <th className="px-4 py-3 text-center">Female</th>
                <th className="px-4 py-3 text-center">Unspecified</th>
                <th className="px-4 py-3 text-center">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedStats.map(([name, itemStats]) => (
                <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-2">
                    {demographicType === 'school' ? '🏫' : '🛡️'} {name}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{itemStats.m}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{itemStats.f}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{itemStats.u > 0 ? itemStats.u : '-'}</td>
                  <td className="px-4 py-3 text-center font-black text-slate-900">{itemStats.total}</td>
                </tr>
              ))}
              {sortedStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 font-medium">
                    No data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
