import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

patch_target = """        // Draw bracket line connectors (Vector graphics)
        pdf.setDrawColor(30, 41, 59); // slate-800
        pdf.setLineWidth(0.35);"""

patch_replacement = """        // Draw Stage Titles
        positions.forEach((roundPositions, k) => {
          if (!roundPositions || roundPositions.length === 0) return;
          const count = size / Math.pow(2, k);
          let stageLabel = `ROUND OF ${count}`;
          if (k === numRounds) stageLabel = 'CHAMPION';
          else if (count === 2) stageLabel = 'FINAL';
          else if (count === 4) stageLabel = 'SEMI FINAL';
          else if (count === 8) stageLabel = 'QUARTER FINAL';
          
          const isCenter = k === numRounds;
          
          pdf.setTextColor(15, 23, 42); // slate-900
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8); // Match the HTML 14px size roughly in pt

          const stageTop = startY + (PAD * scale) - 3;
          
          // Left side
          const leftX = startX + roundPositions[0].x * scale;
          pdf.text(stageLabel, leftX + (BOX_W * scale) / 2, stageTop - 2, { align: 'center' });
          pdf.setDrawColor(203, 213, 225); // slate-300
          pdf.setLineWidth(0.5);
          pdf.line(leftX, stageTop, leftX + BOX_W * scale, stageTop);
          
          // Right side (if not center)
          if (!isCenter) {
             const rightX = startX + roundPositions[roundPositions.length - 1].x * scale;
             pdf.text(stageLabel, rightX + (BOX_W * scale) / 2, stageTop - 2, { align: 'center' });
             pdf.line(rightX, stageTop, rightX + BOX_W * scale, stageTop);
          }
        });

        // Draw bracket line connectors (Vector graphics)
        pdf.setDrawColor(30, 41, 59); // slate-800
        pdf.setLineWidth(0.35);"""

if patch_target in content:
    content = content.replace(patch_target, patch_replacement)
else:
    print("Failed to find patch_target")

with open('src/App.tsx', 'w') as f:
    f.write(content)
