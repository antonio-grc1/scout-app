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
      setError('No se pudo acceder a la cámara. Puedes ingresar el código alfanumérico manualmente.');
      setModo('manual');
    }
  };

  const consultarFicha = async (hash: string) => {
    const hashLimpio = hash.trim();
    if (!hashLimpio) {
      setError('Ingresa un código de verificación válido.');
      return;
    }

    setCargando(true);
    setError(null);
    try {
      const res = await api.get(`/legajos/qr/verificar/${hashLimpio}`);
      setPreviaEntrega(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Código QR o código de verificación inexistente.';
      setError(msg);
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
        `Ficha física de ${previaEntrega.usuario.nombre} ${previaEntrega.usuario.apellido} validada exitosamente.`,
      );
      onValidadoExitoso(res.data);
      setTimeout(() => {
        onCerrar();
      }, 2000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al registrar la validación física.';
      setError(msg);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transition-colors">
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Validar Ficha Física Oficial
            </h3>
          </div>
          <button
            onClick={onCerrar}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de modo (solo si no estamos en vista previa) */}
        {!previaEntrega && (
          <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-semibold">
            <button
              onClick={() => {
                setModo('camara');
                setError(null);
              }}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition cursor-pointer ${
                modo === 'camara'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
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
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 transition cursor-pointer ${
                modo === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>Código Manual</span>
            </button>
          </div>
        )}

        <div className="p-5 flex flex-col items-center">
          {/* Vista 1: Confirmación / Previa de la Ficha Detectada */}
          {previaEntrega ? (
            <div className="w-full space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {previaEntrega.usuario?.apellido}, {previaEntrega.usuario?.nombre}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      DNI: {previaEntrega.usuario?.dni}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Rama / Unidad
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {previaEntrega.usuario?.asignaciones?.[0]?.unidad?.nombre || 'Sin Unidad'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Documento
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {previaEntrega.plantilla?.titulo || 'Ficha de Inscripción'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Ciclo / Versión
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Ciclo {previaEntrega.cicloAnio} · v{previaEntrega.versionImpresion}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Estado Actual
                    </span>
                    <span
                      className={`font-bold inline-block px-1.5 py-0.5 rounded-md text-[10px] mt-0.5 ${
                        previaEntrega.estado === 'VALIDADO_FISICAMENTE'
                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                          : previaEntrega.estado === 'DESACTUALIZADO_REQUIERE_REIMPRESION'
                          ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                          : 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300'
                      }`}
                    >
                      {previaEntrega.estado === 'VALIDADO_FISICAMENTE'
                        ? 'Validado Físicamente'
                        : previaEntrega.estado === 'DESACTUALIZADO_REQUIERE_REIMPRESION'
                        ? 'Requiere Reimpresión'
                        : 'Pendiente Firma Física'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mensajes de advertencia según estado */}
              {previaEntrega.estado === 'VALIDADO_FISICAMENTE' && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2 text-amber-800 dark:text-amber-200 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Esta ficha ya se encuentra validada físicamente en el sistema.</span>
                </div>
              )}

              {previaEntrega.estado === 'DESACTUALIZADO_REQUIERE_REIMPRESION' && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-800 dark:text-red-200 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>
                    El miembro editó sus datos con posterioridad. Esta copia física no es válida; debe presentar la nueva impresión.
                  </span>
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleReintentar}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Volver a Escanear</span>
                </button>

                {previaEntrega.estado !== 'VALIDADO_FISICAMENTE' &&
                  previaEntrega.estado !== 'DESACTUALIZADO_REQUIERE_REIMPRESION' && (
                    <button
                      type="button"
                      disabled={validando}
                      onClick={handleValidarFisicamente}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{validando ? 'Validando...' : 'Confirmar Validación'}</span>
                    </button>
                  )}
              </div>
            </div>
          ) : modo === 'camara' ? (
            /* Vista 2: Escáner de Cámara */
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-4">
                Apunta la cámara del celular al código QR estampado en la ficha física en papel.
              </p>

              <div
                id="qr-reader-container"
                className="w-full max-w-[260px] h-[260px] rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-800"
              />

              {cargando && (
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-4 animate-pulse">
                  Consultando comprobante...
                </p>
              )}
            </>
          ) : (
            /* Vista 3: Ingreso Manual de Hash */
            <div className="w-full space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Ingresa el código alfanumérico impreso debajo del código QR de la ficha en papel.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Código de Verificación (Hash)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Ej. e7a9c8b12f..."
                    value={codigoManual}
                    onChange={(e) => setCodigoManual(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        consultarFicha(codigoManual);
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={cargando || !codigoManual.trim()}
                onClick={() => consultarFicha(codigoManual)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {cargando ? 'Buscando Ficha...' : 'Buscar Ficha'}
              </button>
            </div>
          )}

          {/* Feedback de Éxito y Error */}
          {exito && (
            <div className="mt-4 w-full p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2.5 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{exito}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 w-full p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2.5 text-red-800 dark:text-red-200 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

