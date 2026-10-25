import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function CanvasView({ source, className, label }: { source: HTMLCanvasElement; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, source.width, source.height); ctx.drawImage(source, 0, 0); }
  }, [source]);
  return <canvas ref={ref} className={className} width={source.width} height={source.height} role="img" aria-label={label} />;
}

const tileNames = ['Izquierda', 'Centro', 'Derecha'];
const publishOrder = ['3.ª · última', '2.ª', '1.ª · primero'];

export function CarouselView({ slides, handle, dims }: { slides: { canvas: HTMLCanvasElement; slot: number }[]; handle: string; dims: string }) {
  const [idx, setIdx] = useState(0);
  const start = useRef<number | null>(null);
  const i = Math.min(idx, Math.max(0, slides.length - 1));
  const go = (n: number) => setIdx(Math.max(0, Math.min(slides.length - 1, n)));
  const slide = slides[i];
  return (
    <div className="pv-wrap" data-testid="view-carousel">
      <article className="ig-post">
        <header><span className="ig-avatar">{(handle.replace('@', '')[0] || 'f').toUpperCase()}</span><strong>{handle || '@tu_usuario'}</strong><span className="ig-dots">···</span></header>
        <div className="ig-media carousel-stage" style={{ touchAction: 'pan-y' }} onPointerDown={(e) => { start.current = e.clientX; }} onPointerUp={(e) => { if (start.current !== null) { const d = e.clientX - start.current; if (Math.abs(d) > 40) go(i + (d < 0 ? 1 : -1)); } start.current = null; }} onPointerCancel={() => { start.current = null; }}>
          {slide ? <CanvasView source={slide.canvas} label={`Diapositiva ${i + 1} de ${slides.length}`} className="ig-canvas" /> : <div className="ig-empty">Carga al menos 2 fotos</div>}
          {slide && <span className="carousel-counter" data-testid="text-carousel-counter">{i + 1}/{slides.length}</span>}
          {slide && i > 0 && <button type="button" className="carousel-arrow left" aria-label="Anterior" data-testid="button-carousel-prev" onClick={() => go(i - 1)}><ChevronLeft size={16} /></button>}
          {slide && i < slides.length - 1 && <button type="button" className="carousel-arrow right" aria-label="Siguiente" data-testid="button-carousel-next" onClick={() => go(i + 1)}><ChevronRight size={16} /></button>}
        </div>
        <div className="carousel-dots">{slides.map((sl, n) => <button key={sl.slot} type="button" aria-label={`Ver diapositiva ${n + 1}`} aria-current={n === i} className={n === i ? 'active' : ''} data-testid={`button-carousel-dot-${n}`} onClick={() => setIdx(n)} />)}</div>
        <footer><span className="ig-icons" aria-hidden="true">♡ &nbsp;○ &nbsp;➤</span><p><strong>{handle || '@tu_usuario'}</strong> Texto de la publicación…</p></footer>
      </article>
      <p className="small-note">Carrusel de {slides.length} {slides.length === 1 ? 'foto' : 'fotos'} en una sola publicación; desliza o usa las flechas. Archivo real: {dims}.</p>
    </div>
  );
}

export function PublicationView({ canvases, handle, tile, onTile, feed, dims, slides }: { slides?: { canvas: HTMLCanvasElement; slot: number }[]; canvases: (HTMLCanvasElement | null)[]; handle: string; tile: number; onTile: (n: number) => void; feed: boolean; dims: string }) {
  if (slides) return <CarouselView slides={slides} handle={handle} dims={dims} />;
  const current = canvases[tile];
  return (
    <div className="pv-wrap" data-testid="view-publication">
      <div className="pv-tabs" role="group" aria-label="Publicación a mostrar">
        {canvases.map((_, n) => <button key={n} type="button" className={tile === n ? 'active' : ''} aria-pressed={tile === n} data-testid={`button-pub-tile-${n}`} onClick={() => onTile(n)}>{feed ? tileNames[n] : `Foto ${n + 1}`}{feed ? <small>{publishOrder[n]}</small> : null}</button>)}
      </div>
      <article className="ig-post">
        <header><span className="ig-avatar">{(handle.replace('@', '')[0] || 'f').toUpperCase()}</span><strong>{handle || '@tu_usuario'}</strong><span className="ig-dots">···</span></header>
        <div className="ig-media">{current ? <CanvasView source={current} label={feed ? `Publicación ${tileNames[tile]}` : `Foto ${tile + 1}`} className="ig-canvas" /> : <div className="ig-empty">Esta foto aún no está cargada</div>}</div>
        <footer><span className="ig-icons" aria-hidden="true">♡ &nbsp;○ &nbsp;➤</span><p><strong>{handle || '@tu_usuario'}</strong> Texto de la publicación…</p></footer>
      </article>
      <p className="small-note">Simulación de la interfaz. Archivo real: {dims}.{feed ? ` Orden de subida: ${publishOrder[tile]}.` : ''}</p>
    </div>
  );
}

export function ProfileView({ canvases, handle, feed, dims, carousel = false }: { canvases: (HTMLCanvasElement | null)[]; handle: string; feed: boolean; dims: string; carousel?: boolean }) {
  return (
    <div className="pv-wrap" data-testid="view-profile">
      <div className="ig-profile">
        <header><span className="ig-avatar big">{(handle.replace('@', '')[0] || 'f').toUpperCase()}</span><div><strong>{handle || '@tu_usuario'}</strong><small>Vista de cuadrícula · simulación</small></div></header>
        <div className="ig-grid">
          {canvases.map((c, i) => <div className="ig-cell" key={i} data-testid={`profile-tile-${i}`}>{c ? <CanvasView source={c} label={feed ? `Mosaico ${tileNames[i]}` : `Foto ${i + 1} del perfil`} className="ig-canvas" /> : <span>Foto {i + 1}<br />sin cargar</span>}</div>)}
        </div>
      </div>
      <p className="small-note">{feed ? 'Sube las tres publicaciones por separado, en este orden: derecha, centro, izquierda. Así la última queda arriba a la izquierda y el panorama se lee de izquierda a derecha.' : carousel ? 'El carrusel ocupa una sola posición del perfil. Su portada es la primera diapositiva; en Publicación puedes ver todas las fotos.' : 'Simulación de publicaciones individuales en una cuadrícula de tres columnas.'} Proporción del archivo: {dims}. Instagram puede recortar el mosaico del perfil según tus ajustes, y las publicaciones fijadas o nuevas desplazan la alineación.</p>
    </div>
  );
}
