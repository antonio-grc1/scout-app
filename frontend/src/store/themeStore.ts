import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePreset = 'scout';
export type FontScale = '100%' | '110%' | '125%';

export interface PresetTokens {
  brand: string;
  contrast: string;
  paper: string;
  paper2: string;
  paper3: string;
  surface: string;
  nav: string;
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
  fontScale: FontScale;
  logoScale: number; // 0.8 to 1.4
  logoUrl?: string;
}

export interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  isCustomizerOpen: boolean;
  openCustomizer: () => void;
  closeCustomizer: () => void;

  customization: ThemeCustomizationConfig;
  setPreset: (preset: ThemePreset) => void;
  setCustomization: (updates: Partial<ThemeCustomizationConfig>) => void;
  setFontScale: (scale: FontScale) => void;
  setLogoScale: (scale: number) => void;
  resetDefaults: () => void;
  resetThemeCustomization: () => void;
}

const STORAGE_MODE_KEY = 'scout-theme';
const STORAGE_CUSTOM_KEY = 'scout-theme-customization';

export const THEME_PRESETS: Record<ThemePreset, ThemePresetDefinition> = {
  scout: {
    id: 'scout',
    label: 'Scout Tradicional',
    description: 'Paleta oficial Juan XXIII optimizada para lectura prolongada',
    light: {
      brand: '#f59e0b',
      contrast: '#090a0f',
      paper: '#f6f6f2',
      paper2: '#eeede7',
      paper3: '#e4e2da',
      surface: '#ffffff',
      nav: '#ffffff',
      ink: '#18181b',
      muted: '#52525b',
      rule: 'rgba(24, 24, 27, 0.11)',
      fontScale: '100%',
      logoScale: 1.0,
    },
    dark: {
      brand: '#fbbf24',
      contrast: '#09090b',
      paper: '#0c0e13',
      paper2: '#13161e',
      paper3: '#1b1f2b',
      surface: '#171a24',
      nav: '#171a24',
      ink: '#f4f4f5',
      muted: '#a1a1aa',
      rule: 'rgba(255, 255, 255, 0.10)',
      fontScale: '100%',
      logoScale: 1.0,
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
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length !== 6) return '#ffffff';

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithDark = (L + 0.05) / 0.06;

  return contrastWithWhite >= contrastWithDark ? '#ffffff' : '#090a0f';
}

export const updateMetaThemeColor = (color: string) => {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
};

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
  } catch {}
  return 'system';
};

const getInitialCustomization = (): ThemeCustomizationConfig => {
  if (typeof window === 'undefined') return DEFAULT_THEME_CUSTOMIZATION;
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validScale: FontScale =
        parsed.fontScale === '110%' || parsed.fontScale === '125%' ? parsed.fontScale : '100%';
      const validLogoScale =
        typeof parsed.logoScale === 'number' && Number.isFinite(parsed.logoScale)
          ? Math.max(0.8, Math.min(1.4, parsed.logoScale))
          : 1.0;

      return {
        preset: 'scout',
        fontScale: validScale,
        logoScale: validLogoScale,
        logoUrl: esLogoUrlSegura(parsed.logoUrl)
          ? parsed.logoUrl
          : DEFAULT_THEME_CUSTOMIZATION.logoUrl,
      };
    }
  } catch {}
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

export function esLogoUrlSegura(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.includes('..')) return false;
  return (
    /^\/[a-zA-Z0-9_.\-/% ]+$/.test(trimmed) ||
    /^https:\/\/[a-zA-Z0-9_.\-/:?=&%#]+$/.test(trimmed)
  );
}

const applyDocumentCustomization = (
  cfg: ThemeCustomizationConfig,
  resolvedTheme: 'light' | 'dark',
) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const s = root.style;

  // Limpiar overrides inline heredados para dejar que tokens.css controle la paleta WCAG
  for (const prop of [
    '--color-brand',
    '--color-brand-contrast',
    '--color-paper',
    '--color-paper-2',
    '--color-paper-3',
    '--color-surface',
    '--color-navbar',
    '--color-navbar-ink',
    '--color-navbar-muted',
    '--color-navbar-rule',
    '--color-navbar-hover',
    '--color-ink',
    '--color-ink-2',
    '--color-ink-muted',
    '--color-muted',
    '--color-rule',
    '--color-accent',
    '--color-accent-ink',
    '--color-focus',
  ]) {
    s.removeProperty(prop);
  }

  root.removeAttribute('data-contrast');

  const fontScale = cfg.fontScale || '100%';
  if (fontScale === '100%') {
    s.removeProperty('--font-scale');
  } else {
    s.setProperty('--font-scale', fontScale);
  }

  const logoScale = cfg.logoScale ?? 1.0;
  if (logoScale === 1.0) {
    s.removeProperty('--brand-logo-scale');
  } else {
    s.setProperty('--brand-logo-scale', String(logoScale));
  }

  if (esLogoUrlSegura(cfg.logoUrl) && cfg.logoUrl !== DEFAULT_THEME_CUSTOMIZATION.logoUrl) {
    s.setProperty('--brand-logo-url', cfg.logoUrl.trim());
  } else {
    s.removeProperty('--brand-logo-url');
  }

  const metaColor = resolvedTheme === 'dark' ? '#171a24' : '#ffffff';
  updateMetaThemeColor(metaColor);
};

// Inicialización temprana en carga de módulo
const initialThemeMode = getInitialThemeMode();
const initialResolvedMode = applyDocumentThemeMode(initialThemeMode);
const initialCustomization = getInitialCustomization();
applyDocumentCustomization(initialCustomization, initialResolvedMode);

export const useThemeStore = create<ThemeState>((set, get) => {
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
    } catch {}
    applyDocumentCustomization(newCustom, get().resolvedTheme);
    set({ customization: newCustom });
  };

  const resetAll = () => {
    try {
      localStorage.removeItem(STORAGE_CUSTOM_KEY);
    } catch {}
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
      } catch {}
      const resolved = applyDocumentThemeMode(theme);
      applyDocumentCustomization(get().customization, resolved);
      set({ theme, resolvedTheme: resolved });
    },

    toggleTheme: () => {
      const currentResolved = get().resolvedTheme;
      const nextTheme: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_MODE_KEY, nextTheme);
      } catch {}
      const resolved = applyDocumentThemeMode(nextTheme);
      applyDocumentCustomization(get().customization, resolved);
      set({ theme: nextTheme, resolvedTheme: resolved });
    },

    setPreset: (_preset: ThemePreset) => {
      persistAndApply({
        ...DEFAULT_THEME_CUSTOMIZATION,
        fontScale: get().customization.fontScale,
      });
    },

    setCustomization: (updates: Partial<ThemeCustomizationConfig>) => {
      const current = get().customization;
      const nextCustom: ThemeCustomizationConfig = {
        ...current,
        ...updates,
        preset: 'scout',
      };
      persistAndApply(nextCustom);
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
