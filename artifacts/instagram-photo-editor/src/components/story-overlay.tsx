import { Heart, Send, X } from 'lucide-react';
import { CanvasView } from '@/components/preview-views';
import { sizes } from '@/lib/presentation';

type Flags = { guides: boolean; ui: boolean };

export function StoryOverlay({ guides, ui, handle }: Flags & { handle: string }) {
  const name = handle || '@tu_usuario';
  return (
    <div className="story-overlay" aria-hidden="true" data-testid="overlay-story">
      {guides && <>
        <div className="story-safe story-safe-top" style={{ height: `${sizes.story.safeTop / sizes.story.height * 100}%` }}><span>Zona superior · {sizes.story.safeTop} px</span></div>
        <div className="story-safe story-safe-bottom" style={{ height: `${sizes.story.safeBottom / sizes.story.height * 100}%` }}><span>Zona inferior · {sizes.story.safeBottom} px</span></div>
      </>}
      {ui && <>
        <div className="story-ui-top">
          <div className="story-progress"><i /></div>
          <div className="story-account"><span className="story-avatar">{(name.replace('@', '')[0] || 'f').toUpperCase()}</span><b>{name.replace('@', '')}</b><em>2 h</em><X size={14} /></div>
        </div>
        <div className="story-ui-bottom"><span className="story-reply">Enviar mensaje</span><Heart size={18} /><Send size={18} /></div>
      </>}
    </div>
  );
}

export function StoryToggles({ guides, ui, onGuides, onUi }: Flags & { onGuides: (v: boolean) => void; onUi: (v: boolean) => void }) {
  return (
    <fieldset className="story-toggles">
      <legend>Solo vista previa · no se incluye en la descarga</legend>
      <label><input type="checkbox" checked={guides} data-testid="toggle-story-guides" onChange={(e) => onGuides(e.target.checked)} /> Guías de zona segura</label>
      <label><input type="checkbox" checked={ui} data-testid="toggle-story-ui" onChange={(e) => onUi(e.target.checked)} /> Interfaz simulada de Instagram</label>
    </fieldset>
  );
}

export function StoryView({ canvas, guides, ui, handle }: Flags & { canvas: HTMLCanvasElement | null; handle: string }) {
  return (
    <div className="pv-wrap" data-testid="view-story">
      <div className="preview-canvas story-frame">
        {canvas ? <CanvasView source={canvas} label="Vista previa de la historia" className="preview-artwork" /> : <div className="ig-empty story-empty">Esta foto aún no está cargada</div>}
        <StoryOverlay guides={guides} ui={ui} handle={handle} />
      </div>
      <p className="small-note">Vista de historia, no de publicación. La interfaz y las guías son una simulación: el archivo real no las incluye.</p>
    </div>
  );
}
