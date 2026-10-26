import { useEffect, useRef, useState } from 'react';
import { Download, FileArchive, Trophy } from 'lucide-react';
import type { Raffle } from '@/lib/raffle-api';
import { DEFAULT_HANDLE, renderRaffleStory } from '@/lib/raffle-story';
import { canvasBlob, downloadBlob, imageArchive } from '@/lib/download-archive';
import { slug } from './validation';

export function RaffleResults({ raffle }: { raffle: Raffle }) {
  const [index, setIndex] = useState(0);
  const [handle, setHandle] = useState(DEFAULT_HANDLE);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLCanvasElement | null>(null);
  const count = raffle.results.length;
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(Math.trunc(index), count - 1)) : 0;
  const result = raffle.results[safeIndex];
  const name = (i: number) => `f18_sorteo_${slug(raffle.title)}_${i + 1}_${slug(raffle.results[i].prize_name)}_1080x1920.png`;

  useEffect(() => {
    if (!result) return;
    let dead = false;
    setState('loading'); current.current = null; host.current?.replaceChildren();
    const timer = window.setTimeout(() => {
      renderRaffleStory(raffle.title, result, handle).then((c) => {
        if (dead) return;
        c.className = 'rf-story-canvas'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Historia: ${result.prize_name}, ganador ${result.winner_name}`);
        host.current?.replaceChildren(c); current.current = c; setState('ready');
      }).catch((e) => { if (!dead) { setError(e instanceof Error ? e.message : 'No se pudo generar la historia.'); setState('error'); } });
    }, 180);
    return () => { dead = true; window.clearTimeout(timer); };
  }, [raffle.title, result, handle]);

  if (!result) return <p className="rf-empty">Este sorteo no tiene resultados.</p>;

  const savePng = async () => {
    if (!current.current || working) return;
    setWorking(true); setError('');
    try { downloadBlob(await canvasBlob(current.current, 'png'), name(safeIndex)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar la imagen.'); } finally { setWorking(false); }
  };
  const saveZip = async () => {
    if (working) return;
    setWorking(true); setError('');
    try {
      const images = [];
      for (let i = 0; i < raffle.results.length; i++) {
        const c = await renderRaffleStory(raffle.title, raffle.results[i], handle);
        images.push({ name: name(i), blob: await canvasBlob(c, 'png') });
      }
      downloadBlob(await imageArchive(images), `f18_sorteo_${slug(raffle.title)}_historias.zip`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el ZIP.'); } finally { setWorking(false); }
  };

  return (
    <div className="rf-results">
      <div className="rf-results-list">
        <h3 className="rf-h3">Resultados</h3>
        <ol className="rf-winners">
          {raffle.results.map((r, i) => (
            <li key={r.prize_id}>
              <button type="button" className={i === safeIndex ? 'active' : ''} aria-pressed={i === safeIndex} onClick={() => setIndex(i)} data-testid={`button-result-${r.prize_id}`}>
                <Trophy size={16} aria-hidden="true" /><span><small>{r.prize_name}</small><strong>{r.winner_name}</strong></span>
              </button>
            </li>))}
        </ol>
        <label className="rf-field"><span>Usuario en la historia</span>
          <input className="rf-input" value={handle} maxLength={40} onChange={(e) => setHandle(e.target.value)} data-testid="input-story-handle" /></label>
        <div className="rf-actions rf-stack">
          <button type="button" className="rf-btn rf-btn-primary" disabled={working || state !== 'ready'} onClick={() => void savePng()} data-testid="button-download-png"><Download size={16} /> Descargar PNG</button>
          <button type="button" className="rf-btn" disabled={working || state === 'loading'} onClick={() => void saveZip()} data-testid="button-download-zip"><FileArchive size={16} /> ZIP con las {raffle.results.length} historias</button>
        </div>
        {error && <p className="rf-err" role="alert">{error}</p>}
        <p className="rf-note">PNG sin pérdida de 1080 × 1920 px. Los márgenes respetan la interfaz de las historias de Instagram.</p>
      </div>
      <div className="rf-story-wrap">
        <div className={`rf-story ${state}`} ref={host} aria-busy={state === 'loading'} />
        {state === 'loading' && <span className="rf-story-status" role="status">Preparando historia…</span>}
      </div>
    </div>
  );
}
