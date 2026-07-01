import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { RosterPanel } from './components/RosterPanel';
import { CategoriesPanel } from './components/CategoriesPanel';
import { BracketCanvas } from './components/BracketCanvas';
import { ClubReportPanel } from './components/ClubReportPanel';
import { StatisticsPanel } from './components/StatisticsPanel';
import { CertificateBuilderPanel } from './components/CertificateBuilderPanel';
import { EventsManagerModal } from './components/EventsManagerModal';
import { AuthScreen } from './components/AuthScreen';
import { db, auth, collection, doc, setDoc, getDocs, deleteDoc, getDoc, onAuthStateChanged } from './lib/firebase';
import { PdfBracketParserPanel } from './components/PdfBracketParserPanel';
import { Athlete, WeightCategory, BracketModel, DuplicateGroup, SavedEvent } from './types';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { replaceOklchInString } from './utils/colorUtils';
import { decompressFromGzipBase64 } from './utils/compression';
import {
  buildRosterFromText,
  groupRoster,
  buildBracketModel,
  assignAllBoutNumbers,
  applyParsedBoutNumbers,
  handleCheckboxToggle,
  handleTextChange,
  handleUpdateLeafNode,
  handleSwapLeafNodes,
  shuffle,
  findDuplicateAthletes
} from './utils/bracketUtils';
import { ShieldAlert, Printer, RefreshCw, Trophy, Users, Hash, HelpCircle, Layers, AlertCircle, KeyRound, Trash2, Search, X, RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'bracket_builder_state_v1';
const EVENTS_STORAGE_KEY = 'bracket_builder_events_v1';
const CURRENT_ID_STORAGE_KEY = 'bracket_builder_current_event_id_v1';

// Robust local storage proxy that falls back to in-memory state in sandbox/iframe environments
const inMemoryDb: Record<string, string> = {};
const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return inMemoryDb[key] || null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      inMemoryDb[key] = value;
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      delete inMemoryDb[key];
    }
  }
};

const safeAlert = (message: string): void => {
  try {
    window.alert(message);
  } catch (e) {
    console.warn('window.alert blocked or unavailable in this environment:', message, e);
  }
};

const safeConfirm = (message: string): boolean => {
  try {
    return window.confirm(message);
  } catch (e) {
    console.warn('window.confirm blocked or unavailable in this environment, auto-confirming action.', e);
    return true;
  }
};

const DEMO_DATA = `Name,Club,Category,School,Gender
John Tan,Eagle Judo Club,-60kg,SMU,Male
Ali bin Hassan,Tiger Gym,-60kg,NUS,Male
Lim Wei Jian,Eagle Judo Club,-60kg,NTU,Male
Raj Kumar,Phoenix Club,-60kg,SIT,Male
Hafiz Rahman,Lotus Gym,-60kg,SUSS,Male
Marcus Lee,Star Gym,-66kg,NUS,Male
Kavin Selvam,Dragon Club,-66kg,NTU,Male
Yusuf Ibrahim,Tiger Gym,-66kg,SMU,Male
Daniel Wong,Eagle Judo Club,-66kg,SIT,Male
Amir Hakim,Phoenix Club,-73kg,SMU,Male
Brandon Goh,Star Gym,-73kg,NUS,Male
Faiz Rosli,Lotus Gym,-73kg,NTU,Male
Sophia Loren,Eagle Judo Club,-52kg,NTU,Female
Emma Watson,Iron Academy,-52kg,SMU,Female
Jane Doe,Tiger Gym,-57kg,NUS,Female
Clara Oswald,Phoenix Club,-57kg,SIT,Female`;

export default function App() {
  const [tournamentName, setTournamentName] = useState('');
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Record<string, WeightCategory>>({});
  const [brackets, setBrackets] = useState<Record<string, BracketModel>>({});
  const [ringCount, setRingCount] = useState(13);
  const [ringLabelFormat, setRingLabelFormat] = useState<'number' | 'letter'>('letter');
  const [boutLabelFormat, setBoutLabelFormat] = useState<'alpha-2' | 'thousands-3'>('alpha-2');
  const [shuffleSeed, setShuffleSeed] = useState(true);
  const [activeTab, setActiveTab] = useState<'brackets' | 'club-report' | 'statistics' | 'account' | 'pdf-bracket' | 'certificates'>(() => {
    try {
      const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const viewType = urlParams.get('view');
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const isReportPath = pathname.startsWith('/report') || pathname.startsWith('/club-report');
      if (viewType === 'brackets') {
        return 'brackets';
      }
      return 'club-report';
    } catch (e) {
      return 'club-report';
    }
  });
  const [dismissedDuplicates, setDismissedDuplicates] = useState<string[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedRingFilter, setSelectedRingFilter] = useState<string | number>('all');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [pdfExportLoading, setPdfExportLoading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [pdfError, setPdfError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'ok' | 'err' | 'idle' }>({
    text: '',
    type: 'idle',
  });
  const [pendingRosterImport, setPendingRosterImport] = useState<{
    parsed: Athlete[];
    source: string;
  } | null>(null);

  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<Record<string, string>>({});
  const [bracketLayout, setBracketLayout] = useState<'modern' | 'classic'>('classic');
  const [isPublicReportOnly, setIsPublicReportOnly] = useState(() => {
    return true; // Default to public report. If they login or are already logged in, Firebase onAuthStateChanged will set this to false.
  });

  const refreshSystemUsers = () => {
    const usersStr = safeLocalStorage.getItem('bracket_builder_users_db');
    let usersDb: Record<string, string> = {};
    try {
      usersDb = usersStr ? JSON.parse(usersStr) : {};
    } catch (e) {
      console.warn('Failed to parse system users db', e);
    }
    
    // Auto-seed admin if not present
    if (!usersDb['admin']) {
      usersDb['admin'] = 'admin';
      try {
        safeLocalStorage.setItem('bracket_builder_users_db', JSON.stringify(usersDb));
      } catch (e) {
        console.warn('Failed to save to localStorage', e);
      }
    }
    
    setSystemUsers(usersDb);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        setCurrentUser(user.email);
        setIsPublicReportOnly(false);
        setActiveTab('brackets');
        try {
          // Load saved events
          const eventsRef = collection(db, `users/${user.email}/events`);
          const snapshot = await getDocs(eventsRef);
          const eventsList: SavedEvent[] = [];
          snapshot.forEach(d => {
            const data = d.data();
            if (data.payload) {
              eventsList.push(JSON.parse(data.payload));
            } else {
              eventsList.push(data as SavedEvent);
            }
          });
          setSavedEvents(eventsList.sort((a, b) => b.timestamp - a.timestamp));

          // Load current ongoing state
          const currentRef = doc(db, `users/${user.email}/current/state`);
          const currentStateSnap = await getDoc(currentRef);
          if (currentStateSnap.exists()) {
             const data = currentStateSnap.data();
             const snap = data.payload ? JSON.parse(data.payload) : data;
             if (snap.tournamentName) setTournamentName(snap.tournamentName);
             if (snap.roster) setRoster(snap.roster);
             if (snap.categories) setCategories(snap.categories);
             if (snap.brackets) setBrackets(snap.brackets);
             if (snap.ringCount) setRingCount(snap.ringCount);
             if (snap.ringLabelFormat) setRingLabelFormat(snap.ringLabelFormat);
             if (snap.boutLabelFormat) setBoutLabelFormat(snap.boutLabelFormat);
             if (snap.shuffleSeed !== undefined) setShuffleSeed(snap.shuffleSeed);
             if (snap.dismissedDuplicates) setDismissedDuplicates(snap.dismissedDuplicates);
             if (snap.currentEventId) setCurrentEventId(snap.currentEventId);
          }
        } catch (err) {
          console.error("Error loading Firestore data:", err);
        }
      } else {
        setCurrentUser(null);
        setSavedEvents([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await import('./lib/firebase').then(m => m.signOut(auth));
    setIsPublicReportOnly(true);
  };

  const handleLogin = (username: string) => {
    // Handled by onAuthStateChanged
  };

  const handleDeleteUser = (uname: string) => {
    if (uname === 'admin') {
      safeAlert("Cannot delete the default admin account.");
      return;
    }
    if (uname === currentUser) {
      safeAlert("Cannot delete the currently logged-in account.");
      return;
    }
    const confirmed = safeConfirm(`Are you sure you want to delete user '${uname}'?`);
    if (!confirmed) return;

    const usersStr = safeLocalStorage.getItem('bracket_builder_users_db');
    if (usersStr) {
      try {
        const usersDb = JSON.parse(usersStr);
        delete usersDb[uname];
        safeLocalStorage.setItem('bracket_builder_users_db', JSON.stringify(usersDb));
        refreshSystemUsers();
      } catch (e) {
        console.warn('Failed to update system users db', e);
      }
    }
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  } | null>(null);

  const askConfirmation = (options: {
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }) => {
    setConfirmConfig(options);
  };

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial State Hydration from LocalStorage with URL sharing support
  useEffect(() => {
    try {
      refreshSystemUsers();
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewType = urlParams.get('view');
      let dataParam = urlParams.get('data');
      let idParam = urlParams.get('id');
      const pathname = window.location.pathname;

      const isReportPath = pathname.startsWith('/report') || pathname.startsWith('/club-report');
      
      if (isReportPath) {
        const parts = pathname.split('/');
        const possibleId = parts[parts.length - 1];
        if (possibleId && possibleId !== 'report' && possibleId !== 'club-report') {
          idParam = possibleId;
        }
      }

      if (viewType === 'club-report' || isReportPath || isPublicReportOnly) {
        setIsPublicReportOnly(true);
        setActiveTab('club-report');
        
        if (dataParam) {
          decompressFromGzipBase64(dataParam)
            .then(decompressed => JSON.parse(decompressed))
            .catch(() => {
              // Fallback to standard raw base64 if it is an old format URL
              const decodedJsonStr = decodeURIComponent(escape(atob(dataParam)));
              return JSON.parse(decodedJsonStr);
            })
            .then(parsed => {
              if (parsed) {
                const tName = parsed.tournamentName || parsed.t;
                const rost = parsed.roster || parsed.r;
                const cats = parsed.categories || parsed.c;
                const bracks = parsed.brackets || parsed.b;
                const rlFormat = parsed.ringLabelFormat || parsed.rl;
                
                if (tName) setTournamentName(tName);
                if (rost) setRoster(rost);
                if (cats) setCategories(cats);
                if (bracks) setBrackets(bracks);
                if (rlFormat) setRingLabelFormat(rlFormat);
                
                setStatusMessage({
                  text: `Loaded public tournament report for "${tName || 'Tournament'}"`,
                  type: 'ok',
                });
              }
            })
            .catch(err => {
              console.error('Failed to parse shareable data', err);
              setStatusMessage({
                text: 'Could not load public report data: invalid shared link.',
                type: 'err',
              });
            });
          return; // Bypass loading from localStorage
        } else {
          // Fetch from Firestore reports collection
          const activeId = idParam || 'active_state';
          setStatusMessage({
            text: activeId === 'active_state' ? 'Loading tournament report...' : 'Retrieving secure club report...',
            type: 'ok',
          });
          
          const docRef = doc(db, 'reports', activeId);
          let resolved = false;
          
          const handleReportData = (parsed: any) => {
            if (resolved) return;
            resolved = true;
            
            const tName = parsed.tournamentName || parsed.t;
            const rost = parsed.roster || parsed.r;
            const cats = parsed.categories || parsed.c;
            const bracks = parsed.brackets || parsed.b;
            const rlFormat = parsed.ringLabelFormat || parsed.rl;
            
            if (tName) setTournamentName(tName);
            if (rost) setRoster(rost);
            if (cats) setCategories(cats);
            if (bracks) setBrackets(bracks);
            if (rlFormat) setRingLabelFormat(rlFormat);
            
            if (parsed.ringCount) setRingCount(parsed.ringCount);
            if (parsed.ringLabelFormat) setRingLabelFormat(parsed.ringLabelFormat);
            if (parsed.boutLabelFormat) setBoutLabelFormat(parsed.boutLabelFormat);
            if (parsed.shuffleSeed !== undefined) setShuffleSeed(parsed.shuffleSeed);
            if (parsed.dismissedDuplicates !== undefined) setDismissedDuplicates(parsed.dismissedDuplicates);
            
            setStatusMessage({
              text: `Loaded public tournament report for "${tName || 'Tournament'}"`,
              type: 'ok',
            });
          };

          const useLocalCacheFallback = () => {
            if (resolved) return;
            resolved = true;
            const stored = safeLocalStorage.getItem(STORAGE_KEY);
            if (stored) {
              try {
                const snap = JSON.parse(stored);
                if (snap) {
                  if (snap.tournamentName) setTournamentName(snap.tournamentName);
                  if (snap.roster) setRoster(snap.roster);
                  if (snap.categories) setCategories(snap.categories);
                  if (snap.brackets) setBrackets(snap.brackets);
                  if (snap.ringCount) setRingCount(snap.ringCount);
                  if (snap.ringLabelFormat) setRingLabelFormat(snap.ringLabelFormat);
                  if (snap.boutLabelFormat) setBoutLabelFormat(snap.boutLabelFormat);
                  if (snap.shuffleSeed !== undefined) setShuffleSeed(snap.shuffleSeed);
                  if (snap.dismissedDuplicates !== undefined) setDismissedDuplicates(snap.dismissedDuplicates);
                  
                  setStatusMessage({
                    text: `Loaded tournament report from local cache (${snap.roster?.length || 0} athletes)`,
                    type: 'ok',
                  });
                  return;
                }
              } catch (e) {
                console.error(e);
              }
            }
            setStatusMessage({
              text: 'No active tournament report is available. Please log in as an administrator to create data.',
              type: 'idle',
            });
          };

          const handleFallback = () => {
            if (resolved) return;
            if (activeId !== 'active_state') {
              fetch(`/api/reports/${activeId}`)
                .then(res => {
                  if (!res.ok) throw new Error('Failed to find report.');
                  return res.json();
                })
                .then(parsed => {
                  if (parsed) {
                    handleReportData(parsed);
                  } else {
                    useLocalCacheFallback();
                  }
                })
                .catch(() => {
                  useLocalCacheFallback();
                });
            } else {
              useLocalCacheFallback();
            }
          };

          // 1.5-second timeout for rapid loading and instant fallback
          const timeoutId = setTimeout(() => {
            console.warn('Firestore fetch timed out, utilizing local storage/API fallback');
            handleFallback();
          }, 1500);

          getDoc(docRef)
            .then(docSnap => {
              clearTimeout(timeoutId);
              if (docSnap.exists()) {
                let parsed = docSnap.data();
                if (parsed.payload) {
                  try {
                    parsed = JSON.parse(parsed.payload);
                  } catch (e) {
                    console.error('Failed to parse report payload', e);
                  }
                }
                handleReportData(parsed);
              } else {
                handleFallback();
              }
            })
            .catch(err => {
              clearTimeout(timeoutId);
              console.error('Failed to query Firestore reports', err);
              handleFallback();
            });
          return;
        }
      }

      // Standard fallback load
      const storedUser = safeLocalStorage.getItem('bracket_builder_current_user_v1');
      if (storedUser) {
        setCurrentUser(storedUser);
      }

      const storedEvents = safeLocalStorage.getItem(EVENTS_STORAGE_KEY);
      if (storedEvents) {
        setSavedEvents(JSON.parse(storedEvents));
      }

      const storedId = safeLocalStorage.getItem(CURRENT_ID_STORAGE_KEY);
      if (storedId) {
        setCurrentEventId(storedId);
      }

      const stored = safeLocalStorage.getItem(STORAGE_KEY);
      if (stored) {
        const snap = JSON.parse(stored);
        if (snap) {
          if (snap.tournamentName) setTournamentName(snap.tournamentName);
          if (snap.roster) setRoster(snap.roster);
          if (snap.categories) setCategories(snap.categories);
          if (snap.brackets) setBrackets(snap.brackets);
          if (snap.ringCount) setRingCount(snap.ringCount);
          if (snap.ringLabelFormat) setRingLabelFormat(snap.ringLabelFormat);
          if (snap.boutLabelFormat) setBoutLabelFormat(snap.boutLabelFormat);
          if (snap.shuffleSeed !== undefined) setShuffleSeed(snap.shuffleSeed);
          if (snap.dismissedDuplicates !== undefined) setDismissedDuplicates(snap.dismissedDuplicates);
          
          setStatusMessage({
            text: `Restored previous session (${snap.roster?.length || 0} athletes loaded)`,
            type: 'ok',
          });
        }
      }
    } catch (e) {
      console.warn('Failed to restore from localstorage', e);
    }
  }, []);

  // 2. Automatic State Persistence Debouncer
  useEffect(() => {
    if (isPublicReportOnly) return; // Skip saving in public view to avoid overwriting local admin state
    // Skip saving first render where roster is empty
    if (roster.length === 0 && Object.keys(brackets).length === 0 && !tournamentName) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    setSaveStatus('saving');

    saveTimerRef.current = setTimeout(async () => {
      try {
        const snapshot = {
          tournamentName,
          roster,
          categories,
          brackets,
          ringCount,
          ringLabelFormat,
          boutLabelFormat,
          shuffleSeed,
          dismissedDuplicates,
          currentEventId,
        };
        safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        
        if (currentUser && auth.currentUser && auth.currentUser.email === currentUser) {
          const currentRef = doc(db, `users/${currentUser}/current/state`);
          await setDoc(currentRef, { payload: JSON.stringify(snapshot) });
          
          // Also publish to the global active state for public viewers without an ID
          const publicActiveRef = doc(db, 'reports', 'active_state');
          await setDoc(publicActiveRef, { payload: JSON.stringify(snapshot) });
        }

        setSaveStatus('saved');
        
        // Hide saved status after a block of time
        setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 3000);
      } catch (e) {
        console.error('Failed to write state', e);
        setSaveStatus('idle');
      }
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [tournamentName, roster, categories, brackets, ringCount, ringLabelFormat, boutLabelFormat, shuffleSeed, dismissedDuplicates, isPublicReportOnly]);

  // 3. Import Core Roster Handler
  const handleLoadRoster = (text: string, source: string) => {
    if (!text.trim()) {
      setStatusMessage({ text: 'Please drop a CSV file or paste spreadsheet rows to continue.', type: 'err' });
      return;
    }

    try {
      const parsed = buildRosterFromText(text);
      if (parsed.length === 0) {
        setStatusMessage({ text: 'No workable rows were identified. Ensure Name exists in column headers.', type: 'err' });
        return;
      }

      if (roster.length > 0) {
        // Roster already contains entries. Let user choose to merge/append or replace.
        setPendingRosterImport({ parsed, source });
      } else {
        // Direct replacement
        executeLoadRoster(parsed, source, 'replace');
      }
    } catch (e) {
      console.error(e);
      setStatusMessage({ text: 'CSV/TSV formulation syntax error. Check document format.', type: 'err' });
    }
  };

  const executeLoadRoster = (newAthletes: Athlete[], source: string, mode: 'replace' | 'append') => {
    let nextRoster = newAthletes;
    if (mode === 'append') {
      nextRoster = [...roster, ...newAthletes];
    }

    setRoster(nextRoster);
    setDismissedDuplicates([]);
    
    // Maintain existing configured rings when grouping
    const grouped = groupRoster(nextRoster, categories);
    setCategories(grouped);
    setBrackets({}); // Flush existing match trees in favor of new structure

    setStatusMessage({
      text: mode === 'append'
        ? `Successfully appended ${newAthletes.length} athletes from ${source}. Total active headcount is now ${nextRoster.length} across ${Object.keys(grouped).length} divisions.`
        : `Successfully imported ${newAthletes.length} athletes from ${source} across ${Object.keys(grouped).length} weight divisions.`,
      type: 'ok',
    });
    setPendingRosterImport(null);
  };

  const handleImportPdfDivisions = (
    importedDivisions: Array<{
      categoryName: string;
      competitors: Array<{ name: string; club: string }>;
      bouts?: Array<{ athlete1: string; athlete2: string; boutNumber: number }>;
    }>,
    ringAllocations: Record<string, number>,
    shouldReplace: boolean
  ) => {
    // 1. Create Athlete entries from raw extracted competitors
    const newAthletes: Athlete[] = [];
    importedDivisions.forEach((div) => {
      div.competitors.forEach((comp) => {
        if (!comp.name || comp.name.trim() === '' || comp.name.toLowerCase() === 'bye') {
          return;
        }
        newAthletes.push({
          name: comp.name.trim(),
          club: (comp.club || 'Unattached').trim(),
          weight: div.categoryName.trim(),
        });
      });
    });

    // 2. Compute final roster state
    const nextRoster = shouldReplace ? newAthletes : [...roster, ...newAthletes];
    setRoster(nextRoster);
    setDismissedDuplicates([]);

    // 3. Keep existing configured rings and overlay new ring allocations
    const ringConfigs: Record<string, { ring: number }> = {};
    if (!shouldReplace) {
      Object.keys(categories).forEach((key) => {
        ringConfigs[key] = { ring: categories[key].ring || 1 };
      });
    }
    Object.keys(ringAllocations).forEach((key) => {
      ringConfigs[key] = { ring: ringAllocations[key] };
    });

    // 4. Update categories
    const nextCategories = groupRoster(nextRoster, ringConfigs);
    setCategories(nextCategories);

    // 5. Autogenerate bracket drawings for new divisions
    const nextBrackets = shouldReplace ? {} : { ...brackets };
    importedDivisions.forEach((div) => {
      const key = div.categoryName.trim();
      const cat = nextCategories[key];
      if (cat && cat.entrants.length >= 1) {
        let entrants = cat.entrants.slice(0, 64);
        if (shuffleSeed) {
          entrants = shuffle(entrants);
        }
        const model = buildBracketModel(entrants, cat.size, key);
        if (div.bouts && div.bouts.length > 0) {
          applyParsedBoutNumbers(model, div.bouts);
        }
        nextBrackets[key] = model;
      }
    });

    assignAllBoutNumbers(nextCategories, nextBrackets);
    setBrackets(nextBrackets);

    setStatusMessage({
      text: `Successfully imported ${newAthletes.length} athletes across ${importedDivisions.length} divisions and placed them into their ring allocations. Brackets populated with official bout numbers of the PDF!`,
      type: 'ok',
    });
  };

  const handleUseSample = () => {
    handleLoadRoster(DEMO_DATA, 'demo roster');
  };

  // Duplicate Athlete Handlers
  const handleKeepOneDuplicate = (group: DuplicateGroup) => {
    const toRemoveIndices = group.indices.slice(1);
    const nextRoster = roster.filter((_, idx) => !toRemoveIndices.includes(idx));
    setRoster(nextRoster);

    const grouped = groupRoster(nextRoster, categories);
    setCategories(grouped);
    setBrackets({});

    setStatusMessage({
      text: `Cleaned up duplicates for ${group.name}. Kept 1 copy.`,
      type: 'ok',
    });
  };

  const handleKeepOneAllDuplicates = (activeGroups: DuplicateGroup[]) => {
    const indicesToRemove: number[] = [];
    activeGroups.forEach(group => {
      indicesToRemove.push(...group.indices.slice(1));
    });

    const nextRoster = roster.filter((_, idx) => !indicesToRemove.includes(idx));
    setRoster(nextRoster);

    const grouped = groupRoster(nextRoster, categories);
    setCategories(grouped);
    setBrackets({});
    setDismissedDuplicates([]);

    setStatusMessage({
      text: `Removed duplicate extras from roster. Safe-kept ${roster.length - indicesToRemove.length} unique athlete profiles.`,
      type: 'ok',
    });
  };

  const handleMaintainDuplicate = (signature: string) => {
    setDismissedDuplicates(prev => [...prev, signature]);
  };

  const handleMaintainAllDuplicates = (activeGroups: DuplicateGroup[]) => {
    setDismissedDuplicates(prev => [...prev, ...activeGroups.map(g => g.signature)]);
  };

  // 4. Group Configuration Actions
  const handleUpdateCategoryRing = (categoryKey: string, ring: number) => {
    setCategories((prev) => {
      const next = { ...prev };
      if (next[categoryKey]) {
        next[categoryKey] = { ...next[categoryKey], ring };
      }
      return next;
    });

    // Re-order sequential ring numbering on adjustment
    setBrackets((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const mockCategories = { ...categories };
      if (mockCategories[categoryKey]) {
        mockCategories[categoryKey].ring = ring;
      }
      assignAllBoutNumbers(mockCategories, next);
      return next;
    });
  };

  const handleAutoAssignRings = () => {
    const keys = Object.keys(categories).filter((k) => categories[k].count >= 1);
    if (keys.length === 0) return;

    setCategories((prev) => {
      const next = { ...prev };
      keys.forEach((key, idx) => {
        next[key] = { ...next[key], ring: (idx % ringCount) + 1 };
      });
      return next;
    });

    // Cascade update to bouts if brackets are already drawn
    setBrackets((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const mockCategories = { ...categories };
      keys.forEach((key, idx) => {
        if (mockCategories[key]) {
          mockCategories[key].ring = (idx % ringCount) + 1;
        }
      });
      assignAllBoutNumbers(mockCategories, next);
      return next;
    });
  };

  const handleMoveToCategory = (sourceCatKey: string, leafIndex: number, targetCatKey: string) => {
    // 1. Get the bracket node for the athlete so we can identify them
    const model = brackets[sourceCatKey];
    if (!model) return;
    const leafNodes = model.nodes[0];
    const leafNode = leafNodes[leafIndex];
    if (!leafNode || leafNode.isBye || !leafNode.name) return;

    // 2. Identify the athlete in roster
    let athleteIndex = roster.findIndex((a) => {
      const matchName = (a.name || '').trim().toLowerCase() === leafNode.name!.trim().toLowerCase();
      const matchClub = (a.club || '').trim().toLowerCase() === (leafNode.club || '').trim().toLowerCase();
      const matchWeight = a.weight === sourceCatKey;
      return matchName && matchClub && matchWeight;
    });

    if (athleteIndex === -1) {
      // Fallback: match by name and category
      const fallbackIndex = roster.findIndex((a) => {
        const matchName = (a.name || '').trim().toLowerCase() === leafNode.name!.trim().toLowerCase();
        const matchWeight = a.weight === sourceCatKey;
        return matchName && matchWeight;
      });
      if (fallbackIndex === -1) {
        setStatusMessage({ text: `Could not identify athlete "${leafNode.name}" in roster.`, type: 'err' });
        return;
      }
      athleteIndex = fallbackIndex;
    }

    // 3. Move the athlete's weight in roster
    const nextRoster = [...roster];
    const athlete = { ...nextRoster[athleteIndex], weight: targetCatKey };
    nextRoster[athleteIndex] = athlete;
    setRoster(nextRoster);

    // 4. Update the categories mapping
    const grouped = groupRoster(nextRoster, categories);
    setCategories(grouped);

    // 5. Update brackets
    setBrackets((prev) => {
      const next = { ...prev };
      
      // Update source category bracket (since the player left)
      const oldGroup = grouped[sourceCatKey];
      if (oldGroup && oldGroup.count >= 1) {
        next[sourceCatKey] = buildBracketModel(oldGroup.entrants, oldGroup.size, sourceCatKey);
      } else {
        delete next[sourceCatKey];
      }

      // Update destination category bracket (since player joined)
      const newGroup = grouped[targetCatKey];
      if (newGroup && newGroup.count >= 1) {
        next[targetCatKey] = buildBracketModel(newGroup.entrants, newGroup.size, targetCatKey);
      } else {
        delete next[targetCatKey];
      }

      // Re-assign all bout numbers
      assignAllBoutNumbers(grouped, next);
      return next;
    });

    setStatusMessage({
      text: `Successfully transferred ${athlete.name} from "${sourceCatKey}" to "${targetCatKey}". Both brackets adjusted and rescheduled.`,
      type: 'ok',
    });
  };

  const handleDeleteCategory = (categoryKey: string) => {
    const cat = categories[categoryKey];
    if (!cat) return;

    askConfirmation({
      title: `Delete Weight Class "${categoryKey}"`,
      message: `Are you sure you want to permanently delete the weight class "${categoryKey}"? This will delete all ${cat.count} athlete(s) assigned to this class and remove its matches. This cannot be undone.`,
      confirmText: 'Delete Weight Class',
      isDanger: true,
      onConfirm: () => {
        const nextRoster = roster.filter((a) => (a.weight || 'Unspecified') !== categoryKey);
        setRoster(nextRoster);

        const grouped = groupRoster(nextRoster, categories);
        setCategories(grouped);

        setBrackets((prev) => {
          const next = { ...prev };
          delete next[categoryKey];
          assignAllBoutNumbers(grouped, next);
          return next;
        });

        setStatusMessage({
          text: `Successfully deleted weight class "${categoryKey}" and removed its ${cat.count} athlete(s).`,
          type: 'ok',
        });
      },
    });
  };

  // 5. Build/Draw Bracket Assemblies
  const handleGenerateBrackets = (targetRing?: number) => {
    const keysAll = Object.keys(categories);
    const eligibleKeys = keysAll.filter((k) => {
      const matchesRing = !targetRing 
        ? (categories[k].ring !== undefined && categories[k].ring > 0)
        : categories[k].ring === targetRing;
      return categories[k].count >= 1 && matchesRing;
    });

    if (eligibleKeys.length === 0 && targetRing) {
      const ringLabel = ringLabelFormat === 'letter' ? String.fromCharCode(64 + targetRing) : String(targetRing);
      askConfirmation({
        title: `Clear Ring ${ringLabel} Brackets`,
        message: `There are no ready-to-draw weight classes assigned to Ring ${ringLabel}. Do you want to clear any existing brackets for this ring?`,
        confirmText: 'Clear Ring Brackets',
        isDanger: true,
        onConfirm: () => {
          const next = { ...brackets };
          keysAll.forEach(k => {
            if (categories[k].ring === targetRing) {
              delete next[k];
            }
          });
          assignAllBoutNumbers(categories, next);
          setBrackets(next);
          setStatusMessage({
            text: `Cleared existing bracket draws for Ring ${ringLabel}.`,
            type: 'ok'
          });
        }
      });
      return;
    }

    if (eligibleKeys.length === 0) {
      setStatusMessage({ 
        text: 'No active weight classes (1+ entrants) are currently assigned to any Competition Ring. Please assign classes to rings first.', 
        type: 'err' 
      });
      return;
    }

    // Keep other rings' brackets when generating/regenerating specific ring only
    const nextBrackets: Record<string, BracketModel> = targetRing ? { ...brackets } : {};

    if (targetRing) {
      // Clear out only brackets assigned to this specific ring to avoid outdated relics
      keysAll.forEach((key) => {
        if (categories[key].ring === targetRing) {
          delete nextBrackets[key];
        }
      });
    }

    eligibleKeys.forEach((key) => {
      const c = categories[key];
      let entrants = c.entrants.slice(0, 64);
      if (shuffleSeed) {
        entrants = shuffle(entrants);
      }
      nextBrackets[key] = buildBracketModel(entrants, c.size, key);
    });

    assignAllBoutNumbers(categories, nextBrackets);
    setBrackets(nextBrackets);

    const targetLabel = targetRing
      ? `Ring ${ringLabelFormat === 'letter' ? String.fromCharCode(64 + targetRing) : String(targetRing)}`
      : 'all rings';
    setStatusMessage({
      text: `Successfully generated bracket draws and schedules for ${targetLabel}!`,
      type: 'ok',
    });

    // Auto-scroll layout window smoothly tobrackets viewport
    setTimeout(() => {
      const el = document.getElementById('bracketsSectionTitle');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // 6. Interactive Bracket Checkbox and Text Propagation
  const handleCheckboxToggleNode = (catKey: string, k: number, i: number, checked: boolean) => {
    setBrackets((prev) => {
      const next = handleCheckboxToggle(prev, catKey, k, i, checked);
      // Re-number bout codes across the ring
      assignAllBoutNumbers(categories, next);
      return next;
    });
  };

  const handleTextChangeNode = (catKey: string, k: number, i: number, text: string) => {
    setBrackets((prev) => {
      return handleTextChange(prev, catKey, k, i, text);
    });
  };

  const handleReshuffleSingleCategory = (catKey: string) => {
    askConfirmation({
      title: 'Reshuffle Category Seeds',
      message: `Are you sure you want to reset and reshuffle seeds for ${catKey}? All recorded matches inside this category will be wiped completely.`,
      confirmText: 'Reshuffle & Wipe Matches',
      isDanger: true,
      onConfirm: () => {
        const c = categories[catKey];
        if (!c) return;

        setBrackets((prev) => {
          const next = { ...prev };
          let entrants = c.entrants.slice(0, 64);
          entrants = shuffle(entrants);
          next[catKey] = buildBracketModel(entrants, c.size, catKey);
          assignAllBoutNumbers(categories, next);
          return next;
        });
      }
    });
  };

  // 6.5 Reset Brackets Handler
  const handleResetBrackets = () => {
    askConfirmation({
      title: 'Reset Tournament Brackets',
      message: 'Are you sure you want to clear all generated tournament brackets and match progress? This will reset the tournament back to the Competition Ring Allocation phase so you can adjust ring layouts, weights, or categories first. Your athlete roster and category assignments will remain intact.',
      confirmText: 'Reset to Ring Allocation',
      isDanger: true,
      onConfirm: () => {
        setBrackets({});
        setActiveTab('brackets');
        setStatusMessage({
          text: 'Generated brackets cleared! You are now back in the Competition Ring Allocation phase.',
          type: 'ok',
        });
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      }
    });
  };

  // 7. Full Session Reset Handler
  const handleClearAll = () => {
    askConfirmation({
      title: 'Reset Tournament Data',
      message: 'This will permanently delete your imported athlete list, weight categories, brackets, and match statuses. This action cannot be undone.',
      confirmText: 'Reset Everyone & All Brackets',
      isDanger: true,
      onConfirm: () => {
        setTournamentName('');
        setRoster([]);
        setDismissedDuplicates([]);
        setCategories({});
        setBrackets({});
        setRingCount(4);
        setShuffleSeed(true);
        setActiveTab('brackets');
        setCurrentEventId(null);
        safeLocalStorage.removeItem(CURRENT_ID_STORAGE_KEY);
        setStatusMessage({ text: 'Data has been reset successfully.', type: 'ok' });
        safeLocalStorage.removeItem(STORAGE_KEY);
      }
    });
  };

  // Event Archives Persistence Handlers
  const saveEventListToStorage = (list: SavedEvent[]) => {
    setSavedEvents(list);
    safeLocalStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(list));
  };

  const handleSaveCurrentEvent = async (customName?: string) => {
    const finalName = customName || tournamentName || 'Untitled Event';
    const newId = currentEventId || (Math.random().toString(36).substring(2, 9) + '-' + Date.now());
    
    const newEvent: SavedEvent = {
      id: newId,
      timestamp: Date.now(),
      tournamentName: finalName,
      athleteCount: roster.length,
      categoryCount: Object.keys(categories).length,
      bracketCount: Object.keys(brackets).length,
      roster,
      categories,
      brackets,
      ringCount,
      ringLabelFormat,
      boutLabelFormat,
      shuffleSeed,
      dismissedDuplicates,
    };

    let updatedList: SavedEvent[] = [];
    if (savedEvents.some(e => e.id === newId)) {
      updatedList = savedEvents.map(e => e.id === newId ? newEvent : e);
    } else {
      updatedList = [...savedEvents, newEvent];
    }
    updatedList = updatedList.sort((a, b) => b.timestamp - a.timestamp);

    saveEventListToStorage(updatedList);
    setCurrentEventId(newId);
    safeLocalStorage.setItem(CURRENT_ID_STORAGE_KEY, newId);
    setTournamentName(finalName);

    if (currentUser && auth.currentUser && auth.currentUser.email === currentUser) {
      try {
        const eventRef = doc(db, `users/${currentUser}/events/${newId}`);
        await setDoc(eventRef, {
          payload: JSON.stringify(newEvent),
          id: newId,
          timestamp: newEvent.timestamp,
          tournamentName: finalName
        });
      } catch (err) {
        console.error("Failed to save event to Firestore", err);
      }
    }

    setStatusMessage({
      text: `Successfully saved event "${finalName}" to library.`,
      type: 'ok',
    });
  };

  const handleOverwriteSavedEvent = (id: string) => {
    const existing = savedEvents.find(e => e.id === id);
    if (!existing) return;
    
    askConfirmation({
      title: 'Overwrite Stored Slot',
      message: `Are you sure you want to overwrite "${existing.tournamentName}" with your current layout? All previous details for this slot will be replaced.`,
      confirmText: 'Overwrite Slot',
      isDanger: true,
      onConfirm: async () => {
        const updatedEvent: SavedEvent = {
          ...existing,
          timestamp: Date.now(),
          athleteCount: roster.length,
          categoryCount: Object.keys(categories).length,
          bracketCount: Object.keys(brackets).length,
          roster,
          categories,
          brackets,
          ringCount,
          ringLabelFormat,
          boutLabelFormat,
          shuffleSeed,
          dismissedDuplicates,
        };

        const updatedList = savedEvents.map(e => e.id === id ? updatedEvent : e);
        saveEventListToStorage(updatedList.sort((a, b) => b.timestamp - a.timestamp));
        
        if (currentUser && auth.currentUser && auth.currentUser.email === currentUser) {
          try {
            const eventRef = doc(db, `users/${currentUser}/events/${id}`);
            await setDoc(eventRef, {
              payload: JSON.stringify(updatedEvent),
              id: id,
              timestamp: updatedEvent.timestamp,
              tournamentName: updatedEvent.tournamentName
            });
          } catch (err) {
            console.error("Failed to update event in Firestore", err);
          }
        }

        setStatusMessage({
          text: `Successfully updated (overwrote) event "${existing.tournamentName}".`,
          type: 'ok',
        });
      }
    });
  };

  const handleLoadSavedEvent = (id: string) => {
    const target = savedEvents.find(e => e.id === id);
    if (!target) return;

    const performLoad = () => {
      // Set state
      setTournamentName(target.tournamentName || '');
      setRoster(target.roster || []);
      setCategories(target.categories || {});
      setBrackets(target.brackets || {});
      setRingCount(target.ringCount || 13);
      setRingLabelFormat(target.ringLabelFormat || 'letter');
      setBoutLabelFormat(target.boutLabelFormat || 'alpha-2');
      setShuffleSeed(target.shuffleSeed !== undefined ? target.shuffleSeed : true);
      setDismissedDuplicates(target.dismissedDuplicates || []);
      setCurrentEventId(target.id);
      safeLocalStorage.setItem(CURRENT_ID_STORAGE_KEY, target.id);

      // Sync immediate item
      const snapshot = {
        tournamentName: target.tournamentName,
        roster: target.roster,
        categories: target.categories,
        brackets: target.brackets,
        ringCount: target.ringCount,
        ringLabelFormat: target.ringLabelFormat,
        boutLabelFormat: target.boutLabelFormat || 'alpha-2',
        shuffleSeed: target.shuffleSeed,
        dismissedDuplicates: target.dismissedDuplicates,
      };
      safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

      setIsEventsModalOpen(false);
      setStatusMessage({
        text: `Loaded event "${target.tournamentName}" (${target.roster?.length || 0} athletes, ${Object.keys(target.brackets || {}).length} brackets).`,
        type: 'ok',
      });
    };

    if (roster.length > 0) {
      askConfirmation({
        title: 'Load Saved Event',
        message: `Are you sure you want to load "${target.tournamentName}"? Unsaved changes in your current screen layout will be replaced by this archive layout.`,
        confirmText: 'Load Archive',
        onConfirm: performLoad,
      });
    } else {
      performLoad();
    }
  };

  const handleDeleteSavedEvent = (id: string) => {
    const target = savedEvents.find(e => e.id === id);
    if (!target) return;

    askConfirmation({
      title: 'Delete Event from History',
      message: `Are you sure you want to permanently delete "${target.tournamentName}" from saved history snapshots? This cannot be restored.`,
      confirmText: 'Delete Permanently',
      isDanger: true,
      onConfirm: async () => {
        const updatedList = savedEvents.filter(e => e.id !== id);
        saveEventListToStorage(updatedList);

        if (currentUser && auth.currentUser && auth.currentUser.email === currentUser) {
          try {
            const eventRef = doc(db, `users/${currentUser}/events/${id}`);
            await deleteDoc(eventRef);
          } catch (err) {
            console.error("Failed to delete event from Firestore", err);
          }
        }

        if (currentEventId === id) {
          setCurrentEventId(null);
          safeLocalStorage.removeItem(CURRENT_ID_STORAGE_KEY);
        }

        setStatusMessage({
          text: `Deleted event "${target.tournamentName}" from library.`,
          type: 'ok',
        });
      }
    });
  };

  const handleCreateNewBlankEvent = () => {
    const performReset = () => {
      setTournamentName('');
      setRoster([]);
      setDismissedDuplicates([]);
      setCategories({});
      setBrackets({});
      setRingCount(4);
      setShuffleSeed(true);
      setActiveTab('brackets');
      setCurrentEventId(null);
      safeLocalStorage.removeItem(CURRENT_ID_STORAGE_KEY);
      safeLocalStorage.removeItem(STORAGE_KEY);

      setIsEventsModalOpen(false);
      setStatusMessage({ text: 'Created new blank event. Roster is ready for import.', type: 'ok' });
    };

    if (roster.length > 0) {
      askConfirmation({
        title: 'Create New Blank Event',
        message: 'Are you sure you want to create a new blank event? Unsaved changes in your current layout will be cleared immediately.',
        confirmText: 'Create Blank Event',
        isDanger: true,
        onConfirm: performReset,
      });
    } else {
      performReset();
    }
  };

  const handleCreateNewEvent = (name: string, loadDemo = false) => {
    if (!name.trim()) return;
    const cleanName = name.trim();
    const newId = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    
    setTournamentName(cleanName);
    setCurrentEventId(newId);
    safeLocalStorage.setItem(CURRENT_ID_STORAGE_KEY, newId);

    if (loadDemo) {
      // populate standard sample data immediately
      try {
        const parsed = buildRosterFromText(DEMO_DATA);
        setRoster(parsed);
        setDismissedDuplicates([]);
        const grouped = groupRoster(parsed, {});
        setCategories(grouped);
        setBrackets({}); // flush
        setStatusMessage({
          text: `Initialized demo event "${cleanName}" with sandbox athletes.`,
          type: 'ok',
        });
      } catch (err) {
        setRoster([]);
        setCategories({});
        setBrackets({});
        setDismissedDuplicates([]);
      }
    } else {
      setRoster([]);
      setDismissedDuplicates([]);
      setCategories({});
      setBrackets({});
    }
  };

  // 8. Custom High-Fidelity SVG Print Trigger
  const handleExportPdf = () => {
    const TARGET_W = 1010;
    const TARGET_H = 480;

    const restoreStates: Array<() => void> = [];

    // Temporarily add 'no-print' class to non-matching bracket pages so browser print ignores them
    if (selectedRingFilter !== 'all') {
      const allCards = document.querySelectorAll('.bracket-page-card');
      allCards.forEach((c) => {
        const ringAttr = c.getAttribute('data-ring');
        const match = String(ringAttr) === String(selectedRingFilter) || 
                      String(ringAttr) === String(getRingLabel(selectedRingFilter));
        if (!match) {
          const cardEl = c as HTMLElement;
          cardEl.classList.add('no-print');
          restoreStates.push(() => {
            cardEl.classList.remove('no-print');
          });
        }
      });
    }

    // Direct selection of generated canvas wrapper nodes
    const canv = document.querySelectorAll('.bracket-canvas');

    canv.forEach((el) => {
      const canvas = el as HTMLElement;
      const wrap = canvas.parentElement as HTMLElement;
      if (!canvas || !wrap) return;

      // Skip scaling if container is filtered out
      if (wrap.closest('.no-print')) return;

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w === 0 || h === 0) return;

      let scale = Math.min(TARGET_W / w, TARGET_H / h);
      scale = Math.min(Math.max(scale, 0.2), 1.6);

      const prevTransform = canvas.style.transform;
      const prevWrapW = wrap.style.width;
      const prevWrapH = wrap.style.height;
      const prevOverflow = wrap.style.overflow;

      canvas.style.transform = `scale(${scale})`;
      wrap.style.width = `${w * scale}px`;
      wrap.style.height = `${h * scale}px`;
      wrap.style.overflow = 'hidden';

      restoreStates.push(() => {
        canvas.style.transform = prevTransform;
        wrap.style.width = prevWrapW;
        wrap.style.height = prevWrapH;
        wrap.style.overflow = prevOverflow;
      });
    });

    const revertPrintSetup = () => {
      restoreStates.forEach((fn) => fn());
      window.removeEventListener('afterprint', revertPrintSetup);
    };

    window.addEventListener('afterprint', revertPrintSetup);
    setTimeout(() => {
      window.print();
      // Safeguard revert in case afterprint does not fire
      setTimeout(revertPrintSetup, 800);
    }, 50);
  };

  // Inject a temporary class into the body to force CSS scaling for export without destroying layout
  const handleDownloadProgrammaticPdf = async () => {
    setPdfExportLoading(true);
    setPdfError('');
    setPdfProgress({ current: 0, total: 0 });

    try {
      let elements = Array.from(document.querySelectorAll('.bracket-page-card')) as HTMLElement[];
      if (selectedRingFilter !== 'all') {
        elements = elements.filter((el) => {
          const ringAttr = el.getAttribute('data-ring');
          return String(ringAttr) === String(selectedRingFilter) || 
                 String(ringAttr) === String(getRingLabel(selectedRingFilter));
        });
      }

      if (elements.length === 0) {
        throw new Error(`No brackets found for Ring ${getRingLabel(selectedRingFilter)} to export. Please verify allocation setup.`);
      }

      setPdfProgress({ current: 0, total: elements.length });

      document.body.classList.add('exporting-pdf');
      elements.forEach((el) => el.classList.add('exporting-active'));

      // Wait a moment for the DOM layout to update after scaling back to 1 and showing the standings box
      await new Promise(r => setTimeout(r, 200));

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      for (let i = 0; i < elements.length; i++) {
        setPdfProgress({ current: i + 1, total: elements.length });
        const element = elements[i];

        const canvasWidthAttr = element.getAttribute('data-canvas-width');
        const canvasHeightAttr = element.getAttribute('data-canvas-height');
        
        let canvasWidth = 1400;
        let canvasHeight = 900;
        if (canvasWidthAttr && canvasHeightAttr) {
          canvasWidth = parseInt(canvasWidthAttr, 10);
          canvasHeight = parseInt(canvasHeightAttr, 10);
        }

        const imgData = await htmlToImage.toJpeg(element, {
          quality: 0.95,
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          width: element.scrollWidth,
          height: Math.max(element.scrollHeight, canvasHeight + 170), // Pad for title/footer
          skipFonts: true,
          filter: (node) => {
             return !(node.classList && node.classList.contains('no-print'));
          },
          style: {
            boxShadow: 'none',
            borderRadius: '0',
            border: 'none',
            margin: '0',
          }
        });

        if (i > 0) {
          pdf.addPage();
        }

        const pdfWidth = 297;
        const pdfHeight = 210;
        // The image generated is from the DOM element, so we need to measure the image or use the designated widths.
        // Using an image object to get its true dimensions
        const img = new Image();
        img.src = imgData;
        await new Promise((resolve) => { img.onload = resolve; });

        const imgW = img.width;
        const imgH = img.height;

        const marginTopBottom = 20; // 20mm top & bottom margin
        const marginLeftRight = 10; // 10mm left & right margin
        const maxW = pdfWidth - 2 * marginLeftRight;
        const maxH = pdfHeight - 2 * marginTopBottom;

        const ratioW = maxW / imgW;
        const ratioH = maxH / imgH;
        const ratio = Math.min(ratioW, ratioH);

        const printW = imgW * ratio;
        const printH = imgH * ratio;

        const x = marginLeftRight + (maxW - printW) / 2;
        const y = marginTopBottom; // Align to top margin instead of vertically centering

        pdf.addImage(imgData, 'JPEG', x, y, printW, printH, undefined, 'FAST');
      }

      document.body.classList.remove('exporting-pdf');
      elements.forEach((el) => el.classList.remove('exporting-active'));

      const ringSuffix = selectedRingFilter !== 'all' ? `_ring_${getRingLabel(selectedRingFilter).toLowerCase()}` : '';
      const filename = `${tournamentName ? tournamentName.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : 'tournament_brackets'}${ringSuffix}.pdf`;
      pdf.save(filename);
      setPdfExportLoading(false);
      setShowExportModal(false);
      setStatusMessage({
        text: `Successfully saved "${filename}" (${elements.length} divisions exported).`,
        type: 'ok',
      });
    } catch (err: any) {
      document.body.classList.remove('exporting-pdf');
      const elements = Array.from(document.querySelectorAll('.bracket-page-card')) as HTMLElement[];
      elements.forEach((el) => el.classList.remove('exporting-active'));
      console.error(err);
      setPdfError(err?.message || String(err) || 'Failed to export PDF.');
      if (err?.stack) {
        setPdfError((prev) => prev + '\n' + err.stack);
      }
      setPdfExportLoading(false);
    }
  };

  const handleDownloadSearchablePdf = async (ringFilter?: 'all' | number) => {
    setPdfExportLoading(true);
    setPdfError('');
    setPdfProgress({ current: 0, total: 0 });

    const activeFilter = ringFilter !== undefined ? ringFilter : selectedRingFilter;

    try {
      // Find keys of brackets that match the filter
      let keysToExport = bracketKeys;
      if (activeFilter !== 'all') {
        keysToExport = bracketKeys.filter((key) => {
          const cat = categories[key];
          return cat && (cat.ring === activeFilter || getRingLabel(cat.ring) === getRingLabel(activeFilter));
        });
      }

      if (keysToExport.length === 0) {
        throw new Error(`No brackets found for Ring ${getRingLabel(activeFilter)} to export. Please verify allocation setup.`);
      }

      setPdfProgress({ current: 0, total: keysToExport.length });

      // Create a Landscape A4 PDF Document
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      // Internal copy of getFormattedBout to avoid module exports mismatch
      const getFormattedBoutLabel = (
        ring: string | number,
        boutNumber: number | undefined
      ): string => {
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

      for (let index = 0; index < keysToExport.length; index++) {
        setPdfProgress({ current: index + 1, total: keysToExport.length });
        const key = keysToExport[index];
        const bracket = brackets[key];
        const cat = categories[key];
        
        if (!bracket) continue;

        if (index > 0) {
          pdf.addPage();
        }

        const ringLabel = getRingLabel(cat?.ring || 1);
        const entrantCount = cat?.count || 0;

        // Draw header
        // Center X: 148.5mm (half of 297mm)
        const centerX = 148.5;
        
        pdf.setTextColor(15, 23, 42); // slate-900
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        const titleText = (tournamentName || 'TOURNAMENT CHAMPIONSHIP').toUpperCase();
        pdf.text(titleText, centerX, 14, { align: 'center' });

        pdf.setTextColor(30, 41, 59); // slate-800
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(`RING ${ringLabel}`.toUpperCase(), centerX, 19, { align: 'center' });

        pdf.setTextColor(217, 119, 6); // amber-600
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text(bracket.categoryKey.toUpperCase(), centerX, 24, { align: 'center' });

        pdf.setTextColor(100, 116, 139); // slate-500
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        const dateStr = new Date().toISOString().split('T')[0];
        pdf.text(`${entrantCount} competitors  |  ${dateStr}`, centerX, 28, { align: 'center' });

        // Subtle dividing line
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.setLineWidth(0.35);
        pdf.line(20, 31, 277, 31);

        // Compute bracket structure positions (mirroring BracketCanvas exactly)
        const { size, numRounds, nodes } = bracket;

        let gap = 240;

        let ROW_PITCH = 46;
        if (size === 2) ROW_PITCH = 340;
        else if (size === 4) ROW_PITCH = 300;
        else if (size === 8) ROW_PITCH = 200;
        else if (size === 16) ROW_PITCH = 140;
        else if (size === 32) ROW_PITCH = 90;
        else if (size === 64) ROW_PITCH = 65;

        const PAD = 16;
        const BOX_W = 240;
        const BOX_H = 40;

        // Compute absolute positions dynamically for split symmetrical bracket
        const positions: { x: number; y: number }[][] = [];
        for (let k = 0; k <= numRounds; k++) {
          const count = size / Math.pow(2, k);
          const arr: { x: number; y: number }[] = [];
          for (let i = 0; i < count; i++) {
            let x: number;
            if (k === numRounds) {
              x = PAD + (numRounds - 1) * gap + BOX_W / 2 + 60;
            } else {
              const isLeft = i < count / 2;
              if (isLeft) {
                x = PAD + k * gap;
              } else {
                x = PAD + (2 * numRounds - 2 - k) * gap + BOX_W + 120;
              }
            }

            let y: number;
            if (k === 0) {
              const j = i < count / 2 ? i : (i - count / 2);
              y = PAD + j * ROW_PITCH + ROW_PITCH / 2;
            } else if (k === numRounds) {
              const prev1Y = positions[k - 1][0].y;
              const prev2Y = positions[k - 1][1].y;
              y = (prev1Y + prev2Y) / 2;
            } else {
              const prev1Y = positions[k - 1][2 * i].y;
              const prev2Y = positions[k - 1][2 * i + 1].y;
              y = (prev1Y + prev2Y) / 2;
            }
            arr.push({ x, y });
          }
          positions.push(arr);
        }

        const canvasWidth = numRounds === 0 ? PAD * 2 + BOX_W : PAD * 2 + (2 * numRounds - 2) * gap + 2 * BOX_W + 120;
        const baseCanvasHeight = PAD * 2 + Math.max(2, size / 2) * ROW_PITCH;
        const finalY = positions[numRounds]?.[0]?.y ?? (baseCanvasHeight / 2);
        const isClassic = bracketLayout === 'classic';
        const minRequiredHeight = finalY + (isClassic ? 75 : 95) + 180 + PAD;
        const canvasHeight = Math.max(baseCanvasHeight, minRequiredHeight);

        // Project coordinate math onto PDF dimensions
        // A4 Landscape available space inside margins
        const maxW = 273; // 297 - 24 (12mm margins)
        const maxH = 158; // 210 - 12 (top header) - 32 (header) - 8 (bottom margin)
        
        const scaleX = maxW / canvasWidth;
        const scaleY = maxH / canvasHeight;
        const scale = Math.min(scaleX, scaleY);

        const startX = 12 + (maxW - canvasWidth * scale) / 2;
        const startY = 38 + (maxH - canvasHeight * scale) / 2;

        const mapX = (ptX: number) => startX + ptX * scale;
        const mapY = (ptY: number) => startY + ptY * scale;

        const drawPdfLine = (x1: number, y1: number, x2: number, y2: number) => {
          pdf.line(mapX(x1), mapY(y1), mapX(x2), mapY(y2));
        };

        // Draw bracket line connectors (Vector graphics)
        pdf.setDrawColor(30, 41, 59); // slate-800
        pdf.setLineWidth(0.35);

        if (isClassic) {
           for (let k = 0; k <= numRounds; k++) {
               if (k === numRounds) continue;
               const count = positions[k].length;
               for (let i = 0; i < count; i++) {
                   const pos = positions[k][i];
                   drawPdfLine(pos.x, pos.y, pos.x + BOX_W, pos.y);
               }
           }
        }

        for (let k = 1; k <= numRounds; k++) {
          const count = positions[k].length;
          for (let m = 0; m < count; m++) {
            const c1 = positions[k - 1][2 * m];
            const c2 = positions[k - 1][2 * m + 1];
            const parent = positions[k][m];

            if (k === numRounds) {
              if (isClassic) {
                 const riserX = (c1.x + BOX_W + c2.x) / 2;
                 // Straight horizontal line joining the two sides
                 drawPdfLine(c1.x + BOX_W, c1.y, c2.x, c2.y);
              } else {
                 // Final match horizontal connectors removed per user request: "remove 1 left/right connector lines"
                 // drawPdfLine(c1.x + BOX_W, c1.y, parent.x, parent.y);
                 // drawPdfLine(c2.x, c2.y, parent.x + BOX_W, parent.y);
              }
            } else {
              const isLeftParent = m < count / 2;
              if (isLeftParent) {
                const riserX = (c1.x + BOX_W + parent.x) / 2;
                drawPdfLine(c1.x + BOX_W, c1.y, riserX, c1.y);
                drawPdfLine(c2.x + BOX_W, c2.y, riserX, c2.y);
                drawPdfLine(riserX, c1.y, riserX, c2.y);
                drawPdfLine(riserX, parent.y, parent.x, parent.y);
              } else {
                const riserX = (c1.x + parent.x + BOX_W) / 2;
                drawPdfLine(c1.x, c1.y, riserX, c1.y);
                drawPdfLine(c2.x, c2.y, riserX, c2.y);
                drawPdfLine(riserX, c1.y, riserX, c2.y);
                drawPdfLine(riserX, parent.y, parent.x + BOX_W, parent.y);
              }
            }
          }
        }

        // Draw Bout badges on the connector lines
        positions.forEach((roundPositions, k) => {
          if (k < 1) return;
          if (k === numRounds && !isClassic) return;
          
          roundPositions.forEach((pos, m) => {
            const node = nodes[k]?.[m];
            if (!node || typeof node.bout !== 'number') return;

            const BOUT_BOX_W = isClassic ? 110 : 100;
            const BOUT_BOX_H = isClassic ? 52 : 52;

            let riserX = 0;
            let riserY = pos.y;

            if (k === numRounds) {
               const c1 = positions[k - 1][0];
               const c2 = positions[k - 1][1];
               riserX = (c1.x + BOX_W + c2.x) / 2;
            } else {
               const c1 = positions[k - 1][2 * m];
               const isLeftParent = m < roundPositions.length / 2;
               riserX = isLeftParent
                 ? (c1.x + BOX_W + pos.x) / 2
                 : (c1.x + pos.x + BOX_W) / 2;
            }

            const rectLeft = mapX(riserX - BOUT_BOX_W / 2);
            const rectTop = mapY(riserY - BOUT_BOX_H / 2);
            const rectW = BOUT_BOX_W * scale;
            const rectH = BOUT_BOX_H * scale;

            pdf.setFillColor(255, 255, 255);
            pdf.setDrawColor(30, 41, 59);
            pdf.setLineWidth(0.3);
            
            if (isClassic) {
              pdf.rect(rectLeft, rectTop, rectW, rectH, 'FD');
            } else {
              pdf.roundedRect(rectLeft, rectTop, rectW, rectH, 1 * scale, 1 * scale, 'FD');
            }

            const boutText = getFormattedBoutLabel(getRingLabel(cat?.ring || 1), node.bout);
            pdf.setTextColor(30, 41, 59);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(Math.max(8, 60 * scale));
            pdf.text(boutText, rectLeft + rectW / 2, rectTop + rectH / 2 + (isClassic ? 2 * scale : 1.5 * scale), { align: 'center', baseline: 'middle' });
          });
        });

        // Draw Player Nodes (with searchable, crystal-clear text!)
        positions.forEach((roundPositions, k) => {
          roundPositions.forEach((pos, i) => {
            const node = nodes[k]?.[i];
            if (!node) return;

            const x = pos.x;
            const y = pos.y - (k === numRounds ? 23 : BOX_H / 2);

            const countInRound = size / Math.pow(2, k);
            const isLeft = k < numRounds && (i < countInRound / 2);

            const left = mapX(x);
            const top = mapY(y);
            const width = BOX_W * scale;
            const height = BOX_H * scale;

            if (k === 0) {
              if (node.isBye) {
                if (isClassic) {
                  pdf.setTextColor(100, 116, 139);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(5, 28.5 * scale));
                  
                  const labelText = `${node.seed} - BYE`;
                  const align = isLeft ? 'left' : 'right';
                  const textX = isLeft ? left + 20 * scale : left + width - 20 * scale;
                  // Shifted by +10px (+10 * scale) down
                  pdf.text(labelText, textX, top + height / 2 - 10 * scale, { align });
                } else {
                  pdf.setFillColor(248, 250, 252);
                  pdf.setDrawColor(226, 232, 240);
                  pdf.setLineWidth(0.25);
                  pdf.roundedRect(left, top, width, height, 1 * scale, 1 * scale, 'FD');

                  pdf.setTextColor(148, 163, 184);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(5, 8.5 * scale));
                  
                  const seedText = String(node.seed);
                  const byeText = 'BYE';
                  
                  if (isLeft) {
                    pdf.text(seedText, left + 2.5 * scale, top + height / 2, { align: 'left', baseline: 'middle' });
                    pdf.text(byeText, left + 8 * scale, top + height / 2, { align: 'left', baseline: 'middle' });
                  } else {
                    pdf.text(seedText, left + width - 2.5 * scale, top + height / 2, { align: 'right', baseline: 'middle' });
                    pdf.text(byeText, left + width - 8 * scale, top + height / 2, { align: 'right', baseline: 'middle' });
                  }
                }
              } else {
                if (isClassic) {
                  const nameAlign = isLeft ? 'left' : 'right';
                  const textX = isLeft ? left + 20 * scale : left + width - 20 * scale;

                  pdf.setTextColor(15, 23, 42);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(5, 56.5 * scale));
                  const nameText = `${node.seed} - ${(node.name || '').toUpperCase()}`;
                  // Shifted by +10px (+10 * scale) down
                  pdf.text(nameText, textX, top + height / 2 - 10 * scale, { align: nameAlign });

                  pdf.setTextColor(100, 116, 139);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(4, 54 * scale));
                  const clubText = node.club || '(Ind.)';
                  // Shifted by -10px (-10 * scale) up (moved up 1 row)
                  pdf.text(clubText.toUpperCase(), textX, top + height / 2 + 24 * scale, { align: nameAlign });
                } else {
                  if (node.checked) {
                    pdf.setFillColor(240, 253, 250);
                    pdf.setDrawColor(16, 185, 129);
                  } else {
                    pdf.setFillColor(255, 255, 255);
                    pdf.setDrawColor(30, 41, 59);
                  }
                  pdf.setLineWidth(0.35);
                  pdf.roundedRect(left, top, width, height, 1 * scale, 1 * scale, 'FD');

                  pdf.setTextColor(148, 163, 184);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(4, 8 * scale));
                  const seedText = String(node.seed);
                  const seedX = isLeft ? left + 2.5 * scale : left + width - 2.5 * scale;
                  const seedAlign = isLeft ? 'left' : 'right';
                  pdf.text(seedText, seedX, top + height / 2, { align: seedAlign, baseline: 'middle' });

                  const contentAlign = isLeft ? 'left' : 'right';
                  const contentX = isLeft ? left + 8 * scale : left + width - 8 * scale;
                  
                  pdf.setTextColor(15, 23, 42);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(5, 9 * scale));
                  pdf.text((node.name || '').toUpperCase(), contentX, top + height / 3 + 0.5 * scale, { align: contentAlign, baseline: 'middle' });

                  pdf.setTextColor(100, 116, 139);
                  pdf.setFont('helvetica', 'normal');
                  pdf.setFontSize(Math.max(4, 7.5 * scale));
                  pdf.text((node.club || 'Ind.').toUpperCase(), contentX, top + (2 * height) / 3 + 0.5 * scale, { align: contentAlign, baseline: 'middle' });
                }
              }
            } else if (k < numRounds) {
              if (!node.isBye) {
                if (isClassic) {
                  if (node.name) {
                    const nameAlign = isLeft ? 'left' : 'right';
                    const textX = isLeft ? left + 20 * scale : left + width - 20 * scale;

                    pdf.setTextColor(15, 23, 42);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(Math.max(5, 56.5 * scale));
                    // Shifted by +10px (+10 * scale) down
                    pdf.text((node.name || '').toUpperCase(), textX, top + height / 2 - 10 * scale, { align: nameAlign });

                    if (node.club) {
                      pdf.setTextColor(100, 116, 139);
                      pdf.setFont('helvetica', 'bold');
                      pdf.setFontSize(Math.max(4, 54 * scale));
                      // Shifted by -10px (-10 * scale) up (moved up 1 row)
                      pdf.text(node.club.toUpperCase(), textX, top + height / 2 + 24 * scale, { align: nameAlign });
                    }
                  }
                } else {
                  if (node.checked) {
                    pdf.setFillColor(240, 253, 250);
                    pdf.setDrawColor(16, 185, 129);
                  } else {
                    pdf.setFillColor(255, 255, 255);
                    pdf.setDrawColor(30, 41, 59);
                  }
                  pdf.setLineWidth(0.35);
                  pdf.roundedRect(left, top, width, height, 1 * scale, 1 * scale, 'FD');

                  if (node.name) {
                    const contentAlign = isLeft ? 'left' : 'right';
                    const contentX = isLeft ? left + 4 * scale : left + width - 4 * scale;

                    pdf.setTextColor(15, 23, 42);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(Math.max(5, 9 * scale));
                    pdf.text((node.name || '').toUpperCase(), contentX, top + height / 2, { align: contentAlign, baseline: 'middle' });
                  }
                }
              }
            } else {
              if (isClassic) {
                const centerTextX = left + width / 2;
                if (node.name) {
                  pdf.setTextColor(15, 23, 42);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(6, 56.5 * scale));
                  pdf.text((node.name || '').toUpperCase(), centerTextX, top + height / 2 - 10 * scale, { align: 'center' });
                  
                  const clubText = node.club || '(Ind.)';
                  pdf.setTextColor(100, 116, 139);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(4, 54 * scale));
                  pdf.text(clubText.toUpperCase(), centerTextX, top + height / 2 + 24 * scale, { align: 'center' });
                } else {
                  pdf.setTextColor(203, 213, 225);
                  pdf.setFont('helvetica', 'bold');
                  pdf.setFontSize(Math.max(6, 46.5 * scale));
                  // pdf.text('CHAMPION', centerTextX, top + height / 2, { align: 'center' }); // Hidden per user request
                }
              } else {
                const champHeight = 46 * scale;
                pdf.setFillColor(254, 252, 232);
                pdf.setDrawColor(245, 158, 11);
                pdf.setLineWidth(0.5);
                pdf.roundedRect(left, top, width, champHeight, 1.5 * scale, 1.5 * scale, 'FD');

                const badgeText = node.bout ? `FINAL · ${getFormattedBoutLabel(getRingLabel(cat?.ring || 1), node.bout)}` : 'CHAMPION';
                pdf.setFillColor(245, 158, 11);
                pdf.rect(left + width / 4, top - 3 * scale, width / 2, 6 * scale, 'F');
                pdf.setTextColor(15, 23, 42);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(Math.max(4, 7 * scale));
                pdf.text(badgeText, left + width / 2, top, { align: 'center', baseline: 'middle' });

                const champName = node.name ? node.name.toUpperCase() : ''; // GRAND CHAMPION hidden per user request
                pdf.setTextColor(120, 53, 4);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(Math.max(5, 10 * scale));
                if (champName) {
                  pdf.text(`🏆  ${champName}`, left + width / 2, top + champHeight / 2 + 1 * scale, { align: 'center', baseline: 'middle' });
                }
              }
            }
          });
        });

        // Draw Blank Manual Standings Box at the bottom center of each category (for manual writing after download)
        const standingsW = 110; // mm
        const standingsH = 34; // mm
        const stLeft = startX + (canvasWidth * scale) / 2 - (standingsW / 2);
        const stTop = startY + canvasHeight * scale - standingsH + 3; // Shifted down 5mm (from -2 to +3)

        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(203, 213, 225); // slate-300
        pdf.setLineWidth(0.35);
        pdf.roundedRect(stLeft, stTop, standingsW, standingsH, 2, 2, 'FD');

        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.roundedRect(stLeft, stTop, standingsW, 7, 2, 2, 'F');
        pdf.rect(stLeft, stTop + 4, standingsW, 3, 'F');
        pdf.setDrawColor(203, 213, 225); // slate-300
        pdf.line(stLeft, stTop + 7, stLeft + standingsW, stTop + 7);

        pdf.setTextColor(51, 65, 85); // slate-700
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.text('🏆 FINAL STANDINGS 🏆', stLeft + standingsW / 2, stTop + 3.5, { align: 'center', baseline: 'middle' });

        const rowH = (standingsH - 7) / 4; // 27 / 4 = 6.75 mm per row
        const medals = ['1.', '2.', '3.', '4.'];
        const numColors = [
          [245, 158, 11], // amber-500
          [148, 163, 184], // slate-400
          [180, 83, 9], // amber-700
          [100, 116, 139] // slate-500
        ];

        for (let idx = 0; idx < 4; idx++) {
          const rowY = stTop + 7 + idx * rowH;
          if (idx > 0) {
            pdf.setDrawColor(226, 232, 240); // slate-200
            pdf.line(stLeft, rowY, stLeft + standingsW, rowY);
          }

          // Number
          const [r, g, b] = numColors[idx];
          pdf.setTextColor(r, g, b);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.text(medals[idx], stLeft + 5, rowY + rowH / 2, { align: 'left', baseline: 'middle' });

          // Bracket / bracket sign on the right
          pdf.setTextColor(203, 213, 225); // slate-300
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8.5);
          pdf.text(']', stLeft + standingsW - 5, rowY + rowH / 2, { align: 'right', baseline: 'middle' });
        }
      }

      const ringSuffix = activeFilter !== 'all' ? `_ring_${getRingLabel(activeFilter).toLowerCase()}` : '';
      const filename = `${tournamentName ? tournamentName.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : 'tournament_brackets'}${ringSuffix}_searchable.pdf`;
      pdf.save(filename);
      setPdfExportLoading(false);
      setShowExportModal(false);
      setStatusMessage({
        text: `Successfully saved searchable PDF "${filename}" (${keysToExport.length} divisions exported).`,
        type: 'ok',
      });
    } catch (err: any) {
      console.error(err);
      setPdfError(err?.message || String(err) || 'Failed to export PDF.');
      if (err?.stack) {
        setPdfError((prev) => prev + '\n' + err.stack);
      }
      setPdfExportLoading(false);
    }
  };

  const hasData = roster.length > 0;
  const bracketKeys = Object.keys(brackets).sort((a, b) => {
    const ringA = categories[a]?.ring || 0;
    const ringB = categories[b]?.ring || 0;
    if (ringA !== ringB) {
      return ringA - ringB;
    }
    return a.localeCompare(b);
  });

  const filteredBracketKeys = bracketKeys.filter((key) => {
    if (!adminSearchQuery.trim()) return true;
    const lowerQuery = adminSearchQuery.trim().toLowerCase();
    
    // Match category/weight class name
    if (key.toLowerCase().includes(lowerQuery)) return true;
    
    // Match player name or club name inside this category
    const hasMatchingAthlete = roster.some(
      (a) =>
        (a.weight || 'Unspecified') === key &&
        ((a.name || '').toLowerCase().includes(lowerQuery) || (a.club && a.club.toLowerCase().includes(lowerQuery)))
    );
    if (hasMatchingAthlete) return true;
    
    return false;
  });

  const searchSuggestions = useMemo(() => {
    const query = adminSearchQuery.trim().toLowerCase();
    
    const allCategories = bracketKeys;
    const allAthletes = Array.from(new Set(roster.map(a => a.name.trim()).filter(Boolean))) as string[];
    const allClubs = Array.from(new Set(roster.map(a => a.club?.trim()).filter(Boolean))) as string[];

    if (!query) {
      return {
        categories: allCategories.slice(0, 3).map(name => ({ name, type: 'category' })),
        athletes: [],
        clubs: allClubs.slice(0, 3).map(name => ({ name, type: 'club' })),
        totalCount: Math.min(3, allCategories.length) + Math.min(3, allClubs.length)
      };
    }

    const matchedCats = allCategories
      .filter(cat => cat.toLowerCase().includes(query))
      .slice(0, 4)
      .map(name => ({ name, type: 'category' }));

    const matchedAthletes = allAthletes
      .filter(name => name.toLowerCase().includes(query))
      .slice(0, 4)
      .map(name => ({ name, type: 'athlete' }));

    const matchedClubs = allClubs
      .filter(club => club.toLowerCase().includes(query))
      .slice(0, 4)
      .map(name => ({ name, type: 'club' }));

    return {
      categories: matchedCats,
      athletes: matchedAthletes,
      clubs: matchedClubs,
      totalCount: matchedCats.length + matchedAthletes.length + matchedClubs.length
    };
  }, [adminSearchQuery, bracketKeys, roster]);

  const duplicateGroups = findDuplicateAthletes(roster);
  const activeDuplicateGroups = duplicateGroups.filter(
    (g) => !dismissedDuplicates.includes(g.signature)
  );

  const getRingLabel = (ringNum: number | string) => {
    if (ringLabelFormat === 'letter') {
      const num = typeof ringNum === 'string' ? parseInt(ringNum, 10) : ringNum;
      if (isNaN(num) || num < 1) return String(ringNum);
      return String.fromCharCode(64 + num);
    }
    return String(ringNum);
  };

  // Compute ring distribution parameters
  const ringStats: Record<number, { count: number; bouts: number }> = {};
  for (let r = 1; r <= ringCount; r++) {
    ringStats[r] = { count: 0, bouts: 0 };
  }
  Object.keys(categories).forEach((k) => {
    const ring = categories[k].ring;
    const isValidRing = typeof ring === 'number' && ring >= 1 && ring <= ringCount;
    if (isValidRing && ringStats[ring]) {
      ringStats[ring].count += categories[k].count;
      if (brackets[k]) {
        // count the active numbered bouts
        const activeBouts = brackets[k].nodes.slice(1).flatMap((r) => r).filter((n) => typeof n.bout === 'number').length;
        ringStats[ring].bouts += activeBouts;
      }
    }
  });

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-950 font-sans tracking-tight antialiased print:bg-white">
      <div className="max-w-[1400px] mx-auto px-4 py-6 md:py-10 print:max-w-none print:px-0 print:py-0 print:mx-0">
        
        {/* Header Navigation Area */}
        <Header
          tournamentName={tournamentName}
          setTournamentName={setTournamentName}
          onClearAll={handleClearAll}
          hasData={bracketKeys.length > 0}
          saveStatus={saveStatus}
          onOpenEventsModal={() => setIsEventsModalOpen(true)}
          savedEventsCount={savedEvents.length}
          onLogout={handleLogout}
          currentUser={currentUser}
          isPublicView={isPublicReportOnly}
          onLoginClick={() => setIsPublicReportOnly(false)}
        />

        {!currentUser && !isPublicReportOnly ? (
          <div className="py-10 flex flex-col items-center">
            <AuthScreen onLogin={handleLogin} mode="login" />
            <button 
              onClick={() => setIsPublicReportOnly(true)}
              className="mt-6 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
              ← Back to Public View
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-4 print:block print:w-full print:mt-0">
          
          {/* LEFT SIDEBAR NAVIGATION & QUICK CONTROL CENTER */}
          {!isPublicReportOnly && (
            <div className="lg:col-span-3 space-y-6 no-print print:hidden flex flex-col">
              {/* View Switching Tab Selector */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-sm space-y-3.5">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                  Master Navigation
                </h3>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('brackets')}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer border ${
                      activeTab === 'brackets'
                        ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-md'
                        : 'bg-slate-50 border-slate-200/50 hover:border-slate-300 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-base">🥋</span>
                    <span className="text-left flex-1 font-extrabold text-sm">Draws &amp; Matches</span>
                    {bracketKeys.length > 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                        activeTab === 'brackets' ? 'bg-slate-800 text-amber-400' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {bracketKeys.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (bracketKeys.length > 0) {
                        setActiveTab('club-report');
                      }
                    }}
                    disabled={bracketKeys.length === 0}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-3 border ${
                      bracketKeys.length === 0
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200/80 text-slate-400'
                        : activeTab === 'club-report'
                        ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-md cursor-pointer'
                        : 'bg-slate-50 border-slate-200/50 hover:border-slate-300 text-slate-700 hover:text-slate-900 cursor-pointer'
                    }`}
                    title={bracketKeys.length === 0 ? "Generate brackets to unlock club reports" : "View fight schedules grouped by club"}
                  >
                    <span className="text-base">📋</span>
                    <span className="text-left flex-1 font-extrabold text-sm">Club Reports</span>
                    {bracketKeys.length > 0 ? (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                        activeTab === 'club-report' ? 'bg-slate-800 text-amber-400' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {Array.from(new Set(roster.map(a => a.club).filter(Boolean))).length}
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 font-mono rounded">Lock</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (bracketKeys.length > 0) {
                        setActiveTab('statistics');
                      }
                    }}
                    disabled={bracketKeys.length === 0}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-3 border ${
                      bracketKeys.length === 0
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200/80 text-slate-400'
                        : activeTab === 'statistics'
                        ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-md cursor-pointer'
                        : 'bg-slate-50 border-slate-200/50 hover:border-slate-300 text-slate-700 hover:text-slate-900 cursor-pointer'
                    }`}
                    title={bracketKeys.length === 0 ? "Generate brackets to view statistics" : "View tournament statistics and medals"}
                  >
                    <span className="text-base">📊</span>
                    <span className="text-left flex-1 font-extrabold text-sm">Statistics & Medals</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('pdf-bracket')}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer border ${
                      activeTab === 'pdf-bracket'
                        ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-md'
                        : 'bg-slate-50 border-slate-200/50 hover:border-slate-300 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-base">📄</span>
                    <span className="text-left flex-1 font-extrabold text-sm font-sans">PDF Bracket Parser</span>
                    <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-mono font-bold uppercase animate-pulse shrink-0">
                      AI
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('certificates')}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer border ${
                      activeTab === 'certificates'
                        ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-md'
                        : 'bg-slate-50 border-slate-200/50 hover:border-slate-300 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-base">🏆</span>
                    <span className="text-left flex-1 font-extrabold text-sm">Award Certificates</span>
                    <span className="text-[9px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded font-mono font-bold uppercase shrink-0">
                      NEW
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('account')}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-3 cursor-pointer border ${
                      activeTab === 'account'
                        ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-md'
                        : 'bg-slate-50 border-slate-200/50 hover:border-slate-300 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span className="text-base">👤</span>
                    <span className="text-left flex-1 font-extrabold text-sm">Account &amp; Admin</span>
                    {!currentUser ? (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                        activeTab === 'account' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-600'
                      }`}>
                        Login
                      </span>
                    ) : (
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                        activeTab === 'account' ? 'bg-emerald-500 text-slate-900' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        Active
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Tournament Statistics summary card */}
              {hasData && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-800 text-[10px] tracking-wider uppercase flex items-center gap-1.5 pb-2 border-b border-slate-100 font-mono">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <span>Tournament Stats</span>
                  </h3>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl text-center">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Fighters</p>
                      <p className="text-base font-black text-slate-900 mt-0.5">{roster.length}</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl text-center">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Classes</p>
                      <p className="text-base font-black text-slate-900 mt-0.5">{Object.keys(categories).length}</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl text-center">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Draws</p>
                      <p className="text-base font-black text-slate-900 mt-0.5 text-emerald-600">
                        {bracketKeys.length}
                      </p>
                    </div>
                  </div>

                  {/* Ring status indicators */}
                  {bracketKeys.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h4 className="text-[10px] font-bold text-slate-450 uppercase tracking-widest font-mono">Ring Layout Allocations</h4>
                      <div className="max-h-[160px] overflow-y-auto pr-1 divide-y divide-slate-100 scrollbar-thin">
                        {Object.entries(ringStats).map(([rng, data]) => {
                          const label = getRingLabel(rng);
                          return (
                            <div key={rng} className="flex justify-between items-center py-2 text-xs font-medium">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded bg-slate-900 text-[8px] text-white flex items-center justify-center font-bold">
                                  {label}
                                </span>
                                <span className="text-slate-700 font-extrabold text-[11px]">Ring {label}</span>
                              </div>
                              <div className="text-slate-500 font-mono text-right flex items-center gap-2 text-[11px]">
                                <span>{data.count} Pl</span>
                                <span className="bg-amber-100 text-amber-900 font-black px-1.5 py-0.5 rounded text-[10px]">
                                  {data.bouts} Bouts
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Premium quick ref guide inside left column */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl text-slate-300">
                <h3 className="font-bold text-amber-400 text-xs flex items-center gap-2 pb-2 border-b border-slate-800 font-mono uppercase tracking-wider">
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  <span>Coach Quick Assist</span>
                </h3>
                <ul className="space-y-3 mt-3.5 text-[11px] text-slate-300 leading-relaxed list-disc list-inside">
                  <li>
                    Click target athlete <strong className="text-white font-bold">checkboxes</strong> in bracket cards to advance seeds.
                  </li>
                  <li>
                    Roster imports configure bracket draws directly to standard <strong className="text-amber-400">2, 4, 8, 16, 32 or 64</strong> tiers.
                  </li>
                  <li>
                    Click individual competitor names inside draws to dynamically <strong className="text-white">swap them</strong> or rewrite details!
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* RIGHT MASTER CONTENT VIEW AREA */}
          <div className={`${isPublicReportOnly ? 'lg:col-span-12' : 'lg:col-span-9'} space-y-6 print:w-full print:p-0`}>
            {isPublicReportOnly && bracketKeys.length === 0 ? (
              statusMessage.type === 'err' ? (
                <div className="max-w-md mx-auto bg-white border border-rose-200 rounded-3xl p-8 shadow-md text-center space-y-4">
                  <div className="inline-flex bg-rose-50 text-rose-500 p-4 rounded-full border border-rose-150">
                    <AlertCircle className="w-6 h-6 text-rose-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {statusMessage.text || 'Error Loading Report'}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    No tournament data could be found. Please ensure you copied the entire URL, or ask your event organizer to generate a new public link.
                  </p>
                </div>
              ) : statusMessage.type === 'idle' ? (
                <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-8 shadow-md text-center space-y-4">
                  <div className="inline-flex bg-amber-50 text-amber-500 p-4 rounded-full border border-amber-100">
                    <Trophy className="w-6 h-6 text-amber-600" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    No Active Report Loaded
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    There is currently no active tournament report to view. Please use a shared public report link, or ask your administrator/organizer to share their club report.
                  </p>
                </div>
              ) : (
                <div className="max-w-md mx-auto bg-white border border-slate-200/80 rounded-2xl p-8 shadow-md text-center space-y-4 animate-pulse">
                  <div className="inline-flex bg-amber-500/10 p-4 rounded-full text-amber-500 border border-amber-500/25">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {statusMessage.text || 'Loading Club Report...'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Fetching real-time bracket draws, rings, and schedules...
                  </p>
                </div>
              )
            ) : activeTab === 'account' ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm no-print mb-6">
                  <div className="flex items-start gap-4">
                    <div className="inline-flex bg-emerald-500/10 p-3 rounded-full border border-emerald-500/20 text-emerald-500 shrink-0">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 tracking-tight">Active Admin: {currentUser}</h3>
                      <p className="text-sm font-semibold text-slate-500 mt-1">You are logged into the administration console.</p>
                      <button
                        onClick={handleLogout}
                        className="mt-4 px-5 py-2 bg-slate-900 border border-slate-800 text-white rounded-xl text-xs font-bold shadow hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (!tournamentName || !currentEventId) && !isPublicReportOnly ? (
              <div className="max-w-2xl mx-auto bg-white border border-slate-200/80 rounded-3xl p-8 md:p-10 shadow-xl space-y-8 no-print animate-fade-in">
                <div className="text-center space-y-3">
                  <div className="inline-flex bg-amber-500/10 p-5 rounded-full border border-amber-500/20 text-amber-500 mb-2">
                    <Trophy className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Create your Bracket Event</h2>
                  <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Before uploading rosters or generating interactive brackets, you must name and initialize your tournament event.
                  </p>
                </div>

                <div className="border border-slate-100 bg-slate-50/50 p-6 md:p-8 rounded-2xl space-y-5">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider font-mono">Option A: New Event Setup</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const nameInput = (document.getElementById('startupTournamentName') as HTMLInputElement)?.value;
                    if (nameInput) {
                      handleCreateNewEvent(nameInput, false);
                    }
                  }} className="space-y-4">
                    <div>
                      <label htmlFor="startupTournamentName" className="block text-xs font-bold text-slate-700 mb-1.5">
                        Tournament / Event Name
                      </label>
                      <input
                        id="startupTournamentName"
                        type="text"
                        required
                        placeholder="E.g., 2026 Judo Summer Championships"
                        className="w-full bg-white border border-slate-250 hover:border-slate-350 focus:border-amber-500 text-slate-950 placeholder-slate-400 rounded-xl px-4 py-3 text-sm transition-all outline-none focus:ring-1 focus:ring-amber-500/30"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                      <button
                        type="submit"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 text-sm font-black rounded-xl cursor-pointer shadow-md transition-all active:scale-98 font-bold"
                      >
                        <span>Create Fresh Event</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleCreateNewEvent('Judo Winter Open 2026', true);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/75 border border-emerald-200 text-xs font-bold rounded-xl cursor-pointer transition-all active:scale-98 font-bold"
                      >
                        <span>Use Demo Event with Sandbox Data</span>
                      </button>
                    </div>
                  </form>
                </div>

                {savedEvents.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between border-t border-slate-100 pt-6">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider font-mono">Option B: Load a History Snapshot</h3>
                      <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold">
                        {savedEvents.length} Saved Event{savedEvents.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="grid gap-3 max-h-[220px] overflow-y-auto pr-1">
                      {savedEvents.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={() => handleLoadSavedEvent(ev.id)}
                          className="w-full text-left p-4 rounded-xl border border-slate-150 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-between gap-4 group cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900 text-sm truncate group-hover:text-amber-600 transition-colors">
                              {ev.tournamentName || 'Untitled Event'}
                            </p>
                            <p className="text-[10px] font-mono text-slate-450 mt-1 font-medium pb-0.5">
                              {ev.athleteCount} athletes · {ev.bracketCount} divisions · {new Date(ev.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-xs font-mono bg-slate-100 group-hover:bg-amber-500 group-hover:text-slate-950 font-bold px-2.5 py-1 rounded-lg text-slate-600 transition-all">
                            Load →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* 1. SETUP PANELS (Only rendered on the active Brackets tab) */}
                {activeTab === 'brackets' && (
              <div className="space-y-6">
                {/* Athletes roster input card */}
                <RosterPanel
                  onLoadRoster={handleLoadRoster}
                  onUseSample={handleUseSample}
                  statusMessage={bracketKeys.length > 0 ? { text: '', type: 'idle' } : statusMessage}
                  totalAthletes={roster.length}
                />

                {/* DUPLICATE ALERT CARD */}
                {activeDuplicateGroups.length > 0 && (
                  <div 
                    id="duplicateCollapseCard"
                    className="bg-amber-50/70 border-2 border-amber-300 text-amber-950 rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-200 no-print"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-extrabold flex items-center justify-center shrink-0">
                          <ShieldAlert className="w-5 h-5 text-slate-950" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                            Duplicate Entries Found
                          </h3>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                            We detected <strong className="font-bold text-slate-900">{activeDuplicateGroups.length}</strong> athlete profile{activeDuplicateGroups.length === 1 ? '' : 's'} registered multiple times in the same division (matching Name, Club, and Weight Category).
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto pr-1 divide-y divide-amber-200/50 bg-white/65 rounded-xl border border-amber-200/50 p-3 space-y-1 bg-white">
                      {activeDuplicateGroups.map((group) => (
                        <div key={group.signature} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 text-xs">
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{group.name}</p>
                            <p className="text-slate-500 font-medium text-[11px] mt-0.5">
                              {group.club} · <span className="bg-amber-100/80 text-amber-900 font-extrabold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">{group.weight}</span>
                            </p>
                            <p className="text-[10px] text-amber-800 font-bold mt-1 inline-flex items-center gap-1">
                              ● Found {group.count} identical rows
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <button
                              onClick={() => handleKeepOneDuplicate(group)}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-950 hover:text-white px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-sm active:scale-95"
                              title="Delete extra rows and only keep 1 entry"
                            >
                              Keep Only 1
                            </button>
                            <button
                              onClick={() => handleMaintainDuplicate(group.signature)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border border-slate-200 cursor-pointer active:scale-95"
                              title="Keep as separate duplicates"
                            >
                              Maintain
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <p className="text-xs text-slate-500 italic max-w-md">
                        Note: Cleaning up duplicates will keep exactly 1 copy of each entrant and refresh the bracket tree.
                      </p>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handleKeepOneAllDuplicates(activeDuplicateGroups)}
                          className="flex-1 sm:flex-initial bg-amber-500 hover:bg-amber-600 text-slate-950 hover:text-white px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <span>Keep 1 of Each</span>
                        </button>
                        <button
                          onClick={() => handleMaintainAllDuplicates(activeDuplicateGroups)}
                          className="flex-1 sm:flex-initial bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                        >
                          <span>Maintain All</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Weights config and Ring layout parameters */}
                {hasData && (
                  <CategoriesPanel
                    categories={categories}
                    ringCount={ringCount}
                    setRingCount={setRingCount}
                    onAutoAssignRings={handleAutoAssignRings}
                    onUpdateCategoryRing={handleUpdateCategoryRing}
                    shuffleSeed={shuffleSeed}
                    setShuffleSeed={setShuffleSeed}
                    onGenerateBrackets={handleGenerateBrackets}
                    ringLabelFormat={ringLabelFormat}
                    setRingLabelFormat={setRingLabelFormat}
                    boutLabelFormat={boutLabelFormat}
                    setBoutLabelFormat={setBoutLabelFormat}
                    onExportPdf={() => setShowExportModal(true)}
                    onDownloadSearchablePdf={handleDownloadSearchablePdf}
                    hasBrackets={bracketKeys.length > 0}
                    onDeleteCategory={handleDeleteCategory}
                    onResetBrackets={handleResetBrackets}
                  />
                )}
              </div>
            )}

            {/* 2. COACH'S CLUB REPORT VIEW ("OTHER PAGE") */}
            {activeTab === 'club-report' && bracketKeys.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ClubReportPanel
                  categories={categories}
                  brackets={brackets}
                  roster={roster}
                  ringLabelFormat={ringLabelFormat}
                  boutLabelFormat={boutLabelFormat}
                  tournamentName={tournamentName}
                  isPublicView={isPublicReportOnly}
                  onUpdateStandings={(catKey, nextStandings) => {
                    setBrackets((prev) => {
                      const existing = prev[catKey];
                      if (!existing) return prev;
                      return {
                        ...prev,
                        [catKey]: {
                          ...existing,
                          standings: nextStandings,
                        },
                      };
                    });
                  }}
                />
              </div>
            )}

            {/* 2.2 STATISTICS VIEW */}
            {activeTab === 'statistics' && bracketKeys.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <StatisticsPanel
                  roster={roster}
                  categories={categories}
                />
              </div>
            )}

            {/* 2.5 AI PDF BRACKET PARSER VIEW */}
            {activeTab === 'pdf-bracket' && (
              <PdfBracketParserPanel
                ringCount={ringCount}
                ringLabelFormat={ringLabelFormat}
                hasExistingRoster={roster.length > 0}
                onImport={handleImportPdfDivisions}
                onShowMessage={setStatusMessage}
              />
            )}

            {/* 2.6 CERTIFICATES VIEW */}
            {activeTab === 'certificates' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <CertificateBuilderPanel
                  roster={roster}
                  tournamentName={tournamentName}
                />
              </div>
            )}

            {/* 3. ACCOUNT / AUTHENTICATION VIEW */}
            {activeTab === 'account' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm no-print">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight mb-6">User Account Settings</h2>
                  {!currentUser ? (
                    <AuthScreen onLogin={handleLogin} />
                  ) : (
                    <div className="text-center py-10 space-y-4">
                      <div className="inline-flex bg-emerald-500/10 p-5 rounded-full border border-emerald-500/20 text-emerald-500 mb-2">
                        <Users className="w-10 h-10" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800">Hello, {currentUser}</h3>
                      <p className="text-sm text-slate-500">You are currently logged in to the admin dashboard.</p>
                      <button
                        onClick={handleLogout}
                        className="mt-6 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold shadow hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Brackets generation grid assembly inside right master column */}
            {activeTab === 'brackets' && bracketKeys.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-200 print:mt-0 print:pt-0 print:border-none">
                <div className="flex flex-col md:flex-row md:items-baseline justify-between mb-6 gap-4 print:hidden">
                  <h2 id="bracketsSectionTitle" className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    🥋 Generated Tournament Brackets
                  </h2>
                  <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        onClick={() => setBracketLayout('modern')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${bracketLayout === 'modern' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Modern
                      </button>
                      <button
                        onClick={() => setBracketLayout('classic')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${bracketLayout === 'classic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Classic Style
                      </button>
                    </div>
                    <span className="text-xs bg-slate-200 text-slate-800 font-mono px-3 py-1 rounded-full font-bold no-print hidden md:inline-block">
                      {bracketKeys.length} active classes
                    </span>
                    <button
                      type="button"
                      onClick={handleResetBrackets}
                      className="px-3.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 no-print"
                      title="Reset all generated brackets back to competition allocation lanes"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Brackets</span>
                    </button>
                  </div>
                </div>

                {/* Announcement / Status Message Banner (Moved below the title) */}
                {statusMessage.text && statusMessage.type !== 'idle' && (
                  <div className="mb-6 no-print animate-in fade-in slide-in-from-top-2 duration-200">
                    {statusMessage.type === 'ok' ? (
                      <div className="bg-emerald-50 border border-emerald-250 text-emerald-900 px-4 py-3 rounded-2xl shadow-sm flex items-start gap-3 relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 mt-1.5 animate-pulse"></div>
                        <div className="flex-1 text-xs md:text-sm font-semibold pr-6">
                          {statusMessage.text}
                        </div>
                        <button
                          onClick={() => setStatusMessage({ text: '', type: 'idle' })}
                          className="absolute top-2.5 right-2.5 text-emerald-600 hover:text-emerald-900 transition-colors p-1.5 rounded-xl hover:bg-emerald-100/50"
                          title="Dismiss notification"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="bg-rose-50 border border-rose-250 text-rose-900 px-4 py-3 rounded-2xl shadow-sm flex items-start gap-3 relative">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 mt-1.5"></div>
                        <div className="flex-1 text-xs md:text-sm font-semibold pr-6">
                          {statusMessage.text}
                        </div>
                        <button
                          onClick={() => setStatusMessage({ text: '', type: 'idle' })}
                          className="absolute top-2.5 right-2.5 text-rose-600 hover:text-rose-900 transition-colors p-1.5 rounded-xl hover:bg-rose-100/50"
                          title="Dismiss notification"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Search Engine Input Card */}
                <div className="mb-6 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-4 no-print animate-in fade-in duration-200">
                  <div className="relative w-full flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-400" />
                    </span>
                    <input
                      id="bracketSearchEngine"
                      type="text"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-amber-500 rounded-xl text-sm font-semibold placeholder-slate-450 focus:outline-none focus:bg-white transition-all outline-none"
                      placeholder="Search admin brackets by category (e.g. -60kg) or competitor/player name..."
                      value={adminSearchQuery}
                      onChange={(e) => {
                        setAdminSearchQuery(e.target.value);
                        setSearchFocused(true);
                      }}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => {
                        setTimeout(() => setSearchFocused(false), 200);
                      }}
                    />
                    {adminSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setAdminSearchQuery('')}
                        className="absolute inset-y-0 right-10 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        title="Clear search query"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {searchFocused && searchSuggestions.totalCount > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-slate-100 no-print animate-in fade-in slide-in-from-top-1 duration-150">
                        {searchSuggestions.categories.length > 0 && (
                          <div className="p-2">
                            <span className="block px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                              Categories ({searchSuggestions.categories.length})
                            </span>
                            {searchSuggestions.categories.map((item, idx) => (
                              <button
                                key={`cat-${idx}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setAdminSearchQuery(item.name);
                                  setSearchFocused(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-800 rounded-lg transition-colors flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span className="truncate">{item.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-normal">Category</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchSuggestions.athletes.length > 0 && (
                          <div className="p-2">
                            <span className="block px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                              Competitors ({searchSuggestions.athletes.length})
                            </span>
                            {searchSuggestions.athletes.map((item, idx) => (
                              <button
                                key={`ath-${idx}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setAdminSearchQuery(item.name);
                                  setSearchFocused(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg transition-colors flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span className="truncate">{item.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-normal">Competitor</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchSuggestions.clubs.length > 0 && (
                          <div className="p-2">
                            <span className="block px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                              Clubs ({searchSuggestions.clubs.length})
                            </span>
                            {searchSuggestions.clubs.map((item, idx) => (
                              <button
                                key={`club-${idx}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setAdminSearchQuery(item.name);
                                  setSearchFocused(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 rounded-lg transition-colors flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Trophy className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                  <span className="truncate">{item.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-normal">Club</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200">
                    {adminSearchQuery ? (
                      <span>
                        Found <strong className="text-slate-900 font-extrabold">{filteredBracketKeys.length}</strong> of{' '}
                        <strong className="text-slate-700">{bracketKeys.length}</strong> categories
                      </span>
                    ) : (
                      <span>All <strong className="text-slate-900 font-extrabold">{bracketKeys.length}</strong> categories listed</span>
                    )}
                  </div>
                </div>

                {filteredBracketKeys.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-250 rounded-2xl p-10 text-center space-y-4 no-print my-6">
                    <div className="inline-flex p-4 bg-amber-50 rounded-full border border-amber-100 text-amber-500">
                      <Search className="w-8 h-8" />
                    </div>
                    <h3 className="font-extrabold text-slate-800 text-base">No brackets match your search query</h3>
                    <p className="text-xs text-slate-550 max-w-md mx-auto leading-relaxed">
                      We couldn't find any divisions or competitor/player names containing{' '}
                      <strong className="font-semibold text-slate-800">"{adminSearchQuery}"</strong>. Please try a different term or press button below to reset.
                    </p>
                    <button
                      type="button"
                      onClick={() => setAdminSearchQuery('')}
                      className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-850 text-white font-bold px-4.5 py-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
                    >
                      <span>Clear Search Filter</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6 print:space-y-0">
                    {filteredBracketKeys.map((key) => {
                      const model = brackets[key];
                      const cat = categories[key];
                      return (
                        <BracketCanvas
                          key={key}
                          bracket={model}
                          ring={getRingLabel(cat?.ring || 1)}
                          entrantCount={cat?.count || 0}
                          layout={bracketLayout}
                          boutLabelFormat={boutLabelFormat}
                          onReshuffle={() => handleReshuffleSingleCategory(key)}
                          onCheckboxToggle={(k, i, checked) => handleCheckboxToggleNode(key, k, i, checked)}
                          onTextChange={(k, i, text) => handleTextChangeNode(key, k, i, text)}
                          onUpdateStandings={(nextStandings) => {
                            setBrackets((prev) => {
                              const existing = prev[key];
                              if (!existing) return prev;
                              return {
                                ...prev,
                                [key]: {
                                  ...existing,
                                  standings: nextStandings,
                                },
                              };
                            });
                          }}
                          tournamentName={tournamentName}
                          onUpdateLeafNode={(i, name, club, isBye) => {
                            setBrackets((prev) => {
                              const next = handleUpdateLeafNode(prev, key, i, name, club, isBye);
                              assignAllBoutNumbers(categories, next);
                              return next;
                            });
                          }}
                          onSwapLeafNodes={(i, j) => {
                            setBrackets((prev) => {
                              const next = handleSwapLeafNodes(prev, key, i, j);
                              assignAllBoutNumbers(categories, next);
                              return next;
                            });
                          }}
                          categoriesList={Object.keys(categories).filter((cKey) => cKey !== key)}
                          onMoveToCategory={(i, targetCatKey) => handleMoveToCategory(key, i, targetCatKey)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Helpful layout print helper text banner footer inside right column */}
            {activeTab === 'brackets' && bracketKeys.length > 0 && (
              <p className="text-center text-xs text-slate-600 mt-8 mb-4 max-w-xl mx-auto leading-normal font-medium no-print">
                💡 <strong>Print Tip:</strong> Multi-layer sheets (16, 32, or 64 draws) can be quite dense. Choose <strong>A3</strong> dimensions or <strong>Landscape</strong> orientation inside the browser printer layout dialog to achieve superior legibility.
              </p>
            )}
              </>
            )}
          </div>
        </div>
        )}
      </div>

      {/* EXPORT OPTIONS MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl transition-all">
            
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/10 p-2 rounded-xl border border-amber-500/30">
                  <Printer className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-100">Export Brackets</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Select a destination or download format</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !pdfExportLoading && setShowExportModal(false)}
                disabled={pdfExportLoading}
                className="text-slate-400 hover:text-white hover:bg-slate-800 p-2 rounded-xl transition-all cursor-pointer disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 md:p-8 space-y-6 animate-fade-in">
              
              {pdfExportLoading ? (
                /* Loading Progress Screen */
                <div className="text-center py-8 space-y-5">
                  <div className="relative w-16 h-16 mx-auto">
                    {/* Spin loader */}
                    <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-slate-900 text-lg">Generating PDF File</h4>
                    <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                      Rendering high-resolution vector nodes for clean physical print outs. This can take a few seconds...
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="max-w-md mx-auto space-y-1.5">
                    <div className="flex justify-between text-xs font-mono text-slate-500">
                      <span>Progress</span>
                      <span className="font-bold text-slate-800">
                        {pdfProgress.current} / {pdfProgress.total} categories
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${(pdfProgress.current / (pdfProgress.total || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Option Cards screen */
                <div className="space-y-6">
                  {pdfError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-950 p-4 rounded-xl text-xs font-bold leading-relaxed flex gap-2">
                      <span className="text-rose-500 font-extrabold">🚨</span>
                      <span>{pdfError}</span>
                    </div>
                  )}

                  {/* Select Ring Filter */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest font-mono">
                      Filter by Ring Allocation
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRingFilter('all')}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                          selectedRingFilter === 'all'
                            ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        All Rings
                      </button>
                      {Array.from({ length: ringCount }, (_, idx) => {
                        const rNum = idx + 1;
                        const rLabel = getRingLabel(rNum);
                        const isSelected = selectedRingFilter === rNum;
                        return (
                          <button
                            key={`export-ring-btn-${rNum}`}
                            type="button"
                            onClick={() => setSelectedRingFilter(rNum)}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            Ring {rLabel}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold italic">
                      {selectedRingFilter === 'all' 
                        ? 'Export includes all bracket sheets sequentially.' 
                        : `Only bracket sheets allocated to Ring ${getRingLabel(selectedRingFilter)} will be exported.`}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* OPTION 1: DOWNLOAD SEARCHABLE VECTOR PDF */}
                    <button
                      type="button"
                      onClick={handleDownloadSearchablePdf}
                      className="bg-amber-500/5 hover:bg-amber-500/10 border-2 border-amber-500/60 hover:border-amber-500 p-5 rounded-2xl text-left transition-all cursor-pointer group shadow-xs hover:shadow-md flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                          <Search className="w-5 h-5 text-slate-950" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-base leading-tight group-hover:text-amber-600 transition-colors">
                            Download PDF (Searchable)
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed mt-1.5 font-medium">
                            RECOMMENDED. High-speed vector PDF download. Fully searchable and selectable player/club text. Perfect physical print quality.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-amber-600">
                        <span>Save Searchable PDF (.pdf)</span>
                        <span className="text-lg">→</span>
                      </div>
                    </button>

                    {/* OPTION 2: PROGRAMMATIC PDF DOWNLOAD (AS IMAGE) */}
                    <button
                      type="button"
                      onClick={handleDownloadProgrammaticPdf}
                      className="bg-slate-50/50 hover:bg-slate-100/50 border border-slate-200 hover:border-amber-400 p-5 rounded-2xl text-left transition-all cursor-pointer group shadow-xs hover:shadow-md flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                          <Trophy className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-base leading-tight">
                            Download PDF (As Image)
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed mt-1.5 font-medium">
                            Alternative rasterized image-based PDF download. Legacy compatibility if vector fonts fail to render.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>Save Image PDF (.pdf)</span>
                        <span className="text-lg">→</span>
                      </div>
                    </button>

                    {/* OPTION 3: NATIVE BROWSER PRINT */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportModal(false);
                        // Trigger print inside a slight deferral so the modal closes completely first
                        setTimeout(handleExportPdf, 250);
                      }}
                      className="bg-slate-50/50 hover:bg-slate-100/50 border border-slate-200 hover:border-slate-400 p-5 rounded-2xl text-left transition-all cursor-pointer group shadow-xs hover:shadow-md flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                          <Printer className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-base leading-tight">
                            Local Browser Printer
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed mt-1.5 font-medium">
                            Opens the system printer driver controls. Directly output to hardware printer or customize browser-managed PDF parameters.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>Physical Print / Browser driver</span>
                        <span className="text-lg">→</span>
                      </div>
                    </button>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex gap-3 items-start text-xs text-slate-500 leading-relaxed font-medium">
                    <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>Running inside AI Studio preview?</strong> Browser popup rules frequently disable native print overlays within sandboxed frames. If the print driver button fails to open, click <strong>Download PDF File</strong> to save the file, or open the app in a new tab.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Events Manager Archive Drawer */}
      <EventsManagerModal
        isOpen={isEventsModalOpen}
        onClose={() => setIsEventsModalOpen(false)}
        savedEvents={savedEvents}
        currentEventId={currentEventId}
        onLoadEvent={handleLoadSavedEvent}
        onSaveCurrentEvent={handleSaveCurrentEvent}
        onDeleteEvent={handleDeleteSavedEvent}
        onOverwriteEvent={handleOverwriteSavedEvent}
        onCreateNewBlankEvent={handleCreateNewBlankEvent}
        tournamentName={tournamentName}
        hasData={roster.length > 0}
      />

      {/* Multiple CSV Upload / Append vs Replace Choice Modal */}
      {pendingRosterImport && (
        <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setPendingRosterImport(null)}
          />

          <div className="flex min-h-full items-center justify-center p-4 text-center animate-fade-in">
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-md border border-slate-100 p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl shrink-0 bg-amber-50 text-amber-600 border border-amber-100">
                  <Users className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1.5 min-w-0 flex-1">
                  <h4 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                    Incoming Athletes File Detected
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    You uploaded <span className="text-amber-600 font-bold">"{pendingRosterImport.source}"</span> containing <span className="text-slate-900 font-extrabold">{pendingRosterImport.parsed.length} athletes</span>.
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    There are already <span className="text-slate-900 font-extrabold">{roster.length} athletes</span> in the active roster. Choose how to merge this data:
                  </p>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3 pt-1">
                {/* Option 1: Append & Merge */}
                <button
                  type="button"
                  onClick={() => executeLoadRoster(pendingRosterImport.parsed, pendingRosterImport.source, 'append')}
                  className="w-full text-left p-4 rounded-xl border border-amber-200/60 bg-amber-50/20 hover:bg-amber-50/50 transition-all group flex items-start gap-3 cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600 font-bold text-xs shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    +
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900 uppercase tracking-tight">Append & Merge Athletes</h5>
                    <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 leading-normal">
                      Combine new students into the current event. Ideal when running multi-stage registrations or adding last-minute fighters sequentially.
                    </p>
                  </div>
                </button>

                {/* Option 2: Overwrite and Replace */}
                <button
                  type="button"
                  onClick={() => executeLoadRoster(pendingRosterImport.parsed, pendingRosterImport.source, 'replace')}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-rose-200 bg-white hover:bg-rose-50/10 transition-all group flex items-start gap-3 cursor-pointer"
                >
                  <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-rose-100 text-slate-600 group-hover:text-rose-600 font-bold text-xs shrink-0 mt-0.5 transition-colors">
                    ↺
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-900 group-hover:text-rose-950 uppercase tracking-tight transition-colors">Overwrite Entire Event</h5>
                    <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 leading-normal">
                      Discard the current roster of {roster.length} fighters and replace it completely with the new list of {pendingRosterImport.parsed.length} fighters.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingRosterImport(null)}
                  className="w-full py-2.5 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 text-center"
                >
                  Cancel Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      {confirmConfig && (
        <div className="fixed inset-0 z-[200] overflow-y-auto no-print">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setConfirmConfig(null)}
          />

          {/* Centered card */}
          <div className="flex min-h-full items-center justify-center p-4 text-center animate-fade-in">
            <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 w-full max-w-sm border border-slate-100 p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl shrink-0 ${confirmConfig.isDanger ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                  {confirmConfig.isDanger ? <ShieldAlert className="w-5 h-5 animate-pulse" /> : <AlertCircle className="w-5 h-5" />}
                </div>
                <div className="space-y-1.5 min-w-0 flex-1">
                  <h4 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                    {confirmConfig.title}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    {confirmConfig.message}
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmConfig(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  {confirmConfig.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmConfig.onConfirm();
                    setConfirmConfig(null);
                  }}
                  className={`flex-1 px-4 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 text-center ${
                    confirmConfig.isDanger
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {confirmConfig.confirmText || 'Yes, Proceed'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
