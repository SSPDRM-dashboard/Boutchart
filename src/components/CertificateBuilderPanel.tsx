import React, { useState, useEffect } from 'react';
import { Athlete } from '../types';
import { Award, Printer, Shield, Star, Calendar, MapPin, Search, Users, Sparkles, CheckCircle2 } from 'lucide-react';

interface CertificateBuilderPanelProps {
  roster: Athlete[];
  tournamentName?: string;
}

type CertificateType = 'achievement' | 'participation' | 'first-place' | 'second-place' | 'third-place';
type CertificateTheme = 'gold' | 'crimson' | 'slate';

export const CertificateBuilderPanel: React.FC<CertificateBuilderPanelProps> = ({
  roster,
  tournamentName = 'MY-TKD BBUIDER Tournament',
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);

  // Customized certificate fields
  const [name, setName] = useState('');
  const [clubName, setClubName] = useState('');
  const [division, setDivision] = useState('');
  const [eventTitle, setEventTitle] = useState(tournamentName);
  const [certType, setCertType] = useState<CertificateType>('achievement');
  const [theme, setTheme] = useState<CertificateTheme>('gold');
  const [isBlankTemplate, setIsBlankTemplate] = useState(false);
  const [isOverprintMode, setIsOverprintMode] = useState(false);
  const [hideStaticLabels, setHideStaticLabels] = useState(false);
  const [nudgeGlobalY, setNudgeGlobalY] = useState(0);
  const [nudgeGlobalX, setNudgeGlobalX] = useState(0);
  const [nudgeNameY, setNudgeNameY] = useState(0);
  const [nudgeClubY, setNudgeClubY] = useState(0);
  const [nudgeDivisionY, setNudgeDivisionY] = useState(0);
  const [nudgeHeaderY, setNudgeHeaderY] = useState(0);
  const [nudgeSignY, setNudgeSignY] = useState(0);
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  });
  const [location, setLocation] = useState('Championship Arena');
  const [signatory1, setSignatory1] = useState('Organizing Chairman');
  const [signatory2, setSignatory2] = useState('Head Referee');

  // New customizable states for full inline editing and blank canvas support
  const [customTitle, setCustomTitle] = useState('CERTIFICATE OF ACHIEVEMENT');
  const [customSub, setCustomSub] = useState('OUTSTANDING PERFORMANCE');
  const [presentedTo, setPresentedTo] = useState('This is proudly presented to');
  const [awardReason, setAwardReason] = useState('for demonstrating exceptional athletic skill and high sportsmanship in the weight class of');
  const [awardLabel, setAwardLabel] = useState('Official Tournament Award');
  const [representingLabel, setRepresentingLabel] = useState('REPRESENTING');
  const [sig1Label, setSig1Label] = useState('Official Committee Signature');
  const [sig2Label, setSig2Label] = useState('Referee Committee Signature');

  // Sync title and subtitle on certType changes
  useEffect(() => {
    const d = getCertTypeDetails();
    setCustomTitle(d.title);
    setCustomSub(d.sub);
  }, [certType]);

  const handleMakeBlankCanvas = () => {
    setSelectedAthlete(null);
    setName('');
    setClubName('');
    setDivision('');
    setEventTitle('');
    setCustomTitle('');
    setCustomSub('');
    setPresentedTo('');
    setAwardReason('');
    setAwardLabel('');
    setRepresentingLabel('');
    setLocation('');
    setDateStr('');
    setSignatory1('');
    setSignatory2('');
    setSig1Label('');
    setSig2Label('');
    setIsBlankTemplate(false);
  };

  // Sync state if tournamentName changes
  useEffect(() => {
    if (tournamentName) {
      setEventTitle(tournamentName);
    }
  }, [tournamentName]);

  // Handle athlete selection from search
  const handleSelectAthlete = (athlete: Athlete) => {
    setSelectedAthlete(athlete);
    setName(athlete.name);
    setClubName(athlete.club || 'Individual');
    setDivision(athlete.weight || '');
    setSearchQuery(''); // clear search after selection
  };

  // Filter roster based on search query
  const filteredRoster = searchQuery.trim() === ''
    ? []
    : roster.filter(ath => 
        ath.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ath.club && ath.club.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ath.weight && ath.weight.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 5);

  // Print trigger
  const handlePrint = () => {
    document.body.classList.add('certificate-print-active');
    
    const revertPrint = () => {
      document.body.classList.remove('certificate-print-active');
      window.removeEventListener('afterprint', revertPrint);
    };

    window.addEventListener('afterprint', revertPrint);
    
    setTimeout(() => {
      window.print();
      // Safety revert after 1 second
      setTimeout(revertPrint, 1000);
    }, 50);
  };

  // Type definitions for headers and subtitles based on certificate type
  const getCertTypeDetails = () => {
    switch (certType) {
      case 'first-place':
        return {
          title: 'CERTIFICATE OF CHAMPIONSHIP',
          sub: 'FIRST PLACE WINNER',
          color: 'text-amber-600',
          sealText: '1ST PLACE',
        };
      case 'second-place':
        return {
          title: 'CERTIFICATE OF MERIT',
          sub: 'SECOND PLACE WINNER',
          color: 'text-slate-500',
          sealText: '2ND PLACE',
        };
      case 'third-place':
        return {
          title: 'CERTIFICATE OF MERIT',
          sub: 'THIRD PLACE WINNER',
          color: 'text-amber-700',
          sealText: '3RD PLACE',
        };
      case 'participation':
        return {
          title: 'CERTIFICATE OF PARTICIPATION',
          sub: 'HONORABLE COMPETITOR',
          color: 'text-sky-700',
          sealText: 'PARTICIPANT',
        };
      case 'achievement':
      default:
        return {
          title: 'CERTIFICATE OF ACHIEVEMENT',
          sub: 'OUTSTANDING PERFORMANCE',
          color: 'text-amber-600',
          sealText: 'EXCELLENCE',
        };
    }
  };

  const details = getCertTypeDetails();

  const displayName = isBlankTemplate ? '________________________________________' : (name || '________________________________________');
  const displayClub = isBlankTemplate ? '____________________' : (clubName || '____________________');
  const displayDivision = isBlankTemplate ? '____________________' : (division || '____________________');

  // Get theme styles
  const getThemeStyles = () => {
    switch (theme) {
      case 'crimson':
        return {
          border: 'border-rose-900',
          secondaryBorder: 'border-rose-800/40',
          accentBg: 'bg-rose-50',
          accentText: 'text-rose-900',
          sealBg: 'bg-rose-600 text-white border-rose-800',
          ribbonColor: 'text-rose-700',
        };
      case 'slate':
        return {
          border: 'border-slate-800',
          secondaryBorder: 'border-slate-700/40',
          accentBg: 'bg-slate-50',
          accentText: 'text-slate-800',
          sealBg: 'bg-slate-700 text-white border-slate-900',
          ribbonColor: 'text-slate-500',
        };
      case 'gold':
      default:
        return {
          border: 'border-amber-600',
          secondaryBorder: 'border-amber-500/40',
          accentBg: 'bg-amber-50/40',
          accentText: 'text-amber-900',
          sealBg: 'bg-amber-500 text-slate-950 border-amber-600',
          ribbonColor: 'text-amber-600',
        };
    }
  };

  const themeStyles = getThemeStyles();

  return (
    <section className="space-y-6">
      
      {/* CSS injection specifically for printing certificates in high quality landscape */}
      <style>{`
        @media print {
          /* Hide all page content except the certificate element */
          body.certificate-print-active > :not(.certificate-modal-overlay) {
            display: none !important;
          }
          body.certificate-print-active .no-print-element {
            display: none !important;
          }
          
          body.certificate-print-active .certificate-modal-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            z-index: 9999999 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            overflow: hidden !important;
          }

          body.certificate-print-active .certificate-modal-card {
            border: none !important;
            box-shadow: none !important;
            width: 297mm !important; /* A4 landscape size */
            height: 210mm !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            transform: none !important;
            background: white !important;
          }

          body.certificate-print-active .certificate-print-area {
            width: 100% !important;
            height: 100% !important;
            padding: 15mm !important;
            box-sizing: border-box !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
          }

          @page {
            size: landscape;
            margin: 0;
          }
        }
      `}</style>

      {/* Main Container */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-6 no-print-element">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Official Award Certificates</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">
              Design &amp; Print Custom Professional Certificates for Tournament Competitors
            </p>
          </div>
          
          <button
            onClick={handlePrint}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95 text-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print Current Certificate</span>
          </button>
        </div>

        {/* Builder Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Form Side - Left 5 cols */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Quick Search Section */}
            <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl space-y-3">
              <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>Search &amp; Load Athlete From Roster</span>
              </h4>
              
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-slate-400 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-400"
                  placeholder="Type athlete's name, club or division..."
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>

              {/* Suggestions dropdown */}
              {filteredRoster.length > 0 && (
                <div className="border border-slate-200 bg-white rounded-xl shadow-lg overflow-hidden divide-y divide-slate-100 z-50 relative mt-1">
                  {filteredRoster.map((ath, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectAthlete(ath)}
                      className="w-full px-4 py-2.5 text-left hover:bg-amber-50/50 transition-colors flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div>
                        <p className="font-black text-slate-900 uppercase group-hover:text-amber-700">{ath.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                          {ath.club || 'Individual'} • {ath.weight}
                        </p>
                      </div>
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              {/* Selection status */}
              <div className="flex flex-col gap-2.5 pt-1.5 border-t border-slate-200/50">
                {selectedAthlete ? (
                  <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl text-xs text-amber-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                      <span className="truncate">Loaded: {selectedAthlete.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAthlete(null);
                        setName('');
                        setClubName('');
                        setDivision('');
                      }}
                      className="text-[10px] text-red-500 hover:text-red-700 hover:underline cursor-pointer font-black uppercase shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAthlete(null);
                        setName('');
                        setClubName('');
                        setDivision('');
                        setIsBlankTemplate(false);
                      }}
                      className="w-full px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-black transition-colors uppercase tracking-wider text-center"
                    >
                      ✨ Clear Name/Club/Division
                    </button>
                    <button
                      type="button"
                      onClick={handleMakeBlankCanvas}
                      className="w-full px-3 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-black transition-colors uppercase tracking-wider text-center"
                    >
                      🗑️ Total Blank Canvas (Clear All)
                    </button>
                  </div>
                )}

                {/* Blank Template Toggle */}
                <label className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-xl cursor-pointer hover:bg-amber-500/10 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={isBlankTemplate}
                    onChange={(e) => setIsBlankTemplate(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-500 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="text-left">
                    <p className="text-xs font-black text-amber-950 uppercase leading-none">Print as Blank Handwriting Template</p>
                    <p className="text-[10px] text-amber-600/80 font-semibold mt-0.5 leading-none">Generates blank lines (___) to write name/category by hand</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Customizer Parameters */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                Certificate Details &amp; Typography
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Award Level / Type
                  </label>
                  <select
                    value={certType}
                    onChange={(e) => {
                      const val = e.target.value as CertificateType;
                      setCertType(val);
                      if (val === 'first-place') setTheme('gold');
                      else if (val === 'second-place') setTheme('slate');
                      else if (val === 'third-place') setTheme('crimson');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                  >
                    <option value="achievement">Achievement Medal</option>
                    <option value="participation">Participation</option>
                    <option value="first-place">1st Place Champion</option>
                    <option value="second-place">2nd Place Winner</option>
                    <option value="third-place">3rd Place Winner</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Border Frame Theme
                  </label>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as CertificateTheme)}
                    className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
                  >
                    <option value="gold">Luxury Gold</option>
                    <option value="crimson">Royal Crimson</option>
                    <option value="slate">Sleek Charcoal Slate</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Recipient Name (Display Name)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm font-black text-slate-900 uppercase outline-none transition-all placeholder:text-slate-350"
                    placeholder="Enter full recipient name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Club / Affiliation
                    </label>
                    <input
                      type="text"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-all"
                      placeholder="e.g. Club / Individual"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Division / Weight Class
                    </label>
                    <input
                      type="text"
                      value={division}
                      onChange={(e) => setDivision(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-all"
                      placeholder="e.g. Male Cadet Heavyweight"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Tournament Header Title
                  </label>
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-black text-slate-900 uppercase outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Date
                    </label>
                    <input
                      type="text"
                      value={dateStr}
                      onChange={(e) => setDateStr(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Location / Arena
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Signatory 1 (Left)
                    </label>
                    <input
                      type="text"
                      value={signatory1}
                      onChange={(e) => setSignatory1(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Signatory 2 (Right)
                    </label>
                    <input
                      type="text"
                      value={signatory2}
                      onChange={(e) => setSignatory2(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Hardcopy Overprint Controls */}
            <div className="bg-amber-500/5 border border-amber-500/20 p-4.5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-sm">🖨️</span>
                  <span>Hardcopy Overprint Settings</span>
                </h4>
                <span className="text-[9px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-black font-mono">
                  SPECIALIZED
                </span>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isOverprintMode}
                    onChange={(e) => setIsOverprintMode(e.target.checked)}
                    className="w-4.5 h-4.5 mt-0.5 rounded border-amber-500 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black text-slate-900 uppercase">Enable Overprint Mode</span>
                    <p className="text-[10px] text-slate-500 leading-normal font-medium">
                      Hides all borders, backgrounds, seals, and visual frames. Prints **ONLY** the dynamic text fields directly onto your physical pre-printed certificates.
                    </p>
                  </div>
                </label>

                {isOverprintMode && (
                  <label className="flex items-start gap-2.5 cursor-pointer select-none pt-2 border-t border-slate-200/50">
                    <input
                      type="checkbox"
                      checked={hideStaticLabels}
                      onChange={(e) => setHideStaticLabels(e.target.checked)}
                      className="w-4.5 h-4.5 mt-0.5 rounded border-amber-500 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-black text-slate-900 uppercase">Hide Static Labels</span>
                      <p className="text-[10px] text-slate-500 leading-normal font-medium">
                        Hides helper labels like "REPRESENTING" and "for demonstrating exceptional..." so they don't clash with your pre-printed text templates.
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Slider Nudging Offsets */}
              <div className="space-y-3 pt-3 border-t border-slate-200/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    📐 mm alignment offsets
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNudgeGlobalY(0);
                      setNudgeGlobalX(0);
                      setNudgeNameY(0);
                      setNudgeClubY(0);
                      setNudgeDivisionY(0);
                      setNudgeHeaderY(0);
                      setNudgeSignY(0);
                    }}
                    className="text-[9px] text-rose-500 hover:text-rose-700 font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Reset Offsets
                  </button>
                </div>

                {/* Sliders */}
                <div className="space-y-2.5">
                  {/* Global Y */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Global Vert Offset (Up/Down)</span>
                      <span className="font-mono font-black text-slate-800">{nudgeGlobalY > 0 ? `+${nudgeGlobalY}` : nudgeGlobalY} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={nudgeGlobalY}
                      onChange={(e) => setNudgeGlobalY(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Global X */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Global Horiz Offset (Left/Right)</span>
                      <span className="font-mono font-black text-slate-800">{nudgeGlobalX > 0 ? `+${nudgeGlobalX}` : nudgeGlobalX} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={nudgeGlobalX}
                      onChange={(e) => setNudgeGlobalX(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Name Y */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Player Name Position Shift</span>
                      <span className="font-mono font-black text-slate-800">{nudgeNameY > 0 ? `+${nudgeNameY}` : nudgeNameY} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      value={nudgeNameY}
                      onChange={(e) => setNudgeNameY(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Club Y */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Club Name Position Shift</span>
                      <span className="font-mono font-black text-slate-800">{nudgeClubY > 0 ? `+${nudgeClubY}` : nudgeClubY} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      value={nudgeClubY}
                      onChange={(e) => setNudgeClubY(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Division Y */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Division Position Shift</span>
                      <span className="font-mono font-black text-slate-800">{nudgeDivisionY > 0 ? `+${nudgeDivisionY}` : nudgeDivisionY} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      value={nudgeDivisionY}
                      onChange={(e) => setNudgeDivisionY(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Header Y */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Title/Header Position Shift</span>
                      <span className="font-mono font-black text-slate-800">{nudgeHeaderY > 0 ? `+${nudgeHeaderY}` : nudgeHeaderY} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      value={nudgeHeaderY}
                      onChange={(e) => setNudgeHeaderY(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Signatures Y */}
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                      <span>Signatures Position Shift</span>
                      <span className="font-mono font-black text-slate-800">{nudgeSignY > 0 ? `+${nudgeSignY}` : nudgeSignY} mm</span>
                    </div>
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      value={nudgeSignY}
                      onChange={(e) => setNudgeSignY(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Preview Canvas Side - Right 7 cols */}
          <div className="lg:col-span-7 flex flex-col justify-center items-center bg-slate-900 border border-slate-800 rounded-2xl p-6 relative">
            <span className="absolute top-3.5 right-3.5 text-[9px] font-mono font-bold tracking-widest text-slate-500 bg-slate-950/40 px-2 py-0.5 rounded-md uppercase uppercase">
              Landscape A4 Preview
            </span>
            
            {/* Real Interactive Preview Card */}
            <div className="w-full flex justify-center items-center gap-1 text-xs text-amber-500 font-bold mb-1 select-none animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>💡 Hover & click directly on any text inside the certificate to edit it!</span>
            </div>

            <div 
              className={`certificate-print-area w-full aspect-[1.414/1] rounded-xl p-8 relative select-none flex flex-col justify-between overflow-hidden my-4 transition-all duration-150 ${
                isOverprintMode 
                  ? 'bg-transparent border border-dashed border-amber-500/20 shadow-none text-slate-900' 
                  : 'bg-white text-slate-900 shadow-2xl border border-slate-100'
              }`}
            >
              
              {/* Elegant Double Border */}
              {!isOverprintMode && (
                <>
                  <div className={`absolute inset-3 border-4 ${themeStyles.border} pointer-events-none`}></div>
                  <div className={`absolute inset-4 border-2 border-dashed ${themeStyles.secondaryBorder} pointer-events-none`}></div>
                </>
              )}

              {/* Corner Decorative Elements */}
              {!isOverprintMode && (
                <>
                  <div className="absolute top-6 left-6 flex gap-1 pointer-events-none">
                    <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                    <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mt-1`} />
                  </div>
                  <div className="absolute top-6 right-6 flex gap-1 pointer-events-none flex-row-reverse">
                    <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                    <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mt-1`} />
                  </div>
                  <div className="absolute bottom-6 left-6 flex gap-1 pointer-events-none">
                    <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                    <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mb-1 self-end`} />
                  </div>
                  <div className="absolute bottom-6 right-6 flex gap-1 pointer-events-none flex-row-reverse">
                    <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                    <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mb-1 self-end`} />
                  </div>
                </>
              )}

              {/* Certificate Header Block */}
              <div 
                className="text-center space-y-1 pt-2 z-10 transition-transform"
                style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeHeaderY)}mm)` }}
              >
                {!hideStaticLabels && (
                  <input
                    type="text"
                    value={awardLabel}
                    onChange={(e) => setAwardLabel(e.target.value)}
                    placeholder="Official Tournament Award"
                    className={`w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[9px] font-black tracking-[0.25em] ${themeStyles.accentText} uppercase rounded transition-all`}
                  />
                )}
                {!hideStaticLabels && (
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="EVENT TITLE"
                    className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-xs font-black tracking-widest text-slate-900 uppercase rounded transition-all"
                  />
                )}
                {!hideStaticLabels && <div className="w-16 h-0.5 bg-slate-300 mx-auto my-1"></div>}
              </div>

              {/* Certificate Main Title & Award Type */}
              <div 
                className="text-center space-y-2 z-10 transition-transform"
                style={{ transform: `translate(${nudgeGlobalX}mm, ${nudgeGlobalY}mm)` }}
              >
                {!hideStaticLabels && (
                  <>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="CERTIFICATE TITLE"
                      className={`w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-2xl font-black tracking-tight ${details.color} uppercase rounded transition-all`}
                    />
                    <input
                      type="text"
                      value={customSub}
                      onChange={(e) => setCustomSub(e.target.value)}
                      placeholder="SUBTITLE"
                      className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[10px] font-extrabold tracking-widest text-slate-500 uppercase rounded transition-all"
                    />
                  </>
                )}
              </div>

              {/* Presented To block */}
              <div 
                className="text-center space-y-3.5 z-10 my-1 transition-transform"
                style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeNameY)}mm)` }}
              >
                {!hideStaticLabels && (
                  <input
                    type="text"
                    value={presentedTo}
                    onChange={(e) => setPresentedTo(e.target.value)}
                    placeholder="This is proudly presented to"
                    className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[11px] italic font-serif text-slate-500 rounded transition-all"
                  />
                )}
                <div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isBlankTemplate ? "________________________________________" : "RECIPIENT NAME"}
                    className="w-full bg-transparent text-center border-b border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-3xl font-black tracking-tight text-slate-900 uppercase font-sans px-8 pb-1 transition-all"
                  />
                </div>
                <div 
                  className="flex items-center justify-center gap-1 w-full text-[10px] font-bold text-slate-600 tracking-wider transition-transform"
                  style={{ transform: `translate(0mm, ${nudgeClubY}mm)` }}
                >
                  {!hideStaticLabels && (
                    <input
                      type="text"
                      value={representingLabel}
                      onChange={(e) => setRepresentingLabel(e.target.value)}
                      placeholder="REPRESENTING"
                      className="bg-transparent text-right border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 font-bold uppercase rounded transition-all text-[10px] w-28 px-1"
                    />
                  )}
                  <input
                    type="text"
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder={isBlankTemplate ? "____________________" : "INDIVIDUAL / CLUB"}
                    className="bg-transparent text-left border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 font-extrabold uppercase text-slate-900 rounded transition-all text-[10px] w-44 px-1"
                  />
                </div>
              </div>

              {/* Division Detail */}
              <div 
                className="text-center space-y-2 z-10 px-8 transition-transform"
                style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeDivisionY)}mm)` }}
              >
                {!hideStaticLabels && (
                  <textarea
                    value={awardReason}
                    onChange={(e) => setAwardReason(e.target.value)}
                    placeholder="Reason for Award"
                    rows={2}
                    className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[10px] text-slate-500 italic font-serif resize-none rounded transition-all leading-relaxed"
                  />
                )}
                <div className="inline-flex items-center justify-center gap-1">
                  {!hideStaticLabels && <span className="text-xs">🥋</span>}
                  <input
                    type="text"
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    placeholder={isBlankTemplate ? "____________________" : "DIVISION CATEGORY"}
                    className={`bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-xs text-slate-900 font-black px-4 py-1 rounded-lg uppercase tracking-wider transition-all ${
                      hideStaticLabels ? '' : 'bg-slate-100 border border-slate-200/50'
                    }`}
                  />
                </div>
              </div>

              {/* Bottom Section: Location, Signatures, and Gold Ribbon Seal */}
              <div 
                className="grid grid-cols-3 items-end gap-2 pb-2 z-10 text-center transition-transform"
                style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeSignY)}mm)` }}
              >
                
                {/* Left Signatory */}
                <div className="flex flex-col items-center justify-end px-2">
                  <div className={`w-full pt-1 ${hideStaticLabels ? '' : 'border-t border-slate-300'}`}>
                    <input
                      type="text"
                      value={signatory1}
                      onChange={(e) => setSignatory1(e.target.value)}
                      placeholder="Signatory 1 Title"
                      className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[9px] font-extrabold text-slate-800 uppercase tracking-wider rounded transition-all"
                    />
                    {!hideStaticLabels && (
                      <input
                        type="text"
                        value={sig1Label}
                        onChange={(e) => setSig1Label(e.target.value)}
                        placeholder="Signature 1 Label"
                        className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[7px] text-slate-400 font-semibold tracking-normal mt-0.5 rounded transition-all"
                      />
                    )}
                  </div>
                </div>

                {/* Center Seal / Rosette ribbon */}
                <div className="flex flex-col items-center justify-center relative -bottom-2">
                  {!isOverprintMode && (
                    <>
                      {/* Ribbon tails */}
                      <div className="absolute top-4 flex gap-3 pointer-events-none">
                        <div className={`w-3.5 h-12 ${themeStyles.ribbonColor} fill-current rotate-[15deg] transform origin-top`} style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)', backgroundColor: 'currentColor' }}></div>
                        <div className={`w-3.5 h-12 ${themeStyles.ribbonColor} fill-current -rotate-[15deg] transform origin-top`} style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)', backgroundColor: 'currentColor' }}></div>
                      </div>
                      {/* Gold Seal circle */}
                      <div className={`w-14 h-14 rounded-full ${themeStyles.sealBg} border-2 shadow flex flex-col items-center justify-center text-center p-1 z-10`}>
                        <Shield className="w-4 h-4 mb-0.5" />
                        <span className="text-[6px] font-black tracking-widest leading-none uppercase text-center block">
                          {details.sealText}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Right Signatory */}
                <div className="flex flex-col items-center justify-end px-2">
                  <div className={`w-full pt-1 ${hideStaticLabels ? '' : 'border-t border-slate-300'}`}>
                    <input
                      type="text"
                      value={signatory2}
                      onChange={(e) => setSignatory2(e.target.value)}
                      placeholder="Signatory 2 Title"
                      className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[9px] font-extrabold text-slate-800 uppercase tracking-wider rounded transition-all"
                    />
                    {!hideStaticLabels && (
                      <input
                        type="text"
                        value={sig2Label}
                        onChange={(e) => setSig2Label(e.target.value)}
                        placeholder="Signature 2 Label"
                        className="w-full bg-transparent text-center border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[7px] text-slate-400 font-semibold tracking-normal mt-0.5 rounded transition-all"
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* Location & Date Footer footer block */}
              <div 
                className={`flex justify-between items-center text-[8px] font-bold text-slate-400 pt-2 px-1 z-10 transition-transform ${
                  hideStaticLabels ? '' : 'border-t border-slate-100'
                }`}
                style={{ transform: `translate(${nudgeGlobalX}mm, ${nudgeGlobalY}mm)` }}
              >
                <span className="flex items-center gap-1">
                  {!hideStaticLabels && <Calendar className="w-2.5 h-2.5 text-slate-400" />}
                  {!hideStaticLabels && <span>DATE:</span>}
                  <input
                    type="text"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    placeholder="Date"
                    className="bg-transparent text-left border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[8px] font-bold text-slate-500 rounded transition-all w-24"
                  />
                </span>
                <span className="flex items-center gap-1">
                  {!hideStaticLabels && <MapPin className="w-2.5 h-2.5 text-slate-400" />}
                  {!hideStaticLabels && <span>VENUE:</span>}
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Venue"
                    className="bg-transparent text-right border border-dashed border-transparent hover:border-amber-500/30 focus:border-amber-500 focus:bg-amber-50/10 focus:outline-none focus:ring-0 text-[8px] font-bold text-slate-500 rounded transition-all w-32"
                  />
                </span>
              </div>

            </div>

            <button
              onClick={handlePrint}
              className="mt-2 w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer animate-pulse"
            >
              <Printer className="w-4 h-4" />
              <span>PHYSICAL PRINT / BROWSER DRIVER</span>
            </button>
          </div>

        </div>
      </div>

      {/* When in A4 print mode, we render the standalone clean full-page element that only has the certificate layout */}
      <div className="certificate-modal-overlay hidden">
        <div className="certificate-modal-card">
          <div 
            className={`certificate-print-area w-full h-full p-8 relative flex flex-col justify-between overflow-hidden ${
              isOverprintMode ? 'bg-transparent border-0 shadow-none text-slate-900' : 'bg-white text-slate-900'
            }`}
          >
            {/* Elegant Double Border */}
            {!isOverprintMode && (
              <>
                <div className={`absolute inset-3 border-4 ${themeStyles.border} pointer-events-none`}></div>
                <div className={`absolute inset-4 border-2 border-dashed ${themeStyles.secondaryBorder} pointer-events-none`}></div>
              </>
            )}

            {/* Corner Decorative Elements */}
            {!isOverprintMode && (
              <>
                <div className="absolute top-6 left-6 flex gap-1 pointer-events-none">
                  <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                  <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mt-1`} />
                </div>
                <div className="absolute top-6 right-6 flex gap-1 pointer-events-none flex-row-reverse">
                  <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                  <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mt-1`} />
                </div>
                <div className="absolute bottom-6 left-6 flex gap-1 pointer-events-none">
                  <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                  <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mb-1 self-end`} />
                </div>
                <div className="absolute bottom-6 right-6 flex gap-1 pointer-events-none flex-row-reverse">
                  <Star className={`w-3.5 h-3.5 ${themeStyles.ribbonColor} fill-current`} />
                  <Star className={`w-2 h-2 ${themeStyles.ribbonColor} fill-current mb-1 self-end`} />
                </div>
              </>
            )}

            {/* Certificate Header Block */}
            <div 
              className="text-center space-y-1 pt-2 z-10 transition-transform"
              style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeHeaderY)}mm)` }}
            >
              {!hideStaticLabels && awardLabel && (
                <p className={`text-[9px] font-black tracking-[0.25em] ${themeStyles.accentText} uppercase`}>
                  {awardLabel}
                </p>
              )}
              {!hideStaticLabels && eventTitle && (
                <h4 className="text-xs font-black tracking-widest text-slate-900 uppercase">
                  {eventTitle}
                </h4>
              )}
              {!hideStaticLabels && (awardLabel || eventTitle) && <div className="w-16 h-0.5 bg-slate-300 mx-auto my-1"></div>}
            </div>

            {/* Certificate Main Title & Award Type */}
            <div 
              className="text-center space-y-2 z-10 transition-transform"
              style={{ transform: `translate(${nudgeGlobalX}mm, ${nudgeGlobalY}mm)` }}
            >
              {!hideStaticLabels && (
                <>
                  {customTitle && (
                    <h2 className={`text-2xl font-black tracking-tight ${details.color} uppercase`}>
                      {customTitle}
                    </h2>
                  )}
                  {customSub && (
                    <p className="text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
                      {customSub}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Presented To block */}
            <div 
              className="text-center space-y-3.5 z-10 my-1 font-sans transition-transform"
              style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeNameY)}mm)` }}
            >
              {!hideStaticLabels && presentedTo && (
                <p className="text-[11px] italic font-serif text-slate-500">
                  {presentedTo}
                </p>
              )}
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase font-sans border-b border-slate-200 inline-block px-8 pb-1">
                  {displayName}
                </h1>
              </div>
              <p 
                className="text-[10px] font-bold text-slate-600 tracking-wider transition-transform"
                style={{ transform: `translate(0mm, ${nudgeClubY}mm)` }}
              >
                {!hideStaticLabels && representingLabel ? `${representingLabel} ` : ""}
                <span className="text-slate-900 uppercase font-extrabold">{displayClub}</span>
              </p>
            </div>

            {/* Division Detail */}
            <div 
              className="text-center space-y-2 z-10 px-8 transition-transform"
              style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeDivisionY)}mm)` }}
            >
              {!hideStaticLabels && awardReason && (
                <p className="text-[10px] text-slate-500 italic font-serif whitespace-pre-line leading-relaxed">
                  {awardReason}
                </p>
              )}
              <p className={`text-xs text-slate-900 font-black px-4 py-1.5 rounded-lg uppercase tracking-wider inline-block ${
                hideStaticLabels ? '' : 'bg-slate-100 border border-slate-200'
              }`}>
                {!hideStaticLabels && "🥋 "}
                {displayDivision}
              </p>
            </div>

            {/* Bottom Section: Location, Signatures, and Gold Ribbon Seal */}
            <div 
              className="grid grid-cols-3 items-end gap-2 pb-2 z-10 text-center transition-transform"
              style={{ transform: `translate(${nudgeGlobalX}mm, ${(nudgeGlobalY + nudgeSignY)}mm)` }}
            >
              <div className="flex flex-col items-center justify-end px-2">
                <div className={`w-full pt-1 ${hideStaticLabels ? '' : 'border-t border-slate-300'}`}>
                  <p className="text-[9px] font-extrabold text-slate-800 uppercase tracking-wider">
                    {signatory1}
                  </p>
                  {!hideStaticLabels && sig1Label && (
                    <p className="text-[7px] text-slate-400 font-semibold tracking-normal mt-0.5">
                      {sig1Label}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center relative -bottom-2">
                {!isOverprintMode && (
                  <>
                    <div className="absolute top-4 flex gap-3 pointer-events-none">
                      <div className={`w-3.5 h-12 ${themeStyles.ribbonColor} fill-current rotate-[15deg] transform origin-top`} style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)', backgroundColor: 'currentColor' }}></div>
                      <div className={`w-3.5 h-12 ${themeStyles.ribbonColor} fill-current -rotate-[15deg] transform origin-top`} style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)', backgroundColor: 'currentColor' }}></div>
                    </div>
                    <div className={`w-14 h-14 rounded-full ${themeStyles.sealBg} border-2 shadow flex flex-col items-center justify-center text-center p-1 z-10`}>
                      <Shield className="w-4 h-4 mb-0.5" />
                      <span className="text-[6px] font-black tracking-widest leading-none uppercase text-center block">
                        {details.sealText}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col items-center justify-end px-2">
                <div className={`w-full pt-1 ${hideStaticLabels ? '' : 'border-t border-slate-300'}`}>
                  <p className="text-[9px] font-extrabold text-slate-800 uppercase tracking-wider">
                    {signatory2}
                  </p>
                  {!hideStaticLabels && sig2Label && (
                    <p className="text-[7px] text-slate-400 font-semibold tracking-normal mt-0.5">
                      {sig2Label}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div 
              className={`flex justify-between items-center text-[8px] font-bold text-slate-400 pt-2 px-1 z-10 transition-transform ${
                hideStaticLabels ? '' : 'border-t border-slate-100'
              }`}
              style={{ transform: `translate(${nudgeGlobalX}mm, ${nudgeGlobalY}mm)` }}
            >
              <span className="flex items-center gap-1">
                {!hideStaticLabels && <Calendar className="w-2.5 h-2.5 text-slate-400" />}
                <span>{!hideStaticLabels && "DATE: "}{dateStr}</span>
              </span>
              <span className="flex items-center gap-1">
                {!hideStaticLabels && <MapPin className="w-2.5 h-2.5 text-slate-400" />}
                <span>{!hideStaticLabels && "VENUE: "}{location}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
};
