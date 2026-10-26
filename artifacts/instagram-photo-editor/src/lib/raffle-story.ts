import type { RaffleResult } from '@/lib/raffle-api';

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const DEFAULT_HANDLE = '@f18.fotografia';
const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"DM Sans", system-ui, sans-serif';
const MONO = '"DM Mono", ui-monospace, monospace';

export function normalizeHandle(handle: string): string {
  const clean = handle.trim().replace(/\s+/g, '');
  return clean ? (clean.startsWith('@') ? clean : `@${clean}`) : DEFAULT_HANDLE;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (ctx.measureText(trial).width <= maxW) { line = trial; continue; }
      if (line) { lines.push(line); line = ''; }
      let chunk = '';
      for (const ch of Array.from(word)) {
        if (ctx.measureText(chunk + ch).width > maxW && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

/** Shrinks the type until every line fits the box; ellipsis only as a last resort at the minimum size. */
function drawFitted(ctx: CanvasRenderingContext2D, text: string, o: {
  family: string; weight: number; x: number; y: number; w: number; h: number; max: number; min: number; lh: number; color: string; valign?: 'top' | 'middle';
}) {
  let size = o.max, lines: string[] = [], fits = false;
  for (; size >= 8; size -= size > 30 ? 2 : 1) {
    ctx.font = `${o.weight} ${size}px ${o.family}`;
    lines = wrap(ctx, text, o.w);
    if (lines.length * size * o.lh <= o.h) { fits = true; break; }
  }
  if (!fits) throw new Error('El texto es demasiado largo para caber completo en la historia. Acórtalo e inténtalo de nuevo.');
  const total = lines.length * size * o.lh;
  const top = o.valign === 'top' ? o.y : o.y + (o.h - total) / 2;
  ctx.fillStyle = o.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, o.x + o.w / 2, top + size * o.lh * (i + 0.5)));
}

async function loadFonts() {
  try {
    await Promise.all([
      `600 40px ${SERIF}`, `500 40px ${SERIF}`, `400 24px ${SANS}`, `600 24px ${SANS}`, `500 24px ${MONO}`,
    ].map((f) => document.fonts.load(f, 'Aa Ññ 123 @f/1.8')));
    await document.fonts.ready;
  } catch { /* fallback faces keep the layout valid */ }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la imagen del premio.'));
    image.src = url;
  });
}

export async function renderRaffleStory(raffleTitle: string, result: RaffleResult, handle: string): Promise<HTMLCanvasElement> {
  const [image] = await Promise.all([result.image_url ? loadImage(result.image_url) : Promise.resolve(null), loadFonts()]);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH; canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede generar la imagen.');
  const M = 90, W = STORY_WIDTH - M * 2, cream = '#f5efe2', accent = '#e08a63';
  ctx.fillStyle = '#21473b'; ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  ctx.strokeStyle = 'rgba(245,239,226,.28)'; ctx.lineWidth = 2; ctx.strokeRect(50, 50, STORY_WIDTH - 100, STORY_HEIGHT - 100);

  ctx.font = `500 24px ${MONO}`; ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('S O R T E O', STORY_WIDTH / 2, 220);
  drawFitted(ctx, raffleTitle, { family: SERIF, weight: 600, x: M, y: 250, w: W, h: 130, max: 60, min: 26, lh: 1.15, color: cream });

  const imgY = 410, imgH = 470;
  ctx.fillStyle = cream; ctx.fillRect(M, imgY, W, imgH);
  if (image) {
    const pad = 12, bw = W - pad * 2, bh = imgH - pad * 2;
    const scale = Math.max(bw / image.naturalWidth, bh / image.naturalHeight);
    const sw = bw / scale, sh = bh / scale;
    ctx.save(); ctx.beginPath(); ctx.rect(M + pad, imgY + pad, bw, bh); ctx.clip();
    ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, M + pad, imgY + pad, bw, bh);
    ctx.restore();
  } else {
    ctx.fillStyle = '#e6dcc8'; ctx.fillRect(M + 12, imgY + 12, W - 24, imgH - 24);
    ctx.fillStyle = '#21473b'; ctx.font = `600 150px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('f/', STORY_WIDTH / 2, imgY + imgH / 2);
  }

  drawFitted(ctx, result.prize_name, { family: SERIF, weight: 600, x: M, y: 905, w: W, h: 120, max: 54, min: 24, lh: 1.15, color: cream });
  if (result.prize_description.trim()) {
    drawFitted(ctx, result.prize_description, { family: SANS, weight: 400, x: M + 20, y: 1035, w: W - 40, h: 260, max: 30, min: 12, lh: 1.35, color: 'rgba(245,239,226,.82)', valign: 'top' });
  }
  ctx.fillStyle = accent; ctx.fillRect(STORY_WIDTH / 2 - 40, 1318, 80, 3);
  ctx.font = `500 24px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('G A N A D O R / A', STORY_WIDTH / 2, 1362);
  drawFitted(ctx, result.winner_name, { family: SERIF, weight: 600, x: M, y: 1395, w: W, h: 170, max: 88, min: 28, lh: 1.12, color: cream });
  drawFitted(ctx, normalizeHandle(handle), { family: MONO, weight: 500, x: M, y: 1585, w: W, h: 50, max: 30, min: 16, lh: 1.2, color: accent });
  return canvas;
}
