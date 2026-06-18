import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { RosterPanel } from './components/RosterPanel';
import { CategoriesPanel } from './components/CategoriesPanel';
import { BracketCanvas } from './components/BracketCanvas';
import { ClubReportPanel } from './components/ClubReportPanel';
import { EventsManagerModal } from './components/EventsManagerModal';
import { Athlete, WeightCategory, BracketModel, DuplicateGroup, SavedEvent } from './types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { replaceOklchInString } from './utils/colorUtils';
import {
  buildRosterFromText,
  groupRoster,
  buildBracketModel,
  assignAllBoutNumbers,
  handleCheckboxToggle,
  handleTextChange,
  handleUpdateLeafNode,
  handleSwapLeafNodes,
  shuffle,
  findDuplicateAthletes
} from './utils/bracketUtils';
import { ShieldAlert, Printer, RefreshCw, Trophy, Users, Hash, HelpCircle, Layers, AlertCircle } from 'lucide-react';

const STORAGE_KEY = 'bracket_builder_state_v1';
const EVENTS_STORAGE_KEY = 'bracket_builder_events_v1';
const CURRENT_ID_STORAGE_KEY = 'bracket_builder_current_event_id_v1';

const DEMO_DATA = `Name,Club,Weight
John Tan,Eagle Judo Club,-60kg
Ali bin Hassan,Tiger Gym,-60kg
Lim Wei Jian,Eagle Judo Club,-60kg
Raj Kumar,Phoenix Club,-60kg
Hafiz Rahman,Lotus Gym,-60kg
Marcus Lee,Star Gym,-66kg
Kavin Selvam,Dragon Club,-66kg
Yusuf Ibrahim,Tiger Gym,-66kg
Daniel Wong,Eagle Judo Club,-66kg
Amir Hakim,Phoenix Club,-73kg
Brandon Goh,Star Gym,-73kg
Faiz Rosli,Lotus Gym,-73kg
Sophia Loren,Eagle Judo Club,-52kg
Emma Watson,Iron Academy,-52kg
Jane Doe,Tiger Gym,-57kg
Clara Oswald,Phoenix Club,-57kg`;

export default function App() {
  const [tournamentName, setTournamentName] = useState('');
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [categories, setCategories] = useState<Record<string, WeightCategory>>({});
  const [brackets, setBrackets] = useState<Record<string, BracketModel>>({});
  const [ringCount, setRingCount] = useState(4);
  const [ringLabelFormat, setRingLabelFormat] = useState<'number' | 'letter'>('number');
  const [shuffleSeed, setShuffleSeed] = useState(true);
  const [activeTab, setActiveTab] = useState<'brackets' | 'club-report'>('brackets');
  const [dismissedDuplicates, setDismissedDuplicates] = useState<string[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [pdfExportLoading, setPdfExportLoading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [pdfError, setPdfError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'ok' | 'err' | 'idle' }>({
    text: '',
    type: 'idle',
  });

  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);

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

  // 1. Initial State Hydration from LocalStorage
  useEffect(() => {
    try {
      const storedEvents = localStorage.getItem(EVENTS_STORAGE_KEY);
      if (storedEvents) {
        setSavedEvents(JSON.parse(storedEvents));
      }

      const storedId = localStorage.getItem(CURRENT_ID_STORAGE_KEY);
      if (storedId) {
        setCurrentEventId(storedId);
      }

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const snap = JSON.parse(stored);
        if (snap) {
          if (snap.tournamentName) setTournamentName(snap.tournamentName);
          if (snap.roster) setRoster(snap.roster);
          if (snap.categories) setCategories(snap.categories);
          if (snap.brackets) setBrackets(snap.brackets);
          if (snap.ringCount) setRingCount(snap.ringCount);
          if (snap.ringLabelFormat) setRingLabelFormat(snap.ringLabelFormat);
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
    // Skip saving first render where roster is empty
    if (roster.length === 0 && Object.keys(brackets).length === 0 && !tournamentName) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    setSaveStatus('saving');

    saveTimerRef.current = setTimeout(() => {
      try {
        const snapshot = {
          tournamentName,
          roster,
          categories,
          brackets,
          ringCount,
          ringLabelFormat,
          shuffleSeed,
          dismissedDuplicates,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        setSaveStatus('saved');
        
        // Hide saved status after a block of time
        setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 3000);
      } catch (e) {
        console.error('Failed to write to local storage', e);
        setSaveStatus('idle');
      }
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [tournamentName, roster, categories, brackets, ringCount, ringLabelFormat, shuffleSeed, dismissedDuplicates]);

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

      setRoster(parsed);
      setDismissedDuplicates([]);
      const grouped = groupRoster(parsed, categories);
      setCategories(grouped);
      setBrackets({}); // Flush existing match trees in favor of new structure

      setStatusMessage({
        text: `Successfully imported ${parsed.length} athletes from ${source} across ${Object.keys(grouped).length} weight divisions.`,
        type: 'ok',
      });
    } catch (e) {
      setStatusMessage({ text: 'CSV/TSV formulation syntax error. Check document format.', type: 'err' });
    }
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
    const keys = Object.keys(categories).filter((k) => categories[k].count >= 2);
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

  // 5. Build/Draw Bracket Assemblies
  const handleGenerateBrackets = () => {
    const eligibleKeys = Object.keys(categories).filter((k) => categories[k].count >= 2);
    if (eligibleKeys.length === 0) {
      setStatusMessage({ text: 'Ready-to-draw divisions (2+ entrants) are missing.', type: 'err' });
      return;
    }

    const nextBrackets: Record<string, BracketModel> = {};

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
        localStorage.removeItem(CURRENT_ID_STORAGE_KEY);
        setStatusMessage({ text: 'Data has been reset successfully.', type: 'ok' });
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  };

  // Event Archives Persistence Handlers
  const saveEventListToStorage = (list: SavedEvent[]) => {
    setSavedEvents(list);
    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(list));
  };

  const handleSaveCurrentEvent = (customName?: string) => {
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
      shuffleSeed,
      dismissedDuplicates,
    };

    let updatedList: SavedEvent[] = [];
    if (savedEvents.some(e => e.id === newId)) {
      updatedList = savedEvents.map(e => e.id === newId ? newEvent : e);
    } else {
      updatedList = [...savedEvents, newEvent];
    }

    saveEventListToStorage(updatedList);
    setCurrentEventId(newId);
    localStorage.setItem(CURRENT_ID_STORAGE_KEY, newId);
    setTournamentName(finalName);

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
      onConfirm: () => {
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
          shuffleSeed,
          dismissedDuplicates,
        };

        const updatedList = savedEvents.map(e => e.id === id ? updatedEvent : e);
        saveEventListToStorage(updatedList);
        
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
      setRingCount(target.ringCount || 4);
      setRingLabelFormat(target.ringLabelFormat || 'number');
      setShuffleSeed(target.shuffleSeed !== undefined ? target.shuffleSeed : true);
      setDismissedDuplicates(target.dismissedDuplicates || []);
      setCurrentEventId(target.id);
      localStorage.setItem(CURRENT_ID_STORAGE_KEY, target.id);

      // Sync immediate item
      const snapshot = {
        tournamentName: target.tournamentName,
        roster: target.roster,
        categories: target.categories,
        brackets: target.brackets,
        ringCount: target.ringCount,
        ringLabelFormat: target.ringLabelFormat,
        shuffleSeed: target.shuffleSeed,
        dismissedDuplicates: target.dismissedDuplicates,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

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
      onConfirm: () => {
        const updatedList = savedEvents.filter(e => e.id !== id);
        saveEventListToStorage(updatedList);

        if (currentEventId === id) {
          setCurrentEventId(null);
          localStorage.removeItem(CURRENT_ID_STORAGE_KEY);
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
      localStorage.removeItem(CURRENT_ID_STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);

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
    localStorage.setItem(CURRENT_ID_STORAGE_KEY, newId);

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
    const TARGET_W = 1500;
    const TARGET_H = 980;

    // Direct selection of generated canvas wrapper nodes
    const canv = document.querySelectorAll('.bracket-canvas');
    const restoreStates: Array<() => void> = [];

    canv.forEach((el) => {
      const canvas = el as HTMLElement;
      const wrap = canvas.parentElement as HTMLElement;
      if (!canvas || !wrap) return;

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

  const handleDownloadProgrammaticPdf = async () => {
    setPdfExportLoading(true);
    setPdfError('');
    setPdfProgress({ current: 0, total: 0 });

    try {
      const elements = document.querySelectorAll('.bracket-page-card');
      if (elements.length === 0) {
        throw new Error('No brackets found to export. Please generate brackets first.');
      }

      setPdfProgress({ current: 0, total: elements.length });

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      for (let i = 0; i < elements.length; i++) {
        setPdfProgress({ current: i + 1, total: elements.length });
        const element = elements[i] as HTMLElement;

        const canvasWidthAttr = element.getAttribute('data-canvas-width');
        const canvasHeightAttr = element.getAttribute('data-canvas-height');
        
        let canvasWidth = 1400;
        let canvasHeight = 900;
        if (canvasWidthAttr && canvasHeightAttr) {
          canvasWidth = parseInt(canvasWidthAttr, 10);
          canvasHeight = parseInt(canvasHeightAttr, 10);
        }

        const canvas = await html2canvas(element, {
          scale: 2, // High resolution pixel ratio
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDoc) => {
            // Replace Tailwind v4 oklch() colors with safe rgb() in cloned styles so html2canvas compiles them cleanly
            clonedDoc.querySelectorAll('style').forEach((styleEl) => {
              if (styleEl.textContent) {
                styleEl.textContent = replaceOklchInString(styleEl.textContent);
              }
            });

            clonedDoc.querySelectorAll('[style]').forEach((el) => {
              const styleAttr = el.getAttribute('style');
              if (styleAttr && styleAttr.toLowerCase().includes('oklch')) {
                el.setAttribute('style', replaceOklchInString(styleAttr));
              }
            });

            // Hide no-print elements in cloned node
            clonedDoc.querySelectorAll('.no-print').forEach((el) => {
              (el as HTMLElement).style.display = 'none';
            });

            // Target the specific element inside the clone
            const clonedPage = clonedDoc.getElementById(element.id);
            if (clonedPage) {
              clonedPage.style.boxShadow = 'none';
              clonedPage.style.borderRadius = '0';
              clonedPage.style.border = 'none';
              clonedPage.style.padding = '24px';

              const canvasWrapper = clonedPage.querySelector('.bracket-canvas') as HTMLElement;
              if (canvasWrapper) {
                canvasWrapper.style.width = `${canvasWidth}px`;
                canvasWrapper.style.height = `${canvasHeight}px`;
                canvasWrapper.style.transform = 'none';
                canvasWrapper.style.margin = '0 auto';

                const innerScaleDiv = canvasWrapper.firstElementChild as HTMLElement;
                if (innerScaleDiv) {
                  innerScaleDiv.style.transform = 'scale(1)';
                  innerScaleDiv.style.width = `${canvasWidth}px`;
                  innerScaleDiv.style.height = `${canvasHeight}px`;
                }
              }
            }
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        if (i > 0) {
          pdf.addPage();
        }

        const pdfWidth = 297;
        const pdfHeight = 210;
        const imgW = canvas.width;
        const imgH = canvas.height;

        const margin = 10; // 10mm margins
        const maxW = pdfWidth - 2 * margin;
        const maxH = pdfHeight - 2 * margin;

        const ratioW = maxW / imgW;
        const ratioH = maxH / imgH;
        const ratio = Math.min(ratioW, ratioH);

        const printW = imgW * ratio;
        const printH = imgH * ratio;

        const x = margin + (maxW - printW) / 2;
        const y = margin + (maxH - printH) / 2;

        pdf.addImage(imgData, 'JPEG', x, y, printW, printH, undefined, 'FAST');
      }

      const filename = `${tournamentName ? tournamentName.toLowerCase().replace(/[^a-z0-9_]+/g, '_') : 'tournament_brackets'}.pdf`;
      pdf.save(filename);
      setPdfExportLoading(false);
      setShowExportModal(false);
      setStatusMessage({
        text: `Successfully saved "${filename}" (${elements.length} divisions exported).`,
        type: 'ok',
      });
    } catch (err: any) {
      console.error(err);
      setPdfError(err?.message || 'Failed to export PDF.');
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
    const ring = categories[k].ring || 1;
    if (ringStats[ring]) {
      ringStats[ring].count += categories[k].count;
      if (brackets[k]) {
        // count the active numbered bouts
        const activeBouts = brackets[k].nodes.slice(1).flatMap((r) => r).filter((n) => typeof n.bout === 'number').length;
        ringStats[ring].bouts += activeBouts;
      }
    }
  });

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-950 font-sans tracking-tight antialiased">
      <div className="max-w-[1400px] mx-auto px-4 py-6 md:py-10">
        
        {/* Header Navigation Area */}
        <Header
          tournamentName={tournamentName}
          setTournamentName={setTournamentName}
          onClearAll={handleClearAll}
          onExportPdf={() => setShowExportModal(true)}
          hasData={bracketKeys.length > 0}
          saveStatus={saveStatus}
          onOpenEventsModal={() => setIsEventsModalOpen(true)}
          savedEventsCount={savedEvents.length}
        />

        {!tournamentName || !currentEventId ? (
          <div className="max-w-2xl mx-auto my-12 bg-white border border-slate-200/80 rounded-3xl p-8 md:p-10 shadow-xl space-y-8 no-print animate-fade-in">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-4 print:block print:w-full print:mt-0">
          
          {/* LEFT SIDEBAR NAVIGATION & QUICK CONTROL CENTER */}
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

          {/* RIGHT MASTER CONTENT VIEW AREA */}
          <div className="lg:col-span-9 space-y-6 print:w-full print:p-0">
            {/* 1. SETUP PANELS (Only rendered on the active Brackets tab) */}
            {activeTab === 'brackets' && (
              <div className="space-y-6">
                {/* Athletes roster input card */}
                <RosterPanel
                  onLoadRoster={handleLoadRoster}
                  onUseSample={handleUseSample}
                  statusMessage={statusMessage}
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
                />
              </div>
            )}

            {/* Brackets generation grid assembly inside right master column */}
            {activeTab === 'brackets' && bracketKeys.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="flex items-baseline justify-between mb-6">
                  <h2 id="bracketsSectionTitle" className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    🥋 Generated Tournament Brackets
                  </h2>
                  <span className="text-xs bg-slate-200 text-slate-800 font-mono px-3 py-1 rounded-full font-bold no-print">
                    {bracketKeys.length} active classes
                  </span>
                </div>

                <div className="space-y-6">
                  {bracketKeys.map((key) => {
                    const model = brackets[key];
                    const cat = categories[key];
                    return (
                      <BracketCanvas
                        key={key}
                        bracket={model}
                        ring={getRingLabel(cat.ring || 1)}
                        entrantCount={cat.count}
                        onReshuffle={() => handleReshuffleSingleCategory(key)}
                        onCheckboxToggle={(k, i, checked) => handleCheckboxToggleNode(key, k, i, checked)}
                        onTextChange={(k, i, text) => handleTextChangeNode(key, k, i, text)}
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
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Helpful layout print helper text banner footer inside right column */}
            {activeTab === 'brackets' && bracketKeys.length > 0 && (
              <p className="text-center text-xs text-slate-600 mt-8 mb-4 max-w-xl mx-auto leading-normal font-medium no-print">
                💡 <strong>Print Tip:</strong> Multi-layer sheets (16, 32, or 64 draws) can be quite dense. Choose <strong>A3</strong> dimensions or <strong>Landscape</strong> orientation inside the browser printer layout dialog to achieve superior legibility.
              </p>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* OPTION 1: PROGRAMMATIC PDF DOWNLOAD */}
                    <button
                      type="button"
                      onClick={handleDownloadProgrammaticPdf}
                      className="bg-slate-50/50 hover:bg-slate-100/50 border border-slate-200 hover:border-amber-400 p-5 rounded-2xl text-left transition-all cursor-pointer group shadow-xs hover:shadow-md flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-black shadow-sm group-hover:scale-110 transition-transform">
                          <Trophy className="w-5 h-5 text-slate-950 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-base leading-tight group-hover:text-amber-600 transition-colors">
                            Download PDF File
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed mt-1.5 font-medium">
                            Works reliably in all sandboxed previews. Compiles every single bracket sheet into a single landscape PDF document file.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-amber-600">
                        <span>Save PDF Document (.pdf)</span>
                        <span className="text-lg">→</span>
                      </div>
                    </button>

                    {/* OPTION 2: NATIVE BROWSER PRINT */}
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
