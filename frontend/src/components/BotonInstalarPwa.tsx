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
          className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Instalar App</span>
        </button>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Instalá Scout App en tu Celular
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Accedé directo desde tu pantalla de inicio y consultá fichas médicas en campamento sin conexión.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClickInstalar}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
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
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                    ⚜
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Instalar App en tu Celular
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Grupo Scout Juan XXIII
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalGuiaAbierto(false)}
                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700 dark:text-slate-200">
                {esIos ? (
                  <div className="space-y-3">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      Pasos para instalar en iPhone / iPad (Safari):
                    </p>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <Share className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-slate-900 dark:text-white">
                          1. Tocá el botón "Compartir"
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Está en la barra inferior o superior de Safari.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <PlusSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-slate-900 dark:text-white">
                          2. Elegí "Agregar a inicio"
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Deslizá hacia abajo en el menú y tocá "Agregar a la pantalla de inicio".
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">
                      Pasos para instalar en Android / Chrome:
                    </p>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <MoreVertical className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-slate-900 dark:text-white">
                          1. Abrí el menú del navegador (⋮)
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Tocá los tres puntos arriba a la derecha en Chrome.
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold block text-slate-900 dark:text-white">
                          2. Tocá "Instalar aplicación" o "Agregar a la pantalla principal"
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          La app quedará instalada con su ícono oficial en tu pantalla de inicio.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Una vez instalada, abre a pantalla completa como una aplicación nativa.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setModalGuiaAbierto(false)}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer"
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
