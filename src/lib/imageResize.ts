// Resizes an image file in the browser and returns a compressed data URL,
// shared by the admin product-photo upload and the customer's personal-photo
// checkout upload - both want the same "shrink it, don't block on a weird
// format" behavior.
//
// Decoding via createImageBitmap fails on HEIC/HEIF (iPhone's default photo
// format since iOS 11) in Chromium/Firefox - only Safari can decode it
// natively, via macOS/iOS's own codec licensing. When that's the cause, a
// HEIC-specific WASM decoder (heic2any, ~500KB) is lazy-loaded on demand -
// it's never even downloaded for the common JPG/PNG/WebP case.
//
// The requested output is WebP, but Safari doesn't support encoding canvas
// output as WebP: per spec, toDataURL() silently substitutes PNG instead of
// throwing when the requested format isn't supported, so the actual output
// format is detected from the returned string rather than assumed.
export async function resizeImageToDataUrl(file: File, maxDimension = 1280, quality = 0.8): Promise<string> {
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia di browser ini.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL('image/webp', quality);
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const looksHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    if (!looksHeic) {
      throw new Error('Format gambar tidak didukung oleh browser ini. Gunakan foto JPG atau PNG.');
    }
    try {
      const heic2any = (await import('heic2any')).default;
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      return await createImageBitmap(jpegBlob);
    } catch {
      throw new Error('Format foto HEIC ini tidak dapat diproses. Gunakan foto JPG atau PNG.');
    }
  }
}
