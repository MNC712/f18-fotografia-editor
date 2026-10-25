import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteLocalProject, loadLocalProject, localSpaceInfo, saveLocalProject, storageError,
  LocalProjectConflict, readLocalProjectState, watchLocalProject, type LocalProject,
} from './local-project';

export function useLocalProject(project: LocalProject, restore: (project: LocalProject) => void) {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState('Recuperando proyecto local…');
  const [error, setError] = useState(false);
  const [working, setWorking] = useState(false);
  const [space, setSpace] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const latest = useRef(project);
  const restoreRef = useRef(restore);
  const saved = useRef<LocalProject | null>(null);
  const pending = useRef(false);
  const revision = useRef(0);
  const noticedRevision = useRef<number | null>(null);
  const paused = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const manualAction = useRef(false);
  const firstReady = useRef(true);
  latest.current = project;
  restoreRef.current = restore;
  // Pausing autosave must not suppress the warning about unsaved edits.
  pending.current = ready && saved.current !== project;

  const report = useCallback((cause: unknown) => {
    paused.current = true;
    setEnabled(false);
    setError(true);
    setStatus(storageError(cause));
    if (cause instanceof LocalProjectConflict) {
      noticedRevision.current = cause.state.revision;
      setConflicted(true);
      setHasSaved(cause.state.hasSaved);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadLocalProject();
        if (cancelled) {
          result.project?.photos.forEach((photo) => { if (photo.url) URL.revokeObjectURL(photo.url); });
          return;
        }
        revision.current = result.revision;
        if (result.project) {
          restoreRef.current(result.project);
          setHasSaved(true);
          setStatus('Proyecto recuperado de este dispositivo.');
        } else setStatus('Guardado automático en este dispositivo.');
      } catch (cause) {
        if (!cancelled) report(cause);
      } finally {
        if (!cancelled) {
          setReady(true);
          void localSpaceInfo().then(setSpace);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [report]);

  const write = useCallback((snapshot: LocalProject, expectedRevision?: number): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (paused.current && expectedRevision === undefined) return Promise.resolve();
    setWorking(true);
    setError(false);
    setStatus('Guardando en este dispositivo…');
    const operation = (async () => {
      try {
        const result = await saveLocalProject(snapshot, expectedRevision ?? revision.current);
        revision.current = result.revision;
        noticedRevision.current = null;
        saved.current = snapshot;
        pending.current = latest.current !== snapshot;
        paused.current = false;
        setEnabled(true);
        setConflicted(false);
        setHasSaved(true);
        setStatus(`Guardado en este dispositivo · ${new Date(result.savedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`);
        void localSpaceInfo().then(setSpace);
      } catch (cause) {
        report(cause);
      } finally {
        inFlight.current = null;
        setWorking(false);
      }
    })();
    inFlight.current = operation;
    return operation;
  }, [report]);

  useEffect(() => {
    if (ready && firstReady.current) {
      firstReady.current = false;
      saved.current = project;
      pending.current = false;
      return;
    }
    if (!ready || !enabled || working || paused.current || saved.current === project) return;
    setStatus('Cambios pendientes de guardar…');
    const timer = window.setTimeout(() => {
      if (!manualAction.current) void write(project);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [project, ready, enabled, working, write]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const check = async () => {
      // Wait for this tab's own save before comparing its revision.
      await inFlight.current;
      if (cancelled || manualAction.current) return;
      const checkingRevision = revision.current;
      try {
        const state = await readLocalProjectState();
        if (!cancelled && !manualAction.current && !inFlight.current && revision.current === checkingRevision
          && state.revision !== revision.current
          && state.revision !== noticedRevision.current) report(new LocalProjectConflict(state));
      } catch (cause) {
        if (!cancelled) report(cause);
      }
    };
    const unwatch = watchLocalProject(() => void check());
    void check(); // Covers changes during initial photo decoding.
    return () => { cancelled = true; unwatch(); };
  }, [ready, report]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const saveNow = async () => {
    if (!ready || manualAction.current) return;
    manualAction.current = true;
    try {
      await inFlight.current;
      const state = await readLocalProjectState();
      if (state.revision !== revision.current || paused.current) {
        const message = state.hasSaved
          ? 'Guardar esta edición sustituirá el proyecto guardado, incluidos los cambios de otra pestaña. ¿Continuar?'
          : 'El proyecto local fue eliminado o el guardado está pausado. ¿Quieres guardar de nuevo esta edición en el dispositivo?';
        if (!window.confirm(message)) {
          if (state.revision !== revision.current) report(new LocalProjectConflict(state));
          return;
        }
      }
      // Compare again atomically: a change after confirmation still cannot be overwritten.
      await write(latest.current, state.revision);
    } catch (cause) { report(cause); }
    finally { manualAction.current = false; }
  };

  const remove = async () => {
    if (!ready || manualAction.current) return;
    if (!window.confirm('¿Eliminar el proyecto guardado de este dispositivo, incluidos los cambios guardados en otras pestañas? Se borrarán sus fotos y ajustes almacenados. Las ediciones abiertas seguirán disponibles, pero su guardado automático se pausará.')) return;
    manualAction.current = true;
    paused.current = true;
    setEnabled(false);
    try {
      await inFlight.current;
      // An in-flight successful save may have resumed autosave.
      paused.current = true;
      setEnabled(false);
      setWorking(true);
      const state = await readLocalProjectState();
      // Delete only a version the user has seen; otherwise ask them to review first.
      if (state.revision !== revision.current && state.revision !== noticedRevision.current) {
        throw new LocalProjectConflict(state);
      }
      const result = await deleteLocalProject(state.revision);
      revision.current = result.revision;
      noticedRevision.current = null;
      saved.current = latest.current;
      pending.current = false;
      setHasSaved(false);
      setConflicted(false);
      setError(false);
      setStatus('Proyecto local eliminado. Guardado automático pausado; la edición sigue abierta.');
      void localSpaceInfo().then(setSpace);
    } catch (cause) { report(cause); }
    finally { manualAction.current = false; setWorking(false); }
  };

  const reloadSaved = () => {
    if (window.confirm('Se descartará la edición abierta en esta pestaña para cargar el proyecto guardado más reciente. Si fue eliminado, el editor quedará vacío. ¿Continuar?')) {
      pending.current = false;
      window.location.reload();
    }
  };
  return { ready, status, error, working, space, hasSaved, conflicted, saveNow, remove, reloadSaved };
}
