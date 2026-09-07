import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

preload_old = """    try {
      let loadedLeftLogo: HTMLImageElement | null = null;
      let loadedRightLogo: HTMLImageElement | null = null;
      if (leftLogo) {
        try { loadedLeftLogo = await loadImageElement(leftLogo); } catch (e) { console.warn('Left logo load error', e); }
      }
      if (rightLogo) {
        try { loadedRightLogo = await loadImageElement(rightLogo); } catch (e) { console.warn('Right logo load error', e); }
      }"""

preload_new = """    try {
      let loadedLeftLogo: HTMLImageElement | null = null;
      let loadedLeftLogo2: HTMLImageElement | null = null;
      let loadedRightLogo: HTMLImageElement | null = null;
      let loadedRightLogo2: HTMLImageElement | null = null;
      if (leftLogo) {
        try { loadedLeftLogo = await loadImageElement(leftLogo); } catch (e) { console.warn('Left logo load error', e); }
      }
      if (leftLogo2) {
        try { loadedLeftLogo2 = await loadImageElement(leftLogo2); } catch (e) { console.warn('Left logo 2 load error', e); }
      }
      if (rightLogo) {
        try { loadedRightLogo = await loadImageElement(rightLogo); } catch (e) { console.warn('Right logo load error', e); }
      }
      if (rightLogo2) {
        try { loadedRightLogo2 = await loadImageElement(rightLogo2); } catch (e) { console.warn('Right logo 2 load error', e); }
      }"""
content = content.replace(preload_old, preload_new)


draw_old = """        // Draw Logos if they exist (using preloaded HTMLImageElement for robust format support)
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

draw_new = """        // Draw Logos if they exist (using preloaded HTMLImageElement for robust format support)
        let leftOffsetX = 20;
        if (loadedLeftLogo) {
          try {
            const aspect = loadedLeftLogo.width / loadedLeftLogo.height;
            let w = 24; let h = 24;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = leftLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(loadedLeftLogo, format, leftOffsetX + (24-w)/2, 5 + (24-h)/2, w, h, undefined, 'FAST');
            leftOffsetX += 28;
          } catch(e) { console.warn('Failed to add left logo to PDF', e); }
        }
        if (loadedLeftLogo2) {
          try {
            const aspect = loadedLeftLogo2.width / loadedLeftLogo2.height;
            let w = 24; let h = 24;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = leftLogo2.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(loadedLeftLogo2, format, leftOffsetX + (24-w)/2, 5 + (24-h)/2, w, h, undefined, 'FAST');
          } catch(e) { console.warn('Failed to add left logo 2 to PDF', e); }
        }

        let rightOffsetX = 253;
        if (loadedRightLogo) {
          try {
            const aspect = loadedRightLogo.width / loadedRightLogo.height;
            let w = 24; let h = 24;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = rightLogo.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(loadedRightLogo, format, rightOffsetX + (24-w)/2, 5 + (24-h)/2, w, h, undefined, 'FAST');
            rightOffsetX -= 28;
          } catch(e) { console.warn('Failed to add right logo to PDF', e); }
        }
        if (loadedRightLogo2) {
          try {
            const aspect = loadedRightLogo2.width / loadedRightLogo2.height;
            let w = 24; let h = 24;
            if (aspect > 1) h = w / aspect;
            else w = h * aspect;
            const format = rightLogo2.includes('image/png') ? 'PNG' : 'JPEG';
            pdf.addImage(loadedRightLogo2, format, rightOffsetX + (24-w)/2, 5 + (24-h)/2, w, h, undefined, 'FAST');
          } catch(e) { console.warn('Failed to add right logo 2 to PDF', e); }
        }"""

content = content.replace(draw_old, draw_new)

with open('src/App.tsx', 'w') as f:
    f.write(content)
