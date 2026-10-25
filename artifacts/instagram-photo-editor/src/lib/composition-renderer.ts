import { coverGeometry, cropGeometry, frameLayout, paintCanvas, type LayoutStyle, type Photo } from './photo-renderer.ts';
import { defaultStoryPresentation, sizes, type OutputSize, type Presentation, type StoryPresentation } from './presentation.ts';
import { paintStory, storyPhotoRect } from './story-renderer.ts';

export type CompositionMode = 'framed' | 'borderless' | 'triptych';
export const compositionModes = {
  framed: { name: 'Con marco', description: 'Fotografía de autor y ficha técnica' },
  borderless: { name: 'Sin marco', description: 'Recorte limpio, de borde a borde' },
  triptych: { name: 'Feed 3×1', description: 'Una foto, tres publicaciones conectadas' },
} as const;

// Split exports are always three regular feed posts, never stories.
export function compositionSize(mode: CompositionMode, size: OutputSize): OutputSize {
  return mode === 'triptych' && (size === 'story' || size === 'landscape') ? 'tall' : size;
}

export function compositionLayout(mode: CompositionMode, frame: LayoutStyle, size: OutputSize, story: StoryPresentation = defaultStoryPresentation) {
  const output = sizes[compositionSize(mode, size)];
  const width = output.width * (mode === 'triptych' ? 3 : 1);
  return {
    width,
    height: output.height,
    rect: mode === 'framed' ? size === 'story' ? storyPhotoRect(story) : frameLayout(frame, size) : { x: 0, y: 0, width, height: output.height, radius: 0 },
  };
}

export function compositionCrop(photo: Photo, mode: CompositionMode, frame: LayoutStyle, size: OutputSize, story: StoryPresentation = defaultStoryPresentation) {
  const { rect } = compositionLayout(mode, frame, size, story);
  return mode === 'framed' && size !== 'story' ? cropGeometry(photo, frame, size) : coverGeometry(photo, rect.width, rect.height);
}

export function paintComposition(index: number, photo: Photo, handle: string, frame: LayoutStyle, presentation: Presentation, mode: CompositionMode, renderScale = 1) {
  if (mode === 'framed' && presentation.size === 'story') return paintStory(photo, handle, frame, presentation, renderScale);
  if (mode === 'framed') return paintCanvas(index, photo, handle, frame, presentation, renderScale);
  const { width, height } = compositionLayout(mode, frame, presentation.size);
  const canvas = document.createElement('canvas');
  // Round one panel first so all three split boundaries remain integer pixels.
  canvas.width = mode === 'triptych' ? Math.round(width / 3 * renderScale) * 3 : Math.round(width * renderScale);
  canvas.height = Math.round(height * renderScale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no permite generar la imagen.');
  ctx.scale(renderScale, renderScale);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#eeede7'; ctx.fillRect(0, 0, width, height);
  if (!photo.image) {
    ctx.fillStyle = '#657168'; ctx.font = '400 36px "DM Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(mode === 'triptych' ? 'Una fotografía, tres publicaciones' : 'Añade una fotografía para recortarla', width / 2, height / 2);
    return canvas;
  }
  const crop = compositionCrop(photo, mode, frame, presentation.size);
  ctx.save();
  ctx.translate(width / 2 + crop.offsetX, height / 2 + crop.offsetY);
  ctx.rotate(photo.rotation * Math.PI / 180);
  ctx.filter = `brightness(${photo.brightness}%) contrast(${photo.contrast}%) saturate(${photo.saturation}%)`;
  const dw = photo.image.naturalWidth * crop.scale, dh = photo.image.naturalHeight * crop.scale;
  ctx.drawImage(photo.image, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return canvas;
}

// Slice a single rendered panorama at exact integer boundaries. No independent
// cover-fitting or re-encoding per panel, so adjacent pieces stay continuous.
export function splitTriptych(composite: HTMLCanvasElement): HTMLCanvasElement[] {
  if (composite.width % 3 !== 0) throw new Error('El panorama debe poder dividirse en tres partes iguales.');
  const tileWidth = composite.width / 3;
  return [0, 1, 2].map((index) => {
    const tile = document.createElement('canvas'); tile.width = tileWidth; tile.height = composite.height;
    const ctx = tile.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar una de las publicaciones.');
    ctx.drawImage(composite, index * tileWidth, 0, tileWidth, composite.height, 0, 0, tileWidth, composite.height);
    return tile;
  });
}
