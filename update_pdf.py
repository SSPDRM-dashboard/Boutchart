import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Locate the drawing header section in handleExportPdf
old_code = """        // Draw header
        // Center X: 148.5mm (half of 297mm)
        const centerX = 148.5;"""

new_code = """        // Draw header
        // Center X: 148.5mm (half of 297mm)
        const centerX = 148.5;

        // Draw Logos if they exist
        if (leftLogo) {
          try {
            const props = pdf.getImageProperties(leftLogo);
            const aspect = props.width / props.height;
            let w = 20; let h = 20;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = leftLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(leftLogo, format, 20 + (20-w)/2, 6 + (20-h)/2, w, h, undefined, 'FAST');
          } catch(e) { console.warn('Failed to add left logo to PDF', e); }
        }
        if (rightLogo) {
          try {
            const props = pdf.getImageProperties(rightLogo);
            const aspect = props.width / props.height;
            let w = 20; let h = 20;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = rightLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(rightLogo, format, 257 + (20-w)/2, 6 + (20-h)/2, w, h, undefined, 'FAST');
          } catch(e) { console.warn('Failed to add right logo to PDF', e); }
        }
"""

content = content.replace(old_code, new_code)

with open('src/App.tsx', 'w') as f:
    f.write(content)
