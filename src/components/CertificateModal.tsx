import React, { useState, useEffect } from 'react';
import { Award, Printer, X, Shield, Star, Calendar, MapPin, Edit3 } from 'lucide-react';

interface CertificateModalProps {
  athleteName: string;
  club: string;
  category: string;
  tournamentName?: string;
  onClose: () => void;
}

type CertificateType = 'achievement' | 'participation' | 'first-place' | 'second-place' | 'third-place';
type CertificateTheme = 'gold' | 'crimson' | 'slate';

export const CertificateModal: React.FC<CertificateModalProps> = ({
  athleteName,
  club,
  category,
  tournamentName = 'MY-TKD BBUIDER Tournament',
  onClose,
}) => {
  // Customizable fields
  const [name, setName] = useState(athleteName);
  const [clubName, setClubName] = useState(club || 'Individual');
  const [division, setDivision] = useState(category);
  const [eventTitle, setEventTitle] = useState(tournamentName);
  const [certType, setCertType] = useState<CertificateType>('achievement');
  const [theme, setTheme] = useState<CertificateTheme>('gold');
  
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  });
  const [location, setLocation] = useState('Championship Arena');
  const [signatory1, setSignatory1] = useState('Organizing Chairman');
  const [signatory2, setSignatory2] = useState('Head Referee');

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

  const displayName = name || '________________________________________';
  const displayClub = clubName || '____________________';
  const displayDivision = division || '____________________';

  return (
    <div className="certificate-modal-overlay fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex flex-col justify-center items-center p-4 overflow-y-auto">
      
      {/* CSS injection specifically for printing certificates in high quality landscape */}
      <style>{`
        @media print {
          /* Hide all page content except the certificate overlay */
          body.certificate-print-active > :not(.certificate-modal-overlay) {
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
          }

          body.certificate-print-active .no-print-element {
            display: none !important;
          }

          @page {
            size: landscape;
            margin: 0;
          }
        }
      `}</style>

      {/* Main card */}
      <div className="certificate-modal-card bg-slate-900 border border-slate-800 text-white rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col lg:flex-row overflow-hidden max-h-[90vh] no-print-element">
        
        {/* Left Side: Parameters Form (hidden during browser printing) */}
        <div className="w-full lg:w-1/3 p-6 bg-slate-950 border-r border-slate-800 overflow-y-auto no-print-element space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Certificate Designer</span>
            </h3>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Certificate options */}
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Certificate Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['achievement', 'participation', 'first-place', 'second-place', 'third-place'] as CertificateType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setCertType(t);
                      if (t === 'first-place') setTheme('gold');
                      else if (t === 'second-place') setTheme('slate');
                      else if (t === 'third-place') setTheme('crimson');
                    }}
                    className={`px-2 py-1.5 rounded-lg border text-left font-bold transition-all truncate cursor-pointer capitalize ${
                      certType === t 
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm' 
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {t.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Border Theme
              </label>
              <div className="flex gap-2">
                {(['gold', 'crimson', 'slate'] as CertificateTheme[]).map((th) => (
                  <button
                    key={th}
                    type="button"
                    onClick={() => setTheme(th)}
                    className={`flex-1 py-1.5 rounded-lg border font-bold transition-all capitalize cursor-pointer ${
                      theme === th 
                        ? 'bg-white text-slate-950 border-white font-extrabold' 
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {th}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Recipient Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  placeholder="Athlete Name"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Club / Team Name
                </label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  placeholder="Club/Team Name"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Division / Weight Category
                </label>
                <input
                  type="text"
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                  placeholder="e.g. Senior Male Heavyweight"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Tournament Name
                </label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2 text-white font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Event Date
                  </label>
                  <input
                    type="text"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-1.5 text-white font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Arena / Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-1.5 text-white font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Signatory 1 Title
                  </label>
                  <input
                    type="text"
                    value={signatory1}
                    onChange={(e) => setSignatory1(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-1.5 text-white font-bold outline-none text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Signatory 2 Title
                  </label>
                  <input
                    type="text"
                    value={signatory2}
                    onChange={(e) => setSignatory2(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-1.5 text-white font-bold outline-none text-[11px]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handlePrint}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print Certificate</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
              💡 Choose <strong>Landscape</strong> orientation inside the browser printer layout.
            </p>
          </div>
        </div>

        {/* Right Side: Certificate Preview & Print Canvas */}
        <div className="w-full lg:w-2/3 p-6 bg-slate-950 flex items-center justify-center relative min-h-[350px] lg:min-h-0 overflow-auto">
          {/* Print area container */}
          <div className="certificate-print-area w-[100%] max-w-[750px] aspect-[1.414/1] bg-white text-slate-900 rounded-lg p-8 shadow-inner border border-slate-800 relative select-none flex flex-col justify-between overflow-hidden">
            
            {/* Elegant Double Border */}
            <div className={`absolute inset-3 border-4 ${themeStyles.border} pointer-events-none`}></div>
            <div className={`absolute inset-4 border-2 border-dashed ${themeStyles.secondaryBorder} pointer-events-none`}></div>

            {/* Corner Decorative Elements */}
            <div className="absolute top-6 left-6 flex gap-1 pointer-events-none">
              <Star className={`w-3 h-3 ${themeStyles.ribbonColor} fill-current`} />
              <Star className={`w-1.5 h-1.5 ${themeStyles.ribbonColor} fill-current mt-1`} />
            </div>
            <div className="absolute top-6 right-6 flex gap-1 pointer-events-none flex-row-reverse">
              <Star className={`w-3 h-3 ${themeStyles.ribbonColor} fill-current`} />
              <Star className={`w-1.5 h-1.5 ${themeStyles.ribbonColor} fill-current mt-1`} />
            </div>
            <div className="absolute bottom-6 left-6 flex gap-1 pointer-events-none">
              <Star className={`w-3 h-3 ${themeStyles.ribbonColor} fill-current`} />
              <Star className={`w-1.5 h-1.5 ${themeStyles.ribbonColor} fill-current mb-1 self-end`} />
            </div>
            <div className="absolute bottom-6 right-6 flex gap-1 pointer-events-none flex-row-reverse">
              <Star className={`w-3 h-3 ${themeStyles.ribbonColor} fill-current`} />
              <Star className={`w-1.5 h-1.5 ${themeStyles.ribbonColor} fill-current mb-1 self-end`} />
            </div>

            {/* Certificate Header Block */}
            <div className="text-center space-y-1 pt-2 z-10">
              <p className={`text-[9px] font-black tracking-[0.25em] ${themeStyles.accentText} uppercase`}>
                Official Tournament Award
              </p>
              <h4 className="text-xs font-black tracking-widest text-slate-900 uppercase">
                {eventTitle}
              </h4>
              <div className="w-16 h-0.5 bg-slate-300 mx-auto my-1"></div>
            </div>

            {/* Certificate Main Title & Award Type */}
            <div className="text-center space-y-2 z-10">
              <h2 className={`text-2xl font-black tracking-tight ${details.color}`}>
                {details.title}
              </h2>
              <p className="text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
                {details.sub}
              </p>
            </div>

            {/* Presented To block */}
            <div className="text-center space-y-3 z-10 my-1">
              <p className="text-[11px] italic font-serif text-slate-500">
                This is proudly presented to
              </p>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase font-sans border-b border-slate-200 inline-block px-8 pb-1">
                  {displayName}
                </h1>
              </div>
              <p className="text-[10px] font-bold text-slate-600 tracking-wider">
                REPRESENTING <span className="text-slate-900 uppercase font-extrabold">{displayClub}</span>
              </p>
            </div>

            {/* Division Detail */}
            <div className="text-center space-y-1.5 z-10 px-8">
              <p className="text-[10px] text-slate-500 italic font-serif">
                for demonstrating exceptional athletic skill and high sportsmanship in the weight class of
              </p>
              <p className="text-xs bg-slate-100 text-slate-900 font-black px-4 py-1.5 rounded-lg border border-slate-200 uppercase tracking-wider inline-block">
                🥋 {displayDivision}
              </p>
            </div>

            {/* Bottom Section: Location, Signatures, and Gold Ribbon Seal */}
            <div className="grid grid-cols-3 items-end gap-2 pb-2 z-10 text-center">
              
              {/* Left Signatory */}
              <div className="flex flex-col items-center justify-end px-2">
                <div className="w-full border-t border-slate-300 pt-1">
                  <p className="text-[9px] font-extrabold text-slate-800 uppercase tracking-wider">
                    {signatory1}
                  </p>
                  <p className="text-[7px] text-slate-400 font-semibold tracking-normal mt-0.5">
                    Official Committee Signature
                  </p>
                </div>
              </div>

              {/* Center Seal / Rosette ribbon */}
              <div className="flex flex-col items-center justify-center relative -bottom-2">
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
              </div>

              {/* Right Signatory */}
              <div className="flex flex-col items-center justify-end px-2">
                <div className="w-full border-t border-slate-300 pt-1">
                  <p className="text-[9px] font-extrabold text-slate-800 uppercase tracking-wider">
                    {signatory2}
                  </p>
                  <p className="text-[7px] text-slate-400 font-semibold tracking-normal mt-0.5">
                    Referee Committee Signature
                  </p>
                </div>
              </div>

            </div>

            {/* Location & Date Footer footer block */}
            <div className="flex justify-between items-center text-[8px] font-bold text-slate-400 border-t border-slate-100 pt-2 px-1 z-10">
              <span className="flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                <span>DATE: {dateStr}</span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5 text-slate-400" />
                <span>VENUE: {location}</span>
              </span>
            </div>

          </div>
        </div>

      </div>

      {/* Floating back to app button when full-screen browser printing is NOT active (for convenience) */}
      <div className="mt-4 flex gap-3 no-print-element">
        <button
          onClick={handlePrint}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
        >
          <Printer className="w-4 h-4" />
          <span>Print Certificate Now</span>
        </button>
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl font-bold transition-all border border-slate-700 cursor-pointer active:scale-95"
        >
          <span>Close Preview</span>
        </button>
      </div>

    </div>
  );
};
