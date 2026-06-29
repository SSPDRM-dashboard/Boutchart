import React, { useState } from 'react';
import { Users, Search, Printer, HelpCircle, ShieldAlert, CheckCircle2, Flame, AlignJustify, Grid, Award, Download, Share2, Copy, Check, Trash2 } from 'lucide-react';
import { Athlete, WeightCategory, BracketModel } from '../types';
import { compressToGzipBase64 } from '../utils/compression';

const safeConfirm = (message: string): boolean => {
  try {
    return window.confirm(message);
  } catch (e) {
    console.warn('window.confirm blocked or unavailable in this environment, auto-confirming action.', e);
    return true;
  }
};

interface ClubReportPanelProps {
  categories: Record<string, WeightCategory>;
  brackets: Record<string, BracketModel>;
  roster: Athlete[];
  ringLabelFormat: 'number' | 'letter';
  boutLabelFormat?: 'alpha-2' | 'thousands-3';
  tournamentName?: string;
  isPublicView?: boolean;
  onUpdateStandings?: (catKey: string, nextStandings: string[]) => void;
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
  boutLabelFormat = 'alpha-2',
  tournamentName = '',
  isPublicView = false,
  onUpdateStandings,
}) => {
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOnlyScheduled, setShowOnlyScheduled] = useState<boolean>(true);
  
  // Choose between 'photo-matrix', 'classic-cards', or 'medal-standings'
  const [reportStyle, setReportStyle] = useState<'photo-matrix' | 'classic-cards' | 'medal-standings'>('photo-matrix');
  const [expandedClub, setExpandedClub] = useState<string | null>(null);

  const [shareStatus, setShareStatus] = useState<'silent' | 'loading' | 'copied' | 'error'>('silent');
  const [shareUrl, setShareUrl] = useState('');

  const copyToClipboardFallback = (text: string): boolean => {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const success = document.execCommand('copy');
      document.body.removeChild(el);
      return success;
    } catch (err) {
      console.warn('Fallback copying failed', err);
      return false;
    }
  };

  const copyText = (text: string) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).catch(e => {
        console.warn('Clipboard write access blocked, using fallback', e);
        copyToClipboardFallback(text);
      });
    } else {
      copyToClipboardFallback(text);
    }
  };

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
          copyText(shareLink);
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
            copyText(shareLink);
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

  // 2. Bout ID format helper (e.g. A02 / 1001)
  const getFormattedBout = (ring: string | number, boutNumber: number | undefined): string => {
    if (boutNumber === undefined) return '';

    let ringNum = 1;
    if (typeof ring === 'number') {
      ringNum = ring;
    } else {
      const cleaned = String(ring).trim().toLowerCase();
      const numMatch = cleaned.match(/\d+$/);
      if (numMatch) {
        ringNum = parseInt(numMatch[0], 10);
      } else {
        const letterMatch = cleaned.match(/[a-z]$/);
        if (letterMatch) {
          ringNum = letterMatch[0].charCodeAt(0) - 96;
        }
      }
    }

    if (isNaN(ringNum) || ringNum < 1) ringNum = 1;

    if (boutLabelFormat === 'thousands-3') {
      const pad = String(boutNumber).padStart(3, '0');
      return `${ringNum}${pad}`;
    } else {
      const letter = String.fromCharCode(64 + ringNum);
      const pad = String(boutNumber).padStart(2, '0');
      return `${letter}${pad}`;
    }
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
    const catKey = a.weight?.trim() || 'Unspecified';
    const cat = categories[catKey];
    const bracketModel = brackets[catKey];
    
    // If the category has only 1 player and they are removed from standings/report
    if (cat && cat.count === 1) {
      if (bracketModel && bracketModel.standings?.[0] === '_REMOVED_') {
        return; // Exclude from overall report
      }
    }

    const key = `${(a.name || '').trim().toLowerCase()}||${(a.club || '').trim().toLowerCase()}||${(a.weight || '').trim().toLowerCase()}`;
    if (!athleteKeySet.has(key)) {
      athleteKeySet.add(key);
      athleteList.push({
        name: (a.name || '').trim(),
        club: (a.club || '').trim() || 'Unassigned Club',
        weight: (a.weight || '').trim()
      });
    }
  });

  // Add from bracket leaf nodes to cover manual changes/overrides
  Object.keys(brackets).forEach(catKey => {
    const model = brackets[catKey];
    const cat = categories[catKey];
    
    // If the category has only 1 player and they are removed from standings/report
    if (cat && cat.count === 1) {
      if (model && model.standings?.[0] === '_REMOVED_') {
        return; // Exclude from overall report
      }
    }

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
    const ringLabel = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';

    const bouts: PlayerFightInfo['bouts'] = [];

    if (model) {
      // Find leaf index (round 0)
      let leafIdx = -1;
      if (model.nodes[0]) {
        for (let i = 0; i < model.nodes[0].length; i++) {
          const leafNode = model.nodes[0][i];
          if (leafNode && !leafNode.isBye && leafNode.name) {
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
          if (!round) continue;
          for (let i = 0; i < round.length; i++) {
            const node = round[i];
            if (typeof node.bout === 'number') {
              const prevRound = model.nodes[k - 1];
              if (!prevRound) continue;
              const oppA = prevRound[2 * i];
              const oppB = prevRound[2 * i + 1];

              const aNameMatch = oppA && oppA.name ? oppA.name.trim().toLowerCase() === athlete.name.trim().toLowerCase() : false;
              const aClubMatch = oppA && oppA.club ? oppA.club.trim().toLowerCase() === athlete.club.trim().toLowerCase() : false;
              const bNameMatch = oppB && oppB.name ? oppB.name.trim().toLowerCase() === athlete.name.trim().toLowerCase() : false;
              const bClubMatch = oppB && oppB.club ? oppB.club.trim().toLowerCase() === athlete.club.trim().toLowerCase() : false;

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
        fightInfo?.ringLabel === 'Unassigned' ? 'Unassigned' : `Ring ${fightInfo?.ringLabel || 'A'}`,
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

  // Compute Medal Standings dynamically
  interface ClubMedalEntry {
    clubName: string;
    gold: number;
    silver: number;
    bronze: number;
    total: number;
    points: number;
    competitors: number;
    details: Array<{
      athleteName: string;
      medalType: 'gold' | 'silver' | 'bronze';
      division: string;
      slotIdx: number;
    }>;
  }

  const handleRemoveMedalist = (catKey: string, slotIdx: number) => {
    if (!onUpdateStandings) return;
    const model = brackets[catKey];
    if (!model) return;
    const currentStandings = [
      model.standings?.[0] || '',
      model.standings?.[1] || '',
      model.standings?.[2] || '',
      model.standings?.[3] || '',
    ];
    currentStandings[slotIdx] = '_REMOVED_';
    onUpdateStandings(catKey, currentStandings);
  };

  const computeMedalStandings = (): ClubMedalEntry[] => {
    const clubMap: Record<string, Omit<ClubMedalEntry, 'clubName'>> = {};

    // Initialize all clubs found in the tournament
    clubList.forEach(club => {
      clubMap[club] = {
        gold: 0,
        silver: 0,
        bronze: 0,
        total: 0,
        points: 0,
        competitors: athleteList.filter(a => a.club === club).length,
        details: []
      };
    });

    const findClubForAthleteInDivision = (athName: string, divName: string): string => {
      if (!athName) return '';
      const lowerName = athName.trim().toLowerCase();
      const lowerDiv = divName.trim().toLowerCase();
      const matchDivName = athleteList.find(a => a.name.toLowerCase() === lowerName && a.weight.toLowerCase() === lowerDiv);
      if (matchDivName) return matchDivName.club;
      const matchNameOnly = athleteList.find(a => a.name.toLowerCase() === lowerName);
      if (matchNameOnly) return matchNameOnly.club;
      return 'Unassigned Club';
    };

    // Calculate per bracket
    Object.keys(brackets).forEach(catKey => {
      const model = brackets[catKey];
      if (!model) return;

      const currentStandings = [
        model.standings?.[0] || '',
        model.standings?.[1] || '',
        model.standings?.[2] || '',
        model.standings?.[3] || '',
      ];
      const numRounds = model.numRounds;

      // 1st place (Gold)
      let goldName = currentStandings[0];
      if (goldName === '_REMOVED_') {
        goldName = '';
      } else if (!goldName && model.nodes[numRounds]?.[0]?.name) {
        goldName = model.nodes[numRounds][0].name;
      }
      
      // 2nd place (Silver)
      let silverName = currentStandings[1];
      if (silverName === '_REMOVED_') {
        silverName = '';
      } else if (!silverName && model.nodes[numRounds]?.[0]?.name && (model.nodes[numRounds - 1]?.[0]?.checked || model.nodes[numRounds - 1]?.[1]?.checked)) {
        silverName = model.nodes[numRounds - 1][0].checked ? model.nodes[numRounds - 1][1].name : model.nodes[numRounds - 1][0].name;
      }

      // 3rd place 1 (Bronze)
      let bronze1Name = currentStandings[2];
      if (bronze1Name === '_REMOVED_') {
        bronze1Name = '';
      } else if (!bronze1Name && numRounds >= 2) {
        const semi0Winner = model.nodes[numRounds - 1]?.[0]?.name;
        if (semi0Winner && model.nodes[numRounds - 2]?.[0] && model.nodes[numRounds - 2]?.[1]) {
          bronze1Name = model.nodes[numRounds - 2][0].checked ? model.nodes[numRounds - 2][1].name : model.nodes[numRounds - 2][0].name;
        }
      }

      // 3rd place 2 (Bronze)
      let bronze2Name = currentStandings[3];
      if (bronze2Name === '_REMOVED_') {
        bronze2Name = '';
      } else if (!bronze2Name && numRounds >= 2) {
        const semi1Winner = model.nodes[numRounds - 1]?.[1]?.name;
        if (semi1Winner && model.nodes[numRounds - 2]?.[2] && model.nodes[numRounds - 2]?.[3]) {
          bronze2Name = model.nodes[numRounds - 2][2].checked ? model.nodes[numRounds - 2][3].name : model.nodes[numRounds - 2][2].name;
        }
      }

      const processMedal = (name: string, type: 'gold' | 'silver' | 'bronze', slotIdx: number) => {
        if (!name || name === 'BYE') return;
        const clubName = findClubForAthleteInDivision(name, catKey);
        if (!clubName) return;

        // Ensure club exists in map
        if (!clubMap[clubName]) {
          clubMap[clubName] = {
            gold: 0,
            silver: 0,
            bronze: 0,
            total: 0,
            points: 0,
            competitors: athleteList.filter(a => a.club === clubName).length,
            details: []
          };
        }

        const entry = clubMap[clubName];
        if (type === 'gold') {
          entry.gold += 1;
          entry.points += 5;
        } else if (type === 'silver') {
          entry.silver += 1;
          entry.points += 3;
        } else if (type === 'bronze') {
          entry.bronze += 1;
          entry.points += 1;
        }
        entry.total += 1;
        entry.details.push({ athleteName: name, medalType: type, division: catKey, slotIdx });
      };

      processMedal(goldName, 'gold', 0);
      processMedal(silverName, 'silver', 1);
      processMedal(bronze1Name, 'bronze', 2);
      processMedal(bronze2Name, 'bronze', 3);
    });

    return Object.entries(clubMap)
      .map(([clubName, values]) => ({
        clubName,
        ...values
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        if (b.bronze !== a.bronze) return b.bronze - a.bronze;
        return a.clubName.localeCompare(b.clubName);
      });
  };

  const downloadClubMedalStandingsCSV = () => {
    const headers = [
      "Rank",
      "Club Name",
      "Registered Competitors",
      "Gold Medals",
      "Silver Medals",
      "Bronze Medals",
      "Total Medals",
      "Championship Points (Gold=5, Silver=3, Bronze=1)"
    ];

    const standings = computeMedalStandings();
    const rows = standings.map((club, index) => [
      index + 1,
      club.clubName,
      club.competitors,
      club.gold,
      club.silver,
      club.bronze,
      club.total,
      club.points
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${tournamentName || 'Tournament'}_Club_Medal_Standings.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter and compute matches
  const filteredAthletes = athleteList.filter(ath => {
    const matchesClub = selectedClub === 'all' || ath.club === selectedClub;
    const matchesSearch = 
      ath.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ath.club.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ath.weight.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesScheduled = !showOnlyScheduled || !!brackets[ath.weight];
    return matchesClub && matchesSearch && matchesScheduled;
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
  const medalStandings = computeMedalStandings();

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
              onClick={() => {
                if (reportStyle === 'medal-standings') {
                  downloadClubMedalStandingsCSV();
                } else {
                  downloadClubReportCSV(selectedClub !== 'all' ? selectedClub : undefined);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
              title={reportStyle === 'medal-standings' ? "Download overall medal standings of clubs as a CSV spreadsheet" : "Download fight schedules for current filtered selection as a CSV spreadsheet"}
            >
              <Download className="w-4 h-4 text-emerald-100" />
              <span>{reportStyle === 'medal-standings' ? 'Export Medal Standings' : 'Export CSV Report'}</span>
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
                copyText(shareUrl);
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
                  
                  {!isPublicView && (
                    <>
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
                      <button
                        type="button"
                        onClick={() => setReportStyle('medal-standings')}
                        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          reportStyle === 'medal-standings'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5 text-amber-500" />
                        <span>🏆 Club Medal Standings &amp; Points</span>
                      </button>
                    </>
                  )}
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
                  {clubList.map(name => {
                    const stats = medalStandings.find(s => s.clubName === name);
                    const ptsSuffix = stats ? ` (${stats.points} pts)` : ' (0 pts)';
                    return (
                      <option key={name} value={name}>
                        {name}{ptsSuffix}
                      </option>
                    );
                  })}
                </select>

                {/* Only Show Scheduled / Toggle */}
                {reportStyle !== 'medal-standings' && (
                  <button
                    type="button"
                    onClick={() => setShowOnlyScheduled(!showOnlyScheduled)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer select-none active:scale-95 ${
                      showOnlyScheduled
                        ? 'bg-amber-150 border-amber-300 text-amber-950 font-black'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${showOnlyScheduled ? 'bg-amber-600 animate-pulse' : 'bg-slate-400'}`} />
                    <span>{showOnlyScheduled ? 'Scheduled Fights Only' : 'Show All Registered'}</span>
                  </button>
                )}
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
                            <span className={`font-extrabold text-[11px] block uppercase tracking-wide ${
                              fightInfo?.ringLabel === 'Unassigned' ? 'text-slate-400 font-bold' : 'text-[#0c2e5c]'
                            }`}>
                              {fightInfo?.ringLabel === 'Unassigned' ? 'Unassigned' : `Ring ${fightInfo?.ringLabel || 'A'}`}
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
                            <h3 className="font-extrabold text-base tracking-tight text-white print:text-slate-950 font-sans print:font-black flex flex-wrap items-center gap-2">
                              <span>{clubName}</span>
                              {(() => {
                                const stats = medalStandings.find(s => s.clubName === clubName);
                                if (!stats || stats.points === 0) return null;
                                return (
                                  <span className="bg-amber-450/15 text-amber-300 border border-amber-400/30 text-[10px] uppercase font-black px-1.5 py-0.5 rounded shadow-2xs leading-none">
                                    🏆 {stats.points} pts
                                  </span>
                                );
                              })()}
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
                                  <span className={`text-[11px] font-bold font-mono ${
                                    fightInfo?.ringLabel === 'Unassigned' ? 'text-slate-400' : 'text-slate-500'
                                  }`}>
                                    {fightInfo?.ringLabel === 'Unassigned' ? 'No Allocation' : `Mat / Ring: ${fightInfo?.ringLabel || 'A'}`}
                                  </span>
                                </div>
                              </div>

                              {/* Right column: Bouts list cards */}
                              <div className="flex-1">
                                {athleteBouts.length === 0 ? (
                                  (() => {
                                    const hasBracket = !!brackets[ath.weight];
                                    if (!hasBracket) {
                                      return (
                                        <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-3 flex items-center gap-2 max-w-md print:bg-white print:border-dashed">
                                          <ShieldAlert className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                                          <div>
                                            <p className="text-[11px] font-bold text-slate-500 leading-snug">
                                              No Bracket Drawn Yet
                                            </p>
                                            <p className="text-[9px] text-slate-400 mt-0.5">
                                              This category has not been drawn or assigned a competition ring to generate combat matching.
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="bg-slate-50 border border-slate-200/65 rounded-xl p-3 flex items-center gap-2 max-w-md print:bg-white print:border-dashed">
                                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                                        <div>
                                          <p className="text-[11px] font-bold text-slate-800 leading-snug">
                                            Waiting / Bye Allocation
                                          </p>
                                          <p className="text-[9px] text-slate-500 mt-0.5">
                                            This competitor starts the bracket tree with an initial Bye slot.
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })()
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
                                              <p className="text-[10px] text-slate-500 font-bold italic mt-1 flex items-center gap-1 pl-4">
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

          {/* STYLE 3: CLUB MEDAL STANDINGS LAYOUT */}
          {reportStyle === 'medal-standings' && (() => {
            const standings = medalStandings;
            
            // Total summary stats
            const totalGolds = standings.reduce((sum, item) => sum + item.gold, 0);
            const totalSilvers = standings.reduce((sum, item) => sum + item.silver, 0);
            const totalBronzes = standings.reduce((sum, item) => sum + item.bronze, 0);
            const topClub = standings[0];

            return (
              <div className="space-y-6">
                {/* Visual scorecard metrics summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
                  <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="bg-[#b45309] text-white p-2.5 rounded-lg shadow-sm">
                      <Award className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Overall Leader</span>
                      <p className="font-extrabold text-slate-900 text-sm truncate max-w-[150px]" title={topClub?.clubName || 'N/A'}>
                        {topClub ? topClub.clubName : 'N/A'}
                      </p>
                      <p className="text-[11px] font-sans text-slate-500 font-bold mt-0.5">
                        {topClub ? `${topClub.points} Championship Pts` : 'No points registered'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="bg-amber-400 text-slate-950 p-2.5 rounded-lg shadow-sm">
                      <span className="font-black text-sm">🥇</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Gold Medals</span>
                      <p className="font-extrabold text-slate-900 text-sm leading-tight">
                        {totalGolds} Count
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono">5 Pts each</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="bg-slate-350 text-slate-800 p-2.5 rounded-lg shadow-sm">
                      <span className="font-black text-sm">🥈</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Silver Medals</span>
                      <p className="font-extrabold text-slate-900 text-sm leading-tight">
                        {totalSilvers} Count
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono">3 Pts each</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="bg-amber-700/80 text-white p-2.5 rounded-lg shadow-sm">
                      <span className="font-black text-sm">🥉</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Bronze Medals</span>
                      <p className="font-extrabold text-slate-900 text-sm leading-tight">
                        {totalBronzes} Count
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono">1 Pt each</p>
                    </div>
                  </div>
                </div>

                {/* Main Standings Table layout */}
                <div className="overflow-hidden border border-slate-200 rounded-xl shadow-xs bg-white">
                  <table className="w-full border-collapse text-left table-auto">
                    <thead>
                      <tr className="bg-slate-900 text-white print:bg-slate-100 print:text-black border-b border-slate-250">
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-16 print:text-black">Rank</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-left print:text-black">Club Affiliation Name</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-24 print:text-black">Delegation</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-24 print:text-black text-amber-500">🥇 Gold</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-24 print:text-black text-slate-350">🥈 Silver</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-24 print:text-black text-amber-700">🥉 Bronze</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-28 print:text-black">Total Medals</th>
                        <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-center w-32 print:text-black">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {standings.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-10 text-slate-400 font-medium text-sm">
                            No clubs or competitors found to calculate standings.
                          </td>
                        </tr>
                      ) : (
                        standings.map((club, index) => {
                          const isExpanded = expandedClub === club.clubName;
                          const showArrow = club.details.length > 0;
                          
                          // Badge styling for top 3
                          let rankBadge = <span className="font-mono font-black text-slate-500 text-xs">{index + 1}</span>;
                          if (index === 0) rankBadge = <span className="text-sm shadow-2xs font-sans w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center font-black text-amber-700 border border-amber-300">🥇</span>;
                          else if (index === 1) rankBadge = <span className="text-sm shadow-2xs font-sans w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-700 border border-slate-300">🥈</span>;
                          else if (index === 2) rankBadge = <span className="text-sm shadow-2xs font-sans w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center font-black text-amber-800 border border-amber-200">🥉</span>;

                          return (
                            <React.Fragment key={club.clubName}>
                              {/* Main row */}
                              <tr 
                                onClick={() => showArrow && setExpandedClub(isExpanded ? null : club.clubName)}
                                className={`transition-all duration-150 relative select-none hover:bg-slate-50/50 ${
                                  showArrow ? 'cursor-pointer' : ''
                                } ${isExpanded ? 'bg-amber-50/10' : ''}`}
                              >
                                {/* Rank */}
                                <td className="px-4 py-3 align-middle text-center">
                                  <div className="flex items-center justify-center">
                                    {rankBadge}
                                  </div>
                                </td>

                                {/* Club name & details toggler */}
                                <td className="px-4 py-3 align-middle font-extrabold text-slate-900 text-xs tracking-wider uppercase">
                                  <div className="flex items-center gap-2">
                                    <span>{club.clubName || 'Unattached / Independent'}</span>
                                    {showArrow && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-widest leading-none no-print group-hover:bg-slate-200">
                                        {club.details.length} Medalist{club.details.length === 1 ? '' : 's'} {isExpanded ? '▲' : '▼'}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Competitors count */}
                                <td className="px-4 py-3 align-middle text-center text-xs font-semibold text-slate-500">
                                  {club.competitors} Athlete{club.competitors === 1 ? '' : 's'}
                                </td>

                                {/* Medals breakdown */}
                                <td className="px-4 py-3 align-middle text-center text-xs font-black text-slate-950">
                                  {club.gold > 0 ? (
                                    <span className="bg-amber-50 text-amber-800 border border-amber-200 py-0.5 px-2 rounded-md font-bold text-[10px]">
                                      {club.gold} Gold
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold">-</span>
                                  )}
                                </td>

                                <td className="px-4 py-3 align-middle text-center text-xs font-black text-slate-950">
                                  {club.silver > 0 ? (
                                    <span className="bg-slate-50 text-slate-800 border border-slate-200 py-0.5 px-2 rounded-md font-bold text-[10px]">
                                      {club.silver} Silver
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold">-</span>
                                  )}
                                </td>

                                <td className="px-4 py-3 align-middle text-center text-xs font-black text-slate-950">
                                  {club.bronze > 0 ? (
                                    <span className="bg-amber-50/50 text-amber-900 border border-amber-200/50 py-0.5 px-2 rounded-md font-bold text-[10px]">
                                      {club.bronze} Bronze
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 font-bold">-</span>
                                  )}
                                </td>

                                {/* Total medals count */}
                                <td className="px-4 py-3 align-middle text-center text-xs font-bold text-slate-700">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded font-extrabold text-[11px]">
                                    {club.total}
                                  </span>
                                </td>

                                {/* Championship Points */}
                                <td className="px-4 py-3 align-middle text-center">
                                  <span className="text-xs bg-slate-900 text-amber-400 font-black px-3 py-1 rounded-lg shadow-2xs font-mono select-none">
                                    {club.points} pts
                                  </span>
                                </td>
                              </tr>

                              {/* Expandable medal detail list */}
                              {isExpanded && showArrow && (
                                <tr className="bg-slate-50/40 print:bg-transparent">
                                  <td colSpan={8} className="p-0 border-t border-slate-100">
                                    <div className="px-8 py-3.5 divide-y divide-slate-100 text-left border-l-4 border-amber-500 bg-slate-50/20 max-w-full">
                                      <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center justify-between">
                                        <span>Medalist roster breakdown for {club.clubName}</span>
                                        <span className="font-mono text-slate-500 italic">Gold: 5 points · Silver: 3 points · Bronze: 1 point</span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1.5 pb-2.5">
                                        {club.details.map((med, dIdx) => {
                                          let medalBadge = <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-2xs shrink-0">🥇 Gold</span>;
                                          if (med.medalType === 'silver') {
                                            medalBadge = <span className="bg-slate-100 text-slate-800 border border-slate-300 text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-2xs shrink-0">🥈 Silver</span>;
                                          } else if (med.medalType === 'bronze') {
                                            medalBadge = <span className="bg-amber-50 text-amber-900 border border-amber-200/50 text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-2xs shrink-0">🥉 Bronze</span>;
                                          }

                                          return (
                                            <div key={dIdx} className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between shadow-2xs hover:border-amber-400/65 transition-all">
                                              <div className="min-w-0 pr-2">
                                                <p className="font-extrabold text-xs text-slate-800 truncate uppercase tracking-wider">{med.athleteName}</p>
                                                <p className="text-[9px] text-slate-500 font-extrabold uppercase mt-1 tracking-wider">{med.division}</p>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                {medalBadge}
                                                {!isPublicView && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (safeConfirm(`Are you sure you want to remove ${med.athleteName} from the medal standings in ${categories[med.division]?.name || med.division}?`)) {
                                                        handleRemoveMedalist(med.division, med.slotIdx);
                                                      }
                                                    }}
                                                    className="p-1.5 text-rose-600 hover:text-white hover:bg-rose-600 border border-transparent rounded bg-slate-50 hover:border-rose-650 transition-all cursor-pointer no-print flex items-center justify-center"
                                                    title="Strip medalist status from this bracket slot"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Helpful instructions for directors / coaches */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs leading-relaxed space-y-1.5 shadow-3xs max-w-2xl no-print">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>How Overall Medal Standings work:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] font-medium text-slate-500">
                    <li>Rankings are computed dynamically from each weight division bracket's gold, runner-up, and dual-bronze slots.</li>
                    <li><strong>Custom Podium Override:</strong> You can drag/drop and manually override podium slots inside any individual category's bracket canvas to immediately update these overall tallies.</li>
                    <li><strong>Championship Points Equation:</strong> Clubs earn <strong className="font-bold text-slate-700">5 pts</strong> per Gold medal, <strong className="font-bold text-slate-700">3 pts</strong> per Silver, and <strong className="font-bold text-slate-700">1 pt</strong> per Bronze.</li>
                    <li>Expand any club row above to see exactly which divisions and athletes secure their position!</li>
                  </ul>
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </section>
  );
};
