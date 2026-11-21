import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  Check,
  CreditCard,
  Landmark,
  Layers,
  Loader2,
  Lock,
  Pencil,
  PlusCircle,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  Tag,
  Tent,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { useActiveUnitStore, useCapabilities } from '../../core/capabilities';
import { useAuthStore } from '../../store/authStore';
import { mostrarToastConDeshacer, useToastStore } from '../../store/toastStore';
import {
  filtrarUnidadesPorAlcance,
  puedeEditarFamiliaPorAlcance,
  puedeModificarPorAlcanceUnidad,
  tienePermisoSobreMiembro,
} from '../../lib/permisos';
import {
  NOMBRES_MESES_CORTOS,
  NOMBRES_MESES_LARGOS,
  esErrorOffline,
  formatearFecha,
  formatearMoneda,
  normalizarTextoBusqueda,
  obtenerRolPrincipal,
  traducirErrorAmigable,
} from '../../lib/formatters';
import { ModalCobrarDeuda } from '../../components/ModalCobrarDeuda';
import { ModalEditarFamilia } from '../../components/ModalEditarFamilia';
import { ModalPlanCuotaMensual } from '../../components/ModalPlanCuotaMensual';
import { ModalCobroCampamento } from '../../components/ModalCobroCampamento';
import { ModalGestionRubros } from '../../components/ModalGestionRubros';
import { PanelTesoreriaCajaBanco } from '../../components/PanelTesoreriaCajaBanco';
import { PanelGastosTesoreria } from '../../components/PanelGastosTesoreria';
import { PanelCuadroResultados } from '../../components/PanelCuadroResultados';
import {
  Button,
  ConfirmImpactDialog,
  Drawer,
  KpiCard,
  SegmentedTabs,
  type SegmentedTabItem,
} from '../../components/ui';

type SubTabTesoreria = 'cobranzas' | 'planes' | 'caja-gastos' | 'balance';

interface ImpactoDialogState {
  titulo: string;
  mensaje: React.ReactNode;
  impacto?: React.ReactNode;
  tipoImpacto?: 'warn' | 'info' | 'danger';
  textoConfirmar: string;
  peligroso?: boolean;
  onConfirmar: () => Promise<void>;
}

export const TesoreriaPage: React.FC = () => {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const esGlobalCobranzas = tienePermisoGlobal(['cobranzas.editar', 'caja.editar']);
  const esGlobalPlanes = tienePermisoGlobal(['planes.editar', 'caja.editar']);
  const esGlobalFamilias = tienePermisoGlobal(['cobranzas.editar', 'padron.editar', 'caja.editar']);

  const puedeVerCobranzas =
    caps.canViewFamiliasTesoreria || caps.canViewCuotas || caps.canCobrar;
  const puedeBuscarMiembros = caps.canViewMiembros || caps.canCobrar;
  const puedeVerPlanesYConceptos =
    caps.canGestionarPlanes || caps.hasAnyPermiso('planes.ver', 'planes.editar', 'cobranzas.ver', 'caja.editar');
  const puedeVerCajaOGastos = caps.canSeeCajaContabilidad || caps.canRegistrarGastos;
  const puedeVerBalance = caps.canSeeBalance;

  const puedeCrearConceptosYPlanes =
    caps.canGestionarPlanes && (caps.esGlobal || caps.unidadesAsignadasIds.length > 0);
  const puedeEditarDescuentoFamilia =
    caps.canAjustarCuotas || caps.canGestionarPlanes || caps.hasPermiso('caja.editar');

  const tabsDisponibles = useMemo<SegmentedTabItem<SubTabTesoreria>[]>(() => {
    const items: SegmentedTabItem<SubTabTesoreria>[] = [];
    if (puedeVerCobranzas) {
      items.push({
        id: 'cobranzas',
        label: 'Cobranzas y Familias',
        icon: <Users className="w-3.5 h-3.5" />,
      });
    }
    if (puedeVerPlanesYConceptos) {
      items.push({
        id: 'planes',
        label: 'Planes y Conceptos',
        icon: <Layers className="w-3.5 h-3.5" />,
      });
    }
    if (puedeVerCajaOGastos) {
      items.push({
        id: 'caja-gastos',
        label: 'Caja, Bancos y Gastos',
        icon: <Landmark className="w-3.5 h-3.5" />,
      });
    }
    if (puedeVerBalance) {
      items.push({
        id: 'balance',
        label: 'Cuadro de Resultados',
        icon: <Scale className="w-3.5 h-3.5" />,
      });
    }
    return items;
  }, [
    puedeVerCobranzas,
    puedeVerPlanesYConceptos,
    puedeVerCajaOGastos,
    puedeVerBalance,
  ]);

  const resolverSubTab = useCallback(
    (rawSub: string | null): SubTabTesoreria => {
      let mapeado = rawSub;
      if (rawSub === 'familias') mapeado = 'cobranzas';
      else if (rawSub === 'campamentos') mapeado = 'planes';
      else if (rawSub === 'caja-banco' || rawSub === 'gastos') mapeado = 'caja-gastos';

      const valido = tabsDisponibles.find((t) => t.id === mapeado);
      return valido ? valido.id : (tabsDisponibles[0]?.id ?? 'cobranzas');
    },
    [tabsDisponibles],
  );

  const [subTab, setSubTab] = useState<SubTabTesoreria>(() =>
    resolverSubTab(searchParams.get('sub')),
  );
  const [vistaCajaGastos, setVistaCajaGastos] = useState<'caja' | 'gastos'>(() => {
    if (searchParams.get('sub') === 'gastos' && caps.canRegistrarGastos) return 'gastos';
    return caps.canSeeCajaContabilidad ? 'caja' : 'gastos';
  });

  useEffect(() => {
    const rawSub = searchParams.get('sub');
    if (rawSub === 'gastos' && caps.canRegistrarGastos) {
      setVistaCajaGastos('gastos');
    } else if (rawSub === 'caja-banco' && caps.canSeeCajaContabilidad) {
      setVistaCajaGastos('caja');
    }
    const target = resolverSubTab(rawSub);
    if (target !== subTab) {
      setSubTab(target);
    }
  }, [searchParams, resolverSubTab, subTab, caps.canRegistrarGastos, caps.canSeeCajaContabilidad]);

  const cambiarSubTab = (nueva: SubTabTesoreria) => {
    setSubTab(nueva);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sub', nueva);
      return next;
    });
  };

  // Datos principales
  const [familias, setFamilias] = useState<any[]>([]);
  const [planesMensuales, setPlanesMensuales] = useState<any[]>([]);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscador de Cobranzas y Miembros
  const [busquedaCobranzas, setBusquedaCobranzas] = useState('');
  const [miembrosBuscados, setMiembrosBuscados] = useState<any[]>([]);
  const [buscandoMiembros, setBuscandoMiembros] = useState(false);

  // Drawer de Cobro
  const [cobroDrawerAbierto, setCobroDrawerAbierto] = useState(false);
  const [cobroEnCurso, setCobroEnCurso] = useState(false);
  const [cargandoEstadoCuenta, setCargandoEstadoCuenta] = useState(false);
  const [estadoCuentaCobro, setEstadoCuentaCobro] = useState<{
    miembro: any;
    cargos: any[];
  } | null>(null);

  // Drawer Editar Familia
  const [familiaDrawerAbierta, setFamiliaDrawerAbierta] = useState(false);
  const [familiaAEditar, setFamiliaAEditar] = useState<any | null>(null);

  // Modales de Planes, Campamentos y Rubros
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [planAEditar, setPlanAEditar] = useState<any | null>(null);
  const [modalCampamentoAbierto, setModalCampamentoAbierto] = useState(false);
  const [conceptoAEditar, setConceptoAEditar] = useState<any | null>(null);
  const [modalGestionRubrosAbierto, setModalGestionRubrosAbierto] = useState(false);
  const [sincronizandoPlanKey, setSincronizandoPlanKey] = useState<string | null>(null);

  // Diálogo de impacto
  const [impactoDialog, setImpactoDialog] = useState<ImpactoDialogState | null>(null);
  const [ejecutandoImpacto, setEjecutandoImpacto] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (tabsDisponibles.length === 0) {
      setCargando(false);
      return;
    }

    setCargando(true);
    setError(null);
    const fallos: string[] = [];
    const vacioSiFalla = (nombre: string) => () => {
      fallos.push(nombre);
      return { data: [] as any[] };
    };
    try {
      const [resPlanes, resConceptos, resFamilias, resUnidades, resCuentas] =
        await Promise.all([
          puedeVerPlanesYConceptos
            ? api.get('/tesoreria/planes-mensuales').catch(vacioSiFalla('planes'))
            : Promise.resolve({ data: [] }),
          puedeVerPlanesYConceptos
            ? api.get('/tesoreria/conceptos').catch(vacioSiFalla('conceptos'))
            : Promise.resolve({ data: [] }),
          puedeVerCobranzas
            ? api.get('/tesoreria/familias').catch(vacioSiFalla('familias'))
            : Promise.resolve({ data: [] }),
          caps.canViewOrganizacion
            ? api.get('/organizacion/unidades').catch(vacioSiFalla('unidades'))
            : Promise.resolve({ data: [] }),
          caps.canSeeCajaContabilidad
            ? api.get('/tesoreria/cuentas').catch(vacioSiFalla('cuentas'))
            : Promise.resolve({ data: [] }),
        ]);

      if (fallos.length > 0) {
        setError(`No se pudieron cargar: ${fallos.join(', ')}. Los datos que ves pueden estar incompletos.`);
      }

      setPlanesMensuales(Array.isArray(resPlanes.data) ? resPlanes.data : []);
      setConceptos(Array.isArray(resConceptos.data) ? resConceptos.data : []);
      setFamilias(Array.isArray(resFamilias.data) ? resFamilias.data : []);
      if (Array.isArray(resUnidades.data) && resUnidades.data.length > 0) {
        setUnidades(resUnidades.data);
      }

      // Pre-cachear libro diario de cuentas financieras para resiliencia offline (GLOBAL)
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (caps.canSeeCajaContabilidad && online && Array.isArray(resCuentas.data)) {
        for (const c of resCuentas.data.slice(0, 10)) {
          if (c?.id) {
            api.get(`/tesoreria/cuentas/${c.id}/libro-diario`).catch(() => {});
          }
        }
      }
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron cargar los datos de tesorería.');
      if (esErrorOffline(err)) {
        setError('Sin conexión: mostrando información guardada en este dispositivo.');
      } else {
        setError(msg);
      }
    } finally {
      setCargando(false);
    }
  }, [
    tabsDisponibles.length,
    puedeVerPlanesYConceptos,
    puedeVerCobranzas,
    caps.canSeeCajaContabilidad,
    caps.canViewOrganizacion,
  ]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // Buscador instantáneo de miembros individuales para cobro directo
  useEffect(() => {
    if (subTab !== 'cobranzas' || !puedeBuscarMiembros) {
      setMiembrosBuscados([]);
      return;
    }
    const q = busquedaCobranzas.trim();
    if (q.length < 2) {
      setMiembrosBuscados([]);
      setBuscandoMiembros(false);
      return;
    }

    let cancelado = false;
    setBuscandoMiembros(true);
    const timer = window.setTimeout(async () => {
      try {
        // Sin permiso de padrón (p. ej. tesorero), se usa la búsqueda acotada al alcance de quien cobra
        const res = caps.canViewMiembros
          ? await api.get('/miembros', {
              params: {
                q,
                porPagina: 10,
                ...(activeUnitId !== 'ALL' ? { unidadId: activeUnitId } : {}),
              },
            })
          : await api.get('/miembros/hermanos/buscar', { params: { q } });
        if (!cancelado) {
          // GET /miembros responde { items, total, pagina, porPagina }
          const lista = Array.isArray(res.data?.items)
            ? res.data.items
            : Array.isArray(res.data)
              ? res.data
              : [];
          setMiembrosBuscados(lista);
        }
      } catch {
        if (!cancelado) setMiembrosBuscados([]);
      } finally {
        if (!cancelado) setBuscandoMiembros(false);
      }
    }, 220);

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [busquedaCobranzas, subTab, caps.canViewMiembros, puedeBuscarMiembros, activeUnitId]);

  const unidadesEnAlcance = useMemo(
    () => filtrarUnidadesPorAlcance(unidades, { esGlobal: caps.esGlobal, asignaciones }),
    [unidades, caps.esGlobal, asignaciones],
  );

  // Abrir Drawer de Cobro cargando estado de cuenta actualizado
  const abrirCobroMiembro = async (miembro: {
    id: number;
    nombre: string;
    apellido: string;
    dni: string;
  }) => {
    setCobroDrawerAbierto(true);
    setCargandoEstadoCuenta(true);
    setEstadoCuentaCobro({ miembro, cargos: [] });
    try {
      const res = await api.get(`/tesoreria/estado-cuenta/${miembro.id}`);
      const saldoAFavor = Number(
        res.data?.resumen?.saldoAFavor ?? res.data?.usuario?.saldoAFavor ?? 0,
      );
      setEstadoCuentaCobro({
        miembro: {
          ...(res.data?.usuario ?? miembro),
          id: miembro.id,
          nombre: res.data?.usuario?.nombre ?? miembro.nombre,
          apellido: res.data?.usuario?.apellido ?? miembro.apellido,
          dni: res.data?.usuario?.dni ?? miembro.dni,
          saldoAFavor,
        },
        cargos: Array.isArray(res.data?.cargos) ? res.data.cargos : [],
      });
    } catch (err) {
      mostrarToast(
        traducirErrorAmigable(err, 'No se pudo obtener el estado de cuenta del miembro.'),
        'error',
      );
      setCobroDrawerAbierto(false);
      setEstadoCuentaCobro(null);
    } finally {
      setCargandoEstadoCuenta(false);
    }
  };

  // Filtrado de familias por activeUnitId + texto
  const familiasFiltradas = useMemo(() => {
    const q = normalizarTextoBusqueda(busquedaCobranzas);
    return familias.filter((fam) => {
      const miembros: any[] = Array.isArray(fam.miembros) ? fam.miembros : [];
      if (activeUnitId !== 'ALL') {
        const tieneEnUnidad = miembros.some((m) =>
          (m.asignaciones || []).some(
            (a: any) =>
              a.activo !== false &&
              (a.unidadId === activeUnitId || a.unidad?.id === activeUnitId),
          ),
        );
        if (!tieneEnUnidad) return false;
      }
      if (!q) return true;
      const target = [
        fam.nombreFamilia || '',
        ...miembros.map((m) => `${m.nombre || ''} ${m.apellido || ''} ${m.dni || ''}`),
      ].join(' ');
      return normalizarTextoBusqueda(target).includes(q);
    });
  }, [familias, activeUnitId, busquedaCobranzas]);

  // Filtrado de planes y conceptos por activeUnitId
  const planesFiltrados = useMemo(() => {
    if (activeUnitId === 'ALL') return planesMensuales;
    return planesMensuales.filter(
      (p) => p.unidadId == null || p.unidadId === activeUnitId,
    );
  }, [planesMensuales, activeUnitId]);

  const conceptosPuntuales = useMemo(() => {
    const soloPuntuales = conceptos.filter((c) => !c.planCuotaMensualId);
    if (activeUnitId === 'ALL') return soloPuntuales;
    return soloPuntuales.filter(
      (c) => c.unidadId == null || c.unidadId === activeUnitId,
    );
  }, [conceptos, activeUnitId]);

  // 1-Tap sincronización de mes en plan anual (con diálogo de impacto si desactiva un mes con pagos)
  const ejecutarSyncMesPlan = async (plan: any, mesNum: number, desactivando: boolean) => {
    const mesesActuales: number[] = Array.isArray(plan.mesesHabilitadosJson)
      ? plan.mesesHabilitadosJson
      : [];
    const nuevosMeses = desactivando
      ? mesesActuales.filter((m) => m !== mesNum)
      : [...mesesActuales, mesNum].sort((a, b) => a - b);

    setSincronizandoPlanKey(`${plan.id}-${mesNum}`);
    try {
      await api.post(`/tesoreria/planes-mensuales/${plan.id}/sincronizar-meses`, {
        mesesHabilitados: nuevosMeses,
      });
      mostrarToast(
        desactivando
          ? `${NOMBRES_MESES_LARGOS[mesNum]} desmarcado (los pagos realizados pasaron a Saldo a Favor).`
          : `Cuota de ${NOMBRES_MESES_LARGOS[mesNum]} habilitada.`,
      );
      await cargarDatos();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo actualizar el mes del plan.'), 'error');
    } finally {
      setSincronizandoPlanKey(null);
    }
  };

  const handleToggleMesPlan = (plan: any, mesNum: number) => {
    if (sincronizandoPlanKey?.startsWith(`${plan.id}-`)) return;
    const mesesActuales: number[] = Array.isArray(plan.mesesHabilitadosJson)
      ? plan.mesesHabilitadosJson
      : [];
    const estaHabilitado = mesesActuales.includes(mesNum);
    const cobradoPlan = Number(
      plan.recaudacion?.totalRecaudado ?? plan.resumenRecaudacion?.totalRecaudado ?? 0,
    );

    if (estaHabilitado) {
      setImpactoDialog({
        titulo: `Desactivar ${NOMBRES_MESES_LARGOS[mesNum]}`,
        mensaje: `Vas a deshabilitar el cobro de ${NOMBRES_MESES_LARGOS[mesNum]} en "${plan.nombre}".`,
        impacto:
          cobradoPlan > 0
            ? `El plan registra ${formatearMoneda(cobradoPlan)} recaudados. Si este mes tenía pagos aplicados, esos importes pasarán automáticamente al Saldo a Favor de cada integrante.`
            : 'Se anularán las cuotas de este mes de todos los integrantes del plan que aún no tengan pagos.',
        tipoImpacto: 'warn',
        textoConfirmar: `Sí, desactivar ${NOMBRES_MESES_CORTOS[mesNum]}`,
        peligroso: true,
        onConfirmar: async () => {
          setEjecutandoImpacto(true);
          try {
            await ejecutarSyncMesPlan(plan, mesNum, true);
            setImpactoDialog(null);
          } finally {
            setEjecutandoImpacto(false);
          }
        },
      });
      return;
    }

    void ejecutarSyncMesPlan(plan, mesNum, estaHabilitado);
  };

  // Eliminar Plan Mensual con ConfirmImpactDialog + Toast Deshacer si cobrado === 0
  const solicitarEliminarPlan = (plan: any) => {
    const cobrado = Number(
      plan.recaudacion?.totalRecaudado ?? plan.resumenRecaudacion?.totalRecaudado ?? 0,
    );
    setImpactoDialog({
      titulo: 'Eliminar Cobro Mensual',
      mensaje: `¿Confirmás eliminar "${plan.nombre}"?`,
      impacto:
        cobrado > 0
          ? `Se liberarán ${formatearMoneda(cobrado)} ya abonados hacia el Saldo a Favor de las familias y se anularán las cuotas pendientes.`
          : 'Se eliminarán todas las cuotas pendientes generadas por este plan (0 pagos registrados).',
      tipoImpacto: cobrado > 0 ? 'warn' : 'danger',
      textoConfirmar: 'Sí, eliminar plan',
      peligroso: true,
      onConfirmar: async () => {
        const planBackup = { ...plan };
        setEjecutandoImpacto(true);
        try {
          await api.delete(`/tesoreria/planes-mensuales/${plan.id}`);
          setImpactoDialog(null);
          await cargarDatos();

          if (cobrado === 0) {
            mostrarToastConDeshacer(
              `Plan "${planBackup.nombre}" eliminado.`,
              async () => {
                try {
                  const meses = Array.isArray(planBackup.mesesHabilitadosJson)
                    ? planBackup.mesesHabilitadosJson
                    : Array.isArray(planBackup.mesesHabilitados)
                      ? planBackup.mesesHabilitados
                      : [];
                  await api.post('/tesoreria/planes-mensuales', {
                    nombre: planBackup.nombre,
                    montoMensual: Number(planBackup.montoMensual || planBackup.montoBase || 0),
                    cicloAnio: planBackup.cicloAnio,
                    diaVencimiento: planBackup.diaVencimiento || 10,
                    mesesHabilitados: meses,
                    destinatarioTipo: planBackup.destinatarioTipo || 'PROTAGONISTAS',
                    unidadId: planBackup.unidadId || undefined,
                    rubroId: planBackup.rubroId || undefined,
                    permiteDescuentoHermanos: planBackup.permiteDescuentoHermanos ?? true,
                    porcentajeDescuentoHermanos: planBackup.porcentajeDescuentoHermanos
                      ? Number(planBackup.porcentajeDescuentoHermanos)
                      : undefined,
                    excepcionesIds: Array.isArray(planBackup.excepcionesJson)
                      ? planBackup.excepcionesJson
                      : [],
                  });
                  await cargarDatos();
                  mostrarToast(`Plan "${planBackup.nombre}" restaurado.`);
                } catch (err) {
                  mostrarToast(
                    traducirErrorAmigable(err, 'No se pudo restaurar el plan.'),
                    'error',
                  );
                }
              },
            );
          } else {
            mostrarToast(`Plan "${planBackup.nombre}" eliminado.`);
          }
        } catch (err) {
          mostrarToast(
            traducirErrorAmigable(err, 'No se pudo eliminar el plan mensual.'),
            'error',
          );
        } finally {
          setEjecutandoImpacto(false);
        }
      },
    });
  };

  // Eliminar Concepto / Campamento con ConfirmImpactDialog + Toast Deshacer si cobrado === 0
  const solicitarEliminarConcepto = (con: any) => {
    const cobrado = Number(
      con.recaudacion?.totalRecaudado ?? con.resumenRecaudacion?.totalRecaudado ?? 0,
    );
    setImpactoDialog({
      titulo: 'Eliminar Cobro Puntual',
      mensaje: `¿Seguro que querés eliminar "${con.nombre}"?`,
      impacto:
        cobrado > 0
          ? `Los ${formatearMoneda(cobrado)} abonados por los miembros pasarán automáticamente a su Saldo a Favor.`
          : 'Se anularán las deudas pendientes de este concepto (0 pagos registrados).',
      tipoImpacto: cobrado > 0 ? 'warn' : 'danger',
      textoConfirmar: 'Sí, eliminar concepto',
      peligroso: true,
      onConfirmar: async () => {
        const conBackup = { ...con };
        setEjecutandoImpacto(true);
        try {
          await api.delete(`/tesoreria/conceptos/${con.id}`);
          setImpactoDialog(null);
          await cargarDatos();

          if (cobrado === 0) {
            mostrarToastConDeshacer(
              `"${conBackup.nombre}" eliminado.`,
              async () => {
                try {
                  await api.post('/tesoreria/conceptos', {
                    nombre: conBackup.nombre,
                    tipo: conBackup.tipo,
                    montoBase: Number(conBackup.montoBase),
                    cicloAnio: conBackup.cicloAnio,
                    fechaVencimiento: conBackup.fechaVencimiento
                      ? String(conBackup.fechaVencimiento).slice(0, 10)
                      : undefined,
                    permiteDescuentoHermanos: conBackup.permiteDescuentoHermanos ?? true,
                    porcentajeDescuentoHermanos: conBackup.porcentajeDescuentoHermanos
                      ? Number(conBackup.porcentajeDescuentoHermanos)
                      : undefined,
                    esParaEducadores: conBackup.esParaEducadores ?? false,
                    destinatarioTipo: conBackup.destinatarioTipo || 'TODOS',
                    excepcionesIds: Array.isArray(conBackup.excepcionesJson)
                      ? conBackup.excepcionesJson
                      : [],
                    rubroId: conBackup.rubroId || undefined,
                    unidadId: conBackup.unidadId || undefined,
                    generarCargosInmediatos: true,
                  });
                  await cargarDatos();
                  mostrarToast(`"${conBackup.nombre}" restaurado.`);
                } catch (err) {
                  mostrarToast(
                    traducirErrorAmigable(err, 'No se pudo restaurar el concepto.'),
                    'error',
                  );
                }
              },
            );
          } else {
            mostrarToast(`"${conBackup.nombre}" eliminado.`);
          }
        } catch (err) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el concepto.'), 'error');
        } finally {
          setEjecutandoImpacto(false);
        }
      },
    });
  };

  if (tabsDisponibles.length === 0) {
    return (
      <div className="s-card rounded-2xl p-8 text-center text-sm text-ink-muted">
        No tenés permisos habilitados para operar el módulo de Tesorería.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 s-anim-view">
      {/* Cabecera de módulo + SegmentedTabs por capacidades */}
      <section className="s-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
                Tesorería y Finanzas
              </h1>
            </div>
            <p className="text-sm text-ink-muted">
              Cobranzas familiares, cobros mensuales, cobros puntuales, libro diario y balance del grupo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {caps.canGestionarRubros && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setModalGestionRubrosAbierto(true)}
              >
                <Tag className="w-4 h-4 text-brand" />
                <span>Rubros Contables</span>
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={cargando}
              onClick={() => void cargarDatos()}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Actualizar</span>
            </Button>
          </div>
        </div>

        <SegmentedTabs
          items={tabsDisponibles}
          activeId={subTab}
          onChange={cambiarSubTab}
          ariaLabel="Subsecciones de tesorería"
        />
      </section>

      {/* Resumen compacto de indicadores */}
      {(puedeVerCobranzas || puedeVerPlanesYConceptos) && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {puedeVerCobranzas && (
          <KpiCard
            label="Grupos familiares"
            value={cargando && familias.length === 0 ? '—' : familiasFiltradas.length}
            hint="Con descuento por hermanos"
            icon={<Users className="w-4 h-4" />}
            tone="brand"
          />
          )}
          {puedeVerPlanesYConceptos && (
            <>
          <KpiCard
            label="Cobros Mensuales"
            value={cargando && planesMensuales.length === 0 ? '—' : planesFiltrados.length}
            hint="Planes activos del ciclo"
            icon={<Layers className="w-4 h-4" />}
            tone="info"
          />
          <KpiCard
            label="Cobros Puntuales"
            value={cargando && conceptos.length === 0 ? '—' : conceptosPuntuales.length}
            hint="Conceptos y eventos"
            icon={<Tent className="w-4 h-4" />}
            tone="warn"
          />
          <KpiCard
            label="Recaudado (planes)"
            value={
              cargando && planesMensuales.length === 0
                ? '—'
                : formatearMoneda(
                    planesFiltrados.reduce(
                      (acc, p) => acc + Number(p.recaudacion?.totalRecaudado ?? 0),
                      0,
                    ),
                  )
            }
            hint="Sobre planes visibles"
            icon={<CreditCard className="w-4 h-4" />}
            tone="ok"
          />
            </>
          )}
        </section>
      )}

      {error && (
        <div role="alert" className="s-badge-warn rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void cargarDatos()}>
            Reintentar
          </Button>
        </div>
      )}

      {/* SUB-TAB 1: COBRANZAS Y FAMILIAS */}
      {subTab === 'cobranzas' && puedeVerCobranzas && (
        <div key="cobranzas" className="space-y-4 s-anim-tab">
          <div className="s-card rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={busquedaCobranzas}
                onChange={(e) => setBusquedaCobranzas(e.target.value)}
                aria-label="Buscar familia, hermano o miembro por nombre, apellido o DNI" placeholder="Buscar familia o miembro..."
                className="w-full min-h-[46px] pl-10 pr-10 py-2.5 rounded-xl border border-rule bg-paper-2 text-base sm:text-[15px] text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
              {busquedaCobranzas && (
                <button
                  type="button"
                  onClick={() => setBusquedaCobranzas('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Resultado de búsqueda rápida individual de miembros para cobro directo */}
            {busquedaCobranzas.trim().length >= 2 && puedeBuscarMiembros && (
              <div className="pt-2.5 border-t border-rule space-y-2.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-bold text-ink-2">
                    Cobro rápido a integrante ({miembrosBuscados.length})
                  </span>
                  {buscandoMiembros && <Loader2 className="w-4 h-4 animate-spin text-brand" />}
                </div>
                {miembrosBuscados.length === 0 && !buscandoMiembros ? (
                  <p className="text-[13px] text-ink-muted">
                    No encontramos integrantes que coincidan con &ldquo;{busquedaCobranzas.trim()}&rdquo;.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {miembrosBuscados.map((m) => {
                      const uNombre = obtenerRolPrincipal(m)?.unidad?.nombre || 'Sin sección';
                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl bg-paper-2 border border-rule flex items-center justify-between gap-2.5"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              caps.canViewMiembros
                                ? navigate(`/miembros/${m.id}?tab=cuotas`)
                                : void abrirCobroMiembro(m)
                            }
                            className="min-w-0 text-left cursor-pointer group"
                          >
                            <span className="text-sm font-bold text-ink group-hover:text-brand group-hover:underline block truncate">
                              {m.apellido}, {m.nombre}
                            </span>
                            <span className="text-xs text-ink-muted block truncate">
                              DNI {m.dni} • {uNombre}
                            </span>
                          </button>

                          {caps.canCobrar &&
                            tienePermisoSobreMiembro(asignaciones, ['cobranzas.editar', 'caja.editar'], m) && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => void abrirCobroMiembro(m)}
                            >
                              <CreditCard className="w-4 h-4" />
                              <span>Cobrar</span>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grilla de Grupos Familiares */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {cargando && familias.length === 0 &&
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`skel-fam-${i}`}
                  className="s-card rounded-2xl p-4 animate-pulse space-y-3"
                >
                  <div className="h-5 w-40 rounded bg-paper-3" />
                  <div className="h-3.5 w-28 rounded bg-paper-2" />
                  <div className="h-14 w-full rounded-xl bg-paper-2" />
                </div>
              ))}

            {familiasFiltradas.map((fam) => {
              const pct = Number(fam.porcentajeDescuentoHermanos ?? 0);
              const miembros: any[] = Array.isArray(fam.miembros) ? fam.miembros : [];
              const editablePorAlcance = puedeEditarFamiliaPorAlcance(fam, {
                esGlobal: esGlobalFamilias,
                unidadesEnAlcanceIds: caps.unidadesAsignadasIds,
              });
              const puedeEditarFamilia = puedeEditarDescuentoFamilia && editablePorAlcance;

              return (
                <article
                  key={fam.id}
                  className="s-card rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-ink text-base truncate">
                          {fam.nombreFamilia}
                        </h3>
                        <span className="text-[13px] text-ink-muted">
                          {miembros.length} {miembros.length === 1 ? 'integrante' : 'hermanos'}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-xl text-xs font-black border shrink-0 ${
                          pct > 0 ? 's-badge-brand' : 'bg-paper-2 text-ink-muted border-rule'
                        }`}
                      >
                        {pct > 0 ? `${pct}% Desc.` : 'Sin desc.'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {miembros.map((m) => {
                        const asig = obtenerRolPrincipal(m);
                        const uId = asig?.unidadId ?? asig?.unidad?.id ?? null;
                        const uNombre = asig?.unidad?.nombre || 'Sin rama';
                        const enAlcanceUnidad =
                          esGlobalCobranzas ||
                          (typeof uId === 'number' && caps.unidadesAsignadasIds.includes(uId));

                        return (
                          <div
                            key={m.id}
                            className="p-2.5 rounded-xl bg-paper-2 border border-rule/80 flex items-center justify-between gap-2"
                          >
                            <button
                              type="button"
                              onClick={() => navigate(`/miembros/${m.id}?tab=cuotas`)}
                              className="min-w-0 text-left flex-1 cursor-pointer group"
                              title="Ver cuenta corriente en ficha"
                            >
                              <span className="text-[13px] font-bold text-ink group-hover:text-brand group-hover:underline block truncate">
                                {m.nombre} {m.apellido}
                              </span>
                              <span className="text-xs text-ink-muted font-semibold block truncate">
                                {uNombre}
                              </span>
                            </button>

                            {caps.canCobrar &&
                              (enAlcanceUnidad ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void abrirCobroMiembro(m)}
                                  className="shrink-0"
                                >
                                  <CreditCard className="w-4 h-4 text-brand" />
                                  <span>Cobrar</span>
                                </Button>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-paper-3 text-ink-muted text-xs font-semibold shrink-0"
                                  title="Este integrante pertenece a otra sección"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Otra rama</span>
                                </span>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-rule space-y-2">
                    {puedeEditarFamilia ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setFamiliaAEditar(fam);
                          setFamiliaDrawerAbierta(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Editar Grupo / Descuento</span>
                      </Button>
                    ) : (
                      puedeEditarDescuentoFamilia &&
                      caps.esUnidad && (
                        <div className="p-3 rounded-xl bg-paper-2 border border-rule text-xs text-ink-muted flex items-start gap-2">
                          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <span>
                            No podés editar este grupo familiar porque hay hermanos en otras secciones.
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </article>
              );
            })}

            {familiasFiltradas.length === 0 && !cargando && (
              <div className="col-span-full s-card rounded-2xl p-10 text-center text-sm text-ink-muted">
                {busquedaCobranzas.trim()
                  ? 'No hay grupos familiares que coincidan con la búsqueda.'
                  : 'No hay grupos familiares con hermanos registrados aún.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PLANES Y CONCEPTOS */}
      {subTab === 'planes' && puedeVerPlanesYConceptos && (
        <div key="planes" className="space-y-6 s-anim-tab">
          {/* Bloque A: Cobros Mensuales */}
          <section className="s-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-ink flex items-center gap-2">
                  <Layers className="w-5 h-5 text-brand" />
                  <span>Cobros Mensuales</span>
                </h2>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  Tocá cualquier mes para habilitar o desactivar su cobro en el ciclo.
                </p>
              </div>
              {puedeCrearConceptosYPlanes && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setPlanAEditar(null);
                    setModalPlanAbierto(true);
                  }}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Nuevo Cobro Mensual</span>
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {planesFiltrados.map((plan) => {
                const mesesHabilitados: number[] = Array.isArray(plan.mesesHabilitadosJson)
                  ? plan.mesesHabilitadosJson
                  : [];
                const excepciones: number[] = Array.isArray(plan.excepcionesJson)
                  ? plan.excepcionesJson
                  : [];
                const rec = plan.recaudacion;
                const puedeEditarPlan =
                  puedeCrearConceptosYPlanes &&
                  puedeModificarPorAlcanceUnidad(plan.unidadId, {
                    esGlobal: esGlobalPlanes,
                    unidadesEnAlcanceIds: caps.unidadesAsignadasIds,
                  });

                return (
                  <div
                    key={plan.id}
                    className="p-5 rounded-2xl border border-rule bg-paper-2 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-ink text-base leading-snug truncate">
                            {plan.nombre}
                          </h3>
                          <p className="text-[13px] text-ink-muted mt-0.5">
                            {plan.unidad ? plan.unidad.nombre : 'Todo el Grupo Scout'} •{' '}
                            {plan.destinatarioTipo === 'EDUCADORES'
                              ? 'Educadores'
                              : plan.destinatarioTipo === 'PROTAGONISTAS'
                                ? 'Protagonistas'
                                : 'Todos'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xl font-black text-ink s-tabular block">
                            {formatearMoneda(plan.montoMensual)}
                          </span>
                          <span className="text-xs text-ink-muted font-medium">por mes</span>
                        </div>
                      </div>

                      {/* Matriz 12 meses 1-tap */}
                      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                          const activo = mesesHabilitados.includes(num);
                          const cargandoMes = sincronizandoPlanKey === `${plan.id}-${num}`;
                          // Bloquear todo el plan mientras sincroniza: dos toques seguidos partirían
                          // del mismo mesesHabilitadosJson y el segundo pisaría al primero.
                          const planSincronizando = Boolean(
                            sincronizandoPlanKey?.startsWith(`${plan.id}-`),
                          );
                          return (
                            <button
                              aria-pressed={activo}
                              key={num}
                              type="button"
                              aria-label={`${NOMBRES_MESES_LARGOS[num]}: ${activo ? 'habilitado' : 'deshabilitado'}`}
                              disabled={!puedeEditarPlan || planSincronizando}
                              onClick={() => puedeEditarPlan && handleToggleMesPlan(plan, num)}
                              className={`min-h-[42px] py-1 px-0.5 rounded-xl text-center font-bold text-xs transition flex flex-col items-center justify-center gap-0.5 border ${
                                !puedeEditarPlan ? 'cursor-default' : 'cursor-pointer'
                              } ${
                                activo
                                  ? 'bg-brand text-brand-contrast border-brand font-extrabold hover:opacity-90'
                                  : 'bg-surface text-ink-muted border-rule hover:border-brand'
                              }`}
                            >
                              <span>{NOMBRES_MESES_CORTOS[num]}</span>
                              {cargandoMes ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : activo ? (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              ) : (
                                <span className="text-xs opacity-40">·</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {rec && rec.totalCargos > 0 && (
                        <div className="p-3.5 rounded-xl bg-surface border border-rule space-y-2 text-[13px]">
                          <div className="flex items-center justify-between">
                            <span className="text-ink-muted">
                              Cobrado:{' '}
                              <strong className="text-ink s-tabular">
                                {formatearMoneda(rec.totalRecaudado)}
                              </strong>
                            </span>
                            <span className="text-ink-muted">
                              Pendiente:{' '}
                              <strong className="text-rose-600 dark:text-rose-400 s-tabular">
                                {formatearMoneda(rec.totalPendiente)}
                              </strong>
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand rounded-full"
                              style={{ width: `${Math.min(100, rec.porcentajeCobrado || 0)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-ink-muted">
                            <span>
                              {rec.cargosPagados} de {rec.totalCargos} cobros al día
                            </span>
                            <span className="font-bold text-ink">{rec.porcentajeCobrado}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-rule flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink-muted">
                        {mesesHabilitados.length} de 12 meses activos
                        {excepciones.length > 0 && ` • ${excepciones.length} becados`}
                      </span>

                      {puedeEditarPlan && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setPlanAEditar(plan);
                              setModalPlanAbierto(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                            <span>Editar</span>
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            aria-label={`Eliminar plan ${plan.nombre}`}
                            onClick={() => solicitarEliminarPlan(plan)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {planesFiltrados.length === 0 && !cargando && (
                <div className="col-span-full py-8 text-center text-sm text-ink-muted">
                  No hay cobros mensuales creados.
                </div>
              )}
            </div>
          </section>

          {/* Bloque B: Cobros Puntuales */}
          <section className="s-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-ink flex items-center gap-2">
                  <Tent className="w-5 h-5 text-brand" />
                  <span>Cobros Puntuales</span>
                </h2>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  Cobros especiales con destinatarios configurables y exenciones individuales.
                </p>
              </div>
              {puedeCrearConceptosYPlanes && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setConceptoAEditar(null);
                    setModalCampamentoAbierto(true);
                  }}
                >
                  <Tent className="w-4 h-4" />
                  <span>Nuevo Cobro Puntual</span>
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {conceptosPuntuales.map((con) => {
                const rec = con.recaudacion;
                const excepciones: number[] = Array.isArray(con.excepcionesJson)
                  ? con.excepcionesJson
                  : [];
                const puedeEditarConcepto =
                  puedeCrearConceptosYPlanes &&
                  puedeModificarPorAlcanceUnidad(con.unidadId, {
                    esGlobal: esGlobalPlanes,
                    unidadesEnAlcanceIds: caps.unidadesAsignadasIds,
                  });

                return (
                  <div
                    key={con.id}
                    className="p-5 rounded-2xl border border-rule bg-paper-2 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-ink text-base truncate">{con.nombre}</h3>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted mt-1">
                            <span className="font-semibold text-ink-2">
                              {con.unidad ? con.unidad.nombre : 'Todo el Grupo'}
                            </span>
                            <span>•</span>
                            <span>
                              {con.destinatarioTipo === 'EDUCADORES'
                                ? 'Educadores'
                                : con.destinatarioTipo === 'PROTAGONISTAS'
                                  ? 'Protagonistas'
                                  : 'Todos'}
                            </span>
                            {excepciones.length > 0 && (
                              <>
                                <span>•</span>
                                <span>{excepciones.length} exentos</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-[17px] font-extrabold text-brand s-tabular shrink-0">
                          {formatearMoneda(con.montoBase)}
                        </span>
                      </div>

                      {con.fechaVencimiento && (
                        <div className="flex items-center gap-1.5 text-xs text-brand font-semibold">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            Vence: {formatearFecha(con.fechaVencimiento)}
                          </span>
                        </div>
                      )}

                      {rec && (
                        <div className="p-3.5 rounded-xl bg-surface border border-rule space-y-2 text-[13px]">
                          <div className="flex items-center justify-between">
                            <span className="text-ink-muted">
                              Cobrado:{' '}
                              <strong className="text-ink s-tabular">
                                {formatearMoneda(rec.totalRecaudado)}
                              </strong>
                            </span>
                            <span className="text-ink-muted">
                              Falta:{' '}
                              <strong className="text-rose-600 dark:text-rose-400 s-tabular">
                                {formatearMoneda(rec.totalPendiente)}
                              </strong>
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand rounded-full"
                              style={{ width: `${Math.min(100, rec.porcentajeCobrado || 0)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-ink-muted">
                            <span>
                              {rec.cargosPagados} de {rec.totalCargos} pagados
                            </span>
                            <span className="font-bold text-ink">{rec.porcentajeCobrado}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {puedeEditarConcepto && (
                      <div className="pt-3 border-t border-rule flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setConceptoAEditar(con);
                            setModalCampamentoAbierto(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                          <span>Editar / Exentos</span>
                        </Button>

                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          aria-label={`Eliminar concepto ${con.nombre}`}
                          onClick={() => solicitarEliminarConcepto(con)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {conceptosPuntuales.length === 0 && !cargando && (
                <div className="col-span-full py-8 text-center text-sm text-ink-muted">
                  No hay cobros puntuales creados.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 3: CAJA, BANCOS Y GASTOS (Solo GLOBAL) */}
      {activeUnitId !== 'ALL' && (subTab === 'caja-gastos' || subTab === 'balance') && (
        <p className="text-[13px] text-ink-muted px-0.5" role="note">
          Esta vista muestra todo tu alcance: no se filtra por la sección elegida arriba.
        </p>
      )}
      {subTab === 'caja-gastos' && puedeVerCajaOGastos && (
        <div key="caja-gastos" className="space-y-4 s-anim-tab">
          {caps.canSeeCajaContabilidad && caps.canRegistrarGastos && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedTabs
                items={[
                  {
                    id: 'caja',
                    label: 'Libro Diario (Caja y Bancos)',
                    icon: <Landmark className="w-4 h-4" />,
                  },
                  {
                    id: 'gastos',
                    label: 'Gastos y Egresos',
                    icon: <Receipt className="w-4 h-4" />,
                  },
                ]}
                activeId={vistaCajaGastos}
                onChange={setVistaCajaGastos}
                ariaLabel="Vista de caja o gastos"
              />
            </div>
          )}

          <div className="s-card rounded-2xl p-4 sm:p-5">
            {vistaCajaGastos === 'caja' && caps.canSeeCajaContabilidad ? (
              <PanelTesoreriaCajaBanco onToast={mostrarToast} />
            ) : (
              caps.canRegistrarGastos && <PanelGastosTesoreria onToast={mostrarToast} />
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: CUADRO DE RESULTADOS (Solo GLOBAL) */}
      {subTab === 'balance' && puedeVerBalance && (
        <div key="balance" className="s-card rounded-2xl p-4 sm:p-5 s-anim-tab">
          <PanelCuadroResultados onToast={mostrarToast} />
        </div>
      )}

      {/* Drawer de Cobro Parcial / Saldo a Favor */}
      <Drawer
        abierto={cobroDrawerAbierto}
        bloqueado={cobroEnCurso}
        onCerrar={() => {
          setCobroDrawerAbierto(false);
          setEstadoCuentaCobro(null);
        }}
        titulo="Registrar Pago / Cobrar Cuotas"
        subtitulo={
          estadoCuentaCobro?.miembro
            ? `${estadoCuentaCobro.miembro.nombre} ${estadoCuentaCobro.miembro.apellido} • DNI ${estadoCuentaCobro.miembro.dni}`
            : 'Cargando cuenta corriente…'
        }
        mode="drawer"
        maxWidthClass="sm:max-w-2xl"
      >
        {cargandoEstadoCuenta ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-ink-muted text-sm">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
            <span>Cargando cuotas pendientes y saldo a favor…</span>
          </div>
        ) : (
          estadoCuentaCobro && (
            <ModalCobrarDeuda
              abierto={true}
              embedded={true}
              onOcupadoChange={setCobroEnCurso}
              miembro={estadoCuentaCobro.miembro}
              cargosPendientes={estadoCuentaCobro.cargos}
              onCerrar={() => {
                setCobroDrawerAbierto(false);
                setEstadoCuentaCobro(null);
              }}
              onPagoExitoso={(mensaje) => {
                mostrarToast(mensaje);
                void cargarDatos();
              }}
            />
          )
        )}
      </Drawer>

      {/* Drawer Editar Familia y % Descuento */}
      <Drawer
        abierto={familiaDrawerAbierta && familiaAEditar !== null}
        onCerrar={() => {
          setFamiliaDrawerAbierta(false);
          setFamiliaAEditar(null);
        }}
        titulo="Grupo Familiar y Descuento"
        subtitulo={familiaAEditar?.nombreFamilia}
        mode="drawer"
        maxWidthClass="sm:max-w-lg"
      >
        {familiaAEditar && (
          <ModalEditarFamilia
            abierto={true}
            embedded={true}
            familia={familiaAEditar}
            onCerrar={() => {
              setFamiliaDrawerAbierta(false);
              setFamiliaAEditar(null);
            }}
            onGuardado={(mensaje) => {
              mostrarToast(mensaje);
              void cargarDatos();
            }}
          />
        )}
      </Drawer>

      {/* Modales de Planes, Campamentos y Rubros */}
      <ModalPlanCuotaMensual
        abierto={modalPlanAbierto}
        planAEditar={planAEditar}
        unidades={unidadesEnAlcance}
        onCerrar={() => {
          setModalPlanAbierto(false);
          setPlanAEditar(null);
        }}
        onGuardado={() => {
          mostrarToast('Cobro mensual guardado.');
          void cargarDatos();
        }}
      />

      <ModalCobroCampamento
        abierto={modalCampamentoAbierto}
        conceptoAEditar={conceptoAEditar}
        unidades={unidadesEnAlcance}
        onCerrar={() => {
          setModalCampamentoAbierto(false);
          setConceptoAEditar(null);
        }}
        onGenerado={(mensaje) => {
          mostrarToast(mensaje);
          void cargarDatos();
        }}
      />

      <ModalGestionRubros
        abierto={modalGestionRubrosAbierto}
        onCerrar={() => setModalGestionRubrosAbierto(false)}
        onRubrosCambiados={cargarDatos}
      />

      {impactoDialog && (
        <ConfirmImpactDialog
          abierto={true}
          onCerrar={() => {
            if (!ejecutandoImpacto) setImpactoDialog(null);
          }}
          onConfirmar={impactoDialog.onConfirmar}
          titulo={impactoDialog.titulo}
          mensaje={impactoDialog.mensaje}
          impacto={impactoDialog.impacto}
          tipoImpacto={impactoDialog.tipoImpacto}
          textoConfirmar={impactoDialog.textoConfirmar}
          peligroso={impactoDialog.peligroso}
          cargando={ejecutandoImpacto}
        />
      )}
    </div>
  );
};
