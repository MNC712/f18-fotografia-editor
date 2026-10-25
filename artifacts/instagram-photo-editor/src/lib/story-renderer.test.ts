import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankPhoto, type Photo } from './photo-renderer.ts';
import { defaultPresentation, sizes, storyTemplates, type StoryTemplate } from './presentation.ts';
import { compositionCrop, compositionLayout, paintComposition } from './composition-renderer.ts';

const templates = Object.keys(storyTemplates) as StoryTemplate[];
const photo: Photo = {
  ...blankPhoto(), image: { naturalWidth: 4000, naturalHeight: 3000 } as HTMLImageElement,
  storyTitle: 'Luz de invierno', storySubtitle: 'Una mirada al paisaje', storyEyebrow: 'CUADERNO DE CAMPO',
  f: '1.8', s: '1/250', iso: '400', focal: '85', camera: 'Cámara de prueba',
};

test('all story templates protect coverage, including rotation, extreme pan and minimum zoom', () => {
  for (const template of templates) for (const showMetadata of [true, false]) {
    const story = { template, showMetadata };
    const layout = compositionLayout('framed', 'fullwidth', 'story', story);
    assert.equal(layout.width, 1080); assert.equal(layout.height, 1920);
    const rect = layout.rect;
    if (template !== 'cover') {
      assert.ok(rect.y >= sizes.story.safeTop);
      assert.ok(rect.y + rect.height <= 1920 - sizes.story.safeBottom);
    }
    for (const [naturalWidth, naturalHeight] of [[4000, 600], [400, 3000], [40, 40]]) {
      for (const rotation of [0, 90, 180, 270]) for (const zoom of [.1, 1, 4, 9]) {
        const p = { ...photo, image: { naturalWidth, naturalHeight } as HTMLImageElement, rotation, zoom, offsetX: 1e9, offsetY: -1e9 };
        const crop = compositionCrop(p, 'framed', 'fullwidth', 'story', story);
        const w = (rotation % 180 ? naturalHeight : naturalWidth) * crop.scale;
        const h = (rotation % 180 ? naturalWidth : naturalHeight) * crop.scale;
        assert.ok(w / 2 - Math.abs(crop.offsetX) >= rect.width / 2 - 1e-8);
        assert.ok(h / 2 - Math.abs(crop.offsetY) >= rect.height / 2 - 1e-8);
        assert.ok(crop.zoom >= 1 && crop.zoom <= 4);
      }
    }
  }
});

function withCanvas(run: (texts: { text: string; x: number; y: number; font: string }[], translations: number[][], draws: unknown[][]) => void) {
  const original = globalThis.document;
  const texts: { text: string; x: number; y: number; font: string }[] = [];
  const translations: number[][] = [], draws: unknown[][] = [];
  const context: Record<string, unknown> = {
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y, font: String(context.font) }),
    measureText: (text: string) => ({ width: text.length * Number(String(context.font).match(/(\d+)px/)?.[1] || 20) * .6 }),
    translate: (...args: number[]) => translations.push(args),
    drawImage: (...args: unknown[]) => draws.push(args),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  const proxy = new Proxy(context, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => proxy }) } as unknown as Document;
  try { run(texts, translations, draws); } finally { globalThis.document = original; }
}

test('story exports use preview geometry, real titles, optional metadata and safe text bounds', () => {
  for (const template of templates) for (const showMetadata of [true, false]) {
    withCanvas((texts, translations, draws) => {
      const story = { template, showMetadata };
      const p = { ...photo, zoom: 2, offsetX: 9999, offsetY: -9999 };
      const canvas = paintComposition(0, p, '@autor', 'fullwidth', { ...defaultPresentation, size: 'story', story }, 'framed');
      assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
      const { rect } = compositionLayout('framed', 'fullwidth', 'story', story);
      const crop = compositionCrop(p, 'framed', 'fullwidth', 'story', story);
      assert.deepEqual(translations[0], [rect.x + rect.width / 2 + crop.offsetX, rect.y + rect.height / 2 + crop.offsetY]);
      assert.equal(draws.length, 1);
      for (const expected of [photo.storyTitle, photo.storySubtitle, photo.storyEyebrow, '@autor']) assert.ok(texts.some(({ text }) => text === expected));
      assert.equal(texts.some(({ text }) => text.includes('ISO 400')), showMetadata);
      assert.equal(texts.some(({ text }) => text === photo.camera), showMetadata);
      for (const { text, x, y, font } of texts) {
        const fontSize = Number(font.match(/(\d+)px/)?.[1]);
        assert.ok(y >= 180 && y + fontSize <= 1670, `${template}: ${text} inside vertical safe area`);
        assert.ok(x >= 60 && x + text.length * fontSize * .6 <= 1020, `${template}: ${text} fits width`);
      }
      assert.ok(!texts.some(({ text }) => /Responder|Enviar mensaje|Zona segura/.test(text)));
    });
  }
});

test('long story texts are clamped inside the safe area and blanks do not create printed filler', () => {
  for (const template of templates) {
    withCanvas((texts) => {
      const long = { ...photo, storyTitle: 'W'.repeat(500), storySubtitle: 'Una descripción muy larga '.repeat(80), storyEyebrow: 'SERIE '.repeat(80), camera: 'Cámara '.repeat(100) };
      paintComposition(0, long, '@' + 'a'.repeat(100), 'fullwidth', { ...defaultPresentation, size: 'story', story: { template, showMetadata: true } }, 'framed');
      assert.ok(texts.some(({ text }) => text.endsWith('…')));
      texts.forEach(({ text, x, font }) => assert.ok(x + text.length * Number(font.match(/(\d+)px/)?.[1]) * .6 <= 1020));
    });
    withCanvas((texts) => {
      paintComposition(0, { ...blankPhoto(), image: photo.image }, '', 'fullwidth', { ...defaultPresentation, size: 'story', story: { template, showMetadata: false } }, 'framed');
      assert.deepEqual(texts, []);
    });
  }
});

test('story settings never add text or alter layout in borderless and three-piece modes', () => {
  for (const mode of ['borderless', 'triptych'] as const) {
    withCanvas((texts) => {
      const original = compositionLayout(mode, 'fullwidth', 'story');
      for (const template of templates) {
        const story = { template, showMetadata: true };
        assert.deepEqual(compositionLayout(mode, 'fullwidth', 'story', story), original);
        paintComposition(0, photo, '@autor', 'fullwidth', { ...defaultPresentation, size: 'story', story }, mode);
      }
      assert.deepEqual(texts, []);
    });
  }
});
