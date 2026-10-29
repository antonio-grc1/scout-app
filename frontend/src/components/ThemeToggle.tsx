import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useThemeStore, ThemeMode } from '../store/themeStore';

interface ThemeToggleProps {
  variant?: 'icon' | 'dropdown' | 'segmented';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'dropdown',
  className = '',
}) => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Modo Segmented: [ ☀️ Claro | 🌙 Oscuro | 💻 Auto ]
  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex items-center p-1 bg-paper-2 border border-rule rounded-xl text-xs font-medium ${className}`}
        role="group"
        aria-label="Selector de tema"
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            theme === 'light'
              ? 'bg-surface text-brand shadow-xs font-semibold'
              : 'text-ink-muted hover:text-ink'
          }`}
          title="Modo Claro"
        >
          <Sun className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Claro</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-surface text-brand shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink'
          }`}
          title="Modo Oscuro"
        >
          <Moon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Oscuro</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme('system')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            theme === 'system'
              ? 'bg-surface text-brand shadow-xs font-bold'
              : 'text-ink-muted hover:text-ink'
          }`}
          title="Automático (sigue el sistema operativo)"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Auto</span>
        </button>
      </div>
    );
  }

  // Modo Icono Simple: 1 click alterna Claro/Oscuro
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`p-2 rounded-xl text-ink-2 hover:bg-paper-2 transition cursor-pointer ${className}`}
        title={`Cambiar a modo ${resolvedTheme === 'dark' ? 'claro' : 'oscuro'}`}
        aria-label="Alternar modo oscuro"
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-4 h-4 text-brand" />
        ) : (
          <Moon className="w-4 h-4 text-ink" />
        )}
      </button>
    );
  }

  // Modo Dropdown (por defecto): Botón con icono actual y menú desplegable
  const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Claro',
      icon: <Sun className="w-4 h-4 text-brand" />,
    },
    {
      value: 'dark',
      label: 'Oscuro',
      icon: <Moon className="w-4 h-4 text-indigo-400" />,
    },
    {
      value: 'system',
      label: 'Sistema',
      icon: <Monitor className="w-4 h-4 text-ink-muted" />,
    },
  ];

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-center p-2 rounded-xl text-navbar-ink hover:bg-navbar-hover transition cursor-pointer border border-transparent hover:border-navbar-rule"
        title="Cambiar apariencia (Claro / Oscuro / Sistema)"
        aria-label="Cambiar tema de la aplicación"
        aria-expanded={isOpen}
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="w-4 h-4 text-indigo-400 animate-in fade-in duration-200" />
        ) : (
          <Sun className="w-4 h-4 text-brand animate-in fade-in duration-200" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 bg-surface border border-rule rounded-xl shadow-lg py-1 z-50 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
          <div className="px-3 py-1.5 text-xs font-semibold text-ink-muted border-b border-rule">
            Apariencia
          </div>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setTheme(opt.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition cursor-pointer ${
                theme === opt.value
                  ? 'bg-brand/10 text-brand font-bold'
                  : 'text-ink hover:bg-paper-2'
              }`}
            >
              <div className="flex items-center gap-2">
                {opt.icon}
                <span>{opt.label}</span>
              </div>
              {theme === opt.value && <Check className="w-3.5 h-3.5 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
