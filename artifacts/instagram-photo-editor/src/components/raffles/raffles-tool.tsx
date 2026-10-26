import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImageIcon, Plus, RefreshCw, WifiOff } from 'lucide-react';
import { raffleApi, RaffleApiError, type Raffle, type RaffleSummary } from '@/lib/raffle-api';
import { ConfirmDialog, type Confirmation } from './confirm-dialog';
import { RaffleDetail, type Actions, type ActionError } from './raffle-detail';
import { RaffleResults } from './raffle-results';
import { LIMITS, fmtDate } from './validation';
import './raffles.css';

const toError = (e: unknown): NonNullable<ActionError> => e instanceof RaffleApiError ? { message: e.message, duplicates: e.duplicates ?? [] } : { message: 'La operación no pudo completarse.', duplicates: [] };
const summarize = (r: Raffle): RaffleSummary => ({ id: r.id, title: r.title, description: r.description, status: r.status, created_at: r.created_at, drawn_at: r.drawn_at, participant_count: r.participants.length, prize_count: r.prizes.length });

export function RafflesTool({ active, onOpenEditor }: { active: boolean; onOpenEditor: () => void }) {
  const [list, setList] = useState<RaffleSummary[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [detailError, setDetailError] = useState('');
  const [view, setView] = useState<'manage' | 'results'>('manage');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionError>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const selectedRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const listSeq = useRef(0);
  const detailGen = useRef(0);
  const creatingRef = useRef(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text: string }>({ kind: 'idle', text: '' });
  selectedRef.current = selectedId;

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const items = await raffleApi.list();
      if (seq !== listSeq.current) return;
      setList(items); setListState('ready'); setListError('');
    } catch (e) { if (seq === listSeq.current) { setListState('error'); setListError(toError(e).message); } }
  }, []);

  const loadDetail = useCallback(async (id: number, silent: boolean) => {
    const gen = ++detailGen.current;
    try {
      const r = await raffleApi.get(id);
      if (selectedRef.current !== id || detailGen.current !== gen || (silent && busyRef.current)) return;
      setRaffle(r); setDetailError('');
    } catch (e) { if (selectedRef.current === id && detailGen.current === gen && !silent) setDetailError(toError(e).message); }
  }, []);

  const refresh = useCallback(() => { if (busyRef.current || creatingRef.current) return; void loadList(); if (selectedRef.current) void loadDetail(selectedRef.current, true); }, [loadList, loadDetail]);

  const anyDirty = dirty || !!newTitle || !!newDescription;
  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);
  useEffect(() => { if (active) refresh(); }, [active, refresh]);
  useEffect(() => {
    if (!active) return;
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [active, refresh]);

  const open = (id: number, initial?: Raffle) => {
    detailGen.current++; setStatus({ kind: 'idle', text: '' });
    selectedRef.current = id; setSelectedId(id); setRaffle(initial ?? null); setDetailError(''); setError(null); setDirty(false);
    setView(initial?.status === 'drawn' ? 'results' : 'manage');
    if (!initial) void loadDetail(id, false).then(() => setView((v) => v));
  };
  const back = () => {
    if (busyRef.current) return;
    if (dirty && !window.confirm('Hay cambios sin guardar en este sorteo. ¿Salir y descartarlos?')) return;
    detailGen.current++; setStatus({ kind: 'idle', text: '' });
    selectedRef.current = null; setSelectedId(null); setRaffle(null); setDirty(false); setError(null); void loadList();
  };

  const run = async (id: number, fn: () => Promise<Raffle>): Promise<Raffle | null> => {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true); setError(null); detailGen.current++; listSeq.current++;
    setStatus({ kind: 'saving', text: 'Guardando…' });
    try {
      const r = await fn();
      setList((l) => l.map((s) => (s.id === r.id ? summarize(r) : s)));
      if (selectedRef.current === id) setRaffle(r);
      setStatus({ kind: 'saved', text: 'Cambios guardados.' });
      return r;
    } catch (e) { const err = toError(e); if (selectedRef.current === id) setError(err); setStatus({ kind: 'error', text: err.message }); return null; }
    finally { busyRef.current = false; setBusy(false); detailGen.current++; }
  };

  const id = raffle?.id ?? -1;
  const actions: Actions = {
    update: (t, d) => run(id, () => raffleApi.update(id, t, d)),
    addNames: async (n) => !!(await run(id, () => raffleApi.addParticipants(id, n))),
    editParticipant: async (p, n) => !!(await run(id, () => raffleApi.updateParticipant(id, p, n))),
    removeParticipant: async (p) => !!(await run(id, () => raffleApi.removeParticipant(id, p))),
    savePrize: async (p) => !!(await run(id, () => raffleApi.savePrize(id, p))),
    removePrize: async (p) => !!(await run(id, () => raffleApi.removePrize(id, p))),
    draw: async () => { const r = await run(id, () => raffleApi.draw(id)); if (r && selectedRef.current === id) setView('results'); return !!r; },
    duplicate: async () => {
      const r = await run(id, () => raffleApi.duplicate(id));
      if (r) { void loadList(); open(r.id, r); }
      return !!r;
    },
    remove: async () => {
      if (busyRef.current) return false;
      busyRef.current = true; setBusy(true); setError(null); detailGen.current++; listSeq.current++;
      setStatus({ kind: 'saving', text: 'Eliminando…' });
      try { await raffleApi.remove(id); setStatus({ kind: 'saved', text: 'Sorteo eliminado.' }); selectedRef.current = null; setSelectedId(null); setRaffle(null); setDirty(false); void loadList(); return true; }
      catch (e) { const err = toError(e); setError(err); setStatus({ kind: 'error', text: err.message }); return false; } finally { busyRef.current = false; setBusy(false); detailGen.current++; }
    },
  };

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const create = async () => {
    if (creatingRef.current || busyRef.current || listState !== 'ready' || !newTitle.trim()) return;
    creatingRef.current = true; setCreating(true); setCreateError(''); listSeq.current++;
    setStatus({ kind: 'saving', text: 'Creando sorteo…' });
    try {
      const r = await raffleApi.create(newTitle.trim(), newDescription.trim());
      setNewTitle(''); setNewDescription(''); void loadList(); open(r.id, r); setStatus({ kind: 'saved', text: 'Sorteo creado.' });
    } catch (e) { const m = toError(e).message; setCreateError(m); setStatus({ kind: 'error', text: m }); } finally { creatingRef.current = false; setCreating(false); }
  };

  return (
    <main className="main rf-root" hidden={!active} data-testid="page-raffles">
      <section className="intro">
        <div>
          <div className="eyebrow">Sorteos y resultados</div>
          <h1>Sorteos con memoria.</h1>
          <p>Reúne participantes y premios, sortea con transparencia y publica a cada ganador con una historia lista para Instagram.</p>
        </div>
        <button type="button" className="rf-btn" onClick={refresh} disabled={busy || creating} data-testid="button-refresh-raffles"><RefreshCw size={15} /> Actualizar</button>
      </section>

      <p className={`rf-status ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'} aria-live={status.kind === 'error' ? 'assertive' : 'polite'} data-testid="status-raffles-save">{status.text}</p>

      {listState === 'error' && list.length === 0 ? (
        <section className="rf-card rf-offline" role="alert" data-testid="status-raffles-error">
          <WifiOff size={30} aria-hidden="true" />
          <h2>Sorteos no está conectado</h2>
          <p>{listError}</p>
          <div className="rf-actions">
            <button type="button" className="rf-btn rf-btn-primary" onClick={() => { setListState('loading'); void loadList(); }} data-testid="button-retry-raffles"><RefreshCw size={15} /> Reintentar</button>
            <button type="button" className="rf-btn" onClick={onOpenEditor} data-testid="button-open-editor"><ImageIcon size={15} /> Ir al editor de fotografías</button>
          </div>
        </section>
      ) : selectedId !== null ? (
        <>
          <div className="rf-toolbar">
            <button type="button" className="rf-btn" onClick={back} disabled={busy} data-testid="button-back-raffles"><ArrowLeft size={15} /> Todos los sorteos</button>
            {raffle?.status === 'drawn' && (
              <div className="rf-tabs" role="group" aria-label="Vista">
                <button type="button" className={view === 'manage' ? 'active' : ''} aria-pressed={view === 'manage'} onClick={() => setView('manage')}>Detalle</button>
                <button type="button" className={view === 'results' ? 'active' : ''} aria-pressed={view === 'results'} onClick={() => setView('results')}>Resultados</button>
              </div>)}
          </div>
          {!raffle ? (detailError ? (
            <div className="rf-alert" role="alert">{detailError} <button type="button" className="rf-link" onClick={() => void loadDetail(selectedId, false)}>Reintentar</button></div>
          ) : <div className="rf-skeleton" aria-busy="true" aria-label="Cargando sorteo" />)
            : view === 'results' && raffle.status === 'drawn' ? <RaffleResults raffle={raffle} />
            : <RaffleDetail key={raffle.id} raffle={raffle} busy={busy} actions={actions} error={error} onDirty={setDirty} ask={setConfirmation} onResults={() => setView('results')} />}
        </>
      ) : (
        <div className="rf-home">
          <section className="rf-card" aria-labelledby="rf-new-h">
            <h2 className="rf-h3" id="rf-new-h">Nuevo sorteo</h2>
            <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
              <label className="rf-field"><span>Título <em>{newTitle.length}/{LIMITS.title}</em></span>
                <input className="rf-input" value={newTitle} maxLength={LIMITS.title} disabled={listState !== 'ready' || creating} onChange={(e) => setNewTitle(e.target.value)} data-testid="input-new-title" /></label>
              <label className="rf-field"><span>Descripción <em>{newDescription.length}/{LIMITS.description}</em></span>
                <textarea className="rf-input" rows={3} value={newDescription} maxLength={LIMITS.description} disabled={listState !== 'ready' || creating} onChange={(e) => setNewDescription(e.target.value)} data-testid="input-new-description" /></label>
              {createError && <p className="rf-err" role="alert">{createError}</p>}
              <button type="submit" className="rf-btn rf-btn-primary" disabled={listState !== 'ready' || creating || !newTitle.trim()} data-testid="button-create-raffle"><Plus size={16} /> {creating ? 'Creando…' : 'Crear sorteo'}</button>
            </form>
          </section>
          <section aria-label="Sorteos guardados">
            {listState === 'loading' ? <div className="rf-skeleton" aria-busy="true" aria-label="Cargando sorteos" /> :
              list.length === 0 ? <div className="rf-card"><p className="rf-empty">Todavía no hay sorteos. Crea el primero y añade participantes y premios.</p></div> :
                <ul className="rf-raffles">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="rf-raffle" onClick={() => open(s.id)} data-testid={`card-raffle-${s.id}`}>
                        <span className={`rf-badge ${s.status === 'drawn' ? 'is-drawn' : ''}`}>{s.status === 'drawn' ? 'Sorteado' : 'Borrador'}</span>
                        <strong>{s.title}</strong>
                        {s.description && <small>{s.description}</small>}
                        <span className="rf-raffle-meta">{s.participant_count} participantes · {s.prize_count} premios · {fmtDate(s.drawn_at ?? s.created_at)}</span>
                      </button>
                    </li>))}
                </ul>}
            {listState === 'error' && <p className="rf-err" role="alert">No se pudo actualizar la lista: {listError}</p>}
          </section>
        </div>
      )}
      <ConfirmDialog confirmation={confirmation} busy={busy} onClose={() => setConfirmation(null)} />
    </main>
  );
}
