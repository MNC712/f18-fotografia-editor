import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPhoto, cropGeometry, frameLayout, frames, limitZoom, paintCanvas, presentationColors, type LayoutStyle, type Photo } from './photo-renderer.ts';
import { defaultPresentation, fonts, palettes, sizes, type OutputSize, type FontStyle, type ColorPalette } from './presentation.ts';

const image = { naturalWidth: 4000, naturalHeight: 3000 } as HTMLImageElement;
const photo: Photo = { ...blankPhoto(), image };

test('zoom starts centered and never permits shrinking below full coverage', () => {
  assert.equal(photo.zoom, 1);
  const normal = cropGeometry(photo, 'editorial');
  const enlarged = cropGeometry({ ...photo, zoom: 2 }, 'editorial');
  const reduced = cropGeometry({ ...photo, zoom: .25 }, 'editorial');
  assert.equal(enlarged.scale, normal.scale * 2);
  assert.equal(reduced.scale, normal.scale);
  assert.equal(reduced.zoom, 1);
  assert.equal(normal.offsetX, 0);
  assert.equal(normal.offsetY, 0);
  for (const invalid of [-100, 0, .25, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(limitZoom(invalid), 1);
  assert.equal(limitZoom(100), 4);
});

test('dragging, rotating, zooming and switching frames cannot expose empty edges', () => {
  for (const size of Object.keys(sizes) as OutputSize[]) {
  for (const frame of Object.keys(frames) as LayoutStyle[]) {
    for (const [naturalWidth, naturalHeight] of [[4000, 3000], [1000, 4000], [3000, 3000], [3840, 2160], [640, 480], [32, 64]]) {
      for (const rotation of [0, 90, 180, 270]) {
        for (const zoom of [.25, 1, 1.01, 2, 4, 100, Number.NaN]) {
          for (const direction of [-1, 1]) {
            const source = { naturalWidth, naturalHeight } as HTMLImageElement;
            const crop = cropGeometry({ ...photo, image: source, rotation, zoom, offsetX: direction * 1e6, offsetY: -direction * 1e6 }, frame, size);
            assert.ok(Math.abs(crop.offsetX) <= crop.maxX && Math.abs(crop.offsetY) <= crop.maxY);
            assert.ok(crop.zoom >= 1 && crop.zoom <= 4);
            const rotated = rotation % 180 === 90;
            const dw = (rotated ? naturalHeight : naturalWidth) * crop.scale;
            const dh = (rotated ? naturalWidth : naturalHeight) * crop.scale;
            const { width, height } = frameLayout(frame, size);
            assert.ok(width > 0 && height > 0, `${size}: positive photo area`);
            const left = width / 2 + crop.offsetX - dw / 2;
            const top = height / 2 + crop.offsetY - dh / 2;
            assert.ok(left <= 1e-8 && left + dw >= width - 1e-8, `${frame}: horizontal coverage`);
            assert.ok(top <= 1e-8 && top + dh >= height - 1e-8, `${frame}: vertical coverage`);
          }
        }
      }
    }
  }
  }
});

test('rotation swaps the cover-fit dimensions', () => {
  const crop = cropGeometry({ ...photo, rotation: 90 }, 'editorial');
  assert.equal(crop.scale, Math.max(960 / 3000, 1000 / 4000));
});

test('only formal frames are offered, including full width with a separate technical footer', () => {
  assert.deepEqual(Object.keys(frames), ['editorial', 'clean', 'night', 'modern', 'gallery', 'fullwidth', 'signature']);
  assert.equal(frames.fullwidth.x, 0);
  assert.equal(frames.fullwidth.y, 0);
  assert.equal(frames.fullwidth.width, 1080);
  assert.equal(frames.fullwidth.height, 1080);
  assert.ok(frames.fullwidth.y + frames.fullwidth.height < 1166);
});

test('all formal frame exports retain the exact protected crop and 1080 × 1350 dimensions', () => {
  const originalDocument = globalThis.document;
  try {
    for (const frame of Object.keys(frames) as LayoutStyle[]) {
      const translations: number[][] = [];
      const draws: unknown[][] = [];
      const texts: unknown[][] = [];
      const context = new Proxy({
        translate: (...args: number[]) => translations.push(args),
        drawImage: (...args: unknown[]) => draws.push(args),
        fillText: (...args: unknown[]) => texts.push(args),
        measureText: (text: string) => ({ width: text.length * 10 }),
      }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
      const canvas = { width: 0, height: 0, getContext: () => context };
      globalThis.document = { createElement: () => canvas } as unknown as Document;
      const adjusted = { ...photo, zoom: 2, offsetX: 125, offsetY: -140, f: '1.8', s: '1/1000', iso: '400', focal: '85', camera: 'Cámara de prueba' };
      const crop = cropGeometry(adjusted, frame);
      const output = paintCanvas(0, adjusted, '@foto', frame);
      assert.equal(output.width, 1080);
      assert.equal(output.height, 1350);
      assert.deepEqual(translations[0], [frames[frame].x + frames[frame].width / 2 + crop.offsetX, frames[frame].y + frames[frame].height / 2 + crop.offsetY]);
      assert.equal(draws.length, 1);
      assert.equal(draws[0][3], image.naturalWidth * crop.scale);
      assert.equal(draws[0][4], image.naturalHeight * crop.scale);
      assert.equal(context.imageSmoothingQuality, 'high');
      const footerTexts = texts.filter((args) => Number(args[2]) >= 1166);
      assert.ok(footerTexts.some((args) => args[0] === '@foto'));
      assert.ok(footerTexts.some((args) => args[0] === 'f/1.8'));
      assert.ok(footerTexts.some((args) => args[0] === 'Cámara de prueba'));
    }
  } finally {
    globalThis.document = originalDocument;
  }
});

test('every size, font and palette exports matching dimensions, protected crop and complete footer', () => {
  const originalDocument = globalThis.document;
  try {
    for (const size of Object.keys(sizes) as OutputSize[]) {
      for (const frame of Object.keys(frames) as LayoutStyle[]) {
        for (const font of Object.keys(fonts) as FontStyle[]) {
          for (const palette of Object.keys(palettes) as ColorPalette[]) {
            const texts: unknown[][] = [], translations: number[][] = [];
            const context = new Proxy({
              translate: (...args: number[]) => translations.push(args),
              fillText: (...args: unknown[]) => texts.push(args),
              measureText: (text: string) => ({ width: text.length * 10 }),
              getImageData: () => ({ data: new Uint8ClampedArray([210, 40, 60, 255]) }),
            }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
            globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document;
            const p = { ...photo, f: '1.8', s: '1/1000', iso: '400', focal: '85', camera: 'Cámara de prueba', zoom: 2, offsetX: 1e6, offsetY: -1e6 };
            const canvas = paintCanvas(0, p, '@foto', frame, { ...defaultPresentation, size, font, palette });
            assert.equal(canvas.width, sizes[size].width);
            assert.equal(canvas.height, sizes[size].height);
            const rect = frameLayout(frame, size), crop = cropGeometry(p, frame, size);
            assert.deepEqual(translations[0], [rect.x + rect.width / 2 + crop.offsetX, rect.y + rect.height / 2 + crop.offsetY]);
            for (const text of ['f/1.8', '1/1000 s', 'ISO 400', '85 mm', 'Cámara de prueba', '@foto']) {
              const entry = texts.find((item) => item[0] === text);
              assert.ok(entry, `${size}/${frame}/${font}/${palette}: ${text}`);
              assert.ok(Number(entry[2]) > rect.y + rect.height && Number(entry[2]) < canvas.height - sizes[size].safeBottom, 'footer outside photo and inside safe area');
            }
            if (size === 'story') assert.ok(rect.y >= sizes.story.safeTop);
          }
        }
      }
    }
  } finally { globalThis.document = originalDocument; }
});

test('automatic palettes derive colors from the image with contrasting light and dark text', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({
      getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray([240, 20, 20, 255]) }) }),
    }) } as unknown as Document;
    const redPhoto = { ...photo, image: { naturalWidth: 600, naturalHeight: 400 } as HTMLImageElement };
    assert.equal(presentationColors(redPhoto, 'fullwidth', 'auto').background, 'hsl(0 16% 97%)');
    assert.equal(presentationColors(redPhoto, 'night', 'auto').text, 'hsl(0 25% 94%)');
    assert.equal(defaultPresentation.size, 'portrait');
  } finally { globalThis.document = originalDocument; }
});
