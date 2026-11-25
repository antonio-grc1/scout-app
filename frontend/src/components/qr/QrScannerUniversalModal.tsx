import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Keyboard,
  Landmark,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  QrCode,
  Repeat,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  User,
  Volume2,
  XCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import { useQrModalStore, type QrScope } from '../../core/qrModalStore';
import { useHtml5QrScanner } from '../../hooks/useHtml5QrScanner';
import {
  ESTADO_FICHA_CONFIG,
  formatearMoneda,
  obtenerRolPrincipal,
  traducirErrorAmigable,
} from '../../lib/formatters';
import { useAuthStore } from '../../store/authStore';
import { useOfflineStore } from '../../store/offlineStore';
import { useToastStore } from '../../store/toastStore';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

interface ValeSeleccion {
  ticketId: number;
  producto: string;
  cantidad: number;
  retirada: number;
  pendiente: number;
}

interface ValidacionEventoResultado {
  ok: boolean;
  estado: string;
  mensaje: string;
  alertaPagoPendiente?: boolean;
  montoPendiente?: number;
  pedidoId?: number;
  /** Lo que queda por retirar tras una entrega parcial */
  pendiente?: string | null;
  /** Con estado SELECCION: productos del QR para elegir qué se entrega */
  vales?: ValeSeleccion[];
  ticket?: {
    id: number;
    pedidoId?: number;
    producto: string;
    cantidad: number;
    /** Todo lo que se entrega con el QR, p. ej. "2x Docena + 1x Media docena" */
    detalle?: string;
    comprador: string;
    vendedor?: string | null;
    evento: string;
    fechaUso?: string | null;
    pedidoEstado?: string;
    pedidoTotal?: number;
    pedidoMetodoPago?: string | null;
  };
}

interface SubVistaCobroDatos {
  pedidoId: number;
  monto: number;
  comprador: string;
  producto?: string;
  cantidad?: number;
  evento?: string;
  vendedor?: string | null;
}

interface CuentaFinancieraItem {
  id: number;
  nombre: string;
  tipo: string;
  activa?: boolean;
}

function playFeedbackTone(frequency: number) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
    // Ignorar errores de audio en navegadores sin soporte o sin interacción previa
  }
}

export const QrScannerUniversalModal: React.FC = () => {
  const { abierto, scopeInicial, cerrarQr, notificarValidacion } = useQrModalStore();
  const caps = useCapabilities();
  const usuarioActual = useAuthStore((s) => s.usuario);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const puedeLegajo = caps.canValidateQr;
  const puedeEvento = caps.canSellEventos;
  const puedeCobrarEventoPuerta = caps.canCreateGlobalEventos;
  const tieneAmbos = puedeLegajo && puedeEvento;

  const resolverScopeInicial = useCallback(
    (inicial: QrScope): QrScope => {
      if (inicial === 'legajo' && puedeLegajo) return 'legajo';
      if (inicial === 'evento' && puedeEvento) return 'evento';
      if (puedeLegajo && !puedeEvento) return 'legajo';
      if (!puedeLegajo && puedeEvento) return 'evento';
      return 'auto';
    },
    [puedeLegajo, puedeEvento],
  );

  const [scope, setScope] = useState<QrScope>(() => resolverScopeInicial(scopeInicial));
  const [modo, setModo] = useState<'camara' | 'manual'>('camara');
  const [continuo, setContinuo] = useState<boolean>(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [cargando, setCargando] = useState(false);
  const [validando, setValidando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [resultadoLegajo, setResultadoLegajo] = useState<any | null>(null);
  const [resultadoEvento, setResultadoEvento] = useState<ValidacionEventoResultado | null>(null);
  // Retiro parcial: QR en elección y unidades a entregar por vale (ticketId → cantidad)
  const [tokenSeleccion, setTokenSeleccion] = useState<string | null>(null);
  const [cantidadesEntrega, setCantidadesEntrega] = useState<Record<number, number>>({});
  const enSeleccion = resultadoEvento?.estado === 'SELECCION';

  // Sub-vista inline de cobro en puerta (reemplaza ModalDefinirPagoPedido sin portal anidado)
  const [subVistaCobro, setSubVistaCobro] = useState<SubVistaCobroDatos | null>(null);
  const [estaAbonado, setEstaAbonado] = useState<boolean>(true);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'>('EFECTIVO');
  const [cuentaId, setCuentaId] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [cuentas, setCuentas] = useState<CuentaFinancieraItem[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState<boolean>(false);
  const [errorCuentas, setErrorCuentas] = useState<string | null>(null);
  const [guardandoCobro, setGuardandoCobro] = useState<boolean>(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);

  const scanInProgressRef = useRef<boolean>(false);
  const scanResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enviandoCobroRef = useRef<boolean>(false);
  // Se incrementa para reencender la cámara cuando un escaneo no deja tarjeta de resultado.
  const [reinicioCamara, setReinicioCamara] = useState(0);

  const limpiarCooldown = useCallback(() => {
    if (scanResetTimerRef.current !== null) {
      clearTimeout(scanResetTimerRef.current);
      scanResetTimerRef.current = null;
    }
  }, []);

  const programarResetScan = useCallback(() => {
    limpiarCooldown();
    scanResetTimerRef.current = setTimeout(() => {
      scanInProgressRef.current = false;
      scanResetTimerRef.current = null;
    }, 2500);
  }, [limpiarCooldown]);

  const camaraVisible =
    abierto &&
    modo === 'camara' &&
    !subVistaCobro &&
    (continuo ? !enSeleccion : !resultadoLegajo && !resultadoEvento);

  const camaraActiva =
    abierto &&
    modo === 'camara' &&
    !subVistaCobro &&
    (continuo ? !enSeleccion : !resultadoLegajo && !resultadoEvento);

  const seleccionarCuentaPorMetodo = useCallback(
    (listaCuentas: CuentaFinancieraItem[], metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO') => {
      if (listaCuentas.length === 0) {
        setCuentaId('');
        return;
      }
      if (metodo === 'EFECTIVO') {
        const caja = listaCuentas.find((c) => c.tipo === 'CAJA_EFECTIVO');
        if (caja) {
          setCuentaId(String(caja.id));
          return;
        }
      } else if (metodo === 'TRANSFERENCIA') {
        const banco = listaCuentas.find(
          (c) => c.tipo === 'BANCO' || c.tipo === 'MERCADOPAGO',
        );
        if (banco) {
          setCuentaId(String(banco.id));
          return;
        }
      }
      setCuentaId(String(listaCuentas[0].id));
    },
    [],
  );

  const abrirSubVistaCobro = useCallback(
    async (datos: SubVistaCobroDatos) => {
      scanInProgressRef.current = true;
      limpiarCooldown();
      setSubVistaCobro(datos);
      setEstaAbonado(true);
      setMetodoPago('EFECTIVO');
      setCuentaId('');
      setObservaciones('');
      setErrorCobro(null);
      setErrorCuentas(null);

      if (caps.canCreateGlobalEventos) {
        setCargandoCuentas(true);
        try {
          const res = await api.get('/tesoreria/cuentas');
          const data: CuentaFinancieraItem[] = Array.isArray(res.data) ? res.data : [];
          setCuentas(data);
          seleccionarCuentaPorMetodo(data, 'EFECTIVO');
        } catch (err) {
          setCuentas([]);
          setCuentaId('');
          setErrorCuentas(
            traducirErrorAmigable(err, 'No se pudieron cargar las cuentas financieras.'),
          );
        } finally {
          setCargandoCuentas(false);
        }
      } else {
        setCuentas([]);
      }
    },
    [caps.canCreateGlobalEventos, limpiarCooldown, seleccionarCuentaPorMetodo],
  );

  const procesarLegajo = useCallback(
    async (raw: string): Promise<boolean> => {
      setCargando(true);
      setError(null);
      setExito(null);
      setResultadoEvento(null);
      try {
        const res = await api.get(`/legajos/qr/verificar/${encodeURIComponent(raw)}`);
        setResultadoLegajo(res.data);
        playFeedbackTone(880);
        return true;
      } catch (err) {
        playFeedbackTone(220);
        setError(traducirErrorAmigable(err, 'Código QR o DNI sin ficha registrada.'));
        setResultadoLegajo(null);
        return false;
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  const procesarEvento = useCallback(
    async (
      raw: string,
      entregas?: Array<{ ticketId: number; cantidad: number }>,
    ): Promise<boolean> => {
      if (!isOnline) {
        mostrarToast('Necesitás conexión a internet para canjear vales en puerta.', 'advertencia');
        scanInProgressRef.current = false;
        return false;
      }

      setCargando(true);
      setError(null);
      setExito(null);
      setResultadoLegajo(null);
      try {
        const res = await api.post('/tesoreria/eventos/validar-qr', { tokenQr: raw, entregas });
        const data: ValidacionEventoResultado = res.data;
        setResultadoEvento(data);

        if (data.estado === 'SELECCION') {
          // Más de una unidad pendiente: se elige qué se lleva (por defecto, todo lo pendiente)
          playFeedbackTone(660);
          setTokenSeleccion(raw);
          setCantidadesEntrega(
            Object.fromEntries((data.vales ?? []).map((v) => [v.ticketId, v.pendiente])),
          );
          return true;
        }
        setTokenSeleccion(null);

        if (data.ok) {
          playFeedbackTone(880);
          notificarValidacion();

          const esPendiente = Boolean(
            data.alertaPagoPendiente || data.ticket?.pedidoEstado === 'PENDIENTE',
          );
          const resolvedPedidoId = data.pedidoId || data.ticket?.pedidoId;

          if (esPendiente && resolvedPedidoId && puedeCobrarEventoPuerta) {
            void abrirSubVistaCobro({
              pedidoId: resolvedPedidoId,
              monto: data.montoPendiente || data.ticket?.pedidoTotal || 0,
              comprador: data.ticket?.comprador || 'Comprador',
              producto: data.ticket?.detalle ?? data.ticket?.producto,
              cantidad: data.ticket?.detalle ? undefined : data.ticket?.cantidad,
              evento: data.ticket?.evento,
              vendedor: data.ticket?.vendedor,
            });
          } else if (continuo) {
            programarResetScan();
          }
        } else {
          playFeedbackTone(data.estado === 'YA_UTILIZADO' ? 440 : 220);
          if (continuo) programarResetScan();
        }
      } catch (err) {
        playFeedbackTone(220);
        const msg = traducirErrorAmigable(err, 'Código QR de evento no reconocido o inválido.');
        setTokenSeleccion(null);
        setResultadoEvento({
          ok: false,
          estado: 'ERROR',
          mensaje: msg,
        });
        if (continuo) programarResetScan();
      } finally {
        setCargando(false);
        setCodigoManual('');
      }
      // Siempre queda una tarjeta de resultado (ok o error) con "Escanear otro código".
      return true;
    },
    [
      isOnline,
      mostrarToast,
      notificarValidacion,
      abrirSubVistaCobro,
      puedeCobrarEventoPuerta,
      continuo,
      programarResetScan,
    ],
  );

  const procesarCodigo = useCallback(
    /** Devuelve true si quedó una tarjeta de resultado en pantalla. */
    async (codigoBruto: string): Promise<boolean> => {
      const raw = codigoBruto.trim();
      if (!raw) {
        setError('Ingresá o escaneá un código válido.');
        scanInProgressRef.current = false;
        return false;
      }

      if (scope === 'legajo' || (!puedeEvento && puedeLegajo)) {
        const ok = await procesarLegajo(raw);
        if (continuo) programarResetScan();
        return ok;
      }

      if (scope === 'evento' || (!puedeLegajo && puedeEvento)) {
        return procesarEvento(raw);
      }

      // Auto-detección cuando tiene ambos permisos
      const pareceLegajo = /^\d{6,10}$/.test(raw) || /^[0-9a-f]{64}$/i.test(raw);
      if (pareceLegajo) {
        const ok = await procesarLegajo(raw);
        if (continuo) programarResetScan();
        return ok;
      }
      return procesarEvento(raw);
    },
    [scope, puedeEvento, puedeLegajo, procesarLegajo, procesarEvento, continuo, programarResetScan],
  );

  const { iniciandoCamara, errorCamara, setErrorCamara, detenerCamara } = useHtml5QrScanner({
    containerId: 'qr-universal-reader',
    activo: camaraActiva,
    qrboxRatio: 0.8,
    mensajeErrorCamara:
      'No se pudo encender la cámara. Podés ingresar el código, DNI o token manualmente.',
    onErrorCamara: () => {
      setModo('manual');
    },
    reinicioKey: reinicioCamara,
    onDecode: async (decodedText) => {
      if (scanInProgressRef.current) return;
      scanInProgressRef.current = true;
      if (!continuo) {
        await detenerCamara();
      }
      const mostroResultado = await procesarCodigo(decodedText);
      if (!continuo && !mostroResultado) {
        // Sin tarjeta de resultado (p. ej. QR inválido u offline): liberar y reencender la cámara.
        scanInProgressRef.current = false;
        setReinicioCamara((n) => n + 1);
      }
    },
  });

  useEffect(() => {
    if (abierto) {
      setScope(resolverScopeInicial(scopeInicial));
      setModo('camara');
      setCodigoManual('');
      setError(null);
      setExito(null);
      setResultadoLegajo(null);
      setResultadoEvento(null);
      setTokenSeleccion(null);
      setSubVistaCobro(null);
      setErrorCamara(null);
      scanInProgressRef.current = false;
    } else {
      limpiarCooldown();
      scanInProgressRef.current = false;
    }
    return () => {
      limpiarCooldown();
    };
  }, [abierto, scopeInicial, resolverScopeInicial, limpiarCooldown, setErrorCamara]);

  const handleValidarLegajoFisico = async () => {
    if (!resultadoLegajo?.hashVerificacion) return;
    if (!isOnline) {
      mostrarToast(
        'Necesitás conexión a internet para validar la recepción de la ficha.',
        'advertencia',
      );
      return;
    }

    setValidando(true);
    setError(null);
    try {
      await api.post(
        `/legajos/qr/validar/${encodeURIComponent(resultadoLegajo.hashVerificacion)}`,
      );
      const nombreCompleto = `${resultadoLegajo.usuario?.nombre || ''} ${resultadoLegajo.usuario?.apellido || ''}`.trim();
      const msg = `Ficha de ${nombreCompleto || 'miembro'} recibida y validada.`;
      playFeedbackTone(880);
      setExito(msg);
      mostrarToast(msg, 'exito');
      notificarValidacion();

      setResultadoLegajo((prev: any) =>
        prev ? { ...prev, estado: 'VALIDADO_FISICAMENTE' } : prev,
      );

      if (continuo) {
        // Mismo temporizador que limpia el cierre del modal: antes quedaba suelto y podía
        // tocar estado después de cerrar.
        limpiarCooldown();
        scanResetTimerRef.current = setTimeout(() => {
          setResultadoLegajo(null);
          setExito(null);
          scanInProgressRef.current = false;
          scanResetTimerRef.current = null;
        }, 1200);
      }
    } catch (err) {
      playFeedbackTone(220);
      setError(traducirErrorAmigable(err, 'No se pudo validar la ficha médica.'));
    } finally {
      setValidando(false);
    }
  };

  const handleConfirmarCobroPuerta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subVistaCobro || enviandoCobroRef.current || guardandoCobro) return;
    setErrorCobro(null);

    if (!estaAbonado) {
      setSubVistaCobro(null);
      if (continuo) programarResetScan();
      return;
    }

    if (!isOnline) {
      mostrarToast('Necesitás conexión a internet para registrar el cobro.', 'advertencia');
      return;
    }

    if (caps.canCreateGlobalEventos && errorCuentas) {
      setErrorCobro(errorCuentas);
      return;
    }
    if (caps.canCreateGlobalEventos && !cuentaId && cuentas.length > 0) {
      setErrorCobro('Seleccioná la cuenta financiera donde ingresa el dinero.');
      return;
    }

    enviandoCobroRef.current = true;
    setGuardandoCobro(true);
    try {
      const payload: Record<string, unknown> = {
        metodoPago,
        cuentaId: caps.canCreateGlobalEventos && cuentaId ? Number(cuentaId) : undefined,
      };
      if (observaciones.trim()) {
        payload.observaciones = observaciones.trim();
      }

      await api.patch(`/tesoreria/eventos/pedidos/${subVistaCobro.pedidoId}`, payload);
      playFeedbackTone(880);
      setResultadoEvento((prev) =>
        prev
          ? {
              ...prev,
              alertaPagoPendiente: false,
              mensaje: `Entrega confirmada y pago registrado (${metodoPago}).`,
              ticket: prev.ticket
                ? {
                    ...prev.ticket,
                    pedidoEstado: 'PAGADO',
                    pedidoMetodoPago: metodoPago,
                  }
                : undefined,
            }
          : prev,
      );
      mostrarToast('Cobro en puerta registrado correctamente.', 'exito');
      notificarValidacion();
      setSubVistaCobro(null);
      if (continuo) programarResetScan();
    } catch (err) {
      playFeedbackTone(220);
      setErrorCobro(traducirErrorAmigable(err, 'No se pudo registrar el cobro del pedido.'));
    } finally {
      enviandoCobroRef.current = false;
      setGuardandoCobro(false);
    }
  };

  const handleReintentar = () => {
    limpiarCooldown();
    scanInProgressRef.current = false;
    setError(null);
    setExito(null);
    setResultadoLegajo(null);
    setResultadoEvento(null);
    setTokenSeleccion(null);
    setCodigoManual('');
    setReinicioCamara((n) => n + 1);
  };

  const valesSeleccion = enSeleccion ? (resultadoEvento?.vales ?? []) : [];
  const unidadesAEntregar = valesSeleccion.reduce(
    (acc, v) => acc + (cantidadesEntrega[v.ticketId] ?? 0),
    0,
  );
  const ajustarCantidadEntrega = (vale: ValeSeleccion, delta: number) => {
    setCantidadesEntrega((prev) => ({
      ...prev,
      [vale.ticketId]: Math.min(vale.pendiente, Math.max(0, (prev[vale.ticketId] ?? 0) + delta)),
    }));
  };
  const confirmarEntrega = () => {
    if (!tokenSeleccion || unidadesAEntregar === 0) return;
    const entregas = valesSeleccion
      .map((v) => ({ ticketId: v.ticketId, cantidad: cantidadesEntrega[v.ticketId] ?? 0 }))
      .filter((e) => e.cantidad > 0);
    void procesarEvento(tokenSeleccion, entregas);
  };

  const cfgEstadoLegajo = resultadoLegajo
    ? ESTADO_FICHA_CONFIG[resultadoLegajo.estado] || ESTADO_FICHA_CONFIG.BORRADOR
    : null;

  return (
    <Drawer
      abierto={abierto}
      onCerrar={() => {
        if (subVistaCobro && !guardandoCobro) {
          setSubVistaCobro(null);
          return;
        }
        cerrarQr();
      }}
      titulo="Escáner QR universal"
      subtitulo={
        subVistaCobro
          ? 'Definir cobro pendiente en puerta'
          : tieneAmbos
            ? 'Validación física de legajos y canje de vales'
            : puedeLegajo
              ? 'Recepción física de fichas médicas'
              : 'Canje y cobro de vales en puerta'
      }
      mode="sheet"
      maxWidthClass="sm:max-w-lg"
      bloqueado={validando || guardandoCobro}
      footer={
        subVistaCobro ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={guardandoCobro}
              onClick={() => {
                setSubVistaCobro(null);
                if (continuo) programarResetScan();
              }}
            >
              Volver
            </Button>
            <Button
              type="submit"
              form="qr-cobro-puerta-form"
              variant={estaAbonado ? 'primary' : 'secondary'}
              size="md"
              loading={guardandoCobro}
              disabled={guardandoCobro}
            >
              {estaAbonado
                ? `Confirmar Cobro (${formatearMoneda(subVistaCobro.monto)})`
                : 'Mantener pendiente'}
            </Button>
          </>
        ) : (
          <div className="w-full flex items-center justify-between gap-2 flex-wrap">
            <label className="inline-flex items-center gap-2 text-[13px] font-bold text-ink-2 cursor-pointer select-none min-h-[40px]">
              <input
                type="checkbox"
                checked={continuo}
                onChange={(e) => {
                  const next = e.target.checked;
                  setContinuo(next);
                  scanInProgressRef.current = false;
                  limpiarCooldown();
                }}
                className="w-4 h-4 rounded accent-[var(--color-brand)] cursor-pointer"
              />
              <Repeat className="w-4 h-4 text-brand shrink-0" />
              <span>Modo puerta continuo</span>
            </label>

            <Button type="button" variant="secondary" size="md" onClick={cerrarQr}>
              Cerrar
            </Button>
          </div>
        )
      }
    >
      {/* Mantenemos el lector montado mientras el Drawer esté abierto para evitar crashes de html5-qrcode */}
      <div className={camaraVisible ? 'space-y-3' : 'hidden'}>
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square w-full max-w-[380px] mx-auto flex items-center justify-center border border-rule">
          <div id="qr-universal-reader" className="w-full h-full" />

          {iniciandoCamara && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-[13px] font-bold">Encendiendo cámara…</span>
            </div>
          )}

          {!iniciandoCamara && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-[80%] h-[80%] border-2 border-dashed border-white/60 rounded-2xl">
                <div className="s-qr-laser" />
              </div>
            </div>
          )}
        </div>

        {continuo && (
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-ink-muted">
            <Volume2 className="w-4 h-4 text-brand" />
            <span>Lectura continua activa · Pausa 2,5 s entre lecturas</span>
          </div>
        )}
      </div>

      {subVistaCobro ? (
        <div className="space-y-4">
          <button
            type="button"
            disabled={guardandoCobro}
            onClick={() => setSubVistaCobro(null)}
            className="s-btn-sec min-h-[38px] px-3.5 py-2 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al vale escaneado</span>
          </button>

          <div className="s-badge-warn rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  Total pendiente de cobro
                </div>
                <div className="text-2xl sm:text-[1.75rem] font-extrabold s-tabular">
                  {formatearMoneda(subVistaCobro.monto)}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-surface border border-rule text-ink">
                <Clock className="w-3.5 h-3.5" />
                <span>Pendiente</span>
              </span>
            </div>

            <div className="pt-2 border-t border-rule/40 space-y-1 text-[13px]">
              <div className="flex items-center gap-1.5 font-semibold">
                <User className="w-4 h-4 shrink-0" />
                <span>Comprador: {subVistaCobro.comprador}</span>
              </div>
              {subVistaCobro.producto && (
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>
                    Entrega:{' '}
                    <strong>
                      {subVistaCobro.cantidad ? `${subVistaCobro.cantidad}x ` : ''}
                      {subVistaCobro.producto}
                    </strong>
                  </span>
                </div>
              )}
              {subVistaCobro.evento && (
                <div className="text-xs opacity-85">
                  {subVistaCobro.evento}
                  {subVistaCobro.vendedor ? ` · Vendido por: ${subVistaCobro.vendedor}` : ''}
                </div>
              )}
            </div>
          </div>

          <form id="qr-cobro-puerta-form" onSubmit={handleConfirmarCobroPuerta} className="space-y-3.5">
            <div>
              <div className="text-[13px] font-extrabold text-ink mb-2">
                ¿El comprador abona el pedido en este momento?
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setEstaAbonado(true)}
                  className={`p-3 rounded-xl border text-left space-y-1 cursor-pointer transition-colors ${
                    estaAbonado ? 's-badge-ok' : 's-panel text-ink-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[13px] font-extrabold">
                    <span>Sí, abona ahora</span>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  </div>
                  <div className="text-xs opacity-85">Registrar ingreso y marcar pagado</div>
                </button>

                <button
                  type="button"
                  onClick={() => setEstaAbonado(false)}
                  className={`p-3 rounded-xl border text-left space-y-1 cursor-pointer transition-colors ${
                    !estaAbonado ? 's-badge-warn' : 's-panel text-ink-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[13px] font-extrabold">
                    <span>No abonado</span>
                    <Clock className="w-4 h-4 shrink-0" />
                  </div>
                  <div className="text-xs opacity-85">Dejar pendiente para luego</div>
                </button>
              </div>
            </div>

            {estaAbonado ? (
              <div className="s-panel rounded-2xl p-4 space-y-3">
                <div>
                  <div className="text-[13px] font-bold text-ink mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-brand" />
                    <span>Método de pago</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'EFECTIVO', label: 'Efectivo', icon: <Banknote className="w-4 h-4" /> },
                        {
                          id: 'TRANSFERENCIA',
                          label: 'Transfer.',
                          icon: <Landmark className="w-4 h-4" />,
                        },
                        { id: 'OTRO', label: 'Otro', icon: <CreditCard className="w-4 h-4" /> },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMetodoPago(m.id);
                          seleccionarCuentaPorMetodo(cuentas, m.id);
                        }}
                        className={`min-h-[42px] px-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                          metodoPago === m.id ? 's-btn-brand' : 's-btn-sec'
                        }`}
                      >
                        {m.icon}
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {caps.canCreateGlobalEventos && (
                  <div>
                    <label htmlFor="qr-cuenta-destino" className="block text-[13px] font-bold text-ink mb-1.5">
                      Cuenta de destino
                    </label>
                    {cargandoCuentas ? (
                      <div className="text-[13px] text-ink-muted flex items-center gap-1.5 py-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Cargando cuentas…</span>
                      </div>
                    ) : cuentas.length > 0 ? (
                      <select
                        id="qr-cuenta-destino"
                        value={cuentaId}
                        onChange={(e) => setCuentaId(e.target.value)}
                        className="s-input w-full min-h-[44px] px-3 py-2 rounded-xl text-sm"
                        required
                      >
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {c.tipo ? `(${c.tipo.replace('_', ' ')})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-ink-muted">
                        Sin cuentas activas: se asentará sin cuenta asociada.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="qr-cobro-obs" className="block text-[13px] font-bold text-ink mb-1.5">
                    Nota o comprobante (opcional)
                  </label>
                  <input
                    id="qr-cobro-obs"
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej: Cobrado en puerta"
                    maxLength={200}
                    className="s-input w-full min-h-[44px] px-3 py-2 rounded-xl text-base sm:text-[15px]"
                  />
                </div>
              </div>
            ) : (
              <div className="s-panel rounded-2xl p-3.5 text-[13px] text-ink-muted leading-relaxed">
                El vale ya quedó marcado como retirado, pero el importe de{' '}
                <strong className="text-ink">{formatearMoneda(subVistaCobro.monto)}</strong> seguirá pendiente de cobro.
              </div>
            )}

            {errorCobro && (
              <div role="alert" className="s-badge-err rounded-xl p-3 text-[13px] font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorCobro}</span>
              </div>
            )}
          </form>
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Selector de alcance (si tiene permisos de Legajos y Eventos) */}
          {tieneAmbos && (
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-xl s-panel">
              {(
                [
                  { id: 'auto', label: 'Auto-detectar', icon: <QrCode className="w-4 h-4" /> },
                  { id: 'legajo', label: 'Legajo', icon: <FileText className="w-4 h-4" /> },
                  { id: 'evento', label: 'Evento', icon: <Ticket className="w-4 h-4" /> },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setScope(item.id);
                    setError(null);
                  }}
                  className={`min-h-[40px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    scope === item.id ? 's-btn-brand' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Selector Cámara vs Manual */}
          {(!resultadoLegajo && !resultadoEvento) || continuo ? (
            <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl s-panel">
              <button
                aria-pressed={modo === 'camara'}
                type="button"
                onClick={() => {
                  setModo('camara');
                  setError(null);
                }}
                className={`min-h-[42px] rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  modo === 'camara' ? 's-btn-brand' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Cámara QR</span>
              </button>
              <button
                aria-pressed={modo === 'manual'}
                type="button"
                onClick={() => {
                  setModo('manual');
                  setError(null);
                }}
                className={`min-h-[42px] rounded-lg text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  modo === 'manual' ? 's-btn-brand' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                <span>Código / DNI</span>
              </button>
            </div>
          ) : null}

          {errorCamara && modo === 'manual' && (
            <div className="s-badge-warn rounded-xl p-3 text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorCamara}</span>
            </div>
          )}

          {/* Formulario manual */}
          {modo === 'manual' && (continuo || (!resultadoLegajo && !resultadoEvento)) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void procesarCodigo(codigoManual);
              }}
              className="s-panel rounded-2xl p-4 space-y-3"
            >
              <label htmlFor="qr-codigo-manual" className="block text-[13px] font-bold text-ink">
                {scope === 'legajo'
                  ? 'DNI o hash al pie de la ficha impresa'
                  : scope === 'evento'
                    ? 'Código UUID o token del vale'
                    : 'DNI, hash de legajo o token de vale'}
              </label>
              <input
                id="qr-codigo-manual"
                type="text"
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value)}
                placeholder={
                  scope === 'evento'
                    ? 'Pegá el token del vale…'
                    : 'Ej: 45123456 o código al pie…'
                }
                autoFocus
                className="s-input w-full min-h-[46px] px-3.5 py-2.5 rounded-xl text-base sm:text-[15px] font-mono"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={cargando}
                disabled={cargando || !codigoManual.trim()}
                className="w-full"
              >
                {cargando ? 'Verificando…' : 'Verificar código'}
              </Button>
            </form>
          )}

          {cargando && modo === 'camara' && (
            <div className="flex items-center justify-center gap-2 py-2 text-[13px] font-bold text-brand">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Consultando código…</span>
            </div>
          )}

          {/* Resultado Legajo (aria-live: el lector anuncia el resultado del escaneo) */}
          {resultadoLegajo && (
            <div className="s-card rounded-2xl p-4 space-y-3" role="status" aria-live="polite">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-ink text-[15px] truncate">
                      {resultadoLegajo.usuario?.apellido}, {resultadoLegajo.usuario?.nombre}
                    </h4>
                    <p className="text-[13px] text-ink-muted truncate">
                      DNI {resultadoLegajo.usuario?.dni} ·{' '}
                      {obtenerRolPrincipal(resultadoLegajo.usuario)?.unidad?.nombre || 'Sin Sección'}
                    </p>
                  </div>
                </div>
                {cfgEstadoLegajo && (
                  <span
                    className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold border ${cfgEstadoLegajo.badgeClass}`}
                  >
                    {cfgEstadoLegajo.shortLabel}
                  </span>
                )}
              </div>

              {resultadoLegajo.estado === 'VALIDADO_FISICAMENTE' && (
                <div className="s-badge-ok rounded-xl p-3 text-[13px] font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Esta ficha figura recibida y validada físicamente.</span>
                </div>
              )}

              {resultadoLegajo.estado === 'DESACTUALIZADO_REQUIERE_REIMPRESION' && (
                <div className="s-badge-err rounded-xl p-3 text-[13px] font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Se editaron datos después de imprimir. Pedir la copia nueva.</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleReintentar}
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                  className="flex-1"
                >
                  Otro QR
                </Button>

                {resultadoLegajo.estado !== 'VALIDADO_FISICAMENTE' &&
                  resultadoLegajo.estado !== 'DESACTUALIZADO_REQUIERE_REIMPRESION' &&
                  resultadoLegajo.usuario?.id !== usuarioActual?.id && (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      loading={validando}
                      disabled={validando}
                      onClick={() => void handleValidarLegajoFisico()}
                      leftIcon={<CheckCircle2 className="w-4 h-4" />}
                      className="flex-1"
                    >
                      Confirmar recibido
                    </Button>
                  )}
              </div>
            </div>
          )}

          {/* Retiro parcial: elegir productos y unidades a entregar */}
          {enSeleccion && resultadoEvento && (
            <div role="group" aria-label="Elegir qué se entrega" className="rounded-2xl p-4 space-y-3 border border-rule bg-surface">
              <div className="flex items-start gap-2.5">
                <PackageCheck className="w-5 h-5 shrink-0 mt-0.5 text-brand" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-[15px] font-extrabold text-ink">{resultadoEvento.mensaje}</h4>
                  {resultadoEvento.ticket && (
                    <p className="text-[13px] text-ink-2">
                      Comprador: <strong>{resultadoEvento.ticket.comprador}</strong>
                    </p>
                  )}
                </div>
              </div>

              {(resultadoEvento.alertaPagoPendiente ||
                resultadoEvento.ticket?.pedidoEstado === 'PENDIENTE') && (
                <p className="s-badge-warn rounded-xl p-2.5 text-[13px] font-bold">
                  Pago PENDIENTE (
                  {formatearMoneda(
                    resultadoEvento.montoPendiente || resultadoEvento.ticket?.pedidoTotal || 0,
                  )}
                  )
                </p>
              )}

              <ul className="space-y-2">
                {valesSeleccion.map((v) => {
                  const elegido = cantidadesEntrega[v.ticketId] ?? 0;
                  return (
                    <li
                      key={v.ticketId}
                      className={`flex items-center justify-between gap-3 rounded-xl border border-rule p-2.5 ${
                        v.pendiente === 0 ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-bold text-ink ${v.pendiente === 0 ? 'line-through' : ''}`}>
                          {v.cantidad}x {v.producto}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {v.pendiente === 0
                            ? 'Ya retirado'
                            : v.retirada > 0
                              ? `Ya retiró ${v.retirada} · quedan ${v.pendiente}`
                              : `Quedan ${v.pendiente}`}
                        </div>
                      </div>
                      {v.pendiente > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => ajustarCantidadEntrega(v, -1)}
                            disabled={elegido === 0 || cargando}
                            aria-label={`Entregar una unidad menos de ${v.producto}`}
                            className="s-btn-sec min-w-[40px] min-h-[40px] rounded-xl inline-flex items-center justify-center disabled:opacity-40 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-7 text-center text-base font-black text-ink" aria-live="polite">
                            {elegido}
                          </span>
                          <button
                            type="button"
                            onClick={() => ajustarCantidadEntrega(v, 1)}
                            disabled={elegido >= v.pendiente || cargando}
                            aria-label={`Entregar una unidad más de ${v.producto}`}
                            className="s-btn-sec min-w-[40px] min-h-[40px] rounded-xl inline-flex items-center justify-center disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={confirmarEntrega}
                  loading={cargando}
                  disabled={cargando || unidadesAEntregar === 0}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  {unidadesAEntregar === 1 ? 'Entregar 1 unidad' : `Entregar ${unidadesAEntregar} unidades`}
                </Button>
                <Button type="button" variant="secondary" size="md" onClick={handleReintentar} disabled={cargando}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Resultado Ticket Evento */}
          {resultadoEvento && !enSeleccion && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-2xl p-4 space-y-3 border ${
                resultadoEvento.ok
                  ? 's-badge-ok'
                  : resultadoEvento.estado === 'YA_UTILIZADO'
                    ? 's-badge-warn'
                    : 's-badge-err'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {resultadoEvento.ok ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                ) : resultadoEvento.estado === 'YA_UTILIZADO' ? (
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <h4 className="text-[15px] font-extrabold">{resultadoEvento.mensaje}</h4>

                  {resultadoEvento.ok &&
                    (resultadoEvento.alertaPagoPendiente ||
                      resultadoEvento.ticket?.pedidoEstado === 'PENDIENTE') && (
                      <div className="s-badge-warn rounded-xl p-3 text-[13px] font-bold flex items-center justify-between gap-2 flex-wrap">
                        <span>
                          Pago PENDIENTE (
                          {formatearMoneda(
                            resultadoEvento.montoPendiente ||
                              resultadoEvento.ticket?.pedidoTotal ||
                              0,
                          )}
                          )
                        </span>
                        {puedeCobrarEventoPuerta && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              const pId =
                                resultadoEvento.pedidoId || resultadoEvento.ticket?.pedidoId;
                              if (!pId) return;
                              void abrirSubVistaCobro({
                                pedidoId: pId,
                                monto:
                                  resultadoEvento.montoPendiente ||
                                  resultadoEvento.ticket?.pedidoTotal ||
                                  0,
                                comprador: resultadoEvento.ticket?.comprador || 'Comprador',
                                producto: resultadoEvento.ticket?.detalle ?? resultadoEvento.ticket?.producto,
                                cantidad: resultadoEvento.ticket?.detalle
                                  ? undefined
                                  : resultadoEvento.ticket?.cantidad,
                                evento: resultadoEvento.ticket?.evento,
                                vendedor: resultadoEvento.ticket?.vendedor,
                              });
                            }}
                          >
                            Cobrar en puerta
                          </Button>
                        )}
                      </div>
                    )}

                  {resultadoEvento.ticket && (
                    <div className="pt-2 border-t border-rule/40 space-y-1 text-[13px] text-ink">
                      <div className="flex items-center gap-1.5 font-extrabold">
                        <ShoppingBag className="w-4 h-4 text-brand shrink-0" />
                        <span>
                          {resultadoEvento.ticket.detalle ??
                            `${resultadoEvento.ticket.cantidad}x ${resultadoEvento.ticket.producto}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-2">
                        <User className="w-4 h-4 shrink-0" />
                        <span>
                          Comprador: <strong>{resultadoEvento.ticket.comprador}</strong>
                        </span>
                      </div>
                      {resultadoEvento.ticket.vendedor && (
                        <div className="flex items-center gap-1.5 text-ink-2">
                          <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
                          <span>
                            Vendido por: <strong>{resultadoEvento.ticket.vendedor}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!continuo && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleReintentar}
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                  className="w-full"
                >
                  Escanear otro código
                </Button>
              )}
            </div>
          )}

          {exito && (
            <div role="status" className="s-badge-ok rounded-xl p-3 text-[13px] font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{exito}</span>
            </div>
          )}

          {error && (
            <div role="alert" className="s-badge-err rounded-xl p-3 text-[13px] font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};
