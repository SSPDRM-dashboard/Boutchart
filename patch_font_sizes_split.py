import re

with open('src/components/BracketCanvas.tsx', 'r') as f:
    content = f.read()

# 1. State changes
state_old = "const [fontOffset, setFontOffset] = useState(0);"
state_new = "const [nameFontOffset, setNameFontOffset] = useState(0);\n  const [clubFontOffset, setClubFontOffset] = useState(0);"
content = content.replace(state_old, state_new)

# 2. UI controls
toolbar_old = """              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
                <button
                  onClick={() => setFontOffset(f => f - 1)}
                  className="p-1 px-1.5 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer font-bold text-xs"
                  title="Decrease Text Size"
                >
                  A-
                </button>
                <div className="text-[10px] font-bold text-slate-500 w-4 text-center">{fontOffset > 0 ? `+${fontOffset}` : fontOffset}</div>
                <button
                  onClick={() => setFontOffset(f => f + 1)}
                  className="p-1 px-1.5 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer font-bold text-xs"
                  title="Increase Text Size"
                >
                  A+
                </button>
              </div>"""

toolbar_new = """              <div className="flex items-center gap-2 bg-slate-100 p-1 px-2 rounded-xl border border-slate-200 mr-2">
                <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
                  <span className="text-[9px] font-black uppercase text-slate-400 mr-1">Name</span>
                  <button onClick={() => setNameFontOffset(f => f - 1)} className="p-0.5 px-1 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer font-bold text-xs" title="Decrease Name Size">A-</button>
                  <div className="text-[10px] font-bold text-slate-500 w-4 text-center">{nameFontOffset > 0 ? `+${nameFontOffset}` : nameFontOffset}</div>
                  <button onClick={() => setNameFontOffset(f => f + 1)} className="p-0.5 px-1 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer font-bold text-xs" title="Increase Name Size">A+</button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-black uppercase text-slate-400 mr-1">Club</span>
                  <button onClick={() => setClubFontOffset(f => f - 1)} className="p-0.5 px-1 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer font-bold text-xs" title="Decrease Club Size">A-</button>
                  <div className="text-[10px] font-bold text-slate-500 w-4 text-center">{clubFontOffset > 0 ? `+${clubFontOffset}` : clubFontOffset}</div>
                  <button onClick={() => setClubFontOffset(f => f + 1)} className="p-0.5 px-1 hover:bg-white text-slate-600 rounded bg-transparent transition-all cursor-pointer font-bold text-xs" title="Increase Club Size">A+</button>
                </div>
              </div>"""
content = content.replace(toolbar_old, toolbar_new)

# 3. CSS variables
css_old = """        #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} {
          --classic-name-size: calc(${size === 2 ? 22.5 : 22.5}px + ${fontOffset}px);
          --classic-club-size: calc(${size === 2 ? 19.5 : 19.5}px + ${fontOffset}px);
        }
        @media print {
          #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} {
            --classic-name-size: calc(${size === 2 ? 29.5 : 32.5}px + ${fontOffset}px);
            --classic-club-size: calc(${size === 2 ? 27.5 : 29.5}px + ${fontOffset}px);
          }"""

css_new = """        #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} {
          --classic-name-size: calc(${size === 2 ? 22.5 : 22.5}px + ${nameFontOffset}px);
          --classic-club-size: calc(${size === 2 ? 19.5 : 19.5}px + ${clubFontOffset}px);
        }
        @media print {
          #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} {
            --classic-name-size: calc(${size === 2 ? 29.5 : 32.5}px + ${nameFontOffset}px);
            --classic-club-size: calc(${size === 2 ? 27.5 : 29.5}px + ${clubFontOffset}px);
          }"""
content = content.replace(css_old, css_new)

# 4. Inline styles substitutions
content = content.replace("calc(11px + ${fontOffset}px)", "calc(11px + ${nameFontOffset}px)")
content = content.replace("calc(9px + ${fontOffset}px)", "calc(9px + ${clubFontOffset}px)")
content = content.replace("calc(24.5px + ${fontOffset}px)", "calc(24.5px + ${nameFontOffset}px)")


with open('src/components/BracketCanvas.tsx', 'w') as f:
    f.write(content)

