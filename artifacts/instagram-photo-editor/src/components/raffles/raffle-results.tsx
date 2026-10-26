import { useEffect, useRef, useState } from 'react';
import { Download, FileArchive, LayoutList, Trophy } from 'lucide-react';
import type { Raffle } from '@/lib/raffle-api';
import { DEFAULT_HANDLE, STORY_HEIGHT, renderRaffleCollective, renderRaffleStory } from '@/lib/raffle-story';
import { canvasBlob, downloadBlob, imageArchive } from '@/lib/download-archive';
import { slug } from './validation';

type View = 'all' | number;

export function RaffleResults({ raffle }: { raffle: Raffle }) {
  const [view, setView] = useState<View>('all');
  const [handle, setHandle] = useState(DEFAULT_HANDLE);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLCanvasElement | null>(null);
  const results = raffle.results;
  const count = results.length;
  const index = view === 'all' ? -1 : Math.max(0, Math.min(Math.trunc(view), count - 1));
  const result = index >= 0 ? results[index] : null;
  const name = (i: number) => `f18_sorteo_${slug(raffle.title)}_${i + 1}_${slug(results[i].prize_name)}_1080x1920.png`;

  useEffect(() => {
    if (!count) return;
    let dead = false;
    setState('loading'); setError(''); current.current = null; host.current?.replaceChildren();
    const timer = window.setTimeout(() => {
      const job = result ? renderRaffleStory(raffle.title, result, handle) : renderRaffleCollective(raffle.title, results, handle);
      job.then((c) => {
        if (dead) return;
        c.className = 'rf-story-canvas'; c.setAttribute('role', 'img');
        c.setAttribute('aria-label', result ? `Historia: ${result.prize_name}, ganador ${result.winner_name}` : `Todos los ganadores de ${raffle.title}`);
        host.current?.replaceChildren(c); current.current = c; setSize({ w: c.width, h: c.height }); setState('ready');
      }).catch((e) => { if (!dead) { setError(e instanceof Error ? e.message : 'No se pudo generar la imagen.'); setState('error'); } });
    }, 180);
    return () => { dead = true; window.clearTimeout(timer); };
  }, [raffle.title, results, result, count, handle]);

  if (!count) return <p className="rf-empty">Este sorteo no tiene resultados.</p>;

  const savePng = async () => {
    if (!current.current || working) return;
    setWorking(true); setError('');
    try {
      const c = current.current;
      const file = result ? name(index) : `f18_sorteo_${slug(raffle.title)}_ganadores_${c.width}x${c.height}.png`;
      downloadBlob(await canvasBlob(c, 'png'), file);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar la imagen.'); } finally { setWorking(false); }
  };
  const saveZip = async () => {
    if (working) return;
    setWorking(true); setError('');
    try {
      const images = [];
      for (let i = 0; i < count; i++) {
        const c = await renderRaffleStory(raffle.title, results[i], handle);
        images.push({ name: name(i), blob: await canvasBlob(c, 'png') });
      }
      downloadBlob(await imageArchive(images), `f18_sorteo_${slug(raffle.title)}_historias.zip`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el ZIP.'); } finally { setWorking(false); }
  };
  const tall = view === 'all' && size !== null && size.h > STORY_HEIGHT;

  return (
    <div className="rf-results">
      <div className="rf-results-list">
        <div className="rf-card-head"><h3 className="rf-h3">Resultados</h3><span className="rf-count" data-testid="text-results-count">{count} {count === 1 ? 'PREMIO' : 'PREMIOS'}</span></div>
        <button type="button" className={`rf-all ${view === 'all' ? 'active' : ''}`} aria-pressed={view === 'all'} onClick={() => setView('all')} data-testid="button-result-all">
          <LayoutList size={18} aria-hidden="true" /><span><strong>Todos los ganadores</strong><small>Una sola imagen con cada premio</small></span>
        </button>
        <p className="rf-sub">O una historia individual</p>
        <ol className="rf-winners">
          {results.map((r, i) => (
            <li key={r.prize_id}>
              <button type="button" className={i === index ? 'active' : ''} aria-pressed={i === index} onClick={() => setView(i)} data-testid={`button-result-${r.prize_id}`}>
                <Trophy size={16} aria-hidden="true" /><span><small>{r.prize_name}</small><strong>{r.winner_name}</strong></span>
              </button>
            </li>))}
        </ol>
        <label className="rf-field"><span>Usuario en la imagen</span>
          <input className="rf-input" value={handle} maxLength={40} onChange={(e) => setHandle(e.target.value)} data-testid="input-story-handle" /></label>
        <div className="rf-actions rf-stack">
          <button type="button" className="rf-btn rf-btn-primary" disabled={working || state !== 'ready'} onClick={() => void savePng()} data-testid="button-download-png">
            <Download size={16} /> {view === 'all' ? 'Descargar imagen con todos' : 'Descargar esta historia'}
          </button>
          <button type="button" className="rf-btn" disabled={working} onClick={() => void saveZip()} data-testid="button-download-zip"><FileArchive size={16} /> ZIP con las {count} historias individuales</button>
        </div>
        {error && <p className="rf-err" role="alert" data-testid="text-results-error">{error}</p>}
        <p className="rf-note" data-testid="text-image-size">
          PNG sin pérdida{size && state === 'ready' ? ` de ${size.w} × ${size.h} px` : ''}.
          {tall ? ' La imagen se alargó para que cada nombre y premio se lea completo. No cabe en una historia de Instagram sin recortarse: guárdala como resumen o descarga el ZIP de historias individuales para publicarlas sin cortes.' : ' Los márgenes respetan la interfaz de las historias de Instagram.'}
        </p>
      </div>
      <div className={`rf-story-wrap ${tall ? 'is-tall' : ''}`}>
        <div className={`rf-story ${state}`} ref={host} aria-busy={state === 'loading'} style={size && state === 'ready' ? { aspectRatio: `${size.w} / ${size.h}` } : undefined} data-testid="img-results-preview" />
        {state === 'loading' && <span className="rf-story-status" role="status">Preparando imagen…</span>}
      </div>
    </div>
  );
}
