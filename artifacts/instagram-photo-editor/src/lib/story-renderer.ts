import { coverGeometry, frames, parts, presentationColors, type LayoutStyle, type Photo } from './photo-renderer.ts';
import { defaultStoryPresentation, fonts, sizes, type Presentation, type StoryPresentation } from './presentation.ts';

// One geometry contract for the drag surface, cover clamp, preview and export.
export function storyPhotoRect(story: StoryPresentation = defaultStoryPresentation) {
  if (story.template === 'cover') return { x: 0, y: 0, width: 1080, height: 1920, radius: 0 };
  if (story.template === 'exhibition') return { x: 48, y: 216, width: 984, height: story.showMetadata ? 920 : 1050, radius: 0 };
  return { x: 60, y: 548, width: 960, height: story.showMetadata ? 830 : 960, radius: 0 };
}

// Wrap with measured widths; clamp long words and lines without distorting text.
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let line = '', row = 0;
  while (words.length && row < maxLines) {
    const word = words.shift()!;
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
    if (line && row < maxLines - 1) {
      ctx.fillText(line, x, y + row++ * lineHeight);
      words.unshift(word); line = ''; continue;
    }
    // A single oversized word or the last available line.
    line = candidate;
    while (line && ctx.measureText(`${line}…`).width > width) line = line.slice(0, -1);
    ctx.fillText(`${line}…`, x, y + row * lineHeight);
    return;
  }
  if (line) {
    if (words.length) {
      while (line && ctx.measureText(`${line}…`).width > width) line = line.slice(0, -1);
      line += '…';
    }
    ctx.fillText(line, x, y + row * lineHeight);
  }
}

export function paintStory(photo: Photo, handle: string, frame: LayoutStyle, presentation: Presentation, renderScale = 1) {
  const canvas = document.createElement('canvas');
  const output = sizes.story;
  canvas.width = Math.round(output.width * renderScale); canvas.height = Math.round(output.height * renderScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no permite generar la historia.');
  ctx.scale(renderScale, renderScale);
  const story = presentation.story;
  const cover = story.template === 'cover';
  const exhibition = story.template === 'exhibition';
  const colors = presentationColors(photo, frame, presentation.palette);
  const font = fonts[presentation.font].family || frames[frame].font;
  const rect = storyPhotoRect(story);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = colors.background; ctx.fillRect(0, 0, output.width, output.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
  ctx.fillStyle = '#d9ddd7'; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  if (photo.image) {
    const crop = coverGeometry(photo, rect.width, rect.height);
    ctx.translate(rect.x + rect.width / 2 + crop.offsetX, rect.y + rect.height / 2 + crop.offsetY);
    ctx.rotate(photo.rotation * Math.PI / 180);
    ctx.filter = `brightness(${photo.brightness}%) contrast(${photo.contrast}%) saturate(${photo.saturation}%)`;
    const dw = photo.image.naturalWidth * crop.scale, dh = photo.image.naturalHeight * crop.scale;
    ctx.drawImage(photo.image, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.fillStyle = '#4b584e'; ctx.font = '400 34px "DM Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Tu fotografía aparecerá aquí', 540, rect.y + rect.height / 2);
  }
  ctx.restore();
  if (cover) {
    // An opaque base under the text keeps it readable even over bright images.
    const gradient = ctx.createLinearGradient(0, 990, 0, 1920);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(.27, 'rgba(0,0,0,.8)');
    gradient.addColorStop(1, 'rgba(0,0,0,.95)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 990, 1080, 930);
  }
  const textColor = cover ? '#ffffff' : colors.text;
  const muted = cover ? '#e1e5e2' : colors.muted;
  const x = 60, width = 960;
  const headingY = cover ? 1265 : exhibition ? rect.y + rect.height + 58 : 232;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = cover ? muted : colors.accent; ctx.font = `600 22px ${font}`;
  drawText(ctx, photo.storyEyebrow, x, headingY, width, 28, 1);
  ctx.fillStyle = textColor; ctx.font = `600 64px ${font}`;
  drawText(ctx, photo.storyTitle, x, headingY + 42, width, 74, 2);
  ctx.fillStyle = muted; ctx.font = `400 29px ${font}`;
  drawText(ctx, photo.storySubtitle, x, headingY + 204, width, 36, 2);
  if (story.showMetadata) {
    ctx.strokeStyle = muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, 1550); ctx.lineTo(1020, 1550); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = `600 28px ${font}`;
    drawText(ctx, parts(photo).join('   ·   '), x, 1570, width, 34, 1);
    ctx.fillStyle = muted; ctx.font = `400 23px ${font}`;
    drawText(ctx, photo.camera, x, 1613, width, 29, 1);
  }
  ctx.fillStyle = muted; ctx.font = `400 22px ${font}`;
  drawText(ctx, handle, x, 1640, width, 26, 1);
  return canvas;
}
