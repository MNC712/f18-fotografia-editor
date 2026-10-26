import { Check, ChevronDown, Gift, Image as ImageIcon, LayoutGrid } from 'lucide-react';

export type ToolId = 'photo-editor' | 'raffles';

const tools = [
  { id: 'photo-editor', name: 'Editor de fotografías', description: 'Marcos, carruseles y publicación', icon: ImageIcon },
  { id: 'raffles', name: 'Sorteos', description: 'Premios, ganadores e historias', icon: Gift },
] as const;

export function ToolsNavigation({ active, onSelect }: { active: ToolId; onSelect: (id: ToolId) => void }) {
  return (
    <nav className="tools-navigation" aria-label="Herramientas principales">
      <details className="tools-selector" data-testid="tools-selector">
        <summary className="tools-trigger">
          <LayoutGrid size={16} aria-hidden="true" />
          <span>{tools.find((t) => t.id === active)?.name}</span>
          <ChevronDown className="tools-chevron" size={15} aria-hidden="true" />
        </summary>
        <div className="tools-menu">
          <p className="tools-menu-heading">Herramientas disponibles</p>
          {tools.map((tool) => {
            const current = tool.id === active;
            const Icon = tool.icon;
            return (
              <button
                className={`tool-option ${current ? 'is-current' : ''}`}
                type="button"
                aria-current={current ? 'page' : undefined}
                key={tool.id}
                data-testid={`tool-option-${tool.id}`}
                onClick={(event) => {
                  const disclosure = event.currentTarget.closest('details');
                  if (disclosure) disclosure.open = false;
                  onSelect(tool.id);
                }}
              >
                <span className="tool-option-icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="tool-option-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
                {current && <Check className="tool-option-current" size={16} aria-label="Herramienta seleccionada" />}
              </button>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
