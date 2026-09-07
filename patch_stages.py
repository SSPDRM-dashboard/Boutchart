import re

with open('src/components/BracketCanvas.tsx', 'r') as f:
    content = f.read()

# 1. Update let y calculation
old_y_calc = """      let y: number;
      if (k === 0) {
        // Leaves share same vertical alignment top-to-bottom on both sides
        const j = i < count / 2 ? i : (i - count / 2);
        y = PAD + j * ROW_PITCH + ROW_PITCH / 2;"""

new_y_calc = """      const STAGE_HEADER_OFFSET = 60;
      let y: number;
      if (k === 0) {
        // Leaves share same vertical alignment top-to-bottom on both sides
        const j = i < count / 2 ? i : (i - count / 2);
        y = PAD + STAGE_HEADER_OFFSET + j * ROW_PITCH + ROW_PITCH / 2;"""

if old_y_calc in content:
    content = content.replace(old_y_calc, new_y_calc)
else:
    print("Failed to find old_y_calc")

# 2. Update baseCanvasHeight
old_base_height = "const baseCanvasHeight = PAD * 2 + Math.max(2, size / 2) * ROW_PITCH;"
new_base_height = "const STAGE_HEADER_OFFSET = 60;\n  const baseCanvasHeight = PAD * 2 + STAGE_HEADER_OFFSET + Math.max(2, size / 2) * ROW_PITCH;"
if old_base_height in content:
    content = content.replace(old_base_height, new_base_height)
else:
    print("Failed to find old_base_height")

# 3. Add getStageLabel function outside BracketCanvas component
old_imports = """import { CertificateModal } from './CertificateModal';
import { db, auth, doc, getDoc, setDoc } from '../lib/firebase';"""

new_imports = """import { CertificateModal } from './CertificateModal';
import { db, auth, doc, getDoc, setDoc } from '../lib/firebase';

const getStageLabel = (size: number, k: number, numRounds: number) => {
  if (k === numRounds) return 'CHAMPION';
  const count = size / Math.pow(2, k);
  if (count === 2) return 'FINAL';
  if (count === 4) return 'SEMI FINAL';
  if (count === 8) return 'QUARTER FINAL';
  return `ROUND OF ${count}`;
};"""

if old_imports in content:
    content = content.replace(old_imports, new_imports)
else:
    print("Failed to find old_imports")

# 4. Inject the stage labels rendering
old_render = """            {/* Symmetrical line connectors svg layer */}
            <svg"""

new_render = """            {/* Stage Title Labels */}
            {positions.map((roundPositions, k) => {
              if (!roundPositions || roundPositions.length === 0) return null;
              const stageLabel = getStageLabel(size, k, numRounds);
              
              const leftX = roundPositions[0].x;
              const rightX = roundPositions[roundPositions.length - 1].x;
              const isCenter = k === numRounds;
              
              return (
                <React.Fragment key={`stage-label-${k}`}>
                  <div 
                    className="absolute text-center text-slate-800 font-extrabold print:text-black tracking-wide no-print-break-inside flex flex-col justify-end pb-2 border-b-2 border-slate-200 print:border-black uppercase"
                    style={{
                      left: leftX,
                      top: PAD,
                      width: BOX_W,
                      height: 40,
                      fontSize: '14px',
                    }}
                  >
                    {stageLabel}
                  </div>
                  {!isCenter && (
                    <div 
                      className="absolute text-center text-slate-800 font-extrabold print:text-black tracking-wide no-print-break-inside flex flex-col justify-end pb-2 border-b-2 border-slate-200 print:border-black uppercase"
                      style={{
                        left: rightX,
                        top: PAD,
                        width: BOX_W,
                        height: 40,
                        fontSize: '14px',
                      }}
                    >
                      {stageLabel}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Symmetrical line connectors svg layer */}
            <svg"""

if old_render in content:
    content = content.replace(old_render, new_render)
else:
    print("Failed to find old_render")

with open('src/components/BracketCanvas.tsx', 'w') as f:
    f.write(content)
