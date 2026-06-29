import React from 'react';
import { Athlete, WeightCategory } from '../types';
import { Trophy, School, Users, Medal } from 'lucide-react';

interface StatisticsPanelProps {
  roster: Athlete[];
  categories: Record<string, WeightCategory>;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ roster, categories }) => {
  // 1. Players by School and Gender
  const schoolStats: Record<string, { total: number; m: number; f: number; u: number }> = {};
  
  roster.forEach(athlete => {
    const school = athlete.school || 'Unspecified';
    const genderRaw = athlete.gender?.toLowerCase() || '';
    let g = 'u';
    if (genderRaw.startsWith('m')) g = 'm';
    else if (genderRaw.startsWith('f')) g = 'f';
    
    if (!schoolStats[school]) {
      schoolStats[school] = { total: 0, m: 0, f: 0, u: 0 };
    }
    
    schoolStats[school].total += 1;
    if (g === 'm') schoolStats[school].m += 1;
    else if (g === 'f') schoolStats[school].f += 1;
    else schoolStats[school].u += 1;
  });

  const sortedSchools = Object.entries(schoolStats).sort((a, b) => b[1].total - a[1].total);

  // 2. Medals calculation
  let totalGold = 0;
  let totalSilver = 0;
  let totalBronze = 0;

  (Object.values(categories) as WeightCategory[]).forEach(cat => {
    const count = cat.count;
    if (count >= 1) totalGold += 1;
    if (count >= 2) totalSilver += 1;
    if (count >= 4) totalBronze += 2;
    else if (count === 3) totalBronze += 1;
  });

  const totalMedals = totalGold + totalSilver + totalBronze;

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
            Overview of player demographics and required medals.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Medals Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Medal className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-800">Required Medals</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
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
          <div className="flex justify-between items-center text-sm font-semibold text-slate-600 px-2">
            <span>Total Medals Needed:</span>
            <span className="font-black text-slate-900 bg-slate-200 px-3 py-1 rounded-md">{totalMedals}</span>
          </div>
        </div>

        {/* Players Summary */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Players Overview</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-500 mb-1">Total Athletes</div>
              <div className="text-3xl font-black text-slate-900">{roster.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-500 mb-1">Total Schools</div>
              <div className="text-3xl font-black text-slate-900">{sortedSchools.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* School & Gender Table */}
      <div>
        <div className="flex items-center gap-2 mb-4 px-1">
          <School className="w-5 h-5 text-slate-600" />
          <h3 className="font-bold text-slate-800">Demographics by School</h3>
        </div>
        
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="px-4 py-3">School Name</th>
                <th className="px-4 py-3 text-center">Male</th>
                <th className="px-4 py-3 text-center">Female</th>
                <th className="px-4 py-3 text-center">Unspecified</th>
                <th className="px-4 py-3 text-center">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedSchools.map(([school, stats]) => (
                <tr key={school} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{school}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{stats.m}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{stats.f}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{stats.u > 0 ? stats.u : '-'}</td>
                  <td className="px-4 py-3 text-center font-black text-slate-900">{stats.total}</td>
                </tr>
              ))}
              {sortedSchools.length === 0 && (
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
