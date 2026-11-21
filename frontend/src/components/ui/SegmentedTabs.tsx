import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedTabsProps<T extends string = string> {
  items: readonly SegmentedTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}

export function SegmentedTabs<T extends string = string>({
  items,
  activeId,
  onChange,
  ariaLabel = 'Secciones',
  className,
}: SegmentedTabsProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // La pestaña activa siempre queda visible (en móvil la franja se desplaza horizontalmente).
  useEffect(() => {
    refs.current[activeId]?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [activeId]);

  // Patrón WAI-ARIA de pestañas: ←/→ (y ↑/↓) cambian de pestaña, Inicio/Fin van a los extremos.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const habilitadas = items.filter((i) => !i.disabled);
    if (habilitadas.length === 0) return;
    const idx = Math.max(0, habilitadas.findIndex((i) => i.id === activeId));
    let destino: SegmentedTabItem<T> | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') destino = habilitadas[(idx + 1) % habilitadas.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      destino = habilitadas[(idx - 1 + habilitadas.length) % habilitadas.length];
    else if (e.key === 'Home') destino = habilitadas[0];
    else if (e.key === 'End') destino = habilitadas[habilitadas.length - 1];
    if (!destino) return;
    e.preventDefault();
    onChange(destino.id);
    refs.current[destino.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('s-scroll-strip no-scrollbar gap-1.5 pb-0.5', className)}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            ref={(el) => {
              refs.current[item.id] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={cn(
              'min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap cursor-pointer select-none transition-colors shrink-0 disabled:opacity-45 disabled:cursor-not-allowed',
              active
                ? 's-btn-brand'
                : 's-btn-sec text-ink-2 hover:text-ink',
            )}
          >
            {item.icon && <span className="shrink-0 inline-flex">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== null && (
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-extrabold s-tabular leading-none',
                  active ? 'bg-black/15 text-inherit' : 'bg-paper-2 text-ink-muted',
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
