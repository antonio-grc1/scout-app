import React from 'react';
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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('s-scroll-strip no-scrollbar gap-1.5 pb-0.5', className)}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
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
