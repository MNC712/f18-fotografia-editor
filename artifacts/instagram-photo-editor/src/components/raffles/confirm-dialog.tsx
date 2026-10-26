import { useEffect, useRef } from 'react';

export type Confirmation = { title: string; body: string; label: string; danger?: boolean; run: () => Promise<unknown> };

export function ConfirmDialog({ confirmation, busy, onClose }: { confirmation: Confirmation | null; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (confirmation && !dialog.open) dialog.showModal();
    if (!confirmation && dialog.open) dialog.close();
  }, [confirmation]);
  return (
    <dialog ref={ref} className="rf-dialog" aria-labelledby="rf-confirm-title" aria-describedby="rf-confirm-body" data-testid="dialog-confirm" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
      {confirmation && (
        <div>
          <h3 id="rf-confirm-title">{confirmation.title}</h3>
          <p id="rf-confirm-body">{confirmation.body}</p>
          <div className="rf-dialog-actions">
            <button type="button" className="rf-btn" disabled={busy} onClick={onClose} data-testid="button-confirm-cancel">Cancelar</button>
            <button type="button" className={`rf-btn ${confirmation.danger ? 'rf-btn-danger' : 'rf-btn-primary'}`} disabled={busy} data-testid="button-confirm-accept"
              onClick={() => { void confirmation.run().then(onClose, onClose); }}>{busy ? 'Procesando…' : confirmation.label}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
