import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# I need to find where the PDF draws nodes and insert the stage labels loop before or after it.
# Wait, I already added stage labels in BracketCanvas.tsx, but the user is exporting to PDF.
# The PDF export uses jsPDF manually in App.tsx! That's why the HTML labels don't show up in the PDF!
# Let's see if there's a loop over positions in the PDF generation.
# There is:
#        positions.forEach((roundPositions, k) => {
#          roundPositions.forEach((pos, i) => {

patch_target = """        // Draw matches first (connectors)
        const isClassic = true; // Use classic styling in PDF
        const connectorLines: string[] = [];"""

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
          pdf.setFontSize(Math.max(6, 32 * scale));

          const leftX = startX + roundPositions[0].x * scale;
          const stageTop = startY + PAD * scale;
          const stageHeight = 40 * scale;
          
          // Left side
          pdf.text(stageLabel, leftX + (BOX_W * scale) / 2, stageTop + stageHeight - 8 * scale, { align: 'center' });
          pdf.setDrawColor(15, 23, 42); // slate-900
          pdf.setLineWidth(1 * scale);
          pdf.line(leftX, stageTop + stageHeight, leftX + BOX_W * scale, stageTop + stageHeight);
          
          // Right side (if not center)
          if (!isCenter) {
             const rightX = startX + roundPositions[roundPositions.length - 1].x * scale;
             pdf.text(stageLabel, rightX + (BOX_W * scale) / 2, stageTop + stageHeight - 8 * scale, { align: 'center' });
             pdf.line(rightX, stageTop + stageHeight, rightX + BOX_W * scale, stageTop + stageHeight);
          }
        });

        // Draw matches first (connectors)
        const isClassic = true; // Use classic styling in PDF
        const connectorLines: string[] = [];"""

if patch_target in content:
    content = content.replace(patch_target, patch_replacement)
else:
    print("Failed to find patch target in App.tsx")

with open('src/App.tsx', 'w') as f:
    f.write(content)
