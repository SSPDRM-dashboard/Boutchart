/**
 * Color utility methods to support parsing and converting OKLCH colors 
 * to standard RGB/RGBA formats to avoid html2canvas parsing errors.
 */

/**
 * Converts OKLCH values to non-color-function standard sRGB strings.
 */
export function oklchToRgb(l: number, c: number, h: number, alpha: number = 1): string {
  // Clamp boundaries to prevent clipping overflows
  const L = Math.max(0, Math.min(1, l));
  const C = Math.max(0, c);
  const H = isNaN(h) ? 0 : h;

  // Convert Hue from degrees to radians
  const hRad = (H * Math.PI) / 180;

  // Convert Oklch to Oklab
  const labA = C * Math.cos(hRad);
  const labB = C * Math.sin(hRad);

  // Convert Oklab to LMS
  const l_ = L + 0.3963377774 * labA + 0.2158037573 * labB;
  const m_ = L - 0.1055613458 * labA - 0.0638541728 * labB;
  const s_ = L - 0.0894841775 * labA - 1.2914855480 * labB;

  const l_3 = l_ * l_ * l_;
  const m_3 = m_ * m_ * m_;
  const s_3 = s_ * s_ * s_;

  // Convert LMS to Linear RGB
  const rL = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  const gL = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  const bL = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  // Linear sRGB to standard sRGB (with gamma correction)
  const gamma = (val: number) => {
    if (isNaN(val)) return 0;
    return val <= 0.0031308 ? 12.92 * val : 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
  };

  const r = Math.max(0, Math.min(255, Math.round(gamma(rL) * 255)));
  const g = Math.max(0, Math.min(255, Math.round(gamma(gL) * 255)));
  const b = Math.max(0, Math.min(255, Math.round(gamma(bL) * 255)));

  if (alpha === 1) {
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

/**
 * Parses OKLCH arguments format, e.g. "0.98 0.005 247.9" or "0.145 0.018 250 / var(--tw-bg-opacity, 1)"
 * and returns the translated RGB string.
 */
export function parseAndConvertOklchArgs(argsStr: string): string {
  const parts = argsStr.split('/');
  const mainPartsStr = parts[0].trim();
  const alphaPartStr = parts[1] ? parts[1].trim() : '';

  // mainPartsStr should be space-separated L, C, H
  const mainParts = mainPartsStr.split(/\s+/).filter(Boolean);
  if (mainParts.length < 3) {
    throw new Error('Invalid OKLCH space separated values');
  }

  const lStr = mainParts[0];
  const cStr = mainParts[1];
  const hStr = mainParts[2];

  // Convert L: % or decimal
  let L = parseFloat(lStr);
  if (lStr.includes('%')) {
    L = L / 100;
  }

  // Convert C: % or decimal
  let C = parseFloat(cStr);
  if (cStr.includes('%')) {
    C = C / 100;
  }

  // Convert H
  let H = parseFloat(hStr);
  if (hStr.includes('rad')) {
    H = H * (180 / Math.PI);
  } else if (hStr.includes('turn')) {
    H = H * 360;
  }

  // Convert Alpha: % or decimal or CSS Variable var()
  let alpha = 1;
  if (alphaPartStr) {
    if (alphaPartStr.startsWith('var(')) {
      // Extract numeric fallback, e.g. "1" from "var(--tw-bg-opacity, 1)"
      const match = alphaPartStr.match(/,\s*([0-9.]+)\s*\)/);
      if (match) {
        alpha = parseFloat(match[1]);
      } else {
        alpha = 1;
      }
    } else {
      alpha = parseFloat(alphaPartStr);
      if (alphaPartStr.includes('%')) {
        alpha = alpha / 100;
      }
    }
  }

  if (isNaN(L) || isNaN(C) || isNaN(H) || isNaN(alpha)) {
    throw new Error('Parsed OKLCH value contains NaN');
  }

  return oklchToRgb(L, C, H, alpha);
}

/**
 * Searches a document string (such as CSS stylesheet text) for OKLCH entries and
 * replaces each with an equivalent standard sRGB format value.
 */
export function replaceOklchInString(input: string): string {
  if (!input || !input.toLowerCase().includes('oklch')) {
    return input;
  }

  let output = '';
  let i = 0;
  const len = input.length;

  while (i < len) {
    if (i + 6 <= len && input.substring(i, i + 6).toLowerCase() === 'oklch(') {
      // Found the initiation token "oklch("
      const startIdx = i;
      i += 6;
      let depth = 1;
      let argsStr = '';

      while (i < len && depth > 0) {
        const char = input[i];
        if (char === '(') depth++;
        else if (char === ')') depth--;

        if (depth > 0) {
          argsStr += char;
        }
        i++;
      }

      try {
        const rgbColor = parseAndConvertOklchArgs(argsStr);
        output += rgbColor;
      } catch (err) {
        // Fallback: copy original text segment if it fails validation
        output += input.substring(startIdx, i);
      }
    } else {
      output += input[i];
      i++;
    }
  }

  return output;
}
