import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      id,
      label,
      error,
      helperText,
      leftIcon,
      rightAction,
      containerClassName,
      required,
      type = 'text',
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className={cn('space-y-1.5 text-left', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs sm:text-sm font-bold text-ink leading-none"
          >
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            required={required}
            aria-invalid={Boolean(error) ? 'true' : undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border bg-surface text-ink placeholder:text-ink-muted text-base sm:text-sm transition-colors outline-none',
              leftIcon && 'pl-10',
              rightAction && 'pr-11',
              error
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25'
                : 'border-rule focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25',
              className,
            )}
            {...props}
          />

          {rightAction && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center">
              {rightAction}
            </div>
          )}
        </div>

        {error && (
          <div
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-ink-muted mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

/* -------------------------------------------------------------------------- */
/*                               SELECT SUB-COMPONENT                         */
/* -------------------------------------------------------------------------- */

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      id,
      label,
      error,
      helperText,
      leftIcon,
      containerClassName,
      required,
      children,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className={cn('space-y-1.5 text-left', containerClassName)}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs sm:text-sm font-bold text-ink leading-none"
          >
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}

          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={Boolean(error) ? 'true' : undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border bg-surface text-ink text-base sm:text-sm transition-colors outline-none cursor-pointer',
              leftIcon && 'pl-10',
              error
                ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25'
                : 'border-rule focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25',
              className,
            )}
            {...props}
          >
            {children}
          </select>
        </div>

        {error && (
          <div
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-ink-muted mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';

/* -------------------------------------------------------------------------- */
/*                              TEXTAREA SUB-COMPONENT                        */
/* -------------------------------------------------------------------------- */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      id,
      label,
      error,
      helperText,
      containerClassName,
      required,
      rows = 3,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    return (
      <div className={cn('space-y-1.5 text-left', containerClassName)}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs sm:text-sm font-bold text-ink leading-none"
          >
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          required={required}
          aria-invalid={Boolean(error) ? 'true' : undefined}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={cn(
            'w-full min-h-[80px] px-3.5 py-2.5 rounded-xl border bg-surface text-ink placeholder:text-ink-muted text-base sm:text-sm transition-colors outline-none resize-y',
            error
              ? 'border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25'
              : 'border-rule focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25',
            className,
          )}
          {...props}
        />

        {error && (
          <div
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-ink-muted mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
