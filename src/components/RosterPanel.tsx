import React, { useState, useRef, DragEvent } from 'react';
import { Upload, FileSpreadsheet, ClipboardType, Import, Sparkles, HelpCircle } from 'lucide-react';
import { Athlete } from '../types';

interface RosterPanelProps {
  onLoadRoster: (text: string, source: string) => void;
  onUseSample: () => void;
  statusMessage: { text: string; type: 'ok' | 'err' | 'idle' };
  totalAthletes: number;
}

export const RosterPanel: React.FC<RosterPanelProps> = ({
  onLoadRoster,
  onUseSample,
  statusMessage,
  totalAthletes,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      readAndLoadFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      readAndLoadFile(e.target.files[0]);
    }
  };

  const readAndLoadFile = (file: File) => {
    setSelectedFileName(file.name);
    setPasteText('');
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && typeof event.target.result === 'string') {
        onLoadRoster(event.target.result, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = () => {
    if (pasteText.trim()) {
      onLoadRoster(pasteText, 'pasted data');
    } else if (fileInputRef.current?.files && fileInputRef.current.files[0]) {
      readAndLoadFile(fileInputRef.current.files[0]);
    } else {
      onLoadRoster('', 'none');
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 mb-6 shadow-sm no-print">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500 text-slate-950 text-xs font-extrabold font-mono">
              1
            </span>
            Bring in your roster
          </h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
            Supported columns: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono text-xs font-semibold">Name</code>, <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono text-xs font-semibold">Club</code>, <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono text-xs font-semibold">Category</code> (order doesn't matter). Header row is detected automatically. Drag in a spreadsheet save, or paste copied cells directly.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
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
              : 'border-slate-300 hover:border-amber-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,text/csv"
            className="hidden"
          />
          <Upload className={`w-8 h-8 ${dragActive ? 'text-amber-500' : 'text-slate-400'} mb-2`} />
          <p className="text-sm font-semibold text-slate-800">
            {selectedFileName ? (
              <span className="text-amber-600 font-mono">{selectedFileName}</span>
            ) : (
              'Drag & drop CSV file or click to browse'
            )}
          </p>
          <p className="text-xs text-slate-400 mt-1">Spreadsheet exported Comma-Separated Values (.csv)</p>
        </div>

        {/* Text Copy-Paste Area */}
        <div className="flex flex-col">
          <label htmlFor="pasteArea" className="sr-only">Paste tournament roster data</label>
          <div className="relative flex-1">
            <textarea
              id="pasteArea"
              className="w-full h-full min-h-[140px] bg-slate-50/55 border border-slate-200 focus:border-amber-500 text-slate-800 placeholder-slate-400 rounded-xl p-3.5 text-xs font-mono transition-all outline-none focus:bg-white resize-vertical"
              placeholder={'John Tan\tEagle Judo Club\tU60\nAli Hassan\tTiger Gym\tU60\nSarah Connor\tIron Academy\tU66'}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                if (e.target.value.trim()) {
                  setSelectedFileName(null);
                }
              }}
            />
            <div className="absolute bottom-2.5 right-2.5 bg-slate-200/60 text-slate-500 p-1 rounded text-[10px] pointer-events-none font-sans font-medium flex items-center gap-1">
              <ClipboardType className="w-3 h-3" />
              <span>Paste Excel / sheets columns here</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
          >
            <Import className="w-4 h-4" />
            <span>Load Roster</span>
          </button>
          
          <button
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
