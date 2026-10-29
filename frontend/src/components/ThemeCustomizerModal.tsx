import React, { useEffect, useState } from 'react';
import {
  Palette,
  X,
  Check,
  RotateCcw,
  Sparkles,
  Type,
  Maximize2,
  Sliders,
  Compass,
} from 'lucide-react';
import { useThemeStore, getContrastTextColor, FontScale, THEME_PRESETS } from '../store/themeStore';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { BrandLogo } from './ui/BrandLogo';

export interface ThemeCustomizerModalProps {
  abierto?: boolean;
  onCerrar?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// Preset definitions metadata
const PRESET_CARDS = [
  {
    id: 'scout',
    name: 'Scout Tradicional',
    subtitle: 'Oficial Juan XXIII',
    badge: 'Por defecto',
  },
  {
    id: 'nautical',
    name: 'Azul Marino & Oro',
    subtitle: 'Náutica & Mar',
    badge: 'Naval',
  },
  {
    id: 'forest',
    name: 'Bosque & Arena',
    subtitle: 'Campamento & Naturaleza',
    badge: 'Aire libre',
  },
  {
    id: 'contrast',
    name: 'Alto Contraste',
    subtitle: 'Accesibilidad WCAG AAA',
    badge: 'Accesible',
  },
  {
    id: 'custom',
    name: 'Personalizado',
    subtitle: 'Ajustes a tu medida',
    badge: 'Libre',
  },
] as const;

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  abierto,
  onCerrar,
  isOpen,
  onClose,
}) => {
  const {
    resolvedTheme,
    isCustomizerOpen,
    closeCustomizer,
    customization,
    setPreset,
    setCustomization,
    resetDefaults,
  } = useThemeStore();

  const isVisible =
    isOpen !== undefined
      ? isOpen
      : abierto !== undefined
        ? abierto
        : isCustomizerOpen;

  const handleClose = onClose || onCerrar || closeCustomizer;

  const initialTokens =
    customization.preset && customization.preset !== 'custom' && THEME_PRESETS[customization.preset]
      ? THEME_PRESETS[customization.preset][resolvedTheme]
      : THEME_PRESETS.scout[resolvedTheme];

  // Active local state for fine-tuning
  const [activePreset, setActivePreset] = useState<string>(customization.preset || 'scout');
  const [brandColor, setBrandColor] = useState(customization.brandColor || initialTokens.brand);
  const [paperColor, setPaperColor] = useState(customization.paperColor || initialTokens.paper);
  const [navColor, setNavColor] = useState(customization.navColor || initialTokens.nav || initialTokens.surface);
  const [inkColor, setInkColor] = useState(customization.inkColor || initialTokens.ink);
  const [fontScale, setFontScale] = useState<FontScale>(customization.fontScale || '100%');
  const [logoScale, setLogoScale] = useState<number>(customization.logoScale || 1.0);

  // Sync state on modal open or when resolvedTheme / customization changes
  useEffect(() => {
    if (!isVisible) return;

    const currentPreset = customization.preset || 'scout';
    setActivePreset(currentPreset);
    setFontScale(customization.fontScale || '100%');
    setLogoScale(customization.logoScale || 1.0);

    if (currentPreset !== 'custom' && THEME_PRESETS[currentPreset]) {
      const pTokens = THEME_PRESETS[currentPreset][resolvedTheme];
      setBrandColor(pTokens.brand);
      setPaperColor(pTokens.paper);
      setNavColor(pTokens.nav || pTokens.surface);
      setInkColor(pTokens.ink);
    } else {
      const defTokens = THEME_PRESETS.scout[resolvedTheme];
      setBrandColor(customization.brandColor || defTokens.brand);
      setPaperColor(customization.paperColor || defTokens.paper);
      setNavColor(customization.navColor || defTokens.nav || defTokens.surface);
      setInkColor(customization.inkColor || defTokens.ink);
    }
  }, [isVisible, customization, resolvedTheme]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleClose]);

  if (!isVisible) return null;

  // 1-Tap preset selection (updates preset in store without writing hardcoded color overrides)
  const handleSelectPreset = (presetId: (typeof PRESET_CARDS)[number]['id']) => {
    setActivePreset(presetId);
    setPreset(presetId);

    if (presetId !== 'custom') {
      const target = THEME_PRESETS[presetId][resolvedTheme];
      setBrandColor(target.brand);
      setPaperColor(target.paper);
      setNavColor(target.nav || target.surface);
      setInkColor(target.ink);
      if (presetId === 'contrast') {
        setFontScale('110%');
        setLogoScale(1.1);
      } else {
        setFontScale(target.fontScale || '100%');
        setLogoScale(target.logoScale || 1.0);
      }
    }
  };

  // Granular color updates
  const handleColorChange = (key: 'brand' | 'paper' | 'ink' | 'nav', value: string) => {
    setActivePreset('custom');
    let nextBrand = brandColor;
    let nextPaper = paperColor;
    let nextNav = navColor;
    let nextInk = inkColor;

    if (key === 'brand') {
      nextBrand = value;
      setBrandColor(value);
    } else if (key === 'paper') {
      nextPaper = value;
      setPaperColor(value);
    } else if (key === 'nav') {
      nextNav = value;
      setNavColor(value);
    } else if (key === 'ink') {
      nextInk = value;
      setInkColor(value);
    }

    setCustomization({
      preset: 'custom',
      brandColor: nextBrand,
      brandContrast: getContrastTextColor(nextBrand),
      paperColor: nextPaper,
      navColor: nextNav,
      navContrast: getContrastTextColor(nextNav),
      inkColor: nextInk,
      fontScale,
      logoScale,
    });
  };

  // Font scale update
  const handleFontScaleChange = (scale: FontScale) => {
    setFontScale(scale);
    setCustomization({
      fontScale: scale,
    });
  };

  // Logo scale update
  const handleLogoScaleChange = (scale: number) => {
    const clamped = Math.max(0.8, Math.min(1.4, Number(scale.toFixed(2))));
    setLogoScale(clamped);
    setCustomization({
      logoScale: clamped,
    });
  };

  // Reset to default Juan XXIII theme
  const handleResetDefaults = () => {
    resetDefaults();
    setActivePreset('scout');
    const def = THEME_PRESETS.scout[resolvedTheme];
    setBrandColor(def.brand);
    setPaperColor(def.paper);
    setNavColor(def.nav || def.surface);
    setInkColor(def.ink);
    setFontScale('100%');
    setLogoScale(1.0);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-rule rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden my-auto transition-colors"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-customizer-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between gap-3 bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="theme-customizer-title"
                className="text-base sm:text-lg font-extrabold text-ink leading-tight font-display"
              >
                Personalización y Apariencia
              </h2>
              <p className="text-xs text-ink-muted leading-tight mt-0.5">
                Ajustá la paleta institucional, la escala del escudo y la accesibilidad.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar personalizador"
            className="text-ink-muted hover:text-ink p-2 rounded-xl hover:bg-paper-2 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal con Scroll Suave */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* SECCIÓN 1: Tarjetas de los 5 Presets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                Estilos predefinidos (1-tap)
              </span>
              <span className="text-[11px] text-ink-muted">Adaptables a modo claro y oscuro</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {PRESET_CARDS.map((p) => {
                const isActive = activePreset === p.id;
                const pTokens =
                  p.id !== 'custom'
                    ? THEME_PRESETS[p.id][resolvedTheme]
                    : {
                        brand: brandColor,
                        paper: paperColor,
                        ink: inkColor,
                        nav: navColor,
                      };

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.id)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer relative flex flex-col justify-between gap-2 ${
                      isActive
                        ? 'border-brand ring-2 ring-brand/20 bg-brand/5 shadow-xs'
                        : 'border-rule hover:border-ink-muted bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-bold text-xs text-ink">{p.name}</span>
                      {isActive && (
                        <span className="w-4 h-4 rounded-full bg-brand text-brand-contrast flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-ink-muted line-clamp-1">{p.subtitle}</p>

                    {/* Muestrario de Colores del Preset en el Modo Actual */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs"
                        style={{ backgroundColor: pTokens.brand }}
                        title="Color Institucional"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs"
                        style={{ backgroundColor: pTokens.nav || pTokens.paper }}
                        title="Barra de Navegación"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs"
                        style={{ backgroundColor: pTokens.paper }}
                        title="Fondo Papel"
                      />
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs"
                        style={{ backgroundColor: pTokens.ink }}
                        title="Tinta de Texto"
                      />
                      <span className="text-[10px] text-ink-muted ml-auto font-medium">
                        {p.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECCIÓN 2: Micro-Lienzo de Vista Previa en Vivo */}
          <div className="p-3.5 bg-paper rounded-2xl border border-rule space-y-2.5">
            <span className="text-[11px] font-extrabold text-ink-muted flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-brand" />
              Lienzo de demostración en tiempo real
            </span>
            <div
              style={{
                backgroundColor: 'var(--color-navbar)',
                borderColor: 'var(--color-navbar-rule, var(--color-rule))',
                color: 'var(--color-navbar-ink, var(--color-ink))',
              }}
              className="p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-2xs transition-colors"
            >
              <BrandLogo variant="icon" size="sm" showSubtitle subtitleText="Vista en vivo" className="m-1" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="primary" size="sm">
                  Botón Primario
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

          {/* SECCIÓN 3: Controles de Ajuste Fino */}
          <div className="space-y-4 pt-1">
            <span className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-brand" />
              Ajuste personalizado de colores
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Color Brand */}
              <div className="p-3 rounded-xl border border-rule bg-surface space-y-2">
                <label className="block text-xs font-bold text-ink">
                  Color Primario
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => handleColorChange('brand', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent shrink-0"
                    title="Elegir color institucional"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => handleColorChange('brand', e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border border-rule bg-paper text-ink"
                  />
                </div>
              </div>

              {/* Color Barra de Navegación */}
              <div className="p-3 rounded-xl border border-rule bg-surface space-y-2">
                <label className="block text-xs font-bold text-ink">
                  Barra de Navegación
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={navColor}
                    onChange={(e) => handleColorChange('nav', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent shrink-0"
                    title="Elegir color de la barra de navegación"
                  />
                  <input
                    type="text"
                    value={navColor}
                    onChange={(e) => handleColorChange('nav', e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border border-rule bg-paper text-ink"
                  />
                </div>
              </div>

              {/* Color Paper */}
              <div className="p-3 rounded-xl border border-rule bg-surface space-y-2">
                <label className="block text-xs font-bold text-ink">
                  Fondo de Papel
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={paperColor}
                    onChange={(e) => handleColorChange('paper', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent shrink-0"
                    title="Elegir color de fondo"
                  />
                  <input
                    type="text"
                    value={paperColor}
                    onChange={(e) => handleColorChange('paper', e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border border-rule bg-paper text-ink"
                  />
                </div>
              </div>

              {/* Color Ink */}
              <div className="p-3 rounded-xl border border-rule bg-surface space-y-2">
                <label className="block text-xs font-bold text-ink">
                  Tinta de Texto
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={inkColor}
                    onChange={(e) => handleColorChange('ink', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent shrink-0"
                    title="Elegir color de texto"
                  />
                  <input
                    type="text"
                    value={inkColor}
                    onChange={(e) => handleColorChange('ink', e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1.5 rounded-lg border border-rule bg-paper text-ink"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: Escala Tipográfica (Accesibilidad) */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-brand" />
              Escala tipográfica y legibilidad
            </span>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: '100%', label: 'Normal', note: '100%' },
                  { id: '110%', label: 'Grande', note: '110%' },
                  { id: '125%', label: 'Accesibilidad', note: '125%' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleFontScaleChange(s.id)}
                  className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    fontScale === s.id
                      ? 'border-brand bg-brand/10 text-brand font-extrabold shadow-2xs'
                      : 'border-rule bg-surface text-ink hover:bg-paper-2'
                  }`}
                >
                  <span className="text-xs">{s.label}</span>
                  <span className="text-[10px] text-ink-muted font-normal">{s.note}</span>
                </button>
              ))}
            </div>
          </div>

          {/* SECCIÓN 5: Escala del Logo Institucional */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-brand" />
                Escala del escudo institucional ({logoScale.toFixed(2)}x)
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleLogoScaleChange(0.85)}
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-rule hover:bg-paper-2 font-medium cursor-pointer"
                >
                  Compacto
                </button>
                <button
                  type="button"
                  onClick={() => handleLogoScaleChange(1.0)}
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-rule hover:bg-paper-2 font-medium cursor-pointer"
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => handleLogoScaleChange(1.25)}
                  className="text-[10px] px-2 py-0.5 rounded-lg border border-rule hover:bg-paper-2 font-medium cursor-pointer"
                >
                  Prominente
                </button>
              </div>
            </div>

            <div className="p-3 bg-surface rounded-xl border border-rule flex items-center gap-4">
              <input
                type="range"
                min="0.8"
                max="1.4"
                step="0.05"
                value={logoScale}
                onChange={(e) => handleLogoScaleChange(parseFloat(e.target.value))}
                className="w-full accent-brand cursor-pointer"
                aria-label="Escala visual del logo institucional"
              />
              <div className="shrink-0 w-12 flex justify-center">
                <BrandLogo variant="icon" size="sm" scaleOverride={logoScale} />
              </div>
            </div>
          </div>
        </div>

        {/* Pie del Modal con Botón de Restablecer y Cerrar */}
        <div className="p-4 sm:p-5 border-t border-rule flex items-center justify-between gap-3 bg-paper">
          <Button
            variant="ghost"
            size="md"
            onClick={handleResetDefaults}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            Restablecer tema por defecto
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={handleClose}
          >
            Aplicar y Salir
          </Button>
        </div>
      </div>
    </div>
  );
};
