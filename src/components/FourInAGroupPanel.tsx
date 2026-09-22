import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Users, Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  RefreshCw, Search, Filter, Printer, ArrowRight, Sparkles, Copy, 
  Plus, Trash2, ShieldCheck, Dumbbell, MoveRight, Layers, Eye, FileText, Check, HelpCircle,
  GripVertical, ArrowLeftRight, RotateCcw, PlusCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  FourGroupParticipant, FourGroup, CategoryGroupResult, FourGroupOptions,
  generateFourGroupsForAllCategories, generateFourGroupsForCategory, flattenGroupsToRows, 
  normalizeClub, isIndependentClub, recalculateCategoryResult, recalculateGroupConflicts,
  formatCategoryWithGroup
} from '../utils/fourGroupAlgorithm';
import { Athlete, WeightCategory, BracketModel } from '../types';

interface FourInAGroupPanelProps {
  currentRoster?: Athlete[];
  tournamentName?: string;
  onPushToTournament?: (categories: Record<string, WeightCategory>, roster: Athlete[]) => void;
}

// Generates consistent soft pastel badge colors for clubs so club separation is immediately visual
const CLUB_COLOR_PALETTES = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-amber-50 text-amber-800 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-teal-50 text-teal-700 border-teal-200',
  'bg-orange-50 text-orange-800 border-orange-200',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
];

function getClubColor(clubName: string): string {
  if (isIndependentClub(clubName)) {
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }
  let hash = 0;
  for (let i = 0; i < clubName.length; i++) {
    hash = clubName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % CLUB_COLOR_PALETTES.length;
  return CLUB_COLOR_PALETTES[idx];
}

// Built-in demonstration datasets
const DEMO_EXACT_SPEC_DATA: FourGroupParticipant[] = [
  { id: '1', name: 'Ali', category: 'Male 12–14', club: 'Club A' },
  { id: '2', name: 'John', category: 'Male 12–14', club: 'Club B' },
  { id: '3', name: 'Kumar', category: 'Male 12–14', club: 'Club C' },
  { id: '4', name: 'David', category: 'Male 12–14', club: 'Club D' },
  { id: '5', name: 'Ahmad (A2)', category: 'Male Cadet', club: 'Club A' },
  { id: '6', name: 'Bryan (B2)', category: 'Male Cadet', club: 'Club B' },
  { id: '7', name: 'Chen (C2)', category: 'Male Cadet', club: 'Club C' },
  { id: '8', name: 'Danial (D2)', category: 'Male Cadet', club: 'Club D' },
  { id: '9', name: 'Azlan (A3)', category: 'Male Cadet', club: 'Club A' },
  { id: '10', name: 'Ben (B3)', category: 'Male Cadet', club: 'Club B' },
  { id: '11', name: 'Chong (C3)', category: 'Male Cadet', club: 'Club C' },
  { id: '12', name: 'Darren (D3)', category: 'Male Cadet', club: 'Club D' },
  { id: '13', name: 'Adam (A1)', category: 'Male Cadet', club: 'Club A' },
  { id: '14', name: 'Bob (B1)', category: 'Male Cadet', club: 'Club B' },
  { id: '15', name: 'Charlie (C1)', category: 'Male Cadet', club: 'Club C' },
  { id: '16', name: 'Dylan (D1)', category: 'Male Cadet', club: 'Club D' },
];

export const FourInAGroupPanel: React.FC<FourInAGroupPanelProps> = ({
  currentRoster = [],
  tournamentName = 'Tournament',
  onPushToTournament
}) => {
  const [participants, setParticipants] = useState<FourGroupParticipant[]>(DEMO_EXACT_SPEC_DATA);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'manage'>('upload');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'print'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [pasteText, setPasteText] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ text: string; type: 'ok' | 'err' | 'info' } | null>({
    text: 'Preloaded example: 16 athletes across 2 categories demonstrating 4-pax club distribution.',
    type: 'info'
  });

  // Algorithm options
  const [options, setOptions] = useState<FourGroupOptions>({
    maxPax: 4,
    balanceGroups: true,
    allowExtraGroupsForClubs: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Grouped results stored in state to support interactive drag-and-drop moves and swaps
  const [groupedResults, setGroupedResults] = useState<Record<string, CategoryGroupResult>>(() => {
    return generateFourGroupsForAllCategories(DEMO_EXACT_SPEC_DATA, {
      maxPax: 4,
      balanceGroups: true,
      allowExtraGroupsForClubs: false
    });
  });

  // Drag and drop tracking
  const [draggedItem, setDraggedItem] = useState<{
    participantId: string;
    sourceCategory: string;
    sourceGroupId: string;
    athlete: FourGroupParticipant;
  } | null>(null);

  const [dragOverTarget, setDragOverTarget] = useState<{
    category: string;
    groupId: string;
    targetParticipantId?: string;
  } | null>(null);

  const [hasManualChanges, setHasManualChanges] = useState(false);

  // Category names retained so that clearing/deleting competitors keeps category names intact
  const [retainedCategories, setRetainedCategories] = useState<string[]>(() => {
    return Array.from(new Set(DEMO_EXACT_SPEC_DATA.map(p => p.category)));
  });

  const [clearJobModalOpen, setClearJobModalOpen] = useState(false);
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Keep retainedCategories in sync with any categories present in participants
  useEffect(() => {
    const catsFromParts = Array.from(new Set(participants.map(p => p.category).filter(Boolean)));
    if (catsFromParts.length > 0) {
      setRetainedCategories(prev => Array.from(new Set([...prev, ...catsFromParts])));
    }
  }, [participants]);

  // Automatically synchronize when raw participants list, options, or retainedCategories change
  useEffect(() => {
    const generated = generateFourGroupsForAllCategories(participants, options);

    // Ensure every retained category remains in the result even if it currently has 0 participants
    retainedCategories.forEach(catName => {
      if (!generated[catName]) {
        generated[catName] = {
          category: catName,
          totalParticipants: 0,
          totalGroups: 1,
          groups: [
            {
              id: `${catName}__grp_1__retained`,
              groupNumber: 1,
              groupName: 'Group 1',
              category: catName,
              categoryWithGroup: formatCategoryWithGroup(catName, 'Group 1'),
              participants: [],
              hasClubConflict: false,
              conflictingClubs: []
            }
          ],
          hasConflict: false,
          clubStats: []
        };
      }
    });

    setGroupedResults(generated);
    setHasManualChanges(false);
  }, [participants, options, retainedCategories]);

  // Total summary statistics
  const summaryStats = useMemo(() => {
    let totalAthletes = 0;
    let totalGroups = 0;
    let totalConflicts = 0;
    const allClubs = new Set<string>();

    Object.values(groupedResults).forEach((res: CategoryGroupResult) => {
      totalAthletes += res.totalParticipants;
      totalGroups += res.totalGroups;
      res.groups.forEach(g => {
        if (g.hasClubConflict) totalConflicts++;
        g.participants.forEach(p => {
          if (p.club && !isIndependentClub(p.club)) allClubs.add(p.club.trim());
        });
      });
    });

    const categoryCount = Object.keys(groupedResults).length;

    return {
      totalAthletes,
      totalGroups,
      totalConflicts,
      totalClubs: allClubs.size,
      categoryCount
    };
  }, [groupedResults]);

  // Flattened table rows for the Master Table view
  const tableRows = useMemo(() => {
    return flattenGroupsToRows(groupedResults);
  }, [groupedResults]);

  // Filtered categories and table rows
  const filteredCategoryKeys = useMemo(() => {
    const keys = Object.keys(groupedResults);
    if (selectedCategoryFilter === 'all') {
      if (!searchQuery.trim()) return keys;
      const q = searchQuery.toLowerCase();
      return keys.filter(cat => {
        if (cat.toLowerCase().includes(q)) return true;
        const res = groupedResults[cat];
        return res.groups.some(g => 
          g.groupName.toLowerCase().includes(q) ||
          g.participants.some(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q))
        );
      });
    }
    return keys.filter(k => k === selectedCategoryFilter);
  }, [groupedResults, selectedCategoryFilter, searchQuery]);

  // Parse files (Excel .xlsx / .xls, or CSV / TSV)
  const processUploadedFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (!rawRows || rawRows.length === 0) {
        setStatusFeedback({ text: 'The uploaded file appears to be empty.', type: 'err' });
        return;
      }

      // Detect header row index and column indexes
      let headerIdx = -1;
      let nameCol = -1;
      let catCol = -1;
      let clubCol = -1;
      let schoolCol = -1;
      let genderCol = -1;

      const nameAliases = ['name', 'participant', 'athlete', 'player', 'competitor', 'full name', 'nama'];
      const catAliases = ['category', 'division', 'event', 'weight', 'class', 'kategori', 'acara'];
      const clubAliases = ['club', 'team', 'dojo', 'academy', 'gym', 'affiliation', 'persatuan', 'kelab'];
      const schoolAliases = ['school', 'institution', 'sekolah'];
      const genderAliases = ['gender', 'sex', 'jantina'];

      for (let r = 0; r < Math.min(10, rawRows.length); r++) {
        const row = rawRows[r];
        if (!Array.isArray(row)) continue;

        let foundName = -1;
        let foundCat = -1;
        let foundClub = -1;

        row.forEach((cell, cIdx) => {
          const str = String(cell || '').trim().toLowerCase();
          if (nameAliases.some(a => str.includes(a)) && foundName === -1) foundName = cIdx;
          if (catAliases.some(a => str.includes(a)) && foundCat === -1) foundCat = cIdx;
          if (clubAliases.some(a => str.includes(a)) && foundClub === -1) foundClub = cIdx;
          if (schoolAliases.some(a => str.includes(a)) && schoolCol === -1) schoolCol = cIdx;
          if (genderAliases.some(a => str.includes(a)) && genderCol === -1) genderCol = cIdx;
        });

        // We need at least 2 key columns to identify the header row
        if (foundName !== -1 && (foundCat !== -1 || foundClub !== -1)) {
          headerIdx = r;
          nameCol = foundName;
          catCol = foundCat;
          clubCol = foundClub;
          break;
        }
      }

      // Fallback if no header row detected: assume column 0 is Name, 1 is Category, 2 is Club
      if (headerIdx === -1) {
        headerIdx = 0;
        nameCol = 0;
        catCol = 1;
        clubCol = 2;
      }

      const parsedList: FourGroupParticipant[] = [];
      const startRow = headerIdx + 1;

      for (let r = startRow; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;

        const name = String(row[nameCol] || '').trim();
        const category = catCol !== -1 && row[catCol] ? String(row[catCol]).trim() : 'Open Category';
        const club = clubCol !== -1 && row[clubCol] ? String(row[clubCol]).trim() : 'Independent';
        const school = schoolCol !== -1 && row[schoolCol] ? String(row[schoolCol]).trim() : undefined;
        const gender = genderCol !== -1 && row[genderCol] ? String(row[genderCol]).trim() : undefined;

        if (name && name !== 'undefined' && name !== 'null') {
          parsedList.push({
            id: `p_${Date.now()}_${r}_${Math.random().toString(36).substring(2, 6)}`,
            name,
            category: category || 'Open Category',
            club: club || 'Independent',
            school,
            gender
          });
        }
      }

      if (parsedList.length === 0) {
        setStatusFeedback({ 
          text: 'No valid participant rows could be extracted. Please ensure Participant Name, Category, and Club columns are present.', 
          type: 'err' 
        });
        return;
      }

      setParticipants(parsedList);
      setStatusFeedback({
        text: `Successfully imported ${parsedList.length} participants across ${new Set(parsedList.map(p => p.category)).size} categories from "${file.name}".`,
        type: 'ok'
      });
      setViewMode('cards');
    } catch (err: any) {
      console.error('File parsing error:', err);
      setStatusFeedback({
        text: `Failed to parse file: ${err?.message || 'Unknown error. Please check your Excel or CSV format.'}`,
        type: 'err'
      });
    }
  };

  // Parse pasted text (CSV or Tab-Delimited)
  const handleParsePastedText = () => {
    if (!pasteText.trim()) return;

    try {
      const lines = pasteText.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length === 0) return;

      // Detect delimiter
      const firstFew = lines.slice(0, 5).join('\n');
      const delim = (firstFew.match(/\t/g) || []).length >= (firstFew.match(/,/g) || []).length ? '\t' : ',';

      const parsed: FourGroupParticipant[] = [];
      let nameIdx = 0;
      let catIdx = 1;
      let clubIdx = 2;

      // Check if line 0 is a header
      const headerTokens = lines[0].split(delim).map(s => s.trim().toLowerCase().replace(/^["']|["']$/g, ''));
      let startIndex = 0;

      const hasName = headerTokens.findIndex(t => t.includes('name') || t.includes('participant') || t.includes('athlete'));
      const hasCat = headerTokens.findIndex(t => t.includes('category') || t.includes('division') || t.includes('weight'));
      const hasClub = headerTokens.findIndex(t => t.includes('club') || t.includes('team') || t.includes('dojo'));

      if (hasName !== -1) {
        startIndex = 1;
        nameIdx = hasName;
        if (hasCat !== -1) catIdx = hasCat;
        if (hasClub !== -1) clubIdx = hasClub;
      }

      for (let i = startIndex; i < lines.length; i++) {
        const tokens = lines[i].split(delim).map(s => s.trim().replace(/^["']|["']$/g, ''));
        const name = tokens[nameIdx] || '';
        const cat = tokens[catIdx] || 'Open Category';
        const club = tokens[clubIdx] || 'Independent';

        if (name) {
          parsed.push({
            id: `paste_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
            name,
            category: cat,
            club
          });
        }
      }

      if (parsed.length > 0) {
        setParticipants(parsed);
        setStatusFeedback({
          text: `Loaded ${parsed.length} participants from pasted text.`,
          type: 'ok'
        });
        setPasteText('');
        setViewMode('cards');
      } else {
        setStatusFeedback({ text: 'Could not extract valid participant names from text.', type: 'err' });
      }
    } catch (e: any) {
      setStatusFeedback({ text: `Paste error: ${e.message}`, type: 'err' });
    }
  };

  // Import from existing tournament roster if present in the app
  const handleImportFromCurrentTournament = () => {
    if (!currentRoster || currentRoster.length === 0) {
      setStatusFeedback({ text: 'No roster currently loaded in the tournament system.', type: 'err' });
      return;
    }

    const converted: FourGroupParticipant[] = currentRoster.map((ath, idx) => ({
      id: `current_${idx}_${Date.now()}`,
      name: ath.name,
      category: ath.weight || 'General',
      club: ath.club || 'Independent',
      school: ath.school,
      gender: ath.gender,
      notes: ath.notes || ath.description
    }));

    setParticipants(converted);
    setStatusFeedback({
      text: `Imported ${converted.length} athletes from your active tournament roster!`,
      type: 'ok'
    });
    setViewMode('cards');
  };

  // Load sample dataset
  const handleLoadSample = (sampleType: 'exact' | 'larger') => {
    if (sampleType === 'exact') {
      setParticipants(DEMO_EXACT_SPEC_DATA);
      setStatusFeedback({
        text: 'Loaded exact prompt dataset (Ali, John, Kumar, David in Male 12–14 and 12 Cadet athletes from Club A, B, C, D).',
        type: 'ok'
      });
    } else {
      // Extended multi-division dataset
      const extended: FourGroupParticipant[] = [
        ...DEMO_EXACT_SPEC_DATA,
        { id: '20', name: 'Sarah Lee', category: 'Female Cadet -45kg', club: 'Red Dragon TKD' },
        { id: '21', name: 'Nur Aisyah', category: 'Female Cadet -45kg', club: 'Tigers Club' },
        { id: '22', name: 'Tan Mei Ling', category: 'Female Cadet -45kg', club: 'Golden Hawk' },
        { id: '23', name: 'Chloe Lim', category: 'Female Cadet -45kg', club: 'Strikers Academy' },
        { id: '24', name: 'Elena Gomez', category: 'Female Cadet -45kg', club: 'Red Dragon TKD' },
        { id: '25', name: 'Siti Hajar', category: 'Female Cadet -45kg', club: 'Tigers Club' },
        { id: '26', name: 'Kelly Wong', category: 'Female Cadet -45kg', club: 'Golden Hawk' },
        { id: '27', name: 'Rachel Tan', category: 'Female Cadet -45kg', club: 'Strikers Academy' },
      ];
      setParticipants(extended);
      setStatusFeedback({
        text: 'Loaded extended multi-division dataset with 24 athletes across 3 categories.',
        type: 'ok'
      });
    }
  };

  // DRAG AND DROP: Move an athlete to another group (with automatic capacity swap if full)
  const handleDropOnGroup = (targetCategory: string, targetGroupId: string) => {
    if (!draggedItem) return;
    const { participantId, sourceCategory, sourceGroupId, athlete } = draggedItem;

    if (sourceCategory === targetCategory && sourceGroupId === targetGroupId) {
      setDraggedItem(null);
      setDragOverTarget(null);
      return;
    }

    setGroupedResults(prev => {
      const next = { ...prev };
      const srcCat = next[sourceCategory];
      const tgtCat = next[targetCategory];
      if (!srcCat || !tgtCat) return prev;

      const srcGroup = srcCat.groups.find(g => g.id === sourceGroupId);
      const tgtGroup = tgtCat.groups.find(g => g.id === targetGroupId);
      if (!srcGroup || !tgtGroup) return prev;

      // Remove athlete from source group
      const remainingSrcParticipants = srcGroup.participants.filter(p => p.id !== participantId);
      
      let updatedTgtParticipants = [...tgtGroup.participants];
      let swappedAthlete: FourGroupParticipant | null = null;

      if (updatedTgtParticipants.length >= 4) {
        // Group already has 4 participants (max capacity): swap with the last participant
        swappedAthlete = updatedTgtParticipants.pop()!;
        remainingSrcParticipants.push({
          ...swappedAthlete,
          category: sourceCategory
        });
      }

      const movedAthlete: FourGroupParticipant = {
        ...athlete,
        category: targetCategory
      };
      updatedTgtParticipants.push(movedAthlete);

      const newSrcGroups = srcCat.groups.map(g => {
        if (g.id === sourceGroupId) {
          return { ...g, participants: remainingSrcParticipants };
        }
        return g;
      });

      const newTgtGroups = (sourceCategory === targetCategory ? newSrcGroups : tgtCat.groups).map(g => {
        if (g.id === targetGroupId) {
          return { ...g, participants: updatedTgtParticipants };
        }
        return g;
      });

      if (sourceCategory === targetCategory) {
        next[sourceCategory] = recalculateCategoryResult({
          ...srcCat,
          groups: newTgtGroups
        });
      } else {
        next[sourceCategory] = recalculateCategoryResult({
          ...srcCat,
          groups: newSrcGroups
        });
        next[targetCategory] = recalculateCategoryResult({
          ...tgtCat,
          groups: newTgtGroups
        });
      }

      setHasManualChanges(true);

      if (swappedAthlete) {
        setStatusFeedback({
          text: `Swapped ${athlete.name} with ${swappedAthlete.name} (${tgtGroup.groupName} was full at 4 pax).`,
          type: 'info'
        });
      } else {
        setStatusFeedback({
          text: `Moved ${athlete.name} from ${srcGroup.groupName} to ${tgtGroup.groupName}.`,
          type: 'ok'
        });
      }

      return next;
    });

    setDraggedItem(null);
    setDragOverTarget(null);
  };

  // DRAG AND DROP: Swap two athletes directly or reorder inside the group
  const handleDropOnAthlete = (targetCategory: string, targetGroupId: string, targetAthleteId: string) => {
    if (!draggedItem) return;
    const { participantId, sourceCategory, sourceGroupId, athlete } = draggedItem;

    if (participantId === targetAthleteId) {
      setDraggedItem(null);
      setDragOverTarget(null);
      return;
    }

    setGroupedResults(prev => {
      const next = { ...prev };
      const srcCat = next[sourceCategory];
      const tgtCat = next[targetCategory];
      if (!srcCat || !tgtCat) return prev;

      const srcGroup = srcCat.groups.find(g => g.id === sourceGroupId);
      const tgtGroup = tgtCat.groups.find(g => g.id === targetGroupId);
      if (!srcGroup || !tgtGroup) return prev;

      const targetAthlete = tgtGroup.participants.find(p => p.id === targetAthleteId);
      if (!targetAthlete) return prev;

      if (sourceCategory === targetCategory && sourceGroupId === targetGroupId) {
        // Re-ordering within the same group
        const pList = [...srcGroup.participants];
        const fromIdx = pList.findIndex(p => p.id === participantId);
        const toIdx = pList.findIndex(p => p.id === targetAthleteId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [moved] = pList.splice(fromIdx, 1);
          pList.splice(toIdx, 0, moved);
          const newGroups = srcCat.groups.map(g => g.id === sourceGroupId ? { ...g, participants: pList } : g);
          next[sourceCategory] = recalculateCategoryResult({ ...srcCat, groups: newGroups });
        }
        return next;
      }

      // Swapping across groups
      const newSrcParticipants = srcGroup.participants.map(p => {
        if (p.id === participantId) {
          return { ...targetAthlete, category: sourceCategory };
        }
        return p;
      });

      const newTgtParticipants = tgtGroup.participants.map(p => {
        if (p.id === targetAthleteId) {
          return { ...athlete, category: targetCategory };
        }
        return p;
      });

      const newSrcGroups = srcCat.groups.map(g => g.id === sourceGroupId ? { ...g, participants: newSrcParticipants } : g);
      const newTgtGroups = (sourceCategory === targetCategory ? newSrcGroups : tgtCat.groups).map(g => g.id === targetGroupId ? { ...g, participants: newTgtParticipants } : g);

      if (sourceCategory === targetCategory) {
        next[sourceCategory] = recalculateCategoryResult({ ...srcCat, groups: newTgtGroups });
      } else {
        next[sourceCategory] = recalculateCategoryResult({ ...srcCat, groups: newSrcGroups });
        next[targetCategory] = recalculateCategoryResult({ ...tgtCat, groups: newTgtGroups });
      }

      setHasManualChanges(true);

      setStatusFeedback({
        text: `Swapped ${athlete.name} (${srcGroup.groupName}) with ${targetAthlete.name} (${tgtGroup.groupName}).`,
        type: 'ok'
      });

      return next;
    });

    setDraggedItem(null);
    setDragOverTarget(null);
  };

  // Manual move participant between groups via Dropdown selection (touch-friendly / accessible)
  const handleMoveParticipantToGroup = (
    participantId: string,
    targetCategory: string,
    targetGroupId: string
  ) => {
    let foundSource: { category: string; group: FourGroup; athlete: FourGroupParticipant } | null = null;
    Object.values(groupedResults).forEach((catRes: CategoryGroupResult) => {
      catRes.groups.forEach(g => {
        const found = g.participants.find(p => p.id === participantId);
        if (found) {
          foundSource = { category: catRes.category, group: g, athlete: found };
        }
      });
    });

    if (!foundSource) return;
    const { category: sourceCategory, group: srcGroup, athlete } = foundSource;

    if (sourceCategory === targetCategory && srcGroup.id === targetGroupId) return;

    setGroupedResults(prev => {
      const next = { ...prev };
      const srcCat = next[sourceCategory];
      const tgtCat = next[targetCategory];
      if (!srcCat || !tgtCat) return prev;

      const currentSrcGroup = srcCat.groups.find(g => g.id === srcGroup.id);
      const tgtGroup = tgtCat.groups.find(g => g.id === targetGroupId);
      if (!currentSrcGroup || !tgtGroup) return prev;

      const remainingSrc = currentSrcGroup.participants.filter(p => p.id !== participantId);
      let updatedTgt = [...tgtGroup.participants];
      let swappedAthlete: FourGroupParticipant | null = null;

      if (updatedTgt.length >= 4) {
        swappedAthlete = updatedTgt.pop()!;
        remainingSrc.push({ ...swappedAthlete, category: sourceCategory });
      }

      updatedTgt.push({ ...athlete, category: targetCategory });

      const newSrcGroups = srcCat.groups.map(g => g.id === srcGroup.id ? { ...g, participants: remainingSrc } : g);
      const newTgtGroups = (sourceCategory === targetCategory ? newSrcGroups : tgtCat.groups).map(g => g.id === targetGroupId ? { ...g, participants: updatedTgt } : g);

      if (sourceCategory === targetCategory) {
        next[sourceCategory] = recalculateCategoryResult({ ...srcCat, groups: newTgtGroups });
      } else {
        next[sourceCategory] = recalculateCategoryResult({ ...srcCat, groups: newSrcGroups });
        next[targetCategory] = recalculateCategoryResult({ ...tgtCat, groups: newTgtGroups });
      }

      setHasManualChanges(true);

      if (swappedAthlete) {
        setStatusFeedback({
          text: `Swapped ${athlete.name} with ${swappedAthlete.name} (${tgtGroup.groupName} was full).`,
          type: 'info'
        });
      } else {
        setStatusFeedback({
          text: `Moved ${athlete.name} to ${tgtGroup.groupName}.`,
          type: 'ok'
        });
      }

      return next;
    });
  };

  // Add an empty group to a category on demand
  const handleAddGroupToCategory = (categoryName: string) => {
    setGroupedResults(prev => {
      const next = { ...prev };
      const cat = next[categoryName];
      if (!cat) return prev;

      const newGroupNumber = cat.groups.length + 1;
      const newGroupName = `Group ${newGroupNumber}`;
      const newGroup: FourGroup = {
        id: `${categoryName}-grp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        groupNumber: newGroupNumber,
        groupName: newGroupName,
        category: categoryName,
        categoryWithGroup: formatCategoryWithGroup(categoryName, newGroupName),
        participants: [],
        hasClubConflict: false,
        conflictingClubs: []
      };

      next[categoryName] = {
        ...cat,
        groups: [...cat.groups, newGroup],
        totalGroups: cat.groups.length + 1
      };

      setHasManualChanges(true);

      setStatusFeedback({
        text: `Created ${newGroup.groupName} for ${categoryName}. You can now drag competitors into it.`,
        type: 'ok'
      });

      return next;
    });
  };

  // Remove an empty group
  const handleRemoveEmptyGroup = (categoryName: string, groupId: string) => {
    setGroupedResults(prev => {
      const next = { ...prev };
      const cat = next[categoryName];
      if (!cat) return prev;

      const grp = cat.groups.find(g => g.id === groupId);
      if (!grp || grp.participants.length > 0) return prev;

      const remainingGroups = cat.groups
        .filter(g => g.id !== groupId)
        .map((g, idx) => ({
          ...g,
          groupNumber: idx + 1,
          groupName: `Group ${idx + 1}`
        }));

      next[categoryName] = recalculateCategoryResult({
        ...cat,
        groups: remainingGroups,
        totalGroups: remainingGroups.length
      });

      setHasManualChanges(true);

      setStatusFeedback({
        text: `Removed empty group from ${categoryName}.`,
        type: 'info'
      });

      return next;
    });
  };

  // Reset to automated algorithm
  const handleResetAutoGrouping = (categoryName?: string) => {
    if (categoryName) {
      const catParticipants = participants.filter(p => p.category === categoryName);
      const recomputed = generateFourGroupsForCategory(categoryName, catParticipants, options);
      setGroupedResults(prev => ({
        ...prev,
        [categoryName]: recomputed
      }));
      setStatusFeedback({
        text: `Reset auto-grouping for ${categoryName}.`,
        type: 'info'
      });
    } else {
      setGroupedResults(generateFourGroupsForAllCategories(participants, options));
      setHasManualChanges(false);
      setStatusFeedback({
        text: 'Re-ran auto-distribution algorithm with club separation for all categories.',
        type: 'ok'
      });
    }
  };

  // Clear competitors while keeping all category names intact
  const handleClearCompetitorsKeepCategories = () => {
    const currentCats = Object.keys(groupedResults).length > 0 
      ? Object.keys(groupedResults)
      : Array.from(new Set(participants.map(p => p.category)));

    setRetainedCategories(currentCats);
    setParticipants([]);
    setClearJobModalOpen(false);
    setStatusFeedback({
      text: `Cleared competitors. All ${currentCats.length} category names have been retained!`,
      type: 'ok'
    });
  };

  // Delete entire job and all category names
  const handleDeleteAllJobAndCategories = () => {
    setRetainedCategories([]);
    setParticipants([]);
    setGroupedResults({});
    setClearJobModalOpen(false);
    setStatusFeedback({
      text: 'Current job and all category names have been deleted.',
      type: 'ok'
    });
  };

  // Delete a single category and its participants
  const handleDeleteCategory = (categoryName: string) => {
    if (confirm(`Delete category "${categoryName}" and its competitors?`)) {
      setParticipants(prev => prev.filter(p => p.category !== categoryName));
      setRetainedCategories(prev => prev.filter(c => c !== categoryName));
      setGroupedResults(prev => {
        const next = { ...prev };
        delete next[categoryName];
        return next;
      });
      setStatusFeedback({
        text: `Category "${categoryName}" deleted.`,
        type: 'ok'
      });
    }
  };

  // Add a new custom category name directly
  const handleAddCustomCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    setRetainedCategories(prev => Array.from(new Set([...prev, trimmed])));
    setNewCategoryModalOpen(false);
    setNewCategoryInput('');
    setStatusFeedback({
      text: `Category "${trimmed}" added and retained.`,
      type: 'ok'
    });
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (tableRows.length === 0) return;

    try {
      const exportData = tableRows.map(row => ({
        'Group': row.group,
        'Category': row.category,
        'Participant Name': row.participant,
        'Club / Team': row.club,
        'School / Affiliation': row.school || '',
        'Club Conflict': row.hasConflict ? 'WARNING: Same Club in Group' : 'Clean (Different Clubs)'
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Auto-fit column widths
      worksheet['!cols'] = [
        { wch: 12 }, // Group
        { wch: 26 }, // Category
        { wch: 28 }, // Participant Name
        { wch: 24 }, // Club / Team
        { wch: 24 }, // School
        { wch: 28 }, // Club Conflict
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '4 in a Group Allocation');

      const fileName = `${tournamentName.replace(/[^a-zA-Z0-9_-]/g, '_')}_4_in_a_Group_Allocation.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setStatusFeedback({
        text: `Exported ${tableRows.length} participants to "${fileName}".`,
        type: 'ok'
      });
    } catch (e: any) {
      console.error(e);
      setStatusFeedback({ text: `Excel export error: ${e.message}`, type: 'err' });
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (tableRows.length === 0) return;

    const headers = ['Group', 'Category', 'Participant Name', 'Club', 'School'];
    const csvContent = [
      headers.join(','),
      ...tableRows.map(r => [
        `"${r.group.replace(/"/g, '""')}"`,
        `"${r.category.replace(/"/g, '""')}"`,
        `"${r.participant.replace(/"/g, '""')}"`,
        `"${r.club.replace(/"/g, '""')}"`,
        `"${(r.school || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tournamentName.replace(/[^a-zA-Z0-9_-]/g, '_')}_4_in_a_Group.csv`;
    link.click();
  };

  // Download Sample Excel Template
  const handleDownloadSampleTemplate = (type: 'xlsx' | 'csv') => {
    const templateRows = [
      { 'Participant Name': 'Ali', 'Category': 'Male 12–14', 'Club': 'Club A', 'School': 'SMK Alpha' },
      { 'Participant Name': 'John', 'Category': 'Male 12–14', 'Club': 'Club B', 'School': 'SMK Beta' },
      { 'Participant Name': 'Kumar', 'Category': 'Male 12–14', 'Club': 'Club C', 'School': 'SMK Gamma' },
      { 'Participant Name': 'David', 'Category': 'Male 12–14', 'Club': 'Club D', 'School': 'SMK Delta' },
      { 'Participant Name': 'Adam', 'Category': 'Male Cadet', 'Club': 'Club A', 'School': 'SMK Alpha' },
      { 'Participant Name': 'Bob', 'Category': 'Male Cadet', 'Club': 'Club B', 'School': 'SMK Beta' },
      { 'Participant Name': 'Charlie', 'Category': 'Male Cadet', 'Club': 'Club C', 'School': 'SMK Gamma' },
      { 'Participant Name': 'Dylan', 'Category': 'Male Cadet', 'Club': 'Club D', 'School': 'SMK Delta' },
    ];

    if (type === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(templateRows);
      ws['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roster Template');
      XLSX.writeFile(wb, '4_in_a_Group_Roster_Template.xlsx');
    } else {
      const csv = [
        'Participant Name,Category,Club,School',
        ...templateRows.map(r => `"${r['Participant Name']}","${r.Category}","${r.Club}","${r.School}"`)
      ].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = '4_in_a_Group_Roster_Template.csv';
      link.click();
    }
  };

  // Copy table to clipboard
  const handleCopyTable = () => {
    const text = [
      'Group\tCategory\tParticipant\tClub',
      ...tableRows.map(r => `${r.group}\t${r.category}\t${r.participant}\t${r.club}`)
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    });
  };

  // Optional: push these 4-pax groups to the main tournament manager as brackets
  const handlePushToTournament = () => {
    if (!onPushToTournament) return;

    // Convert each 4-pax group into a distinct tournament category (e.g. "Male Cadet - Group 1")
    const newCategories: Record<string, WeightCategory> = {};
    const newRoster: Athlete[] = [];

    Object.values(groupedResults).forEach((catRes: CategoryGroupResult, catIdx) => {
      catRes.groups.forEach((group, gIdx) => {
        const catKey = formatCategoryWithGroup(catRes.category, group.groupName);
        const entrants: Athlete[] = group.participants.map(p => ({
          name: p.name,
          club: p.club,
          weight: catKey,
          school: p.school,
          gender: p.gender,
          notes: p.notes
        }));

        const allocatedRing = (catIdx % 4) + 1;
        newCategories[catKey] = {
          name: catKey,
          count: entrants.length,
          size: 4,
          status: 'ready',
          ring: allocatedRing,
          entrants,
          systemType: 'kyorugi-pk',
          order: allocatedRing * 1000 + catIdx * 10 + gIdx
        };

        newRoster.push(...entrants);
      });
    });

    onPushToTournament(newCategories, newRoster);
    setStatusFeedback({
      text: `Exported ${Object.keys(newCategories).length} groups to the tournament brackets manager!`,
      type: 'ok'
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* HEADER HERO BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 md:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider shadow-sm">
                <Users className="w-3.5 h-3.5" />
                4 in a Group Allocation
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-bold">
                Max 4 Pax • Club Separation Guarantee
              </span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Automated 4-Athlete Group Creator
            </h1>
            
            <p className="text-sm text-slate-300 leading-relaxed">
              Upload an Excel or CSV roster. The system automatically partitions participants 
              <strong> category-by-category into groups of at most 4 competitors</strong>, 
              intelligently preventing competitors from the same club from being matched together.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleLoadSample('exact')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-black transition-all flex items-center gap-2 shadow-sm cursor-pointer hover:border-amber-400/50"
              title="Loads exact dataset from prompt: Ali, John, Kumar, David and 12 Cadet competitors"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Load Prompt Demo</span>
            </button>

            {currentRoster && currentRoster.length > 0 && (
              <button
                onClick={handleImportFromCurrentTournament}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all flex items-center gap-2 shadow-md cursor-pointer active:scale-95"
                title="Imports athletes currently loaded in your main tournament roster"
              >
                <Layers className="w-4 h-4 text-slate-950" />
                <span>Use Tournament Roster ({currentRoster.length})</span>
              </button>
            )}

            {(participants.length > 0 || retainedCategories.length > 0) && (
              <button
                onClick={() => setClearJobModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-black transition-all flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
                title="Delete competitors or reset 4-in-a-group job"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Clear Current Job</span>
              </button>
            )}
          </div>
        </div>

        {/* SUMMARY METRIC STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-700/60">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block font-mono">
              Total Participants
            </span>
            <span className="text-2xl font-black text-white font-mono mt-0.5 block">
              {summaryStats.totalAthletes}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block font-mono">
              Categories
            </span>
            <span className="text-2xl font-black text-amber-400 font-mono mt-0.5 block">
              {summaryStats.categoryCount}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block font-mono">
              Total Groups (Max 4)
            </span>
            <span className="text-2xl font-black text-sky-400 font-mono mt-0.5 block">
              {summaryStats.totalGroups}
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block font-mono">
              Club Diversity
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {summaryStats.totalConflicts === 0 ? (
                <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  100% Conflict-Free
                </span>
              ) : (
                <span className="text-sm font-black text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {summaryStats.totalConflicts} Club Overlap{summaryStats.totalConflicts > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STATUS BANNER FEEDBACK */}
      {statusFeedback && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 border ${
          statusFeedback.type === 'ok'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : statusFeedback.type === 'err'
            ? 'bg-rose-50 text-rose-900 border-rose-200'
            : 'bg-amber-50 text-amber-900 border-amber-200'
        }`}>
          <div className="flex items-center gap-2">
            {statusFeedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : statusFeedback.type === 'err' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{statusFeedback.text}</span>
          </div>
          <button
            onClick={() => setStatusFeedback(null)}
            className="text-slate-400 hover:text-slate-700 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* DATA INPUT & CONFIGURATION ACCORDION / TABS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold text-sm">
              1
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Upload Roster or Configure Data Source
              </h2>
              <p className="text-xs text-slate-500">
                Required columns: <strong>Participant Name</strong>, <strong>Category</strong>, and <strong>Club</strong>
              </p>
            </div>
          </div>

          {/* Sub-Tabs for Input Options */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Excel / CSV File</span>
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'paste' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Copy-Paste Text</span>
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'manage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Manage Roster ({participants.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: FILE UPLOAD (EXCEL / CSV) */}
        {activeTab === 'upload' && (
          <div className="pt-5 space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processUploadedFile(file);
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const file = e.dataTransfer.files?.[0];
                if (file) processUploadedFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                isDraggingFile
                  ? 'border-amber-500 bg-amber-50/50 scale-[1.01]'
                  : 'border-slate-250 hover:border-amber-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-inner">
                <FileSpreadsheet className="w-7 h-7 text-amber-600" />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800">
                  Drop your Excel (<code className="text-xs bg-slate-200 text-slate-800 px-1 py-0.5 rounded font-mono">.xlsx</code>, <code className="text-xs bg-slate-200 text-slate-800 px-1 py-0.5 rounded font-mono">.xls</code>) or <code className="text-xs bg-slate-200 text-slate-800 px-1 py-0.5 rounded font-mono">.csv</code> file here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  or click to browse your computer
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <span className="text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
                  ✓ Participant Name
                </span>
                <span className="text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
                  ✓ Category / Division
                </span>
                <span className="text-[11px] font-semibold bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-md">
                  ✓ Club / Team
                </span>
              </div>
            </div>

            {/* Template Download strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <HelpCircle className="w-4 h-4 text-amber-500" />
                <span>Need a ready-made template? Download a pre-formatted roster file:</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSampleTemplate('xlsx')}
                  className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs hover:border-slate-300 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel Template (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSampleTemplate('csv')}
                  className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs hover:border-slate-300 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-sky-600" />
                  <span>CSV Template</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COPY-PASTE TEXT */}
        {activeTab === 'paste' && (
          <div className="pt-5 space-y-3">
            <p className="text-xs text-slate-500">
              Paste table rows directly from Excel, Google Sheets, or a text file. Tab-separated or comma-separated values are automatically detected:
            </p>
            <textarea
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Participant Name&#9;Category&#9;Club&#10;Ali&#9;Male 12–14&#9;Club A&#10;John&#9;Male 12–14&#9;Club B&#10;Kumar&#9;Male 12–14&#9;Club C&#10;David&#9;Male 12–14&#9;Club D"
              className="w-full font-mono text-xs p-3.5 bg-slate-50 border border-slate-250 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteText('')}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleParsePastedText}
                disabled={!pasteText.trim()}
                className="px-5 py-2 text-xs font-bold bg-slate-900 text-amber-400 hover:bg-slate-800 disabled:opacity-40 rounded-xl cursor-pointer shadow-sm flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Process &amp; Group Pasted Rows</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: MANAGE CURRENT PARTICIPANTS LIST */}
        {activeTab === 'manage' && (
          <div className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-bold">
                {participants.length} Active Participants in Memory
              </span>
              <button
                type="button"
                onClick={() => setClearJobModalOpen(true)}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                title="Clear participants while remaining category names or full reset"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs font-mono">
              {participants.map((p, idx) => (
                <div key={p.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-400 w-6 shrink-0 text-right">{idx + 1}.</span>
                    <span className="font-bold text-slate-900 truncate">{p.name}</span>
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] shrink-0 font-sans">
                      {p.category}
                    </span>
                    <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[10px] shrink-0 font-sans">
                      {p.club}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setParticipants(prev => prev.filter(x => x.id !== p.id))}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer"
                    title="Remove participant"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CONTROLS, VIEW SELECTOR & EXPORT TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Left: View Switching and Filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Interactive visual group cards view"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Group Cards</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Standard tabular master list view (Group, Category, Participant, Club)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Master Table</span>
            </button>

            <button
              onClick={() => setViewMode('print')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'print'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Official printable tournament match sheet view"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
            </button>
          </div>

          {/* Category Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="bg-slate-50 border border-slate-250 text-slate-800 text-xs font-bold rounded-xl px-3 py-1.5 focus:border-amber-500 outline-none cursor-pointer"
            >
              <option value="all">All Categories ({Object.keys(groupedResults).length})</option>
              {Object.keys(groupedResults).map(cat => (
                <option key={cat} value={cat}>
                  {cat} ({groupedResults[cat].totalParticipants} pax, {groupedResults[cat].totalGroups} grp)
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search participant, club..."
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-250 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-amber-500 outline-none w-44 md:w-56"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right: Export & Tournament Push Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Copy Table */}
          <button
            onClick={handleCopyTable}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Copy entire allocation table to clipboard"
          >
            {copiedNotification ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>{copiedNotification ? 'Copied!' : 'Copy Table'}</span>
          </button>

          {/* Download CSV */}
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Download CSV file"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>CSV</span>
          </button>

          {/* Download Excel */}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow"
            title="Export full grouping report to Microsoft Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            <span>Export Excel</span>
          </button>

          {/* Print Button */}
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {/* Optional Push to Tournament */}
          {onPushToTournament && (
            <button
              onClick={handlePushToTournament}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Convert these 4-pax groups into tournament brackets in the main manager"
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>Push to Draws</span>
            </button>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: INTERACTIVE CARDS VIEW WITH DRAG & DROP */}
      {viewMode === 'cards' && (
        <div className="space-y-6">
          {/* Drag & Drop Instruction Guide */}
          <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-amber-500 text-white font-bold shrink-0">
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <div>
                <p className="font-extrabold text-slate-900">
                  Interactive Drag &amp; Drop Enabled
                </p>
                <p className="text-[11px] text-slate-600">
                  Drag any competitor card to another group to reassign them. Drop directly on another competitor to swap them.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setNewCategoryModalOpen(true)}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-250 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                title="Create a new weight category"
              >
                <Plus className="w-3.5 h-3.5 text-amber-600" />
                <span>Add Category</span>
              </button>

              {hasManualChanges && (
                <button
                  onClick={() => handleResetAutoGrouping()}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all shrink-0"
                  title="Reset manual adjustments back to automated club separation"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Reset All to Auto</span>
                </button>
              )}
            </div>
          </div>

          {filteredCategoryKeys.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">No matching categories found</p>
              <p className="text-xs text-slate-400">Try adjusting your search query or uploading a roster above.</p>
            </div>
          ) : (
            filteredCategoryKeys.map((catKey) => {
              const catResult = groupedResults[catKey];
              if (!catResult) return null;

              return (
                <div 
                  key={catKey}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 md:p-6 shadow-sm space-y-4"
                >
                  {/* Category Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700">
                        <Dumbbell className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                          <span>{catResult.category}</span>
                        </h3>
                        <p className="text-xs text-slate-500 font-mono">
                          {catResult.totalParticipants} athlete{catResult.totalParticipants === 1 ? '' : 's'} • {catResult.totalGroups} group{catResult.totalGroups === 1 ? '' : 's'} (max 4 pax/group)
                        </p>
                      </div>
                    </div>

                    {/* Category Controls & Diversity Status Badge */}
                    <div className="flex flex-wrap items-center gap-2">
                      {!catResult.hasConflict ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>All Clubs Separated</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Same-Club Collision Detected</span>
                        </span>
                      )}

                      {/* Add Group Button for this Category */}
                      <button
                        onClick={() => handleAddGroupToCategory(catResult.category)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Add an empty group to this category"
                      >
                        <Plus className="w-3.5 h-3.5 text-slate-600" />
                        <span>Add Group</span>
                      </button>

                      {/* Reset Auto for this Category */}
                      <button
                        onClick={() => handleResetAutoGrouping(catResult.category)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs cursor-pointer transition-colors"
                        title="Re-run auto grouping for this category"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete this Category */}
                      <button
                        onClick={() => handleDeleteCategory(catResult.category)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 text-xs cursor-pointer transition-colors"
                        title={`Delete category "${catResult.category}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Groups Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {catResult.groups.map((group) => {
                      const isGroupDragOver = dragOverTarget?.groupId === group.id && !dragOverTarget?.targetParticipantId;
                      const isGroupFull = group.participants.length >= 4;

                      return (
                        <div
                          key={group.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            setDragOverTarget({
                              category: catResult.category,
                              groupId: group.id
                            });
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget === e.target) {
                              setDragOverTarget(prev => prev?.groupId === group.id ? null : prev);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDropOnGroup(catResult.category, group.id);
                          }}
                          className={`rounded-xl p-4 flex flex-col justify-between transition-all duration-150 ${
                            isGroupDragOver
                              ? 'ring-2 ring-amber-500 border-2 border-amber-500 bg-amber-50/60 shadow-md scale-[1.01]'
                              : group.hasClubConflict
                              ? 'border-2 border-amber-400 bg-amber-50/20'
                              : 'bg-slate-50/70 border-2 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Group Header */}
                          <div>
                            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/80">
                              <span className="font-black text-xs text-slate-900 tracking-tight flex items-start gap-1.5 min-w-0 pr-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                                <span className="break-words leading-tight" title={`${catResult.category} ${group.groupName}`}>
                                  <span className="font-extrabold text-slate-800">{catResult.category}</span>{' '}
                                  <span className="font-mono font-black text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded text-[10.5px] inline-block">
                                    {group.groupName}
                                  </span>
                                </span>
                              </span>

                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full font-mono ${
                                  group.participants.length === 4
                                    ? 'bg-slate-900 text-amber-400'
                                    : group.participants.length === 0
                                    ? 'bg-slate-200 text-slate-500'
                                    : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {group.participants.length} / 4 pax
                                </span>

                                {/* Delete empty group button */}
                                {group.participants.length === 0 && (
                                  <button
                                    onClick={() => handleRemoveEmptyGroup(catResult.category, group.id)}
                                    className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                                    title="Delete empty group"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Participant Cards inside Group */}
                            {group.participants.length === 0 ? (
                              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-400 bg-white/40 space-y-1">
                                <MoveRight className="w-5 h-5 mx-auto text-slate-300" />
                                <p className="text-xs font-bold text-slate-500">Empty Group</p>
                                <p className="text-[10px] text-slate-400">
                                  Drop competitors here to populate this group
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {group.participants.map((athlete, athIdx) => {
                                  const clubTagColor = getClubColor(athlete.club);
                                  const isClubDuplicateInGroup = 
                                    group.conflictingClubs.some(c => normalizeClub(c) === normalizeClub(athlete.club));
                                  
                                  const isBeingDragged = draggedItem?.participantId === athlete.id;
                                  const isSwapTarget = dragOverTarget?.targetParticipantId === athlete.id && !isBeingDragged;

                                  return (
                                    <div
                                      key={athlete.id}
                                      draggable={true}
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', athlete.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        setDraggedItem({
                                          participantId: athlete.id,
                                          sourceCategory: catResult.category,
                                          sourceGroupId: group.id,
                                          athlete
                                        });
                                      }}
                                      onDragEnd={() => {
                                        setDraggedItem(null);
                                        setDragOverTarget(null);
                                      }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                      }}
                                      onDragEnter={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDragOverTarget({
                                          category: catResult.category,
                                          groupId: group.id,
                                          targetParticipantId: athlete.id
                                        });
                                      }}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDropOnAthlete(catResult.category, group.id, athlete.id);
                                      }}
                                      className={`rounded-lg p-2.5 shadow-2xs flex flex-col gap-1 transition-all cursor-grab active:cursor-grabbing select-none ${
                                        isBeingDragged
                                          ? 'opacity-40 border-2 border-dashed border-amber-400 bg-amber-50/50'
                                          : isSwapTarget
                                          ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-100 shadow-md scale-[1.02]'
                                          : isClubDuplicateInGroup 
                                          ? 'bg-white border border-amber-300 bg-amber-50/30 ring-1 ring-amber-400/40' 
                                          : 'bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs'
                                      }`}
                                    >
                                      {/* Swap Indicator when hovering over an athlete */}
                                      {isSwapTarget && (
                                        <div className="flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded">
                                          <ArrowLeftRight className="w-3 h-3 text-amber-700" />
                                          <span>Drop to swap with {athlete.name}</span>
                                        </div>
                                      )}

                                      <div className="flex items-start justify-between gap-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="text-slate-350 hover:text-slate-600 shrink-0" title="Drag handle">
                                            <GripVertical className="w-3.5 h-3.5" />
                                          </span>
                                          <span className="w-4.5 h-4.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-extrabold flex items-center justify-center shrink-0">
                                            {athIdx + 1}
                                          </span>
                                          <span className="font-extrabold text-xs text-slate-900 truncate">
                                            {athlete.name}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          {isClubDuplicateInGroup && (
                                            <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-1 py-0.5 rounded shrink-0">
                                              Overlap
                                            </span>
                                          )}

                                          {/* Quick Move Dropdown (accessible for touch/clicks) */}
                                          <select
                                            value={group.id}
                                            onChange={(e) => handleMoveParticipantToGroup(athlete.id, catResult.category, e.target.value)}
                                            className="text-[10px] font-mono bg-slate-100 text-slate-600 hover:text-slate-900 rounded px-1 py-0.5 border border-slate-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400"
                                            title="Move to another group"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {catResult.groups.map(g => (
                                              <option key={g.id} value={g.id}>
                                                {g.groupName}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-between gap-1 pl-6">
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border truncate max-w-[160px] ${clubTagColor}`}>
                                          {athlete.club || 'Independent'}
                                        </span>

                                        {athlete.school && (
                                          <span className="text-[9px] text-slate-400 truncate font-mono">
                                            {athlete.school}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Group Footer status */}
                          <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>
                              {new Set(group.participants.map(p => normalizeClub(p.club))).size} distinct club{new Set(group.participants.map(p => normalizeClub(p.club))).size === 1 ? '' : 's'}
                            </span>
                            {group.hasClubConflict ? (
                              <span className="text-amber-700 font-bold">⚠️ Same Club present</span>
                            ) : (
                              <span className="text-emerald-700 font-bold">✓ Zero collisions</span>
                            )}
                          </div>

                          {/* Drop helper prompt when dragging over */}
                          {isGroupDragOver && (
                            <div className="mt-2 text-[10px] font-bold text-center text-amber-800 bg-amber-100 py-1 rounded border border-amber-300">
                              {isGroupFull
                                ? '⚠️ Group full (4/4) — Will swap with last athlete'
                                : `↓ Drop to assign to ${group.groupName}`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW MODE 2: MASTER TABLE VIEW (Matches user's prompt specification) */}
      {viewMode === 'table' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider font-mono">
                Master 4-in-a-Group Allocation Table
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Formatted as specified: <strong>Group</strong> | <strong>Category</strong> | <strong>Participant</strong> | <strong>Club</strong>
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
              {tableRows.length} Rows Total
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold uppercase font-mono tracking-wider">
                  <th className="py-3 px-4 w-32">Group</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Participant Name</th>
                  <th className="py-3 px-4">Club / Team</th>
                  <th className="py-3 px-4">School</th>
                  <th className="py-3 px-4 text-center w-36">Club Separation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                      No participants loaded yet. Upload a roster above.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row, idx) => {
                    const clubTagColor = getClubColor(row.club);
                    const categoryGroups = groupedResults[row.baseCategory]?.groups || [];

                    return (
                      <tr 
                        key={row.participantId || idx}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          row.hasConflict ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-black text-slate-900">
                          {/* Interactive Group Selector directly inside the table */}
                          <select
                            value={row.groupId}
                            onChange={(e) => handleMoveParticipantToGroup(row.participantId, row.baseCategory, e.target.value)}
                            className="bg-slate-900 text-amber-400 font-mono text-xs font-bold px-2 py-1 rounded border border-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400"
                            title="Reassign to another group"
                          >
                            {categoryGroups.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.groupName} ({g.participants.length}/4)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800 font-sans">
                          <span className="font-extrabold text-slate-900">{row.baseCategory}</span>{' '}
                          <span className="font-mono font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap">
                            {row.group}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-extrabold text-slate-900">
                          {row.participant}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${clubTagColor}`}>
                            {row.club}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {row.school || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {row.hasConflict ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Club Overlap
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Distinct Club
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: OFFICIAL PRINT / BOUT SHEET VIEW */}
      {viewMode === 'print' && (
        <div className="bg-white border border-slate-300 rounded-2xl p-8 shadow-sm print:border-none print:shadow-none print:p-0 space-y-8">
          
          {/* Print Document Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {tournamentName || 'Tournament'} • 4-in-a-Group Official Allocations
              </h2>
              <p className="text-xs text-slate-600 mt-1 font-mono">
                Total Athletes: {summaryStats.totalAthletes} | Categories: {summaryStats.categoryCount} | Groups: {summaryStats.totalGroups}
              </p>
            </div>
            <div className="text-right font-mono text-xs text-slate-500">
              <span>Date: {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Printable Categories & Match Sheets */}
          <div className="space-y-8">
            {Object.keys(groupedResults).map((catKey) => {
              const catResult = groupedResults[catKey];
              return (
                <div key={catKey} className="space-y-4 break-inside-avoid">
                  <div className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center justify-between">
                    <span className="font-black text-sm uppercase tracking-wide">
                      Category: {catResult.category}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {catResult.totalParticipants} Participants • {catResult.totalGroups} Groups
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {catResult.groups.map((group) => (
                      <div 
                        key={group.id} 
                        className="border border-slate-400 rounded-lg overflow-hidden flex flex-col justify-between"
                      >
                        <div className="bg-slate-100 border-b border-slate-400 px-3 py-1.5 flex items-center justify-between font-bold text-xs">
                          <span className="font-black text-slate-900">{catResult.category} {group.groupName}</span>
                          <span className="font-mono text-[11px] text-slate-600 font-medium">{group.participants.length} / 4 Competitors</span>
                        </div>

                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] text-slate-500 uppercase font-mono">
                              <th className="py-1 px-2.5 w-8">#</th>
                              <th className="py-1 px-2.5">Athlete Name</th>
                              <th className="py-1 px-2.5">Club</th>
                              <th className="py-1 px-2.5 text-center w-16">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.participants.map((p, idx) => (
                              <tr key={p.id}>
                                <td className="py-2 px-2.5 font-mono text-slate-400">{idx + 1}</td>
                                <td className="py-2 px-2.5 font-bold text-slate-900">{p.name}</td>
                                <td className="py-2 px-2.5 text-slate-700">{p.club}</td>
                                <td className="py-2 px-2.5 border-l border-slate-200 text-center font-mono text-slate-300">
                                  [ &nbsp;&nbsp;&nbsp; ]
                                </td>
                              </tr>
                            ))}
                            {/* Empty placeholders to fill up to 4 */}
                            {Array.from({ length: Math.max(0, 4 - group.participants.length) }).map((_, i) => (
                              <tr key={`empty-${i}`} className="text-slate-300">
                                <td className="py-2 px-2.5 font-mono">{group.participants.length + i + 1}</td>
                                <td className="py-2 px-2.5 italic">— Bye / Empty —</td>
                                <td className="py-2 px-2.5">—</td>
                                <td className="py-2 px-2.5 border-l border-slate-200 text-center font-mono">—</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Printable signature strip */}
          <div className="pt-6 border-t border-slate-400 flex items-center justify-between text-xs text-slate-600 font-mono">
            <span>Official In-Charge: ___________________________</span>
            <span>Signature: ___________________________</span>
            <span>Ring Marshal: ___________________________</span>
          </div>
        </div>
      )}

      {/* Clear Current Job Dialog with Category Retention Option */}
      {clearJobModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
          <div 
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity"
            onClick={() => setClearJobModalOpen(false)}
          />

          <div className="flex min-h-full items-center justify-center p-4 text-center animate-fade-in">
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-md border border-slate-100 p-6 space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <h4 className="text-base font-black text-slate-900 tracking-tight">
                    Clear Current 4-in-a-Group Job
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Choose whether to retain existing category names or delete the entire job.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                {/* Option 1: Retain Category Names */}
                <button
                  type="button"
                  onClick={handleClearCompetitorsKeepCategories}
                  className="w-full text-left p-4 rounded-xl border-2 border-amber-400 bg-amber-50/50 hover:bg-amber-100/70 transition-all cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-amber-600" />
                      Clear Competitors (Remain Category Names)
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-200/80 text-amber-900">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-normal pl-5.5">
                    Deletes current competitors from all groups, but <strong>strictly keeps all {retainedCategories.length} category names intact</strong> so you can import or paste new athletes into them.
                  </p>
                </button>

                {/* Option 2: Delete Entire Job */}
                <button
                  type="button"
                  onClick={handleDeleteAllJobAndCategories}
                  className="w-full text-left p-4 rounded-xl border border-rose-200 bg-rose-50/30 hover:bg-rose-50 text-slate-700 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-rose-800 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      Delete Entire Job (Clear Categories &amp; Competitors)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal pl-5.5">
                    Clears all competitors and wipes all retained category names completely.
                  </p>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setClearJobModalOpen(false)}
                  className="w-full py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Category Modal */}
      {newCategoryModalOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
          <div 
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity"
            onClick={() => setNewCategoryModalOpen(false)}
          />

          <div className="flex min-h-full items-center justify-center p-4 text-center animate-fade-in">
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-sm border border-slate-100 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 shrink-0">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    Add Category
                  </h4>
                  <p className="text-xs text-slate-500">
                    This category will remain persistent in your list.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Category Name
                </label>
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomCategory();
                    }
                  }}
                  placeholder="e.g. Female 15–17 Group, Under 60kg..."
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-400"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setNewCategoryModalOpen(false);
                    setNewCategoryInput('');
                  }}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomCategory}
                  disabled={!newCategoryInput.trim()}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-xl transition-all cursor-pointer shadow-xs text-center"
                >
                  Add &amp; Retain
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
