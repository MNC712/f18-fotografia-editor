import { zip } from 'fflate';

export type ArchiveImage = { name: string; blob: Blob };

export function canvasBlob(canvas: HTMLCanvasElement, format: 'png' | 'jpeg'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo preparar una imagen. Intenta una resolución menor.'));
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? 1 : undefined);
  });
}

/** Store the already-encoded images unchanged: ZIP does not reduce their quality. */
export async function imageArchive(images: ArchiveImage[]): Promise<Blob> {
  if (!images.length) throw new Error('No hay imágenes para descargar.');
  const entries: Record<string, Uint8Array> = {};
  for (const { name, blob } of images) {
    if (Object.hasOwn(entries, name)) throw new Error('Hay nombres de archivo repetidos.');
    entries[name] = new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => {
      if (error) reject(new Error('No se pudo crear el ZIP. Intenta una resolución menor.'));
      else resolve(new Blob([new Uint8Array(data).buffer], { type: 'application/zip' }));
    });
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    // Large ZIP downloads need time to start, especially on mobile.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
