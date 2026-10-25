import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SLOTS, swapItems } from './carousel-utils.ts';

test('four photos can be reordered without dropping or modifying original files or matching crops', () => {
  assert.equal(MAX_SLOTS, 4);
  const photos = Array.from({ length: MAX_SLOTS }, (_, index) => ({ file: `original-${index}`, metadata: { iso: 100 * (index + 1) } }));
  const crops = Array.from({ length: MAX_SLOTS }, (_, index) => ({ framed: { zoom: index + 1 }, triptych: { offsetX: index * 10 } }));
  let nextPhotos = photos, nextCrops = crops;
  for (const [from, to] of [[3, 2], [2, 1], [1, 0]]) {
    nextPhotos = swapItems(nextPhotos, from, to);
    nextCrops = swapItems(nextCrops, from, to);
  }
  assert.equal(nextPhotos[0], photos[3]);
  assert.equal(nextCrops[0], crops[3]);
  assert.deepEqual(nextPhotos.map((p) => p.file), ['original-3', 'original-0', 'original-1', 'original-2']);
  assert.equal(photos[0].file, 'original-0');
  assert.equal(nextPhotos.length, 4);
  assert.equal(new Set(nextPhotos).size, 4);
  assert.equal(swapItems(photos, -1, 4), photos);
});
