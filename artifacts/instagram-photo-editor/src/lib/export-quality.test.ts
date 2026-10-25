import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPhoto, frames, type LayoutStyle, type Photo } from './photo-renderer.ts';
import { defaultPresentation, sizes, storyTemplates, type OutputSize, type StoryTemplate } from './presentation.ts';
import { compositionCrop, compositionLayout, splitTriptych, type CompositionMode } from './composition-renderer.ts';
import { exportPlan, renderExport, MAX_EXPORT_EDGE, MAX_EXPORT_PIXELS } from './export-quality.ts';

const photo = (width: number, height: number): Photo => ({ ...blankPhoto(), image: { naturalWidth: width, naturalHeight: height } as HTMLImageElement });

test('source resolution retains original crop pixels instead of always reducing to 1080', () => {
  const original = photo(4320, 5400);
  const plan = exportPlan([original], 'fullwidth', defaultPresentation, 'borderless', 'source');
  assert.equal(plan.width, 4320);
  assert.equal(plan.height, 5400);
  assert.equal(plan.scale, 4);
  assert.equal(plan.upscaled, false);
  const instagram = exportPlan([original], 'fullwidth', defaultPresentation, 'borderless', 'instagram');
  assert.equal(instagram.width, 1080);
  assert.equal(instagram.height, 1350);
});

test('zoom and rotation change available resolution without pretending to restore lost detail', () => {
  const original = photo(4320, 5400);
  const enlarged = exportPlan([{ ...original, zoom: 2 }], 'fullwidth', defaultPresentation, 'borderless', 'source');
  assert.equal(enlarged.width, 2160);
  const rotated = { ...original, rotation: 90 };
  const plan = exportPlan([rotated], 'fullwidth', defaultPresentation, 'borderless', 'source');
  assert.ok(plan.scale <= 1 / compositionCrop(rotated, 'borderless', 'fullwidth', 'portrait').scale + 1e-8);
  const low = exportPlan([photo(540, 675)], 'fullwidth', defaultPresentation, 'borderless', 'source');
  assert.equal(low.width, 1080);
  assert.equal(low.upscaled, true);
});

test('four-image carousel shares a single resolution limited by its least detailed slide', () => {
  const four = [photo(4320, 5400), photo(3240, 4050), photo(2160, 2700), photo(5400, 6750)];
  const plan = exportPlan(four, 'fullwidth', defaultPresentation, 'borderless', 'source');
  assert.equal(plan.width, 2160); assert.equal(plan.height, 2700);
  assert.equal(plan.upscaled, false);
  assert.equal(exportPlan(four, 'fullwidth', defaultPresentation, 'borderless', 'double').width, 2160);
});

test('resolution planning respects memory limits, integer split boundaries and every story template', () => {
  for (const mode of ['framed', 'borderless', 'triptych'] as CompositionMode[]) {
    for (const size of Object.keys(sizes) as OutputSize[]) {
      for (const template of Object.keys(storyTemplates) as StoryTemplate[]) {
        const presentation = { ...defaultPresentation, size, story: { ...defaultPresentation.story, template } };
        const plan = exportPlan([photo(40000, 40000)], 'fullwidth', presentation, mode, 'source');
        assert.ok(plan.width <= MAX_EXPORT_EDGE && plan.height <= MAX_EXPORT_EDGE);
        assert.ok(plan.width * plan.height <= MAX_EXPORT_PIXELS);
        assert.equal(plan.limited, true);
        if (mode === 'triptych') assert.equal(plan.width % 3, 0);
      }
    }
  }
});

test('high-resolution downloads re-render from original source and split at final resolution', () => {
  const originalDocument = globalThis.document;
  try {
    for (const mode of ['framed', 'borderless', 'triptych'] as CompositionMode[]) {
      for (const size of ['portrait', 'square', 'story'] as OutputSize[]) {
        for (const frame of Object.keys(frames) as LayoutStyle[]) {
          const draws: unknown[][] = [], scales: number[][] = [];
          const ctx = new Proxy({
            drawImage: (...args: unknown[]) => draws.push(args),
            scale: (...args: number[]) => scales.push(args),
            measureText: (text: string) => ({ width: text.length * 10 }),
            createLinearGradient: () => ({ addColorStop: () => {} }),
          }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
          globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } as unknown as Document;
          const p = { ...photo(8000, 6000), f: '1.8', iso: '400', camera: 'Cámara original' };
          const presentation = { ...defaultPresentation, size };
          const plan = exportPlan([p], frame, presentation, mode, 'source');
          const canvas = renderExport(0, p, '@foto', frame, presentation, mode, plan.scale);
          assert.equal(canvas.width, plan.width);
          assert.equal(canvas.height, plan.height);
          assert.equal(draws[0][0], p.image, 'must draw original image, never enlarge a preview canvas');
          assert.deepEqual(scales[0], [plan.scale, plan.scale]);
          const base = compositionLayout(mode, frame, size, presentation.story);
          assert.equal(canvas.height, Math.round(base.height * plan.scale));
          if (mode === 'triptych') {
            const tiles = splitTriptych(canvas);
            assert.equal(tiles[2].width, plan.tileWidth);
            assert.equal(tiles[2].height, plan.height);
            assert.deepEqual(draws[3], [canvas, 2 * plan.tileWidth, 0, plan.tileWidth, plan.height, 0, 0, plan.tileWidth, plan.height]);
          }
        }
      }
    }
  } finally { globalThis.document = originalDocument; }
});
