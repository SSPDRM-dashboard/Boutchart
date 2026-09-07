import re

with open('src/components/BracketCanvas.tsx', 'r') as f:
    content = f.read()

# Update props interface
props_old = """  tournamentName?: string;
  leftLogo?: string;
  rightLogo?: string;
  onChangeLeftLogo?: (logo: string) => void;
  onChangeRightLogo?: (logo: string) => void;"""

props_new = """  tournamentName?: string;
  leftLogo?: string;
  leftLogo2?: string;
  rightLogo?: string;
  rightLogo2?: string;
  onChangeLeftLogo?: (logo: string) => void;
  onChangeLeftLogo2?: (logo: string) => void;
  onChangeRightLogo?: (logo: string) => void;
  onChangeRightLogo2?: (logo: string) => void;"""

content = content.replace(props_old, props_new)


# Update destructuring
destruct_old = """  tournamentName,
  leftLogo,
  rightLogo,
  onChangeLeftLogo,
  onChangeRightLogo,"""

destruct_new = """  tournamentName,
  leftLogo,
  leftLogo2,
  rightLogo,
  rightLogo2,
  onChangeLeftLogo,
  onChangeLeftLogo2,
  onChangeRightLogo,
  onChangeRightLogo2,"""

content = content.replace(destruct_old, destruct_new)


# Update handleLogoUpload signature
upload_old = "const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') => {"
upload_new = "const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right' | 'left2' | 'right2') => {"
content = content.replace(upload_old, upload_new)

# Update handleLogoUpload switch/callbacks
upload_cb_old = """        if (side === 'left' && onChangeLeftLogo) onChangeLeftLogo(base64);
        if (side === 'right' && onChangeRightLogo) onChangeRightLogo(base64);"""

upload_cb_new = """        if (side === 'left' && onChangeLeftLogo) onChangeLeftLogo(base64);
        if (side === 'right' && onChangeRightLogo) onChangeRightLogo(base64);
        if (side === 'left2' && onChangeLeftLogo2) onChangeLeftLogo2(base64);
        if (side === 'right2' && onChangeRightLogo2) onChangeRightLogo2(base64);"""
content = content.replace(upload_cb_old, upload_cb_new)


# Update UI for Left Logos
left_logo_old = """          {/* Left Logo */}
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
          </div>"""

left_logo_new = """          {/* Left Logos */}
          <div className="flex flex-shrink-0 gap-2">
            <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center relative group">
              {leftLogo ? (
                <>
                  <img src={leftLogo} alt="Left Logo 1" className="max-w-full max-h-full object-contain" />
                  {!isPublicView && (
                    <button onClick={() => onChangeLeftLogo && onChangeLeftLogo('')} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
                      ✕
                    </button>
                  )}
                </>
              ) : !isPublicView ? (
                <label className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors no-print">
                  <span className="text-[9px] text-slate-400 font-bold text-center px-1">Logo 1</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'left')} />
                </label>
              ) : null}
            </div>
            {(leftLogo || !isPublicView) && (
              <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center relative group">
                {leftLogo2 ? (
                  <>
                    <img src={leftLogo2} alt="Left Logo 2" className="max-w-full max-h-full object-contain" />
                    {!isPublicView && (
                      <button onClick={() => onChangeLeftLogo2 && onChangeLeftLogo2('')} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
                        ✕
                      </button>
                    )}
                  </>
                ) : !isPublicView ? (
                  <label className="w-full h-full border-2 border-dashed border-slate-200 hover:border-amber-400 rounded-xl flex items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors no-print">
                    <span className="text-[9px] text-slate-400 font-bold text-center px-1">Logo 2</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, 'left2')} />
                  </label>
                ) : null}
              </div>
            )}
          </div>"""

content = content.replace(left_logo_old, left_logo_new)

# Update UI for Right Logos
right_logo_old = """          {/* Right Logo */}
          <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center relative group">
            {rightLogo ? (
              <>
                <img src={rightLogo} alt="Right Logo" className="max-w-full max-h-full object-contain" />
                {!isPublicView && (
                  <button onClick={() => onChangeRightLogo && onChangeRightLogo('')} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
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

right_logo_new = """          {/* Right Logos */}
          <div className="flex flex-shrink-0 gap-2">
            {(rightLogo || !isPublicView) && (
              <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center relative group">
                {rightLogo2 ? (
                  <>
                    <img src={rightLogo2} alt="Right Logo 2" className="max-w-full max-h-full object-contain" />
                    {!isPublicView && (
                      <button onClick={() => onChangeRightLogo2 && onChangeRightLogo2('')} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
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
            <div className="w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center relative group">
              {rightLogo ? (
                <>
                  <img src={rightLogo} alt="Right Logo 1" className="max-w-full max-h-full object-contain" />
                  {!isPublicView && (
                    <button onClick={() => onChangeRightLogo && onChangeRightLogo('')} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print text-xs" title="Remove logo">
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
          </div>"""

content = content.replace(right_logo_old, right_logo_new)

with open('src/components/BracketCanvas.tsx', 'w') as f:
    f.write(content)
