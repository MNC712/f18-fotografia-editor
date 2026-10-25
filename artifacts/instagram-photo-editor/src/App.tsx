import { useEffect, useMemo, useRef, useState } from 'react';
import { exportResolutions, exportPlan, renderExport, type ExportResolution } from '@/lib/export-quality';
import { MAX_SLOTS, swapItems } from '@/lib/carousel-utils';
import { canvasBlob, downloadBlob, imageArchive, type ArchiveImage } from '@/lib/download-archive';
import { Aperture, ArrowDownToLine, Check, ChevronLeft, ChevronRight, CircleHelp, Images, ImagePlus, LockKeyhole, Trash2 } from 'lucide-react';
import { blankPhoto, frames, type Photo, type LayoutStyle, type ExportFormat } from '@/lib/photo-renderer';
import { compositionModes, compositionSize, compositionLayout, paintComposition, splitTriptych, type CompositionMode } from '@/lib/composition-renderer';
import { PublicationView, ProfileView } from '@/components/preview-views';
import { StoryView, StoryToggles } from '@/components/story-overlay';
import { CropPreview } from '@/components/crop-preview';
import { sizes, fonts, palettes, defaultPresentation, type Presentation, type OutputSize, type FontStyle, type ColorPalette, type StoryTemplate, storyTemplates } from '@/lib/presentation';
import { type Crop, type LocalProject } from '@/lib/local-project';
import { useLocalProject } from '@/lib/use-local-project';

const blankCrop = (): Crop => ({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 });
const blankCrops = (): Record<CompositionMode, Crop> => ({ framed: blankCrop(), borderless: blankCrop(), triptych: blankCrop() });
const modeKeys = Object.keys(compositionModes) as CompositionMode[];
const tileFiles = ['03_ultima_izquierda', '02_centro', '01_publicar_primero_derecha'];

async function loadPresentationFont(font: FontStyle) {
  const families = font === 'original'
    ? ['"DM Sans"', '"DM Mono"', '"Playfair Display"', '"Montserrat"']
    : [fonts[font].family];
  try {
    await Promise.all(families.flatMap((family) => [400, 600].map((weight) => document.fonts.load(`${weight} 30px ${family}`, 'Aa 123 f/1.8'))));
    await document.fonts.ready;
  } catch { /* Si no hay conexión, se utiliza la fuente alternativa del mismo estilo. */ }
}
const Level = ({ kind }: { kind: 'basic' | 'mid' | 'adv' }) => <span className={`level level-${kind}`}>{kind === 'basic' ? 'Básico' : kind === 'mid' ? 'Intermedio' : 'Avanzado'}</span>;
const names = ['Foto 1', 'Foto 2', 'Foto 3', 'Foto 4'];
const posNames = ['izquierda', 'centro', 'derecha', 'cuarta'];
const readImage = (file: File) => new Promise<{ image: HTMLImageElement; url: string }>((resolve, reject) => {
  const url = URL.createObjectURL(file); const image = new Image();
  image.onload = () => resolve({ image, url });
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')); };
  image.src = url;
});

async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string, format: ExportFormat) {
  downloadBlob(await canvasBlob(canvas, format), fileName);
}

async function readJpegExif(file: File): Promise<Record<string, unknown> | undefined> {
  if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') return undefined;
  const bytes = new DataView(await file.arrayBuffer());
  if (bytes.byteLength < 4 || bytes.getUint16(0) !== 0xffd8) return undefined;
  let marker = 2, tiff = -1, little = false;
  while (marker + 4 < bytes.byteLength) {
    if (bytes.getUint8(marker) !== 0xff) break;
    const kind = bytes.getUint8(marker + 1), length = bytes.getUint16(marker + 2);
    if (length < 2 || marker + 2 + length > bytes.byteLength) break;
    if (kind === 0xe1 && length > 8 && bytes.getUint32(marker + 4) === 0x45786966 && bytes.getUint16(marker + 8) === 0) { tiff = marker + 10; break; }
    if (kind === 0xda || kind === 0xd9) break;
    marker += length + 2;
  }
  if (tiff < 0 || tiff + 8 > bytes.byteLength) return undefined;
  const endian = bytes.getUint16(tiff);
  if (endian !== 0x4949 && endian !== 0x4d4d) return undefined;
  little = endian === 0x4949;
  if (bytes.getUint16(tiff + 2, little) !== 42) return undefined;
  const safe16 = (offset: number) => offset >= 0 && offset + 2 <= bytes.byteLength ? bytes.getUint16(offset, little) : 0;
  const safe32 = (offset: number) => offset >= 0 && offset + 4 <= bytes.byteLength ? bytes.getUint32(offset, little) : 0;
  const readIfd = (offset: number) => {
    const found: Record<number, unknown> = {};
    const count = Math.min(safe16(offset), 256);
    for (let n = 0; n < count; n++) {
      const entry = offset + 2 + n * 12;
      if (entry + 12 > bytes.byteLength) break;
      const tag = safe16(entry), type = safe16(entry + 2), amount = safe32(entry + 4);
      const unit = type === 2 || type === 7 ? 1 : type === 3 ? 2 : type === 4 || type === 9 ? 4 : type === 5 || type === 10 ? 8 : 0;
      if (!unit || amount < 1 || amount > 10000) continue;
      const byteLength = amount * unit;
      const valueOffset = byteLength <= 4 ? entry + 8 : tiff + safe32(entry + 8);
      if (valueOffset < tiff || valueOffset + byteLength > bytes.byteLength) continue;
      if (type === 2) {
        let text = '';
        for (let j = 0; j < amount && bytes.getUint8(valueOffset + j); j++) text += String.fromCharCode(bytes.getUint8(valueOffset + j));
        found[tag] = text.trim();
      } else if (type === 5 || type === 10) {
        const numerator = type === 10 ? bytes.getInt32(valueOffset, little) : safe32(valueOffset);
        const denominator = type === 10 ? bytes.getInt32(valueOffset + 4, little) : safe32(valueOffset + 4);
        if (denominator) found[tag] = numerator / denominator;
      } else if (type === 3) found[tag] = safe16(valueOffset);
      else if (type === 4 || type === 9) found[tag] = safe32(valueOffset);
    }
    return found;
  };
  const ifd0 = readIfd(tiff + safe32(tiff + 4));
  const exifPointer = Number(ifd0[0x8769] ?? 0);
  const exif = exifPointer ? readIfd(tiff + exifPointer) : {};
  const result: Record<string, unknown> = {};
  if (ifd0[0x0110]) result.Model = ifd0[0x0110];
  if (exif[0x829d]) result.FNumber = exif[0x829d];
  if (exif[0x829a]) result.ExposureTime = exif[0x829a];
  if (exif[0x8827]) result.ISO = exif[0x8827];
  if (exif[0x920a]) result.FocalLength = exif[0x920a];
  if (exif[0xa434]) result.LensModel = exif[0xa434];
  return Object.keys(result).length ? result : undefined;
}

function App() {
  const [photos, setPhotos] = useState<Photo[]>(() => Array.from({ length: MAX_SLOTS }, () => blankPhoto()));
  const [handle, setHandle] = useState('@f18.fotografia');
  const [frame, setFrame] = useState<LayoutStyle>('fullwidth');
  const [format, setFormat] = useState<ExportFormat>('png');
  const [exportResolution, setExportResolution] = useState<ExportResolution>('source');
  const [carousel, setCarousel] = useState(false);
  const multiRef = useRef<HTMLInputElement | null>(null);
  const uploading = useRef(false);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('success');
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [presentation, setPresentation] = useState<Presentation>(defaultPresentation);
  const [mode, setMode] = useState<CompositionMode>('framed');
  const [tab, setTab] = useState<'crop' | 'post' | 'profile'>('crop');
  const [pubTile, setPubTile] = useState(0);
  const [crops, setCrops] = useState<Record<CompositionMode, Crop>[]>(() => Array.from({ length: MAX_SLOTS }, () => blankCrops()));
  const [guides, setGuides] = useState(true);
  const [ui, setUi] = useState(true);
  const [previousSize, setPreviousSize] = useState<OutputSize | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const project = useMemo<LocalProject>(() => ({
    photos, crops, handle, frame, format, selected, presentation, mode, previousSize, guides, ui, carousel, exportResolution,
  }), [photos, crops, handle, frame, format, selected, presentation, mode, previousSize, guides, ui, carousel, exportResolution]);
  const local = useLocalProject(project, (restored) => {
    setPhotos(restored.photos); setCrops(restored.crops); setHandle(restored.handle);
    setFrame(restored.frame); setFormat(restored.format); setSelected(restored.selected);
    setPresentation(restored.presentation); setMode(restored.mode); setPreviousSize(restored.previousSize);
    setGuides(restored.guides); setUi(restored.ui); setCarousel(restored.carousel);
    setExportResolution(restored.exportResolution);
    void loadPresentationFont(restored.presentation.font).then(() => setFontsReady((v) => !v));
  });
  const feed = mode === 'triptych';
  const isStory = mode !== 'triptych' && presentation.size === 'story';
  const richStory = isStory && mode === 'framed';
  const viewTab = isStory && tab === 'profile' ? 'crop' : tab;
  const effSize = compositionSize(mode, presentation.size);
  const outSize = sizes[effSize];
  const layout = compositionLayout(mode, frame, presentation.size, presentation.story);
  const sizeLabel = `${outSize.width} × ${outSize.height}`;
  const fullLabel = feed ? `${layout.width} × ${layout.height} (panorama) · ${sizeLabel} por publicación` : sizeLabel;
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const merge = (index: number): Photo => ({ ...photos[index], ...crops[index][mode] });
  const loadedIdx = photos.map((p, i) => (p.image ? i : -1)).filter((i) => i >= 0);
  const carouselOn = carousel && !feed && !isStory;
  const planOf = (ids: number[], res: ExportResolution) => exportPlan(ids.map(merge), frame, presentation, mode, res);
  const planIds = carouselOn ? loadedIdx : [selected];
  const plan = planOf(planIds, exportResolution);
  const finalLabel = `${feed ? plan.tileWidth : plan.width} × ${plan.height}`;
  const photo = useMemo(() => ({ ...photos[selected], ...crops[selected][mode] }), [photos, crops, selected, mode]);
  const canvas = useMemo(() => paintComposition(selected, photo, handle, frame, presentation, mode), [selected, photo, handle, frame, presentation, mode, fontsReady]);
  const tiles = useMemo(() => (feed && photo.image ? splitTriptych(canvas) : null), [feed, canvas, photo.image]);
  const profileCanvases = useMemo(() => {
    if (viewTab !== 'crop' && !feed && !isStory) return [0, 1, 2, 3].map((i) => photos[i].image ? paintComposition(i, { ...photos[i], ...crops[i][mode] }, handle, frame, presentation, mode) : null);
    return [] as (HTMLCanvasElement | null)[];
  }, [tab, feed, photos, crops, mode, handle, frame, presentation, fontsReady]);
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const changeStory = (patch: Partial<Presentation['story']>) => setPresentation((c) => ({ ...c, story: { ...c.story, ...patch } }));
  const changePresentation = (patch: Partial<Presentation>) => {
    setPresentation((current) => ({ ...current, ...patch }));
    if (patch.font) void loadPresentationFont(patch.font).then(() => setFontsReady((v) => !v));
  };
  const changeMode = (next: CompositionMode) => {
    if (next === mode) return;
    if (next === 'triptych') { setPreviousSize(presentation.size); setPresentation((c) => ({ ...c, size: 'tall' })); }
    else if (mode === 'triptych' && previousSize) { setPreviousSize(null); setPresentation((c) => ({ ...c, size: previousSize })); }
    setMode(next); setMessage('');
  };
  const updateCrop = (patch: Partial<Photo>) => {
    const { zoom, offsetX, offsetY, rotation } = patch;
    setCrops((cur) => cur.map((set, i) => i === selected ? { ...set, [mode]: { ...set[mode], ...(zoom !== undefined && { zoom }), ...(offsetX !== undefined && { offsetX }), ...(offsetY !== undefined && { offsetY }), ...(rotation !== undefined && { rotation }) } } : set));
  };
  const resetCrops = (index: number) => setCrops((cur) => cur.map((set, i) => i === index ? blankCrops() : set));
  const shown: (HTMLCanvasElement | null)[] = feed ? (tiles ?? [null, null, null]) : profileCanvases.length ? profileCanvases : Array.from({ length: MAX_SLOTS }, () => null);
  const completeCount = photos.filter((item) => item.image).length;

  useEffect(() => { void loadPresentationFont('original').then(() => setFontsReady(true)); }, []);
  useEffect(() => () => photosRef.current.forEach((item) => { if (item.url) URL.revokeObjectURL(item.url); }), []);

  const updatePhoto = (index: number, patch: Partial<Photo>) => {
    setPhotos((current) => current.map((item, idx) => idx === index ? { ...item, ...patch } : item));
    setMessage('');
  };

  const loadExif = async (file: File) => {
    const exifr = (window as Window & { exifr?: { parse?: (file: File, tags: string[]) => Promise<Record<string, unknown> | undefined> } }).exifr;
    try {
      const data = exifr?.parse
        ? await exifr.parse(file, ['FNumber', 'ExposureTime', 'ISO', 'FocalLength', 'Model', 'LensModel'])
        : await readJpegExif(file);
      if (!data) return;
      // Se localiza la foto por su archivo: sigue funcionando si se reordenan las posiciones.
      setPhotos((current) => current.map((item) => {
        if (item.file !== file) return item;
        const exposure = Number(data.ExposureTime);
        return {
          ...item,
          f: data.FNumber ? String(data.FNumber) : item.f,
          s: exposure ? (exposure < 1 ? `1/${Math.round(1 / exposure)}` : String(exposure)) : item.s,
          iso: data.ISO ? String(data.ISO) : item.iso,
          focal: data.FocalLength ? String(Math.round(Number(data.FocalLength))) : item.focal,
          camera: [data.Model, data.LensModel].filter(Boolean).join(' · ') || item.camera,
        };
      }));
    } catch { /* Los metadatos son opcionales; la foto permanece disponible. */ }
  };

  const validateFile = (file: File) => !file.type.startsWith('image/') ? `«${file.name}» no es una imagen válida.` : file.size > 100 * 1024 * 1024 ? `«${file.name}» supera el límite de 100 MB.` : null;

  const install = (index: number, file: File, loaded: { image: HTMLImageElement; url: string }) => {
    setPhotos((current) => current.map((item, idx) => {
      if (idx !== index) return item;
      if (item.url) URL.revokeObjectURL(item.url);
      return { ...item, file, image: loaded.image, url: loaded.url, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
    }));
    resetCrops(index);
    void loadExif(file);
  };

  const onFile = async (index: number, file?: File) => {
    if (!file) return;
    if (uploading.current || busy) { setMessage('Espera a que termine la operación actual antes de cargar otra imagen.'); return; }
    const problem = validateFile(file);
    if (problem) { setMessage(problem); setMessageKind('error'); return; }
    uploading.current = true; setBusy(true);
    try {
      install(index, file, await readImage(file));
      setSelected(index);
      setMessage(`${file.name} está lista para editar.`); setMessageKind('success');
    } catch { setMessage('No se pudo abrir esta imagen. Prueba con otro archivo.'); setMessageKind('error'); }
    finally { uploading.current = false; setBusy(false); }
  };

  const onFiles = async (list: FileList | null) => {
    if (uploading.current || busy) { setMessage('Espera a que termine la operación actual antes de cargar más imágenes.'); return; }
    const files = Array.from(list ?? []);
    if (multiRef.current) multiRef.current.value = '';
    if (!files.length) return;
    const empty = photos.map((item, i) => (item.image ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length) { setMessage('Las 4 posiciones están ocupadas. Retira una foto o reemplázala de forma individual.'); setMessageKind('error'); return; }
    uploading.current = true; setBusy(true);
    try {
    const accepted = files.slice(0, empty.length);
    const excess = files.length - accepted.length;
    const failed: string[] = [];
    let first = -1, ok = 0;
    for (let n = 0; n < accepted.length; n++) {
      const problem = validateFile(accepted[n]);
      if (problem) { failed.push(problem); continue; }
      try { install(empty[n], accepted[n], await readImage(accepted[n])); if (first < 0) first = empty[n]; ok++; }
      catch { failed.push(`No se pudo abrir «${accepted[n].name}».`); }
    }
    if (first >= 0) setSelected(first);
    const parts = [`${ok} ${ok === 1 ? 'foto cargada' : 'fotos cargadas'} en las posiciones libres.`];
    if (excess > 0) parts.push(`${excess} ${excess === 1 ? 'archivo sobrante no se cargó' : 'archivos sobrantes no se cargaron'}: el máximo es 4 fotos.`);
    parts.push(...failed);
    setMessage(parts.join(' ')); setMessageKind(excess > 0 || failed.length ? 'error' : 'success');
    } finally { uploading.current = false; setBusy(false); }
  };

  const removePhoto = (index: number) => {
    if (uploading.current || busy) return;
    setPhotos((current) => current.map((item, idx) => {
      if (idx !== index) return item;
      if (item.url) URL.revokeObjectURL(item.url);
      return blankPhoto();
    }));
    resetCrops(index);
    if (fileRefs.current[index]) fileRefs.current[index]!.value = '';
    setSelected(index);
    setMessage('La foto se ha retirado.');
    setMessageKind('success');
  };

  const moveSelected = (dir: -1 | 1) => {
    if (uploading.current || busy) return;
    const to = selected + dir;
    if (to < 0 || to >= MAX_SLOTS) return;
    setPhotos((cur) => swapItems(cur, selected, to));
    setCrops((cur) => swapItems(cur, selected, to));
    setSelected(to);
    setMessage(`La foto ${selected + 1} pasa a la posición ${to + 1}.`); setMessageKind('success');
  };

  const resNote = (p: { width: number; height: number }) => `${p.width} × ${p.height} px en ${format === 'jpeg' ? 'JPEG calidad 100 (con pérdida)' : 'PNG sin pérdida'}`;
  const nameFor = (index: number, order: number) => carouselOn ? `f18_carrusel_${order + 1}_de_${loadedIdx.length}` : isStory ? `f18_historia_${index + 1}${mode === 'borderless' ? '_sin_marco' : ''}` : `f18_${index + 1}_${posNames[index]}${mode === 'borderless' ? '_sin_marco' : ''}`;
  const renderSlot = async (index: number, scale: number) => {
    await loadPresentationFont(presentation.font);
    return renderExport(index, merge(index), handle, frame, presentation, mode, scale);
  };

  const saveOne = async (index: number) => {
    if (!photos[index].image) { setMessage(`Añade una imagen a «${names[index]}» antes de descargar.`); setMessageKind('error'); return; }
    setBusy(true); setMessage('');
    try {
      const p = carouselOn ? planOf(loadedIdx, exportResolution) : planOf([index], exportResolution);
      const output = await renderSlot(index, p.scale);
      await downloadCanvas(output, `${nameFor(index, loadedIdx.indexOf(index))}_${output.width}x${output.height}.${ext}`, format);
      setMessage(`Foto ${index + 1} descargada: ${resNote(output)}. Instagram puede recomprimir al publicar.`);
      setMessageKind('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo descargar la imagen.');
      setMessageKind('error');
    } finally { setBusy(false); }
  };

  const saveAll = async () => {
    const min = carouselOn ? 2 : 1;
    if (loadedIdx.length < min) { setMessage(carouselOn ? 'Un carrusel necesita al menos 2 fotos.' : 'Añade al menos una foto para descargar.'); setMessageKind('error'); return; }
    setBusy(true); setMessage('Preparando todas las imágenes en un ZIP…'); setMessageKind('success');
    try {
      const p = planOf(loadedIdx, exportResolution);
      let last = { width: p.width, height: p.height };
      const images: ArchiveImage[] = [];
      for (let n = 0; n < loadedIdx.length; n++) {
        setMessage(`Preparando imagen ${n + 1} de ${loadedIdx.length} para el ZIP…`);
        const index = loadedIdx[n];
        const output = await renderSlot(index, p.scale);
        last = { width: output.width, height: output.height };
        try {
          images.push({ name: `${nameFor(index, n)}_${output.width}x${output.height}.${ext}`, blob: await canvasBlob(output, format) });
        } finally { output.width = 0; output.height = 0; }
      }
      setMessage('Creando el archivo ZIP…');
      const archive = await imageArchive(images);
      downloadBlob(archive, `f18_${carouselOn ? 'carrusel' : isStory ? 'historias' : 'fotos'}_${images.length}_${last.width}x${last.height}.zip`);
      setMessage(`ZIP preparado con ${images.length} ${carouselOn ? 'diapositivas' : isStory ? 'historias' : 'fotos'}: ${resNote(last)}. Descomprímelo para subir las imágenes a Instagram.`);
      setMessageKind('success');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el ZIP. Intenta una resolución menor; tus fotos y ajustes se conservan.'); setMessageKind('error'); }
    finally { setBusy(false); }
  };

  const buildTiles = async () => {
    await loadPresentationFont(presentation.font);
    // Un único panorama de alta resolución, dividido después en tres piezas.
    return splitTriptych(renderExport(selected, merge(selected), handle, frame, presentation, mode, plan.scale));
  };
  const tileFile = (n: number, t: HTMLCanvasElement) => `f18_feed_${tileFiles[n]}_${t.width}x${t.height}.${ext}`;

  const saveTile = async (n: number) => {
    if (!photos[selected].image) { setMessage('Añade la foto de origen para generar las publicaciones.'); setMessageKind('error'); return; }
    setBusy(true); setMessage('');
    try {
      const t = (await buildTiles())[n];
      await downloadCanvas(t, tileFile(n, t), format);
      setMessage(`Publicación ${['izquierda', 'centro', 'derecha'][n]} descargada: ${resNote(t)}.`); setMessageKind('success');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo descargar.'); setMessageKind('error'); }
    finally { setBusy(false); }
  };
  const saveTiles = async () => {
    if (!photos[selected].image) { setMessage('Añade la foto de origen para generar las publicaciones.'); setMessageKind('error'); return; }
    setBusy(true); setMessage('Preparando las tres publicaciones en orden de subida…'); setMessageKind('success');
    try {
      const all = await buildTiles();
      const images: ArchiveImage[] = [];
      for (const n of [2, 1, 0]) {
        images.push({ name: tileFile(n, all[n]), blob: await canvasBlob(all[n], format) });
      }
      downloadBlob(await imageArchive(images), `f18_feed_3x1_${all[0].width}x${all[0].height}.zip`);
      setMessage(`ZIP preparado con las tres publicaciones de ${resNote(all[0])}. Descomprímelo y súbelas por número: 01 derecha, 02 centro, 03 izquierda.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear el ZIP. Intenta una resolución menor.'); setMessageKind('error'); }
    finally { setBusy(false); }
  };

  const rangeControl = (label: string, key: 'brightness' | 'contrast' | 'saturation') => (
    <label className="field" key={key}>
      <span>{label}</span>
      <div className="range-row">
        <input type="range" min="50" max="150" value={photo[key]} aria-label={label} onChange={(event) => updatePhoto(selected, { [key]: Number(event.target.value) })} />
        <output className="range-value">{photo[key]}%</output>
      </div>
    </label>
  );

  if (!local.ready) return <main className="main"><p role="status">Recuperando proyecto de este dispositivo…</p></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Foco, inicio">
          <span className="brand-mark">f/</span><span className="brand-name">foco de campo</span>
        </a>
        <span className="top-meta">Laboratorio de carruseles · edición local</span>
      </header>
      <main className="main">
        <section className="intro">
          <div>
            <div className="eyebrow">Edición para publicación</div>
            <h1>{feed ? 'Una foto. Tres publicaciones.' : carouselOn ? 'Cuatro fotos. Una publicación.' : mode === 'borderless' ? 'Tu fotografía. Sin límites visuales.' : 'Tu fotografía. Con todo su detalle.'}</h1>
            <p>Recorta sin marco, prepara una fotografía de autor o crea una portada continua para tu perfil. Todo se procesa en este dispositivo.</p>
          </div>
          <div className="private-note"><LockKeyhole size={15} strokeWidth={1.8} /> Tus imágenes no se suben a ningún servidor</div>
        </section>

        <section className="panel panel-pad local-project" aria-label="Proyecto en este dispositivo">
          <div className="panel-heading"><h2>Proyecto en este dispositivo</h2><span className="step-label">Sin cuenta · sin subidas</span></div>
          <p className={`local-status ${local.error ? 'local-error' : ''}`} role="status" data-testid="text-local-status">{local.status}</p>
          <div className="local-actions">
            <button type="button" className="btn btn-secondary" data-testid="button-save-project" disabled={!local.ready || local.working} onClick={() => void local.saveNow()}>{local.working ? 'Procesando…' : 'Guardar ahora'}</button>
            <button type="button" className="btn btn-secondary" data-testid="button-delete-project" disabled={!local.ready || local.working || (!local.hasSaved && !local.error)} onClick={() => void local.remove()}><Trash2 size={14} /> Eliminar proyecto guardado</button>
            {local.conflicted && <button type="button" className="btn btn-secondary" data-testid="button-reload-project" disabled={local.working} onClick={local.reloadSaved}>Cargar versión guardada</button>}
          </div>
          <p className="small-note">Se guarda automáticamente un solo proyecto, con sus fotos originales, textos y ajustes. Se recupera al abrir este editor en el mismo navegador y dispositivo. Hasta 100 MB por foto ({MAX_SLOTS} fotos). {local.space} No es una copia de seguridad: borrar los datos del sitio, usar navegación privada o la limpieza automática del navegador puede eliminarlo.</p>
        </section>

        <section className="mode-bar" aria-label="Modo de composición">
          <div className="mode-options" role="group">
            {modeKeys.map((key) => <button key={key} type="button" className={`mode-choice ${mode === key ? 'active' : ''}`} aria-pressed={mode === key} data-testid={`button-mode-${key}`} onClick={() => changeMode(key)}>
              <span className={`mode-glyph mode-glyph-${key}`}><i /><i /><i /></span>
              <strong>{compositionModes[key].name}</strong><small>{compositionModes[key].description}</small>
            </button>)}
          </div>
          {feed && <p className="mode-explain" data-testid="text-feed-explain"><strong>Una sola fotografía.</strong> Elige cuál usar en el selector de fotos: se recorta como panorama y se divide en tres publicaciones separadas de {finalLabel} px cada una (no es un carrusel). Solo hace falta una foto.</p>}
          {mode === 'borderless' && <p className="mode-explain">Salida de borde a borde: sin marco, sin texto y sin ficha técnica.</p>}
          {!feed && !isStory && <div className="delivery-switch"><div className="segmented" role="group" aria-label="Tipo de entrega"><button type="button" className={!carousel ? 'active' : ''} aria-pressed={!carousel} data-testid="button-delivery-individual" onClick={() => setCarousel(false)}>Individual</button><button type="button" className={carousel ? 'active' : ''} aria-pressed={carousel} data-testid="button-delivery-carousel" onClick={() => setCarousel(true)}>Carrusel</button></div><p className="mode-explain" data-testid="text-delivery-explain">{carousel ? <><strong>Carrusel:</strong> de 2 a 4 fotos en una sola publicación de Instagram, en orden 1 a 4. Puedes reordenarlas.</> : <><strong>Individual:</strong> cada foto es una publicación independiente.</>} El Feed 3×1 son 3 publicaciones separadas a partir de 1 foto.</p></div>}
        </section>

        <div className="workspace">
          <div className="left-column">
            <section className="panel panel-pad">
              <div className="panel-heading"><h2>{feed ? '1. Fotografía de origen' : '1. Fotografías y firma'}</h2><span className="step-label">{feed ? photo.image ? 'Origen listo' : 'Añade una foto' : `${completeCount} de 4 listas`}</span></div>
              <label className="field signature-field"><span>{mode === 'framed' ? 'Usuario de Instagram · firma debajo de la foto' : 'Usuario de Instagram · solo para la vista previa'}</span><input className="control" data-testid="input-instagram-handle" value={handle} maxLength={40} placeholder="@tu_usuario" onChange={(event) => setHandle(event.target.value)} /></label>
              <div className="multi-upload"><input ref={multiRef} className="file-input" type="file" accept="image/*" multiple data-testid="input-multi-upload" onChange={(event) => void onFiles(event.target.files)} /><button type="button" className="btn btn-secondary" data-testid="button-multi-upload" onClick={() => multiRef.current?.click()}><Images size={14} /> Subir varias fotos (hasta 4)</button><span>Rellena solo las posiciones libres; no reemplaza las existentes.</span></div>
              <div className="photo-selector" role="group" aria-label="Elegir fotografía para editar">
                {photos.map((item, index) => <button key={index} type="button" className={`photo-select ${selected === index ? 'active' : ''}`} data-testid={`button-select-photo-${index}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
                  <span>Foto {index + 1}</span><small>{item.image ? 'Lista para editar' : 'Añadir fotografía'}</small>{item.image && <Check size={13} />}
                </button>)}
              </div>
              <div className="photo-list">
                {photos.map((item, index) => selected === index ? (
                  <article className="photo-card is-selected" key={index} data-testid={`panel-photo-${index}`}>
                    <input ref={(node) => { fileRefs.current[index] = node; }} className="file-input" type="file" accept="image/*" aria-label={`Elegir ${names[index]}`} onChange={(event) => { void onFile(index, event.target.files?.[0]); event.target.value = ''; }} />
                    <div className="upload-tile" role="button" tabIndex={0} aria-label={item.image ? `Cambiar ${names[index]}` : `Elegir ${names[index]}`} onClick={(event) => { event.stopPropagation(); fileRefs.current[index]?.click(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileRefs.current[index]?.click(); } }}>
                      {item.url ? <><img src={item.url} alt={`Miniatura de ${names[index]}`} /><span className="upload-overlay">Cambiar imagen</span></> : <div className="upload-empty"><ImagePlus size={20} strokeWidth={1.5} /><strong>Añadir imagen</strong><span>JPG, PNG, WebP<br />Máximo 100 MB</span></div>}
                    </div>
                    <div className="photo-fields">
                      <div className="photo-title-row"><div className="photo-title">{names[index]}</div>{item.image && <button type="button" className="remove-button" aria-label={`Retirar ${names[index]}`} title="Retirar imagen" onClick={(event) => { event.stopPropagation(); removePhoto(index); }}><Trash2 size={15} /></button>}</div>
                      {carouselOn && item.image && <div className="reorder-row" data-testid="panel-reorder"><span>Posición {index + 1} de {MAX_SLOTS}</span><button type="button" aria-label="Mover antes" data-testid="button-move-left" disabled={index === 0} onClick={() => moveSelected(-1)}><ChevronLeft size={15} /></button><button type="button" aria-label="Mover después" data-testid="button-move-right" disabled={index === MAX_SLOTS - 1} onClick={() => moveSelected(1)}><ChevronRight size={15} /></button></div>}
                      {mode !== 'framed' && <p className="small-note">{feed ? 'Esta es la foto de origen del Feed 3×1.' : 'En este modo no se imprime ficha técnica.'} Los datos EXIF se conservan para el modo con marco.</p>}
                      {richStory && <div className="story-fields" data-testid="panel-story-text">
                        <label className="field"><span>Antetítulo · opcional</span><input className="control" maxLength={40} value={item.storyEyebrow} placeholder="Serie · lugar · año" onChange={(e) => updatePhoto(index, { storyEyebrow: e.target.value })} /></label>
                        <label className="field"><span>Título</span><input className="control" maxLength={60} value={item.storyTitle} placeholder="Título de la historia" data-testid="input-story-title" onChange={(e) => updatePhoto(index, { storyTitle: e.target.value })} /></label>
                        <label className="field"><span>Subtítulo · opcional</span><input className="control" maxLength={110} value={item.storySubtitle} placeholder="Una línea de contexto" onChange={(e) => updatePhoto(index, { storySubtitle: e.target.value })} /></label>
                      </div>}
                      {mode === 'framed' && <><div className="meta-grid">
                        <label className="field"><span>Apertura</span><input className="control" value={item.f} placeholder="f/1.8" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { f: e.target.value })} /></label>
                        <label className="field"><span>Obturador</span><input className="control" value={item.s} placeholder="1/1000" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { s: e.target.value })} /></label>
                        <label className="field"><span>ISO</span><input className="control" inputMode="numeric" value={item.iso} placeholder="1600" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { iso: e.target.value })} /></label>
                        <label className="field"><span>Focal (mm)</span><input className="control" inputMode="decimal" value={item.focal} placeholder="85" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { focal: e.target.value })} /></label>
                      </div>
                      <label className="field camera-field"><span>Cámara y lente · opcional</span><input className="control" value={item.camera} placeholder="Sony A7 IV · 85 mm f/1.8" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { camera: e.target.value })} /></label></>}
                      <div className="photo-status">{item.file ? <span className="tag"><Check size={11} /> Imagen lista</span> : <span>Los datos EXIF se rellenan cuando están disponibles</span>}{item.file && <span>{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>}</div>
                    </div>
                  </article>
                ) : null)}
              </div>
              <p className="small-note">{mode === 'framed' ? 'La lectura EXIF se realiza en tu navegador cuando el archivo incluye esos datos; también puedes editar cada campo manualmente.' : feed ? 'Solo se utiliza la foto seleccionada. La división se realiza después de ajustar el panorama completo.' : 'Este modo exporta solo la imagen. Tus datos técnicos y diseños se conservan para el modo Con marco.'}</p>
            </section>

            <section className="panel panel-pad">
              <div className="panel-heading"><h2>2. Presentación</h2><span className="step-label">{feed ? '3 piezas conectadas' : 'Para todas las fotos'}</span></div>
              <p className="small-note level-note">Las etiquetas indican la complejidad del control, no la calidad del archivo.</p>
              <div className="edit-grid">
                {mode === 'framed' && !richStory && <div className="field frame-field"><span>Marco · {Object.keys(frames).length} estilos <Level kind="basic" /></span><div className="frame-grid">
                  {(Object.keys(frames) as LayoutStyle[]).map((style) => <button type="button" key={style} className={`frame-choice ${frame === style ? 'active' : ''}`} aria-pressed={frame === style} data-testid={`button-frame-${style}`} onClick={() => setFrame(style)}>
                    <span className={`frame-swatch frame-swatch-${style}`} style={{ background: frames[style].background, color: frames[style].text }}><span /></span>
                    <strong>{frames[style].name}</strong><small>{frames[style].description}</small>
                  </button>)}
                </div><p className="small-note">El estilo se aplica a todas las fotos; el zoom y la posición se ajustan por separado.</p></div>}
                <div className="field frame-field"><span>Tamaño de salida <Level kind="basic" /></span><div className="size-grid">
                  {(Object.keys(sizes) as OutputSize[]).filter((key) => !feed || (key !== 'story' && key !== 'landscape')).map((key) => <button type="button" key={key} className={`size-choice ${presentation.size === key ? 'active' : ''}`} aria-pressed={presentation.size === key} data-testid={`button-size-${key}`} onClick={() => changePresentation({ size: key })}>
                    <span className="size-shape" style={{ aspectRatio: `${sizes[key].width}/${sizes[key].height}` }} /><strong>{sizes[key].ratio}</strong><small>{sizes[key].width} × {sizes[key].height}</small>
                  </button>)}
                </div><p className="small-note" data-testid="text-size-note"><strong>{outSize.name} · {outSize.ratio}:</strong> {outSize.note}.</p></div>
                {richStory && <div className="field frame-field"><span>Plantilla de historia <Level kind="basic" /></span><div className="story-template-grid">
                  {(Object.keys(storyTemplates) as StoryTemplate[]).map((key) => <button type="button" key={key} className={`frame-choice ${presentation.story.template === key ? 'active' : ''}`} aria-pressed={presentation.story.template === key} data-testid={`button-story-template-${key}`} onClick={() => changeStory({ template: key })}>
                    <span className={`story-swatch story-swatch-${key}`}><i /><i /><i /></span><strong>{storyTemplates[key].name}</strong><small>{storyTemplates[key].description}</small>
                  </button>)}
                </div><label className="check-row"><input type="checkbox" checked={presentation.story.showMetadata} data-testid="checkbox-story-metadata" onChange={(e) => changeStory({ showMetadata: e.target.checked })} /> Mostrar ficha técnica en la historia</label></div>}
                {mode === 'framed' && <><div className="field frame-field"><span>Tipografía <Level kind="mid" /></span><div className="font-grid">
                  {(Object.keys(fonts) as FontStyle[]).map((key) => <button type="button" key={key} className={`font-choice ${presentation.font === key ? 'active' : ''}`} aria-pressed={presentation.font === key} data-testid={`button-font-${key}`} onClick={() => changePresentation({ font: key })}>
                    <span className="font-sample" style={{ fontFamily: fonts[key].family || undefined }}>Aa 1/1000</span><strong>{fonts[key].name}</strong><small>{fonts[key].description}</small>
                  </button>)}
                </div></div>
                <div className="field frame-field"><span>Paleta <Level kind="mid" /></span><div className="palette-grid">
                  {(Object.keys(palettes) as ColorPalette[]).map((key) => <button type="button" key={key} className={`palette-choice ${presentation.palette === key ? 'active' : ''}`} aria-pressed={presentation.palette === key} data-testid={`button-palette-${key}`} onClick={() => changePresentation({ palette: key })}>
                    <span className={`palette-dot palette-${key}`} /><span><strong>{palettes[key].name}</strong><small>{palettes[key].description}</small></span>
                  </button>)}
                </div></div></>}
              </div>
              <details className="image-adjustments"><summary data-testid="toggle-image-adjustments">Ajustes de luz y color · foto {selected + 1} <Level kind="adv" /></summary><div className="edit-grid">
                {rangeControl('Luminosidad', 'brightness')}
                {rangeControl('Contraste', 'contrast')}
                {rangeControl('Saturación', 'saturation')}
              </div></details>
            </section>
          </div>

          <aside className="right-column">
            <section className="panel preview-panel">
              <div className="preview-title"><div><h2>3. Encuadre y descarga</h2><p>{feed ? `Foto de origen ${selected + 1}` : isStory ? `Historia ${selected + 1}` : `Foto ${selected + 1}`} · {richStory ? storyTemplates[presentation.story.template].name : mode === 'framed' ? frames[frame].name : compositionModes[mode].name}</p></div><span className="dimension-pill" data-testid="text-dimensions">{finalLabel} px{feed ? ' por pieza' : ''}</span></div>
              {feed && <p className="small-note">Vista previa base: {fullLabel}. Las guías de corte no aparecen en la descarga.</p>}
              <div className="view-tabs" style={isStory ? { gridTemplateColumns: '1fr 1fr' } : undefined} role="tablist">
                {(isStory ? [['crop', 'Encuadre'], ['post', 'Vista de historia']] as const : [['crop', 'Encuadre'], ['post', 'Publicación'], ['profile', 'Perfil']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={viewTab === key} className={viewTab === key ? 'active' : ''} data-testid={`tab-${key}`} onClick={() => setTab(key)}>{label}</button>)}
              </div>
              <div className="order-strip" role="group" aria-label="Foto en vista previa">
                {viewTab === 'crop' && photos.map((item, index) => <button type="button" key={index} className={`order-thumb ${selected === index ? 'active' : ''}`} aria-label={`Editar foto ${index + 1}`} aria-pressed={selected === index} data-testid={`button-preview-photo-${index}`} onClick={() => setSelected(index)}>{item.url ? <img src={item.url} alt="" /> : <span className="order-number">{index + 1}</span>}<span>Foto {index + 1}</span></button>)}
              </div>
              {isStory && <StoryToggles guides={guides} ui={ui} onGuides={setGuides} onUi={setUi} />}
              {viewTab === 'crop' && <CropPreview key={`${selected}-${frame}-${presentation.size}-${mode}-${presentation.story.template}-${presentation.story.showMetadata}`} size={presentation.size} mode={mode} canvas={canvas} photo={photo} frame={frame} story={presentation.story} handle={handle} guides={guides} ui={ui} onChange={updateCrop} />}
              {viewTab === 'post' && isStory && <StoryView canvas={photo.image ? canvas : null} guides={guides} ui={ui} handle={handle} />}
              {viewTab === 'post' && !isStory && <PublicationView canvases={shown} handle={handle} tile={pubTile} onTile={setPubTile} feed={feed} dims={finalLabel} slides={carouselOn ? profileCanvases.flatMap((c, i) => c ? [{ canvas: c, slot: i }] : []) : undefined} />}
              {viewTab === 'profile' && !isStory && <ProfileView canvases={carouselOn ? shown.filter((item) => item).slice(0, 1) : shown} handle={handle} feed={feed} dims={sizeLabel} carousel={carouselOn} />}
              {isStory && <p className="notice notice-story">{mode === 'framed' ? `Los textos se mantienen entre los ${outSize.safeTop} px superiores y los ${outSize.safeBottom} px inferiores reservados para los controles.` : 'Historia sin marco: imagen a pantalla completa. Evita colocar detalles esenciales cerca de los extremos, donde Instagram superpone controles.'} Las zonas son orientativas: la interfaz puede variar según el dispositivo.</p>}
              <p className="crop-level"><Level kind="adv" /> Encuadre manual, zoom y posición precisa.</p>
              <div className="download-section">
              <div className="export-summary"><h3>Descargar</h3><strong data-testid="text-final-size">{feed ? `3 × ${finalLabel} px` : `${finalLabel} px`} · {outSize.ratio}</strong></div>
              <div className="res-grid" role="group" aria-label="Resolución de exportación">
                {(Object.keys(exportResolutions) as ExportResolution[]).map((key) => { const p = planOf(planIds, key); return <button key={key} type="button" className={`res-option ${exportResolution === key ? 'active' : ''}`} aria-pressed={exportResolution === key} data-testid={`button-resolution-${key}`} onClick={() => setExportResolution(key)}>
                  <strong>{exportResolutions[key].name}</strong><span className="res-px">{feed ? p.tileWidth : p.width} × {p.height} px{feed ? ' / pieza' : ''}</span><small>{exportResolutions[key].description}</small>
                </button>; })}
              </div>
              <p className="res-facts" data-testid="text-source-info">{photo.image ? <>Original de la foto {selected + 1}: <strong>{photo.image.naturalWidth} × {photo.image.naturalHeight} px</strong>. </> : 'Añade una foto para ver su resolución original. '}{planIds.length > 0 && photos.some((p) => p.image) ? <>Con este recorte hay detalle real hasta ≈ <strong>{Math.floor(plan.sourceScale * 1080)} px</strong> de ancho{feed ? ' por pieza' : carouselOn ? ' (la diapositiva más limitada)' : ''}.</> : null}</p>
              {plan.upscaled && <p className="notice notice-res" data-testid="text-upscale-warning">La salida es mayor que la resolución real del original: se amplía, pero no se reconstruye detalle. Puede verse suave.</p>}
              {plan.limited && <p className="notice notice-res" data-testid="text-limit-warning">Se limita al máximo seguro: 8192 px por lado y 32 MP en total.</p>}
              <div className="export-format" role="group" aria-label="Formato de exportación">
                <button type="button" className={`format-option ${format === 'png' ? 'active' : ''}`} aria-pressed={format === 'png'} data-testid="button-format-png" onClick={() => setFormat('png')}><strong>PNG · sin pérdida</strong><span>Conserva cada píxel; archivo más pesado</span></button>
                <button type="button" className={`format-option ${format === 'jpeg' ? 'active' : ''}`} aria-pressed={format === 'jpeg'} data-testid="button-format-jpeg" onClick={() => setFormat('jpeg')}><strong>JPEG · calidad 100</strong><span>Con pérdida; más ligero</span></button>
              </div>
              {feed ? <div className="download-actions">
                {[2, 1, 0].map((n) => <button key={n} type="button" className="btn btn-secondary" data-testid={`button-download-tile-${n}`} disabled={busy || !photo.image} onClick={() => void saveTile(n)}><ArrowDownToLine size={14} /> {3 - n}. {['Izquierda · última', 'Centro', 'Derecha · primero'][n]} · {finalLabel}</button>)}
                <button type="button" className="btn btn-primary" data-testid="button-download-all" disabled={busy || !photo.image} onClick={() => void saveTiles()}><Aperture size={14} /> {busy ? 'Preparando ZIP…' : 'Descargar las 3 publicaciones · ZIP'}</button>
              </div> : <div className="download-actions">
              <button type="button" className="btn btn-secondary" data-testid="button-download-photo" disabled={busy || !photo.image} onClick={() => void saveOne(selected)}><ArrowDownToLine size={15} /> {busy ? 'Preparando descarga…' : `Descargar ${isStory ? 'historia' : 'foto'} ${selected + 1}`}</button>
              <button type="button" className="btn btn-primary" data-testid="button-download-all" disabled={busy || loadedIdx.length < (carouselOn ? 2 : 1)} onClick={() => void saveAll()}><Aperture size={14} /> {busy ? 'Preparando ZIP…' : carouselOn ? `Descargar carrusel · ${loadedIdx.length} fotos · ZIP` : `Descargar todas · ${loadedIdx.length} ${isStory ? 'historias' : 'fotos'} · ZIP`}</button>
              {carouselOn && loadedIdx.length < 2 && <p className="small-note">Un carrusel necesita al menos 2 fotos.</p>}
              </div>}
              <p className="help-copy">La descarga conjunta reúne todas las imágenes en un solo ZIP, sin cambiar su calidad ni sus medidas. Descomprímelo antes de subirlas a Instagram.</p>
              <p className="help-copy">PNG conserva los píxeles sin pérdida; JPEG 100 es un formato con pérdida. Instagram puede recomprimir cualquier archivo al subirlo.</p>
              <p className={`message ${messageKind === 'success' ? 'success' : ''}`} aria-live="polite">{message}</p>
              </div>
              <div className="feed-guidance"><CircleHelp size={15} className="hint-icon" /><span><strong>{isStory ? 'Para publicar las historias:' : carouselOn ? 'Para publicar el carrusel:' : feed ? 'Orden para la fila del perfil:' : 'Para publicar:'}</strong> {isStory ? 'sube las historias en su orden de descarga. Los títulos son independientes por foto; la plantilla, la tipografía y la paleta se comparten.' : feed ? 'sube primero la derecha (01), luego el centro (02) y al final la izquierda (03), como tres publicaciones separadas.' : carouselOn ? 'en Instagram elige varias fotos y selecciona las diapositivas descargadas en orden 1 a 4, dentro de una única publicación.' : 'cada imagen es independiente. Para reunir entre 2 y 4 fotos en una publicación, activa Carrusel.'} Descargas listas para subir manualmente. No se publica directamente en Instagram.</span></div>
              <p className="help-copy">La edición y la exportación ocurren íntegramente en este navegador.</p>
            </section>
          </aside>
        </div>
      </main>
      <footer className="footer"><span>FOCO DE CAMPO · HERRAMIENTA PERSONAL</span><span>ARCHIVOS LOCALES · SIN SUBIDAS · SIN PUBLICACIÓN AUTOMÁTICA</span></footer>
    </div>
  );
}

export default App;
