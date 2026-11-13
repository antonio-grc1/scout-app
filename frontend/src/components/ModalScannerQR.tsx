import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Keyboard,
  RefreshCw,
  ShoppingBag,
  User,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../api/client';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { useHtml5QrScanner } from '../hooks/useHtml5QrScanner';
import { ModalDefinirPagoPedido } from './ModalDefinirPagoPedido';

export interface ModalScannerQRProps {
  abierto: boolean;
  onCerrar: () => void;
  onTicketValidado?: () => void;
}

interface ValidacionResultado {
  ok: boolean;
  estado: string;
  mensaje: string;
  alertaPagoPendiente?: boolean;
  montoPendiente?: number;
  pedidoId?: number;
  ticket?: {
    id: number;
    pedidoId?: number;
    producto: string;
    cantidad: number;
    comprador: string;
    vendedor?: string | null;
    evento: string;
    fechaUso?: string | null;
    pedidoEstado?: string;
    pedidoTotal?: number;
    pedidoMetodoPago?: string | null;
  };
}

const playFeedbackTone = (frequency: number) => {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.1;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.14);
    oscillator.addEventListener('ended', () => {
      audioContext.close().catch(() => {});
    });
  } catch {
    // Ignore audio errors on unsupported browsers
  }
};

export const ModalScannerQR: React.FC<ModalScannerQRProps> = ({
  abierto,
  onCerrar,
  onTicketValidado,
}) => {
  const scanInProgressRef = useRef<boolean>(false);
  const scanResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tokenManual, setTokenManual] = useState<string>('');
  const [validando, setValidando] = useState<boolean>(false);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: validando,
  });
  const [resultado, setResultado] = useState<ValidacionResultado | null>(null);
  const [modoManual, setModoManual] = useState<boolean>(false);
  const [modalCobroAbierto, setModalCobroAbierto] = useState<boolean>(false);
  const [modalCobroDatos, setModalCobroDatos] = useState<{
    pedidoId: number;
    monto: number;
    comprador: string;
    producto?: string;
    cantidad?: number;
    evento?: string;
    vendedor?: string | null;
  } | null>(null);

  const { iniciandoCamara, errorCamara, setErrorCamara } = useHtml5QrScanner({
    containerId: 'qr-reader',
    activo: abierto && !modoManual,
    qrboxSize: 250,
    mensajeErrorCamara:
      'No se pudo encender la cámara (permiso denegado o no disponible). Podés ingresar el código manualmente.',
    onErrorCamara: () => {
      setModoManual(true);
    },
    onDecode: async (decodedText) => {
      if (scanInProgressRef.current) return;
      scanInProgressRef.current = true;
      await procesarToken(decodedText);
    },
  });

  const limpiarScanResetTimer = () => {
    if (scanResetTimerRef.current !== null) {
      clearTimeout(scanResetTimerRef.current);
      scanResetTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!abierto) {
      limpiarScanResetTimer();
      setResultado(null);
      setErrorCamara(null);
      setTokenManual('');
      setModalCobroAbierto(false);
      setModalCobroDatos(null);
      scanInProgressRef.current = false;
    }

    return () => {
      limpiarScanResetTimer();
    };
  }, [abierto, setErrorCamara]);

  const procesarToken = async (token: string) => {
    const raw = token.trim();
    if (!raw) {
      scanInProgressRef.current = false;
      return;
    }

    setValidando(true);
    setResultado(null);

    try {
      const res = await api.post('/tesoreria/eventos/validar-qr', { tokenQr: raw });
      const data: ValidacionResultado = res.data;
      setResultado(data);

      if (data.ok) {
        playFeedbackTone(880); // Tono agudo de éxito
        if (onTicketValidado) onTicketValidado();

        const esPendiente = Boolean(
          data.alertaPagoPendiente || data.ticket?.pedidoEstado === 'PENDIENTE',
        );
        const resolvedPedidoId = data.pedidoId || data.ticket?.pedidoId;

        if (esPendiente && resolvedPedidoId) {
          // Desplegar automáticamente el modal para definir si está abonado o no y cómo
          setModalCobroDatos({
            pedidoId: resolvedPedidoId,
            monto: data.montoPendiente || data.ticket?.pedidoTotal || 0,
            comprador: data.ticket?.comprador || 'Comprador',
            producto: data.ticket?.producto,
            cantidad: data.ticket?.cantidad,
            evento: data.ticket?.evento,
            vendedor: data.ticket?.vendedor,
          });
          setModalCobroAbierto(true);
          // La cámara permanece pausada mientras esté el modal abierto
        } else {
          limpiarScanResetTimer();
          scanResetTimerRef.current = setTimeout(() => {
            scanInProgressRef.current = false;
            scanResetTimerRef.current = null;
          }, 2500);
        }
      } else {
        if (data.estado === 'YA_UTILIZADO') {
          playFeedbackTone(440); // Tono medio de advertencia
        } else {
          playFeedbackTone(220); // Tono grave de error
        }
        limpiarScanResetTimer();
        scanResetTimerRef.current = setTimeout(() => {
          scanInProgressRef.current = false;
          scanResetTimerRef.current = null;
        }, 2500);
      }
    } catch (err) {
      playFeedbackTone(220);
      const msg = traducirErrorAmigable(err, 'Código QR no reconocido o inválido.');
      setResultado({
        ok: false,
        estado: 'ERROR',
        mensaje: msg,
      });
      limpiarScanResetTimer();
      scanResetTimerRef.current = setTimeout(() => {
        scanInProgressRef.current = false;
        scanResetTimerRef.current = null;
      }, 2500);
    } finally {
      setValidando(false);
      setTokenManual('');
    }
  };

  const handlePagoConfirmado = (nuevoMetodo: string, nuevoEstado: 'PAGADO' | 'PENDIENTE') => {
    if (nuevoEstado === 'PAGADO') {
      playFeedbackTone(880);
      setResultado((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          alertaPagoPendiente: false,
          mensaje: `¡Entrega confirmada y pago registrado (${nuevoMetodo})! Entregar: ${prev.ticket?.cantidad}x ${prev.ticket?.producto}`,
          ticket: prev.ticket
            ? {
                ...prev.ticket,
                pedidoEstado: 'PAGADO',
                pedidoMetodoPago: nuevoMetodo,
              }
            : undefined,
        };
      });
      if (onTicketValidado) onTicketValidado();
    }
  };

  const abrirModalCobro = (resObj: ValidacionResultado) => {
    const pId = resObj.pedidoId || resObj.ticket?.pedidoId;
    if (!pId) return;

    scanInProgressRef.current = true;
    setModalCobroDatos({
      pedidoId: pId,
      monto: resObj.montoPendiente || resObj.ticket?.pedidoTotal || 0,
      comprador: resObj.ticket?.comprador || 'Comprador',
      producto: resObj.ticket?.producto,
      cantidad: resObj.ticket?.cantidad,
      evento: resObj.ticket?.evento,
      vendedor: resObj.ticket?.vendedor,
    });
    setModalCobroAbierto(true);
  };

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (tokenManual.trim()) {
      procesarToken(tokenManual.trim());
    }
  };

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      {...backdropProps}
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-surface border border-rule shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        {...contentProps}
      >
        {/* Encabezado */}
        <div className="p-4 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand" />
            <div>
              <h3 className="text-sm font-black text-ink">Escanear Vale / Entrada</h3>
              <span className="text-[11px] text-ink-muted">Validación de retiros en tiempo real</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Cámara / Viewfinder */}
          {!modoManual ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square flex flex-col items-center justify-center border border-rule">
              <div id="qr-reader" className="w-full h-full" />

              {iniciandoCamara && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-brand" />
                  <span className="text-xs font-bold">Encendiendo cámara...</span>
                </div>
              )}

              {/* Guía visual de escaneo */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-dashed border-white/60 rounded-2xl animate-pulse" />
              </div>
            </div>
          ) : (
            /* Modo Manual Input */
            <form onSubmit={handleSubmitManual} className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Keyboard className="w-4 h-4 text-brand" />
                <span>Ingreso Manual de Código</span>
              </div>
              <input
                type="text"
                value={tokenManual}
                onChange={(e) => setTokenManual(e.target.value)}
                placeholder="Pegá o escribí el código o UUID..."
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs font-mono text-ink focus:outline-brand"
                autoFocus
              />
              <Button
                type="submit"
                variant="primary"
                disabled={validando || !tokenManual.trim()}
                className="w-full text-xs font-bold"
              >
                {validando ? 'Validando...' : 'Verificar Código'}
              </Button>
            </form>
          )}

          {errorCamara && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorCamara}</span>
            </div>
          )}

          {/* Resultado de la validación */}
          {resultado && (
            <div
              className={`p-4 rounded-2xl border transition-all animate-in zoom-in-95 duration-150 ${
                resultado.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                  : resultado.estado === 'YA_UTILIZADO'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
              }`}
            >
              <div className="flex items-start gap-3">
                {resultado.ok ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : resultado.estado === 'YA_UTILIZADO' ? (
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}

                <div className="space-y-1 flex-1">
                  <h4 className="text-sm font-black tracking-tight">{resultado.mensaje}</h4>

                  {resultado.ok && (resultado.alertaPagoPendiente || resultado.ticket?.pedidoEstado === 'PENDIENTE') && (
                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>ATENCIÓN: Pago PENDIENTE ({formatearMoneda(resultado.montoPendiente || resultado.ticket?.pedidoTotal || 0)}).</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={() => abrirModalCobro(resultado)}
                        className="text-[11px] py-1 px-2.5 shrink-0"
                      >
                        Definir Pago
                      </Button>
                    </div>
                  )}

                  {resultado.ok && resultado.ticket?.pedidoEstado === 'PAGADO' && (
                    <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100 text-xs font-bold flex items-center gap-2 mt-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Pedido Abonado {resultado.ticket.pedidoMetodoPago ? `(${resultado.ticket.pedidoMetodoPago})` : ''}</span>
                    </div>
                  )}

                  {resultado.ticket && (
                    <div className="pt-2 mt-2 border-t border-rule/40 space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 font-black text-ink">
                        <ShoppingBag className="w-3.5 h-3.5 text-brand" />
                        <span>
                          {resultado.ticket.cantidad}x {resultado.ticket.producto}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-muted">
                        <User className="w-3.5 h-3.5" />
                        <span>Comprador: <strong>{resultado.ticket.comprador}</strong></span>
                      </div>
                      {resultado.ticket.vendedor && (
                        <div className="flex items-center gap-1.5 text-ink-muted">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Vendido por: <strong>{resultado.ticket.vendedor}</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Toggle modo cámara vs manual */}
        <div className="p-3 bg-paper-2 border-t border-rule flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              setModoManual(!modoManual);
              setResultado(null);
            }}
            className="text-xs font-bold text-brand hover:underline cursor-pointer flex items-center gap-1.5"
          >
            {modoManual ? (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>Usar Cámara Móvil</span>
              </>
            ) : (
              <>
                <Keyboard className="w-3.5 h-3.5" />
                <span>Ingresar código manual</span>
              </>
            )}
          </button>

          <Button variant="secondary" size="sm" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      </div>

      {modalCobroAbierto && modalCobroDatos && (
        <ModalDefinirPagoPedido
          abierto={modalCobroAbierto}
          onCerrar={() => {
            setModalCobroAbierto(false);
            setTimeout(() => {
              scanInProgressRef.current = false;
            }, 1500);
          }}
          pedidoId={modalCobroDatos.pedidoId}
          monto={modalCobroDatos.monto}
          comprador={modalCobroDatos.comprador}
          producto={modalCobroDatos.producto}
          cantidad={modalCobroDatos.cantidad}
          evento={modalCobroDatos.evento}
          vendedor={modalCobroDatos.vendedor}
          onPagoConfirmado={handlePagoConfirmado}
        />
      )}
    </div>
  );
};
