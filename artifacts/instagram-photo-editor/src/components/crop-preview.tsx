import { useEffect, useRef, type PointerEvent } from 'react';
import { RotateCw } from 'lucide-react';
import { cropGeometry, frameLayout, limitZoom, type LayoutStyle, type Photo } from '@/lib/photo-renderer';
import { sizes, type OutputSize } from '@/lib/presentation';

type Props = {
  canvas: HTMLCanvasElement;
  photo: Photo;
  frame: LayoutStyle;
  size?: OutputSize;
  onChange: (patch: Partial<Photo>) => void;
};
type Point = { x: number; y: number };

export function CropPreview({ canvas, photo, frame, size = 'portrait', onChange }: Props) {
  const preview = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const drag = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const pinch = useRef({ distance: 1, zoom: 1 });
  const layout = frameLayout(frame, size);
  const output = sizes[size];
  const crop = cropGeometry(photo, frame, size);

  useEffect(() => { pointers.current.clear(); }, [size]);

  useEffect(() => {
    const ctx = preview.current?.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(canvas, 0, 0); }
  }, [canvas]);

  const changeCrop = (patch: Partial<Photo>) => {
    const next = cropGeometry({ ...photo, ...patch }, frame, size);
    onChange({ ...patch, zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
  };
  const setZoom = (zoom: number) => changeCrop({ zoom: limitZoom(zoom) });
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  };
  const startDrag = (point: Point) => {
    drag.current = { ...point, offsetX: crop.offsetX, offsetY: crop.offsetY };
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!photo.image || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) startDrag(point);
    else pinch.current = { distance: distance(), zoom: crop.zoom };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size > 1) {
      setZoom(pinch.current.zoom * distance() / Math.max(1, pinch.current.distance));
    } else {
      const scale = layout.width / event.currentTarget.getBoundingClientRect().width;
      changeCrop({
        offsetX: drag.current.offsetX + (event.clientX - drag.current.x) * scale,
        offsetY: drag.current.offsetY + (event.clientY - drag.current.y) * scale,
      });
    }
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const remaining = [...pointers.current.values()][0];
    if (remaining) startDrag(remaining);
  };

  return (
    <>
      <div className="preview-canvas" style={{ aspectRatio: `${output.width} / ${output.height}` }}>
        <canvas ref={preview} className="preview-artwork" width={output.width} height={output.height} role="img" aria-label={`Vista previa del marco y encuadre final, ${output.width} por ${output.height} píxeles`} data-testid="canvas-photo-preview" />
        {photo.image && <div
          className="crop-hit-area"
          style={{ left: `${layout.x / output.width * 100}%`, top: `${layout.y / output.height * 100}%`, width: `${layout.width / output.width * 100}%`, height: `${layout.height / output.height * 100}%`, borderRadius: `${layout.radius / layout.width * 100}%` }}
          tabIndex={0}
          role="group"
          aria-label="Mover fotografía: arrastra o usa las flechas. En pantalla táctil, pellizca para cambiar el zoom."
          data-testid="drag-photo"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
          onLostPointerCapture={pointerEnd}
          onKeyDown={(event) => {
            const amount = event.shiftKey ? 40 : 12;
            const changes: Record<string, Partial<Photo>> = {
              ArrowLeft: { offsetX: crop.offsetX - amount }, ArrowRight: { offsetX: crop.offsetX + amount },
              ArrowUp: { offsetY: crop.offsetY - amount }, ArrowDown: { offsetY: crop.offsetY + amount },
              '+': { zoom: limitZoom(crop.zoom + .05) }, '=': { zoom: limitZoom(crop.zoom + .05) },
              '-': { zoom: limitZoom(crop.zoom - .05) },
            };
            if (changes[event.key]) { event.preventDefault(); changeCrop(changes[event.key]); }
          }}
        />}
      </div>
      <div className="crop-controls" data-testid="panel-crop">
        <p className="crop-instructions">{photo.image ? 'Arrastra la foto para moverla. En el móvil, también puedes pellizcar para ampliar.' : 'Añade una foto para moverla y ajustar su zoom.'}</p>
        <fieldset disabled={!photo.image}>
          <div className="zoom-row">
            <button type="button" className="zoom-step" aria-label="Alejar fotografía" disabled={crop.zoom <= 1} data-testid="button-zoom-out" onClick={() => setZoom(crop.zoom - .1)}>−</button>
            <label className="zoom-slider"><span>Zoom <output data-testid="text-zoom">{Math.round(crop.zoom * 100)}%</output></span><input type="range" min="100" max="400" step="1" value={Math.round(crop.zoom * 100)} aria-label="Zoom de la fotografía" data-testid="input-zoom" onChange={(event) => setZoom(Number(event.target.value) / 100)} /></label>
            <button type="button" className="zoom-step" aria-label="Acercar fotografía" disabled={crop.zoom >= 4} data-testid="button-zoom-in" onClick={() => setZoom(crop.zoom + .1)}>+</button>
          </div>
          <div className="crop-actions">
            <button type="button" data-testid="button-rotate-photo" onClick={() => changeCrop({ rotation: (photo.rotation + 90) % 360, offsetX: 0, offsetY: 0 })}><RotateCw size={13} /> Girar 90°</button>
            <button type="button" data-testid="button-center-photo" onClick={() => changeCrop({ offsetX: 0, offsetY: 0 })}>Centrar foto</button>
            <button type="button" data-testid="button-reset-crop" onClick={() => changeCrop({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })}>Restablecer</button>
          </div>
          <details className="precise-position">
            <summary data-testid="toggle-position-controls">Posición precisa</summary>
            <div className="position-controls">
              <label>Horizontal<input type="range" min="-100" max="100" value={crop.maxX ? crop.offsetX / crop.maxX * 100 : 0} disabled={!photo.image || crop.maxX < 1} aria-label="Posición horizontal" data-testid="input-pan-x" onChange={(event) => changeCrop({ offsetX: Number(event.target.value) / 100 * crop.maxX })} /></label>
              <label>Vertical<input type="range" min="-100" max="100" value={crop.maxY ? crop.offsetY / crop.maxY * 100 : 0} disabled={!photo.image || crop.maxY < 1} aria-label="Posición vertical" data-testid="input-pan-y" onChange={(event) => changeCrop({ offsetY: Number(event.target.value) / 100 * crop.maxY })} /></label>
            </div>
          </details>
        </fieldset>
        <p className="small-note">Encuadre protegido: el mínimo es 100 %. La foto siempre cubre el marco y no deja espacios vacíos al moverla.</p>
      </div>
    </>
  );
}
