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

export type CollectiveLayout = { width: number; height: number; fitsStory: boolean };
type Tier = { thumb: number; prize: number; winner: number; gap: number; pad: number };
const TIERS: Tier[] = [
  { thumb: 220, prize: 40, winner: 56, gap: 28, pad: 30 },
  { thumb: 170, prize: 34, winner: 46, gap: 22, pad: 24 },
  { thumb: 128, prize: 30, winner: 40, gap: 16, pad: 20 },
  { thumb: 96, prize: 24, winner: 32, gap: 12, pad: 16 },
];
const HEADER_H = 420, FOOTER_H = 220;

/** All winners and prizes in one PNG. Text never shrinks below a readable size; the canvas grows instead. */
export async function renderRaffleCollective(raffleTitle: string, results: RaffleResult[], handle: string): Promise<HTMLCanvasElement> {
  if (!results.length) throw new Error('Este sorteo no tiene resultados.');
  const [images] = await Promise.all([
    Promise.all(results.map((r) => (r.image_url ? loadImage(r.image_url).catch(() => { throw new Error(`No se pudo cargar la imagen del premio "${r.prize_name}".`); }) : Promise.resolve(null)))),
    loadFonts(),
  ]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede generar la imagen.');
  const M = 90, W = STORY_WIDTH - M * 2, cream = '#f5efe2', accent = '#e08a63', green = '#21473b';
  const measure = (t: Tier) => {
    const textW = W - t.thumb - t.pad * 3;
    return results.map((r) => {
      ctx.font = `600 ${t.prize}px ${SERIF}`; const p = wrap(ctx, r.prize_name, textW - 70);
      ctx.font = `600 ${t.winner}px ${SERIF}`; const w = wrap(ctx, r.winner_name, textW);
      const textH = p.length * t.prize * 1.2 + 14 + w.length * t.winner * 1.15;
      return { p, w, h: Math.max(t.thumb, textH) + t.pad * 2 };
    });
  };
  const rowsH = (rows: { h: number }[], t: Tier) => rows.reduce((a, r) => a + r.h, 0) + t.gap * (rows.length - 1);
  ctx.font = `600 60px ${SERIF}`;
  let tier = TIERS[TIERS.length - 1], rows = measure(tier);
  for (const t of TIERS) { const m = measure(t); if (HEADER_H + rowsH(m, t) + FOOTER_H <= STORY_HEIGHT) { tier = t; rows = m; break; } }
  ctx.font = `600 60px ${SERIF}`; const titleLines = wrap(ctx, raffleTitle, W);
  const titleH = titleLines.length * 60 * 1.12;
  const content = rowsH(rows, tier);
  const height = Math.max(STORY_HEIGHT, Math.ceil(250 + titleH + 120 + content + FOOTER_H));
  canvas.width = STORY_WIDTH; canvas.height = height;
  // canvas resize resets state
  ctx.fillStyle = green; ctx.fillRect(0, 0, STORY_WIDTH, height);
  ctx.strokeStyle = 'rgba(245,239,226,.28)'; ctx.lineWidth = 2; ctx.strokeRect(50, 50, STORY_WIDTH - 100, height - 100);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `500 24px ${MONO}`; ctx.fillStyle = accent; ctx.fillText('G A N A D O R E S', STORY_WIDTH / 2, 200);
  ctx.font = `600 60px ${SERIF}`; ctx.fillStyle = cream;
  titleLines.forEach((l, i) => ctx.fillText(l, STORY_WIDTH / 2, 250 + 60 * 1.12 * (i + 0.5)));
  let y = 250 + titleH + 40;
  ctx.fillStyle = accent; ctx.fillRect(STORY_WIDTH / 2 - 40, y, 80, 3);
  y += 80;
  // vertically center short lists inside the story frame
  const free = height - FOOTER_H - y - content;
  if (free > 0) y += free / 2;
  rows.forEach((row, i) => {
    const t = tier, img = images[i];
    ctx.fillStyle = 'rgba(245,239,226,.07)'; ctx.fillRect(M, y, W, row.h);
    ctx.fillStyle = accent; ctx.fillRect(M, y, 4, row.h);
    const tx = M + t.pad, ty = y + (row.h - t.thumb) / 2;
    ctx.fillStyle = cream; ctx.fillRect(tx, ty, t.thumb, t.thumb);
    if (img) {
      const b = t.thumb - 8, s = Math.max(b / img.naturalWidth, b / img.naturalHeight), sw = b / s, sh = b / s;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, tx + 4, ty + 4, b, b);
    } else {
      ctx.fillStyle = '#e6dcc8'; ctx.fillRect(tx + 4, ty + 4, t.thumb - 8, t.thumb - 8);
      ctx.fillStyle = green; ctx.font = `600 ${Math.round(t.thumb * .38)}px ${SERIF}`; ctx.textAlign = 'center';
      ctx.fillText('f/', tx + t.thumb / 2, ty + t.thumb / 2);
    }
    const x = tx + t.thumb + t.pad * 1.5;
    const textH = row.p.length * t.prize * 1.2 + 14 + row.w.length * t.winner * 1.15;
    let cy = y + (row.h - textH) / 2;
    ctx.textAlign = 'left';
    ctx.font = `500 ${Math.max(20, Math.round(t.prize * .7))}px ${MONO}`; ctx.fillStyle = accent;
    ctx.fillText(String(i + 1).padStart(2, '0'), x, cy + t.prize * .6);
    ctx.font = `600 ${t.prize}px ${SERIF}`; ctx.fillStyle = 'rgba(245,239,226,.78)';
    row.p.forEach((l) => { ctx.fillText(l, x + 70, cy + t.prize * .6); cy += t.prize * 1.2; });
    cy += 14;
    ctx.font = `600 ${t.winner}px ${SERIF}`; ctx.fillStyle = cream;
    row.w.forEach((l) => { ctx.fillText(l, x, cy + t.winner * .575); cy += t.winner * 1.15; });
    y += row.h + t.gap;
  });
  ctx.textAlign = 'center';
  ctx.font = `500 22px ${MONO}`; ctx.fillStyle = 'rgba(245,239,226,.6)';
  ctx.fillText(`${results.length} ${results.length === 1 ? 'PREMIO' : 'PREMIOS'}  ·  GRACIAS POR PARTICIPAR`, STORY_WIDTH / 2, height - 200);
  drawFitted(ctx, normalizeHandle(handle), { family: MONO, weight: 500, x: M, y: height - 170, w: W, h: 50, max: 30, min: 16, lh: 1.2, color: accent });
  return canvas;
}

export function collectiveLayout(canvas: HTMLCanvasElement): CollectiveLayout {
  return { width: canvas.width, height: canvas.height, fitsStory: canvas.height === STORY_HEIGHT };
}
