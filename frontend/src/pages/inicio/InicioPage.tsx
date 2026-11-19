import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  FileText,
  HeartPulse,
  Phone,
  QrCode,
  Repeat,
  Shield,
  Sparkles,
  Ticket,
  TrendingUp,
  User,
  Users,
  Wallet,
  WifiOff,
  DownloadCloud,
  UploadCloud,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useOfflineStore } from '../../store/offlineStore';
import { useToastStore } from '../../store/toastStore';
import {
  useCapabilities,
  useActiveUnitStore,
  obtenerNombreUnidadActiva,
} from '../../core/capabilities';
import { useQrModalStore } from '../../core/qrModalStore';
import {
  listarBorradoresLegajoLocales,
  obtenerUltimoSyncCampamento,
  sincronizarBorradoresLegajoLocales,
  sincronizarParaCampamento,
  type CampamentoSyncResumen,
} from '../../core/offline/campamentoSync';
import {
  ESTADO_FICHA_CONFIG,
  esErrorOffline,
  formatearMoneda,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
  type OpcionTelefonoContacto,
} from '../../lib/formatters';
import { extraerInfoMedicaMiembro } from '../../lib/alertasMedicas';
import { obtenerConfigRama } from '../../lib/ramaColors';
import { BotonLlamarMiembro } from '../../components/BotonLlamarMiembro';
import { Drawer, KpiCard } from '../../components/ui';

interface ResumenBalance {
  resumen?: {
    totalIngresos?: number;
    totalEgresos?: number;
    resultadoNeto?: number;
    margenOperativoPorcentaje?: number;
  };
  disponibilidadActual?: {
    totalCaja?: number;
    totalBanco?: number;
    totalDisponible?: number;
  };
}

const calcularDeudaMiembro = (m: any): number =>
  Math.round(
    (m?.cargos || []).reduce(
      (acc: number, c: any) =>
        c.estado === 'ANULADO'
          ? acc
          : acc + Math.max(0, Number(c.montoFinal || 0) - Number(c.montoPagado || 0)),
      0,
    ) * 100,
  ) / 100;

const formatearSyncFecha = (timestamp: number): string => {
  const fecha = new Date(timestamp);
  const ahora = new Date();
  const mismoDia =
    fecha.getDate() === ahora.getDate() &&
    fecha.getMonth() === ahora.getMonth() &&
    fecha.getFullYear() === ahora.getFullYear();
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (mismoDia) return `Hoy ${hora} hs`;
  return `${fecha.toLocaleDateString('es-AR')} ${hora} hs`;
};

export const InicioPage: React.FC = () => {
  const usuario = useAuthStore((s) => s.usuario);
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const lastValidationAt = useQrModalStore((s) => s.lastValidationAt);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const ciclo = obtenerCicloAnioActual();

  // Estado personal
  const [miEstadoCuenta, setMiEstadoCuenta] = useState<any | null>(null);
  const [miUltimaEntrega, setMiUltimaEntrega] = useState<any | null>(null);
  const [cargandoPersonal, setCargandoPersonal] = useState(true);

  // Estado operativo de gestión
  const [miembros, setMiembros] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [candidatosPase, setCandidatosPase] = useState<any[]>([]);
  const [solicitudesPase, setSolicitudesPase] = useState<any[]>([]);
  const [unidadesOrg, setUnidadesOrg] = useState<any[]>([]);
  const [balanceData, setBalanceData] = useState<ResumenBalance | null>(null);
  const [cargandoGestion, setCargandoGestion] = useState(false);

  // Campamento offline sync
  const [ultimoSync, setUltimoSync] = useState<CampamentoSyncResumen | null>(() =>
    obtenerUltimoSyncCampamento(usuario?.id),
  );
  const [sincronizando, setSincronizando] = useState(false);
  const [progresoSync, setProgresoSync] = useState<{ mensaje: string; porcentaje: number } | null>(
    null,
  );
  const [borradoresPendientesCount, setBorradoresPendientesCount] = useState(0);
  const [sincronizandoBorradores, setSincronizandoBorradores] = useState(false);

  // Drawer de Alertas Médicas y sub-vista de teléfonos (máximo 1 overlay)
  const [drawerAlertasAbierto, setDrawerAlertasAbierto] = useState(false);
  const [telefonosEmergencia, setTelefonosEmergencia] = useState<{
    miembro: any;
    telefonos: OpcionTelefonoContacto[];
  } | null>(null);

  useEffect(() => {
    setUltimoSync(obtenerUltimoSyncCampamento(usuario?.id));
    if (usuario?.id) {
      void listarBorradoresLegajoLocales(usuario.id).then((lista) =>
        setBorradoresPendientesCount(lista.length),
      );
    } else {
      setBorradoresPendientesCount(0);
    }
  }, [usuario?.id]);

  const cargarDatosInicio = useCallback(
    async (silencioso = false) => {
      if (!usuario?.id) return;
      if (!silencioso) {
        setCargandoPersonal(true);
        if (!caps.esPropio) setCargandoGestion(true);
      }

      try {
        // 1. Estado personal (para todo perfil)
        const [resCuenta, resPlantillasAnio] = await Promise.all([
          api.get(`/tesoreria/estado-cuenta/${usuario.id}`).catch(() => ({ data: null })),
          api.get(`/legajos/plantillas?cicloAnio=${ciclo}`).catch(() => ({ data: [] })),
        ]);

        setMiEstadoCuenta(resCuenta.data);

        let plantillas: any[] = Array.isArray(resPlantillasAnio.data) ? resPlantillasAnio.data : [];
        if (plantillas.length === 0) {
          const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
          plantillas = Array.isArray(resTodas.data) ? resTodas.data : [];
        }

        const plantillaPropia =
          seleccionarPlantillaPorMiembro(plantillas, usuario, asignaciones) || plantillas[0] || null;
        if (plantillaPropia) {
          const cicloPlantilla = plantillaPropia.cicloAnio || ciclo;
          const resPrecarga = await api
            .get(
              `/legajos/miembro/${usuario.id}/plantilla/${plantillaPropia.id}/precarga?cicloAnio=${cicloPlantilla}`,
            )
            .catch(() => ({ data: null }));
          setMiUltimaEntrega(resPrecarga.data?.ultimaEntrega ?? null);
        } else {
          setMiUltimaEntrega(null);
        }
      } catch (err) {
        if (!esErrorOffline(err) && !silencioso) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo actualizar tu estado personal.'), 'error');
        }
      } finally {
        setCargandoPersonal(false);
      }

      // 2. Estado de gestión (solo si no es PROPIO)
      if (caps.esPropio) {
        setCargandoGestion(false);
        return;
      }

      try {
        const cargarMiembrosPaginados = async (): Promise<any[]> => {
          if (!caps.canViewMiembros) return [];
          const porPagina = 200;
          const primera = await api.get(
            `/miembros?pagina=1&porPagina=${porPagina}&incluirInactivos=false`,
          );
          const primerosItems: any[] = Array.isArray(primera.data?.items) ? primera.data.items : [];
          const total = Number(primera.data?.total ?? primerosItems.length);
          const totalPaginas = Math.ceil(total / porPagina);
          if (totalPaginas <= 1) return primerosItems;

          const resto = await Promise.all(
            Array.from({ length: totalPaginas - 1 }, (_, i) =>
              api.get(`/miembros?pagina=${i + 2}&porPagina=${porPagina}&incluirInactivos=false`),
            ),
          );
          const acumulados = [...primerosItems];
          for (const r of resto) {
            if (Array.isArray(r.data?.items)) acumulados.push(...r.data.items);
          }
          return acumulados;
        };

        const [
          listaMiembros,
          resEntregas,
          resCandidatos,
          resSolicitudes,
          resBalance,
          resUnidades,
        ] = await Promise.all([
          cargarMiembrosPaginados().catch(() => []),
          caps.canViewLegajosModule
            ? api.get(`/legajos/entregas?cicloAnio=${ciclo}`).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          caps.canViewPases
            ? api.get('/pases/candidatos').catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          caps.canViewPases
            ? api.get('/pases/solicitudes').catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          caps.canSeeBalance
            ? api.get(`/tesoreria/cuadro-resultados?anio=${ciclo}`).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
          caps.canViewOrganizacion
            ? api.get('/organizacion/unidades').catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);

        setMiembros(listaMiembros);
        setEntregas(Array.isArray(resEntregas.data) ? resEntregas.data : []);
        setCandidatosPase(Array.isArray(resCandidatos.data) ? resCandidatos.data : []);
        setSolicitudesPase(Array.isArray(resSolicitudes.data) ? resSolicitudes.data : []);
        setBalanceData(resBalance.data ?? null);
        setUnidadesOrg(Array.isArray(resUnidades.data) ? resUnidades.data : []);
      } catch (err) {
        if (!esErrorOffline(err) && !silencioso) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo cargar el resumen operativo.'), 'error');
        }
      } finally {
        setCargandoGestion(false);
      }
    },
    [
      usuario,
      asignaciones,
      ciclo,
      caps.esPropio,
      caps.canViewMiembros,
      caps.canViewLegajosModule,
      caps.canViewPases,
      caps.canSeeBalance,
      caps.canViewOrganizacion,
      mostrarToast,
    ],
  );

  useEffect(() => {
    void cargarDatosInicio(false);
  }, [cargarDatosInicio]);

  // Refrescar al volver foco o tras validar desde el escáner QR universal
  useEffect(() => {
    if (lastValidationAt > 0) {
      void cargarDatosInicio(true);
    }
  }, [lastValidationAt, cargarDatosInicio]);

  useEffect(() => {
    const onFocus = () => {
      void cargarDatosInicio(true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [cargarDatosInicio]);

  const activeUnitLabel = useMemo(
    () => obtenerNombreUnidadActiva(activeUnitId, caps, unidadesOrg),
    [activeUnitId, caps, unidadesOrg],
  );

  const miembrosEnFoco = useMemo(() => {
    const activos = miembros.filter((m) => m.activo !== false);
    if (activeUnitId === 'ALL') return activos;
    return activos.filter((m) =>
      (m.asignaciones || []).some(
        (a: any) => a.activo !== false && Number(a.unidadId ?? a.unidad?.id) === activeUnitId,
      ),
    );
  }, [miembros, activeUnitId]);

  const entregasPorUsuario = useMemo(() => {
    const mapa = new Map<number, any>();
    for (const ent of entregas) {
      if (!mapa.has(ent.usuarioId) || ent.estado === 'VALIDADO_FISICAMENTE') {
        mapa.set(ent.usuarioId, ent);
      }
    }
    return mapa;
  }, [entregas]);

  const statsGestion = useMemo(() => {
    let legajosPendientes = 0;
    let miembrosConDeuda = 0;
    let deudaAcumulada = 0;

    for (const m of miembrosEnFoco) {
      const entrega = entregasPorUsuario.get(m.id);
      if (entrega?.estado !== 'VALIDADO_FISICAMENTE') {
        legajosPendientes += 1;
      }
      const deuda = calcularDeudaMiembro(m);
      if (deuda > 0) {
        miembrosConDeuda += 1;
        deudaAcumulada += deuda;
      }
    }

    const candidatosFiltrados = candidatosPase.filter((c) => {
      if (!caps.canExecuteEgreso && (c.requiereAlcanceGlobal || c.tipo === 'EGRESO')) return false;
      if (activeUnitId === 'ALL') return true;
      return Number(c.unidadActual?.id ?? c.unidadId) === activeUnitId;
    });

    const solicitudesPendientes = solicitudesPase.filter((s) => {
      if (s.estado && s.estado !== 'PENDIENTE') return false;
      if (activeUnitId === 'ALL') return true;
      return (
        Number(s.unidadDestinoId ?? s.unidadDestino?.id) === activeUnitId ||
        Number(s.unidadOrigenId ?? s.unidadOrigen?.id) === activeUnitId
      );
    });

    return {
      totalActivos: miembrosEnFoco.length,
      legajosPendientes,
      miembrosConDeuda,
      deudaAcumulada: Math.round(deudaAcumulada * 100) / 100,
      pasesSugeridos: candidatosFiltrados.length,
      solicitudesPendientes: solicitudesPendientes.length,
    };
  }, [miembrosEnFoco, entregasPorUsuario, candidatosPase, solicitudesPase, caps.canExecuteEgreso, activeUnitId]);

  const miembrosConAlertaMedica = useMemo(() => {
    const lista: Array<{
      miembro: any;
      entrega: any;
      info: ReturnType<typeof extraerInfoMedicaMiembro>;
      ramaNombre: string;
    }> = [];

    for (const m of miembrosEnFoco) {
      const entrega = entregasPorUsuario.get(m.id);
      const info = extraerInfoMedicaMiembro(m, entrega);
      if (!info.tieneAlertas) continue;
      const asig = obtenerRolPrincipal(m) ?? m.asignaciones?.[0];
      const cfg = obtenerConfigRama(m, unidadesOrg);
      lista.push({
        miembro: m,
        entrega,
        info,
        ramaNombre: asig?.unidad?.nombre || cfg.nombre,
      });
    }

    return lista.sort((a, b) => {
      if (b.info.criticasCount !== a.info.criticasCount) {
        return b.info.criticasCount - a.info.criticasCount;
      }
      return `${a.miembro.apellido} ${a.miembro.nombre}`.localeCompare(
        `${b.miembro.apellido} ${b.miembro.nombre}`,
        'es',
      );
    });
  }, [miembrosEnFoco, entregasPorUsuario, unidadesOrg]);

  const criticasMedicasTotal = useMemo(
    () => miembrosConAlertaMedica.filter((x) => x.info.criticasCount > 0).length,
    [miembrosConAlertaMedica],
  );

  const miEstadoFichaKey = miUltimaEntrega?.estado || 'SIN_FICHA';
  const miFichaCfg = ESTADO_FICHA_CONFIG[miEstadoFichaKey] || ESTADO_FICHA_CONFIG.SIN_FICHA;
  const miSaldoPendiente = Number(miEstadoCuenta?.resumen?.saldoPendiente || 0);
  const miSaldoAFavor = Number(miEstadoCuenta?.resumen?.saldoAFavor || 0);

  const handleSincronizarCampamento = async () => {
    if (!isOnline) {
      mostrarToast(
        'Necesitás conexión a internet para descargar los datos antes del campamento.',
        'advertencia',
      );
      return;
    }
    if (sincronizando) return;
    setSincronizando(true);
    setProgresoSync({ mensaje: 'Iniciando descarga…', porcentaje: 5 });
    try {
      const resumen = await sincronizarParaCampamento({
        usuarioId: usuario?.id,
        onProgreso: (mensaje, porcentaje) => setProgresoSync({ mensaje, porcentaje }),
      });
      setUltimoSync(resumen);
      mostrarToast(
        `Listo para campamento: ${resumen.totalMiembros} miembros y ${resumen.totalEntregas} fichas guardadas en este dispositivo.`,
        'exito',
      );
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudieron descargar los datos para campamento.'), 'error');
    } finally {
      setSincronizando(false);
    }
  };

  const handleSincronizarBorradores = async () => {
    if (!isOnline) {
      mostrarToast('Necesitás conexión a internet para sincronizar tus borradores.', 'advertencia');
      return;
    }
    if (sincronizandoBorradores) return;
    setSincronizandoBorradores(true);
    try {
      const { sincronizados, fallidos } = await sincronizarBorradoresLegajoLocales(usuario?.id);
      const restantes = await listarBorradoresLegajoLocales(usuario?.id);
      setBorradoresPendientesCount(restantes.length);
      if (sincronizados > 0 && fallidos === 0) {
        mostrarToast(
          `${sincronizados} borrador(es) de legajo guardado(s).`,
          'exito',
        );
        void cargarDatosInicio(true);
      } else if (fallidos > 0) {
        mostrarToast(
          `Se sincronizaron ${sincronizados} borrador(es), pero ${fallidos} quedaron pendientes.`,
          'advertencia',
        );
      }
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudieron sincronizar los borradores.'), 'error');
    } finally {
      setSincronizandoBorradores(false);
    }
  };

  const accesosRapidos = [
    {
      to: '/mi-espacio',
      title: 'Mi Espacio Personal',
      desc: 'Mi legajo anual, cuotas, vales QR y perfil.',
      icon: <User className="w-5 h-5 text-brand" />,
      show: true,
    },
    {
      to: '/miembros',
      title: 'Padrón de Miembros',
      desc: 'Listado operativo, filtros, ficha y altas.',
      icon: <Users className="w-5 h-5 text-brand" />,
      show: caps.canViewMiembros,
    },
    {
      to: '/legajos',
      title: 'Legajos y Plantillas',
      desc: 'Cumplimiento del ciclo, adultos colaboradores y PDFs.',
      icon: <FileText className="w-5 h-5 text-brand" />,
      show: caps.canViewLegajosModule,
    },
    {
      to: '/pases',
      title: 'Progresiones y Pases',
      desc: 'Pases por camada y bandeja de solicitudes.',
      icon: <Repeat className="w-5 h-5 text-brand" />,
      show: caps.canViewPases,
    },
    {
      to: '/eventos',
      title: 'Eventos y Vales QR',
      desc: 'Campañas del grupo, ventas y control en puerta.',
      icon: <Ticket className="w-5 h-5 text-brand" />,
      show: caps.canViewEventos,
    },
    {
      to: '/tesoreria',
      title: 'Tesorería y Cobranzas',
      desc: 'Cobros familiares, planes, caja y balance.',
      icon: <Wallet className="w-5 h-5 text-brand" />,
      show: caps.canSeeTesoreriaGestion,
    },
    {
      to: '/organizacion',
      title: 'Organización y Roles',
      desc: 'Ramas, unidades, roles y correo institucional.',
      icon: <Shield className="w-5 h-5 text-brand" />,
      show: caps.canViewOrganizacion,
    },
  ].filter((a) => a.show);

  return (
    <div className="s-anim-view space-y-6">
      {/* Barra compacta superior "Mi Estado Personal" para perfiles con gestión */}
      {!caps.esPropio && (
        <div className="s-panel rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <span className="text-xs font-extrabold uppercase tracking-wider text-ink-muted shrink-0">
              Mi Estado Personal:
            </span>
            {cargandoPersonal ? (
              <span className="text-sm text-ink-muted">Consultando…</span>
            ) : (
              <>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 ${miFichaCfg.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${miFichaCfg.dotClass}`} />
                  <span>Legajo {ciclo}: {miFichaCfg.shortLabel}</span>
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                    miSaldoPendiente > 0 ? 's-badge-err' : 's-badge-ok'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {miSaldoPendiente > 0
                      ? `Deuda: ${formatearMoneda(miSaldoPendiente)}`
                      : 'Cuotas al día'}
                  </span>
                </span>

                {miSaldoAFavor > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-brand whitespace-nowrap shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>A favor: {formatearMoneda(miSaldoAFavor)}</span>
                  </span>
                )}
              </>
            )}
          </div>

          <Link
            to="/mi-espacio"
            className="text-sm font-extrabold text-brand hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <span>Mi Espacio</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Cabecera Principal */}
      <section className="s-card rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand whitespace-nowrap shrink-0">
              <Compass className="w-4 h-4" />
              <span>Ciclo Operativo {ciclo}</span>
            </span>
            {!caps.esPropio && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-info whitespace-nowrap shrink-0">
                {activeUnitLabel}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-[1.75rem] font-extrabold text-ink tracking-tight truncate">
            Hola, {usuario?.nombre} {usuario?.apellido}
          </h1>

          <p className="text-sm sm:text-[15px] text-ink-muted truncate">{caps.rolPrincipalLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {caps.canUseQrScanner && (
            <button
              type="button"
              onClick={() => useQrModalStore.getState().abrirQr('auto')}
              className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <QrCode className="w-[18px] h-[18px] text-brand" />
              <span>Escanear QR</span>
            </button>
          )}

          {!caps.esPropio && caps.canViewMiembros && (
            <button
              type="button"
              onClick={handleSincronizarCampamento}
              disabled={sincronizando}
              className="s-btn-brand s-touch px-4.5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {sincronizando ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : !isOnline ? (
                <WifiOff className="w-[18px] h-[18px]" />
              ) : (
                <DownloadCloud className="w-[18px] h-[18px]" />
              )}
              <span>{sincronizando ? 'Sincronizando…' : 'Preparar para Campamento'}</span>
            </button>
          )}

          {caps.esPropio && (
            <Link
              to="/mi-espacio"
              className="s-btn-brand s-touch px-5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2"
            >
              <span>Ir a Mi Espacio</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </section>

      {/* Progreso o estado de sincronización offline */}
      {!caps.esPropio && (progresoSync || ultimoSync) && (
        <div className="s-panel rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <DownloadCloud className="w-4 h-4 text-brand shrink-0" />
            {sincronizando && progresoSync ? (
              <span className="font-bold text-ink truncate">
                {progresoSync.mensaje} ({progresoSync.porcentaje}%)
              </span>
            ) : ultimoSync ? (
              <span className="text-ink-muted truncate">
                <strong className="text-ink">Datos de campamento listos:</strong>{' '}
                {ultimoSync.totalMiembros} miembros y {ultimoSync.totalEntregas} fichas guardadas (
                {formatearSyncFecha(ultimoSync.sincronizadoEn)}).
              </span>
            ) : null}
          </div>

          {sincronizando && progresoSync && (
            <div className="w-full sm:w-44 h-2 rounded-full bg-paper-3 overflow-hidden shrink-0">
              <div
                className="s-progress-bar h-full bg-brand rounded-full"
                style={{ width: `${Math.min(100, Math.max(5, progresoSync.porcentaje))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Borradores locales de legajo pendientes de sincronizar */}
      {borradoresPendientesCount > 0 && (
        <div className="s-badge-warn rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span className="truncate">
              <strong>
                {borradoresPendientesCount}{' '}
                {borradoresPendientesCount === 1
                  ? 'ficha guardada sin conexión'
                  : 'fichas guardadas sin conexión'}
              </strong>{' '}
              (pendiente de enviar).
            </span>
          </div>
          {isOnline && (
            <button
              type="button"
              onClick={handleSincronizarBorradores}
              disabled={sincronizandoBorradores}
              className="s-btn-brand min-h-[38px] px-3.5 py-1.5 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
            >
              {sincronizandoBorradores ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>{sincronizandoBorradores ? 'Sincronizando…' : 'Sincronizar ahora'}</span>
            </button>
          )}
        </div>
      )}

      {/* Checklist personal destacado para perfiles PROPIO */}
      {caps.esPropio && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted px-0.5">
            Mi Checklist del Ciclo {ciclo}
          </h2>

          <div className="s-stagger grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. Legajo anual */}
            <Link
              to="/mi-espacio?tab=legajo"
              className="s-card s-card-hover rounded-2xl p-5 flex flex-col justify-between gap-3.5 min-w-0"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-brand" />
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 ${miFichaCfg.badgeClass}`}
                  >
                    {miFichaCfg.shortLabel}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">1. Mi Legajo Anual</h3>
                  <p className="text-sm text-ink-muted mt-1 leading-snug">
                    {miEstadoFichaKey === 'VALIDADO_FISICAMENTE'
                      ? 'Tu ficha física fue recibida y validada para este ciclo.'
                      : miEstadoFichaKey === 'PENDIENTE_FIRMA_FISICA'
                        ? 'Ya completaste la carga digital. Descargá el PDF, firmalo y entregalo a tu educador.'
                        : 'Completá tu ficha médica y autorizaciones del año para acampar.'}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-brand inline-flex items-center gap-1.5">
                <span>
                  {miEstadoFichaKey === 'VALIDADO_FISICAMENTE' ? 'Ver ficha PDF' : 'Completar ahora'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>

            {/* 2. Estado de cuotas */}
            <Link
              to="/mi-espacio?tab=cuotas"
              className="s-card s-card-hover rounded-2xl p-5 flex flex-col justify-between gap-3.5 min-w-0"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-brand" />
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                      miSaldoPendiente > 0 ? 's-badge-err' : 's-badge-ok'
                    }`}
                  >
                    {miSaldoPendiente > 0 ? 'Con deuda' : 'Al día'}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">2. Mis Cuotas y Recibos</h3>
                  <p className="text-sm text-ink-muted mt-1 leading-snug">
                    {miSaldoPendiente > 0
                      ? `Saldo pendiente actual: ${formatearMoneda(miSaldoPendiente)}.`
                      : 'No registrás cuotas pendientes.'}
                    {miSaldoAFavor > 0
                      ? ` Tenés ${formatearMoneda(miSaldoAFavor)} a favor.`
                      : ''}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-brand inline-flex items-center gap-1.5">
                <span>Ver estado de cuenta</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>

            {/* 3. Eventos y Vales */}
            <Link
              to="/mi-espacio?tab=pedidos"
              className="s-card s-card-hover rounded-2xl p-5 flex flex-col justify-between gap-3.5 min-w-0"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                    <Ticket className="w-5 h-5 text-brand" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-brand whitespace-nowrap shrink-0">
                    Vales QR
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">3. Mis Eventos y Vales</h3>
                  <p className="text-sm text-ink-muted mt-1 leading-snug">
                    Consultá campañas habilitadas, cargá pedidos para sumar a tu saldo y descargá tus QR.
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-brand inline-flex items-center gap-1.5">
                <span>Abrir eventos y vales</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </section>
      )}

      {/* Tarjetas de acción directa en campo (para perfiles con alcance UNIDAD o GLOBAL) */}
      {!caps.esPropio && caps.canViewMiembros && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted">
              Resumen actual ({statsGestion.totalActivos} activos)
            </h2>
            {cargandoGestion && (
              <span className="text-xs font-semibold text-ink-muted inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Actualizando…
              </span>
            )}
          </div>

          <div className="s-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {caps.canViewLegajosModule && (
              <Link
                to="/miembros?filtro=FALTA_FICHA"
                className="s-card s-card-hover rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2.5 min-w-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-muted truncate">
                    Legajos Pendientes
                  </span>
                  <Clock className="w-[18px] h-[18px] text-amber-500 shrink-0" />
                </div>
                <div className="text-2xl sm:text-[1.75rem] font-extrabold s-tabular text-ink">
                  {statsGestion.legajosPendientes}
                </div>
                <div className="text-xs sm:text-[13px] text-ink-muted flex items-center justify-between gap-2">
                  <span className="truncate">Sin validación física {ciclo}</span>
                  <span className="font-bold text-brand shrink-0">Revisar →</span>
                </div>
              </Link>
            )}

            {caps.canViewCuotas && (
              <Link
                to="/miembros?filtro=CON_DEUDA"
                className="s-card s-card-hover rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2.5 min-w-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-muted truncate">
                    Cuotas con Deuda
                  </span>
                  <CreditCard className="w-[18px] h-[18px] text-rose-500 shrink-0" />
                </div>
                <div className="text-2xl sm:text-[1.75rem] font-extrabold s-tabular text-ink">
                  {statsGestion.miembrosConDeuda}
                </div>
                <div className="text-xs sm:text-[13px] text-ink-muted flex items-center justify-between gap-2">
                  <span className="truncate">
                    Total: {formatearMoneda(statsGestion.deudaAcumulada)}
                  </span>
                  <span className="font-bold text-brand shrink-0">Cobrar →</span>
                </div>
              </Link>
            )}

            {caps.canViewPases && (
              <Link
                to={
                  statsGestion.solicitudesPendientes > 0
                    ? '/pases'
                    : '/miembros?filtro=PASE_SUGERIDO'
                }
                className="s-card s-card-hover rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2.5 min-w-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-muted truncate">
                    Pases Sugeridos
                  </span>
                  <Repeat className="w-[18px] h-[18px] text-brand shrink-0" />
                </div>
                <div className="text-2xl sm:text-[1.75rem] font-extrabold s-tabular text-ink">
                  {statsGestion.pasesSugeridos}
                </div>
                <div className="text-xs sm:text-[13px] text-ink-muted flex items-center justify-between gap-2">
                  <span className="truncate">
                    {statsGestion.solicitudesPendientes > 0
                      ? `${statsGestion.solicitudesPendientes} solicitud(es) pendiente(s)`
                      : 'Cálculo por camadas'}
                  </span>
                  <span className="font-bold text-brand shrink-0">Gestionar →</span>
                </div>
              </Link>
            )}

            {/* Tarjeta interactiva de Alertas Médicas */}
            <button
              type="button"
              onClick={() => {
                setTelefonosEmergencia(null);
                setDrawerAlertasAbierto(true);
              }}
              className="s-card s-card-hover rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2.5 text-left min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted truncate">
                  Alertas Médicas
                </span>
                <HeartPulse className="w-[18px] h-[18px] text-rose-500 shrink-0" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-[1.75rem] font-extrabold s-tabular text-ink">
                  {miembrosConAlertaMedica.length}
                </span>
                {criticasMedicasTotal > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-err whitespace-nowrap shrink-0">
                    {criticasMedicasTotal} crítica{criticasMedicasTotal === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-[13px] text-ink-muted flex items-center justify-between gap-2 w-full">
                <span className="truncate">Alergias, medicación y emergencias</span>
                <span className="font-bold text-brand shrink-0">Abrir guía →</span>
              </div>
            </button>
          </div>
        </section>
      )}

      {/* Resumen Ejecutivo Financiero (si tiene alcance y permiso de Balance) */}
      {!caps.esPropio && caps.canSeeBalance && balanceData?.resumen && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-brand" />
              <span>Resumen Ejecutivo Financiero {ciclo}</span>
            </h2>
            {caps.canSeeTesoreriaGestion && (
              <Link
                to="/tesoreria?sub=cuadro-resultados"
                className="text-sm font-bold text-brand hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Ver cuadro completo</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <KpiCard
              label="Ingresos Totales"
              value={formatearMoneda(Number(balanceData.resumen.totalIngresos || 0))}
              tone="ok"
              icon={<TrendingUp className="w-[18px] h-[18px]" />}
              hint={`Ciclo anual ${ciclo}`}
            />
            <KpiCard
              label="Egresos y Gastos"
              value={formatearMoneda(Number(balanceData.resumen.totalEgresos || 0))}
              tone="err"
              icon={<Wallet className="w-[18px] h-[18px]" />}
              hint="Comprobantes vigentes"
            />
            <KpiCard
              label="Resultado Neto"
              value={formatearMoneda(Number(balanceData.resumen.resultadoNeto || 0))}
              tone={Number(balanceData.resumen.resultadoNeto || 0) >= 0 ? 'brand' : 'err'}
              hint={`Margen operativo ${Number(balanceData.resumen.margenOperativoPorcentaje || 0).toFixed(1)}%`}
            />
            <KpiCard
              label="Disponibilidad Actual"
              value={formatearMoneda(Number(balanceData.disponibilidadActual?.totalDisponible || 0))}
              tone="info"
              hint={`Caja: ${formatearMoneda(Number(balanceData.disponibilidadActual?.totalCaja || 0))}`}
            />
          </div>
        </section>
      )}

      {/* Módulos Habilitados */}
      <section className="space-y-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted px-0.5">
          Módulos Habilitados en tu Perfil
        </h2>

        <div className="s-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {accesosRapidos.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="s-card s-card-hover rounded-2xl p-4 sm:p-5 flex items-start gap-4 min-w-0"
            >
              <div className="w-11 h-11 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold text-ink truncate">{item.title}</span>
                  <ArrowRight className="w-4 h-4 text-ink-muted shrink-0" />
                </div>
                <p className="text-sm text-ink-muted leading-snug">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Drawer de Alertas Médicas y Emergencias (máximo 1 overlay, con sub-vista inline de llamada) */}
      <Drawer
        abierto={drawerAlertasAbierto}
        onCerrar={() => {
          setTelefonosEmergencia(null);
          setDrawerAlertasAbierto(false);
        }}
        titulo={
          telefonosEmergencia
            ? `Llamar · ${telefonosEmergencia.miembro.nombre} ${telefonosEmergencia.miembro.apellido}`
            : 'Alertas Médicas y Salud'
        }
        subtitulo={
          telefonosEmergencia
            ? 'Seleccioná un contacto de emergencia para iniciar llamada'
            : `${miembrosConAlertaMedica.length} miembro(s) con alertas registradas · ${activeUnitLabel}`
        }
        mode="sheet"
        maxWidthClass="sm:max-w-xl"
        footer={
          telefonosEmergencia ? (
            <button
              type="button"
              onClick={() => setTelefonosEmergencia(null)}
              className="s-btn-sec s-touch w-full px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al listado médico</span>
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <Link
                to="/miembros?filtro=ALERTA_MEDICA"
                onClick={() => setDrawerAlertasAbierto(false)}
                className="s-btn-brand s-touch px-4 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5"
              >
                <span>Ver en Padrón</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerAlertasAbierto(false)}
                className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )
        }
      >
        {telefonosEmergencia ? (
          <div className="space-y-3">
            {telefonosEmergencia.telefonos.map((tel, idx) => (
              <a
                key={`${tel.etiqueta}-${idx}`}
                href={`tel:${tel.telefono}`}
                className="s-card s-card-hover p-4 rounded-2xl flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-info inline-block">
                    {tel.etiqueta}
                  </span>
                  <div className="text-base font-extrabold text-ink truncate">
                    {tel.nombre ||
                      `${telefonosEmergencia.miembro.nombre} ${telefonosEmergencia.miembro.apellido}`}
                  </div>
                  <div className="text-sm font-mono text-ink-muted">{tel.telefono}</div>
                </div>
                <span className="s-btn-brand px-3.5 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5 shrink-0">
                  <Phone className="w-4 h-4" />
                  <span>Llamar</span>
                </span>
              </a>
            ))}
          </div>
        ) : miembrosConAlertaMedica.length === 0 ? (
          <div className="py-10 text-center space-y-2.5">
            <CheckCircle2 className="w-11 h-11 text-brand mx-auto opacity-80" />
            <p className="text-base font-bold text-ink">Sin alertas médicas declaradas</p>
            <p className="text-sm text-ink-muted max-w-sm mx-auto">
              Ningún miembro activo en {activeUnitLabel} declaró alergias, medicación o condiciones de seguimiento en su ficha.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {miembrosConAlertaMedica.map(({ miembro, entrega, info, ramaNombre }) => (
              <div key={miembro.id} className="s-panel rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-extrabold text-ink truncate">
                        {miembro.apellido}, {miembro.nombre}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-brand whitespace-nowrap shrink-0">
                        {ramaNombre}
                      </span>
                    </div>
                    <div className="text-xs sm:text-[13px] text-ink-muted mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      {info.grupoSanguineo && (
                        <span>
                          Grupo: <strong className="text-ink">{info.grupoSanguineo}</strong>
                        </span>
                      )}
                      {info.obraSocial && (
                        <span>
                          Obra Social: <strong className="text-ink">{info.obraSocial}</strong>
                          {info.afiliadoObraSocial ? ` (Af. ${info.afiliadoObraSocial})` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <BotonLlamarMiembro
                      miembro={miembro}
                      entrega={entrega}
                      onAbrirCustom={(telefonos) =>
                        setTelefonosEmergencia({ miembro, telefonos })
                      }
                      className="s-btn-sec min-h-[40px] px-3 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    />
                    <Link
                      to={`/miembros/${miembro.id}?tab=ficha`}
                      onClick={() => setDrawerAlertasAbierto(false)}
                      className="s-btn-sec min-h-[40px] px-3 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5"
                    >
                      <span>Ficha</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {info.alertas.map((al) => (
                    <span
                      key={al.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        al.critico ? 's-badge-err' : 's-badge-warn'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {al.titulo}
                        {al.detalle && al.detalle !== 'Sí' ? `: ${al.detalle}` : ''}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
};
