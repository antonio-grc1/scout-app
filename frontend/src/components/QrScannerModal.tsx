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

  useEffect(() => {
    if (!abierto) {
      limpiarEstado();
      return;
    }

    if (modo === 'camara' && !previaEntrega) {
      iniciarCamara();
    } else {
      detenerCamara();
    }

    return () => {
      detenerCamara();
    };
  }, [abierto, modo, previaEntrega]);

  const limpiarEstado = () => {
    detenerCamara();
    setModo('camara');
    setCodigoManual('');
    setCargando(false);
    setValidando(false);
    setError(null);
    setExito(null);
    setPreviaEntrega(null);
  };

  const detenerCamara = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().catch(() => {});
    }
  };

  const iniciarCamara = async () => {
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
          detenerCamara();
          await consultarFicha(decodedText);
        },
        () => {},
      );
    } catch {
      setError('Cámara no disponible. Ingresá el código al pie de la hoja.');
      setModo('manual');
    }
  };

  const consultarFicha = async (hash: string) => {
    const hashLimpio = hash.trim();
    if (!hashLimpio) {
      setError('Ingresá un código válido.');
      return;
    }

    setCargando(true);
    setError(null);
    try {
      const res = await api.get(`/legajos/qr/verificar/${hashLimpio}`);
      setPreviaEntrega(res.data);
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'Código QR no encontrado.'));
    } finally {
      setCargando(false);
    }
  };

  const handleValidarFisicamente = async () => {
    if (!previaEntrega?.hashVerificacion) return;

    setValidando(true);
    setError(null);
    try {
      const res = await api.post(`/legajos/qr/validar/${previaEntrega.hashVerificacion}`);
      setExito(
        `Papel de ${previaEntrega.usuario.nombre} ${previaEntrega.usuario.apellido} recibido.`,
      );
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition-colors">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
              Recibir Ficha en Papel
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de modo táctil */}
        {!previaEntrega && (
          <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-100 dark:bg-slate-800/60 mx-4 mt-3 rounded-xl text-xs font-bold">
            <button
              onClick={() => {
                setModo('camara');
                setError(null);
              }}
              className={`min-h-[40px] rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                modo === 'camara'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-500'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Cámara QR</span>
            </button>
            <button
              onClick={() => {
                setModo('manual');
                setError(null);
                detenerCamara();
              }}
              className={`min-h-[40px] rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                modo === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-500'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Código Manual</span>
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 flex flex-col items-center">
          {previaEntrega ? (
            <div className="w-full space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm truncate">
                        {previaEntrega.usuario?.apellido}, {previaEntrega.usuario?.nombre}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
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
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
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
                  className="flex-1 min-h-[46px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center gap-1.5"
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
                      className="flex-1 min-h-[46px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{validando ? 'Guardando...' : 'Confirmar Recibido'}</span>
                    </button>
                  )}
              </div>
            </div>
          ) : modo === 'camara' ? (
            <>
              <div
                id="qr-reader-container"
                className="w-full max-w-[260px] h-[260px] rounded-2xl overflow-hidden bg-black flex items-center justify-center border border-slate-800"
              />

              {cargando && (
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-3 animate-pulse">
                  Verificando ficha...
                </p>
              )}
            </>
          ) : (
            <div className="w-full space-y-3">
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  placeholder="Código al pie de la hoja..."
                  value={codigoManual}
                  onChange={(e) => setCodigoManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') consultarFicha(codigoManual);
                  }}
                  className="w-full min-h-[46px] pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                disabled={cargando || !codigoManual.trim()}
                onClick={() => consultarFicha(codigoManual)}
                className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {cargando ? 'Buscando...' : 'Verificar Ficha'}
              </button>
            </div>
          )}

          {exito && (
            <div className="mt-3 w-full p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
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
