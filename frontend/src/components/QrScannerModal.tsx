import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  X,
  Camera,
  Keyboard,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileText,
  User,
  RotateCcw,
} from 'lucide-react';
import { api } from '../api/client';
import { ESTADO_FICHA_CONFIG, traducirErrorAmigable } from '../lib/formatters';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onValidadoExitoso: (detalle: any) => void;
}

export const QrScannerModal: React.FC<Props> = ({ abierto, onCerrar, onValidadoExitoso }) => {
  const [modo, setModo] = useState<'camara' | 'manual'>('camara');
  const [codigoManual, setCodigoManual] = useState('');
  const [cargando, setCargando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [previaEntrega, setPreviaEntrega] = useState<any | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const transicionRef = useRef<Promise<void>>(Promise.resolve());

  const detenerCamara = () => {
    transicionRef.current = transicionRef.current
      .then(async () => {
        const inst = scannerRef.current;
        if (!inst) return;
        try {
          if (inst.isScanning) {
            await inst.stop();
          }
        } catch {
          // Ignorar errores de transición DOM de html5-qrcode
        }
        try {
          inst.clear();
        } catch {
          // Ignorar si el contenedor ya no está visible
        }
        scannerRef.current = null;
      })
      .catch(() => {});
    return transicionRef.current;
  };

  const iniciarCamara = () => {
    transicionRef.current = transicionRef.current
      .then(async () => {
        if (scannerRef.current?.isScanning) return;
        const container = document.getElementById('qr-reader-container');
        if (!container) return;

        try {
          setError(null);
          setExito(null);
          const html5QrCode = new Html5Qrcode('qr-reader-container');
          scannerRef.current = html5QrCode;

          await html5QrCode.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 240, height: 240 },
            },
            async (decodedText) => {
              await detenerCamara();
              await consultarFicha(decodedText);
            },
            () => {},
          );
        } catch {
          scannerRef.current = null;
          setError('Cámara no disponible. Ingresá el código al pie de la hoja o DNI.');
          setModo('manual');
        }
      })
      .catch(() => {});
    return transicionRef.current;
  };

  const limpiarEstado = () => {
    void detenerCamara();
    setModo('camara');
    setCodigoManual('');
    setCargando(false);
    setValidando(false);
    setError(null);
    setExito(null);
    setPreviaEntrega(null);
  };

  useEffect(() => {
    if (!abierto) {
      limpiarEstado();
      return;
    }

    if (modo === 'camara' && !previaEntrega) {
      void iniciarCamara();
    } else {
      void detenerCamara();
    }

    return () => {
      void detenerCamara();
    };
  }, [abierto, modo, previaEntrega]);

  const consultarFicha = async (hash: string) => {
    const hashLimpio = hash.trim();
    if (!hashLimpio) {
      setError('Ingresá un código o DNI válido.');
      return;
    }

    setCargando(true);
    setError(null);
    try {
      const res = await api.get(`/legajos/qr/verificar/${encodeURIComponent(hashLimpio)}`);
      setPreviaEntrega(res.data);
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'Código QR o DNI sin ficha registrada.'));
    } finally {
      setCargando(false);
    }
  };

  const handleValidarFisicamente = async () => {
    if (!previaEntrega?.hashVerificacion) return;

    setValidando(true);
    setError(null);
    try {
      const res = await api.post(
        `/legajos/qr/validar/${encodeURIComponent(previaEntrega.hashVerificacion)}`,
      );
      const nombreCompleto = `${previaEntrega.usuario?.nombre || ''} ${previaEntrega.usuario?.apellido || ''}`.trim();
      setExito(`Papel de ${nombreCompleto || 'miembro'} recibido.`);
      onValidadoExitoso(res.data);
      setTimeout(() => {
        onCerrar();
      }, 1200);
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo validar la ficha.'));
    } finally {
      setValidando(false);
    }
  };

  const handleReintentar = () => {
    setError(null);
    setExito(null);
    setPreviaEntrega(null);
    setCodigoManual('');
  };

  if (!abierto) return null;

  const cfgEstado = previaEntrega
    ? ESTADO_FICHA_CONFIG[previaEntrega.estado] || ESTADO_FICHA_CONFIG.BORRADOR
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <div className="bg-surface border border-rule rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition-colors text-ink">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-rule">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand" />
            <h3 className="font-extrabold text-ink text-sm">
              Recibir Ficha en Papel
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de modo táctil */}
        {!previaEntrega && (
          <div className="grid grid-cols-2 gap-1.5 p-2 bg-paper-2 border border-rule mx-4 mt-3 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setModo('camara');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                modo === 'camara'
                  ? 'bg-brand text-brand-contrast font-extrabold shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Cámara QR</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModo('manual');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                modo === 'manual'
                  ? 'bg-brand text-brand-contrast font-extrabold shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Código Manual</span>
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 flex flex-col items-center">
          {/* Mantenemos el contenedor del escáner montado en el DOM para evitar crashes de html5-qrcode al cambiar de modo */}
          <div
            className={
              !previaEntrega && modo === 'camara'
                ? 'w-full flex flex-col items-center'
                : 'hidden'
            }
          >
            <div
              id="qr-reader-container"
              className="w-full max-w-[260px] h-[260px] rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-rule"
            />

            {cargando && (
              <p className="text-xs font-bold text-brand mt-3 animate-pulse">
                Verificando ficha…
              </p>
            )}
          </div>

          {previaEntrega ? (
            <div className="w-full space-y-4">
              <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center font-bold text-sm shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-ink text-sm truncate">
                        {previaEntrega.usuario?.apellido}, {previaEntrega.usuario?.nombre}
                      </h4>
                      <p className="text-xs text-ink-muted">
                        DNI {previaEntrega.usuario?.dni} •{' '}
                        {previaEntrega.usuario?.asignaciones?.[0]?.unidad?.nombre || 'Sin Sección'}
                      </p>
                    </div>
                  </div>

                  {cfgEstado && (
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full font-bold text-[10px] border ${cfgEstado.badgeClass}`}
                    >
                      {cfgEstado.shortLabel}
                    </span>
                  )}
                </div>
              </div>

              {previaEntrega.estado === 'VALIDADO_FISICAMENTE' && (
                <div className="p-3 bg-brand/10 border border-brand/30 rounded-xl flex items-center gap-2 text-brand text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-brand" />
                  <span>Esta ficha ya figura como entregada al día.</span>
                </div>
              )}

              {previaEntrega.estado === 'DESACTUALIZADO_REQUIERE_REIMPRESION' && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-200 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>Se editaron datos después de imprimir. Pedir la copia nueva.</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleReintentar}
                  className="flex-1 min-h-[46px] px-3 rounded-xl border border-rule text-ink font-bold text-xs hover:bg-paper-2 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Otro QR</span>
                </button>

                {previaEntrega.estado !== 'VALIDADO_FISICAMENTE' &&
                  previaEntrega.estado !== 'DESACTUALIZADO_REQUIERE_REIMPRESION' && (
                    <button
                      type="button"
                      disabled={validando}
                      onClick={handleValidarFisicamente}
                      className="flex-1 min-h-[46px] px-3 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-xs transition-colors shadow-2xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{validando ? 'Guardando...' : 'Confirmar Recibido'}</span>
                    </button>
                  )}
              </div>
            </div>
          ) : modo === 'manual' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void consultarFicha(codigoManual);
              }}
              className="w-full space-y-3"
            >
              <div className="relative">
                <FileText className="w-4 h-4 text-ink-muted absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Código al pie de la hoja o DNI..."
                  value={codigoManual}
                  onChange={(e) => setCodigoManual(e.target.value)}
                  className="w-full min-h-[46px] pl-10 pr-3 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm outline-none focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/20 transition-colors placeholder:text-ink-muted"
                />
              </div>
              <p className="text-[11px] text-ink-muted px-1">
                Ingresá el código que figura al pie de la planilla impresa o el DNI del miembro.
              </p>

              <button
                type="submit"
                disabled={cargando || !codigoManual.trim()}
                className="w-full min-h-[46px] rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-xs transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {cargando ? 'Buscando...' : 'Verificar Ficha'}
              </button>
            </form>
          ) : null}

          {exito && (
            <div className="mt-3 w-full p-3 bg-brand/10 border border-brand/30 rounded-xl flex items-center gap-2 text-brand text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
              <span>{exito}</span>
            </div>
          )}

          {error && (
            <div className="mt-3 w-full p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-200 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
