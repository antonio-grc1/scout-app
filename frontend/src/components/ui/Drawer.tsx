import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { cn } from '../../lib/utils';

export interface DrawerProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** 'drawer': right slide-over on desktop, bottom-sheet on mobile. 'sheet': centered dialog on desktop, bottom-sheet on mobile. 'modal': centered dialog everywhere. */
  mode?: 'drawer' | 'sheet' | 'modal';
  maxWidthClass?: string;
  allowFullscreen?: boolean;
  bloqueado?: boolean;
  bodyClassName?: string;
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  headerExtra,
  footer,
  children,
  mode = 'drawer',
  maxWidthClass = 'sm:max-w-xl',
  allowFullscreen = false,
  bloqueado = false,
  bodyClassName,
  className,
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const titleId = useId();
  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado,
  });

  if (!abierto) return null;

  const backdropAlignment =
    mode === 'drawer'
      ? 'items-end sm:items-stretch sm:justify-end p-0'
      : mode === 'sheet'
        ? 'items-end sm:items-center justify-center p-0 sm:p-4'
        : 'items-center justify-center p-3 sm:p-4';

  const panelGeometry = fullscreen
    ? 'w-full h-full max-w-none max-h-none rounded-none border-0 s-anim-modal-pop'
    : mode === 'drawer'
      ? cn(
          'w-full max-h-[92dvh] sm:h-full sm:max-h-full rounded-t-2xl sm:rounded-none sm:border-l border-t sm:border-t-0 s-anim-sheet-up sm:s-anim-drawer-right',
          maxWidthClass,
        )
      : mode === 'sheet'
        ? cn(
            'w-full max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border s-anim-sheet-up sm:s-anim-modal-pop',
            maxWidthClass,
          )
        : cn('w-full max-h-[90dvh] rounded-2xl border s-anim-modal-pop', maxWidthClass);

  return createPortal(
    <div
      className={cn(
        's-anim-backdrop fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex',
        backdropAlignment,
      )}
      role="presentation"
      {...backdropProps}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'bg-surface text-ink border-rule shadow-2xl flex flex-col overflow-hidden',
          panelGeometry,
          className,
        )}
        {...contentProps}
      >
        <div className="s-glass-bar px-5 py-3.5 border-b border-rule flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-base sm:text-lg font-extrabold text-ink leading-snug truncate"
            >
              {titulo}
            </h2>
            {subtitulo && (
              <div className="text-xs sm:text-sm text-ink-muted leading-snug mt-0.5 truncate">
                {subtitulo}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtra}
            {allowFullscreen && (
              <button
                type="button"
                onClick={() => setFullscreen((prev) => !prev)}
                aria-label={fullscreen ? 'Salir de pantalla completa' : 'Expandir a pantalla completa'}
                title={fullscreen ? 'Salir de pantalla completa' : 'Expandir'}
                className="s-btn-sec min-w-[38px] min-h-[38px] p-2 rounded-xl flex items-center justify-center cursor-pointer"
              >
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
            {!bloqueado && (
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar panel"
                className="s-btn-sec min-w-[38px] min-h-[38px] p-2 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className={cn('flex-1 overflow-y-auto p-5 sm:p-6 space-y-5', bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div className="px-5 py-3.5 border-t border-rule bg-paper-2 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
