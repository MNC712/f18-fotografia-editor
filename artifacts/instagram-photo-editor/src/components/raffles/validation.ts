export const LIMITS = { title: 120, description: 600, participant: 100, prize: 120, participants: 5000, prizes: 30, imageBytes: 8 * 1024 * 1024, megapixels: 20 };

export function parseNames(text: string): string[] {
  return text.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
}

export async function validateImage(file: File): Promise<string | null> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'La imagen debe ser JPEG, PNG o WebP.';
  if (file.size > LIMITS.imageBytes) return 'La imagen supera el límite de 8 MB.';
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('x'));
      img.src = url;
    });
    if (size.w * size.h > LIMITS.megapixels * 1_000_000) return `La imagen tiene ${(size.w * size.h / 1e6).toFixed(1)} megapíxeles; el máximo es 20.`;
    return null;
  } catch { return 'No se pudo leer la imagen.'; } finally { URL.revokeObjectURL(url); }
}

export const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sorteo';
