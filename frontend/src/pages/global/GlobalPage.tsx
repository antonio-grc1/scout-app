import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useToastStore, mostrarToastConDeshacer } from '../../store/toastStore';
import { Navbar } from '../../components/Navbar';
import { ModalPlanCuotaMensual } from '../../components/ModalPlanCuotaMensual';
import { ModalCobroCampamento } from '../../components/ModalCobroCampamento';
import { ModalEditarFamilia } from '../../components/ModalEditarFamilia';
import { ModalDetalleMiembro } from '../../components/ModalDetalleMiembro';
import { ModalConfirmacion, type ModalConfirmacionProps } from '../../components/ModalConfirmacion';
import { PanelAdminRamas } from '../../components/PanelAdminRamas';
import { PanelGestorRoles } from '../../components/PanelGestorRoles';
import { PanelPasesPorCamada } from '../../components/PanelPasesPorCamada';
import { PanelAdminPlantillas } from '../../components/PanelAdminPlantillas';
import { PanelTesoreriaCajaBanco } from '../../components/PanelTesoreriaCajaBanco';
import { PanelGastosTesoreria } from '../../components/PanelGastosTesoreria';
import { PanelCuadroResultados } from '../../components/PanelCuadroResultados';
import { PanelEventosEconomicos } from '../../components/PanelEventosEconomicos';
import { ModalGestionRubros } from '../../components/ModalGestionRubros';
import {
  NOMBRES_MESES_CORTOS,
  NOMBRES_MESES_LARGOS,
  formatearMoneda,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  Shield,
  Landmark,
  PlusCircle,
  Users,
  Pencil,
  Trash2,
  Calendar,
  HeartHandshake,
  Truck,
  Wrench,
  Utensils,
  Phone,
  Layers,
  Tent,
  Receipt,
  Scale,
  Sparkles,
  Tag,
  Check,
  Loader2,
  X,
  FileText,
} from 'lucide-react';

export const GlobalPage: React.FC = () => {
  const { tienePermiso, tieneGlobal, refrescarSesionDesdeServidor } = useAuthStore();
  const puedeVerTesoreria =
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('tesoreria.conceptos_planes') ||
    tienePermiso('tesoreria.caja_ver') ||
    tienePermiso('tesoreria.gastos_registrar') ||
    tienePermiso('cuotas.ver') ||
    tienePermiso('cuotas.cobrar') ||
    tienePermiso('cuotas.ajustar') ||
    tienePermiso('eventos.ver') ||
    tienePermiso('eventos.vender') ||
    tienePermiso('eventos.gestionar');
  const puedeGestionarTesoreria = tienePermiso('tesoreria.gestionar');
  const puedeVerColaboradores = tienePermiso('legajos.ver');
  const puedeVerOrganizacion = tienePermiso('organizacion.ver') || tienePermiso('organizacion.gestionar');
  const puedeVerRoles =
    tienePermiso('roles.gestionar') ||
    tienePermiso('organizacion.gestionar') ||
    tienePermiso('organizacion.ver');
  const puedeVerPases = tienePermiso('pases.ver') || tienePermiso('pases.ejecutar');
  const puedeVerPlantillas = tienePermiso('legajos.plantillas_gestionar') || tienePermiso('legajos.ver');

  const puedeVerCaja = tienePermiso('tesoreria.caja_ver') || tienePermiso('tesoreria.gestionar');
  const puedeVerGastos =
    tienePermiso('tesoreria.gastos_registrar') ||
    tienePermiso('tesoreria.caja_ver') ||
    tienePermiso('tesoreria.gestionar');
  const puedeVerBalance = tienePermiso('tesoreria.caja_ver') || tienePermiso('tesoreria.gestionar');
  const puedeVerEventos =
    tienePermiso('eventos.ver') ||
    tienePermiso('eventos.vender') ||
    tienePermiso('eventos.gestionar') ||
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('tesoreria.conceptos_planes') ||
    tienePermiso('cuotas.ver');
  const puedeVerPlanes =
    tienePermiso('tesoreria.conceptos_planes') ||
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('cuotas.ver');
  const puedeVerCampamentos =
    tienePermiso('tesoreria.conceptos_planes') ||
    tienePermiso('cuotas.cobrar') ||
    tienePermiso('tesoreria.gestionar');
  const puedeVerFamilias =
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('cuotas.ajustar') ||
    tienePermiso('miembros.editar');

  const tabPorDefecto = (): 'tesoreria' | 'colaboradores' | 'organizacion' | 'roles' | 'pases' | 'plantillas' => {
    if (puedeVerTesoreria) return 'tesoreria';
    if (puedeVerRoles) return 'roles';
    if (puedeVerOrganizacion) return 'organizacion';
    if (puedeVerPlantillas) return 'plantillas';
    if (puedeVerPases) return 'pases';
    return 'colaboradores';
  };

  const subTabPorDefecto = (): 'caja-banco' | 'gastos' | 'balance' | 'eventos-qr' | 'planes' | 'campamentos' | 'familias' => {
    if (puedeVerCaja) return 'caja-banco';
    if (puedeVerGastos) return 'gastos';
    if (puedeVerBalance) return 'balance';
    if (puedeVerEventos) return 'eventos-qr';
    if (puedeVerPlanes) return 'planes';
    if (puedeVerCampamentos) return 'campamentos';
    if (puedeVerFamilias) return 'familias';
    return 'caja-banco';
  };

  const [tab, setTab] = useState<'tesoreria' | 'colaboradores' | 'organizacion' | 'roles' | 'pases' | 'plantillas'>(tabPorDefecto);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [planesMensuales, setPlanesMensuales] = useState<any[]>([]);
  const [familias, setFamilias] = useState<any[]>([]);
  const [subTabTesoreria, setSubTabTesoreria] = useState<'caja-banco' | 'gastos' | 'balance' | 'eventos-qr' | 'planes' | 'campamentos' | 'familias'>(subTabPorDefecto);
  const [ramas, setRamas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [mostrarInactivasOrg, setMostrarInactivasOrg] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [permisosCatalogo, setPermisosCatalogo] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sincronizandoPlanId, setSincronizandoPlanId] = useState<string | null>(null);

  // Estados de Modales
  const [modalGestionRubrosAbierto, setModalGestionRubrosAbierto] = useState(false);
  const [conceptoAEditar, setConceptoAEditar] = useState<any | null>(null);
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [planAEditar, setPlanAEditar] = useState<any | null>(null);
  const [modalCampamentoAbierto, setModalCampamentoAbierto] = useState(false);
  const [modalFamiliaAbierto, setModalFamiliaAbierto] = useState(false);
  const [familiaAEditar, setFamiliaAEditar] = useState<any | null>(null);
  const [miembroDetalleId, setMiembroDetalleId] = useState<number | null>(null);
  const [tabInicialDetalle, setTabInicialDetalle] = useState<'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas'>('cuotas');
  const [modalConf, setModalConf] = useState<ModalConfirmacionProps | null>(null);

  const mostrarToast = useCallback((texto: string, tipo: 'exito' | 'error' = 'exito') => {
    useToastStore.getState().mostrarToast(texto, tipo);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [tab, mostrarInactivasOrg]);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      if (tab === 'pases') {
        const [res, resUnidades] = await Promise.all([
          api.get('/pases/candidatos'),
          unidades.length === 0 ? api.get('/organizacion/unidades') : Promise.resolve({ data: unidades }),
        ]);
        setCandidatos(res.data);
        if (unidades.length === 0) setUnidades(resUnidades.data);
      } else if (tab === 'tesoreria') {
        const [resPlanes, resConceptos, resFamilias, resUnidades] = await Promise.all([
          api.get('/tesoreria/planes-mensuales').catch(() => ({ data: [] })),
          api.get('/tesoreria/conceptos').catch(() => ({ data: [] })),
          api.get('/tesoreria/familias').catch(() => ({ data: [] })),
          unidades.length === 0 ? api.get('/organizacion/unidades') : Promise.resolve({ data: unidades }),
        ]);
        setPlanesMensuales(resPlanes.data || []);
        setConceptos(resConceptos.data || []);
        setFamilias(resFamilias.data || []);
        if (unidades.length === 0) {
          setUnidades(resUnidades.data);
        }
      } else if (tab === 'organizacion') {
        const qInactivas = mostrarInactivasOrg ? '?incluirInactivas=true' : '';
        const [resRamas, resUnidades] = await Promise.all([
          api.get(`/organizacion/ramas${qInactivas}`),
          api.get(`/organizacion/unidades${qInactivas}`),
        ]);
        setRamas(resRamas.data);
        setUnidades(resUnidades.data);
      } else if (tab === 'roles') {
        const [resRoles, resPermisos] = await Promise.all([
          api.get('/organizacion/roles'),
          api.get('/organizacion/permisos'),
        ]);
        setRoles(resRoles.data || []);
        setPermisosCatalogo(resPermisos.data || []);
      } else if (tab === 'colaboradores') {
        const res = await api.get('/legajos/colaboradores-adultos?cicloAnio=2026');
        setColaboradores(res.data);
      }
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudieron cargar los datos.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  // Gestores de Planes de Cuota Mensual
  const handleCrearPlan = () => {
    setPlanAEditar(null);
    setModalPlanAbierto(true);
  };

  const handleEditarPlan = (plan: any) => {
    setPlanAEditar(plan);
    setModalPlanAbierto(true);
  };

  const handleSolicitarEliminarPlan = (plan: any) => {
    const cobrado = Number(plan.recaudacion?.totalRecaudado ?? plan.resumenRecaudacion?.totalRecaudado ?? 0);
    setModalConf({
      abierto: true,
      titulo: 'Eliminar Cuadro de Cuota',
      mensaje:
        cobrado > 0
          ? `¿Deseas eliminar "${plan.nombre}"? Los ${formatearMoneda(cobrado)} que ya habían sido abonados por las familias pasarán automáticamente a su Saldo a Favor.`
          : `¿Deseas eliminar "${plan.nombre}" y todas sus cuotas pendientes?`,
      tipo: 'peligro',
      textoConfirmar: 'Sí, eliminar',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        const planAEliminar = { ...plan };
        try {
          await api.delete(`/tesoreria/planes-mensuales/${plan.id}`);
          setModalConf(null);
          await cargarDatos();

          mostrarToastConDeshacer(
            `Cuadro "${planAEliminar.nombre}" eliminado.`,
            async () => {
              try {
                const meses = Array.isArray(planAEliminar.mesesHabilitadosJson)
                  ? planAEliminar.mesesHabilitadosJson
                  : Array.isArray(planAEliminar.mesesHabilitados)
                  ? planAEliminar.mesesHabilitados
                  : [];

                await api.post('/tesoreria/planes-mensuales', {
                  nombre: planAEliminar.nombre,
                  montoMensual: Number(planAEliminar.montoMensual || planAEliminar.montoBase || 0),
                  cicloAnio: planAEliminar.cicloAnio,
                  diaVencimiento: planAEliminar.diaVencimiento || 10,
                  mesesHabilitados: meses,
                  destinatarioTipo: planAEliminar.destinatarioTipo || 'PROTAGONISTAS',
                  unidadId: planAEliminar.unidadId || undefined,
                  rubroId: planAEliminar.rubroId || undefined,
                  permiteDescuentoHermanos: planAEliminar.permiteDescuentoHermanos ?? true,
                  porcentajeDescuentoHermanos: planAEliminar.porcentajeDescuentoHermanos ? Number(planAEliminar.porcentajeDescuentoHermanos) : undefined,
                  excepcionesIds: Array.isArray(planAEliminar.excepcionesJson) ? planAEliminar.excepcionesJson : [],
                });
                await cargarDatos();
                useToastStore.getState().mostrarToast(`Cuadro "${planAEliminar.nombre}" restaurado.`);
              } catch (err) {
                useToastStore.getState().mostrarToast(traducirErrorAmigable(err, 'No se pudo restaurar el cuadro.'), 'error');
              }
            },
          );
        } catch (err) {
          setModalConf(null);
          mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el cuadro de cuota.'), 'error');
        }
      },
    });
  };

  // Acción 1-Tap para habilitar o desmarcar mes en el cuadro anual
  const handleToggleMesPlan = async (plan: any, mesNum: number) => {
    const mesesActuales: number[] = Array.isArray(plan.mesesHabilitadosJson) ? plan.mesesHabilitadosJson : [];
    const estaHabilitado = mesesActuales.includes(mesNum);
    const claveLoading = `${plan.id}-${mesNum}`;

    setSincronizandoPlanId(claveLoading);
    try {
      const nuevosMeses = estaHabilitado
        ? mesesActuales.filter((m) => m !== mesNum)
        : [...mesesActuales, mesNum].sort((a, b) => a - b);

      await api.post(`/tesoreria/planes-mensuales/${plan.id}/sincronizar-meses`, {
        mesesHabilitados: nuevosMeses,
      });
      mostrarToast(
        estaHabilitado
          ? `${NOMBRES_MESES_LARGOS[mesNum]} desmarcado (los pagos realizados pasaron a Saldo a Favor).`
          : `Cuota de ${NOMBRES_MESES_LARGOS[mesNum]} habilitada.`,
      );
      await cargarDatos();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo actualizar el mes.'), 'error');
    } finally {
      setSincronizandoPlanId(null);
    }
  };

  const handleCrearCobroEspecial = () => {
    setConceptoAEditar(null);
    setModalCampamentoAbierto(true);
  };

  const handleEditarConcepto = (con: any) => {
    setConceptoAEditar(con);
    setModalCampamentoAbierto(true);
  };

  const handleSolicitarEliminarConcepto = (con: any) => {
    const cobrado = Number(con.recaudacion?.totalRecaudado ?? con.resumenRecaudacion?.totalRecaudado ?? 0);
    setModalConf({
      abierto: true,
      titulo: 'Eliminar Cobro / Campamento',
      mensaje:
        cobrado > 0
          ? `¿Seguro que deseas eliminar "${con.nombre}"? Los ${formatearMoneda(cobrado)} abonados por los miembros pasarán automáticamente a su Saldo a Favor.`
          : `¿Seguro que deseas eliminar "${con.nombre}" y anular las deudas pendientes?`,
      tipo: 'peligro',
      textoConfirmar: 'Sí, eliminar',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        const conAEliminar = { ...con };
        try {
          await api.delete(`/tesoreria/conceptos/${con.id}`);
          setModalConf(null);
          await cargarDatos();

          mostrarToastConDeshacer(
            `"${conAEliminar.nombre}" eliminado.`,
            async () => {
              try {
                await api.post('/tesoreria/conceptos', {
                  nombre: conAEliminar.nombre,
                  tipo: conAEliminar.tipo,
                  montoBase: Number(conAEliminar.montoBase),
                  cicloAnio: conAEliminar.cicloAnio,
                  fechaVencimiento: conAEliminar.fechaVencimiento ? String(conAEliminar.fechaVencimiento).slice(0, 10) : undefined,
                  permiteDescuentoHermanos: conAEliminar.permiteDescuentoHermanos ?? true,
                  porcentajeDescuentoHermanos: conAEliminar.porcentajeDescuentoHermanos ? Number(conAEliminar.porcentajeDescuentoHermanos) : undefined,
                  esParaEducadores: conAEliminar.esParaEducadores ?? false,
                  destinatarioTipo: conAEliminar.destinatarioTipo || 'TODOS',
                  excepcionesIds: Array.isArray(conAEliminar.excepcionesJson) ? conAEliminar.excepcionesJson : [],
                  rubroId: conAEliminar.rubroId || undefined,
                  unidadId: conAEliminar.unidadId || undefined,
                  generarCargosInmediatos: true,
                });
                await cargarDatos();
                useToastStore.getState().mostrarToast(`"${conAEliminar.nombre}" restaurado.`);
              } catch (err) {
                useToastStore.getState().mostrarToast(traducirErrorAmigable(err, 'No se pudo restaurar el concepto.'), 'error');
              }
            },
          );
        } catch (err) {
          setModalConf(null);
          mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el concepto.'), 'error');
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-paper text-ink pb-24 sm:pb-10 transition-colors">
      <Navbar />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Cabecera Compacta con Pestañas Táctiles */}
        <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-rule shadow-xs space-y-3 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand shrink-0" />
              <h1 className="text-lg sm:text-xl font-extrabold text-ink">
                Jefatura y Tesorería
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {puedeVerTesoreria && (
              <button
                onClick={() => setTab('tesoreria')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'tesoreria'
                    ? 'bg-brand text-brand-contrast shadow-2xs'
                    : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                Tesorería
              </button>
            )}
            {puedeVerColaboradores && (
              <button
                onClick={() => setTab('colaboradores')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'colaboradores'
                    ? 'bg-brand text-brand-contrast shadow-2xs'
                    : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                Familias Voluntarias
              </button>
            )}
            {puedeVerOrganizacion && (
              <button
                onClick={() => setTab('organizacion')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'organizacion'
                    ? 'bg-brand text-brand-contrast shadow-2xs'
                    : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                Ramas y Edades
              </button>
            )}
            {puedeVerRoles && (
              <button
                onClick={() => setTab('roles')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'roles'
                    ? 'bg-brand text-brand-contrast shadow-2xs'
                    : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                Roles y Permisos
              </button>
            )}
            {puedeVerPases && (
              <button
                onClick={() => setTab('pases')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'pases'
                    ? 'bg-brand text-brand-contrast shadow-2xs'
                    : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                Pases por Camada
              </button>
            )}
            {puedeVerPlantillas && (
              <button
                onClick={() => setTab('plantillas')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'plantillas'
                    ? 'bg-brand text-brand-contrast shadow-2xs'
                    : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                Formularios y Fichas
              </button>
            )}
          </div>
        </div>

        {/* TAB 2: TESORERÍA */}
        {tab === 'tesoreria' && (
          <div className="bg-surface rounded-2xl border border-rule shadow-xs p-4 sm:p-6 space-y-5 transition-colors">
            {/* Sub-pestañas de Tesorería */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-rule pb-3">
              {puedeVerCaja && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('caja-banco')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'caja-banco'
                      ? 'bg-brand/10 text-brand border border-brand/30'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Landmark className="w-4 h-4" />
                  <span>Caja y Banco</span>
                </button>
              )}

              {puedeVerGastos && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('gastos')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'gastos'
                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  <span>Gastos / Egresos</span>
                </button>
              )}

              {puedeVerBalance && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('balance')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'balance'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Scale className="w-4 h-4" />
                  <span>Balance de Resultados</span>
                </button>
              )}

              {puedeVerEventos && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('eventos-qr')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'eventos-qr'
                      ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Eventos Económicos (QR)</span>
                </button>
              )}

              {puedeVerPlanes && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('planes')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'planes'
                      ? 'bg-brand/10 text-brand border border-brand/30'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Cuotas Mensuales ({planesMensuales.length})</span>
                </button>
              )}

              {puedeVerCampamentos && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('campamentos')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'campamentos'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Tent className="w-4 h-4" />
                  <span>Campamentos y Cobros Especiales</span>
                </button>
              )}

              {puedeVerFamilias && (
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('familias')}
                  className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                    subTabTesoreria === 'familias'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                      : 'text-ink-muted hover:bg-paper-2 hover:text-ink'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Descuento Hermanos ({familias.length})</span>
                </button>
              )}

              {puedeGestionarTesoreria && (
                <button
                  type="button"
                  onClick={() => setModalGestionRubrosAbierto(true)}
                  className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition cursor-pointer sm:ml-auto shrink-0"
                  title="Gestionar todos los rubros contables de ingresos y egresos"
                >
                  <Tag className="w-4 h-4" />
                  <span>Rubros Contables</span>
                </button>
              )}
            </div>

            {/* SUB-TAB 0: CAJA Y BANCO (LIBRO DIARIO) */}
            {subTabTesoreria === 'caja-banco' && (
              <PanelTesoreriaCajaBanco onToast={mostrarToast} />
            )}

            {/* SUB-TAB 0.5: GASTOS Y EGRESOS */}
            {subTabTesoreria === 'gastos' && (
              <PanelGastosTesoreria onToast={mostrarToast} />
            )}

            {/* SUB-TAB 0.7: BALANCE Y CUADRO DE RESULTADOS */}
            {subTabTesoreria === 'balance' && (
              <PanelCuadroResultados onToast={mostrarToast} />
            )}

            {/* SUB-TAB 0.8: EVENTOS ECONÓMICOS Y VALES QR */}
            {subTabTesoreria === 'eventos-qr' && (
              <PanelEventosEconomicos onToast={mostrarToast} />
            )}

            {/* SUB-TAB 1: PLANES DE CUOTA MENSUAL */}
            {subTabTesoreria === 'planes' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center gap-2">
                  <p className="text-xs text-ink-muted">
                    Toca un mes para habilitar o desactivar su cobro en el grupo.
                  </p>
                  {puedeGestionarTesoreria && (
                    <button
                      onClick={handleCrearPlan}
                      className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-brand-contrast hover:opacity-95 font-extrabold text-xs cursor-pointer transition-colors shadow-2xs shrink-0"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Nueva Cuota</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {planesMensuales.map((plan) => {
                    const mesesHabilitados: number[] = Array.isArray(plan.mesesHabilitadosJson)
                      ? plan.mesesHabilitadosJson
                      : [];
                    const excepciones: number[] = Array.isArray(plan.excepcionesJson) ? plan.excepcionesJson : [];
                    const rec = plan.recaudacion;

                    return (
                      <div
                        key={plan.id}
                        className="p-4 sm:p-5 rounded-2xl border border-rule bg-paper-2 flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <h4 className="font-extrabold text-ink text-base leading-snug">
                                {plan.nombre}
                              </h4>
                              <p className="text-xs text-ink-muted mt-0.5">
                                {plan.unidad ? plan.unidad.nombre : 'Todo el Grupo Scout'} •{' '}
                                {plan.destinatarioTipo === 'EDUCADORES'
                                  ? 'Educadores'
                                  : plan.destinatarioTipo === 'PROTAGONISTAS'
                                    ? 'Protagonistas'
                                    : 'Todos'}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-lg font-black text-ink block">
                                {formatearMoneda(plan.montoMensual)}
                              </span>
                              <span className="text-[10px] text-ink-muted font-medium">por mes</span>
                            </div>
                          </div>

                          {/* CASILLEROS DE MESES DEL AÑO (1 al 12) */}
                          <div className="w-full pt-1">
                            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 sm:gap-1.5">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                              const activo = mesesHabilitados.includes(num);
                              const cargandoMes = sincronizandoPlanId === `${plan.id}-${num}`;
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  disabled={!puedeGestionarTesoreria || cargandoMes}
                                  onClick={() => puedeGestionarTesoreria && handleToggleMesPlan(plan, num)}
                                  className={`min-h-[38px] sm:min-h-[42px] py-1 sm:py-1.5 px-0.5 sm:px-1 rounded-xl text-center font-bold text-[10px] sm:text-[11px] transition flex flex-col items-center justify-center gap-0.5 border ${
                                    !puedeGestionarTesoreria ? 'cursor-default' : 'cursor-pointer'
                                  } ${
                                    activo
                                      ? 'bg-brand text-brand-contrast border-brand font-extrabold shadow-2xs hover:opacity-90'
                                      : 'bg-surface text-ink-muted border-rule hover:border-brand'
                                  }`}
                                >
                                  <span>{NOMBRES_MESES_CORTOS[num]}</span>
                                  {cargandoMes ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : activo ? (
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  ) : (
                                    <span className="text-[9px] opacity-40">·</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                          {/* Métricas de Recaudación */}
                          {rec && rec.totalCargos > 0 && (
                            <div className="p-3 rounded-xl bg-surface border border-rule space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-ink-muted">
                                  Cobrado:{' '}
                                  <strong className="text-ink">
                                    {formatearMoneda(rec.totalRecaudado)}
                                  </strong>
                                </span>
                                <span className="text-ink-muted">
                                  Pendiente:{' '}
                                  <strong className="text-rose-600 dark:text-rose-400">
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
                              <div className="flex items-center justify-between text-[11px] text-ink-muted">
                                <span>
                                  {rec.cargosPagados} de {rec.totalCargos} cuotas al día
                                </span>
                                <span className="font-bold text-ink">
                                  {rec.porcentajeCobrado}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Footer Card */}
                        <div className="pt-3 border-t border-rule flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ink-muted">
                            {mesesHabilitados.length} de 12 meses activos
                            {excepciones.length > 0 && ` • ${excepciones.length} becados`}
                          </span>

                          {puedeGestionarTesoreria && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditarPlan(plan)}
                                className="min-h-[38px] py-1.5 px-3 rounded-xl bg-surface border border-rule text-ink font-bold text-xs transition flex items-center gap-1.5 cursor-pointer hover:bg-paper-2"
                              >
                                <Pencil className="w-3.5 h-3.5 text-ink-muted" />
                                <span>Editar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSolicitarEliminarPlan(plan)}
                                className="min-h-[38px] py-1.5 px-3 rounded-xl bg-surface border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer hover:bg-paper-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {planesMensuales.length === 0 && !cargando && (
                    <div className="col-span-full py-10 text-center text-sm text-ink-muted">
                      No hay cuadros de cuota mensual creados.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: CAMPAMENTOS Y EVENTOS */}
            {subTabTesoreria === 'campamentos' && (
              <div className="space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <p className="text-xs text-ink-muted">
                    Creá o editá campamentos, eventos, inscripciones o indumentaria para el grupo o una sección.
                  </p>
                  {puedeGestionarTesoreria && (
                    <button
                      onClick={handleCrearCobroEspecial}
                      className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer transition shadow-xs"
                    >
                      <Tent className="w-4 h-4" />
                      <span>Nuevo Campamento / Cobro</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {conceptos
                    .filter((con) => !con.planCuotaMensualId)
                    .map((con) => {
                      const rec = con.recaudacion;
                      const excepciones: number[] = Array.isArray(con.excepcionesJson)
                        ? con.excepcionesJson
                        : [];

                      return (
                        <div
                          key={con.id}
                          className="p-4 rounded-2xl border border-rule bg-paper-2 flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h3 className="font-bold text-ink text-sm">
                                  {con.nombre}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted mt-0.5">
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
                              <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 shrink-0">
                                {formatearMoneda(con.montoBase)}
                              </span>
                            </div>

                            {con.fechaVencimiento && (
                              <div className="flex items-center gap-1 text-[11px] text-brand font-semibold">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  Vence: {new Date(con.fechaVencimiento).toLocaleDateString('es-AR')}
                                </span>
                              </div>
                            )}

                            {/* Métricas de Recaudación del Evento */}
                            {rec && (
                              <div className="p-3 rounded-xl bg-surface border border-rule space-y-1.5 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-ink-muted">
                                    Cobrado:{' '}
                                    <strong className="text-ink">
                                      {formatearMoneda(rec.totalRecaudado)}
                                    </strong>
                                  </span>
                                  <span className="text-ink-muted">
                                    Falta:{' '}
                                    <strong className="text-rose-600 dark:text-rose-400">
                                      {formatearMoneda(rec.totalPendiente)}
                                    </strong>
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${Math.min(100, rec.porcentajeCobrado || 0)}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-ink-muted">
                                  <span>
                                    {rec.cargosPagados} de {rec.totalCargos} pagados
                                  </span>
                                  <span className="font-bold text-blue-600 dark:text-blue-400">
                                    {rec.porcentajeCobrado}%
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {puedeGestionarTesoreria && (
                            <div className="pt-3 border-t border-rule flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditarConcepto(con)}
                                className="flex-1 min-h-[38px] py-1.5 px-3 rounded-xl bg-surface border border-rule text-ink font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-paper-2"
                              >
                                <Pencil className="w-3.5 h-3.5 text-ink-muted" />
                                <span>Editar / Exentos</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSolicitarEliminarConcepto(con)}
                                className="min-h-[38px] p-2 rounded-xl bg-surface border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 cursor-pointer hover:bg-paper-2"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {conceptos.filter((con) => !con.planCuotaMensualId).length === 0 && !cargando && (
                    <div className="col-span-full py-10 text-center text-sm text-ink-muted">
                      No hay cobros de campamento ni eventos especiales.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: GRUPOS FAMILIARES Y DESCUENTO POR HERMANOS */}
            {subTabTesoreria === 'familias' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {familias.map((fam) => {
                  const pct = Number(fam.porcentajeDescuentoHermanos ?? 0);
                  const miembros = fam.miembros || [];
                  return (
                    <div
                      key={fam.id}
                      className="p-4 rounded-2xl border border-rule bg-surface flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-extrabold text-ink text-sm">
                              {fam.nombreFamilia}
                            </h4>
                            <span className="text-xs text-ink-muted">
                              {miembros.length} {miembros.length === 1 ? 'integrante' : 'hermanos'}
                            </span>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
                              pct > 0
                                ? 'bg-brand/10 text-brand border-brand/30'
                                : 'bg-paper-2 text-ink-muted border-rule'
                            }`}
                          >
                            {pct > 0 ? `${pct}% Desc.` : 'Sin desc.'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {miembros.map((m: any) => {
                            const uNombre = m.asignaciones?.[0]?.unidad?.nombre || 'Sin rama';
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setTabInicialDetalle('cuotas');
                                  setMiembroDetalleId(m.id);
                                }}
                                className="w-full p-2 rounded-xl bg-paper-2 hover:bg-brand/10 flex items-center justify-between text-xs cursor-pointer transition text-left"
                              >
                                <span className="font-bold text-ink truncate">
                                  {m.nombre} {m.apellido}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-paper-3 text-ink-2 text-[10px] font-semibold shrink-0">
                                  {uNombre}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {puedeGestionarTesoreria && (
                        <button
                          type="button"
                          onClick={() => {
                            setFamiliaAEditar(fam);
                            setModalFamiliaAbierto(true);
                          }}
                          className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-paper-2 hover:bg-surface text-ink font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-rule"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar Grupo / Descuento</span>
                        </button>
                      )}
                    </div>
                  );
                })}

                {familias.length === 0 && !cargando && (
                  <div className="col-span-full py-10 text-center text-sm text-ink-muted">
                    No hay grupos familiares con hermanos registrados aún.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ORGANIZACIÓN (Panel de administración de Ramas y Secciones) */}
        {tab === 'organizacion' && (
          <PanelAdminRamas
            ramas={ramas}
            unidades={unidades}
            mostrarInactivas={mostrarInactivasOrg}
            onToggleMostrarInactivas={setMostrarInactivasOrg}
            onRecargar={cargarDatos}
            onToast={mostrarToast}
          />
        )}

        {/* TAB 3B: GESTIÓN DE ROLES, ALCANCES Y PERMISOS */}
        {tab === 'roles' && (
          <PanelGestorRoles
            roles={roles}
            permisosCatalogo={permisosCatalogo}
            onRecargar={async () => {
              await cargarDatos();
              await refrescarSesionDesdeServidor();
            }}
            onToast={mostrarToast}
          />
        )}

        {/* TAB 4: COLABORADORES Y RECURSOS DE FAMILIAS */}
        {tab === 'colaboradores' && (
          <div className="space-y-4">
            {colaboradores.length === 0 ? (
              <div className="bg-surface rounded-2xl p-10 text-center border border-rule text-ink-muted">
                <HeartHandshake className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold text-ink-2">
                  Aún no hay familias voluntarias registradas este año.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {colaboradores.map((col, idx) => (
                  <div
                    key={col.entregaId || idx}
                    className="bg-surface rounded-2xl p-4 sm:p-5 border border-rule shadow-xs space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-sm text-ink">
                          {col.adulto.nombre}
                        </h3>
                        <p className="text-xs text-ink-muted">
                          {col.adulto.profesion} • Familia de{' '}
                          <strong className="text-brand">
                            {col.protagonista.nombre} {col.protagonista.apellido}
                          </strong>{' '}
                          ({col.protagonista.unidad})
                        </p>
                      </div>
                      {col.adulto.telefono && col.adulto.telefono !== '-' && (
                        <a
                          href={`tel:${col.adulto.telefono}`}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand/10 text-brand border border-brand/30 font-bold text-xs flex items-center gap-1.5 shrink-0 hover:bg-brand/20 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Llamar</span>
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {col.areas.cocinaCampamento && (
                        <span className="text-[11px] bg-brand/10 text-brand border border-brand/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                          <Utensils className="w-3 h-3" /> Cocina
                        </span>
                      )}
                      {col.areas.campamento && (
                        <span className="text-[11px] bg-paper-2 text-ink border border-rule px-2 py-0.5 rounded-md font-medium">
                          Apoyo en Campamento
                        </span>
                      )}
                      {(col.areas.transporte || col.areas.camion || col.areas.camioneta || col.areas.colectivo) && (
                        <span className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                          <Truck className="w-3 h-3" /> Transporte
                        </span>
                      )}
                      {col.areas.manoObra && (
                        <span className="text-[11px] bg-paper-2 text-ink px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                          <Wrench className="w-3 h-3" /> Mantenimiento
                        </span>
                      )}
                      {col.areas.ensenando && (
                        <span className="text-[11px] bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md font-medium">
                          Talleres
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: PASES SUGERIDOS POR CAMADA */}
        {tab === 'pases' && (
          <PanelPasesPorCamada
            candidatos={candidatos}
            unidades={unidades}
            onRecargar={cargarDatos}
            onToast={mostrarToast}
            onAbrirMiembro={(id) => {
              setTabInicialDetalle('pase');
              setMiembroDetalleId(id);
            }}
          />
        )}

        {/* TAB 6: FORMULARIOS Y FICHAS OFICIALES */}
        {tab === 'plantillas' && (
          <PanelAdminPlantillas onToast={mostrarToast} />
        )}
      </main>

      <ModalPlanCuotaMensual
        abierto={modalPlanAbierto}
        planAEditar={planAEditar}
        unidades={unidades}
        onCerrar={() => {
          setModalPlanAbierto(false);
          setPlanAEditar(null);
        }}
        onGuardado={() => {
          mostrarToast('Cuadro de cuota mensual guardado.');
          cargarDatos();
        }}
      />

      <ModalCobroCampamento
        abierto={modalCampamentoAbierto}
        conceptoAEditar={conceptoAEditar}
        unidades={unidades}
        onCerrar={() => {
          setModalCampamentoAbierto(false);
          setConceptoAEditar(null);
        }}
        onGenerado={(mensaje) => {
          mostrarToast(mensaje);
          cargarDatos();
        }}
      />

      {modalFamiliaAbierto && familiaAEditar && (
        <ModalEditarFamilia
          abierto={modalFamiliaAbierto}
          familia={familiaAEditar}
          onCerrar={() => {
            setModalFamiliaAbierto(false);
            setFamiliaAEditar(null);
          }}
          onGuardado={() => {
            mostrarToast('Grupo familiar actualizado.');
            cargarDatos();
          }}
        />
      )}

      {miembroDetalleId !== null && (
        <ModalDetalleMiembro
          usuarioId={miembroDetalleId}
          tabInicial={tabInicialDetalle}
          onCerrar={() => setMiembroDetalleId(null)}
          onActualizado={() => {
            cargarDatos();
          }}
        />
      )}

      <ModalGestionRubros
        abierto={modalGestionRubrosAbierto}
        onCerrar={() => setModalGestionRubrosAbierto(false)}
        onRubrosCambiados={cargarDatos}
      />

      {modalConf && (
        <ModalConfirmacion
          abierto={modalConf.abierto}
          titulo={modalConf.titulo}
          mensaje={modalConf.mensaje}
          tipo={modalConf.tipo}
          textoConfirmar={modalConf.textoConfirmar}
          textoCancelar={modalConf.textoCancelar}
          cargando={modalConf.cargando}
          onCerrar={modalConf.onCerrar}
          onConfirmar={modalConf.onConfirmar}
        />
      )}
    </div>
  );
};
