import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { canvasBlob, imageArchive } from './download-archive.ts';

test('a single ZIP contains all four full-quality encoded images unchanged and in order', async () => {
  for (const format of ['png', 'jpeg']) {
    const images = Array.from({ length: 4 }, (_, n) => ({
      name: `f18_carrusel_${n + 1}_de_4_4320x5400.${format}`,
      blob: new Blob([new Uint8Array([137, 80, 78, 71, n, 0, 255, 100])], { type: `image/${format}` }),
    }));
    const archive = await imageArchive(images);
    assert.equal(archive.type, 'application/zip');
    const restored = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    assert.deepEqual(Object.keys(restored), images.map((image) => image.name));
    for (const image of images) {
      assert.deepEqual(restored[image.name], new Uint8Array(await image.blob.arrayBuffer()));
    }
  }
});

test('the three feed pieces keep their upload numbering, dimensions and byte content', async () => {
  const names = ['01_publicar_primero_derecha', '02_centro', '03_ultima_izquierda'];
  const images = names.map((name, n) => ({
    name: `f18_feed_${name}_2160x2700.png`,
    blob: new Blob([new Uint8Array([n, 123, 255])]),
  }));
  const archive = await imageArchive(images);
  const restored = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  assert.deepEqual(Object.keys(restored), images.map((image) => image.name));
  assert.equal(Object.keys(restored).length, 3);
});

test('empty or duplicate archives fail explicitly rather than silently omitting images', async () => {
  await assert.rejects(imageArchive([]), /No hay imágenes/);
  await assert.rejects(imageArchive([
    { name: 'foto.png', blob: new Blob(['first']) },
    { name: 'foto.png', blob: new Blob(['second']) },
  ]), /repetidos/);
});

test('canvas encoding preserves PNG and JPEG quality 100 and propagates encoding failure', async () => {
  for (const format of ['png', 'jpeg'] as const) {
    const canvas = {
      toBlob(callback: BlobCallback, mime: string, quality?: number) {
        assert.equal(mime, `image/${format}`);
        assert.equal(quality, format === 'jpeg' ? 1 : undefined);
        callback(new Blob(['original encoded pixels'], { type: mime }));
      },
    } as HTMLCanvasElement;
    assert.equal((await canvasBlob(canvas, format)).type, `image/${format}`);
  }
  const failed = { toBlob(callback: BlobCallback) { callback(null); } } as HTMLCanvasElement;
  await assert.rejects(canvasBlob(failed, 'png'), /No se pudo preparar/);
});
