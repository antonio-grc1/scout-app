import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'scout-theme';

const getSystemPreference = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
};

const applyDocumentTheme = (theme: ThemeMode): 'light' | 'dark' => {
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

// Inicializar clase en document de inmediato
const initialTheme = getInitialTheme();
const initialResolved = applyDocumentTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => {
  // Listener para cambios en el esquema del sistema operativo
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (get().theme === 'system') {
        const resolved = applyDocumentTheme('system');
        set({ resolvedTheme: resolved });
      }
    });
  }

  return {
    theme: initialTheme,
    resolvedTheme: initialResolved,
    setTheme: (theme: ThemeMode) => {
      localStorage.setItem(STORAGE_KEY, theme);
      const resolved = applyDocumentTheme(theme);
      set({ theme, resolvedTheme: resolved });
    },
    toggleTheme: () => {
      const currentResolved = get().resolvedTheme;
      const nextTheme: ThemeMode = currentResolved === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, nextTheme);
      const resolved = applyDocumentTheme(nextTheme);
      set({ theme: nextTheme, resolvedTheme: resolved });
    },
  };
});
