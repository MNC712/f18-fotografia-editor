import { useEffect, useMemo, useRef, useState } from 'react';
import { Aperture, ArrowDownToLine, Check, CircleHelp, ImagePlus, LockKeyhole, Trash2 } from 'lucide-react';
import { blankPhoto, frames, paintCanvas, cropGeometry, type Photo, type LayoutStyle, type ExportFormat } from '@/lib/photo-renderer';
import { CropPreview } from '@/components/crop-preview';
import { sizes, fonts, palettes, defaultPresentation, type Presentation, type OutputSize, type FontStyle, type ColorPalette } from '@/lib/presentation';

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
const names = ['Foto 1 · izquierda', 'Foto 2 · centro', 'Foto 3 · derecha'];

function downloadCanvas(canvas: HTMLCanvasElement, fileName: string, format: ExportFormat) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('No se pudo preparar el archivo.')); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = fileName; anchor.style.display = 'none';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 900);
    }, format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? 1 : undefined);
  });
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
  const [photos, setPhotos] = useState<Photo[]>([blankPhoto(), blankPhoto(), blankPhoto()]);
  const [handle, setHandle] = useState('@f18.fotografia');
  const [frame, setFrame] = useState<LayoutStyle>('fullwidth');
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('success');
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [presentation, setPresentation] = useState<Presentation>(defaultPresentation);
  const outSize = sizes[presentation.size];
  const sizeLabel = `${outSize.width} × ${outSize.height}`;
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const photo = photos[selected];
  const canvas = useMemo(() => paintCanvas(selected, photo, handle, frame, presentation), [selected, photo, handle, frame, presentation, fontsReady]);
  const lowRes = photo.image ? cropGeometry(photo, frame, presentation.size).scale > 1 : false;
  const fileTag = presentation.size === 'portrait' ? '' : `_${presentation.size}`;
  const changePresentation = (patch: Partial<Presentation>) => {
    setPresentation((current) => ({ ...current, ...patch }));
    if (patch.font) void loadPresentationFont(patch.font).then(() => setFontsReady((v) => !v));
  };
  const completeCount = photos.filter((item) => item.image).length;

  useEffect(() => { void loadPresentationFont('original').then(() => setFontsReady(true)); }, []);
  useEffect(() => () => photos.forEach((item) => { if (item.url) URL.revokeObjectURL(item.url); }), []);

  const updatePhoto = (index: number, patch: Partial<Photo>) => {
    setPhotos((current) => current.map((item, idx) => idx === index ? { ...item, ...patch } : item));
    setMessage('');
  };

  const loadExif = async (index: number, file: File) => {
    const exifr = (window as Window & { exifr?: { parse?: (file: File, tags: string[]) => Promise<Record<string, unknown> | undefined> } }).exifr;
    try {
      const data = exifr?.parse
        ? await exifr.parse(file, ['FNumber', 'ExposureTime', 'ISO', 'FocalLength', 'Model', 'LensModel'])
        : await readJpegExif(file);
      if (!data) return;
      setPhotos((current) => current.map((item, idx) => {
        if (idx !== index || item.file !== file) return item;
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

  const onFile = (index: number, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage('Elige un archivo de imagen válido.'); setMessageKind('error'); return; }
    if (file.size > 100 * 1024 * 1024) { setMessage('La imagen supera el límite de 100 MB.'); setMessageKind('error'); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPhotos((current) => current.map((item, idx) => {
        if (idx !== index) return item;
        if (item.url) URL.revokeObjectURL(item.url);
        return { ...item, file, image, url, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
      }));
      setSelected(index);
      setMessage(`${file.name} está lista para editar.`);
      setMessageKind('success');
      void loadExif(index, file);
    };
    image.onerror = () => { URL.revokeObjectURL(url); setMessage('No se pudo abrir esta imagen. Prueba con otro archivo.'); setMessageKind('error'); };
    image.src = url;
  };

  const removePhoto = (index: number) => {
    setPhotos((current) => current.map((item, idx) => {
      if (idx !== index) return item;
      if (item.url) URL.revokeObjectURL(item.url);
      return blankPhoto();
    }));
    if (fileRefs.current[index]) fileRefs.current[index]!.value = '';
    setSelected(index);
    setMessage('La foto se ha retirado.');
    setMessageKind('success');
  };

  const saveOne = async (index: number) => {
    if (!photos[index].image) { setMessage(`Añade una imagen a «${names[index]}» antes de descargar.`); setMessageKind('error'); return; }
    setBusy(true); setMessage('');
    try {
      await loadPresentationFont(presentation.font);
      const output = paintCanvas(index, photos[index], handle, frame, presentation);
      await downloadCanvas(output, `f18_${index + 1}_${['izquierda', 'centro', 'derecha'][index]}${fileTag}.${format === 'jpeg' ? 'jpg' : 'png'}`, format);
      setMessage(`Foto ${index + 1} descargada a ${sizeLabel} px en ${format === 'jpeg' ? 'JPEG, calidad máxima' : 'PNG'}.`);
      setMessageKind('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo descargar la imagen.');
      setMessageKind('error');
    } finally { setBusy(false); }
  };

  const saveAll = async () => {
    if (completeCount !== 3) { setMessage('Añade las tres fotos para descargar el carrusel completo.'); setMessageKind('error'); return; }
    setBusy(true); setMessage('Preparando las descargas en orden de publicación…'); setMessageKind('success');
    try {
      await loadPresentationFont(presentation.font);
      for (const index of [2, 1, 0]) {
        await downloadCanvas(paintCanvas(index, photos[index], handle, frame, presentation), `f18_${index + 1}_${['izquierda', 'centro', 'derecha'][index]}${fileTag}.${format === 'jpeg' ? 'jpg' : 'png'}`, format);
        if (index !== 0) await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      setMessage(`Las tres fotos (${sizeLabel} px) están descargadas en el orden recomendado de publicación.`);
      setMessageKind('success');
    } catch { setMessage('No se completaron todas las descargas. Puedes guardar cada foto por separado.'); setMessageKind('error'); }
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
            <h1>Tres imágenes. Una historia.</h1>
            <p>Prepara tu secuencia deportiva con ficha técnica, encuadre preciso y archivos listos para Instagram. Tus fotos permanecen en este dispositivo.</p>
          </div>
          <div className="private-note"><LockKeyhole size={15} strokeWidth={1.8} /> Tus imágenes no se suben a ningún servidor</div>
        </section>

        <div className="workspace">
          <div className="left-column">
            <section className="panel panel-pad">
              <div className="panel-heading"><h2>1. Fotografías y firma</h2><span className="step-label">{completeCount} de 3 listas</span></div>
              <label className="field signature-field"><span>Usuario de Instagram · firma debajo de la foto</span><input className="control" data-testid="input-instagram-handle" value={handle} maxLength={40} placeholder="@tu_usuario" onChange={(event) => setHandle(event.target.value)} /></label>
              <div className="photo-selector" role="group" aria-label="Elegir fotografía para editar">
                {photos.map((item, index) => <button key={index} type="button" className={`photo-select ${selected === index ? 'active' : ''}`} data-testid={`button-select-photo-${index}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>
                  <span>Foto {index + 1}</span><small>{item.image ? 'Lista para editar' : 'Añadir fotografía'}</small>{item.image && <Check size={13} />}
                </button>)}
              </div>
              <div className="photo-list">
                {photos.map((item, index) => selected === index ? (
                  <article className="photo-card is-selected" key={index} data-testid={`panel-photo-${index}`}>
                    <input ref={(node) => { fileRefs.current[index] = node; }} className="file-input" type="file" accept="image/*" aria-label={`Elegir ${names[index]}`} onChange={(event) => onFile(index, event.target.files?.[0])} />
                    <div className="upload-tile" role="button" tabIndex={0} aria-label={item.image ? `Cambiar ${names[index]}` : `Elegir ${names[index]}`} onClick={(event) => { event.stopPropagation(); fileRefs.current[index]?.click(); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileRefs.current[index]?.click(); } }}>
                      {item.url ? <><img src={item.url} alt={`Miniatura de ${names[index]}`} /><span className="upload-overlay">Cambiar imagen</span></> : <div className="upload-empty"><ImagePlus size={20} strokeWidth={1.5} /><strong>Añadir imagen</strong><span>JPG, PNG, WebP<br />Máximo 100 MB</span></div>}
                    </div>
                    <div className="photo-fields">
                      <div className="photo-title-row"><div className="photo-title">{names[index]}</div>{item.image && <button type="button" className="remove-button" aria-label={`Retirar ${names[index]}`} title="Retirar imagen" onClick={(event) => { event.stopPropagation(); removePhoto(index); }}><Trash2 size={15} /></button>}</div>
                      <div className="meta-grid">
                        <label className="field"><span>Apertura</span><input className="control" value={item.f} placeholder="f/1.8" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { f: e.target.value })} /></label>
                        <label className="field"><span>Obturador</span><input className="control" value={item.s} placeholder="1/1000" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { s: e.target.value })} /></label>
                        <label className="field"><span>ISO</span><input className="control" inputMode="numeric" value={item.iso} placeholder="1600" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { iso: e.target.value })} /></label>
                        <label className="field"><span>Focal (mm)</span><input className="control" inputMode="decimal" value={item.focal} placeholder="85" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { focal: e.target.value })} /></label>
                      </div>
                      <label className="field camera-field"><span>Cámara y lente · opcional</span><input className="control" value={item.camera} placeholder="Sony A7 IV · 85 mm f/1.8" onClick={(e) => e.stopPropagation()} onChange={(e) => updatePhoto(index, { camera: e.target.value })} /></label>
                      <div className="photo-status">{item.file ? <span className="tag"><Check size={11} /> Imagen lista</span> : <span>Los datos EXIF se rellenan cuando están disponibles</span>}{item.file && <span>{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>}</div>
                    </div>
                  </article>
                ) : null)}
              </div>
              <p className="small-note">La lectura EXIF se realiza en tu navegador cuando el archivo incluye esos datos; también puedes editar cada campo manualmente.</p>
            </section>

            <section className="panel panel-pad">
              <div className="panel-heading"><h2>2. Presentación</h2><span className="step-label">Para las 3 fotos</span></div>
              <p className="small-note level-note">Las etiquetas indican la complejidad del control, no la calidad del archivo.</p>
              <div className="edit-grid">
                <div className="field frame-field"><span>Marco · {Object.keys(frames).length} estilos <Level kind="basic" /></span><div className="frame-grid">
                  {(Object.keys(frames) as LayoutStyle[]).map((style) => <button type="button" key={style} className={`frame-choice ${frame === style ? 'active' : ''}`} aria-pressed={frame === style} data-testid={`button-frame-${style}`} onClick={() => setFrame(style)}>
                    <span className={`frame-swatch frame-swatch-${style}`} style={{ background: frames[style].background, color: frames[style].text }}><span /></span>
                    <strong>{frames[style].name}</strong><small>{frames[style].description}</small>
                  </button>)}
                </div><p className="small-note">El estilo se aplica a las tres fotos; el zoom y la posición se ajustan por separado.</p></div>
                <div className="field frame-field"><span>Tamaño de salida <Level kind="basic" /></span><div className="size-grid">
                  {(Object.keys(sizes) as OutputSize[]).map((key) => <button type="button" key={key} className={`size-choice ${presentation.size === key ? 'active' : ''}`} aria-pressed={presentation.size === key} data-testid={`button-size-${key}`} onClick={() => changePresentation({ size: key })}>
                    <span className="size-shape" style={{ aspectRatio: `${sizes[key].width}/${sizes[key].height}` }} /><strong>{sizes[key].ratio}</strong><small>{sizes[key].width} × {sizes[key].height}</small>
                  </button>)}
                </div><p className="small-note" data-testid="text-size-note"><strong>{outSize.name} · {outSize.ratio}:</strong> {outSize.note}.</p></div>
                <div className="field frame-field"><span>Tipografía <Level kind="mid" /></span><div className="font-grid">
                  {(Object.keys(fonts) as FontStyle[]).map((key) => <button type="button" key={key} className={`font-choice ${presentation.font === key ? 'active' : ''}`} aria-pressed={presentation.font === key} data-testid={`button-font-${key}`} onClick={() => changePresentation({ font: key })}>
                    <span className="font-sample" style={{ fontFamily: fonts[key].family || undefined }}>Aa 1/1000</span><strong>{fonts[key].name}</strong><small>{fonts[key].description}</small>
                  </button>)}
                </div></div>
                <div className="field frame-field"><span>Paleta <Level kind="mid" /></span><div className="palette-grid">
                  {(Object.keys(palettes) as ColorPalette[]).map((key) => <button type="button" key={key} className={`palette-choice ${presentation.palette === key ? 'active' : ''}`} aria-pressed={presentation.palette === key} data-testid={`button-palette-${key}`} onClick={() => changePresentation({ palette: key })}>
                    <span className={`palette-dot palette-${key}`} /><span><strong>{palettes[key].name}</strong><small>{palettes[key].description}</small></span>
                  </button>)}
                </div></div>
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
              <div className="preview-title"><div><h2>3. Encuadre y descarga</h2><p>Foto {selected + 1} · {frames[frame].name}</p></div><span className="dimension-pill" data-testid="text-dimensions">{sizeLabel} px · {outSize.ratio}</span></div>
              <div className="order-strip" role="group" aria-label="Foto en vista previa">
                {photos.map((item, index) => <button type="button" key={index} className={`order-thumb ${selected === index ? 'active' : ''}`} aria-label={`Editar foto ${index + 1}`} aria-pressed={selected === index} data-testid={`button-preview-photo-${index}`} onClick={() => setSelected(index)}>{item.url ? <img src={item.url} alt="" /> : <span className="order-number">{index + 1}</span>}<span>Foto {index + 1}</span></button>)}
              </div>
              <CropPreview key={`${selected}-${frame}-${presentation.size}`} size={presentation.size} canvas={canvas} photo={photo} frame={frame} onChange={(patch) => updatePhoto(selected, patch)} />
              {presentation.size === 'story' && <p className="notice notice-story">Historia: se reservan {outSize.safeTop} px arriba y {outSize.safeBottom} px abajo para la interfaz de Instagram.</p>}
              {lowRes && <p className="notice notice-res" data-testid="text-resolution-notice">Esta imagen tiene menos resolución de la necesaria para {sizeLabel} px. Se amplía, pero no se puede inventar detalle: puede verse suave.</p>}
              <p className="crop-level"><Level kind="adv" /> Encuadre manual, zoom y posición precisa.</p>
              <div className="download-section">
              <div className="export-summary"><h3>Descargar</h3><strong>{sizeLabel} px · {outSize.ratio}</strong></div>
              <div className="export-format" role="group" aria-label="Formato de exportación">
                <button type="button" className={`format-option ${format === 'jpeg' ? 'active' : ''}`} aria-pressed={format === 'jpeg'} data-testid="button-format-jpeg" onClick={() => setFormat('jpeg')}><strong>JPEG · máximo</strong><span>Calidad de exportación 100 %</span></button>
                <button type="button" className={`format-option ${format === 'png' ? 'active' : ''}`} aria-pressed={format === 'png'} data-testid="button-format-png" onClick={() => setFormat('png')}><strong>PNG · sin pérdida</strong><span>Archivo de mayor tamaño</span></button>
              </div>
              <div className="download-actions">
              <button type="button" className="btn btn-primary" data-testid="button-download-photo" disabled={busy || !photo.image} onClick={() => void saveOne(selected)}><ArrowDownToLine size={15} /> {busy ? 'Preparando descarga…' : `Descargar foto ${selected + 1}`}</button>
              <button type="button" className="btn btn-secondary" data-testid="button-download-all" disabled={busy || completeCount !== 3} onClick={() => void saveAll()}><Aperture size={14} /> Descargar las 3 fotos</button>
              </div>
              <p className={`message ${messageKind === 'success' ? 'success' : ''}`} aria-live="polite">{message}</p>
              </div>
              <div className="feed-guidance"><CircleHelp size={15} className="hint-icon" /><span><strong>Orden del carrusel:</strong> publica primero la foto 3 (derecha), después la 2 (centro) y por último la 1 (izquierda). Descargas separadas, listas para subir manualmente. No se publica directamente en Instagram.</span></div>
              <p className="help-copy">La edición y la exportación ocurren íntegramente en este navegador. JPEG se guarda con la calidad máxima disponible; PNG conserva los píxeles sin compresión con pérdida.</p>
            </section>
          </aside>
        </div>
      </main>
      <footer className="footer"><span>FOCO DE CAMPO · HERRAMIENTA PERSONAL</span><span>ARCHIVOS LOCALES · SIN SUBIDAS · SIN PUBLICACIÓN AUTOMÁTICA</span></footer>
    </div>
  );
}

export default App;
