/** The same PHP endpoint is used on Ferozo and in development; no local-data fallback. */
export type RaffleSummary = {
  id: number; title: string; description: string; status: 'draft' | 'drawn';
  created_at: string; drawn_at: string | null; participant_count: number; prize_count: number;
};
export type Participant = { id: number; name: string };
export type Prize = { id: number; name: string; description: string; image_url: string | null };
export type RaffleResult = { prize_id: number; participant_id: number; winner_name: string; prize_name: string; prize_description: string; image_url: string | null };
export type Raffle = RaffleSummary & { participants: Participant[]; prizes: Prize[]; results: RaffleResult[] };

const endpoint = `${import.meta.env.BASE_URL}sorteos-api/index.php`;
let csrf: string | null = null;
export class RaffleApiError extends Error {
  constructor(message: string, public status: number, public duplicates: string[] = []) { super(message); }
}
type Reply<T> = { data: T; error?: string; duplicates?: string[] };

async function request<T>(action: string, payload?: Record<string, unknown> | FormData): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (payload && !csrf) {
    const session = await request<{ csrf: string }>('session');
    csrf = session.csrf;
  }
  if (payload) headers['X-CSRF-Token'] = csrf!;
  const body = payload instanceof FormData ? payload : payload ? JSON.stringify(payload) : undefined;
  if (payload && !(payload instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${endpoint}?action=${action}`, {
      method: payload ? 'POST' : 'GET', headers, credentials: 'same-origin', body, cache: 'no-store',
    });
  } catch { throw new RaffleApiError('No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.', 0); }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new RaffleApiError(response.status === 401 || response.status === 403
      ? 'Acceso restringido. Abre el sitio con la contraseña del hosting.'
      : 'Sorteos guarda en JSON privado y necesita PHP en el hosting, sin MySQL. El editor de fotografías sigue disponible.', response.status);
  }
  const reply = await response.json() as Reply<T>;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) csrf = null;
    throw new RaffleApiError(reply.error || 'La operación no pudo completarse.', response.status, reply.duplicates);
  }
  return reply.data;
}

/** Image URLs are kept relative to this artifact on both root and subfolder installations. */
export function prizeImageUrl(path: string | null): string | null {
  return path ? `${endpoint}?action=image&id=${encodeURIComponent(path)}` : null;
}
function hydrate(raffle: Raffle): Raffle {
  return { ...raffle, prizes: raffle.prizes.map(p => ({ ...p, image_url: prizeImageUrl(p.image_url) })),
    results: raffle.results.map(r => ({ ...r, image_url: prizeImageUrl(r.image_url) })) };
}
export const raffleApi = {
  list: () => request<RaffleSummary[]>('list'),
  get: async (id: number) => hydrate(await request<Raffle>(`get&id=${id}`)),
  create: async (title: string, description: string) => hydrate(await request<Raffle>('create', { title, description })),
  update: async (id: number, title: string, description: string) => hydrate(await request<Raffle>('update', { id, title, description })),
  remove: (id: number) => request<{ deleted: boolean }>('delete', { id }),
  addParticipants: async (id: number, names: string[]) => hydrate(await request<Raffle>('participants-add', { id, names })),
  updateParticipant: async (id: number, participant_id: number, name: string) => hydrate(await request<Raffle>('participant-update', { id, participant_id, name })),
  removeParticipant: async (id: number, participant_id: number) => hydrate(await request<Raffle>('participant-delete', { id, participant_id })),
  savePrize: async (id: number, prize: { id?: number; name: string; description: string; image?: File; remove_image?: boolean }) => {
    const form = new FormData();
    form.set('id', String(id)); form.set('name', prize.name); form.set('description', prize.description);
    if (prize.id) form.set('prize_id', String(prize.id));
    if (prize.image) form.set('image', prize.image);
    if (prize.remove_image) form.set('remove_image', '1');
    return hydrate(await request<Raffle>('prize-save', form));
  },
  removePrize: async (id: number, prize_id: number) => hydrate(await request<Raffle>('prize-delete', { id, prize_id })),
  draw: async (id: number) => hydrate(await request<Raffle>('draw', { id })),
  duplicate: async (id: number) => hydrate(await request<Raffle>('duplicate', { id })),
};
