import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check, Type } from 'lucide-react';
import { useThemeStore, ThemeMode } from '../store/themeStore';
import { useMenuKeyboard } from '../hooks/useMenuKeyboard';

interface ThemeToggleProps {
  variant?: 'icon' | 'dropdown' | 'segmented';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'dropdown',
  className = '',
}) => {
  const {
    theme,
    resolvedTheme,
    customization,
    setTheme,
    toggleTheme,
    openCustomizer,
  } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { menuRef: menuTecladoRef, onKeyDown: onKeyDownMenu } = useMenuKeyboard(isOpen, () =>
    setIsOpen(false),
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Modo Segmented: [ Claro | Oscuro | Auto ]
  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex items-center p-1 bg-paper-2 border border-rule rounded-xl text-sm font-medium ${className}`}
        role="group"
        aria-label="Selector de apariencia"
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          aria-pressed={theme === 'light'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            theme === 'light'
              ? 'bg-surface text-brand font-bold border border-rule'
              : 'text-ink-muted hover:text-ink border border-transparent'
          }`}
          title="Modo Claro"
        >
          <Sun className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Claro</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme('dark')}
          aria-pressed={theme === 'dark'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            theme === 'dark'
              ? 'bg-surface text-brand font-bold border border-rule'
              : 'text-ink-muted hover:text-ink border border-transparent'
          }`}
          title="Modo Oscuro"
        >
          <Moon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Oscuro</span>
        </button>

        <button
          type="button"
          onClick={() => setTheme('system')}
          aria-pressed={theme === 'system'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            theme === 'system'
              ? 'bg-surface text-brand font-bold border border-rule'
              : 'text-ink-muted hover:text-ink border border-transparent'
          }`}
          title="Automático (sigue el sistema operativo)"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Auto</span>
        </button>
      </div>
    );
  }

  // Modo Icono Simple
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`min-w-[40px] min-h-[40px] p-2 rounded-xl text-ink-2 hover:bg-paper-2 transition-colors cursor-pointer ${className}`}
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

  // Modo Dropdown: Claro / Oscuro / Sistema + Escala de texto
  const modeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Claro', icon: <Sun className="w-4 h-4 text-amber-500" /> },
    { value: 'dark', label: 'Oscuro', icon: <Moon className="w-4 h-4 text-indigo-400" /> },
    { value: 'system', label: 'Sistema', icon: <Monitor className="w-4 h-4 text-ink-muted" /> },
  ];

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="s-btn-sec flex items-center justify-center min-w-[42px] min-h-[42px] px-3 rounded-xl gap-2 text-sm font-semibold cursor-pointer"
        title="Apariencia (Claro / Oscuro)"
        aria-label="Cambiar apariencia"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="w-[18px] h-[18px] text-brand shrink-0" />
        ) : (
          <Sun className="w-[18px] h-[18px] text-brand shrink-0" />
        )}
        <span className="hidden lg:inline">
          {theme === 'light' ? 'Claro' : theme === 'dark' ? 'Oscuro' : 'Sistema'}
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          ref={menuTecladoRef}
          onKeyDown={onKeyDownMenu}
          aria-label="Apariencia"
          className="s-anim-modal-pop absolute right-0 mt-2 w-60 bg-surface border border-rule rounded-xl shadow-lg py-1.5 z-50"
        >
          <div className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-ink-muted border-b border-rule">
            Apariencia
          </div>

          {modeOptions.map((opt) => {
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  active ? 'bg-brand-soft text-ink font-bold' : 'text-ink hover:bg-paper-2'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {opt.icon}
                  <span>{opt.label}</span>
                </div>
                {active && <Check className="w-4 h-4 text-brand" />}
              </button>
            );
          })}

          <div className="border-t border-rule my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openCustomizer();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold text-brand hover:bg-paper-2 transition-colors cursor-pointer"
          >
            <Type className="w-4 h-4 text-brand shrink-0" />
            <span>Escala de texto ({customization.fontScale})…</span>
          </button>
        </div>
      )}
    </div>
  );
};
