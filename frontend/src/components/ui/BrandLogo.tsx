import React, { useState } from 'react';
import { cn } from '../../lib/utils';

export interface BrandLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'icon' | 'full' | 'text' | 'transparent';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  subtitleText?: string;
  center?: boolean;
  scaleOverride?: number;
  alt?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'icon',
  size = 'md',
  showSubtitle = false,
  subtitleText = 'Grupo Scout Juan XXIII',
  center = false,
  scaleOverride,
  alt = 'Grupo Scout Juan XXIII',
  className,
  style,
  ...props
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  // Asset paths in frontend/public/brand/
  const assetMap: Record<string, string> = {
    icon: '/brand/Logo%20Juancho%20Icono.png',
    full: '/brand/Logo%20Juancho.png',
    text: '/brand/Logo%20Juancho.png',
    transparent: '/brand/Logo%20Juancho.png',
  };

  const imageSrc = assetMap[variant] || assetMap.icon;
  const isHorizontal = variant === 'full' || variant === 'transparent' || variant === 'text';

  // Responsive dimensions
  const sizeClasses = {
    sm: isHorizontal ? 'w-24 h-9 sm:w-28 sm:h-10' : 'w-8 h-8 sm:w-9 sm:h-9',
    md: isHorizontal ? 'w-36 h-14 sm:w-40 sm:h-16' : 'w-10 h-10 sm:w-11 sm:h-11',
    lg: isHorizontal ? 'w-52 h-20 sm:w-64 sm:h-24' : 'w-16 h-16 sm:w-20 sm:h-20',
  };

  const scaleValue = scaleOverride !== undefined ? scaleOverride : 'var(--brand-logo-scale, 1)';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 transition-transform duration-150 m-1',
        center && 'flex-col justify-center text-center mx-auto',
        className,
      )}
      style={{
        transform: `scale(${scaleValue})`,
        transformOrigin: center ? 'center center' : 'left center',
        ...style,
      }}
      {...props}
    >
      <div className={cn('relative shrink-0 flex items-center justify-center p-0.5', sizeClasses[size])}>
        {!imageFailed ? (
          <img
            src={imageSrc}
            alt={alt}
            onError={() => setImageFailed(true)}
            className="w-full h-full object-contain drop-shadow-2xs select-none"
            loading="eager"
          />
        ) : (
          // Elegant vector scout insignia fallback
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-full h-full text-brand drop-shadow-2xs"
            aria-label={alt}
          >
            <path d="M12 2L9 9C9 9 5 10 5 14C5 17.5 8 19 12 22C16 19 19 17.5 19 14C19 10 15 9 15 9L12 2Z" fill="currentColor" fillOpacity="0.2" />
            <path d="M12 2V22" />
            <path d="M7 13C8.5 14.5 10 15 12 15C14 15 15.5 14.5 17 13" />
          </svg>
        )}
      </div>

      {(variant === 'text' || variant === 'full' || showSubtitle) && (
        <div className={cn('min-w-0', center ? 'text-center' : 'text-left')}>
          <span className="font-extrabold text-ink text-sm sm:text-base leading-tight block truncate font-display">
            Grupo Scout Juan XXIII
          </span>
          {showSubtitle && subtitleText && (
            <span className="text-[11px] text-ink-muted leading-tight block truncate">
              {subtitleText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
