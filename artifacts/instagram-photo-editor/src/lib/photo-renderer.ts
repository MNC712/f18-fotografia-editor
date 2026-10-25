import { defaultPresentation, fonts, sizes, type OutputSize, type Presentation } from './presentation.ts';

export type Photo = {
  file: File | null;
  image: HTMLImageElement | null;
  url: string;
  f: string;
  s: string;
  iso: string;
  focal: string;
  camera: string;
  storyTitle: string;
  storySubtitle: string;
  storyEyebrow: string;
  brightness: number;
  contrast: number;
  saturation: number;
  rotation: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type LayoutStyle = 'editorial' | 'clean' | 'night' | 'modern' | 'gallery' | 'fullwidth' | 'signature';
export type ExportFormat = 'jpeg' | 'png';

type Frame = {
  name: string; description: string; background: string; text: string; muted: string; accent: string;
  x: number; y: number; width: number; height: number; radius: number; font: string;
};

export const frames: Record<LayoutStyle, Frame> = {
  editorial: { name: 'Editorial', description: 'Marfil · doble borde', background: '#fbfaf6', text: '#283e35', muted: '#747a71', accent: '#b94f32', x: 60, y: 60, width: 960, height: 1000, radius: 0, font: '"DM Sans", sans-serif' },
  clean: { name: 'Esencial', description: 'Blanco · sin distracciones', background: '#ffffff', text: '#222a25', muted: '#828680', accent: '#345945', x: 36, y: 36, width: 1008, height: 1000, radius: 0, font: '"DM Sans", sans-serif' },
  night: { name: 'Nocturno', description: 'Oscuro · galería', background: '#222823', text: '#f4f0e7', muted: '#b8b8ad', accent: '#d29a73', x: 60, y: 60, width: 960, height: 1000, radius: 0, font: '"DM Sans", sans-serif' },
  modern: { name: 'Moderno', description: 'Líneas precisas · gris perla', background: '#f1f3f4', text: '#1d2c34', muted: '#63717a', accent: '#284855', x: 40, y: 40, width: 1000, height: 1010, radius: 0, font: '"DM Sans", sans-serif' },
  gallery: { name: 'Galería', description: 'Márgenes amplios · serif', background: '#f7f5f0', text: '#302d29', muted: '#746e65', accent: '#302d29', x: 80, y: 80, width: 920, height: 970, radius: 0, font: '"Playfair Display", Georgia, serif' },
  fullwidth: { name: 'Ancho completo', description: 'Foto de lado a lado · ficha debajo', background: '#ffffff', text: '#202a30', muted: '#657079', accent: '#202a30', x: 0, y: 0, width: 1080, height: 1080, radius: 0, font: '"DM Sans", sans-serif' },
  signature: { name: 'Prisma', description: 'Asimétrico · ficha de autor', background: '#f6f4ef', text: '#152d3b', muted: '#586774', accent: '#245368', x: 28, y: 28, width: 1024, height: 1024, radius: 0, font: '"Montserrat", sans-serif' },
};

export function frameLayout(frame: LayoutStyle, size: OutputSize = 'portrait'): Frame {
  const output = sizes[size];
  return {
    ...frames[frame],
    y: frames[frame].y + output.safeTop,
    height: frames[frame].height + output.height - 1350 - output.safeTop - output.safeBottom,
  };
}

type Colors = Pick<Frame, 'background' | 'text' | 'muted' | 'accent'>;
const imageHue = new WeakMap<HTMLImageElement, number>();
function dominantHue(image: HTMLImageElement | null) {
  if (!image) return 160;
  const cached = imageHue.get(image);
  if (cached !== undefined) return cached;
  const sample = document.createElement('canvas');
  sample.width = 24; sample.height = 24;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return 160;
  try {
    context.drawImage(image, 0, 0, 24, 24);
    const data = context.getImageData(0, 0, 24, 24).data;
    let red = 0, green = 0, blue = 0, weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      red += data[i] * a; green += data[i + 1] * a; blue += data[i + 2] * a; weight += a;
    }
    if (!weight) return 160;
    red /= weight * 255; green /= weight * 255; blue /= weight * 255;
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), d = max - min;
    let hue = 160;
    if (d > .02) {
      hue = max === red ? ((green - blue) / d) % 6 : max === green ? (blue - red) / d + 2 : (red - green) / d + 4;
      hue = (hue * 60 + 360) % 360;
    }
    imageHue.set(image, hue);
    return hue;
  } catch { return 160; }
}

export function presentationColors(photo: Photo, frame: LayoutStyle, palette: Presentation['palette']): Colors {
  if (palette === 'original') {
    const { background, text, muted, accent } = frames[frame];
    return { background, text, muted, accent };
  }
  if (palette === 'ink') return { background: '#faf8f3', text: '#202623', muted: '#545d57', accent: '#202623' };
  if (palette === 'ocean') return { background: '#edf3f6', text: '#173342', muted: '#485f6c', accent: '#164d65' };
  if (palette === 'wine') return { background: '#faf3ed', text: '#45222d', muted: '#71535c', accent: '#702a41' };
  const h = Math.round(dominantHue(photo.image));
  const dark = frame === 'night';
  return {
    background: `hsl(${h} 16% ${dark ? 12 : 97}%)`,
    text: `hsl(${h} 25% ${dark ? 94 : 14}%)`,
    muted: `hsl(${h} 12% ${dark ? 76 : 34}%)`,
    accent: `hsl(${h} 42% ${dark ? 77 : 27}%)`,
  };
}

export const blankPhoto = (): Photo => ({
  file: null, image: null, url: '', f: '', s: '', iso: '', focal: '', camera: '',
  storyTitle: '', storySubtitle: '', storyEyebrow: '',
  brightness: 100, contrast: 100, saturation: 100, rotation: 0, zoom: 1, offsetX: 0, offsetY: 0,
});

// Pan is measured in output pixels, so preview and downloaded files share exactly the same crop.
export const limitZoom = (zoom: number) => Number.isFinite(zoom) ? Math.max(1, Math.min(4, zoom)) : 1;

export function cropGeometry(photo: Photo, frame: LayoutStyle, size: OutputSize = 'portrait') {
  const layout = frameLayout(frame, size);
  return coverGeometry(photo, layout.width, layout.height);
}

export function coverGeometry(photo: Photo, width: number, height: number) {
  const rotated = Math.abs(photo.rotation % 180) === 90;
  const iw = (rotated ? photo.image?.naturalHeight : photo.image?.naturalWidth) || 1;
  const ih = (rotated ? photo.image?.naturalWidth : photo.image?.naturalHeight) || 1;
  // Always cover: the same invariant protects dragging, zoom, rotation, frame changes and exports.
  const zoom = limitZoom(photo.zoom);
  const scale = Math.max(width / iw, height / ih) * zoom;
  const maxX = Math.max(0, (iw * scale - width) / 2);
  const maxY = Math.max(0, (ih * scale - height) / 2);
  return { zoom, scale, maxX, maxY, offsetX: Math.max(-maxX, Math.min(maxX, photo.offsetX)), offsetY: Math.max(-maxY, Math.min(maxY, photo.offsetY)) };
}

export function parts(photo: Photo) {
  const values: string[] = [];
  if (photo.f.trim()) values.push(/^f\//i.test(photo.f.trim()) ? photo.f.trim() : `f/${photo.f.trim()}`);
  if (photo.s.trim()) values.push(/s$/i.test(photo.s.trim()) ? photo.s.trim() : `${photo.s.trim()} s`);
  if (photo.iso.trim()) values.push(/^iso/i.test(photo.iso.trim()) ? photo.iso.trim() : `ISO ${photo.iso.trim()}`);
  if (photo.focal.trim()) values.push(/mm$/i.test(photo.focal.trim()) ? photo.focal.trim() : `${photo.focal.trim()} mm`);
  return values;
}

export function paintCanvas(index: number, photo: Photo, handle: string, frame: LayoutStyle, presentation: Presentation = defaultPresentation, renderScale = 1) {
  const output = sizes[presentation.size];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(output.width * renderScale);
  canvas.height = Math.round(output.height * renderScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no permite generar la imagen.');
  ctx.scale(renderScale, renderScale);
  const layout = { ...frameLayout(frame, presentation.size), ...presentationColors(photo, frame, presentation.palette) };
  const font = fonts[presentation.font].family || layout.font;
  const footerShift = output.height - 1350 - output.safeBottom;
  const { x, y, width, height, radius } = layout;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, output.width, output.height);

  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.clip();
  ctx.fillStyle = frame === 'night' ? '#34332f' : '#eeede7';
  ctx.fillRect(x, y, width, height);
  if (photo.image) {
    const crop = cropGeometry(photo, frame, presentation.size);
    ctx.translate(x + width / 2 + crop.offsetX, y + height / 2 + crop.offsetY);
    ctx.rotate(photo.rotation * Math.PI / 180);
    ctx.filter = `brightness(${photo.brightness}%) contrast(${photo.contrast}%) saturate(${photo.saturation}%)`;
    const dw = photo.image.naturalWidth * crop.scale, dh = photo.image.naturalHeight * crop.scale;
    ctx.drawImage(photo.image, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.fillStyle = '#8d928a'; ctx.font = '500 38px "Playfair Display", Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('Tu fotografía aparecerá aquí', 540, y + height / 2);
  }
  ctx.restore();

  if (frame === 'editorial') {
    ctx.strokeStyle = '#ffffffd9'; ctx.lineWidth = 2; ctx.strokeRect(x + 15, y + 15, width - 30, height - 30);
  } else if (frame === 'night') {
    ctx.strokeStyle = layout.muted; ctx.lineWidth = 2; ctx.strokeRect(24, 24 + output.safeTop, 1032, output.height - 48 - output.safeTop - output.safeBottom);
  } else if (frame === 'signature') {
    ctx.fillStyle = layout.accent;
    ctx.fillRect(28, 1080 + footerShift, 110, 5);
    ctx.fillRect(28, 1099 + footerShift, 4, 148);
    ctx.textAlign = 'right'; ctx.font = `600 16px ${font}`; ctx.fillStyle = layout.muted;
    ctx.fillText(`F / 1.8  —  ${String(index + 1).padStart(2, '0')}`, 1052, 1092 + footerShift);
  } else if (frame === 'modern' || frame === 'gallery' || frame === 'fullwidth') {
    ctx.strokeStyle = layout.muted;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 1110 + footerShift); ctx.lineTo(1020, 1110 + footerShift); ctx.stroke();
  }

  const values = parts(photo);
  ctx.textBaseline = 'alphabetic';
  if (values.length) {
    let size = frame === 'gallery' ? 45 : 50;
    const separator = '   ·   ';
    const measure = () => {
      ctx.font = `600 ${size}px ${font}`;
      return values.reduce((sum, text) => sum + ctx.measureText(text).width, 0) + ctx.measureText(separator).width * (values.length - 1);
    };
    let total = measure();
    while (total > 940 && size > 24) { size -= 2; total = measure(); }
    let px = (1080 - total) / 2;
    ctx.textAlign = 'left';
    values.forEach((text, idx) => {
      ctx.fillStyle = idx === 0 ? layout.accent : layout.text; ctx.fillText(text, px, 1166 + footerShift);
      px += ctx.measureText(text).width;
      if (idx < values.length - 1) { ctx.fillStyle = layout.muted; ctx.fillText(separator, px, 1166 + footerShift); px += ctx.measureText(separator).width; }
    });
  }
  ctx.textAlign = 'center';
  if (photo.camera.trim()) {
    ctx.fillStyle = layout.muted; ctx.font = `400 30px ${font}`;
    let camera = photo.camera.trim();
    while (ctx.measureText(camera).width > 940 && camera.length > 5) camera = `${camera.slice(0, -4)}…`;
    ctx.fillText(camera, 540, 1218 + footerShift);
  }
  if (handle.trim()) {
    ctx.fillStyle = layout.muted; ctx.font = `400 26px ${fonts[presentation.font].family || '"DM Mono", monospace'}`;
    ctx.fillText(handle.trim().slice(0, 40), 540, 1290 + footerShift);
  }
  if (frame === 'editorial') {
    ctx.fillStyle = layout.muted; ctx.font = '500 16px "DM Mono", monospace';
    ctx.textAlign = 'left'; ctx.fillText(`F / 1.8     ·     ${String(index + 1).padStart(2, '0')}`, 62, 1319 + footerShift);
    ctx.textAlign = 'right'; ctx.fillText('SERIE DEPORTIVA', 1018, 1319 + footerShift);
  }
  return canvas;
}
