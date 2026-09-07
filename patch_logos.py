import re

with open('src/components/BracketCanvas.tsx', 'r') as f:
    content = f.read()

# 1. Update handleLogoUpload
old_handle = """    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (side === 'left' && onChangeLeftLogo) onChangeLeftLogo(base64);
      if (side === 'right' && onChangeRightLogo) onChangeRightLogo(base64);
    };"""

new_handle = """    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (side === 'left' && onChangeLeftLogo) onChangeLeftLogo(base64);
      if (side === 'left2' && onChangeLeftLogo2) onChangeLeftLogo2(base64);
      if (side === 'right' && onChangeRightLogo) onChangeRightLogo(base64);
      if (side === 'right2' && onChangeRightLogo2) onChangeRightLogo2(base64);
    };"""

if old_handle in content:
    content = content.replace(old_handle, new_handle)
else:
    print("Failed to find old_handle")

# 2. Update the Right Logo section in JSX
old_right_logo = """          {/* Right Logo */}
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
          </div>"""

new_right_logo = """          {/* Right Logos */}
          <div className="flex flex-shrink-0 gap-2 flex-row-reverse">
            <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center relative group">
              {rightLogo ? (
                <>
                  <img src={rightLogo} alt="Right Logo 1" className="max-w-full max-h-full object-contain" />
                  {!isPublicView && (
                    <button onClick={() => onChangeRightLogo && onChangeRightLogo('')} className="absolute -top-2 -left-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
                      ✕
                    </button>
                  )}
                </>
              ) : !isPublicView ? (
                <label className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors no-print">
                  <span className="text-[9px] text-slate-400 font-bold text-center px-1">Logo 3</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'right')} />
                </label>
              ) : null}
            </div>
            {(rightLogo || !isPublicView) && (
              <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center relative group">
                {rightLogo2 ? (
                  <>
                    <img src={rightLogo2} alt="Right Logo 2" className="max-w-full max-h-full object-contain" />
                    {!isPublicView && (
                      <button onClick={() => onChangeRightLogo2 && onChangeRightLogo2('')} className="absolute -top-2 -left-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
                        ✕
                      </button>
                    )}
                  </>
                ) : !isPublicView ? (
                  <label className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors no-print">
                    <span className="text-[9px] text-slate-400 font-bold text-center px-1">Logo 4</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'right2')} />
                  </label>
                ) : null}
              </div>
            )}
          </div>"""

if old_right_logo in content:
    content = content.replace(old_right_logo, new_right_logo)
else:
    print("Failed to find old_right_logo")

with open('src/components/BracketCanvas.tsx', 'w') as f:
    f.write(content)
