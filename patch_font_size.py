import re

with open('src/components/BracketCanvas.tsx', 'r') as f:
    content = f.read()

# 1. Add state for fontOffset
state_old = "  const [swapTargetIndex, setSwapTargetIndex] = useState<string>('');"
state_new = "  const [swapTargetIndex, setSwapTargetIndex] = useState<string>('');\n  const [fontOffset, setFontOffset] = useState(0);"
content = content.replace(state_old, state_new)

# 2. Add controls to toolbar
toolbar_old = """              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
                <button
                  onClick={() => handleZoom(0.85)}"""
toolbar_new = """              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
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
              </div>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
                <button
                  onClick={() => handleZoom(0.85)}"""
content = content.replace(toolbar_old, toolbar_new)

# 3. Add to <style> block
style_old = """      <style>{`
        @media print {"""
style_new = """      <style>{`
        #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} {
          --classic-name-size: calc(${size === 2 ? 22.5 : 22.5}px + ${fontOffset}px);
          --classic-club-size: calc(${size === 2 ? 19.5 : 19.5}px + ${fontOffset}px);
        }
        @media print {
          #page-${(categoryKey || '').replace(/[^a-zA-Z0-9]/g, '_')} {
            --classic-name-size: calc(${size === 2 ? 29.5 : 32.5}px + ${fontOffset}px);
            --classic-club-size: calc(${size === 2 ? 27.5 : 29.5}px + ${fontOffset}px);
          }"""
content = content.replace(style_old, style_new)

# 4. Replace hardcoded sizes in Classic Leaf rendering
# Name
classic_name_leaf_old = "${size === 2 ? 'text-[19.5px] print:text-[29.5px]' : 'text-[22.5px] print:text-[32.5px]'} font-black tracking-tight text-slate-900 uppercase whitespace-nowrap pointer-events-auto"
classic_name_leaf_new = "font-black tracking-tight text-slate-900 uppercase whitespace-nowrap pointer-events-auto"
content = content.replace(classic_name_leaf_old, classic_name_leaf_new)

classic_name_leaf_tag_old = "title={node.name}>{node.name}</span>"
classic_name_leaf_tag_new = "title={node.name} style={{ fontSize: 'var(--classic-name-size)' }}>{node.name}</span>"
content = content.replace(classic_name_leaf_tag_old, classic_name_leaf_tag_new)

# Club
classic_club_leaf_old = "${size === 2 ? 'text-[17.5px] print:text-[27.5px]' : 'text-[19.5px] print:text-[29.5px]'} font-extrabold text-slate-500 uppercase tracking-wide"
classic_club_leaf_new = "font-extrabold text-slate-500 uppercase tracking-wide"
content = content.replace(classic_club_leaf_old, classic_club_leaf_new)

classic_club_span_old = "<span className=\"competitor-club whitespace-nowrap pointer-events-auto\">{node.club || '(Ind.)'}</span>"
classic_club_span_new = "<span className=\"competitor-club whitespace-nowrap pointer-events-auto\" style={{ fontSize: 'var(--classic-club-size)' }}>{node.club || '(Ind.)'}</span>"
content = content.replace(classic_club_span_old, classic_club_span_new)

# 5. Replace hardcoded sizes in Classic Input rendering
classic_name_input_old = "${size === 2 ? 'text-[19.5px] print:text-[29.5px]' : 'text-[22.5px] print:text-[32.5px]'} font-black text-slate-900 placeholder-slate-350 uppercase tracking-tight pointer-events-auto"
classic_name_input_new = "font-black text-slate-900 placeholder-slate-350 uppercase tracking-tight pointer-events-auto"
content = content.replace(classic_name_input_old, classic_name_input_new)

classic_name_input_tag_old = "placeholder=\"\"\n                                value={node.name || ''}"
classic_name_input_tag_new = "placeholder=\"\"\n                                style={{ fontSize: 'var(--classic-name-size)' }}\n                                value={node.name || ''}"
content = content.replace(classic_name_input_tag_old, classic_name_input_tag_new)

classic_club_input_old = "<span className=\"competitor-club whitespace-nowrap pointer-events-auto\">{node.club || ''}</span>"
classic_club_input_new = "<span className=\"competitor-club whitespace-nowrap pointer-events-auto\" style={{ fontSize: 'var(--classic-club-size)' }}>{node.club || ''}</span>"
content = content.replace(classic_club_input_old, classic_club_input_new)


# 6. Modern layout text sizing
modern_name_leaf_old = "<p className=\"text-[11px] font-black text-slate-800 uppercase mt-0.5\" title={node.name}>"
modern_name_leaf_new = "<p className=\"font-black text-slate-800 uppercase mt-0.5\" style={{ fontSize: `calc(11px + ${fontOffset}px)` }} title={node.name}>"
content = content.replace(modern_name_leaf_old, modern_name_leaf_new)

modern_club_leaf_old = "<p className=\"competitor-club text-[9px] text-slate-400 tracking-wide font-medium\">"
modern_club_leaf_new = "<p className=\"competitor-club text-slate-400 tracking-wide font-medium\" style={{ fontSize: `calc(9px + ${fontOffset}px)` }}>"
content = content.replace(modern_club_leaf_old, modern_club_leaf_new)

modern_name_input_old = "className={`w-full bg-transparent border-none outline-none text-[11px] font-black text-slate-800 placeholder-slate-300 tracking-tight uppercase mt-0.5 ${"
modern_name_input_new = "style={{ fontSize: `calc(11px + ${fontOffset}px)` }}\n                          className={`w-full bg-transparent border-none outline-none font-black text-slate-800 placeholder-slate-300 tracking-tight uppercase mt-0.5 ${"
content = content.replace(modern_name_input_old, modern_name_input_new)

# Champion classic node
champ_classic_old = "className=\"w-[260px] max-w-none bg-transparent pb-1 outline-none text-[24.5px] font-black text-slate-800 placeholder-slate-300 uppercase tracking-tight text-center\""
champ_classic_new = "className=\"w-[260px] max-w-none bg-transparent pb-1 outline-none font-black text-slate-800 placeholder-slate-300 uppercase tracking-tight text-center\"\n                               style={{ fontSize: `calc(24.5px + ${fontOffset}px)` }}"
content = content.replace(champ_classic_old, champ_classic_new)


with open('src/components/BracketCanvas.tsx', 'w') as f:
    f.write(content)
