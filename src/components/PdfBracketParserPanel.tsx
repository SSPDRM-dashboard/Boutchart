import React, { useState, useRef, DragEvent } from 'react';
import { Upload, FileText, AlertCircle, Sparkles, Check, CheckCircle, ChevronDown, ChevronRight, HelpCircle, ShieldAlert } from 'lucide-react';

interface Competitor {
  name: string;
  club: string;
}

interface Bout {
  athlete1: string;
  athlete2: string;
  boutNumber: number;
}

interface ParsedDivision {
  categoryName: string;
  competitors: Competitor[];
  bouts?: Bout[];
  checked: boolean;
  selectedRing: number;
}

interface PdfBracketParserPanelProps {
  ringCount: number;
  ringLabelFormat: 'number' | 'letter';
  hasExistingRoster: boolean;
  onImport: (
    divisions: Array<{ categoryName: string; competitors: Competitor[]; bouts?: Bout[] }>,
    ringAllocations: Record<string, number>,
    shouldReplace: boolean
  ) => void;
  onShowMessage: (msg: { text: string; type: 'ok' | 'err' }) => void;
}

export function PdfBracketParserPanel({
  ringCount,
  ringLabelFormat,
  hasExistingRoster,
  onImport,
  onShowMessage
}: PdfBracketParserPanelProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedDivisions, setParsedDivisions] = useState<ParsedDivision[] | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [expandedDivs, setExpandedDivs] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getRingLabel = (ringNum: number) => {
    if (ringLabelFormat === 'letter') {
      return `Ring ${String.fromCharCode(64 + ringNum)}`;
    }
    return `Ring ${ringNum}`;
  };

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
      const fileType = e.dataTransfer.files[0].type;
      if (fileType === 'application/pdf') {
        const droppedFile = e.dataTransfer.files[0];
        setFile(droppedFile);
        parsePdfFile(droppedFile);
      } else {
        onShowMessage({ text: 'Only PDF bracket or roster documents are accepted.', type: 'err' });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      parsePdfFile(selectedFile);
    }
  };

  const parsePdfFile = async (pdfFile: File) => {
    setIsParsing(true);
    setParsedDivisions(null);
    try {
      // 1. Convert file to Base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(pdfFile);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });

      // 2. Transmit base64 string to the server-side API proxying Gemini
      const response = await fetch('/api/parse-pdf-bracket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      if (!data.divisions || !Array.isArray(data.divisions)) {
        throw new Error('PDF output parsed successfully but could not find bracket groupings.');
      }

      // Initialize structures
      const formatted: ParsedDivision[] = data.divisions.map((div: any, idx: number) => ({
        categoryName: div.categoryName || `Extracted Div ${idx + 1}`,
        competitors: div.competitors || [],
        bouts: div.bouts || [],
        checked: true,
        // Distribute default rings sequentially round robin based on available ring count
        selectedRing: (idx % ringCount) + 1
      }));

      setParsedDivisions(formatted);
      onShowMessage({ text: `Analyzed PDF! Successfully identified ${formatted.length} weight division brackets.`, type: 'ok' });
    } catch (err: any) {
      console.error(err);
      onShowMessage({ text: err.message || 'Underlying AI model was unable to parse PDF sheets. Verify file is uncorrupted.', type: 'err' });
    } finally {
      setIsParsing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleUpdateDivName = (index: number, newName: string) => {
    if (!parsedDivisions) return;
    const next = [...parsedDivisions];
    next[index].categoryName = newName;
    setParsedDivisions(next);
  };

  const handleToggleDivCheck = (index: number) => {
    if (!parsedDivisions) return;
    const next = [...parsedDivisions];
    next[index].checked = !next[index].checked;
    setParsedDivisions(next);
  };

  const handleUpdateDivRing = (index: number, ringVal: number) => {
    if (!parsedDivisions) return;
    const next = [...parsedDivisions];
    next[index].selectedRing = ringVal;
    setParsedDivisions(next);
  };

  const toggleExpandDiv = (name: string) => {
    setExpandedDivs(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const executeFinalImport = () => {
    if (!parsedDivisions) return;
    const selectedDivisions = parsedDivisions.filter(d => d.checked && d.competitors.length > 0);
    if (selectedDivisions.length === 0) {
      onShowMessage({ text: 'Please select at least one division with competitors to import.', type: 'err' });
      return;
    }

    const ringAllocations: Record<string, number> = {};
    const importPayload = selectedDivisions.map(d => {
      ringAllocations[d.categoryName.trim()] = d.selectedRing;
      return {
        categoryName: d.categoryName.trim(),
        competitors: d.competitors,
        bouts: d.bouts
      };
    });

    onImport(importPayload, ringAllocations, importMode === 'replace');
    
    // Reset state
    setFile(null);
    setParsedDivisions(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Introduction Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="inline-flex bg-amber-500/10 p-3 rounded-full border border-amber-500/20 text-amber-500 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">AI Bracket &amp; Roster PDF Copiler</h3>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              Have brackets in external tournament sheets (Smoothcomp, Sportdata, or photocopied sheets)? 
              Upload the PDF bracket here. Gemini AI will automatically extract divisions and competitors, and 
              draw their bracket templates directly into your ring allocation list.
            </p>
          </div>
        </div>
      </div>

      {/* Main File Browser upload region */}
      {!parsedDivisions && !isParsing && (
        <div
          id="fileUploaderContainer"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`bg-white border-2 border-dashed rounded-3xl p-12 text-center shadow-xs transition-all cursor-pointer flex flex-col items-center justify-center min-h-[320px] ${
            dragActive 
              ? 'border-amber-500 bg-amber-50/20' 
              : 'border-slate-300 hover:border-amber-500 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="application/pdf"
            onChange={handleFileChange}
          />
          <div className="p-5 bg-white border border-slate-200/60 rounded-2xl shadow-sm text-slate-400 mb-4 inline-flex">
            <Upload className="w-10 h-10 text-amber-500" />
          </div>
          <h4 className="text-base font-extrabold text-slate-800">
            {file ? file.name : 'Choose or Drag a Bracket PDF file here'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed">
            Accepts any PDF tournament sheets. Gemini extracts participants, structures divisions, 
            and prepares standard brackets ready to assign to Rings.
          </p>
          <button
            type="button"
            className="mt-6 px-6 py-2.5 bg-slate-900 border border-slate-800 text-white rounded-xl text-xs font-black shadow transition-transform active:scale-95 cursor-pointer"
          >
            Select PDF File
          </button>
        </div>
      )}

      {/* Parsing Loader state */}
      {isParsing && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center space-y-6 shadow-sm flex flex-col items-center justify-center min-h-[320px]">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin"></div>
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-lg">📄</span>
          </div>
          <div className="space-y-2 max-w-sm">
            <h4 className="text-base font-black text-slate-800">Gemini AI is parsing your PDF bracket...</h4>
            <p className="text-xs text-slate-550 leading-relaxed font-medium">
              We are scanning competitors, identifying brackets, filtering bye lanes, and organizing weight classes. 
              This typically takes 5-15 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Spreadsheet & Review Stage */}
      {parsedDivisions && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
            <div>
              <h4 className="text-lg font-black text-slate-800 tracking-tight">Review Bracket Allocations</h4>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Found <span className="text-emerald-600 font-extrabold">{parsedDivisions.length} divisions</span> in the PDF document. Configure division properties below.
              </p>
            </div>
            
            {/* Import options */}
            {hasExistingRoster && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/50 p-1.5 rounded-xl text-xs font-bold text-slate-600 shrink-0">
                <button
                  type="button"
                  onClick={() => setImportMode('append')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    importMode === 'append' ? 'bg-white shadow text-slate-900 font-extrabold' : 'hover:bg-slate-200/40'
                  }`}
                >
                  Append to Roster
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('replace')}
                  className={`px-3 py-1.5 rounded-lg text-rose-500 transition-all ${
                    importMode === 'replace' ? 'bg-rose-50 text-rose-600 shadow font-extrabold' : 'hover:bg-rose-50/50'
                  }`}
                >
                  Overwrite Roster
                </button>
              </div>
            )}
          </div>

          {/* Table list of bracket categories */}
          <div className="overflow-hidden border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black tracking-widest text-slate-400 uppercase font-mono border-b border-slate-200">
                  <th className="py-3 px-4 w-12 text-center">Import</th>
                  <th className="py-3 px-4">Division Name / Classification</th>
                  <th className="py-3 px-4 w-40">Competitors</th>
                  <th className="py-3 px-4 w-48">Allocated Ring</th>
                  <th className="py-3 px-4 w-16">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {parsedDivisions.map((div, index) => (
                  <React.Fragment key={index}>
                    <tr className="hover:bg-slate-50 animate-in fade-in duration-150">
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={div.checked}
                          onChange={() => handleToggleDivCheck(index)}
                          className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 accent-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-4">
                        <input
                          type="text"
                          value={div.categoryName}
                          onChange={(e) => handleUpdateDivName(index, e.target.value)}
                          className="w-full bg-transparent font-extrabold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 px-2.5 py-1.5 rounded-lg border border-transparent focus:border-amber-500 hover:border-slate-200 outline-none"
                        />
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex gap-1.5 items-center font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs text-mono">
                          🧑‍🤝‍🧑 {div.competitors.length} Fighters
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <select
                          value={div.selectedRing}
                          onChange={(e) => handleUpdateDivRing(index, parseInt(e.target.value, 10))}
                          className="bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none w-full"
                        >
                          {Array.from({ length: ringCount }).map((_, rIdx) => (
                            <option key={rIdx + 1} value={rIdx + 1}>
                              {getRingLabel(rIdx + 1)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpandDiv(div.categoryName)}
                          className="p-1 px-2.5 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                        >
                          {expandedDivs[div.categoryName] ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedDivs[div.categoryName] && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={5} className="p-4 px-8 border-t border-slate-100">
                          <div className="bg-white border rounded-xl overflow-hidden shadow-xs">
                            <h5 className="bg-slate-50 px-4 py-2 border-b text-[10px] font-black uppercase text-slate-400 font-mono tracking-wider">
                              Competitors Listing
                            </h5>
                            <div className="divide-y divide-slate-100 max-h-[180px] overflow-y-auto">
                              {div.competitors.length === 0 ? (
                                <p className="p-3 text-slate-400 text-center text-xs">No contestants in this category.</p>
                              ) : (
                                div.competitors.map((comp, cIdx) => (
                                  <div key={cIdx} className="p-3 px-4 flex justify-between text-xs font-semibold">
                                    <span className="text-slate-800 font-extrabold">{comp.name}</span>
                                    <span className="text-slate-400 uppercase tracking-wide">{comp.club || 'Unattached'}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center bg-slate-50 p-4 border border-slate-100 rounded-2xl">
            <div className="flex items-center gap-2.5 text-xs text-slate-500 font-bold">
              <span className="bg-amber-500 text-white rounded-full p-1 leading-none text-[8px] font-extrabold">AI</span>
              <span>All brackets will be calculated to standard bracket draws immediately upon import confirmation!</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setParsedDivisions(null)}
                className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold transition-all"
              >
                Reset Upload
              </button>
              <button
                type="button"
                onClick={executeFinalImport}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-black shadow transition-all flex items-center gap-1.5"
              >
                Assemble &amp; Place to Ring Allocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
