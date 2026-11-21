import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface BotonVerContrasenaProps {
  visible: boolean;
  onToggle: () => void;
  /** Texto que completa "Ver …" / "Ocultar …", p. ej. "contraseña actual" */
  etiqueta?: string;
}

/**
 * Botón estándar para mostrar u ocultar una contraseña. Se posiciona dentro de un contenedor
 * `relative` que envuelve al input (que debe reservar `pr-12`).
 */
export const BotonVerContrasena: React.FC<BotonVerContrasenaProps> = ({
  visible,
  onToggle,
  etiqueta = 'contraseña',
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={`${visible ? 'Ocultar' : 'Ver'} ${etiqueta}`}
    aria-pressed={visible}
    className="absolute inset-y-0 right-0 min-w-[44px] px-3 flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
  >
    {visible ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
  </button>
);
