import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeHandle, renderRaffleStory } from './raffle-story.ts';

type Printed = { text: string; y: number; width: number; font: string };
async function canvasFixture(run: (printed: Printed[], events: string[]) => Promise<void>) {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const printed: Printed[] = [], events: string[] = [];
  const context: Record<string, unknown> = {};
  const size = () => Number(String(context.font).match(/(\d+)px/)?.[1] || 20);
  const measure = (text: string) => Array.from(text).length * size() * .95;
  context.measureText = (text: string) => ({ width: measure(text) });
  context.fillText = (text: string, _x: number, y: number) => {
    events.push('paint'); printed.push({ text, y, width: measure(text), font: String(context.font) });
  };
  context.drawImage = () => events.push('image-painted');
  const proxy = new Proxy(context, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => proxy }),
    fonts: { load: async () => { events.push('font'); }, ready: Promise.resolve() },
  } as unknown as Document;
  globalThis.Image = class {
    naturalWidth = 2400; naturalHeight = 3200;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      events.push('image-request');
      queueMicrotask(() => { events.push('image-loaded'); if (url === 'broken') this.onerror?.(); else this.onload?.(); });
    }
  } as unknown as typeof Image;
  try { await run(printed, events); }
  finally { globalThis.document = originalDocument; globalThis.Image = originalImage; }
}
const result = { prize_id: 1, participant_id: 2, prize_name: 'Sesión de retrato', prize_description: 'Una experiencia en nuestro estudio.', winner_name: 'Lucía Ferrer', image_url: null };

test('raffle story is exact 1080x1920 with winner, prize and signature inside safe bounds', async () => {
  await canvasFixture(async (printed) => {
    const canvas = await renderRaffleStory('Sorteo de otoño', result, '@f18.fotografia');
    assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
    for (const value of ['Lucía Ferrer', 'Sesión de retrato', '@f18.fotografia']) assert.ok(printed.some(p => p.text === value));
    for (const item of printed) { assert.ok(item.y >= 200 && item.y < 1670); assert.ok(item.width <= 900); }
  });
});

test('maximum allowed long text is fully retained and never overlaps or overflows the story', async () => {
  await canvasFixture(async (printed) => {
    const long = { ...result, prize_name: 'W'.repeat(120), prize_description: '界'.repeat(600), winner_name: 'M'.repeat(100) };
    const title = 'N'.repeat(120);
    await renderRaffleStory(title, long, '@f18.fotografia');
    const inBox = (start: number, end: number) => printed.filter(p => p.y >= start && p.y < end).map(p => p.text).join('');
    assert.equal(inBox(250, 380), title);
    assert.equal(inBox(905, 1025), long.prize_name);
    assert.equal(inBox(1035, 1295), long.prize_description);
    assert.equal(inBox(1395, 1565), long.winner_name);
    assert.ok(printed.every(p => !p.text.includes('…') && p.width <= 900));
  });
});

test('story waits for real authenticated image and fonts, and fails rather than exporting a missing prize photo', async () => {
  await canvasFixture(async (_printed, events) => {
    await renderRaffleStory('Retratos', { ...result, image_url: '/sorteos-api/index.php?action=image&id=1' }, '@f18.fotografia');
    assert.ok(events.indexOf('image-loaded') < events.indexOf('image-painted'));
    assert.ok(events.indexOf('font') < events.indexOf('paint'));
    await assert.rejects(renderRaffleStory('Retratos', { ...result, image_url: 'broken' }, '@f18.fotografia'), /imagen del premio/);
  });
});

test('Instagram signature is normalized and has a safe default', () => {
  assert.equal(normalizeHandle('  f18.fotografia '), '@f18.fotografia');
  assert.equal(normalizeHandle('  '), '@f18.fotografia');
});
