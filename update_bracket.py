import re

with open('src/components/BracketCanvas.tsx', 'r') as f:
    content = f.read()

# Add props to interface
content = content.replace(
    "tournamentName?: string;",
    "tournamentName?: string;\n  leftLogo?: string;\n  rightLogo?: string;\n  onChangeLeftLogo?: (logo: string) => void;\n  onChangeRightLogo?: (logo: string) => void;"
)

# Add props to component definition
content = content.replace(
    "  tournamentName,\n",
    "  tournamentName,\n  leftLogo,\n  rightLogo,\n  onChangeLeftLogo,\n  onChangeRightLogo,\n"
)

# Add helper for base64 conversion
content = content.replace(
    "export const BracketCanvas: React.FC<BracketCanvasProps> = ({",
    """export const BracketCanvas: React.FC<BracketCanvasProps> = ({"""
)

helper_code = """
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (side === 'left' && onChangeLeftLogo) onChangeLeftLogo(base64);
      if (side === 'right' && onChangeRightLogo) onChangeRightLogo(base64);
    };
    reader.readAsDataURL(file);
  };
"""

# Find the start of the component to insert the helper
comp_start = content.find("export const BracketCanvas: React.FC<BracketCanvasProps> = ({")
comp_body_start = content.find("{", comp_start) + 1
comp_body_end = content.find("const { size, numRounds, nodes, categoryKey } = bracket;", comp_body_start)
content = content[:comp_body_end] + helper_code + "\n  " + content[comp_body_end:]

# Replace the header rendering
header_html_old = """
        <h1 className="text-[26px] md:text-[30px] font-black text-slate-900 tracking-tight uppercase">
          {tournamentName || 'TOURNAMENT CHAMPIONSHIP'}
        </h1>
        <p className="text-[22px] md:text-[24px] font-black text-slate-800 tracking-widest uppercase mt-1">
          RING {ring}
        </p>
        <p className="text-[24px] md:text-[26px] font-extrabold text-amber-600 tracking-normal mt-1.5 uppercase">
          {categoryKey}
        </p>
        <p className="text-xs text-slate-500 font-bold mt-1">
          {entrantCount} competitors
        </p>
"""

header_html_new = """
        <div className="flex items-center justify-between w-full max-w-4xl mx-auto px-4">
          {/* Left Logo */}
          <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center relative group">
            {leftLogo ? (
              <>
                <img src={leftLogo} alt="Left Logo" className="max-w-full max-h-full object-contain" />
                {!isPublicView && (
                  <button onClick={() => onChangeLeftLogo && onChangeLeftLogo('')} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
                    ✕
                  </button>
                )}
              </>
            ) : !isPublicView ? (
              <label className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors no-print">
                <span className="text-[10px] text-slate-400 font-bold text-center px-2">Add Logo<br/>(Left)</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'left')} />
              </label>
            ) : null}
          </div>
          
          {/* Center Text */}
          <div className="flex-1 text-center px-4">
            <h1 className="text-[26px] md:text-[30px] font-black text-slate-900 tracking-tight uppercase">
              {tournamentName || 'TOURNAMENT CHAMPIONSHIP'}
            </h1>
            <p className="text-[22px] md:text-[24px] font-black text-slate-800 tracking-widest uppercase mt-1">
              RING {ring}
            </p>
            <p className="text-[24px] md:text-[26px] font-extrabold text-amber-600 tracking-normal mt-1.5 uppercase">
              {categoryKey}
            </p>
            <p className="text-xs text-slate-500 font-bold mt-1">
              {entrantCount} competitors
            </p>
          </div>

          {/* Right Logo */}
          <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center relative group">
            {rightLogo ? (
              <>
                <img src={rightLogo} alt="Right Logo" className="max-w-full max-h-full object-contain" />
                {!isPublicView && (
                  <button onClick={() => onChangeRightLogo && onChangeRightLogo('')} className="absolute -top-2 -left-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
                    ✕
                  </button>
                )}
              </>
            ) : !isPublicView ? (
              <label className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors no-print">
                <span className="text-[10px] text-slate-400 font-bold text-center px-2">Add Logo<br/>(Right)</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'right')} />
              </label>
            ) : null}
          </div>
        </div>
"""

content = content.replace(header_html_old, header_html_new)

with open('src/components/BracketCanvas.tsx', 'w') as f:
    f.write(content)

