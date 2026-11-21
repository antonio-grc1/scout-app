import React from 'react';
import { cn } from '../../lib/utils';

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'err' | 'info';
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const VALUE_TONE_CLASS: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'text-ink',
  brand: 'text-brand',
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  err: 'text-rose-600 dark:text-rose-400',
  info: 'text-sky-600 dark:text-sky-400',
};

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  active = false,
  onClick,
  className,
}) => {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick } : {})}
      className={cn(
        's-card rounded-2xl p-4 sm:p-5 text-left flex flex-col justify-between gap-2 min-w-0',
        interactive && 's-card-hover w-full',
        active && 'border-brand bg-brand-soft/20',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted line-clamp-2">
          {label}
        </span>
        {icon && <span className={cn('shrink-0', VALUE_TONE_CLASS[tone])}>{icon}</span>}
      </div>

      <div className={cn('text-xl sm:text-[1.625rem] font-extrabold s-tabular leading-tight break-words', VALUE_TONE_CLASS[tone])}>
        {value}
      </div>

      {hint && (
        <div className="text-xs sm:text-[13px] text-ink-muted leading-snug line-clamp-2">
          {hint}
        </div>
      )}
    </Tag>
  );
};
