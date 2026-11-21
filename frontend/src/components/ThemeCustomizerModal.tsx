import React from 'react';
import { Sun, Moon, Monitor, Palette, Check, RotateCcw, Type, X, Compass } from 'lucide-react';
import {
  useThemeStore,
  FontScale,
  THEME_PRESETS,
} from '../store/themeStore';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { BrandLogo } from './ui/BrandLogo';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface ThemeCustomizerModalProps {
  abierto?: boolean;
  onCerrar?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  abierto,
  onCerrar,
  isOpen,
  onClose,
}) => {
  const {
    theme,
    resolvedTheme,
    isCustomizerOpen,
    closeCustomizer,
    customization,
    setTheme,
    setFontScale,
    resetDefaults,
  } = useThemeStore();

  const isVisible =
    isOpen !== undefined
      ? isOpen
      : abierto !== undefined
        ? abierto
        : isCustomizerOpen;

  const handleClose = onClose || onCerrar || closeCustomizer;

  const { backdropProps, contentProps } = useModalOverlay({
    abierto: isVisible,
    onCerrar: handleClose,
  });

  if (!isVisible) return null;

  const presetCards = [
    {
      id: 'light',
      title: 'Modo Claro',
      subtitle: 'Fondo cálido y texto carbón de alta lectura',
      badge: 'Claro',
      icon: Sun,
      active: theme === 'light',
      swatches: [
        THEME_PRESETS.scout.light.brand,
        THEME_PRESETS.scout.light.surface,
        THEME_PRESETS.scout.light.paper,
        THEME_PRESETS.scout.light.ink,
      ],
      onSelect: () => setTheme('light'),
    },
    {
      id: 'dark',
      title: 'Modo Oscuro',
      subtitle: 'Pizarra nocturna descansada con acento ámbar Scout',
      badge: 'Oscuro',
      icon: Moon,
      active: theme === 'dark',
      swatches: [
        THEME_PRESETS.scout.dark.brand,
        THEME_PRESETS.scout.dark.surface,
        THEME_PRESETS.scout.dark.paper,
        THEME_PRESETS.scout.dark.ink,
      ],
      onSelect: () => setTheme('dark'),
    },
    {
      id: 'system',
      title: 'Automático del Sistema',
      subtitle: 'Sigue el tema claro u oscuro de tu dispositivo',
      badge: 'Auto',
      icon: Monitor,
      active: theme === 'system',
      swatches: [
        THEME_PRESETS.scout[resolvedTheme].brand,
        THEME_PRESETS.scout[resolvedTheme].surface,
        THEME_PRESETS.scout[resolvedTheme].paper,
        THEME_PRESETS.scout[resolvedTheme].ink,
      ],
      onSelect: () => setTheme('system'),
    },
  ];

  const handleReset = () => {
    resetDefaults();
    setTheme('system');
  };

  return (
    <div
      className="s-anim-backdrop fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      role="presentation"
      {...backdropProps}
    >
      <div
        className="s-anim-sheet-up sm:s-anim-modal-pop bg-surface border border-rule rounded-t-2xl sm:rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-customizer-title"
        {...contentProps}
      >
        <div className="p-5 sm:p-6 border-b border-rule flex items-center justify-between gap-3 bg-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="theme-customizer-title"
                className="text-lg sm:text-xl font-extrabold text-ink leading-tight truncate"
              >
                Apariencia
              </h2>
              <p className="text-xs sm:text-sm text-ink-muted leading-tight mt-0.5 truncate">
                Modo claro, modo oscuro y escala tipográfica adaptable.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar preferencias de apariencia"
            className="text-ink-muted hover:text-ink p-2 rounded-xl hover:bg-paper-2 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[75dvh] overflow-y-auto">
          {/* Claro / Oscuro / Sistema */}
          <div className="space-y-3">
            <span className="text-sm font-bold text-ink block">
              Tema Visual
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {presetCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={card.onSelect}
                    className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between gap-2.5 ${
                      card.active
                        ? 'border-brand ring-2 ring-brand/20 bg-brand-soft/30'
                        : 'border-rule hover:border-ink-muted bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-ink flex items-center gap-1.5">
                        <Icon className="w-4 h-4 text-brand shrink-0" />
                        <span>{card.title}</span>
                      </span>
                      {card.active && (
                        <span className="w-4.5 h-4.5 rounded-full bg-brand text-brand-contrast flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-ink-muted leading-snug">{card.subtitle}</p>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      {card.swatches.map((color, idx) => (
                        <span
                          key={idx}
                          className="w-4 h-4 rounded-full border border-rule shrink-0"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                      ))}
                      <span className="text-xs font-bold text-ink-muted ml-auto">
                        {card.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Escala Tipográfica */}
          <div className="space-y-3">
            <span className="text-sm font-bold text-ink flex items-center gap-2">
              <Type className="w-4 h-4 text-brand" />
              Escala tipográfica y legibilidad
            </span>

            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: '100%', label: 'Normal', note: '100%' },
                  { id: '110%', label: 'Grande', note: '110%' },
                  { id: '125%', label: 'Accesible', note: '125%' },
                ] as { id: FontScale; label: string; note: string }[]
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFontScale(s.id)}
                  className={`p-3 rounded-xl border text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    customization.fontScale === s.id
                      ? 'border-brand bg-brand-soft/40 text-ink font-extrabold'
                      : 'border-rule bg-surface text-ink hover:bg-paper-2'
                  }`}
                >
                  <span className="text-sm">{s.label}</span>
                  <span className="text-xs text-ink-muted font-medium s-tabular">{s.note}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Vista previa en vivo */}
          <div className="p-4 bg-paper-2 rounded-xl border border-rule space-y-3">
            <span className="text-xs font-bold text-ink-muted flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-brand" />
              Vista previa en tiempo real
            </span>
            <div className="p-3 rounded-xl border border-rule bg-surface flex flex-wrap items-center justify-between gap-2.5">
              <BrandLogo variant="icon" size="sm" showSubtitle subtitleText="Juan XXIII" className="m-0" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="primary" size="sm">
                  Acción Principal
                </Button>
                <Button variant="secondary" size="sm">
                  Secundario
                </Button>
                <Badge variant="brand" size="sm" dot>
                  Activo
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-rule flex flex-wrap items-center justify-between gap-2 bg-paper-2">
          <Button
            variant="ghost"
            size="md"
            onClick={handleReset}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            Restablecer
          </Button>
          <Button variant="primary" size="md" onClick={handleClose}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  );
};
