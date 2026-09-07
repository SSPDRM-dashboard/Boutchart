import React, { useState, useRef, DragEvent, useEffect } from 'react';
import { 
  Upload, FileSpreadsheet, ClipboardType, Import, Sparkles, ChevronDown, ChevronUp, 
  Download, Info, Table, CheckCircle2, FileText, XCircle, ArrowRight, Settings2, HelpCircle
} from 'lucide-react';
import { Athlete } from '../types';
import { buildRosterFromText, detectDelimiter, parseDelimitedLine, ColumnMappingConfig } from '../utils/bracketUtils';

interface RosterPanelProps {
  onLoadRoster: (text: string, source: string, adminNotes?: string) => void;
  onUseSample: () => void;
  statusMessage: { text: string; type: 'ok' | 'err' | 'idle' };
  totalAthletes: number;
}

interface ColumnExplanation {
  name: string;
  aliases: string[];
  required: 'Required' | 'Recommended' | 'Optional';
  requiredColor: string;
  description: string;
  example: string;
}

const COLUMN_EXPLANATIONS: ColumnExplanation[] = [
  {
    name: 'Participant Name',
    aliases: ['name', 'participant name', 'athlete', 'player', 'competitor', 'full name', 'nama peserta'],
    required: 'Required',
    requiredColor: 'bg-rose-100 text-rose-800 border-rose-200',
    description: 'Full name of competitor. Appears on bracket matches, bout sheets, ring displays, and certificates.',
    example: 'ABIECYRINE LIM / John Tan',
  },
  {
    name: 'Category / Event / Division',
    aliases: ['category', 'division', 'event', 'poomsae', 'sparring', 'kyorugi', 'weight', 'wt', 'acara', 'kategori'],
    required: 'Required',
    requiredColor: 'bg-rose-100 text-rose-800 border-rose-200',
    description: 'Division, age group, or weight class. Brackets are automatically constructed for each distinct category.',
    example: '9-11 yo - Poomsae Amateur Individual Female / -60kg',
  },
  {
    name: 'Club / Dojo / Team',
    aliases: ['club', 'club name', 'team', 'academy', 'gym', 'dojo', 'contingent', 'persatuan', 'kelab'],
    required: 'Recommended',
    requiredColor: 'bg-amber-100 text-amber-900 border-amber-200',
    description: 'Gym, club, or team. Used for Club Medal Tallies and avoiding same-club clashes in round 1.',
    example: 'ELITE TAEKWONDO CLUB / Eagle Judo',
  },
  {
    name: 'School / State',
    aliases: ['school', 'school name', 'state of school', 'institution', 'college', 'sekolah'],
    required: 'Optional',
    requiredColor: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'School affiliation, district (PPD), or state. Displayed on rosters and summary sheets.',
    example: 'SJKC FOON YEW 5 / SMU',
  },
  {
    name: 'Gender / Sex',
    aliases: ['gender', 'sex', 'm/f', 'jantina'],
    required: 'Optional',
    requiredColor: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'Gender of the competitor. Auto-detected from category text (e.g., "Male", "Female") if omitted.',
    example: 'Male / Female',
  },
  {
    name: 'Description / Notes',
    aliases: ['description', 'notes', 'remarks', 'details', 'comment', 'catatan'],
    required: 'Optional',
    requiredColor: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'Seeding info (Seed 1), belt rank, weigh-in notes, or special qualifications.',
    example: 'Seed 1 / Poom/Dan',
  },
];

interface StagedFileInfo {
  fileName: string;
  rawText: string;
  fileSize: number;
  parsedAthletes: Athlete[];
}

export const RosterPanel: React.FC<RosterPanelProps> = ({
  onLoadRoster,
  onUseSample,
  statusMessage,
  totalAthletes,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [showExplanationGuide, setShowExplanationGuide] = useState(false);
  const [showFormatTips, setShowFormatTips] = useState(false);
  const [showCustomMapper, setShowCustomMapper] = useState(false);
  const [stagedFile, setStagedFile] = useState<StagedFileInfo | null>(null);
  const [adminStructureExplanation, setAdminStructureExplanation] = useState('');
  
  // Custom column mapping state
  const [mappingConfig, setMappingConfig] = useState<ColumnMappingConfig>({
    headerRowIndex: 0,
    nameIdx: -1,
    categoryIdx: -1,
    clubIdx: -1,
    schoolIdx: -1,
    genderIdx: -1,
    descriptionIdx: -1,
  });

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [rawLinesSample, setRawLinesSample] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeRawText = stagedFile ? stagedFile.rawText : pasteText;

  // Whenever active text changes, compute raw lines & initialize mapper
  useEffect(() => {
    if (!activeRawText.trim()) {
      setAvailableColumns([]);
      setRawLinesSample([]);
      return;
    }

    const delim = detectDelimiter(activeRawText);
    const lines = activeRawText.split(/\r?\n/).filter(l => l.trim().length > 0);
    setRawLinesSample(lines.slice(0, 10));

    // Try to auto-detect header row
    let bestHeaderLine = 0;
    let maxCols = 0;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const parsed = parseDelimitedLine(lines[i], delim);
      if (parsed.length > maxCols) {
        maxCols = parsed.length;
        bestHeaderLine = i;
      }
    }

    const headerCells = parseDelimitedLine(lines[bestHeaderLine] || lines[0], delim);
    setAvailableColumns(headerCells.map((c, i) => c.trim() ? `${i + 1}. ${c.trim()}` : `Column ${i + 1} (Unnamed)`));

    // Run initial parse to get default staged athletes
    const initialAthletes = buildRosterFromText(activeRawText, adminStructureExplanation);
    if (stagedFile) {
      setStagedFile(prev => prev ? { ...prev, parsedAthletes: initialAthletes } : null);
    }
  }, [activeRawText]);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      stageFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      stageFile(e.target.files[0]);
    }
  };

  // Stage file into memory WITHOUT directly generating brackets
  const stageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && typeof event.target.result === 'string') {
        const text = event.target.result;
        let athletes: Athlete[] = [];
        try {
          athletes = buildRosterFromText(text);
        } catch (err) {
          console.error('Preview parsing error', err);
        }
        setStagedFile({
          fileName: file.name,
          rawText: text,
          fileSize: file.size,
          parsedAthletes: athletes,
        });
        setPasteText('');
      }
    };
    reader.readAsText(file);
  };

  const handleClearStaged = () => {
    setStagedFile(null);
    setShowCustomMapper(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Re-run parser with custom mapping
  const applyCustomMapping = () => {
    if (!activeRawText) return;
    const mapped = buildRosterFromText(activeRawText, adminStructureExplanation, mappingConfig);
    if (stagedFile) {
      setStagedFile(prev => prev ? { ...prev, parsedAthletes: mapped } : null);
    }
  };

  // Explicit action button for Admin to process and upload
  const handleAdminConfirmUpload = () => {
    const textToUpload = stagedFile ? stagedFile.rawText : pasteText.trim();
    if (!textToUpload) {
      onLoadRoster('', 'none');
      return;
    }

    // Pass custom mapped athletes or standard text
    if (showCustomMapper && (mappingConfig.nameIdx !== undefined && mappingConfig.nameIdx !== -1)) {
      const customAthletes = buildRosterFromText(textToUpload, adminStructureExplanation.trim() || undefined, mappingConfig);
      // Re-encode to standard CSV representation
      const standardCsv = [
        'Name,Club,Category,School,Gender,Description',
        ...customAthletes.map(a => 
          `"${a.name.replace(/"/g, '""')}","${(a.club || '').replace(/"/g, '""')}","${(a.weight || 'Unspecified').replace(/"/g, '""')}","${(a.school || '').replace(/"/g, '""')}","${(a.gender || '').replace(/"/g, '""')}","${(a.description || '').replace(/"/g, '""')}"`
        )
      ].join('\n');
      onLoadRoster(standardCsv, stagedFile ? stagedFile.fileName : 'custom mapped roster', adminStructureExplanation.trim() || undefined);
    } else {
      onLoadRoster(textToUpload, stagedFile ? stagedFile.fileName : 'pasted spreadsheet rows', adminStructureExplanation.trim() || undefined);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const csvContent = [
      'Name,Club,Category,School,Gender,Description',
      'John Tan,Eagle Judo Club,-60kg,SMU,Male,Seed 1 / National Contender',
      'Ali bin Hassan,Tiger Gym,-60kg,NUS,Male,State Champion 2025',
      'Lim Wei Jian,Eagle Judo Club,-60kg,NTU,Male,Returning Finalist',
      'Marcus Lee,Star Gym,-66kg,NUS,Male,Seed 1',
      'Sophia Loren,Eagle Judo Club,-52kg,NTU,Female,Seed 1 / Gold Medalist',
      'Emma Watson,Iron Academy,-52kg,SMU,Female,Silver Medalist'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Tournament_Roster_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasDataToUpload = !!stagedFile || pasteText.trim().length > 0;
  const currentParsedList = stagedFile ? stagedFile.parsedAthletes : (pasteText.trim() ? buildRosterFromText(pasteText, adminStructureExplanation, showCustomMapper ? mappingConfig : undefined) : []);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 mb-6 shadow-sm no-print">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500 text-slate-950 text-xs font-extrabold font-mono">
              1
            </span>
            Bring in your roster
          </h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
            Upload your spreadsheet (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono text-xs font-semibold">.csv</code>) or copy-paste rows directly. Non-standard formats (e.g. Master Name Lists with multi-row headers, Taekwondo/Judo divisions, or custom column names) are <strong>automatically detected</strong> and can be mapped below.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start shrink-0">
          <button
            type="button"
            onClick={handleDownloadCsvTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download standard CSV spreadsheet template"
          >
            <Download className="w-3.5 h-3.5 text-amber-600" />
            <span>Standard CSV Template</span>
          </button>

          <button
            type="button"
            onClick={() => setShowFormatTips(!showFormatTips)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-xs active:scale-95 ${
              showFormatTips
                ? 'bg-blue-500 text-white border-blue-600 font-black'
                : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
            }`}
            title="What if my spreadsheet format is different?"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Non-Standard Formats?</span>
            {showFormatTips ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setShowExplanationGuide(!showExplanationGuide)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-xs active:scale-95 ${
              showExplanationGuide
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Column Guide</span>
            {showExplanationGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Non-Standard Format Explanatory Banner (User Query Solution) */}
      {showFormatTips && (
        <div className="my-4 bg-gradient-to-br from-blue-50 to-indigo-50/40 border border-blue-200 rounded-xl p-4 text-xs text-slate-700 space-y-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between pb-2 border-b border-blue-200/80">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-500 text-white rounded-lg font-bold text-xs">💡</span>
              <h3 className="text-xs font-black text-blue-950 uppercase tracking-wide">
                Handling Non-Standard Formats (e.g. Master Name Lists &amp; Championship Excel Files)
              </h3>
            </div>
            <button 
              onClick={() => setShowFormatTips(false)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white/80 border border-blue-100 rounded-lg p-3 space-y-1.5">
              <strong className="text-blue-900 font-bold flex items-center gap-1">
                <span>1.</span> Title Rows at the Top?
              </strong>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                Files with banners like <em>"Wu Kwon Championship 2026 / Date: 22 Aug"</em> are automatically scanned! The parser finds the table header on line 3 or 4 and skips top title text.
              </p>
            </div>

            <div className="bg-white/80 border border-blue-100 rounded-lg p-3 space-y-1.5">
              <strong className="text-blue-900 font-bold flex items-center gap-1">
                <span>2.</span> Custom Column Headers?
              </strong>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                Headers like <code>Participant Name</code>, <code>Club Name</code>, <code>State of School</code>, and long division descriptions (e.g. <em>"9-11 yo Poomsae..."</em>) are mapped automatically.
              </p>
            </div>

            <div className="bg-white/80 border border-blue-100 rounded-lg p-3 space-y-1.5">
              <strong className="text-blue-900 font-bold flex items-center gap-1">
                <span>3.</span> Want 100% Manual Control?
              </strong>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                After selecting your file, click <strong>"⚙️ Customize Column Mapping"</strong> to select exactly which column represents Name, Category, Club, and School with instant preview!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary column badges */}
      <div className="flex flex-wrap items-center gap-1.5 my-3 pb-2 border-b border-slate-100 text-xs">
        <span className="text-slate-400 font-semibold mr-1 flex items-center gap-1">
          <Table className="w-3.5 h-3.5 text-slate-400" /> Supported Columns:
        </span>
        {COLUMN_EXPLANATIONS.map((col) => (
          <span
            key={col.name}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${col.requiredColor}`}
            title={`${col.name} (${col.required}): ${col.description}`}
          >
            {col.name} <span className="opacity-70 text-[9.5px]">({col.required})</span>
          </span>
        ))}
      </div>

      {/* Expandable Detailed Column Explanation Table */}
      {showExplanationGuide && (
        <div className="my-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4 transition-all duration-200 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/10 text-amber-600 rounded-lg">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Roster File Column Definitions &amp; Auto-Matching Rules
              </h3>
            </div>
            <span className="text-[11px] font-medium text-slate-500">
              Auto-maps columns regardless of column order or case
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700 bg-slate-100/70">
                  <th className="py-2.5 px-3 font-bold">Column Field</th>
                  <th className="py-2.5 px-2.5 font-bold">Requirement</th>
                  <th className="py-2.5 px-3 font-bold">Description &amp; System Purpose</th>
                  <th className="py-2.5 px-3 font-bold">Recognized Aliases in Excel/CSV</th>
                  <th className="py-2.5 px-3 font-bold">Example Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 bg-white">
                {COLUMN_EXPLANATIONS.map((col) => (
                  <tr key={col.name} className="hover:bg-amber-50/20 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {col.name}
                    </td>
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${col.requiredColor}`}>
                        {col.required}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 leading-relaxed font-normal min-w-[240px]">
                      {col.description}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {col.aliases.map((alias, idx) => (
                        <span key={alias}>
                          <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-semibold">{alias}</code>
                          {idx < col.aliases.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </td>
                    <td className="py-2.5 px-3 text-amber-700 font-mono text-[11px] whitespace-nowrap font-medium">
                      {col.example}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Primary Upload Inputs: Drag & Drop + Paste */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-3">
        {/* File Drag and Drop */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 select-none min-h-[140px] ${
            dragActive
              ? 'border-amber-500 bg-amber-500/5'
              : stagedFile
              ? 'border-emerald-400 bg-emerald-50/30'
              : 'border-slate-300 hover:border-amber-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,text/csv,.txt"
            className="hidden"
          />
          {stagedFile ? (
            <div className="flex flex-col items-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
              <p className="text-sm font-bold text-slate-900">
                File Staged: <span className="text-emerald-700 font-mono">{stagedFile.fileName}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {(stagedFile.fileSize / 1024).toFixed(1)} KB · {currentParsedList.length} athletes detected
              </p>
              <span className="text-[11px] text-amber-700 font-semibold mt-2 underline">
                Click to replace with a different file
              </span>
            </div>
          ) : (
            <>
              <Upload className={`w-8 h-8 ${dragActive ? 'text-amber-500' : 'text-slate-400'} mb-2`} />
              <p className="text-sm font-semibold text-slate-800">
                Drag &amp; drop CSV / Excel file or click to browse
              </p>
              <p className="text-xs text-slate-400 mt-1">Comma-Separated (.csv) or Tab-Separated (.txt)</p>
            </>
          )}
        </div>

        {/* Text Copy-Paste Area */}
        <div className="flex flex-col">
          <label htmlFor="pasteArea" className="sr-only">Paste tournament roster data</label>
          <div className="relative flex-1">
            <textarea
              id="pasteArea"
              className="w-full h-full min-h-[140px] bg-slate-50/55 border border-slate-200 focus:border-amber-500 text-slate-800 placeholder-slate-400 rounded-xl p-3.5 text-xs font-mono transition-all outline-none focus:bg-white resize-vertical whitespace-pre"
              placeholder={`No.\tClub Name\tParticipant Name\tCategory / Event\tSchool Name\n1\tELITE TAEKWONDO CLUB\tABIECYRINE LIM\t9-11 yo - Poomsae Amateur Female\tSJKC THORBURN\n2\tELITE TAEKWONDO CLUB\tAHUVA TAN EN AI\t12-14 yo - Poomsae Amateur Female\tSJKC FOON YEW 5`}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                if (e.target.value.trim() && stagedFile) {
                  setStagedFile(null);
                }
              }}
            />
            <div className="absolute bottom-2.5 right-2.5 bg-slate-200/60 text-slate-500 p-1 rounded text-[10px] pointer-events-none font-sans font-medium flex items-center gap-1">
              <ClipboardType className="w-3 h-3" />
              <span>Paste Excel table columns here</span>
            </div>
          </div>
        </div>
      </div>

      {/* Staged File / Review & Custom Column Mapper */}
      {hasDataToUpload && (
        <div className="mt-4 p-4 bg-amber-50/50 border border-amber-200/80 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-amber-200/60">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-xs font-black">
                ✓
              </span>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                Staged Roster Ready for Admin Verification &amp; Upload
              </h3>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCustomMapper(!showCustomMapper)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                  showCustomMapper 
                    ? 'bg-amber-600 text-white border-amber-700' 
                    : 'bg-white text-slate-700 hover:text-amber-800 border-slate-200 shadow-xs'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>{showCustomMapper ? 'Hide Column Mapping' : 'Customize Column Mapping'}</span>
              </button>

              {stagedFile && (
                <button
                  type="button"
                  onClick={handleClearStaged}
                  className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Custom Column Mapper Drawer */}
          {showCustomMapper && (
            <div className="p-4 bg-white border border-amber-300/80 rounded-xl space-y-3 text-xs shadow-inner">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-amber-600" />
                  Visual Column Mapping Tool
                </span>
                <span className="text-[11px] text-slate-500">
                  Select which column corresponds to each field
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. Header Row Line Selector */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Table Header Starts On Line:
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500"
                    value={mappingConfig.headerRowIndex ?? 0}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setMappingConfig(prev => ({ ...prev, headerRowIndex: val }));
                    }}
                  >
                    {rawLinesSample.map((line, idx) => (
                      <option key={idx} value={idx}>
                        Line {idx + 1}: {line.slice(0, 45)}...
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Participant Name Column */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    👤 Participant Name Column <span className="text-rose-600">*</span>:
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500"
                    value={mappingConfig.nameIdx ?? -1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setMappingConfig(prev => ({ ...prev, nameIdx: val }));
                    }}
                  >
                    <option value={-1}>Auto-Detect (Smart)</option>
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Category / Division Column */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    🥋 Category / Event / Weight <span className="text-rose-600">*</span>:
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500"
                    value={mappingConfig.categoryIdx ?? -1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setMappingConfig(prev => ({ ...prev, categoryIdx: val }));
                    }}
                  >
                    <option value={-1}>Auto-Detect (Smart)</option>
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>

                {/* 4. Club / Team Column */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    🏢 Club / Academy / Dojo:
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500"
                    value={mappingConfig.clubIdx ?? -1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setMappingConfig(prev => ({ ...prev, clubIdx: val }));
                    }}
                  >
                    <option value={-1}>Auto-Detect (Smart)</option>
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>

                {/* 5. School / State Column */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    🏫 School / State Column:
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500"
                    value={mappingConfig.schoolIdx ?? -1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setMappingConfig(prev => ({ ...prev, schoolIdx: val }));
                    }}
                  >
                    <option value={-1}>Auto-Detect (Smart)</option>
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>

                {/* 6. Description / Notes Column */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    📝 Notes / Description Column:
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-medium outline-none focus:border-amber-500"
                    value={mappingConfig.descriptionIdx ?? -1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setMappingConfig(prev => ({ ...prev, descriptionIdx: val }));
                    }}
                  >
                    <option value={-1}>Auto-Detect (Smart)</option>
                    {availableColumns.map((col, idx) => (
                      <option key={idx} value={idx}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={applyCustomMapping}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-all shadow-xs cursor-pointer"
                >
                  Refresh Preview with Mappings
                </button>
              </div>
            </div>
          )}

          {/* Admin Explanation on File Structure (Required by User) */}
          <div className="space-y-1.5">
            <label htmlFor="adminExplanation" className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              <span>Admin Explanation on File Structure &amp; Tournament Notes:</span>
              <span className="text-[10px] font-normal text-slate-500">(Optional notes or division instructions)</span>
            </label>
            <input
              id="adminExplanation"
              type="text"
              value={adminStructureExplanation}
              onChange={(e) => setAdminStructureExplanation(e.target.value)}
              placeholder="e.g. Wu Kwon Championship 2026 Master Name List: Club in Col 2, Participant in Col 3, Poomsae/Sparring category in Col 4"
              className="w-full bg-white border border-slate-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-800 placeholder-slate-400 rounded-lg px-3 py-2 text-xs font-sans transition-all outline-none"
            />
          </div>

          {/* Quick Preview Table of Detected Rows */}
          {currentParsedList.length > 0 && (
            <div className="bg-white border border-amber-200/80 rounded-lg p-2.5 overflow-x-auto text-[11px]">
              <div className="flex items-center justify-between text-slate-600 font-bold mb-1.5 pb-1 border-b border-slate-100">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Structure Preview ({currentParsedList.length} total athletes mapped)
                </span>
                <span className="text-[10px] font-normal text-slate-400">
                  Showing first {Math.min(4, currentParsedList.length)} rows
                </span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-400 font-semibold border-b border-slate-100">
                    <th className="pb-1 px-1.5">Name</th>
                    <th className="pb-1 px-1.5">Category / Event</th>
                    <th className="pb-1 px-1.5">Club / Team</th>
                    <th className="pb-1 px-1.5">School / State</th>
                    <th className="pb-1 px-1.5">Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {currentParsedList.slice(0, 4).map((ath, idx) => (
                    <tr key={idx} className="font-mono hover:bg-slate-50">
                      <td className="py-1 px-1.5 font-bold text-slate-900 whitespace-nowrap">{ath.name}</td>
                      <td className="py-1 px-1.5 text-amber-700 max-w-[260px] truncate" title={ath.weight}>{ath.weight}</td>
                      <td className="py-1 px-1.5 text-slate-600 whitespace-nowrap">{ath.club || '—'}</td>
                      <td className="py-1 px-1.5 text-slate-500 max-w-[200px] truncate" title={ath.school || ''}>{ath.school || '—'}</td>
                      <td className="py-1 px-1.5 text-slate-600 whitespace-nowrap">{ath.gender || 'Auto'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bottom Action Footer with the Explicit Admin Upload Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          {/* Explicit button for Admin to click to upload the file */}
          <button
            type="button"
            id="adminUploadFileButton"
            onClick={handleAdminConfirmUpload}
            disabled={!hasDataToUpload}
            className={`flex items-center gap-2 px-6 py-2.5 text-xs md:text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer active:scale-95 ${
              hasDataToUpload
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black border border-amber-400 ring-2 ring-amber-400/30'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
            title={hasDataToUpload ? 'Process file and generate interactive tournament brackets' : 'Select a file or paste rows above first'}
          >
            <Import className="w-4 h-4" />
            <span>{stagedFile ? 'Upload File & Generate Brackets' : 'Upload & Process Roster'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          
          <button
            type="button"
            onClick={onUseSample}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Use Demo Data</span>
          </button>
        </div>

        {/* Status Indicator Bar */}
        <div>
          {statusMessage.type === 'ok' && (
            <p className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-800 px-3.5 py-1.5 rounded-lg font-medium shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              {statusMessage.text}
            </p>
          )}
          {statusMessage.type === 'err' && (
            <p className="text-xs bg-rose-50 border border-rose-100 text-rose-800 px-3.5 py-1.5 rounded-lg font-medium shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
              {statusMessage.text}
            </p>
          )}
          {statusMessage.type === 'idle' && totalAthletes > 0 && (
            <p className="text-xs text-slate-500 font-mono">
              Total athletes active: <strong className="text-slate-800">{totalAthletes}</strong>
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
