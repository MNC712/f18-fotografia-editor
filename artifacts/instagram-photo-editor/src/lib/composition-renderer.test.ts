import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPhoto, frames, type LayoutStyle, type Photo } from './photo-renderer.ts';
import { defaultPresentation, sizes, type OutputSize } from './presentation.ts';
import { compositionCrop, compositionLayout, compositionSize, paintComposition, splitTriptych, type CompositionMode } from './composition-renderer.ts';

const source = { naturalWidth: 5000, naturalHeight: 3000 } as HTMLImageElement;
const photo: Photo = { ...blankPhoto(), image: source, f: '1.8', iso: '400', camera: 'Test camera' };

test('borderless uses every pixel; feed is exactly three equal publication widths', () => {
  for (const size of Object.keys(sizes) as OutputSize[]) {
    for (const mode of ['borderless', 'triptych'] as CompositionMode[]) {
      const output = sizes[compositionSize(mode, size)];
      const layout = compositionLayout(mode, 'fullwidth', size);
      assert.equal(layout.width, output.width * (mode === 'triptych' ? 3 : 1));
      assert.equal(layout.height, output.height);
      assert.deepEqual(layout.rect, { x: 0, y: 0, width: layout.width, height: layout.height, radius: 0 });
    }
  }
  assert.equal(compositionSize('triptych', 'story'), 'tall');
  assert.equal(compositionSize('triptych', 'landscape'), 'tall');
  assert.equal(compositionSize('borderless', 'story'), 'story');
});

test('every mode protects coverage while dragging, zooming, rotating and changing sizes', () => {
  for (const mode of ['framed', 'borderless', 'triptych'] as CompositionMode[]) {
    for (const size of Object.keys(sizes) as OutputSize[]) {
      for (const frame of Object.keys(frames) as LayoutStyle[]) {
        for (const [naturalWidth, naturalHeight] of [[5000, 1000], [800, 2400], [40, 40]]) {
          for (const rotation of [0, 90, 180, 270]) {
            for (const zoom of [.1, 1, 2, 5]) {
              for (const direction of [-1, 1]) {
                const p = { ...photo, image: { naturalWidth, naturalHeight } as HTMLImageElement, rotation, zoom, offsetX: direction * 1e9, offsetY: -direction * 1e9 };
                const crop = compositionCrop(p, mode, frame, size);
                const rect = compositionLayout(mode, frame, size).rect;
                const w = (rotation % 180 ? naturalHeight : naturalWidth) * crop.scale;
                const h = (rotation % 180 ? naturalWidth : naturalHeight) * crop.scale;
                assert.ok(w / 2 - Math.abs(crop.offsetX) >= rect.width / 2 - 1e-8);
                assert.ok(h / 2 - Math.abs(crop.offsetY) >= rect.height / 2 - 1e-8);
                assert.ok(crop.zoom >= 1 && crop.zoom <= 4);
              }
            }
          }
        }
      }
    }
  }
});

test('borderless and panorama exports draw one continuous source without borders, metadata or signature', () => {
  const originalDocument = globalThis.document;
  try {
    for (const mode of ['borderless', 'triptych'] as CompositionMode[]) {
      for (const size of Object.keys(sizes) as OutputSize[]) {
        const drawings: unknown[][] = [], texts: unknown[][] = [], translations: number[][] = [];
        const ctx = new Proxy({
          drawImage: (...args: unknown[]) => drawings.push(args),
          fillText: (...args: unknown[]) => texts.push(args),
          translate: (...args: number[]) => translations.push(args),
        }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
        globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } as unknown as Document;
        const p = { ...photo, zoom: 1.2, offsetX: 300, offsetY: -300 };
        const canvas = paintComposition(0, p, '@private', 'gallery', { ...defaultPresentation, size }, mode);
        const layout = compositionLayout(mode, 'gallery', size), crop = compositionCrop(p, mode, 'gallery', size);
        assert.equal(canvas.width, layout.width);
        assert.equal(canvas.height, layout.height);
        assert.equal(drawings.length, 1);
        assert.equal(drawings[0][0], source);
        assert.equal(drawings[0][3], source.naturalWidth * crop.scale);
        assert.equal(texts.length, 0);
        assert.deepEqual(translations[0], [layout.width / 2 + crop.offsetX, layout.height / 2 + crop.offsetY]);
        assert.equal(ctx.imageSmoothingQuality, 'high');
      }
    }
  } finally { globalThis.document = originalDocument; }
});

test('split uses exact contiguous source rectangles with no gaps, overlaps or rescaling', () => {
  const originalDocument = globalThis.document;
  try {
    for (const height of [1080, 1350, 1440]) {
      const composite = { width: 3240, height } as HTMLCanvasElement;
      const drawings: unknown[][] = [];
      globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (...args: unknown[]) => drawings.push(args) }) }) } as unknown as Document;
      const tiles = splitTriptych(composite);
      assert.equal(tiles.length, 3);
      tiles.forEach((tile, index) => {
        assert.equal(tile.width, 1080); assert.equal(tile.height, height);
        assert.deepEqual(drawings[index], [composite, index * 1080, 0, 1080, height, 0, 0, 1080, height]);
      });
    }
    assert.throws(() => splitTriptych({ width: 1000, height: 1000 } as HTMLCanvasElement), /tres partes iguales/);
  } finally { globalThis.document = originalDocument; }
});
