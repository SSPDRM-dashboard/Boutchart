/**
 * Browser-native utility for High-Fidelity GZIP Compression and Decompression.
 * Shrinks large JSON tournament payloads by over 80% to fit perfectly inside Vercel URL lengths without 414 errors.
 */

export async function compressToGzipBase64(str: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    // Fallback if CompressionStream is unsupported (extremely old browsers)
    return btoa(encodeURIComponent(str));
  }
  
  const byteArray = new TextEncoder().encode(str);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(byteArray);
  writer.close();
  
  const arrBuffer = await new Response(cs.readable).arrayBuffer();
  const uint8 = new Uint8Array(arrBuffer);
  
  // Safe binary to base64 conversion
  let binary = "";
  const len = uint8.length;
  // Process in chunks to prevent stack overflow for massive files
  const chunk_size = 0xffff;
  for (let i = 0; i < len; i += chunk_size) {
    const chunk = uint8.subarray(i, i + chunk_size);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export async function decompressFromGzipBase64(base64Str: string): Promise<string> {
  try {
    if (!base64Str) {
      throw new Error("Empty input");
    }

    if (typeof DecompressionStream === 'undefined') {
      // Fallback if DecompressionStream is unsupported
      return decodeURIComponent(atob(base64Str));
    }

    const binaryString = atob(base64Str);
    const byteArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(byteArray);
    writer.close();
    
    const arrBuffer = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(arrBuffer);
  } catch (e) {
    console.error("Failed to decompress gzip base64 string", e);
    throw e;
  }
}
