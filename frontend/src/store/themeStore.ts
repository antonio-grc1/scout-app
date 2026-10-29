import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'scout' | 'nautical' | 'forest' | 'contrast' | 'custom';
export type FontScale = '100%' | '110%' | '125%';

export interface PresetTokens {
  brand: string;
  contrast: string;
  paper: string;
  paper2?: string;
  paper3?: string;
  surface: string;
  nav?: string;
  navContrast?: string;
  ink: string;
  muted: string;
  rule: string;
  fontScale?: FontScale;
  logoScale?: number;
}

export interface ThemePresetDefinition {
  id: ThemePreset;
  label: string;
  description: string;
  light: PresetTokens;
  dark: PresetTokens;
}

export interface ThemeCustomizationConfig {
  preset: ThemePreset;
  brandColor?: string;
  brandContrast?: string;
  paperColor?: string;
  surfaceColor?: string;
  navColor?: string;
  navContrast?: string;
  inkColor?: string;
  inkMutedColor?: string;
  ruleColor?: string;
  fontScale: FontScale;
  logoScale: number; // 0.8 to 1.4
  logoUrl?: string;
}

export interface ThemeState {
  // Theme Mode (backwards-compatible)
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  // Customizer Modal State
  isCustomizerOpen: boolean;
  openCustomizer: () => void;
  closeCustomizer: () => void;

  // Customization
  customization: ThemeCustomizationConfig;
  setPreset: (preset: ThemePreset) => void;
  setCustomization: (updates: Partial<ThemeCustomizationConfig>) => void;
  setBrandColor: (color: string) => void;
  setNavColor: (color: string) => void;
  setPaperColor: (color: string) => void;
  setInkColor: (color: string) => void;
  setFontScale: (scale: FontScale) => void;
  setLogoScale: (scale: number) => void;
  resetDefaults: () => void;
  resetThemeCustomization: () => void;
}

const STORAGE_MODE_KEY = 'scout-theme';
const STORAGE_CUSTOM_KEY = 'scout-theme-customization';

export const THEME_PRESETS: Record<Exclude<ThemePreset, 'custom'>, ThemePresetDefinition> = {
  scout: {
    id: 'scout',
    label: 'Scout Tradicional',
    description: 'Paleta oficial Juan XXIII en amarillo ámbar y carbón',
    light: {
      brand: '#f59e0b',
      contrast: '#090a0f',
      paper: '#fbfbf9',
      paper2: '#f4f4f0',
      paper3: '#eaeae5',
      surface: '#ffffff',
      nav: '#ffffff',
      ink: '#18181b',
      muted: '#71717a',
      rule: '#e4e4e7',
      fontScale: '100%',
      logoScale: 1.0,
    },
    dark: {
      brand: '#fbbf24',
      contrast: '#09090b',
      paper: '#111215',
      paper2: '#18191e',
      paper3: '#22242b',
      surface: '#18191e',
      nav: '#18191e',
      ink: '#f4f4f5',
      muted: '#a1a1aa',
      rule: '#27272a',
      fontScale: '100%',
      logoScale: 1.0,
    },
  },
  nautical: {
    id: 'nautical',
    label: 'Azul Marino & Oro',
    description: 'Estilo náutico institucional con azul marino y acentos dorados',
    light: {
      brand: '#0369a1',
      contrast: '#ffffff',
      paper: '#f8fafc',
      paper2: '#f1f5f9',
      paper3: '#e2e8f0',
      surface: '#ffffff',
      nav: '#ffffff',
      ink: '#0f172a',
      muted: '#64748b',
      rule: '#cbd5e1',
      fontScale: '100%',
      logoScale: 1.0,
    },
    dark: {
      brand: '#38bdf8',
      contrast: '#08101e',
      paper: '#0b1120',
      paper2: '#0f172a',
      paper3: '#1e293b',
      surface: '#131d33',
      nav: '#131d33',
      ink: '#f8fafc',
      muted: '#94a3b8',
      rule: '#1e293b',
      fontScale: '100%',
      logoScale: 1.0,
    },
  },
  forest: {
    id: 'forest',
    label: 'Bosque & Arena',
    description: 'Verde scout de campamento, tierra y tonos cálidos de arena',
    light: {
      brand: '#15803d',
      contrast: '#ffffff',
      paper: '#faf7f2',
      paper2: '#f5f0e8',
      paper3: '#ece5d8',
      surface: '#ffffff',
      nav: '#ffffff',
      ink: '#1c1917',
      muted: '#78716c',
      rule: '#e7e5e4',
      fontScale: '100%',
      logoScale: 1.0,
    },
    dark: {
      brand: '#4ade80',
      contrast: '#0c150e',
      paper: '#111612',
      paper2: '#161c17',
      paper3: '#202922',
      surface: '#19211b',
      nav: '#19211b',
      ink: '#f5f5f4',
      muted: '#a8a29e',
      rule: '#292524',
      fontScale: '100%',
      logoScale: 1.0,
    },
  },
  contrast: {
    id: 'contrast',
    label: 'Alto Contraste',
    description: 'Máxima legibilidad y contraste estricto WCAG AAA',
    light: {
      brand: '#000000',
      contrast: '#ffffff',
      paper: '#ffffff',
      paper2: '#f4f4f5',
      paper3: '#e4e4e7',
      surface: '#ffffff',
      nav: '#ffffff',
      ink: '#000000',
      muted: '#374151',
      rule: '#000000',
      fontScale: '110%',
      logoScale: 1.1,
    },
    dark: {
      brand: '#facc15',
      contrast: '#000000',
      paper: '#000000',
      paper2: '#18181b',
      paper3: '#27272a',
      surface: '#09090b',
      nav: '#09090b',
      ink: '#ffffff',
      muted: '#d1d5db',
      rule: '#ffffff',
      fontScale: '110%',
      logoScale: 1.1,
    },
  },
};

export const DEFAULT_THEME_CUSTOMIZATION: ThemeCustomizationConfig = {
  preset: 'scout',
  fontScale: '100%',
  logoScale: 1.0,
  logoUrl: '/brand/Logo%20Juancho%20Icono.png',
};

export function getContrastTextColor(hexColor: string): '#ffffff' | '#090a0f' {
  if (!hexColor) return '#ffffff';
  let hex = hexColor.trim().replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return '#ffffff';

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithDark = (L + 0.05) / 0.06;

  return contrastWithWhite >= contrastWithDark ? '#ffffff' : '#090a0f';
}

const getSystemPreference = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {}
  return 'system';
};

const getInitialCustomization = (): ThemeCustomizationConfig => {
  if (typeof window === 'undefined') return DEFAULT_THEME_CUSTOMIZATION;
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Sanitizar: si el preset no es 'custom', no deben persistir overrides manuales de color
      if (parsed.preset && parsed.preset !== 'custom') {
        delete parsed.brandColor;
        delete parsed.brandContrast;
        delete parsed.paperColor;
        delete parsed.surfaceColor;
        delete parsed.navColor;
        delete parsed.navContrast;
        delete parsed.inkColor;
        delete parsed.inkMutedColor;
        delete parsed.ruleColor;
      }
      return {
        ...DEFAULT_THEME_CUSTOMIZATION,
        ...parsed,
      };
    }
  } catch (e) {}
  return DEFAULT_THEME_CUSTOMIZATION;
};

const applyDocumentThemeMode = (theme: ThemeMode): 'light' | 'dark' => {
  if (typeof document === 'undefined') return 'light';
  const resolved = theme === 'system' ? getSystemPreference() : theme;
  const root = document.documentElement;

  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.style.colorScheme = resolved;
  return resolved;
};

const applyDocumentCustomization = (
  cfg: ThemeCustomizationConfig,
  resolvedTheme: 'light' | 'dark'
) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const s = root.style;

  // Si es scout sin modificaciones manuales, remover overrides inline para que tokens.css mande
  if (
    cfg.preset === 'scout' &&
    !cfg.brandColor &&
    !cfg.paperColor &&
    !cfg.surfaceColor &&
    !cfg.navColor &&
    !cfg.inkColor &&
    cfg.fontScale === '100%' &&
    cfg.logoScale === 1.0
  ) {
    s.removeProperty('--color-brand');
    s.removeProperty('--color-brand-contrast');
    s.removeProperty('--color-paper');
    s.removeProperty('--color-paper-2');
    s.removeProperty('--color-paper-3');
    s.removeProperty('--color-surface');
    s.removeProperty('--color-navbar');
    s.removeProperty('--color-navbar-ink');
    s.removeProperty('--color-navbar-muted');
    s.removeProperty('--color-navbar-rule');
    s.removeProperty('--color-navbar-hover');
    s.removeProperty('--color-ink');
    s.removeProperty('--color-ink-2');
    s.removeProperty('--color-ink-muted');
    s.removeProperty('--color-muted');
    s.removeProperty('--color-rule');
    s.removeProperty('--color-accent');
    s.removeProperty('--color-accent-ink');
    s.removeProperty('--color-focus');
    s.removeProperty('--font-scale');
    s.removeProperty('--brand-logo-scale');
    s.removeProperty('--brand-logo-url');
    return;
  }

  const pData =
    cfg.preset && cfg.preset !== 'custom' && THEME_PRESETS[cfg.preset]
      ? THEME_PRESETS[cfg.preset][resolvedTheme]
      : THEME_PRESETS.scout[resolvedTheme];

  const brand = cfg.brandColor || pData.brand;
  const contrast =
    cfg.brandContrast ||
    pData.contrast ||
    (brand ? getContrastTextColor(brand) : undefined);
  const paper = cfg.paperColor || pData.paper;
  const ink = cfg.inkColor || pData.ink;
  const surface = cfg.surfaceColor || pData.surface;
  const nav = cfg.navColor || pData.nav || surface;
  const navContrast =
    cfg.navContrast ||
    pData.navContrast ||
    (nav ? getContrastTextColor(nav) : undefined);
  const muted = cfg.inkMutedColor || pData.muted;
  const rule = cfg.ruleColor || pData.rule;
  const fontScale = cfg.fontScale || pData.fontScale || '100%';
  const logoScale = cfg.logoScale ?? pData.logoScale ?? 1.0;
  const logoUrl = cfg.logoUrl || '/brand/Logo%20Juancho%20Icono.png';

  const paper2 =
    pData.paper2 ||
    (paper && ink ? `color-mix(in srgb, ${paper} 92%, ${ink})` : undefined);
  const paper3 =
    pData.paper3 ||
    (paper && ink ? `color-mix(in srgb, ${paper} 85%, ${ink})` : undefined);

  if (brand) {
    s.setProperty('--color-brand', brand);
    s.setProperty('--color-accent', brand);
    s.setProperty('--color-focus', brand);
  }
  if (contrast) {
    s.setProperty('--color-brand-contrast', contrast);
    s.setProperty('--color-accent-ink', contrast);
  }
  if (paper) s.setProperty('--color-paper', paper);
  if (paper2) s.setProperty('--color-paper-2', paper2);
  if (paper3) s.setProperty('--color-paper-3', paper3);
  if (surface) s.setProperty('--color-surface', surface);
  if (ink) {
    s.setProperty('--color-ink', ink);
    const ink2 = resolvedTheme === 'dark' ? '#d4d4d8' : '#3f3f46';
    s.setProperty('--color-ink-2', ink2);
  }
  if (muted) {
    s.setProperty('--color-ink-muted', muted);
    s.setProperty('--color-muted', muted);
  }
  if (rule) s.setProperty('--color-rule', rule);
  if (fontScale) s.setProperty('--font-scale', fontScale);
  if (logoScale) s.setProperty('--brand-logo-scale', String(logoScale));
  if (logoUrl) s.setProperty('--brand-logo-url', logoUrl);

  if (nav) {
    s.setProperty('--color-navbar', nav);
    const isDarkNav = (navContrast || getContrastTextColor(nav)) === '#ffffff';
    s.setProperty('--color-navbar-ink', isDarkNav ? '#ffffff' : (resolvedTheme === 'dark' ? '#f4f4f5' : '#18181b'));
    s.setProperty(
      '--color-navbar-muted',
      isDarkNav ? 'rgba(255, 255, 255, 0.72)' : (resolvedTheme === 'dark' ? '#a1a1aa' : '#71717a')
    );
    s.setProperty(
      '--color-navbar-rule',
      isDarkNav ? 'rgba(255, 255, 255, 0.15)' : (rule || (resolvedTheme === 'dark' ? '#27272a' : '#e4e4e7'))
    );
    s.setProperty(
      '--color-navbar-hover',
      isDarkNav
        ? 'rgba(255, 255, 255, 0.12)'
        : (resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)')
    );
  } else {
    s.removeProperty('--color-navbar');
    s.removeProperty('--color-navbar-ink');
    s.removeProperty('--color-navbar-muted');
    s.removeProperty('--color-navbar-rule');
    s.removeProperty('--color-navbar-hover');
  }
};

// Inicialización temprana en carga de módulo
const initialThemeMode = getInitialThemeMode();
const initialResolvedMode = applyDocumentThemeMode(initialThemeMode);
const initialCustomization = getInitialCustomization();
applyDocumentCustomization(initialCustomization, initialResolvedMode);

export const useThemeStore = create<ThemeState>((set, get) => {
  // Listener reactivo a cambios del sistema operativo
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (get().theme === 'system') {
        const resolved = applyDocumentThemeMode('system');
        applyDocumentCustomization(get().customization, resolved);
        set({ resolvedTheme: resolved });
      }
    });
  }

  const persistAndApply = (newCustom: ThemeCustomizationConfig) => {
    try {
      localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(newCustom));
    } catch (e) {}
    applyDocumentCustomization(newCustom, get().resolvedTheme);
    set({ customization: newCustom });
  };

  const resetAll = () => {
    try {
      localStorage.removeItem(STORAGE_CUSTOM_KEY);
    } catch (e) {}
    applyDocumentCustomization(DEFAULT_THEME_CUSTOMIZATION, get().resolvedTheme);
    set({ customization: DEFAULT_THEME_CUSTOMIZATION });
  };

  return {
    theme: initialThemeMode,
    resolvedTheme: initialResolvedMode,
    customization: initialCustomization,
    isCustomizerOpen: false,

    openCustomizer: () => set({ isCustomizerOpen: true }),
    closeCustomizer: () => set({ isCustomizerOpen: false }),

    setTheme: (theme: ThemeMode) => {
      try {
        localStorage.setItem(STORAGE_MODE_KEY, theme);
      } catch (e) {}
      const resolved = applyDocumentThemeMode(theme);
      applyDocumentCustomization(get().customization, resolved);
      set({ theme, resolvedTheme: resolved });
    },

    toggleTheme: () => {
      const currentResolved = get().resolvedTheme;
      const nextTheme: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_MODE_KEY, nextTheme);
      } catch (e) {}
      const resolved = applyDocumentThemeMode(nextTheme);
      applyDocumentCustomization(get().customization, resolved);
      set({ theme: nextTheme, resolvedTheme: resolved });
    },

    setPreset: (preset: ThemePreset) => {
      if (preset === 'scout') {
        persistAndApply(DEFAULT_THEME_CUSTOMIZATION);
        return;
      }

      if (preset === 'custom') {
        const current = get().customization;
        persistAndApply({ ...current, preset: 'custom' });
        return;
      }

      const pDef = THEME_PRESETS[preset];
      const newCustom: ThemeCustomizationConfig = {
        preset,
        fontScale: pDef.light.fontScale || '100%',
        logoScale: pDef.light.logoScale || 1.0,
        logoUrl: '/brand/Logo%20Juancho%20Icono.png',
      };
      persistAndApply(newCustom);
    },

    setCustomization: (updates: Partial<ThemeCustomizationConfig>) => {
      const current = get().customization;
      const hasColorOverrides = Boolean(
        updates.brandColor ||
        updates.paperColor ||
        updates.surfaceColor ||
        updates.navColor ||
        updates.inkColor
      );
      const nextPreset: ThemePreset =
        updates.preset !== undefined
          ? updates.preset
          : hasColorOverrides
            ? 'custom'
            : current.preset;
      const nextCustom: ThemeCustomizationConfig = {
        ...current,
        ...updates,
        preset: nextPreset,
      };
      if (nextCustom.brandColor && !nextCustom.brandContrast) {
        nextCustom.brandContrast = getContrastTextColor(nextCustom.brandColor);
      }
      if (nextCustom.navColor && !nextCustom.navContrast) {
        nextCustom.navContrast = getContrastTextColor(nextCustom.navColor);
      }
      persistAndApply(nextCustom);
    },

    setBrandColor: (color: string) => {
      const contrast = getContrastTextColor(color);
      const current = get().customization;
      persistAndApply({
        ...current,
        preset: 'custom',
        brandColor: color,
        brandContrast: contrast,
      });
    },

    setNavColor: (color: string) => {
      const contrast = getContrastTextColor(color);
      const current = get().customization;
      persistAndApply({
        ...current,
        preset: 'custom',
        navColor: color,
        navContrast: contrast,
      });
    },

    setPaperColor: (color: string) => {
      const current = get().customization;
      persistAndApply({
        ...current,
        preset: 'custom',
        paperColor: color,
      });
    },

    setInkColor: (color: string) => {
      const current = get().customization;
      persistAndApply({
        ...current,
        preset: 'custom',
        inkColor: color,
      });
    },

    setFontScale: (scale: FontScale) => {
      const current = get().customization;
      persistAndApply({
        ...current,
        fontScale: scale,
      });
    },

    setLogoScale: (scale: number) => {
      const clamped = Math.max(0.8, Math.min(1.4, Number(scale.toFixed(2))));
      const current = get().customization;
      persistAndApply({
        ...current,
        logoScale: clamped,
      });
    },

    resetDefaults: resetAll,
    resetThemeCustomization: resetAll,
  };
});
