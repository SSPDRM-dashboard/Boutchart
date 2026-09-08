import re

with open('src/components/ClubReportPanel.tsx', 'r') as f:
    content = f.read()

target = """                    <button
                      type="button"
                      onClick={() => setReportStyle('medal-standings')}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        reportStyle === 'medal-standings'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                      }`}
                    >
                      <Award className="w-3.5 h-3.5 text-amber-500" />
                      <span>🏆 Club Medal Standings &amp; Points</span>
                    </button>"""

replacement = target + """
                    
                    <button
                      type="button"
                      onClick={() => setReportStyle('boutchart')}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        reportStyle === 'boutchart'
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-650 hover:bg-slate-300/40 hover:text-slate-900'
                      }`}
                    >
                      <AlignJustify className="w-3.5 h-3.5 text-amber-500" />
                      <span>Boutchart</span>
                    </button>"""

if target in content:
    content = content.replace(target, replacement)
else:
    print("Failed to find target in ClubReportPanel.tsx")

with open('src/components/ClubReportPanel.tsx', 'w') as f:
    f.write(content)
