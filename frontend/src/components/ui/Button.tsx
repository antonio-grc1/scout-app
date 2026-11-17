import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'pill';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  loadingText?: string;
  asChild?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      asChild = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    // Base ergonomic styling (flat crisp controls, zero glow/halo)
    const baseClasses =
      'inline-flex items-center justify-center font-bold transition-[transform,background-color,border-color,color,opacity] duration-150 cursor-pointer select-none outline-none disabled:opacity-45 disabled:pointer-events-none disabled:cursor-not-allowed';

    // Variant mapping using dynamic CSS tokens
    const variantClasses = {
      primary:
        'bg-brand text-brand-contrast hover:bg-[var(--color-brand-hover)] active:scale-[0.975] shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] border border-transparent font-extrabold',
      secondary:
        'bg-surface text-ink border border-rule hover:bg-paper-2 active:bg-paper-3 active:scale-[0.985] shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
      danger:
        'bg-[var(--s-err-bg)] text-[var(--s-err-ink)] border border-[var(--s-err-border)] hover:brightness-95 dark:hover:brightness-110 active:scale-[0.975] shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 font-bold',
      ghost:
        'text-ink-muted hover:text-ink hover:bg-paper-2 active:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] font-semibold shadow-none',
      pill:
        'rounded-full border border-rule bg-surface text-ink hover:bg-paper-2 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] shadow-none',
    };

    // Size mapping with guaranteed WCAG touch targets & Google Workspace proportions
    const sizeClasses = {
      sm: 'min-h-[38px] px-3.5 py-2 text-[13px] gap-1.5 rounded-xl',
      md: 'min-h-[44px] px-4.5 py-2.5 text-sm gap-2 rounded-xl',
      lg: 'min-h-[50px] px-6 py-3 text-base gap-2.5 rounded-2xl',
    };

    const combinedClassName = cn(
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      variant === 'pill' && 'rounded-full',
      className,
    );

    const content = (
      <>
        {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
        {!loading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        {loading && loadingText ? (
          <span className="whitespace-nowrap">{loadingText}</span>
        ) : (
          children
        )}
        {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </>
    );

    // Polymorphic handling for react-router-dom <Link> or custom anchors
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      return React.cloneElement(child, {
        ...props,
        ...child.props,
        ref,
        className: cn(combinedClassName, child.props.className),
        disabled: isDisabled || child.props.disabled,
        'aria-busy': loading || child.props['aria-busy'],
        'aria-disabled': isDisabled || child.props['aria-disabled'],
        children: (
          <>
            {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />}
            {!loading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
            {loading && loadingText ? (
              <span className="whitespace-nowrap">{loadingText}</span>
            ) : (
              child.props.children
            )}
            {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
          </>
        ),
      });
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        aria-disabled={isDisabled ? 'true' : undefined}
        className={combinedClassName}
        {...props}
      >
        {content}
      </button>
    );
  },
);

Button.displayName = 'Button';
