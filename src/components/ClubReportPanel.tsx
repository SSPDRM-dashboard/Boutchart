import React, { useState } from 'react';
import { Users, Search, Printer, HelpCircle, ShieldAlert, CheckCircle2, Flame, AlignJustify, Grid, Award, Download, Share2, Copy, Check, Trash2, ExternalLink, Globe, Lock, AlertTriangle, Info } from 'lucide-react';
import { Athlete, WeightCategory, BracketModel } from '../types';
import { compressToGzipBase64 } from '../utils/compression';
import {
  compareCategoriesByAgeAndWeight,
  DEFAULT_EVENT_SEQUENCE,
  ALL_STANDARD_EVENTS,
  getCategoryEventInfo,
  getEventOrderRank
} from '../utils/bracketUtils';
import { CertificateModal } from './CertificateModal';
import { BracketCanvas } from './BracketCanvas';
import { db, doc, setDoc, collection } from '../lib/firebase';
import { getQuotaExceeded, setQuotaExceeded, isQuotaError } from '../utils/quotaManager';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

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
  ringCount?: number;
  ringLabelFormat: 'number' | 'letter';
  boutLabelFormat?: 'alpha-2' | 'thousands-3';
  tournamentName?: string;
  leftLogo?: string;
  leftLogo2?: string;
  rightLogo?: string;
  rightLogo2?: string;
  isPublicView?: boolean;
  hideShareControl?: boolean;
  onUpdateStandings?: (catKey: string, nextStandings: string[]) => void;
  activePublicView?: 'photo-matrix' | 'classic-cards' | 'medal-standings' | 'individual-lookup' | 'boutchart';
  onActivePublicViewChange?: (view: 'photo-matrix' | 'classic-cards' | 'medal-standings' | 'individual-lookup' | 'boutchart') => void;
  eventSequenceOrder?: string[];
  ringEventSequences?: Record<number, string[]>;
}

export const getRingNumberFromLabel = (label: string): number => {
  const norm = String(label).trim().toUpperCase();
  const matchLetter = norm.match(/(?:RING|MAT)?\s*([A-Z])/i);
  if (matchLetter && matchLetter[1]) {
    return matchLetter[1].charCodeAt(0) - 64;
  }
  const matchNum = norm.match(/\d+/);
  if (matchNum) {
    return parseInt(matchNum[0], 10);
  }
  return 1;
};

export const getRingSortOrder = (ringVal: number | string | undefined): number => {
  if (ringVal === undefined || ringVal === null || ringVal === 0 || ringVal === '0') return 99999;
  if (typeof ringVal === 'number') {
    return ringVal > 0 ? ringVal : 99999;
  }
  const str = String(ringVal).trim().toUpperCase();
  if (str === 'UNASSIGNED') return 99999;
  const letterMatch = str.match(/(?:RING|MAT)?\s*([A-Z])/i);
  if (letterMatch && letterMatch[1]) {
    return letterMatch[1].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, C=3, D=4, E=5...
  }
  const numMatch = str.match(/\d+/);
  if (numMatch) {
    return parseInt(numMatch[0], 10);
  }
  return 9999;
};

export const getRingColorClasses = (ringLabel: string) => {
  const norm = ringLabel.toUpperCase();
  if (norm === 'A' || norm.includes('RING A')) return { bg: 'bg-amber-100 text-amber-900 border-amber-300', tag: 'bg-amber-400 text-slate-950' };
  if (norm === 'B' || norm.includes('RING B')) return { bg: 'bg-sky-100 text-sky-900 border-sky-300', tag: 'bg-sky-500 text-white' };
  if (norm === 'C' || norm.includes('RING C')) return { bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', tag: 'bg-emerald-500 text-white' };
  if (norm === 'D' || norm.includes('RING D')) return { bg: 'bg-purple-100 text-purple-900 border-purple-300', tag: 'bg-purple-500 text-white' };
  if (norm === 'E' || norm.includes('RING E')) return { bg: 'bg-rose-100 text-rose-900 border-rose-300', tag: 'bg-rose-500 text-white' };
  return { bg: 'bg-slate-100 text-slate-800 border-slate-300', tag: 'bg-slate-700 text-white' };
};

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
    corner: 'C' | 'H' | 'G'; // Chung (Blue), Hong (Red), or Green (Poomsae/Turn)
  }>;
}

export const getReportStyleLabel = (style: string): string => {
  switch (style) {
    case 'boutchart': return 'Boutchart';
    case 'individual-lookup': return 'Find Player Schedule';
    case 'classic-cards': return 'Classic Card Deck';
    case 'photo-matrix': return 'Taekwondo Matrix Grid';
    case 'medal-standings': return 'Club Medal Standings';
    default: return style;
  }
};

export const ClubReportPanel: React.FC<ClubReportPanelProps> = ({
  categories,
  brackets,
  roster,
  ringCount = 13,
  ringLabelFormat,
  boutLabelFormat = 'alpha-2',
  tournamentName = '',
  leftLogo,
  leftLogo2,
  rightLogo,
  rightLogo2,
  isPublicView = false,
  hideShareControl = false,
  onUpdateStandings,
  activePublicView,
  onActivePublicViewChange,
  eventSequenceOrder = DEFAULT_EVENT_SEQUENCE,
  ringEventSequences,
}) => {
  const isPublicAppMode = (import.meta.env.VITE_APP_MODE || '').trim().toUpperCase() === 'PUBLIC';
  const effectivePublicView = isPublicView || isPublicAppMode;
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [selectedRing, setSelectedRing] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [cardsGroupMode, setCardsGroupMode] = useState<'ring' | 'club'>('ring');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOnlyScheduled, setShowOnlyScheduled] = useState<boolean>(true);
  const [certificateData, setCertificateData] = useState<{ athleteName: string; club: string; category: string } | null>(null);

  // Label formatting helper for rings (available throughout entire component)
  const getRingLabel = (ringNum: number | string) => {
    if (ringLabelFormat === 'letter') {
      const num = typeof ringNum === 'string' ? parseInt(ringNum, 10) : ringNum;
      if (isNaN(num) || num < 1) return String(ringNum);
      return String.fromCharCode(64 + num);
    }
    return String(ringNum);
  };
  
  // Choose between 'photo-matrix', 'classic-cards', 'medal-standings', 'individual-lookup', or 'boutchart'
  // Guaranteed to prioritize: URL style parameter -> activePublicView from app state/Firestore -> local cache -> default
  const [reportStyle, setReportStyle] = useState<'photo-matrix' | 'classic-cards' | 'medal-standings' | 'individual-lookup' | 'boutchart'>(() => {
    try {
      const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const styleParam = urlParams.get('style');
      if (styleParam === 'photo-matrix' || styleParam === 'classic-cards' || styleParam === 'medal-standings' || styleParam === 'individual-lookup' || styleParam === 'boutchart') {
        return styleParam;
      }
    } catch (e) {}

    if (activePublicView) {
      return activePublicView;
    }

    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('bracket_builder_active_public_view') : null;
      if (saved === 'photo-matrix' || saved === 'classic-cards' || saved === 'medal-standings' || saved === 'individual-lookup' || saved === 'boutchart') {
        return saved;
      }
    } catch (e) {}

    if (typeof window !== 'undefined' && window.location.hostname.includes('boutchart')) {
      return 'boutchart';
    }

    return 'boutchart';
  });
  const activeReportStyle = reportStyle;

  // React to asynchronous updates from Firestore/App state when activePublicView finishes loading
  React.useEffect(() => {
    if (!activePublicView) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const styleParam = urlParams.get('style');
      // If user hasn't explicitly set ?style=... in the URL, automatically sync to the app's active public view
      if (!styleParam && reportStyle !== activePublicView) {
        console.log('[ClubReportPanel] Synchronizing reportStyle to activePublicView:', activePublicView);
        setReportStyle(activePublicView);
      }
    } catch (e) {
      if (reportStyle !== activePublicView) {
        setReportStyle(activePublicView);
      }
    }
  }, [activePublicView]);

  const handleSelectReportStyle = (style: 'photo-matrix' | 'classic-cards' | 'medal-standings' | 'individual-lookup' | 'boutchart') => {
    setReportStyle(style);
    try {
      localStorage.setItem('bracket_builder_active_public_view', style);
    } catch (e) {}
    if (onActivePublicViewChange) {
      onActivePublicViewChange(style);
    }
  };
  const [expandedClub, setExpandedClub] = useState<string | null>(null);
  const [copiedPlayerMap, setCopiedPlayerMap] = useState<Record<string, boolean>>({});
  const [loadingPlayerMap, setLoadingPlayerMap] = useState<Record<string, boolean>>({});

  const [shareStatus, setShareStatus] = useState<'silent' | 'loading' | 'copied' | 'error'>('silent');
  const [shareUrl, setShareUrl] = useState('');
  const [shareRelativePath, setShareRelativePath] = useState<string>('');
  const isAisDev = typeof window !== 'undefined' && window.location.origin.includes('ais-dev-');
  const [shareDomainMode, setShareDomainMode] = useState<'public' | 'dev' | 'custom'>(() => {
    return isAisDev ? 'public' : 'dev';
  });
  const [customDomain, setCustomDomain] = useState<string>(() => {
    try {
      return localStorage.getItem('tournament_custom_domain') || '';
    } catch {
      return '';
    }
  });
  const [zipExportLoading, setZipExportLoading] = useState(false);

  const generateClubMatrixPDF = (clubName: string, clubAthletes: { name: string; club: string; weight: string }[]) => {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const totalPages = Math.ceil(clubAthletes.length / 13) || 1;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (pageNum > 1) {
        pdf.addPage();
      }

      // 1. Draw Page Header
      pdf.setFillColor(248, 250, 252); // slate-50 background for page header
      pdf.rect(11, 10, 275, 20, 'F');
      
      pdf.setDrawColor(226, 232, 240); // slate-200 border
      pdf.setLineWidth(0.5);
      pdf.rect(11, 10, 275, 20, 'S');

      // Main Title
      pdf.setTextColor(12, 46, 92); // navy `#0c2e5c`
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text(`TAEKWONDO MATRIX GRID - ${clubName.toUpperCase()}`, 15, 18);

      // Subtitle
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Tournament: ${tournamentName || 'Tournament'}  |  Club: ${clubName}  |  Page ${pageNum} of ${totalPages}`, 15, 24);

      // Info (Right aligned)
      pdf.text(`Total Competitors: ${clubAthletes.length}`, 281, 18, { align: 'right' });

      // 2. Draw Table Header
      const headerY = 34;
      pdf.setFillColor(12, 46, 92); // `#0c2e5c`
      pdf.rect(11, headerY, 275, 10, 'F');

      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);

      pdf.text('MAT & CATEGORY', 15, headerY + 6.5);
      pdf.text('CLUB', 65, headerY + 6.5);
      pdf.text('COMPETITOR NAME', 100, headerY + 6.5);

      for (let f = 1; f <= 7; f++) {
        pdf.text(`FIGHT ${f}`, 146 + (f - 1) * 20 + 10, headerY + 6.5, { align: 'center' });
      }

      // 3. Draw Athletes Rows for this page
      const startIndex = (pageNum - 1) * 13;
      const endIndex = Math.min(startIndex + 13, clubAthletes.length);
      let currentY = headerY + 10;

      for (let i = startIndex; i < endIndex; i++) {
        const ath = clubAthletes[i];
        const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
        const fightInfo = playersMap[athKey];
        const athleteBouts = fightInfo?.bouts || [];

        // Alternating background row color
        if (i % 2 === 0) {
          pdf.setFillColor(255, 255, 255);
        } else {
          pdf.setFillColor(248, 250, 252); // slate-50
        }
        pdf.rect(11, currentY, 275, 12, 'F');

        // Draw Row Borders
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.setLineWidth(0.35);
        pdf.rect(11, currentY, 275, 12, 'S');

        // Column dividers
        pdf.line(61, currentY, 61, currentY + 12);
        pdf.line(96, currentY, 96, currentY + 12);
        pdf.line(146, currentY, 146, currentY + 12);
        for (let f = 1; f <= 7; f++) {
          pdf.line(146 + f * 20, currentY, 146 + f * 20, currentY + 12);
        }

        // Draw Mat & Category text
        pdf.setTextColor(12, 46, 92);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        const ringText = fightInfo?.ringLabel === 'Unassigned' ? 'Unassigned' : `Ring ${fightInfo?.ringLabel || 'A'}`;
        pdf.text(ringText, 15, currentY + 4.5);

        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        const weightText = ath.weight.length > 25 ? ath.weight.substring(0, 22) + '...' : ath.weight;
        pdf.text(weightText, 15, currentY + 9);

        // Draw Club Text
        pdf.setTextColor(51, 65, 85);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        const clubText = ath.club.length > 18 ? ath.club.substring(0, 16) + '...' : ath.club;
        pdf.text(clubText.toUpperCase(), 65, currentY + 7);

        // Draw Athlete Name
        pdf.setTextColor(15, 23, 42);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        const nameText = ath.name.length > 25 ? ath.name.substring(0, 22) + '...' : ath.name;
        pdf.text(nameText.toUpperCase(), 100, currentY + 7);

        // Draw Fights 1 to 7
        for (let f = 0; f < 7; f++) {
          const bout = athleteBouts[f];
          const colX = 146 + f * 20;

          if (bout) {
            // Draw bout formattedId text
            pdf.setTextColor(15, 23, 42);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text(bout.formattedId, colX + 4, currentY + 7, { baseline: 'middle' });

            // Draw Corner badge
            const isRed = bout.corner === 'H';
            if (bout.corner === 'G') {
              pdf.setFillColor(5, 150, 105); // emerald-600 `#059669`
            } else if (isRed) {
              pdf.setFillColor(220, 38, 38); // `#dc2626`
            } else {
              pdf.setFillColor(30, 64, 175); // `#1e40af`
            }
            pdf.roundedRect(colX + 11.5, currentY + 3.75, 4.5, 4.5, 0.8, 0.8, 'F');

            // Draw Corner text
            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7.5);
            pdf.text(bout.corner === 'G' ? '' : bout.corner, colX + 13.75, currentY + 6.25, { align: 'center', baseline: 'middle' });
          } else {
            pdf.setTextColor(203, 213, 225);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text('-', colX + 10, currentY + 7, { align: 'center' });
          }
        }

        currentY += 12;
      }

      // Draw footer legend at the bottom of the page
      pdf.setFillColor(248, 250, 252);
      pdf.rect(11, 192, 275, 8, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(11, 192, 275, 8, 'S');

      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text('LEGEND:', 15, 197.5);

      pdf.setFont('helvetica', 'normal');
      pdf.text('C = Chung (Blue Corner / Top Slot)', 32, 197.5);
      pdf.text('H = Hong (Red Corner / Bottom Slot)', 85, 197.5);
      pdf.text('Generated via MY-TKD Tournament Manager', 281, 197.5, { align: 'right' });
    }

    return pdf;
  };

  const downloadSingleClubMatrixPDF = (clubName: string) => {
    const clubAthletes = athleteList.filter(a => a.club === clubName);
    clubAthletes.sort((a, b) => {
      const catA = categories[a.weight];
      const catB = categories[b.weight];
      const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
      const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;
      if (ringA !== ringB) return ringA - ringB;
      const catCompare = (a.weight || '').localeCompare(b.weight || '');
      if (catCompare !== 0) return catCompare;
      return a.name.localeCompare(b.name);
    });

    if (clubAthletes.length === 0) {
      alert(`No athletes found for club "${clubName}".`);
      return;
    }

    const pdf = generateClubMatrixPDF(clubName, clubAthletes);
    const filename = `${clubName.replace(/[^a-zA-Z0-9]/g, '_')}_Matrix_Grid.pdf`;
    pdf.save(filename);
  };

  const downloadAllClubsMatrixZIP = async () => {
    setZipExportLoading(true);
    try {
      const zip = new JSZip();

      for (const club of clubList) {
        const clubAthletes = athleteList.filter(a => a.club === club);
        clubAthletes.sort((a, b) => {
          const catA = categories[a.weight];
          const catB = categories[b.weight];
          const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
          const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;
          if (ringA !== ringB) return ringA - ringB;
          const catCompare = (a.weight || '').localeCompare(b.weight || '');
          if (catCompare !== 0) return catCompare;
          return a.name.localeCompare(b.name);
        });
        if (clubAthletes.length === 0) continue;

        const pdf = generateClubMatrixPDF(club, clubAthletes);
        const pdfArrayBuffer = pdf.output('arraybuffer');
        const filename = `${club.replace(/[^a-zA-Z0-9]/g, '_')}_Matrix_Grid.pdf`;
        zip.file(filename, pdfArrayBuffer);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const zipFilename = `${(tournamentName || 'Tournament').replace(/[^a-zA-Z0-9]/g, '_')}_Clubs_Matrix_Grids.zip`;
      
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", zipFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate ZIP folder of clubs matrix grids', err);
      alert('Failed to generate ZIP download. Please try again.');
    } finally {
      setZipExportLoading(false);
    }
  };

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

  const getDomainForMode = (mode: 'public' | 'dev' | 'custom') => {
    if (mode === 'custom' && customDomain.trim()) {
      return customDomain.trim().replace(/\/+$/, '');
    }
    const envPublicUrl = import.meta.env.VITE_PUBLIC_URL || import.meta.env.VITE_APP_URL;
    if (envPublicUrl && envPublicUrl.trim()) {
      return envPublicUrl.trim().replace(/\/+$/, '');
    }

    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    if (mode === 'public' && currentOrigin.includes('ais-dev-')) {
      return currentOrigin.replace('ais-dev-', 'ais-pre-');
    }
    return currentOrigin;
  };

  const getPublicBaseUrl = (mode?: 'public' | 'dev' | 'custom') => {
    return getDomainForMode(mode || shareDomainMode);
  };

  const switchDomainMode = (mode: 'public' | 'dev' | 'custom') => {
    setShareDomainMode(mode);
    let path = shareRelativePath;
    if (!path && shareUrl) {
      try {
        const u = new URL(shareUrl);
        path = `${u.pathname}${u.search}`;
        setShareRelativePath(path);
      } catch {}
    }
    if (path) {
      const updated = `${getDomainForMode(mode)}${path}`;
      setShareUrl(updated);
      copyText(updated);
    }
  };

  const generateAndCopyShareLink = () => {
    try {
      setShareStatus('loading');
      
      const baseUrl = getPublicBaseUrl();
      const urlParams = new URLSearchParams(window.location.search);
      let idParam = urlParams.get('id');
      const dataParam = urlParams.get('data');
      const pathname = window.location.pathname;
      
      const isReportPath = pathname.startsWith('/report') || pathname.startsWith('/club-report');
      if (isReportPath) {
        const parts = pathname.split('/');
        const possibleId = parts[parts.length - 1];
        if (possibleId && possibleId !== 'report' && possibleId !== 'club-report') {
          idParam = possibleId;
        }
      }

      // If we are in public view and already have an ID or GZIP data, reuse it
      if (isPublicView && (idParam || dataParam)) {
        let relPath = '';
        if (idParam) {
          relPath = `/?view=club-report&id=${idParam}`;
        } else {
          relPath = `${pathname}?view=club-report&data=${dataParam}`;
        }
        
        if (selectedClub && selectedClub !== 'all') {
          const urlObj = new URL(relPath, 'https://example.com');
          urlObj.searchParams.set('club', selectedClub);
          relPath = `${urlObj.pathname}${urlObj.search}`;
        }
        
        const styleToSet = activeReportStyle;
        const uObj = new URL(relPath, 'https://example.com');
        if (styleToSet !== 'photo-matrix') {
           uObj.searchParams.set('style', styleToSet);
        }
        relPath = `${uObj.pathname}${uObj.search}`;
        
        setShareRelativePath(relPath);
        const finalUrl = `${getDomainForMode(shareDomainMode)}${relPath}`;
        setShareUrl(finalUrl);
        copyText(finalUrl);
        setShareStatus('copied');
        return;
      }

      const payload = {
        t: tournamentName || 'Tournament',
        r: roster,
        c: categories,
        b: brackets,
        rl: ringLabelFormat,
        leftLogo, leftLogo2, rightLogo, rightLogo2,
        activePublicView: activeReportStyle,
        reportStyle: activeReportStyle,
      };
      
      const saveToLocalApi = () => {
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
            let relPath = `/?view=club-report&id=${resData.id}`;
            if (selectedClub && selectedClub !== 'all') {
              relPath += `&club=${encodeURIComponent(selectedClub)}`;
            }
            
            const styleToSet = activeReportStyle;
            const uObj = new URL(relPath, 'https://example.com');
            if (styleToSet !== 'photo-matrix') {
               uObj.searchParams.set('style', styleToSet);
            }
            relPath = `${uObj.pathname}${uObj.search}`;
            
            setShareRelativePath(relPath);
            const finalUrl = `${getDomainForMode(shareDomainMode)}${relPath}`;
            setShareUrl(finalUrl);
            copyText(finalUrl);
            setShareStatus('copied');
          } else {
            throw new Error('Invalid API response');
          }
        })
        .catch(() => {
          // Final fallback to offline gzip link
          compressToGzipBase64(JSON.stringify(payload)).then(gzipBase64 => {
            let relPath = `/?view=club-report&data=${encodeURIComponent(gzipBase64)}`;
            if (selectedClub && selectedClub !== 'all') {
              relPath += `&club=${encodeURIComponent(selectedClub)}`;
            }
            const styleToSet = activeReportStyle;
            const uObj = new URL(relPath, 'https://example.com');
            if (styleToSet !== 'photo-matrix') {
               uObj.searchParams.set('style', styleToSet);
            }
            relPath = `${uObj.pathname}${uObj.search}`;
            setShareRelativePath(relPath);
            const finalUrl = `${getDomainForMode(shareDomainMode)}${relPath}`;
            setShareUrl(finalUrl);
            copyText(finalUrl);
            setShareStatus('copied');
          });
        });
      };

      if (getQuotaExceeded()) {
        saveToLocalApi();
        return;
      }
      
      const newDocRef = doc(collection(db, 'reports'));
      setDoc(newDocRef, { payload: JSON.stringify(payload) })
      .then(() => {
        let relPath = `/?view=club-report&id=${newDocRef.id}`;
        if (selectedClub && selectedClub !== 'all') {
          relPath += `&club=${encodeURIComponent(selectedClub)}`;
        }
        
        const styleToSet = activeReportStyle;
        const uObj = new URL(relPath, 'https://example.com');
        if (styleToSet !== 'photo-matrix') {
           uObj.searchParams.set('style', styleToSet);
        }
        relPath = `${uObj.pathname}${uObj.search}`;
        
        setShareRelativePath(relPath);
        const finalUrl = `${getDomainForMode(shareDomainMode)}${relPath}`;
        setShareUrl(finalUrl);
        copyText(finalUrl);
        setShareStatus('copied');
      })
      .catch(err => {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        }
        saveToLocalApi();
      });
    } catch (e) {
      console.error('Failed to generate shareable link', e);
      setShareStatus('error');
    }
  };


  // 2. Bout ID format helper (e.g. A02 / 1001 / PA01)
  const getFormattedBout = (
    ring: string | number, 
    boutNumber: number | undefined,
    isPoomsae: boolean = false
  ): string => {
    if (boutNumber === undefined || boutNumber === null) return '';

    let ringPrefix = 'A';
    if (typeof ring === 'number') {
      ringPrefix = ring > 0 && ring <= 26 ? String.fromCharCode(64 + ring) : String(ring || 'A');
    } else {
      const cleaned = String(ring).trim();
      const upper = cleaned.toUpperCase();
      const letterMatch = upper.match(/RING\s*([A-Z])/i) || upper.match(/^([A-Z])$/);
      if (letterMatch) {
        ringPrefix = letterMatch[1];
      } else {
        const anyLetter = upper.match(/[A-Z]/);
        const numMatch = cleaned.match(/\d+/);
        if (anyLetter && !numMatch) {
          ringPrefix = anyLetter[0];
        } else if (numMatch && !anyLetter) {
          const n = parseInt(numMatch[0], 10);
          if (n >= 1 && n <= 26) {
            ringPrefix = String.fromCharCode(64 + n);
          } else {
            ringPrefix = numMatch[0];
          }
        } else if (anyLetter) {
          ringPrefix = anyLetter[0];
        } else if (numMatch) {
          const n = parseInt(numMatch[0], 10);
          if (n >= 1 && n <= 26) {
            ringPrefix = String.fromCharCode(64 + n);
          } else {
            ringPrefix = numMatch[0];
          }
        } else {
          ringPrefix = cleaned || 'A';
        }
      }
    }

    const padLength = boutLabelFormat === 'thousands-3' ? 3 : 2;
    const pad = String(boutNumber).padStart(padLength, '0');

    if (isPoomsae) {
      const prefix = ringPrefix.toUpperCase() === 'P' ? 'P' : `P${ringPrefix}`;
      return `${prefix}${pad}`;
    }

    return `${ringPrefix}${pad}`;
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

  React.useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const playerParam = urlParams.get('player') || urlParams.get('search');
      if (playerParam) {
        setSearchQuery(playerParam);
        setReportStyle('individual-lookup');
      }
      const clubParam = urlParams.get('club');
      if (clubParam) {
        const foundClub = clubList.find(c => c.trim().toLowerCase() === clubParam.trim().toLowerCase());
        setSelectedClub(foundClub || clubParam);
      }
      const styleParam = urlParams.get('style');
      if (styleParam === 'photo-matrix' || styleParam === 'classic-cards' || styleParam === 'medal-standings' || styleParam === 'individual-lookup' || styleParam === 'boutchart') {
        setReportStyle(styleParam);
      }
    } catch (e) {
      console.warn('URL params parsing failed inside ClubReportPanel', e);
    }
  }, [clubList]);

  // Helper to find the awaiting opponent name or bout winner recursively
  const getAwaitingOpponentLabel = (
    model: BracketModel,
    k: number, // round index
    idx: number, // node index
    ringLabel: string,
    isPoomsae: boolean = false
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
        name: `Winner of Bout ${getFormattedBout(ringLabel, node.bout, Boolean(node.isPoomsae || isPoomsae))}`,
        club: '',
      };
    }

    // 4. If there is no bout number, it must be a bypass/walkover.
    // Look at the children of this node in round k-1: 2*idx and 2*idx + 1.
    if (k > 0) {
      const leftChild = model.nodes[k - 1]?.[2 * idx];
      const rightChild = model.nodes[k - 1]?.[2 * idx + 1];

      if (leftChild && !leftChild.isBye) {
        return getAwaitingOpponentLabel(model, k - 1, 2 * idx, ringLabel, isPoomsae);
      } else if (rightChild && !rightChild.isBye) {
        return getAwaitingOpponentLabel(model, k - 1, 2 * idx + 1, ringLabel, isPoomsae);
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
    const isCatPoomsae = Boolean(
      cat?.systemType?.startsWith('poomsae') || 
      model?.systemType?.startsWith('poomsae') || 
      cat?.name?.toLowerCase().includes('poomsae') || 
      model?.categoryKey?.toLowerCase().includes('poomsae')
    );

    const bouts: PlayerFightInfo['bouts'] = [];

    if (model) {
      if (model.systemType === 'poomsae-cutoff') {
        const round0 = model.nodes[0] || [];
        for (let i = 0; i < round0.length; i++) {
          const leafNode = round0[i];
          if (leafNode && !leafNode.isBye && leafNode.name) {
            const nameMatch = leafNode.name.trim().toLowerCase() === athlete.name.trim().toLowerCase();
            const clubMatch = (leafNode.club || '').trim().toLowerCase() === athlete.club.trim().toLowerCase();
            if (nameMatch && (leafNode.club ? clubMatch : true)) {
              if (typeof leafNode.bout === 'number') {
                bouts.push({
                  boutNumber: leafNode.bout,
                  formattedId: getFormattedBout(ringLabel, leafNode.bout, true),
                  roundName: 'Final',
                  opponentName: 'Poomsae Score',
                  opponentClub: '',
                  kRound: 0,
                  corner: 'G' as any, // G for Green / turn number
                });
              }
              break;
            }
          }
        }
      } else {
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
            const oppNodeLabel = getAwaitingOpponentLabel(model, k - 1, oppIdx, ringLabel, Boolean(node.isPoomsae || isCatPoomsae));
            const corner: 'C' | 'H' = (i_prev % 2 === 0) ? 'C' : 'H';

            bouts.push({
              boutNumber: node.bout,
              formattedId: getFormattedBout(ringLabel, node.bout, Boolean(node.isPoomsae || isCatPoomsae)),
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
                      opponentName = `Winner of Bout ${getFormattedBout(ringLabel, prevBoutNum, Boolean(isCatPoomsae))}`;
                    }
                  }
                }

                bouts.push({
                  boutNumber: node.bout,
                  formattedId: getFormattedBout(ringLabel, node.bout, Boolean(node.isPoomsae || isCatPoomsae)),
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
      "Event",
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

    // Determine target athletes array based on club filter (always sorted starting from Ring A, then Ring B, C, D, E... and by Event sequence)
    const targetAthletes = clubName
      ? athleteList.filter(a => a.club === clubName).sort((a, b) => {
          const catA = categories[a.weight];
          const catB = categories[b.weight];
          const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
          const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;
          if (ringA !== ringB) return ringA - ringB;

          const ringNum = catA?.ring || 1;
          const effectiveEventSeq = (ringEventSequences && ringEventSequences[ringNum]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;
          const evA = getCategoryEventInfo(catA?.systemType, catA?.event, a.weight, catA?.name).id;
          const evB = getCategoryEventInfo(catB?.systemType, catB?.event, b.weight, catB?.name).id;
          const rankA = getEventOrderRank(evA, effectiveEventSeq);
          const rankB = getEventOrderRank(evB, effectiveEventSeq);
          if (rankA !== rankB) return rankA - rankB;

          const catCompare = (a.weight || '').localeCompare(b.weight || '');
          if (catCompare !== 0) return catCompare;
          return a.name.localeCompare(b.name);
        })
      : sortedAthletes;

    const rows = targetAthletes.map(ath => {
      const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
      const fightInfo = playersMap[athKey];
      const athleteBouts = fightInfo?.bouts || [];
      const cat = categories[ath.weight];
      const evInfo = getCategoryEventInfo(cat?.systemType, cat?.event, ath.weight, cat?.name);

      const boutColumns = Array.from({ length: 7 }).map((_, colIndex) => {
        const bout = athleteBouts[colIndex];
        if (bout) {
          const cornerLabel = bout.corner === 'G' ? 'Turn / Order' : bout.corner === 'H' ? 'Hong (Red)' : 'Chung (Blue)';
          return `Bout ${bout.formattedId} (${cornerLabel}) vs ${bout.opponentName}${bout.opponentClub ? ' [' + bout.opponentClub + ']' : ''}`;
        }
        return '-';
      });

      return [
        fightInfo?.ringLabel === 'Unassigned' ? 'Unassigned' : `Ring ${fightInfo?.ringLabel || 'A'}`,
        evInfo.label,
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
      let cleanName = athName;
      const parenIndex = athName.lastIndexOf(' (');
      if (parenIndex !== -1) {
        cleanName = athName.substring(0, parenIndex);
      }
      const lowerName = cleanName.trim().toLowerCase();
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
        
        let cleanName = name;
        const parenIndex = name.lastIndexOf(' (');
        if (parenIndex !== -1) {
          cleanName = name.substring(0, parenIndex);
        }

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
        entry.details.push({ athleteName: cleanName, medalType: type, division: catKey, slotIdx });
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

  // Distinct rings available across all categories, sorted strictly starting from Ring A, then Ring B, C, D, E...
  const ringList = React.useMemo(() => {
    const rings = new Set<string>();
    Object.values(categories).forEach((cat: WeightCategory) => {
      if (cat.ring && cat.ring > 0) {
        rings.add(getRingLabel(cat.ring));
      }
    });

    if (rings.size === 0) {
      ['A', 'B', 'C', 'D', 'E'].forEach(r => rings.add(r));
    }

    return Array.from(rings).sort((a, b) => getRingSortOrder(a) - getRingSortOrder(b));
  }, [categories, ringCount, ringLabelFormat]);

  // Distinct events across tournament divisions
  const availableEvents = React.useMemo(() => {
    const evSet = new Set<string>();
    Object.values(categories).forEach((cat: WeightCategory) => {
      const ev = getCategoryEventInfo(cat.systemType, cat.event, cat.name, cat.name);
      evSet.add(ev.id);
    });
    return ALL_STANDARD_EVENTS.filter(e => evSet.has(e.id));
  }, [categories]);

  // Filter and compute matches
  const filteredAthletes = athleteList.filter(ath => {
    const matchesClub = selectedClub === 'all' || 
      ath.club.trim().toLowerCase() === selectedClub.trim().toLowerCase();
    
    const cat = categories[ath.weight];
    const ringLabel = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';
    const matchesRing = selectedRing === 'all' || ringLabel.toUpperCase() === selectedRing.toUpperCase();

    const evInfo = getCategoryEventInfo(cat?.systemType, cat?.event, ath.weight, cat?.name);
    const matchesEvent = selectedEvent === 'all' || evInfo.id === selectedEvent;

    const matchesSearch = 
      ath.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ath.club.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ath.weight.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesScheduled = !showOnlyScheduled || !!brackets[ath.weight];
    return matchesClub && matchesRing && matchesEvent && matchesSearch && matchesScheduled;
  });

  // Group sorted athletes - SHOW BY RING, START FROM RING A, THEN RING B, C, D, E...
  // AND WITHIN EACH RING: SHOW BY EVENT SEQUENCE DECIDED BY ADMIN!
  const sortedAthletes = [...filteredAthletes].sort((a, b) => {
    const catA = categories[a.weight];
    const catB = categories[b.weight];
    const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
    const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;

    // 1. Primary sort: Start from Ring A, then Ring B, C, D, E...
    if (ringA !== ringB) return ringA - ringB;

    // 2. Secondary sort: Sequence of events decided by admin for this ring
    const ringNum = catA?.ring || 1;
    const effectiveEventSeq = (ringEventSequences && ringEventSequences[ringNum]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;
    const evA = getCategoryEventInfo(catA?.systemType, catA?.event, a.weight, catA?.name).id;
    const evB = getCategoryEventInfo(catB?.systemType, catB?.event, b.weight, catB?.name).id;
    const rankA = getEventOrderRank(evA, effectiveEventSeq);
    const rankB = getEventOrderRank(evB, effectiveEventSeq);
    if (rankA !== rankB) return rankA - rankB;

    // 3. Category / division
    const catCompare = (a.weight || '').localeCompare(b.weight || '');
    if (catCompare !== 0) return catCompare;

    // 4. Club
    const clubCompare = (a.club || '').localeCompare(b.club || '');
    if (clubCompare !== 0) return clubCompare;

    // 5. Competitor Name
    return (a.name || '').localeCompare(b.name || '');
  });

  // Group athletes by ring strictly in sequence: Ring A, Ring B, Ring C, Ring D, Ring E...
  // And under each ring, separate into distinct event sections in admin's sequence!
  const athletesGroupedByRing = React.useMemo(() => {
    const map: Record<string, typeof sortedAthletes> = {};
    sortedAthletes.forEach(ath => {
      const cat = categories[ath.weight];
      const ring = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';
      if (!map[ring]) map[ring] = [];
      map[ring].push(ath);
    });

    const sortedRingKeys = Object.keys(map).sort((a, b) => getRingSortOrder(a) - getRingSortOrder(b));
    return sortedRingKeys.map(ringKey => {
      const ringNum = getRingNumberFromLabel(ringKey);
      const effectiveEventSeq = (ringEventSequences && ringEventSequences[ringNum]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;

      // Group athletes in this ring by Event
      const eventMap: Record<string, typeof sortedAthletes> = {};
      map[ringKey].forEach(ath => {
        const cat = categories[ath.weight];
        const ev = getCategoryEventInfo(cat?.systemType, cat?.event, ath.weight, cat?.name).id;
        if (!eventMap[ev]) eventMap[ev] = [];
        eventMap[ev].push(ath);
      });

      const sortedEvIds = Object.keys(eventMap).sort((a, b) => {
        return getEventOrderRank(a, effectiveEventSeq) - getEventOrderRank(b, effectiveEventSeq);
      });

      const eventSections = sortedEvIds.map(evId => {
        const sampleCat = categories[eventMap[evId][0]?.weight];
        const evInfo = getCategoryEventInfo(sampleCat?.systemType, sampleCat?.event, eventMap[evId][0]?.weight, sampleCat?.name);
        return {
          eventId: evId,
          eventInfo: evInfo,
          athletes: eventMap[evId]
        };
      });

      return {
        ring: ringKey,
        athletes: map[ringKey],
        eventSections
      };
    });
  }, [sortedAthletes, categories, ringLabelFormat, eventSequenceOrder, ringEventSequences]);

  // Grouped results map for classic card layout style (with internal athletes sorted by Ring A, B, C, D, E...)
  const groupedResults: Record<string, typeof athleteList> = {};
  filteredAthletes.forEach(ath => {
    if (!groupedResults[ath.club]) {
      groupedResults[ath.club] = [];
    }
    groupedResults[ath.club].push(ath);
  });
  Object.keys(groupedResults).forEach(club => {
    groupedResults[club].sort((a, b) => {
      const catA = categories[a.weight];
      const catB = categories[b.weight];
      const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
      const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;
      if (ringA !== ringB) return ringA - ringB;
      return (a.name || '').localeCompare(b.name || '');
    });
  });

  // Grouped by Ring for Classic Cards when viewing by ring
  const ringGroupedCards = React.useMemo(() => {
    const map: Record<string, typeof athleteList> = {};
    filteredAthletes.forEach(ath => {
      const cat = categories[ath.weight];
      const ring = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';
      if (!map[ring]) map[ring] = [];
      map[ring].push(ath);
    });
    const sortedRingKeys = Object.keys(map).sort((a, b) => getRingSortOrder(a) - getRingSortOrder(b));
    return sortedRingKeys.map(ringKey => {
      const ringNum = getRingNumberFromLabel(ringKey);
      const effectiveEventSeq = (ringEventSequences && ringEventSequences[ringNum]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;

      const eventMap: Record<string, typeof athleteList> = {};
      map[ringKey].forEach(ath => {
        const cat = categories[ath.weight];
        const ev = getCategoryEventInfo(cat?.systemType, cat?.event, ath.weight, cat?.name).id;
        if (!eventMap[ev]) eventMap[ev] = [];
        eventMap[ev].push(ath);
      });

      const sortedEvIds = Object.keys(eventMap).sort((a, b) => {
        return getEventOrderRank(a, effectiveEventSeq) - getEventOrderRank(b, effectiveEventSeq);
      });

      const eventSections = sortedEvIds.map(evId => {
        const sampleCat = categories[eventMap[evId][0]?.weight];
        const evInfo = getCategoryEventInfo(sampleCat?.systemType, sampleCat?.event, eventMap[evId][0]?.weight, sampleCat?.name);
        return {
          eventId: evId,
          eventInfo: evInfo,
          athletes: eventMap[evId].sort((a, b) => {
            const catCompare = (a.weight || '').localeCompare(b.weight || '');
            if (catCompare !== 0) return catCompare;
            const clubCompare = (a.club || '').localeCompare(b.club || '');
            if (clubCompare !== 0) return clubCompare;
            return a.name.localeCompare(b.name);
          })
        };
      });

      return {
        ringName: ringKey === 'Unassigned' ? 'Unassigned Ring' : `Ring ${ringKey}`,
        ringKey,
        athletes: map[ringKey],
        eventSections
      };
    });
  }, [filteredAthletes, categories, ringLabelFormat, eventSequenceOrder, ringEventSequences]);

  const visibleClubsForCards = Object.keys(groupedResults).sort((a, b) => a.localeCompare(b));
  const medalStandings = computeMedalStandings();

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-6 mb-8 shadow-sm print:border-0 print:shadow-none print:p-0">
      {/* Header elements - Hidden when printing since the report is self-contained */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-slate-100 no-print">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-slate-900 text-amber-400 text-xs font-black shadow-sm">
              📋
            </span>
            <h2 className="text-lg font-black text-slate-900 tracking-tight font-sans">
              {selectedClub === 'all' ? 'Public view' : `Club Report — ${selectedClub}`}
            </h2>
            {effectivePublicView && (
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md tracking-wider border border-emerald-200">
                Public view
              </span>
            )}
            <span className="bg-sky-50 text-sky-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wide border border-sky-200/80 flex items-center gap-1 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span>
              <span>Active View: {getReportStyleLabel(activePublicView || reportStyle)}</span>
            </span>
          </div>
        </div>

        {/* Action controls */}
        {!effectivePublicView && (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {!(hideShareControl || isPublicAppMode) && (
              <button
                type="button"
                onClick={generateAndCopyShareLink}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
                title="Generate a unique, read-only URL for this report to share with coaches"
              >
                <Share2 className="w-4 h-4 text-indigo-100" />
                <span>
                  {shareStatus === 'copied'
                    ? 'Link Copied!'
                    : selectedClub === 'all'
                    ? 'Share Public Link'
                    : `Share ${selectedClub} Link`}
                </span>
              </button>
            )}

            {/* Download selected club matrix as PDF */}
            {selectedClub !== 'all' && (
              <button
                type="button"
                onClick={() => downloadSingleClubMatrixPDF(selectedClub)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
                title={`Download the Taekwondo Matrix Grid for ${selectedClub} as a print-ready PDF`}
              >
                <Grid className="w-4 h-4 text-slate-950" />
                <span>Download {selectedClub} Matrix (PDF)</span>
              </button>
            )}

            {/* Download all clubs matrix as ZIP */}
            <button
              type="button"
              disabled={zipExportLoading}
              onClick={downloadAllClubsMatrixZIP}
              className={`bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95 ${
                zipExportLoading ? 'opacity-70 cursor-not-allowed animate-pulse' : ''
              }`}
              title="Download Taekwondo Matrix Grid PDFs for every club in a single ZIP folder"
            >
              <Download className="w-4 h-4 text-teal-100" />
              <span>{zipExportLoading ? 'Packaging ZIP...' : 'Download All Matrices (ZIP)'}</span>
            </button>

            {/* Download button */}
            <button
              type="button"
              onClick={() => {
                if (activeReportStyle === 'medal-standings') {
                  downloadClubMedalStandingsCSV();
                } else {
                  downloadClubReportCSV(selectedClub !== 'all' ? selectedClub : undefined);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
              title={activeReportStyle === 'medal-standings' ? "Download overall medal standings of clubs as a CSV spreadsheet" : "Download fight schedules for current filtered selection as a CSV spreadsheet"}
            >
              <Download className="w-4 h-4 text-emerald-100" />
              <span>{activeReportStyle === 'medal-standings' ? 'Export Medal Standings' : 'Export CSV Report'}</span>
            </button>

            {/* Print button */}
            <button
              type="button"
              onClick={triggerPrintReport}
              className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-extrabold text-xs px-4.5 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center gap-2 active:scale-95"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print Active View</span>
            </button>
          </div>
        )}
      </div>

      {shareStatus === 'copied' && (
        <div className="bg-emerald-50 border border-emerald-250 p-5 rounded-2xl flex flex-col gap-3.5 mt-5 animate-in fade-in slide-in-from-top-2 duration-305 no-print">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-emerald-200/70 pb-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <Check className="w-4 h-4 text-emerald-600 font-bold" />
              <h4 className="text-sm font-black">Share Link Ready & Copied!</h4>
            </div>

            {/* Mode Switcher */}
            {isAisDev && (
              <div className="flex items-center bg-white border border-emerald-200 rounded-xl p-1 shadow-2xs gap-1 text-xs font-semibold self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => switchDomainMode('public')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    shareDomainMode === 'public'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="Public address for coaches and athletes"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Public Link (ais-pre)</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchDomainMode('dev')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    shareDomainMode === 'dev'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="Your private dev container (only works for you)"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Dev Link (ais-dev)</span>
                </button>
                <button
                  type="button"
                  onClick={() => switchDomainMode('custom')}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    shareDomainMode === 'custom'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="Use a custom domain like Vercel or custom hosting"
                >
                  <span>Custom URL</span>
                </button>
              </div>
            )}
          </div>

          {/* Contextual guidance on 403 / 404 */}
          {isAisDev && shareDomainMode === 'public' && (
            <div className="bg-blue-50/90 border border-blue-200 text-blue-950 p-3 rounded-xl text-xs leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sharing with coaches, athletes, or parents? </span>
                Anyone can open this public link without Google login. If this is your first time sharing, click the{' '}
                <span className="font-bold text-blue-800 underline">"Share"</span> button in Google AI Studio's top toolbar to publish the app (otherwise Google returns 404 until published).
              </div>
            </div>
          )}

          {isAisDev && shareDomainMode === 'dev' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Private Developer Link (403 for other people): </span>
                This link points to your private dev container (<code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">ais-dev</code>). Anyone who opens it without your Google account will see{' '}
                <span className="font-bold">"403. That’s an error: you do not have access to this page"</span>. Switch to <span className="font-bold">Public Link (ais-pre)</span> above to share with coaches.
              </div>
            </div>
          )}

          {shareDomainMode === 'custom' && (
            <div className="bg-white border border-slate-200 p-3 rounded-xl flex flex-col gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium shrink-0">Custom Base URL:</span>
                <input
                  type="text"
                  placeholder="https://my-tournament.vercel.app"
                  value={customDomain}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomDomain(val);
                    try {
                      localStorage.setItem('tournament_custom_domain', val);
                    } catch {}
                    const path = shareRelativePath || (shareUrl ? new URL(shareUrl).search : '');
                    if (path) {
                      const u = `${val.trim().replace(/\/+$/, '')}${path}`;
                      setShareUrl(u);
                    }
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 w-full outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const val = 'https://my-publicboutchart.vercel.app';
                    setCustomDomain(val);
                    try {
                      localStorage.setItem('tournament_custom_domain', val);
                    } catch {}
                    const path = shareRelativePath || (shareUrl ? new URL(shareUrl).search : '');
                    if (path) {
                      const u = `${val}${path}`;
                      setShareUrl(u);
                    } else {
                      setShareUrl(`${val}/?view=club-report&id=active_state`);
                    }
                  }}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold border border-emerald-200 transition-colors cursor-pointer"
                >
                  🔗 Set to my-publicboutchart.vercel.app
                </button>
              </div>
            </div>
          )}

          {/* URL Bar & Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="bg-white border border-slate-300 text-xs text-slate-700 rounded-xl px-3 py-2.5 w-full outline-none focus:ring-1 focus:ring-emerald-500 font-mono select-all shadow-2xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  copyText(shareUrl);
                  setShareStatus('copied');
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 text-xs font-bold shadow-xs transition-all"
                title="Copy link to clipboard again"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2.5 rounded-xl cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 text-xs font-bold shadow-xs transition-all"
                title="Open report in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open</span>
              </a>
            </div>
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
              {true && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Report Layout Style:</span>
                  </div>
                  <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1 flex-wrap items-center">
                    <button
                      type="button"
                      onClick={() => handleSelectReportStyle('individual-lookup')}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        reportStyle === 'individual-lookup'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5 text-amber-500" />
                      <span>Find Player Schedule (Public View)</span>
                      {activePublicView === 'individual-lookup' && (
                        <span className="ml-1 text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black tracking-tight uppercase shadow-xs">
                          Active
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectReportStyle('photo-matrix')}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        reportStyle === 'photo-matrix'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                      <span>Taekwondo Matrix Grid (Reference Photo)</span>
                      {activePublicView === 'photo-matrix' && (
                        <span className="ml-1 text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black tracking-tight uppercase shadow-xs">
                          Active
                        </span>
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleSelectReportStyle('classic-cards')}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        reportStyle === 'classic-cards'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                      }`}
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                      <span>Classic Card Deck (Matchups Style)</span>
                      {activePublicView === 'classic-cards' && (
                        <span className="ml-1 text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black tracking-tight uppercase shadow-xs">
                          Active
                        </span>
                      )}
                    </button>

                    {!effectivePublicView && (
                      <button
                        type="button"
                        onClick={() => handleSelectReportStyle('medal-standings')}
                        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          reportStyle === 'medal-standings'
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5 text-amber-500" />
                        <span>🏆 Club Medal Standings &amp; Points</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSelectReportStyle('boutchart')}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        reportStyle === 'boutchart'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                      }`}
                    >
                      <AlignJustify className="w-3.5 h-3.5 text-amber-500" />
                      <span>Boutchart</span>
                      {activePublicView === 'boutchart' && (
                        <span className="ml-1 text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black tracking-tight uppercase shadow-xs">
                          Active
                        </span>
                      )}
                    </button>
                  </div>

                  {onActivePublicViewChange && reportStyle !== activePublicView && (
                    <button
                      type="button"
                      onClick={() => handleSelectReportStyle(reportStyle)}
                      className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm transition-all cursor-pointer active:scale-95 border border-amber-400"
                      title="Set current report view as the active default public view when visitors load this tournament"
                    >
                      <span>★</span>
                      <span>Set as Active Public View</span>
                    </button>
                  )}
                </div>
              )}

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

                {/* Ring Filter Pills (Start from Ring A, then Ring B, C, D, E...) */}
                {activeReportStyle !== 'medal-standings' && ringList.length > 0 && (
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto max-w-full">
                    <span className="text-[10px] font-black uppercase text-slate-500 px-1.5 flex items-center gap-1 shrink-0">
                      <span>🥋</span>
                      <span>Ring:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedRing('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 ${
                        selectedRing === 'all'
                          ? 'bg-slate-900 text-amber-400 shadow-xs'
                          : 'text-slate-650 hover:text-slate-900 hover:bg-white/70'
                      }`}
                      title="Show all rings in sequence: Ring A, then Ring B, C, D, E..."
                    >
                      All (A → E)
                    </button>
                    {ringList.map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSelectedRing(r)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 ${
                          selectedRing === r
                            ? 'bg-slate-900 text-amber-400 shadow-xs'
                            : 'text-slate-650 hover:text-slate-900 hover:bg-white/70'
                        }`}
                        title={`Filter specifically to Ring ${r}`}
                      >
                        Ring {r}
                      </button>
                    ))}
                  </div>
                )}

                {/* Event Filter Pills (Show distinct events e.g. Poomsae Cut-off, Poomsae PK, Sparring) */}
                {activeReportStyle !== 'medal-standings' && availableEvents.length > 1 && (
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto max-w-full">
                    <span className="text-[10px] font-black uppercase text-slate-500 px-1.5 flex items-center gap-1 shrink-0">
                      <span>⚡</span>
                      <span>Event:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 ${
                        selectedEvent === 'all'
                          ? 'bg-slate-900 text-amber-400 shadow-xs'
                          : 'text-slate-650 hover:text-slate-900 hover:bg-white/70'
                      }`}
                      title="Show all events"
                    >
                      All Events
                    </button>
                    {availableEvents.map(ev => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSelectedEvent(ev.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                          selectedEvent === ev.id
                            ? 'bg-slate-900 text-amber-400 shadow-xs'
                            : 'text-slate-650 hover:text-slate-900 hover:bg-white/70'
                        }`}
                        title={`Filter specifically to ${ev.label}`}
                      >
                        <span>{ev.icon}</span>
                        <span>{ev.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                )}

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
                {activeReportStyle !== 'medal-standings' && (
                  <button
                    type="button"
                    onClick={() => setShowOnlyScheduled(!showOnlyScheduled)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer select-none active:scale-95 ${
                      showOnlyScheduled
                        ? 'bg-amber-150 border-amber-300 text-amber-950 font-black'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {!isPublicView && (
                      <span className={`w-2 h-2 rounded-full ${showOnlyScheduled ? 'bg-amber-600 animate-pulse' : 'bg-slate-400'}`} />
                    )}
                    <span>{showOnlyScheduled ? 'Scheduled Fights Only' : 'Show All Registered'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ACTIVE STYLE VIEW AREA */}
          
          {/* STYLE 1: PHOTO-MATRIX TABULAR LAYOUT */}
          {activeReportStyle === 'photo-matrix' && (
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
                    {athletesGroupedByRing.map(group => {
                      const ringColors = getRingColorClasses(group.ring);
                      return (
                        <React.Fragment key={`ring-group-${group.ring}`}>
                          {/* Distinct Ring Header Banner */}
                          <tr className="bg-[#081d3a] text-white print:bg-slate-200 print:text-black">
                            <td colSpan={10} className="px-4 py-2.5 border border-[#cbd5e1] font-black uppercase tracking-wider text-xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <span className={`px-2.5 py-0.5 rounded-md font-black text-xs font-mono shadow-xs ${ringColors.tag}`}>
                                    {group.ring === 'Unassigned' ? 'NO RING' : `RING ${group.ring}`}
                                  </span>
                                  <span className="text-white font-black print:text-black text-xs tracking-wide">
                                    {group.ring === 'Unassigned' ? 'Unassigned Ring Categories' : `Competition Mat / Ring ${group.ring}`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-300 print:text-slate-700 font-bold">
                                  <span>{group.athletes.length} Competitor{group.athletes.length === 1 ? '' : 's'}</span>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Separate Event Sections within this Ring in Admin Sequence */}
                          {group.eventSections.map((evSec, evIdx) => {
                            const evInfo = evSec.eventInfo;
                            return (
                              <React.Fragment key={`ring-${group.ring}-ev-${evSec.eventId}`}>
                                {/* Distinct Event Subheader Banner */}
                                <tr className="bg-slate-100/90 text-slate-800 border-y border-[#cbd5e1] print:bg-slate-100">
                                  <td colSpan={10} className="px-4 py-2 border border-[#cbd5e1]">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-2xs ${evInfo.badgeBg} ${evInfo.badgeBorder} ${evInfo.badgeText}`}>
                                          {evInfo.icon} Event {evIdx + 1}: {evInfo.label}
                                        </span>
                                        <span className="text-slate-600 font-extrabold text-[11px] font-mono">
                                          ({evSec.athletes.length} Competitor{evSec.athletes.length === 1 ? '' : 's'})
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-500 font-bold uppercase">
                                        Mat / Ring {group.ring} • Sequence #{evIdx + 1}
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {evSec.athletes.map((ath, idx) => {
                                  const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
                                  const fightInfo = playersMap[athKey];
                                  const athleteBouts = fightInfo?.bouts || [];

                                  return (
                                    <tr 
                                      key={`${athKey}||${idx}`} 
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
                                                    isRed ? 'bg-[#dc2626]' : bout.corner === 'G' ? 'bg-emerald-600' : 'bg-[#1e40af]'
                                                  }`}
                                                  title={bout.corner === 'G' ? 'Poomsae Cut-Off' : isRed ? 'Hong (Red) Corner - Bottom Slot' : 'Chung (Blue) Corner - Top Slot'}
                                                >
                                                  {bout.corner === 'G' ? '' : bout.corner}
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
                              </React.Fragment>
                            );
                          })}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* STYLE 4: INDIVIDUAL LOOKUP LAYOUT */}
          {activeReportStyle === 'individual-lookup' && (() => {
            // Filter athlete list based on searchQuery, selectedClub, and selectedRing
            const filteredAthletesForLookup = athleteList.filter(ath => {
              const matchesSearch = searchQuery.trim() === '' || 
                ath.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ath.club.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ath.weight.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesClub = selectedClub === 'all' || ath.club === selectedClub;
              const cat = categories[ath.weight];
              const ringLabel = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';
              const matchesRing = selectedRing === 'all' || ringLabel.toUpperCase() === selectedRing.toUpperCase();
              return matchesSearch && matchesClub && matchesRing;
            });

            // Sort them starting from Ring A, then Ring B, C, D, E... then competitor name
            filteredAthletesForLookup.sort((a, b) => {
              const catA = categories[a.weight];
              const catB = categories[b.weight];
              const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
              const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;
              if (ringA !== ringB) return ringA - ringB;
              return a.name.localeCompare(b.name);
            });

            return (
              <div className="space-y-6">
                {/* Search / Explanation Header */}
                <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-md">
                  {/* Backdrop decoration */}
                  <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none rounded-r-3xl" />
                  
                  <div className="relative z-10 space-y-4 max-w-2xl">
                    <div className={`inline-flex bg-amber-500/10 border border-amber-500/25 px-3 py-1 ${isPublicView ? 'rounded-xl' : 'rounded-full'} text-xs font-black text-amber-400 font-mono uppercase tracking-widest leading-none`}>
                      🥋 Public Fighter Portal
                    </div>
                    <h3 className="text-xl md:text-2xl font-black tracking-tight text-white font-sans">
                      Find Competitor Ring &amp; Live Match Schedule
                    </h3>
                    <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-medium">
                      Coaches, parents, and athletes: type your name or club below to load your personalized **Fighter Pass** instantly. Get live ring allocations, round schedules, opponent records, and corner assignments.
                    </p>

                    {/* Prominent centered search bar for easy typing on mobile */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <div className="flex-1 flex items-center gap-3 bg-slate-800/80 border border-slate-700/80 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 rounded-2xl px-4 py-3.5 transition-all">
                        <Search className="w-5 h-5 text-amber-400 shrink-0" />
                        <input
                          type="text"
                          placeholder="Type competitor's name (e.g. John Doe)..."
                          className="bg-transparent border-none outline-none text-sm text-white placeholder-slate-400 w-full font-bold uppercase tracking-wide"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                          <button 
                            type="button" 
                            onClick={() => setSearchQuery('')}
                            className="text-xs font-bold text-slate-400 hover:text-white uppercase px-1.5 py-0.5 rounded hover:bg-slate-700/50 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {selectedClub !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setSelectedClub('all')}
                          className="px-4 py-3 bg-slate-800 border border-slate-750 hover:bg-slate-750 text-xs font-bold rounded-2xl text-amber-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          Reset Club Filter
                        </button>
                      )}
                    </div>

                    {/* Pre-filtered Quick Suggestions if empty search query */}
                    {searchQuery.trim() === '' && (
                      <div className="pt-2 text-xs text-slate-400 flex flex-wrap items-center gap-2">
                        <span className="font-bold">Suggested Quick Search:</span>
                        {clubList.slice(0, 5).map(club => (
                          <button
                            key={club}
                            type="button"
                            onClick={() => setSearchQuery(club)}
                            className="bg-slate-800 hover:bg-slate-750 hover:text-white border border-slate-700/60 rounded-lg px-2.5 py-1 text-[11px] font-extrabold text-slate-300 transition-colors cursor-pointer"
                          >
                            {club}
                          </button>
                        ))}
                        {clubList.length > 5 && <span className="italic">and {clubList.length - 5} more</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Athlete lookup cards list */}
                {searchQuery.trim() === '' ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-4">
                    <div className={`inline-flex bg-amber-500/10 text-amber-600 p-4 ${isPublicView ? 'rounded-xl' : 'rounded-full'} border border-amber-500/15`}>
                      <Search className="w-6 h-6 text-amber-500" />
                    </div>
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Awaiting Search Query</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto font-medium">
                      Please enter a competitor name, partial name, or academy/club above to search through the roster and matches database.
                    </p>
                  </div>
                ) : filteredAthletesForLookup.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-4">
                    <div className={`inline-flex bg-rose-50 text-rose-600 p-4 ${isPublicView ? 'rounded-xl' : 'rounded-full'} border border-rose-100`}>
                      <ShieldAlert className="w-6 h-6 text-rose-500" />
                    </div>
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">No Players Found</h4>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto font-medium">
                      No competitor names or clubs matched <strong className="text-slate-900 font-extrabold font-mono bg-slate-200 px-1.5 py-0.5 rounded">"{searchQuery}"</strong>. Please verify spelling or search using a different keyword.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredAthletesForLookup.map((ath, idx) => {
                      const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
                      const fightInfo = playersMap[athKey];
                      const athleteBouts = fightInfo?.bouts || [];
                      const isCopied = !!copiedPlayerMap[athKey];
                      const isLoadingLink = !!loadingPlayerMap[athKey];

                      const getPlayerShareLinkAsync = async () => {
                        const baseUrl = getPublicBaseUrl();
                        const urlParams = new URLSearchParams(window.location.search);
                        let idParam = urlParams.get('id');
                        const dataParam = urlParams.get('data');
                        const pathname = window.location.pathname;
                        
                        // If a share URL was already generated by the user clicking 'Get Public Link'
                        if (shareUrl) {
                          try {
                            const shareUrlObj = new URL(shareUrl);
                            shareUrlObj.searchParams.set('player', ath.name);
                            // Also ensure view=club-report is there if it's using the query param format
                            if ((!shareUrl.includes('view=club-report') && !shareUrl.includes('/report/'))) {
                              shareUrlObj.searchParams.set('view', 'club-report');
                            }
                            return shareUrlObj.toString();
                          } catch (e) {
                            console.error(e);
                          }
                        }

                        const isReportPath = pathname.startsWith('/report') || pathname.startsWith('/club-report');
                        if (isReportPath) {
                          const parts = pathname.split('/');
                          const possibleId = parts[parts.length - 1];
                          if (possibleId && possibleId !== 'report' && possibleId !== 'club-report') {
                            idParam = possibleId;
                          }
                        }
                        
                        let link = `${baseUrl}`;
                        if (idParam) {
                          link += `/?view=club-report&id=${idParam}&player=${encodeURIComponent(ath.name)}`;
                        } else if (dataParam) {
                          link += `/?view=club-report&data=${dataParam}&player=${encodeURIComponent(ath.name)}`;
                        } else {
                          const payload = {
                            t: tournamentName || 'Tournament',
                            r: roster,
                            c: categories,
                            b: brackets,
                            rl: ringLabelFormat,
                            leftLogo, leftLogo2, rightLogo, rightLogo2
                          };
                          
                          try {
                            // Automatically save to Firestore to get a short, reliable URL
                            const newDocRef = doc(collection(db, 'reports'));
                            await setDoc(newDocRef, { payload: JSON.stringify(payload) });
                            const baseReportUrl = `${baseUrl}/?view=club-report&id=${newDocRef.id}`;
                            setShareUrl(baseReportUrl);
                            link = `${baseReportUrl}&player=${encodeURIComponent(ath.name)}`;
                          } catch (firebaseErr) {
                            console.warn('Firebase save failed on-the-fly, trying local server api', firebaseErr);
                            try {
                              const apiRes = await fetch('/api/reports', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                              });
                              if (!apiRes.ok) throw new Error('API failed');
                              const resData = await apiRes.json();
                              if (resData && resData.id) {
                                const baseReportUrl = `${baseUrl}/?view=club-report&id=${resData.id}`;
                                setShareUrl(baseReportUrl);
                                link = `${baseReportUrl}&player=${encodeURIComponent(ath.name)}`;
                              } else {
                                throw new Error('No ID returned');
                              }
                            } catch (apiErr) {
                              console.warn('Local API failed on-the-fly, falling back to compression', apiErr);
                              try {
                                const jsonStr = JSON.stringify(payload);
                                const base64Str = await compressToGzipBase64(jsonStr);
                                link = `${baseUrl}/?view=club-report&data=${base64Str}&player=${encodeURIComponent(ath.name)}`;
                              } catch (compressErr) {
                                console.error('All on-the-fly mechanisms failed', compressErr);
                                link = `${baseUrl}/?view=club-report&player=${encodeURIComponent(ath.name)}`;
                              }
                            }
                          }
                        }
                        
                        return link;
                      };

                      return (
                        <div 
                          key={`${athKey}||${idx}`} 
                          className="bg-white border-2 border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:border-amber-400 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                        >
                          {/* Fighter pass header block */}
                          <div className="bg-slate-900 text-white p-5 relative overflow-hidden">
                            <div className="absolute right-4 top-2 text-[60px] opacity-10 select-none font-black text-slate-600 font-sans pointer-events-none">
                              🥋
                            </div>
                            
                            <div className="flex items-start justify-between gap-4 relative z-10">
                              <div className="space-y-1">
                                <span className="bg-amber-450/20 text-amber-300 text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded border border-amber-500/20">
                                  Official Fighter Pass
                                </span>
                                <h4 className="font-black text-base tracking-tight uppercase font-sans text-white mt-1.5 leading-snug">
                                  {ath.name}
                                </h4>
                                <p className="text-[10px] text-amber-400 font-extrabold uppercase flex items-center gap-1">
                                  <span>🏠</span>
                                  <span>{ath.club}</span>
                                </p>
                              </div>

                              {/* Ring allocation badge */}
                              <div className="text-right shrink-0">
                                <span className={`inline-block text-[10px] font-black uppercase tracking-wider rounded-lg px-2.5 py-1 text-center shadow-sm font-sans ${
                                  fightInfo?.ringLabel === 'Unassigned' 
                                    ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                                    : 'bg-emerald-500 text-white font-black animate-pulse border border-emerald-400'
                                }`}>
                                  {fightInfo?.ringLabel === 'Unassigned' ? 'RING: TBD' : `RING ${fightInfo?.ringLabel}`}
                                </span>
                                <div className="text-[9px] text-slate-400 font-black mt-1 uppercase font-mono tracking-widest">
                                  {ath.weight}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Bouts scheduled body list */}
                          <div className="p-5 flex-1 flex flex-col justify-between space-y-4 bg-slate-50/30">
                            <div>
                              <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                                Match schedule details
                              </h5>

                              {athleteBouts.length === 0 ? (
                                (() => {
                                  const hasBracket = !!brackets[ath.weight];
                                  if (!hasBracket) {
                                    return (
                                      <div className="bg-white border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
                                        <ShieldAlert className="w-5 h-5 text-slate-400 shrink-0" />
                                        <div>
                                          <p className="text-xs font-bold text-slate-700 leading-snug">
                                            No Bracket Drawn Yet
                                          </p>
                                          <p className="text-[10px] text-slate-500 mt-0.5">
                                            This category has not been drawn to generate competition matches.
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="bg-white border border-slate-200/70 rounded-xl p-3.5 flex items-center gap-3">
                                      {isPublicView ? (
                                        <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                                      ) : (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                      )}
                                      <div>
                                        <p className="text-xs font-bold text-slate-800 leading-snug">
                                          Bye Allocation
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                          Fighter starts with a direct walkover slot on the bracket tree.
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                <div className="space-y-3">
                                  {athleteBouts.map(bout => {
                                    const isRed = bout.corner === 'H';
                                    return (
                                      <div 
                                        key={bout.formattedId}
                                        className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-3xs flex items-center justify-between gap-4 hover:border-slate-350 transition-colors"
                                      >
                                        <div className="space-y-1.5 min-w-0 flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="bg-slate-900 text-amber-400 text-[9px] font-mono font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                              Bout {bout.formattedId}
                                            </span>
                                            <span className="text-[9px] bg-slate-100 font-extrabold text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wide font-sans">
                                              {bout.roundName}
                                            </span>
                                          </div>
                                          
                                          {/* Opponent row */}
                                          <p className="text-xs font-extrabold text-slate-800 truncate">
                                            <span className="text-[10px] text-slate-450 uppercase font-mono font-normal tracking-wide pr-1">VS</span>
                                            {bout.opponentName}
                                          </p>
                                          
                                          {bout.opponentClub && !bout.opponentName.startsWith('Winner of') && (
                                            <p className="text-[9px] text-slate-500 font-extrabold uppercase italic flex items-center gap-1 pl-4">
                                              <span>🏠</span>
                                              <span className="truncate">{bout.opponentClub}</span>
                                            </p>
                                          )}
                                        </div>

                                        {/* Corner assignment visually high contrast */}
                                        <div className="shrink-0 text-center">
                                          <span className={`w-14 text-center py-1.5 rounded-lg text-[10px] font-black text-white flex flex-col items-center justify-center shadow-3xs leading-none uppercase tracking-wide ${
                                            isRed ? 'bg-[#dc2626]' : bout.corner === 'G' ? 'bg-emerald-600' : 'bg-[#1e40af]'
                                          }`}>
                                            <span className="text-[7px] text-white/70 tracking-widest font-bold uppercase block mb-0.5">{bout.corner === 'G' ? 'Order' : 'Corner'}</span>
                                            {bout.corner === 'G' ? 'TURN' : isRed ? 'RED' : 'BLUE'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Actions footer for single fighter card */}
                            <div className="flex gap-2 pt-3 border-t border-slate-150/80 no-print">
                              <button
                                type="button"
                                disabled={isLoadingLink}
                                onClick={async () => {
                                  try {
                                    setLoadingPlayerMap(prev => ({ ...prev, [athKey]: true }));
                                    const link = await getPlayerShareLinkAsync();
                                    copyText(link);
                                    setCopiedPlayerMap(prev => ({ ...prev, [athKey]: true }));
                                    setTimeout(() => {
                                      setCopiedPlayerMap(prev => ({ ...prev, [athKey]: false }));
                                    }, 2000);
                                  } catch (e) {
                                    console.error('Failed to copy athlete link', e);
                                  } finally {
                                    setLoadingPlayerMap(prev => ({ ...prev, [athKey]: false }));
                                  }
                                }}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-250 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-700">Link Copied!</span>
                                  </>
                                ) : isLoadingLink ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Generating Link...</span>
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span>Copy Athlete Link</span>
                                  </>
                                )}
                              </button>

                              {/* Print single card button */}
                              <button
                                type="button"
                                onClick={() => {
                                  const origTitle = document.title;
                                  document.title = `${ath.name} - Fighter Pass`;
                                  window.print();
                                  document.title = origTitle;
                                }}
                                className="px-3 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl transition-all cursor-pointer border border-slate-800 flex items-center justify-center active:scale-95"
                                title="Print this individual card"
                              >
                                <Printer className="w-4 h-4 text-amber-400" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* STYLE 2: CLASSIC CARD DECK LAYOUT */}
          {activeReportStyle === 'classic-cards' && (
            <div className="space-y-6">
              {/* Card Grouping Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 p-2.5 rounded-2xl no-print">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <span>📋 View Mode:</span>
                  </span>
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setCardsGroupMode('ring')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        cardsGroupMode === 'ring'
                          ? 'bg-slate-900 text-amber-400 shadow-xs'
                          : 'text-slate-650 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      🥋 Show by Ring (Ring A, then B, C, D, E)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardsGroupMode('club')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        cardsGroupMode === 'club'
                          ? 'bg-slate-900 text-amber-400 shadow-xs'
                          : 'text-slate-650 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      🏢 Show by Club
                    </button>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  {cardsGroupMode === 'ring' ? `${ringGroupedCards.length} Rings Active` : `${visibleClubsForCards.length} Clubs`}
                </span>
              </div>

              {cardsGroupMode === 'ring' ? (
                /* CARDS GROUPED BY RING (Start from Ring A, then Ring B, C, D, E...) */
                ringGroupedCards.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium text-sm no-print">
                    No matches found for selected ring and filter criteria.
                  </div>
                ) : (
                  <div className="space-y-8">
                    {ringGroupedCards.map(ringCard => {
                      const ringColors = getRingColorClasses(ringCard.ringKey);
                      let boutsCount = 0;
                      ringCard.athletes.forEach(a => {
                        const athKey = `${a.name}||${a.club}||${a.weight}`;
                        boutsCount += playersMap[athKey]?.bouts.length || 0;
                      });

                      return (
                        <div key={`ring-card-${ringCard.ringKey}`} className="bg-slate-50/60 rounded-2xl border border-slate-200 overflow-hidden shadow-xs print:border-0 print:shadow-none print:bg-white print:p-0 page-break-inside-avoid print:mt-4 print:mb-8">
                          {/* Ring Header Row */}
                          <div className="bg-slate-900 px-5 py-3.5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:bg-slate-150 print:text-black print:border-b-2 print:border-slate-900 print:px-2 print:py-2">
                            <div className="flex items-center gap-3">
                              <span className={`w-8 h-8 rounded-xl font-black text-sm flex items-center justify-center font-mono shadow-xs ${ringColors.tag}`}>
                                {ringCard.ringKey === 'Unassigned' ? '?' : ringCard.ringKey}
                              </span>
                              <div>
                                <h3 className="font-extrabold text-base tracking-tight text-white print:text-slate-950 font-sans print:font-black flex flex-wrap items-center gap-2">
                                  <span>{ringCard.ringName}</span>
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 print:text-slate-600">
                                  Competition Mat Card Deck &amp; Fighter Progression
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                              <span className="bg-slate-800 text-slate-200 px-2.5 rounded-md py-1 font-bold print:border print:border-slate-400 print:text-black print:bg-white">
                                {ringCard.athletes.length} Athlete{ringCard.athletes.length === 1 ? '' : 's'}
                              </span>
                              <span className="bg-amber-400 text-slate-950 font-black px-2.5 rounded-md py-1 uppercase tracking-wide print:border print:border-slate-800">
                                {boutsCount} Scheduled Bout{boutsCount === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>

                          {/* Athlete Matchup Cards Grid Separated by Event */}
                          <div className="p-4 md:p-5 bg-white print:px-1 print:py-2">
                            {ringCard.eventSections.map((evSec, evIdx) => {
                              const evInfo = evSec.eventInfo;
                              return (
                                <div key={`ring-${ringCard.ringKey}-ev-${evSec.eventId}`} className="mb-6 last:mb-0">
                                  {/* Distinct Event Subheader Banner */}
                                  <div className="flex items-center justify-between bg-slate-100/90 border border-slate-200/90 rounded-xl px-4 py-2 mb-3 shadow-2xs">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-2xs ${evInfo.badgeBg} ${evInfo.badgeBorder} ${evInfo.badgeText}`}>
                                        {evInfo.icon} Event {evIdx + 1}: {evInfo.label}
                                      </span>
                                      <span className="text-xs font-bold text-slate-600 font-mono">
                                        ({evSec.athletes.length} Competitor{evSec.athletes.length === 1 ? '' : 's'})
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                                      Ring {ringCard.ringKey} • Sequence #{evIdx + 1}
                                    </span>
                                  </div>

                                  <div className="divide-y divide-slate-200/80">
                                    {evSec.athletes.map((ath, idx) => {
                                      const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
                                      const fightInfo = playersMap[athKey];
                                      const athleteBouts = fightInfo?.bouts || [];

                                      return (
                                        <div key={`${athKey}||${idx}`} className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-start justify-between gap-4 print:py-3 print:page-break-inside-avoid">
                                          {/* Left column: Competitor Info */}
                                          <div className="min-w-[220px]">
                                            <p className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 font-sans print:text-black">
                                              <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0 print:hidden" />
                                              {ath.name}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                              <span className="bg-slate-105 hover:bg-slate-200/80 text-slate-800 font-bold text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wide border border-slate-200/60 print:bg-white print:border print:border-slate-300">
                                                {ath.weight}
                                              </span>
                                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                                                {ath.club}
                                              </span>
                                              <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md border ${
                                                ringCard.ringKey === 'Unassigned' ? 'text-slate-400 bg-slate-100 border-slate-200' : ringColors.bg
                                              }`}>
                                                {ringCard.ringKey === 'Unassigned' ? 'No Mat Assigned' : `Mat / Ring: ${ringCard.ringKey}`}
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
                                                    {isPublicView ? (
                                                      <Check className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                                                    ) : (
                                                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                                                    )}
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
                                                          
                                                          <span className={`px-2 py-0.5 rounded font-black text-[9px] text-white flex items-center gap-1 uppercase ${
                                                            isRed ? 'bg-[#dc2626]' : bout.corner === 'G' ? 'bg-emerald-600' : 'bg-[#1e40af]'
                                                          }`}>
                                                            {bout.corner === 'G' ? 'TURN' : `Corner: ${bout.corner}`}
                                                          </span>
                                                        </div>

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
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* CARDS GROUPED BY CLUB */
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
                                  Battle Card Deck &amp; Fighter Roster (Sorted by Ring A → E)
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
                            {clubAthletes.map((ath, idx) => {
                              const athKey = `${ath.name}||${ath.club}||${ath.weight}`;
                              const fightInfo = playersMap[athKey];
                              const athleteBouts = fightInfo?.bouts || [];
                              const athRingColors = getRingColorClasses(fightInfo?.ringLabel || 'A');

                              return (
                                <div key={`${athKey}||${idx}`} className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-start justify-between gap-4 print:py-3 print:page-break-inside-avoid">
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
                                      <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md border ${
                                        fightInfo?.ringLabel === 'Unassigned' ? 'text-slate-400 bg-slate-100 border-slate-200' : athRingColors.bg
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
                                        {isPublicView ? (
                                          <Check className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                                        ) : (
                                          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                                        )}
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
                                                isRed ? 'bg-[#dc2626]' : bout.corner === 'G' ? 'bg-emerald-600' : 'bg-[#1e40af]'
                                              }`}>
                                                {bout.corner === 'G' ? 'TURN' : `Corner: ${bout.corner}`}
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
        </div>
      )}

          {/* STYLE 3: CLUB MEDAL STANDINGS LAYOUT */}
          {activeReportStyle === 'medal-standings' && (() => {
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
                          if (index === 0) rankBadge = isPublicView ? <span className="text-sm font-sans flex items-center justify-center font-black">🥇</span> : <span className="text-sm shadow-2xs font-sans w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center font-black text-amber-700 border border-amber-300">🥇</span>;
                          else if (index === 1) rankBadge = isPublicView ? <span className="text-sm font-sans flex items-center justify-center font-black">🥈</span> : <span className="text-sm shadow-2xs font-sans w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-700 border border-slate-300">🥈</span>;
                          else if (index === 2) rankBadge = isPublicView ? <span className="text-sm font-sans flex items-center justify-center font-black">🥉</span> : <span className="text-sm shadow-2xs font-sans w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center font-black text-amber-800 border border-amber-200">🥉</span>;

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
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCertificateData({
                                                      athleteName: med.athleteName,
                                                      club: club.clubName,
                                                      category: med.division,
                                                    });
                                                  }}
                                                  className="p-1.5 text-amber-600 hover:text-white hover:bg-amber-500 border border-transparent rounded bg-slate-50 hover:border-amber-600 transition-all cursor-pointer no-print flex items-center justify-center gap-1 text-[10px] font-bold"
                                                  title="Print certificate of achievement for this medalist"
                                                >
                                                  <Award className="w-3.5 h-3.5" />
                                                  <span>Cert</span>
                                                </button>
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

          {/* STYLE 5: BOUTCHART (BRACKETS) LAYOUT */}
          {activeReportStyle === 'boutchart' && (() => {
            const bracketsToRenderKeys = Object.keys(brackets).filter(key => {
              const model = brackets[key];
              if (!model || !model.nodes || Object.keys(model.nodes).length === 0) return false;
              if (selectedClub !== 'all') {
                // Check if any node in the bracket belongs to the selected club
                return model.nodes.some(round => round && round.some(n => n && n.club === selectedClub));
              }
              if (selectedRing !== 'all') {
                const cat = categories[key];
                const catRing = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';
                return catRing.toUpperCase() === selectedRing.toUpperCase();
              }
              return true;
            }).sort((a, b) => {
              const catA = categories[a];
              const catB = categories[b];
              const ringA = catA?.ring ? getRingSortOrder(getRingLabel(catA.ring)) : 99999;
              const ringB = catB?.ring ? getRingSortOrder(getRingLabel(catB.ring)) : 99999;
              
              // 1. PRIMARY SORT: Start from Ring A, then Ring B, C, D, E...
              if (ringA !== ringB) return ringA - ringB;

              // 2. SECONDARY SORT: Sequence of events decided by admin for this ring
              const ringNum = catA?.ring || 1;
              const effectiveEventSeq = (ringEventSequences && ringEventSequences[ringNum]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;
              const evA = getCategoryEventInfo(catA?.systemType, catA?.event, a, catA?.name).id;
              const evB = getCategoryEventInfo(catB?.systemType, catB?.event, b, catB?.name).id;
              const rankA = getEventOrderRank(evA, effectiveEventSeq);
              const rankB = getEventOrderRank(evB, effectiveEventSeq);
              if (rankA !== rankB) return rankA - rankB;

              // 3. TERTIARY SORT: Age and weight
              return compareCategoriesByAgeAndWeight(a, b, catA, catB);
            });

            // Ensure sequential bout numbering for Poomsae Cut-Off boutcharts:
            let poomsaeSequenceCounter = 1;
            bracketsToRenderKeys.forEach(key => {
              const model = brackets[key];
              if (model && model.systemType === 'poomsae-cutoff') {
                const round = model.nodes?.[0] || [];
                for (let i = 0; i < round.length; i++) {
                  if (round[i] && !round[i].isBye && round[i].name) {
                    round[i].bout = poomsaeSequenceCounter;
                    round[i].isPoomsae = true;
                    if (model.cutoffScores) {
                      const scoreKey = `${round[i].name}||${round[i].club || ''}`;
                      if (model.cutoffScores[scoreKey]) {
                        model.cutoffScores[scoreKey].bout = poomsaeSequenceCounter;
                        model.cutoffScores[scoreKey].isPoomsae = true;
                      }
                    }
                    poomsaeSequenceCounter++;
                  }
                }
              }
            });

            if (bracketsToRenderKeys.length === 0) {
              return (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-medium text-sm no-print">
                  No boutcharts found for the selected {selectedRing !== 'all' ? `Ring ${selectedRing}` : 'criteria'}.
                </div>
              );
            }

            // Group brackets by ring strictly in sequence: Ring A, then Ring B, C, D, E...
            const ringBracketsMap: Record<string, string[]> = {};
            bracketsToRenderKeys.forEach(key => {
              const cat = categories[key];
              const ring = cat?.ring && cat.ring > 0 ? getRingLabel(cat.ring) : 'Unassigned';
              if (!ringBracketsMap[ring]) ringBracketsMap[ring] = [];
              ringBracketsMap[ring].push(key);
            });

            const sortedRingKeys = Object.keys(ringBracketsMap).sort((a, b) => getRingSortOrder(a) - getRingSortOrder(b));

            return (
              <div className="space-y-10 print:space-y-6 pb-10">
                {sortedRingKeys.map(rKey => {
                  const keysInRing = ringBracketsMap[rKey];
                  const ringColors = getRingColorClasses(rKey);
                  const ringNum = getRingNumberFromLabel(rKey);
                  const effectiveEventSeq = (ringEventSequences && ringEventSequences[ringNum]) || eventSequenceOrder || DEFAULT_EVENT_SEQUENCE;

                  // Group brackets in this ring by Event according to admin's sequence
                  const ringEventMap: Record<string, string[]> = {};
                  keysInRing.forEach(k => {
                    const cat = categories[k];
                    const ev = getCategoryEventInfo(cat?.systemType, cat?.event, k, cat?.name).id;
                    if (!ringEventMap[ev]) ringEventMap[ev] = [];
                    ringEventMap[ev].push(k);
                  });

                  const sortedEvIds = Object.keys(ringEventMap).sort((a, b) => {
                    return getEventOrderRank(a, effectiveEventSeq) - getEventOrderRank(b, effectiveEventSeq);
                  });

                  return (
                    <div key={`ring-section-${rKey}`} className="space-y-6">
                      {/* Ring Header Banner */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3.5 flex items-center justify-between text-white shadow-md print:bg-slate-100 print:text-black print:border-slate-800">
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-xl font-black text-sm flex items-center justify-center font-mono shadow-xs ${ringColors.tag}`}>
                            {rKey === 'Unassigned' ? '?' : rKey}
                          </span>
                          <div>
                            <h3 className="font-black text-base text-amber-400 print:text-black">
                              {rKey === 'Unassigned' ? 'Unassigned Ring Categories' : `Ring ${rKey} — Boutcharts`}
                            </h3>
                            <p className="text-[11px] text-slate-400 print:text-slate-600 font-medium">
                              {keysInRing.length} Division Bracket{keysInRing.length === 1 ? '' : 's'} assigned to Mat {rKey} • {sortedEvIds.length} Event{sortedEvIds.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-300 print:text-slate-800 hidden sm:inline-block">
                          {selectedClub !== 'all' ? `Filtered by ${selectedClub}` : 'All Participating Clubs'}
                        </span>
                      </div>

                      {/* Brackets in this Ring separated by Event */}
                      <div className="space-y-8">
                        {sortedEvIds.map((evId, evIdx) => {
                          const evKeys = ringEventMap[evId];
                          const sampleCat = categories[evKeys[0]];
                          const evInfo = getCategoryEventInfo(sampleCat?.systemType, sampleCat?.event, evKeys[0], sampleCat?.name);

                          return (
                            <div key={`ring-${rKey}-ev-${evId}`} className="space-y-4">
                              {/* Event Subheader Banner */}
                              <div className="flex items-center justify-between bg-slate-100/90 border border-slate-200 rounded-xl px-4 py-2.5 shadow-2xs">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider border shadow-2xs ${evInfo.badgeBg} ${evInfo.badgeBorder} ${evInfo.badgeText}`}>
                                    {evInfo.icon} Event {evIdx + 1}: {evInfo.label}
                                  </span>
                                  <span className="text-xs font-bold text-slate-600 font-mono">
                                    ({evKeys.length} Division Bracket{evKeys.length === 1 ? '' : 's'})
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                                  Ring {rKey} • Sequence #{evIdx + 1}
                                </span>
                              </div>

                              <div className="space-y-6">
                                {evKeys.map(key => {
                                  const model = brackets[key];
                                  const cat = categories[key];
                                  return (
                                    <BracketCanvas
                                      key={`boutchart-${key}`}
                                      bracket={model}
                                      ring={getRingLabel(cat?.ring || 1)}
                                      entrantCount={cat?.count || 0}
                                      layout="classic"
                                      tournamentName={tournamentName}
                                      boutLabelFormat={boutLabelFormat}
                                      isPublicView={true}
                                      onReshuffle={() => {}}
                                      onCheckboxToggle={() => {}}
                                      onTextChange={() => {}}
                                      onUpdateCutoffScores={() => {}}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

        </div>
      )}
      {certificateData && (
        <CertificateModal
          athleteName={certificateData.athleteName}
          club={certificateData.club}
          category={certificateData.category}
          tournamentName={tournamentName}
          onClose={() => setCertificateData(null)}
        />
      )}
    </section>
  );
};
