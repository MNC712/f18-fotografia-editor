import { compositionCrop, compositionLayout, paintComposition, type CompositionMode } from './composition-renderer.ts';
import type { LayoutStyle, Photo } from './photo-renderer.ts';
import type { Presentation } from './presentation.ts';

export const exportResolutions = {
  source: { name: 'Máxima del original', description: 'Conserva el detalle disponible después del recorte' },
  double: { name: 'Alta · 2160 px', description: 'Doble resolución del formato de Instagram' },
  instagram: { name: 'Instagram · 1080 px', description: 'Tamaño optimizado para publicar' },
} as const;
export type ExportResolution = keyof typeof exportResolutions;
export const MAX_EXPORT_EDGE = 8192;
export const MAX_EXPORT_PIXELS = 32_000_000;

// All slides in a carousel share one scale: the weakest crop determines the
// maximum real source resolution. Preview pixels are never used for exports.
export function exportPlan(photos: Photo[], frame: LayoutStyle, presentation: Presentation, mode: CompositionMode, resolution: ExportResolution) {
  const layout = compositionLayout(mode, frame, presentation.size, presentation.story);
  const loaded = photos.filter((photo) => photo.image);
  const sourceScale = loaded.length
    ? Math.min(...loaded.map((photo) => 1 / compositionCrop(photo, mode, frame, presentation.size, presentation.story).scale))
    : 1;
  const requested = resolution === 'source' ? Math.max(1, sourceScale) : resolution === 'double' ? 2 : 1;
  const safetyScale = Math.min(MAX_EXPORT_EDGE / layout.width, MAX_EXPORT_EDGE / layout.height, Math.sqrt(MAX_EXPORT_PIXELS / (layout.width * layout.height)));
  const desiredScale = Math.min(requested, safetyScale);
  const tileWidth = Math.max(1, Math.floor(1080 * desiredScale + 1e-8));
  const scale = tileWidth / 1080;
  const width = tileWidth * (mode === 'triptych' ? 3 : 1);
  const height = Math.round(layout.height * scale);
  return {
    scale, width, height, tileWidth, sourceScale,
    upscaled: loaded.length > 0 && scale > sourceScale + 1e-6,
    limited: requested > safetyScale + 1e-6,
  };
}

export function renderExport(index: number, photo: Photo, handle: string, frame: LayoutStyle, presentation: Presentation, mode: CompositionMode, scale: number) {
  // Re-render at final resolution directly from the full-resolution image.
  return paintComposition(index, photo, handle, frame, presentation, mode, scale);
}
