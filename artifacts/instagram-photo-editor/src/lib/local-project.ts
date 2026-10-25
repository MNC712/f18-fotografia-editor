import { z } from 'zod';
import { blankPhoto, frames, type Photo, type LayoutStyle, type ExportFormat } from './photo-renderer';
import { fonts, palettes, sizes, storyTemplates, type OutputSize, type Presentation } from './presentation';
import { compositionModes, type CompositionMode } from './composition-renderer';
import { MAX_SLOTS } from './carousel-utils';
import { exportResolutions, type ExportResolution } from './export-quality';

export type Crop = { zoom: number; offsetX: number; offsetY: number; rotation: number };
export type ModeCrops = Record<CompositionMode, Crop>;
export type LocalProject = {
  photos: Photo[];
  crops: ModeCrops[];
  handle: string;
  frame: LayoutStyle;
  format: ExportFormat;
  selected: number;
  presentation: Presentation;
  mode: CompositionMode;
  previousSize: OutputSize | null;
  guides: boolean;
  ui: boolean;
  carousel: boolean;
  exportResolution: ExportResolution;
};

const keySchema = <T extends string>(values: Record<T, unknown>) =>
  z.custom<T>((value) => typeof value === 'string' && Object.hasOwn(values, value));
const finite = z.number().finite();
const cropSchema = z.object({
  zoom: finite.min(1).max(4), offsetX: finite, offsetY: finite,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
});
const photoSchema = z.object({
  file: z.instanceof(Blob).nullable(), name: z.string(), lastModified: finite,
  f: z.string(), s: z.string(), iso: z.string(), focal: z.string(), camera: z.string(),
  storyTitle: z.string(), storySubtitle: z.string(), storyEyebrow: z.string(),
  brightness: finite.min(50).max(150), contrast: finite.min(50).max(150), saturation: finite.min(50).max(150),
});
const storedSchema = z.object({
  version: z.literal(1), savedAt: finite,
  photos: z.array(photoSchema).min(3).max(MAX_SLOTS),
  crops: z.array(z.object({ framed: cropSchema, borderless: cropSchema, triptych: cropSchema })).min(3).max(MAX_SLOTS),
  handle: z.string(), frame: keySchema(frames), format: z.enum(['jpeg', 'png']),
  selected: z.number().int().min(0).max(MAX_SLOTS - 1),
  presentation: z.object({
    size: keySchema(sizes), font: keySchema(fonts), palette: keySchema(palettes),
    story: z.object({ template: keySchema(storyTemplates), showMetadata: z.boolean() }),
  }),
  mode: keySchema(compositionModes), previousSize: keySchema(sizes).nullable(),
  guides: z.boolean(), ui: z.boolean(),
  carousel: z.boolean().default(false),
  exportResolution: keySchema(exportResolutions).default('source'),
}).refine((project) => project.photos.length === project.crops.length && project.selected < project.photos.length);

const DATABASE = 'foco-de-campo-local';
const STORE = 'projects';
const KEY = 'current';
const REVISION_KEY = 'revision';
export type LocalProjectState = { revision: number; hasSaved: boolean };
export class LocalProjectConflict extends Error {
  constructor(public state: LocalProjectState) {
    super(state.hasSaved
      ? 'Otra pestaña guardó una versión más reciente. El guardado automático está pausado; tu edición sigue abierta.'
      : 'Otra pestaña eliminó el proyecto local. El guardado automático está pausado para no recrearlo; tu edición sigue abierta.');
  }
}

// Notifications contain no photos or settings. IndexedDB, not this channel,
// provides atomic compare-and-swap even when a tab misses a notification.
const CHANNEL = 'foco-de-campo-project';
export function watchLocalProject(onChange: () => void) {
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(CHANNEL);
  } catch { /* Some browsers restrict channels; focus checks/polling remain available. */ }
  if (channel) channel.onmessage = onChange;
  const visible = () => { if (document.visibilityState === 'visible') onChange(); };
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', visible);
  // Also covers browsers without BroadcastChannel and suspended/missed messages.
  const timer = window.setInterval(visible, 2000);
  return () => {
    channel?.close();
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', visible);
    window.clearInterval(timer);
  };
}
function notifyChange() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('changed');
    channel.close();
  } catch { /* Optional notification: focus checks/polling still detect committed changes. */ }
}
// Serialize saves and deletion so an older write cannot recreate a deleted project.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('Este navegador no permite guardar proyectos locales.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Cierra otras pestañas del editor y vuelve a intentar guardar.'));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

// Both reads belong to one transaction: never pair old photos with a new revision.
async function readSnapshot() {
  const db = await openDatabase();
  try {
    return await new Promise<{ raw: unknown; state: LocalProjectState }>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const project = store.get(KEY);
      const revision = store.get(REVISION_KEY);
      tx.oncomplete = () => resolve({
        raw: project.result,
        state: { revision: revision.result ?? 0, hasSaved: project.result !== undefined },
      });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Se interrumpió la lectura local.'));
    });
  } finally { db.close(); }
}
export async function readLocalProjectState() {
  const db = await openDatabase();
  try {
    return await new Promise<LocalProjectState>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      // Check existence without copying potentially hundreds of MB of photo blobs.
      const project = store.getKey(KEY);
      const revision = store.get(REVISION_KEY);
      tx.oncomplete = () => resolve({ revision: revision.result ?? 0, hasSaved: project.result !== undefined });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Se interrumpió la lectura local.'));
    });
  } finally { db.close(); }
}

async function mutateProject(expectedRevision: number, value?: unknown): Promise<LocalProjectState> {
  const db = await openDatabase();
  try {
    const state = await new Promise<LocalProjectState>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const project = store.getKey(KEY);
      const revision = store.get(REVISION_KEY);
      let conflict: LocalProjectConflict | undefined;
      revision.onsuccess = () => {
        const current = { revision: revision.result ?? 0, hasSaved: project.result !== undefined };
        if (current.revision !== expectedRevision) {
          conflict = new LocalProjectConflict(current);
          tx.abort();
          return;
        }
        if (value === undefined) store.delete(KEY);
        else store.put(value, KEY);
        // Keep this tombstone after deletion, preventing stale tabs from recreating data.
        store.put(current.revision + 1, REVISION_KEY);
      };
      tx.oncomplete = () => resolve({ revision: expectedRevision + 1, hasSaved: value !== undefined });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(conflict ?? tx.error ?? new Error('Se interrumpió el almacenamiento local.'));
    });
    notifyChange();
    return state;
  } finally { db.close(); }
}

export function saveLocalProject(project: LocalProject, expectedRevision: number) {
  // No DOM nodes, data URLs, or temporary object URLs are persisted.
  const stored = {
    ...project, version: 1 as const, savedAt: Date.now(),
    photos: project.photos.map(({ file, image: _image, url: _url, zoom: _zoom, offsetX: _x, offsetY: _y, rotation: _rotation, ...settings }) => ({
      ...settings, file, name: file?.name ?? '', lastModified: file?.lastModified ?? 0,
    })),
  };
  const validated = storedSchema.parse(stored);
  return serialized(async () => {
    const state = await mutateProject(expectedRevision, validated);
    return { ...state, savedAt: validated.savedAt };
  });
}

export const deleteLocalProject = (expectedRevision: number) => serialized(() => mutateProject(expectedRevision));

export async function loadLocalProject(): Promise<LocalProjectState & { project: LocalProject | null; savedAt?: number }> {
  const { raw, state } = await readSnapshot();
  if (raw === undefined) return { ...state, project: null };
  const parsed = storedSchema.safeParse(raw);
  if (!parsed.success) throw new Error('El proyecto guardado es incompatible o está dañado. No se ha sobrescrito; puedes eliminarlo o sustituirlo guardando una nueva edición.');
  const { version: _version, savedAt, photos: storedPhotos, ...settings } = parsed.data;
  const urls: string[] = [];
  try {
    const results = await Promise.allSettled(storedPhotos.map(async ({ file: blob, name, lastModified, ...metadata }): Promise<Photo> => {
      if (!blob) return { ...blankPhoto(), ...metadata };
      const file = new File([blob], name, { type: blob.type, lastModified });
      const url = URL.createObjectURL(file);
      urls.push(url);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`No se pudo recuperar la foto «${name}». El proyecto guardado no se ha modificado.`));
        image.src = url;
      });
      return { ...blankPhoto(), ...metadata, file, image, url };
    }));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    const photos = results.map((result) => (result as PromiseFulfilledResult<Photo>).value);
    // Older local projects had three slots. Add an empty slot without touching their edits.
    while (photos.length < MAX_SLOTS) {
      photos.push(blankPhoto());
      const blank = () => ({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 as const });
      settings.crops.push({ framed: blank(), borderless: blank(), triptych: blank() });
    }
    return { ...state, project: { ...settings, photos }, savedAt };
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}

export function storageError(error: unknown) {
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return 'No hay espacio suficiente. La última copia guardada se conserva. Libera espacio en el navegador o usa fotos más pequeñas y pulsa Guardar ahora.';
  }
  return error instanceof Error && !(error instanceof z.ZodError)
    ? error.message
    : 'No se pudo guardar el proyecto. Comprueba los permisos y el espacio del navegador; la edición sigue abierta.';
}

export async function localSpaceInfo() {
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate?.quota !== undefined) {
      return `Espacio disponible aproximado del sitio: ${Math.max(0, (estimate.quota - (estimate.usage ?? 0)) / 1024 / 1024).toFixed(0)} MB.`;
    }
  } catch { /* An estimate is optional; actual write failures are always reported. */ }
  return 'El espacio disponible depende del navegador; si se agota, te avisaremos.';
}
