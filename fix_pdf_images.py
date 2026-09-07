import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Insert the helper function right before handleDownloadSearchablePdf
helper_func = """
  const loadImageElement = (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = base64;
    });
  };

  const handleDownloadSearchablePdf = async (ringFilter?: 'all' | number) => {
"""
content = content.replace("  const handleDownloadSearchablePdf = async (ringFilter?: 'all' | number) => {\n", helper_func)

# Preload images outside the loop
preload_code = """
    try {
      let loadedLeftLogo: HTMLImageElement | null = null;
      let loadedRightLogo: HTMLImageElement | null = null;
      if (leftLogo) {
        try { loadedLeftLogo = await loadImageElement(leftLogo); } catch (e) { console.warn('Left logo load error', e); }
      }
      if (rightLogo) {
        try { loadedRightLogo = await loadImageElement(rightLogo); } catch (e) { console.warn('Right logo load error', e); }
      }

      // Find keys of brackets that match the filter
"""
content = content.replace("    try {\n      // Find keys of brackets that match the filter", preload_code)


old_drawing_code = """        // Draw Logos if they exist
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
        }"""

new_drawing_code = """        // Draw Logos if they exist (using preloaded HTMLImageElement for robust format support)
        if (loadedLeftLogo) {
          try {
            const aspect = loadedLeftLogo.width / loadedLeftLogo.height;
            let w = 24; let h = 24;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = leftLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(loadedLeftLogo, format, 20 + (24-w)/2, 5 + (24-h)/2, w, h, undefined, 'FAST');
          } catch(e) { console.warn('Failed to add left logo to PDF', e); }
        }
        if (loadedRightLogo) {
          try {
            const aspect = loadedRightLogo.width / loadedRightLogo.height;
            let w = 24; let h = 24;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = rightLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(loadedRightLogo, format, 253 + (24-w)/2, 5 + (24-h)/2, w, h, undefined, 'FAST');
          } catch(e) { console.warn('Failed to add right logo to PDF', e); }
        }"""

content = content.replace(old_drawing_code, new_drawing_code)

with open('src/App.tsx', 'w') as f:
    f.write(content)

