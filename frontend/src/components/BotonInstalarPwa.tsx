import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, Share, MoreVertical, PlusSquare, CheckCircle2, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('pwa-prompt-ready'));
  });
}

interface Props {
  variante?: 'navbar' | 'card';
}

export const BotonInstalarPwa: React.FC<Props> = ({ variante = 'navbar' }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    globalDeferredPrompt,
  );
  const [instalada, setInstalada] = useState(false);
  const [modalGuiaAbierto, setModalGuiaAbierto] = useState(false);

  const esIos =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean((window.navigator as any).standalone);
      setInstalada(isStandalone);
    };

    checkStandalone();

    const onPromptReady = () => {
      setDeferredPrompt(globalDeferredPrompt);
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      globalDeferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(globalDeferredPrompt);
    };

    const onAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setInstalada(true);
      setModalGuiaAbierto(false);
    };

    window.addEventListener('pwa-prompt-ready', onPromptReady);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('pwa-prompt-ready', onPromptReady);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (instalada) return null;

  const handleClickInstalar = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          globalDeferredPrompt = null;
          setDeferredPrompt(null);
        }
        return;
      } catch {
        // Fallback al modal de guía paso a paso
      }
    }
    setModalGuiaAbierto(true);
  };

  return (
    <>
      {variante === 'navbar' ? (
        <button
          type="button"
          onClick={handleClickInstalar}
          title="Descargar e instalar la App en tu celular"
          className="min-h-[40px] px-3 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Instalar App</span>
        </button>
      ) : (
        <div className="bg-surface rounded-2xl p-5 border border-rule shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0 border border-brand/30">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-ink font-display">
                Instalá Scout App en tu Celular
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Accedé directo desde tu pantalla de inicio y consultá fichas médicas en campamento sin conexión.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClickInstalar}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Descargar en Celular</span>
          </button>
        </div>
      )}

      {modalGuiaAbierto &&
        createPortal(
          <div
            onClick={() => setModalGuiaAbierto(false)}
            className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 motion-reduce:animate-none"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transition-colors"
            >
              <div className="p-4 border-b border-rule flex items-center justify-between bg-paper-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/brand/Logo%20Juancho%20Icono.png"
                    alt="Grupo Scout Juan XXIII"
                    className="w-8 h-8 object-contain shrink-0 m-1"
                  />
                  <div>
                    <h4 className="text-sm font-extrabold text-ink font-display">
                      Instalar App en tu Celular
                    </h4>
                    <p className="text-[11px] text-ink-muted">
                      Grupo Scout Juan XXIII
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalGuiaAbierto(false)}
                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-3 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-neutral-700 dark:text-neutral-200">
                {esIos ? (
                  <div className="space-y-3">
                    <p className="font-bold text-ink text-sm">
                      Pasos para instalar en iPhone / iPad (Safari):
                    </p>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-rule">
                      <Share className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-ink">
                          1. Tocá el botón “Compartir”
                        </span>
                        <span className="text-ink-muted">
                          Está en la barra inferior o superior de Safari.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-rule">
                      <PlusSquare className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-ink">
                          2. Elegí “Agregar a inicio”
                        </span>
                        <span className="text-ink-muted">
                          Deslizá hacia abajo en el menú y tocá “Agregar a la pantalla de inicio”.
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="font-bold text-ink text-sm">
                      Pasos para instalar en Android / Chrome:
                    </p>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-rule">
                      <MoreVertical className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-ink">
                          1. Abrí el menú del navegador (⋮)
                        </span>
                        <span className="text-ink-muted">
                          Tocá los tres puntos arriba a la derecha en Chrome.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-rule">
                      <Smartphone className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-ink">
                          2. Tocá “Instalar aplicación” o “Agregar a la pantalla principal”
                        </span>
                        <span className="text-ink-muted">
                          La app quedará instalada con su ícono oficial en tu pantalla de inicio.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-brand/10 border border-brand/30 flex items-center gap-2 text-ink font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                  <span>
                    Una vez instalada, abre a pantalla completa como una aplicación nativa.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setModalGuiaAbierto(false)}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs transition-colors cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
