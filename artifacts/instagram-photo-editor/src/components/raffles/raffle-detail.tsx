import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Dices, ImagePlus, Pencil, Plus, Trash2, Trophy, X } from 'lucide-react';
import type { Participant, Prize, Raffle } from '@/lib/raffle-api';
import { LIMITS, fmtDate, parseNames, validateImage } from './validation';
import type { Confirmation } from './confirm-dialog';

export type PrizeDraft = { id?: number; name: string; description: string; image?: File; remove_image?: boolean };
export type Actions = {
  update: (t: string, d: string) => Promise<Raffle | null>;
  addNames: (names: string[]) => Promise<boolean>;
  editParticipant: (id: number, name: string) => Promise<boolean>;
  removeParticipant: (id: number) => Promise<boolean>;
  savePrize: (p: PrizeDraft) => Promise<boolean>;
  removePrize: (id: number) => Promise<boolean>;
  draw: () => Promise<boolean>;
  duplicate: () => Promise<boolean>;
  remove: () => Promise<boolean>;
};
type FlagSetter = (key: string, dirty: boolean) => void;
function useDirtyFlag(key: string, dirty: boolean, set: FlagSetter) {
  useEffect(() => { set(key, dirty); return () => set(key, false); }, [key, dirty, set]);
}

export type ActionError = { message: string; duplicates: string[] } | null;

function DetailsForm({ raffle, busy, locked, actions, setFlag }: { raffle: Raffle; busy: boolean; locked: boolean; actions: Actions; setFlag: FlagSetter }) {
  const [title, setTitle] = useState(raffle.title);
  const [description, setDescription] = useState(raffle.description);
  const base = useRef({ title: raffle.title, description: raffle.description });
  const [stale, setStale] = useState(false);
  const dirty = title !== base.current.title || description !== base.current.description;
  const saving = useRef(false);
  useDirtyFlag('details', dirty && !locked, setFlag);
  useEffect(() => {
    if (saving.current) return;
    const incoming = { title: raffle.title, description: raffle.description };
    if (incoming.title === base.current.title && incoming.description === base.current.description) return;
    if (!dirty || locked) { base.current = incoming; setTitle(incoming.title); setDescription(incoming.description); setStale(false); }
    else setStale(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raffle.title, raffle.description, locked]);
  const valid = title.trim().length > 0;
  return (
    <form className="rf-card" onSubmit={async (e) => {
      e.preventDefault();
      if (!valid || busy) return;
      saving.current = true;
      try {
        const saved = await actions.update(title.trim(), description.trim());
        if (saved) { base.current = { title: saved.title, description: saved.description }; setTitle(saved.title); setDescription(saved.description); setStale(false); }
      } finally { saving.current = false; }
    }}>
      <h3 className="rf-h3">Datos del sorteo</h3>
      {stale && <div className="rf-banner" role="status">Hay una versión más reciente en el servidor.
        <button type="button" className="rf-link" onClick={() => { setTitle(raffle.title); setDescription(raffle.description); base.current = { title: raffle.title, description: raffle.description }; setStale(false); }}>Cargar versión del servidor</button></div>}
      <label className="rf-field"><span>Título <em>{title.length}/{LIMITS.title}</em></span>
        <input className="rf-input" value={title} maxLength={LIMITS.title} disabled={locked || busy} onChange={(e) => setTitle(e.target.value)} data-testid="input-raffle-title" /></label>
      <label className="rf-field"><span>Descripción <em>{description.length}/{LIMITS.description}</em></span>
        <textarea className="rf-input" rows={3} value={description} maxLength={LIMITS.description} disabled={locked || busy} onChange={(e) => setDescription(e.target.value)} data-testid="input-raffle-description" /></label>
      {!locked && <button className="rf-btn rf-btn-primary" type="submit" disabled={!dirty || !valid || busy} data-testid="button-save-raffle">{busy ? 'Guardando…' : 'Guardar datos'}</button>}
    </form>
  );
}

function ParticipantRow({ p, busy, locked, actions, ask, setFlag }: { p: Participant; busy: boolean; locked: boolean; actions: Actions; ask: (c: Confirmation) => void; setFlag: FlagSetter }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  useDirtyFlag(`participant-${p.id}`, editing && !locked && name.trim() !== p.name, setFlag);
  if (editing && !locked) return (
    <li className="rf-row">
      <input className="rf-input" value={name} maxLength={LIMITS.participant} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Nombre del participante" data-testid={`input-participant-${p.id}`}
        onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setName(p.name); } }} />
      <button type="button" className="rf-icon" aria-label="Guardar" disabled={busy || !name.trim()} data-testid={`button-participant-save-${p.id}`}
        onClick={async () => { if (await actions.editParticipant(p.id, name.trim())) setEditing(false); }}><Check size={16} /></button>
      <button type="button" className="rf-icon" aria-label="Cancelar" onClick={() => { setEditing(false); setName(p.name); }}><X size={16} /></button>
    </li>
  );
  return (
    <li className="rf-row">
      <span className="rf-row-name">{p.name}</span>
      {!locked && <>
        <button type="button" className="rf-icon" aria-label={`Editar ${p.name}`} disabled={busy} onClick={() => { setName(p.name); setEditing(true); }} data-testid={`button-participant-edit-${p.id}`}><Pencil size={15} /></button>
        <button type="button" className="rf-icon" aria-label={`Eliminar ${p.name}`} disabled={busy} data-testid={`button-participant-delete-${p.id}`}
          onClick={() => ask({ title: 'Eliminar participante', body: `Se eliminará «${p.name}» de la lista.`, label: 'Eliminar', danger: true, run: () => actions.removeParticipant(p.id) })}><Trash2 size={15} /></button>
      </>}
    </li>
  );
}

function Participants({ raffle, busy, locked, actions, error, ask, setFlag }: { raffle: Raffle; busy: boolean; locked: boolean; actions: Actions; error: ActionError; ask: (c: Confirmation) => void; setFlag: FlagSetter }) {
  const [text, setText] = useState('');
  useDirtyFlag('bulk', !locked && text.trim().length > 0, setFlag);
  const [filter, setFilter] = useState('');
  const names = useMemo(() => parseNames(text), [text]);
  const tooLong = names.find((n) => n.length > LIMITS.participant);
  const over = raffle.participants.length + names.length > LIMITS.participants;
  const shown = raffle.participants.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section className="rf-card" aria-labelledby="rf-part-h">
      <div className="rf-card-head"><h3 className="rf-h3" id="rf-part-h">Participantes</h3><span className="rf-count">{raffle.participants.length} / {LIMITS.participants}</span></div>
      {!locked && (
        <form onSubmit={async (e) => { e.preventDefault(); if (!names.length || tooLong || over || busy) return; if (await actions.addNames(names)) setText(''); }}>
          <label className="rf-field"><span>Añadir nombres, uno por línea</span>
            <textarea className="rf-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Lucía Ferrer\nMarcos Ibáñez'} data-testid="input-participants-bulk" /></label>
          {tooLong && <p className="rf-err">Un nombre supera los {LIMITS.participant} caracteres: «{tooLong.slice(0, 30)}…»</p>}
          {over && <p className="rf-err">El máximo es {LIMITS.participants} participantes.</p>}
          {error?.duplicates.length ? <div className="rf-err" role="alert">Nombres repetidos: {error.duplicates.join(', ')}</div> : null}
          <button className="rf-btn rf-btn-primary" type="submit" disabled={!names.length || !!tooLong || over || busy} data-testid="button-add-participants"><Plus size={16} /> {busy ? 'Guardando…' : 'Añadir'} {names.length ? `${names.length} ` : ''}participante{names.length === 1 ? '' : 's'}</button>
        </form>
      )}
      {raffle.participants.length > 8 && <input className="rf-input rf-filter" placeholder="Buscar participante" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar participante" data-testid="input-participant-filter" />}
      {raffle.participants.length === 0 ? <p className="rf-empty">Aún no hay participantes. Pega la lista de nombres para empezar.</p> :
        <ul className="rf-list">{shown.map((p) => <ParticipantRow key={p.id} p={p} busy={busy} locked={locked} actions={actions} ask={ask} setFlag={setFlag} />)}</ul>}
    </section>
  );
}

function PrizeForm({ prize, busy, actions, onDone, setFlag }: { prize?: Prize; busy: boolean; actions: Actions; onDone: () => void; setFlag: FlagSetter }) {
  const [name, setName] = useState(prize?.name ?? '');
  const [description, setDescription] = useState(prize?.description ?? '');
  const [file, setFile] = useState<File | undefined>();
  const [removeImage, setRemoveImage] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [validating, setValidating] = useState(false);
  const seq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const changed = prize
    ? name.trim() !== prize.name || description.trim() !== prize.description || !!file || removeImage
    : !!(name.trim() || description.trim() || file);
  useDirtyFlag(`prize-${prize?.id ?? 'new'}`, changed, setFlag);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const shownImage = preview ?? (removeImage ? null : prize?.image_url ?? null);
  return (
    <form className="rf-prize-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim() || busy || problem || validating) return;
      if (await actions.savePrize({ id: prize?.id, name: name.trim(), description: description.trim(), image: file, remove_image: removeImage && !file })) onDone();
    }}>
      <div className="rf-prize-media">
        <div className="rf-thumb">{shownImage ? <img src={shownImage} alt="" /> : <ImagePlus size={26} aria-hidden="true" />}</div>
        <input ref={input} type="file" className="rf-hidden" accept="image/jpeg,image/png,image/webp" data-testid="input-prize-image"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const mine = ++seq.current; setValidating(true); const p = await validateImage(f); if (!mounted.current || mine !== seq.current) return; setValidating(false); setProblem(p); if (!p) { setFile(f); setRemoveImage(false); } }} />
        <button type="button" className="rf-btn" onClick={() => input.current?.click()} disabled={busy || validating}>{validating ? 'Comprobando imagen…' : shownImage ? 'Cambiar imagen' : 'Elegir imagen'}</button>
        {(file || (prize?.image_url && !removeImage)) && <button type="button" className="rf-btn" disabled={busy} onClick={() => { seq.current++; setValidating(false); setProblem(null); setFile(undefined); setRemoveImage(!!prize?.image_url); }}>Quitar imagen</button>}
        <small>JPEG, PNG o WebP · máx. 8 MB · 20 megapíxeles</small>
      </div>
      {problem && <p className="rf-err" role="alert">{problem}</p>}
      <label className="rf-field"><span>Nombre del premio <em>{name.length}/{LIMITS.prize}</em></span>
        <input className="rf-input" value={name} maxLength={LIMITS.prize} onChange={(e) => setName(e.target.value)} data-testid="input-prize-name" /></label>
      <label className="rf-field"><span>Descripción <em>{description.length}/{LIMITS.description}</em></span>
        <textarea className="rf-input" rows={3} value={description} maxLength={LIMITS.description} onChange={(e) => setDescription(e.target.value)} data-testid="input-prize-description" /></label>
      <div className="rf-actions">
        <button type="submit" className="rf-btn rf-btn-primary" disabled={!name.trim() || busy || !!problem || validating} data-testid="button-save-prize">{busy ? 'Guardando…' : prize ? 'Guardar premio' : 'Añadir premio'}</button>
        {(prize || name || description || file) && <button type="button" className="rf-btn" disabled={busy} onClick={onDone}>Cancelar</button>}
      </div>
    </form>
  );
}

function Prizes({ raffle, busy, locked, actions, ask, setFlag }: { raffle: Raffle; busy: boolean; locked: boolean; actions: Actions; ask: (c: Confirmation) => void; setFlag: FlagSetter }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const full = raffle.prizes.length >= LIMITS.prizes;
  return (
    <section className="rf-card" aria-labelledby="rf-prize-h">
      <div className="rf-card-head"><h3 className="rf-h3" id="rf-prize-h">Premios</h3><span className="rf-count">{raffle.prizes.length} / {LIMITS.prizes}</span></div>
      {raffle.prizes.length === 0 && editing !== 'new' && <p className="rf-empty">Sin premios todavía. Cada premio tendrá un ganador distinto.</p>}
      <ul className="rf-prizes">
        {raffle.prizes.map((p, i) => (
          <li key={p.id} className="rf-prize">
            {editing === p.id && !locked ? <PrizeForm prize={p} busy={busy} actions={actions} setFlag={setFlag} onDone={() => setEditing(null)} /> : (
              <>
                <div className="rf-thumb">{p.image_url ? <img src={p.image_url} alt={`Imagen de ${p.name}`} /> : <span>{i + 1}</span>}</div>
                <div className="rf-prize-copy"><strong>{p.name}</strong>{p.description && <p>{p.description}</p>}</div>
                {!locked && <div className="rf-prize-actions">
                  <button type="button" className="rf-icon" aria-label={`Editar ${p.name}`} disabled={busy} onClick={() => setEditing(p.id)} data-testid={`button-prize-edit-${p.id}`}><Pencil size={15} /></button>
                  <button type="button" className="rf-icon" aria-label={`Eliminar ${p.name}`} disabled={busy} data-testid={`button-prize-delete-${p.id}`}
                    onClick={() => ask({ title: 'Eliminar premio', body: `Se eliminará «${p.name}» y su imagen.`, label: 'Eliminar', danger: true, run: () => actions.removePrize(p.id) })}><Trash2 size={15} /></button>
                </div>}
              </>)}
          </li>))}
      </ul>
      {!locked && (editing === 'new' ? <PrizeForm busy={busy} actions={actions} setFlag={setFlag} onDone={() => setEditing(null)} /> :
        <button type="button" className="rf-btn" disabled={busy || full || editing !== null} onClick={() => setEditing('new')} data-testid="button-new-prize"><Plus size={16} /> {full ? 'Máximo de premios alcanzado' : 'Añadir premio'}</button>)}
    </section>
  );
}

export function RaffleDetail({ raffle, busy, actions, error, onDirty, ask, onResults }: {
  raffle: Raffle; busy: boolean; actions: Actions; error: ActionError; onDirty: (d: boolean) => void; ask: (c: Confirmation) => void; onResults: () => void;
}) {
  const drawn = raffle.status === 'drawn';
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [nonce, setNonce] = useState(0);
  const setFlag = useCallback<FlagSetter>((k, v) => setFlags((f) => (!!f[k] === v ? f : { ...f, [k]: v })), []);
  const pending = Object.values(flags).some(Boolean);
  useEffect(() => { onDirty(pending); }, [pending, onDirty]);
  const pc = raffle.participants.length, zc = raffle.prizes.length;
  const reason = pending ? 'Guarda o descarta los cambios pendientes antes de sortear.' : zc === 0 ? 'Añade al menos un premio.' : pc < zc ? `Faltan participantes: ${zc} premio${zc === 1 ? '' : 's'} necesita${zc === 1 ? '' : 'n'} ${zc} nombres distintos y hay ${pc}.` : null;
  return (
    <div className="rf-detail">
      <div className="rf-detail-head">
        <div><span className={`rf-badge ${drawn ? 'is-drawn' : ''}`}>{drawn ? 'Sorteado' : 'Borrador'}</span>
          <h2 className="rf-title" data-testid="text-raffle-title">{raffle.title}</h2>
          {drawn && <p className="rf-meta">Sorteado el {fmtDate(raffle.drawn_at)}. Solo lectura.</p>}</div>
        <div className="rf-actions">
          {drawn && <button type="button" className="rf-btn rf-btn-primary" onClick={onResults} data-testid="button-view-results"><Trophy size={16} /> Ver resultados e historias</button>}
          {drawn && <button type="button" className="rf-btn" disabled={busy} onClick={() => ask({ title: 'Duplicar sorteo', body: 'Se creará un borrador nuevo con los mismos participantes y premios, sin resultados.', label: 'Duplicar', run: actions.duplicate })} data-testid="button-duplicate-raffle"><Copy size={16} /> Duplicar sin resultados</button>}
          <button type="button" className="rf-btn rf-btn-danger-ghost" disabled={busy} onClick={() => ask({ title: 'Eliminar sorteo', body: `Se eliminará «${raffle.title}» con sus participantes, premios, imágenes y resultados. No se puede deshacer.`, label: 'Eliminar sorteo', danger: true, run: actions.remove })} data-testid="button-delete-raffle"><Trash2 size={16} /> Eliminar</button>
        </div>
      </div>
      {error && !error.duplicates.length && <div className="rf-alert" role="alert" data-testid="text-action-error">{error.message}</div>}
      {error && error.duplicates.length > 0 && <div className="rf-alert" role="alert">{error.message}</div>}
      {pending && <div className="rf-banner" role="status">Tienes cambios sin guardar. <button type="button" className="rf-link" disabled={busy} onClick={() => setNonce((n) => n + 1)} data-testid="button-discard-pending">Descartar cambios pendientes</button></div>}
      <DetailsForm key={`d${nonce}`} raffle={raffle} busy={busy} locked={drawn} actions={actions} setFlag={setFlag} />
      <div className="rf-two">
        <Participants key={`p${nonce}`} raffle={raffle} busy={busy} locked={drawn} actions={actions} error={error} ask={ask} setFlag={setFlag} />
        <Prizes key={`z${nonce}`} raffle={raffle} busy={busy} locked={drawn} actions={actions} ask={ask} setFlag={setFlag} />
      </div>
      {!drawn && (
        <div className="rf-draw">
          <div><h3 className="rf-h3">Realizar el sorteo</h3><p>{reason ?? `${pc} participantes compiten por ${zc} premio${zc === 1 ? '' : 's'}. El resultado es definitivo.`}</p></div>
          <button type="button" className="rf-btn rf-btn-primary rf-btn-lg" disabled={!!reason || busy} data-testid="button-draw"
            onClick={() => ask({ title: 'Confirmar sorteo', body: `Se sortearán ${zc} premio${zc === 1 ? '' : 's'} entre ${pc} participantes. Después el sorteo quedará bloqueado y no podrás editarlo.`, label: 'Sortear ahora', run: actions.draw })}><Dices size={18} /> {busy ? 'Procesando…' : 'Sortear'}</button>
        </div>)}
    </div>
  );
}
