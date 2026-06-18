import React, { useState } from 'react';
import { Users, Search, Printer, HelpCircle, ShieldAlert, CheckCircle2, Flame, AlignJustify, Grid, Award, Download, Share2, Copy, Check } from 'lucide-react';
import { Athlete, WeightCategory, BracketModel } from '../types';
import { compressToGzipBase64 } from '../utils/compression';

interface ClubReportPanelProps {
  categories: Record<string, WeightCategory>;
  brackets: Record<string, BracketModel>;
  roster: Athlete[];
  ringLabelFormat: 'number' | 'letter';
  tournamentName?: string;
  isPublicView?: boolean;
}

interface PlayerFightInfo {
  athleteName: string;
  weightClass: string;
  ringLabel: string;
  bouts: Array<{
    boutNumber: number;
    formattedId: string;
    roundName: string;
    opponentName: string;
    opponentClub: string;
    kRound: number;
    corner: 'C' | 'H'; // Chung (Blue) or Hong (Red)
  }>;
}

export const ClubReportPanel: React.FC<ClubReportPanelProps> = ({
  categories,
  brackets,
  roster,
  ringLabelFormat,
  tournamentName = '',
  isPublicView = false,
}) => {
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Choose between 'photo-matrix' (current tabular grid) or 'classic-cards' (previous layout)
  const [reportStyle, setReportStyle] = useState<'photo-matrix' | 'classic-cards'>('photo-matrix');

  const [shareStatus, setShareStatus] = useState<'silent' | 'loading' | 'copied' | 'error'>('silent');
  const [shareUrl, setShareUrl] = useState('');

  const generateAndCopyShareLink = () => {
    try {
      setShareStatus('loading');
      
      const payload = {
        t: tournamentName || 'Tournament',
        r: roster,
        c: categories,
        b: brackets,
        rl: ringLabelFormat
      };
      
      fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok) throw new Error('API failed');
        return res.json();
      })
      .then(resData => {
        if (resData && resData.id) {
          const baseUrl = window.location.origin + window.location.pathname;
          const shareLink = `${baseUrl}?view=club-report&id=${resData.id}`;
          
          setShareUrl(shareLink);
          navigator.clipboard.writeText(shareLink);
          setShareStatus('copied');
        } else {
          throw new Error('No ID returned');
        }
      })
      .catch(err => {
        console.log('Using native GZIP client compressed URL format', err);
        // Fallback to high-compression gzip base64 if server request fails
        const jsonStr = JSON.stringify(payload);
        compressToGzipBase64(jsonStr)
          .then(base64Str => {
            const baseUrl = window.location.origin + window.location.pathname;
            const shareLink = `${baseUrl}?view=club-report&data=${base64Str}`;
            
            setShareUrl(shareLink);
            navigator.clipboard.writeText(shareLink);
            setShareStatus('copied');
          })
          .catch(fbErr => {
            console.error('Fallback compression failed', fbErr);
            setShareStatus('error');
          });
      });
    } catch (e) {
      console.error('Failed to generate shareable link', e);
      setShareStatus('error');
    }
  };

  // 1. Label formatting helper for rings
  const getRingLabel = (ringNum: number | string) => {
    if (ringLabelFormat === 'letter') {
      const num = typeof ringNum === 'string' ? parseInt(ringNum, 10) : ringNum;
      if (isNaN(num) || num < 1) return String(ringNum);
      return String.fromCharCode(64 + num);
    }
    return String(ringNum);
  };

  // 2. Bout ID format helper (e.g. A02)
  const getFormattedBout = (ring: string | number, boutNumber: number | undefined): string => {
    if (boutNumber === undefined) return '';
    const trimmed = String(ring).trim();
    const match = trimmed.match(/([a-zA-Z0-9]+)$/);
    const prefix = match ? match[1].toUpperCase() : 'R';
    const padded = String(boutNumber).padStart(2, '0');
    return `${prefix}${padded}`;
  };

  // 3. Human-readable round name helper
  const getRoundName = (k: number, numRounds: number): string => {
    if (k === numRounds) return 'Final';
    if (k === numRounds - 1) return 'Semifinal';
    if (k === numRounds - 2) return 'Quarterfinal';
    return `Round ${k}`;
  };

  // 4. Gather all clubs and athletes to establish fight schedules
  const athleteKeySet = new Set<string>();
  const athleteList: { name: string; club: string; weight: string }[] = [];

  // Add from original roster
  roster.forEach(a => {
    const key = `${a.name.trim().toLowerCase()}||${a.club.trim().toLowerCase()}||${a.weight.trim().toLowerCase()}`;
    if (!athleteKeySet.has(key)) {
      athleteKeySet.add(key);
      athleteList.push({
        name: a.name.trim(),
        club: a.club.trim() || 'Unassigned Club',
        weight: a.weight.trim()
      });
    }
  });

  // Add from bracket leaf nodes to cover manual changes/overrides
  Object.keys(brackets).forEach(catKey => {
    const model = brackets[catKey];
    if (model && model.nodes[0]) {
      model.nodes[0].forEach(node => {
        if (node.name && node.name !== 'BYE') {
          const key = `${node.name.trim().toLowerCase()}||${(node.club || '').trim().toLowerCase()}||${catKey.trim().toLowerCase()}`;
          if (!athleteKeySet.has(key)) {
            athleteKeySet.add(key);
            athleteList.push({
              name: node.name.trim(),
              club: (node.club || 'Unassigned Club').trim(),
              weight: catKey
            });
          }
        }
      });
    }
  });

  const clubList = Array.from(new Set(athleteList.map(a => a.club))).sort((a, b) => a.localeCompare(b));

  // Helper to find the awaiting opponent name or bout winner recursively
  const getAwaitingOpponentLabel = (
    model: BracketModel,
    k: number, // round index
    idx: number, // node index
    ringLabel: string
  ): { name: string; club: string } => {
    const node = model.nodes[k]?.[idx];
    if (!node) {
      return { name: 'TBD', club: '' };
    }

    // 1. If it has a real name and is not BYE or empty, return it.
    if (node.name && node.name.trim() !== '' && node.name !== 'BYE') {
      return { name: node.name.trim(), club: node.club?.trim() || '' };
    }

    // 2. If it is marked as a BYE, return 'BYE'.
    if (node.isBye) {
      return { name: 'BYE', club: '' };
    }

    // 3. If there is a scheduled bout at this node, the occupant will be the winner of that bout!
    if (typeof node.bout === 'number') {
      return {
        name: `Winner of Bout ${getFormattedBout(ringLabel, node.bout)}`,
        club: '',
      };
    }

    // 4. If there is no bout number, it must be a bypass/walkover.
    // Look at the children of this node in round k-1: 2*idx and 2*idx + 1.
    if (k > 0) {
      const leftChild = model.nodes[k - 1]?.[2 * idx];
      const rightChild = model.nodes[k - 1]?.[2 * idx + 1];

      if (leftChild && !leftChild.isBye) {
        return getAwaitingOpponentLabel(model, k - 1, 2 * idx, ringLabel);
      } else if (rightChild && !rightChild.isBye) {
        return getAwaitingOpponentLabel(model, k - 1, 2 * idx + 1, ringLabel);
      }
    }

    return { name: 'TBD', club: '' };
  };

  // Compute live match matrix mapping
  const playersMap: Record<string, PlayerFightInfo> = {};

  athleteList.forEach(athlete => {
    const fullKey = `${athlete.name}||${athlete.club}||${athlete.weight}`;
    const cat = categories[athlete.weight];
    const model = brackets[athlete.weight];
    const ringLabel = getRingLabel((cat?.ring) || 1);

    const bouts: PlayerFightInfo['bouts'] = [];

    if (model) {
      // Find leaf index (round 0)
      let leafIdx = -1;
      if (model.nodes[0]) {
        for (let i = 0; i < model.nodes[0].length; i++) {
          const leafNode = model.nodes[0][i];
          if (leafNode && !leafNode.isBye) {
            const nameMatch = leafNode.name.trim().toLowerCase() === athlete.name.trim().toLowerCase();
            const clubMatch = (leafNode.club || '').trim().toLowerCase() === athlete.club.trim().toLowerCase();
            if (nameMatch && (leafNode.club ? clubMatch : true)) {
              leafIdx = i;
              break;
            }
          }
        }
      }

      if (leafIdx !== -1) {
        // Path trace projection approach: Trace what bouts they will play if they keep winning!
        for (let k = 1; k <= model.numRounds; k++) {
          const i_k = Math.floor(leafIdx / (1 << k));
          const node = model.nodes[k]?.[i_k];
          if (node && typeof node.bout === 'number') {
            const i_prev = Math.floor(leafIdx / (1 << (k - 1)));
            const oppIdx = i_prev ^ 1;
            const oppNodeLabel = getAwaitingOpponentLabel(model, k - 1, oppIdx, ringLabel);
            const corner: 'C' | 'H' = (i_prev % 2 === 0) ? 'C' : 'H';

            bouts.push({
              boutNumber: node.bout,
              formattedId: getFormattedBout(ringLabel, node.bout),
              roundName: getRoundName(k, model.numRounds),
              opponentName: oppNodeLabel.name || 'TBD',
              opponentClub: oppNodeLabel.club || '',
              kRound: k,
              corner,
            });
          }
        }
      } else {
        // Fallback approach: Scan each node of the tree for current position
        for (let k = 1; k <= model.numRounds; k++) {
          const round = model.nodes[k];
          for (let i = 0; i < round.length; i++) {
            const node = round[i];
            if (typeof node.bout === 'number') {
              const oppA = model.nodes[k - 1][2 * i];
              const oppB = model.nodes[k - 1][2 * i + 1];

              const aNameMatch = oppA.name.trim().toLowerCase() === athlete.name.trim().toLowerCase();
              const aClubMatch = oppA.club.trim().toLowerCase() === athlete.club.trim().toLowerCase();
              const bNameMatch = oppB.name.trim().toLowerCase() === athlete.name.trim().toLowerCase();
              const bClubMatch = oppB.club.trim().toLowerCase() === athlete.club.trim().toLowerCase();

              const isA = aNameMatch && (oppA.club ? aClubMatch : true);
              const isB = bNameMatch && (oppB.club ? bClubMatch : true);

              if (isA || isB) {
                const matchedOppNode = isA ? oppB : oppA;
                let opponentName = matchedOppNode.name || 'TBD';
                let opponentClub = matchedOppNode.club || '';

                if (!matchedOppNode.name) {
                  const parentIdx = isA ? (2 * i + 1) : (2 * i);
                  const leftParent = model.nodes[k - 2]?.[2 * parentIdx];
                  const rightParent = model.nodes[k - 2]?.[2 * parentIdx + 1];
                  if (leftParent && rightParent && !(leftParent.isBye || rightParent.isBye)) {
                    const prevBoutNum = model.nodes[k - 1][parentIdx]?.bout;
                    if (prevBoutNum) {
                      opponentName = `Winner of Bout ${getFormattedBout(ringLabel, prevBoutNum)}`;
                    }
                  }
                }

                bouts.push({
                  boutNumber: node.bout,
                  formattedId: getFormattedBout(ringLabel, node.bout),
                  roundName: getRoundName(k, model.numRounds),
                  opponentName,
                  opponentClub,
                  kRound: k,
                  corner: isA ? 'C' : 'H',
                });
              }
            }
          }
        }
      }
    }

    // Sort athlete's bouts chronologically
    bouts.sort((b1, b2) => {
      if (b1.kRound !== b2.kRound) return b1.kRound - b2.kRound;
      return b1.boutNumber - b2.boutNumber;
    });

    playersMap[fullKey] = {
      athleteName: athlete.name,
      weightClass: athlete.weight,
      ringLabel,
      bouts,
    };
  });

  // Calculate statistics for each club dynamically based on computed fights
  const clubStatsMap: Record<string, { athleteCount: number; boutsCount: number }> = {};
  clubList.forEach(club => {
    const clubAthletes = athleteList.filter(a => a.club === club);
    let boutsCount = 0;
    clubAthletes.forEach(a => {
      const fullKey = `${a.name}||${a.club}||${a.weight}`;
      boutsCount += playersMap[fullKey]?.bouts.length || 0;
    });
    clubStatsMap[club] = {
      athleteCount: clubAthletes.length,
      boutsCount,
    };
  });

  const downloadClubReportCSV = (clubName?: string) => {
    // Generate CSV content
    const headers = [
      "Ring/Mat",
      "Division",
      "Club",
      "Competitor Name",
      "Fight 1",
      "Fight 2",
      "Fight 3",
      "Fight 4",
      "Fight 5",
      "Fight 6",
      "Fight 7"
    ];

    // Determine target athletes array based on club filter
    const targetAthletes = clubName
      ? athleteList.filter(a => a.club === clubName)
      : sortedAthletes;

    const rows = targetAthletes.map(ath => {
      const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
      const fightInfo = playersMap[athKey];
      const athleteBouts = fightInfo?.bouts || [];

      const boutColumns = Array.from({ length: 7 }).map((_, colIndex) => {
        const bout = athleteBouts[colIndex];
        if (bout) {
          const cornerLabel = bout.corner === 'H' ? 'Hong (Red)' : 'Chung (Blue)';
          return `Bout ${bout.formattedId} (${cornerLabel}) vs ${bout.opponentName}${bout.opponentClub ? ' [' + bout.opponentClub + ']' : ''}`;
        }
        return '-';
      });

      return [
        `Ring ${fightInfo?.ringLabel || 'A'}`,
        ath.weight,
        ath.club,
        ath.name,
        ...boutColumns
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    const filePrefix = clubName ? clubName.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'Tournament_Active';
    link.setAttribute("download", `${filePrefix}_Club_Fight_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerPrintReport = () => {
    window.print();
  };

  // Filter and compute matches
  const filteredAthletes = athleteList.filter(ath => {
    const matchesClub = selectedClub === 'all' || ath.club === selectedClub;
    const matchesSearch = 
      ath.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ath.club.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ath.weight.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesClub && matchesSearch;
  });

  // Group sorted athletes
  const sortedAthletes = [...filteredAthletes].sort((a, b) => {
    const clubCompare = a.club.localeCompare(b.club);
    if (clubCompare !== 0) return clubCompare;
    return a.name.localeCompare(b.name);
  });

  // Grouped results map for classic card layout style
  const groupedResults: Record<string, typeof athleteList> = {};
  filteredAthletes.forEach(ath => {
    if (!groupedResults[ath.club]) {
      groupedResults[ath.club] = [];
    }
    groupedResults[ath.club].push(ath);
  });

  const visibleClubsForCards = Object.keys(groupedResults).sort((a, b) => a.localeCompare(b));

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-6 mb-8 shadow-sm print:border-0 print:shadow-none print:p-0">
      {/* Header elements - Hidden when printing since the report is self-contained */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-slate-100 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-slate-900 text-amber-400 text-xs font-black shadow-sm">
              📋
            </span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight font-sans">
              Coach's Club Report: Fight Schedules
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
            Toggle between the photo-inspired Taekwondo grid layout or the beautiful card deck log layout below. Perfect for print!
          </p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!isPublicView && (
            <button
              type="button"
              onClick={generateAndCopyShareLink}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
              title="Generate a unique, read-only URL for this report to share with coaches"
            >
              <Share2 className="w-4 h-4 text-indigo-100" />
              <span>{shareStatus === 'copied' ? 'Link Copied!' : 'Share Public Link'}</span>
            </button>
          )}

          {/* Download button */}
          {!isPublicView && (
            <button
              type="button"
              onClick={() => downloadClubReportCSV(selectedClub !== 'all' ? selectedClub : undefined)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
              title="Download fight schedules for current filtered selection as a CSV spreadsheet"
            >
              <Download className="w-4 h-4 text-emerald-100" />
              <span>Export CSV Report</span>
            </button>
          )}

          {/* Print button */}
          {!isPublicView && (
            <button
              type="button"
              onClick={triggerPrintReport}
              className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print Active View</span>
            </button>
          )}
        </div>
      </div>

      {shareStatus === 'copied' && (
        <div className="bg-emerald-50 border border-emerald-250 p-4.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 mt-5 animate-in fade-in slide-in-from-top-2 duration-305 no-print">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-800">
              <Check className="w-4 h-4 text-emerald-600 font-bold" />
              <h4 className="text-sm font-black">Share Link Copied! Ready for Vercel/Public</h4>
            </div>
            <p className="text-xs text-slate-650 leading-relaxed max-w-2xl">
              Coaches can open this read-only report on their own phones or computers to check their players, fight numbers, and rings instantly!
            </p>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0 md:max-w-md">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="bg-white border border-slate-200 text-xs text-slate-650 rounded-xl px-3 py-2 w-full outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setShareStatus('copied');
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2.5 rounded-xl cursor-pointer active:scale-95 flex items-center justify-center shrink-0 border border-slate-250"
              title="Copy link to clipboard again"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {athleteList.length === 0 ? (
        <div className="text-center py-12 text-slate-400 font-medium my-2">
          ⚙️ Generate brackets first to establish live fight progression logs.
        </div>
      ) : (
        <div className="space-y-6 mt-5 print:mt-0">
          
          {/* LAYOUT SELECTOR & FILTER PANEL (Hidden in print mode) */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4 no-print">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              
              {/* layout switcher segmented control */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Report Layout Style:</span>
                <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setReportStyle('photo-matrix')}
                    className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reportStyle === 'photo-matrix'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span>Taekwondo Matrix Grid (Reference Photo)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportStyle('classic-cards')}
                    className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      reportStyle === 'classic-cards'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                    }`}
                  >
                    <AlignJustify className="w-3.5 h-3.5" />
                    <span>Classic Card Deck (Matchups Style)</span>
                  </button>
                </div>
              </div>

              {/* Filters Block */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Box */}
                <div className="flex items-center gap-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-1.5 w-60 transition-all">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search competitor..."
                    className="bg-transparent border-none outline-none text-xs text-slate-700 placeholder-slate-450 w-full font-medium"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Club Dropdown Filter */}
                <select
                  value={selectedClub}
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none cursor-pointer transition-all max-w-[200px]"
                >
                  <option value="all">All Registered Clubs ({clubList.length})</option>
                  {clubList.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Corner Badge Guide Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600 pt-2 border-t border-slate-200/50">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Legend Markers:</span>
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs">
                <span className="w-4.5 h-4.5 rounded bg-[#1e40af] text-white flex items-center justify-center text-[9px] font-black">C</span>
                <span className="text-slate-700">Chung (Blue corner / Top slot)</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs">
                <span className="w-4.5 h-4.5 rounded bg-[#dc2626] text-white flex items-center justify-center text-[9px] font-black">H</span>
                <span className="text-slate-700">Hong (Red corner / Bottom slot)</span>
              </div>
            </div>
          </div>

          {/* ACTIVE STYLE VIEW AREA */}
          
          {/* STYLE 1: PHOTO-MATRIX TABULAR LAYOUT */}
          {reportStyle === 'photo-matrix' && (
            sortedAthletes.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium text-sm no-print">
                No athletes found matching current filter context.
              </div>
            ) : (
              <div className="overflow-x-auto w-full border border-[#cbd5e1] rounded-xl shadow-xs print:border print:border-[#cbd5e1] print:shadow-none bg-white">
                <table className="w-full border-collapse text-left table-auto">
                  <thead>
                    <tr className="bg-[#0c2e5c] text-white print:bg-slate-100 print:text-black">
                      <th className="px-4 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-left min-w-[130px] print:text-black print:bg-slate-100">
                        Mat &amp; Category
                      </th>
                      <th className="px-4 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-left min-w-[150px] print:text-black print:bg-slate-100">
                        Club
                      </th>
                      <th className="px-4 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-left min-w-[170px] print:text-black print:bg-slate-100">
                        Competitor Name
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 1
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 2
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 3
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 4
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 5
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 6
                      </th>
                      <th className="px-2 py-3 border border-[#cbd5e1] text-[11px] font-black uppercase tracking-wider text-center min-w-[70px] print:text-black print:bg-slate-100">
                        Fight 7
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#cbd5e1]">
                    {sortedAthletes.map(ath => {
                      const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
                      const fightInfo = playersMap[athKey];
                      const athleteBouts = fightInfo?.bouts || [];

                      return (
                        <tr 
                          key={athKey} 
                          className="hover:bg-slate-50/50 transition-colors bg-white print:hover:bg-transparent duration-150"
                        >
                          {/* Ring and Division */}
                          <td className="px-4 py-3 border border-[#cbd5e1] align-middle bg-slate-50/20 print:bg-transparent">
                            <span className="font-extrabold text-[#0c2e5c] text-[11px] block uppercase tracking-wide">
                              Ring {fightInfo?.ringLabel || 'A'}
                            </span>
                            <span className="text-slate-500 text-[10px] block mt-0.5 font-bold leading-tight uppercase font-sans">
                              {ath.weight}
                            </span>
                          </td>

                          {/* Club Name */}
                          <td className="px-4 py-3 border border-[#cbd5e1] align-middle font-extrabold text-slate-900 text-xs tracking-wider uppercase">
                            {ath.club}
                          </td>

                          {/* Competitor Name */}
                          <td className="px-4 py-3 border border-[#cbd5e1] align-middle font-bold text-slate-800 text-xs tracking-wide uppercase">
                            {ath.name}
                          </td>

                          {/* Match Progression Columns */}
                          {Array.from({ length: 7 }).map((_, colIndex) => {
                            const bout = athleteBouts[colIndex];
                            if (bout) {
                              const isRed = bout.corner === 'H';
                              return (
                                <td 
                                  key={colIndex} 
                                  className="px-2 py-3 border border-[#cbd5e1] align-middle text-center group relative cursor-pointer hover:bg-amber-50/30 print:hover:bg-transparent"
                                >
                                  <div className="inline-flex items-center justify-center gap-1.5">
                                    <span className="text-[12px] font-mono font-black text-slate-950">
                                      {bout.formattedId}
                                    </span>
                                    <span 
                                      className={`w-5 h-5 text-[10px] font-black rounded flex items-center justify-center text-white shrink-0 shadow-xs ${
                                        isRed ? 'bg-[#dc2626]' : 'bg-[#1e40af]'
                                      }`}
                                      title={isRed ? 'Hong (Red) Corner - Bottom Slot' : 'Chung (Blue) Corner - Top Slot'}
                                    >
                                      {bout.corner}
                                    </span>
                                  </div>

                                  {/* Tooltip on Hover */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-900 text-white rounded-lg p-2.5 text-[10px] min-w-[200px] shadow-xl z-50 border border-slate-800 text-left no-print pointer-events-none">
                                    <div className="font-semibold text-amber-400 mb-0.5">{bout.roundName}</div>
                                    <div className="text-slate-300 font-medium">Opponent:</div>
                                    <div className="font-extrabold truncate text-white">{bout.opponentName}</div>
                                    {bout.opponentClub && (
                                      <div className="text-slate-400 mt-0.5 text-[9px] font-bold">Club: {bout.opponentClub}</div>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td 
                                key={colIndex} 
                                className="px-2 py-3 border border-[#cbd5e1] align-middle text-center text-slate-300 select-none font-medium text-xs"
                              >
                                -
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* STYLE 2: CLASSIC CARD DECK LAYOUT */}
          {reportStyle === 'classic-cards' && (
            visibleClubsForCards.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium text-sm no-print">
                No matches found matching filter credentials.
              </div>
            ) : (
              <div className="space-y-8">
                {visibleClubsForCards.map(clubName => {
                  const clubAthletes = groupedResults[clubName] || [];
                  const stats = clubStatsMap[clubName] || { athleteCount: 0, boutsCount: 0 };

                  return (
                    <div key={clubName} className="bg-slate-50/60 rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:border-0 print:shadow-none print:bg-white print:p-0 page-break-inside-avoid print:mt-4 print:mb-8">
                      {/* Club Header Row */}
                      <div className="bg-slate-900 px-5 py-3.5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:bg-slate-150 print:text-black print:border-b-2 print:border-slate-900 print:px-2 print:py-2">
                        <div className="flex items-center gap-2.5">
                          <Users className="w-5 h-5 text-amber-400 shrink-0 print:hidden" />
                          <div>
                            <h3 className="font-extrabold text-base tracking-tight text-white print:text-slate-950 font-sans print:font-black">
                              {clubName}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 print:text-slate-600">
                              Battle Card Deck &amp; Fighter Roster
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                          <button
                            type="button"
                            onClick={() => downloadClubReportCSV(clubName)}
                            className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase transition-all flex items-center gap-1.5 active:scale-95 print:hidden cursor-pointer"
                            title={`Download schedules specifically for ${clubName}`}
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Download CSV</span>
                          </button>
                          <span className="bg-slate-800 text-slate-200 px-2 rounded-md py-0.5 font-bold print:border print:border-slate-400 print:text-black print:bg-white">
                            {stats.athleteCount} Athlete{stats.athleteCount === 1 ? '' : 's'}
                          </span>
                          <span className="bg-amber-400 text-slate-950 font-black px-2.5 rounded-md py-0.5 uppercase tracking-wide print:border print:border-slate-800">
                            {stats.boutsCount} Scheduled Bout{stats.boutsCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      {/* Athlete Matchup Cards Grid */}
                      <div className="p-4 md:p-5 divide-y divide-slate-200/80 bg-white print:px-1 print:py-2">
                        {clubAthletes.map(ath => {
                          const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
                          const fightInfo = playersMap[athKey];
                          const athleteBouts = fightInfo?.bouts || [];

                          return (
                            <div key={athKey} className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-start justify-between gap-4 print:py-3 print:page-break-inside-avoid">
                              {/* Left column: Competitor Info */}
                              <div className="min-w-[200px]">
                                <p className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 font-sans print:text-black">
                                  <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0 print:hidden" />
                                  {ath.name}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="bg-slate-105 hover:bg-slate-200/80 text-slate-800 font-bold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wide border border-slate-200/60 print:bg-white print:border print:border-slate-300">
                                    {ath.weight}
                                  </span>
                                  <span className="text-slate-450 text-[11px] font-bold font-mono">
                                    {fightInfo?.ringLabel ? `Mat / Ring: ${fightInfo.ringLabel}` : 'No allocation'}
                                  </span>
                                </div>
                              </div>

                              {/* Right column: Bouts list cards */}
                              <div className="flex-1">
                                {athleteBouts.length === 0 ? (
                                  <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-3 flex items-center gap-2 max-w-md print:bg-white print:border-dashed">
                                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                                    <div>
                                      <p className="text-[11px] font-bold text-slate-800 leading-snug">
                                        Waiting / Bye Bye Allocation
                                      </p>
                                      <p className="text-[9px] text-slate-500 mt-0.5">
                                        This competitor starts the bracket tree with an initial Bye slot.
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {athleteBouts.map(bout => {
                                      const isRed = bout.corner === 'H';
                                      return (
                                        <div
                                          key={bout.formattedId}
                                          className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs hover:border-amber-500 transition-colors flex flex-col justify-between print:border print:border-slate-300"
                                        >
                                          <div>
                                            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                                              <div className="flex items-center gap-1.5">
                                                <span className="bg-slate-900 text-amber-400 text-[10px] font-mono font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                  Bout {bout.formattedId}
                                                </span>
                                                <span className="text-[10px] bg-slate-100 font-bold text-slate-600 px-1.5 py-0.5 rounded uppercase font-mono">
                                                  {bout.roundName}
                                                </span>
                                              </div>
                                              
                                              {/* Corner Marker Badge */}
                                              <span className={`px-2 py-0.5 rounded font-black text-[9px] text-white flex items-center gap-1 uppercase ${
                                                isRed ? 'bg-[#dc2626]' : 'bg-[#1e40af]'
                                              }`}>
                                                Corner: {bout.corner}
                                              </span>
                                            </div>

                                            {/* Vs text block */}
                                            <p className="text-xs font-extrabold text-slate-800 mt-2.5 flex items-center gap-1 print:text-black">
                                              <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wide">Vs</span>{' '}
                                              {bout.opponentName}
                                            </p>

                                            {bout.opponentClub && !bout.opponentName.startsWith('Winner of') && (
                                              <p className="text-[10px] text-slate-505 font-bold italic mt-1 flex items-center gap-1 pl-4">
                                                <span>🏠</span>
                                                <span>{bout.opponentClub}</span>
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

        </div>
      )}
    </section>
  );
};
