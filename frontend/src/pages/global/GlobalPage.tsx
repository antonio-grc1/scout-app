import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
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
import {
  NOMBRES_MESES_CORTOS,
  NOMBRES_MESES_LARGOS,
  formatearMoneda,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  Shield,
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
  Check,
  Loader2,
  X,
  FileText,
} from 'lucide-react';

export const GlobalPage: React.FC = () => {
  const { tienePermiso, refrescarSesionDesdeServidor } = useAuthStore();
  const puedeVerTesoreria = tienePermiso('tesoreria.gestionar') || tienePermiso('cuotas.ver');
  const puedeGestionarTesoreria = tienePermiso('tesoreria.gestionar');
  const puedeVerColaboradores = tienePermiso('legajos.ver');
  const puedeVerOrganizacion = tienePermiso('organizacion.ver') || tienePermiso('organizacion.gestionar');
  const puedeVerRoles = tienePermiso('organizacion.gestionar') || tienePermiso('organizacion.ver');
  const puedeVerPases = tienePermiso('pases.ver') || tienePermiso('pases.ejecutar');
  const puedeVerPlantillas = tienePermiso('legajos.plantillas_gestionar') || tienePermiso('legajos.ver');

  const tabPorDefecto = (): 'tesoreria' | 'colaboradores' | 'organizacion' | 'roles' | 'pases' | 'plantillas' => {
    if (puedeVerTesoreria) return 'tesoreria';
    if (puedeVerRoles) return 'roles';
    if (puedeVerOrganizacion) return 'organizacion';
    if (puedeVerPlantillas) return 'plantillas';
    if (puedeVerPases) return 'pases';
    return 'colaboradores';
  };

  const [tab, setTab] = useState<'tesoreria' | 'colaboradores' | 'organizacion' | 'roles' | 'pases' | 'plantillas'>(tabPorDefecto);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [planesMensuales, setPlanesMensuales] = useState<any[]>([]);
  const [familias, setFamilias] = useState<any[]>([]);
  const [subTabTesoreria, setSubTabTesoreria] = useState<'planes' | 'campamentos' | 'familias'>('planes');
  const [ramas, setRamas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [mostrarInactivasOrg, setMostrarInactivasOrg] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [permisosCatalogo, setPermisosCatalogo] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sincronizandoPlanId, setSincronizandoPlanId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null);

  // Estados de Modales
  const [conceptoAEditar, setConceptoAEditar] = useState<any | null>(null);
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [planAEditar, setPlanAEditar] = useState<any | null>(null);
  const [modalCampamentoAbierto, setModalCampamentoAbierto] = useState(false);
  const [modalFamiliaAbierto, setModalFamiliaAbierto] = useState(false);
  const [familiaAEditar, setFamiliaAEditar] = useState<any | null>(null);
  const [miembroDetalleId, setMiembroDetalleId] = useState<number | null>(null);
  const [modalConf, setModalConf] = useState<ModalConfirmacionProps | null>(null);

  const mostrarToast = (texto: string, tipo: 'exito' | 'error' = 'exito') => {
    setToast({ texto, tipo });
    setTimeout(() => {
      setToast((prev) => (prev?.texto === texto ? null : prev));
    }, 3500);
  };

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
          api.get('/tesoreria/planes-mensuales?cicloAnio=2026').catch(() => ({ data: [] })),
          api.get('/tesoreria/conceptos?cicloAnio=2026').catch(() => ({ data: [] })),
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
    const cobrado = Number(plan.recaudacion?.totalRecaudado ?? 0);
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
        try {
          const res = await api.delete(`/tesoreria/planes-mensuales/${plan.id}`);
          setModalConf(null);
          mostrarToast(res.data?.mensaje || `Cuadro "${plan.nombre}" eliminado.`);
          cargarDatos();
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
    const cobrado = Number(con.recaudacion?.totalRecaudado ?? 0);
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
        try {
          const res = await api.delete(`/tesoreria/conceptos/${con.id}`);
          setModalConf(null);
          mostrarToast(res.data?.mensaje || `"${con.nombre}" eliminado.`);
          cargarDatos();
        } catch (err) {
          setModalConf(null);
          mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el concepto.'), 'error');
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 sm:pb-10 transition-colors">
      <Navbar />

      {/* Toast flotante */}
      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div
            className={`p-3.5 rounded-2xl shadow-lg border flex items-center justify-between gap-3 text-xs font-bold ${
              toast.tipo === 'exito'
                ? 'bg-emerald-900 text-white border-emerald-700'
                : 'bg-rose-900 text-white border-rose-700'
            }`}
          >
            <span className="leading-snug">{toast.texto}</span>
            <button onClick={() => setToast(null)} className="p-1 opacity-80 hover:opacity-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Cabecera Compacta con Pestañas Táctiles */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Jefatura y Tesorería
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {puedeVerTesoreria && (
              <button
                onClick={() => setTab('tesoreria')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'tesoreria'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Tesorería
              </button>
            )}
            {puedeVerColaboradores && (
              <button
                onClick={() => setTab('colaboradores')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'colaboradores'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Familias Voluntarias
              </button>
            )}
            {puedeVerOrganizacion && (
              <button
                onClick={() => setTab('organizacion')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'organizacion'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Ramas y Edades
              </button>
            )}
            {puedeVerRoles && (
              <button
                onClick={() => setTab('roles')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'roles'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Roles y Permisos
              </button>
            )}
            {puedeVerPases && (
              <button
                onClick={() => setTab('pases')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'pases'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Pases por Camada
              </button>
            )}
            {puedeVerPlantillas && (
              <button
                onClick={() => setTab('plantillas')}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  tab === 'plantillas'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                Formularios y Fichas
              </button>
            )}
          </div>
        </div>

        {/* TAB 2: TESORERÍA */}
        {tab === 'tesoreria' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-6 space-y-5 transition-colors">
            {/* Sub-pestañas de Tesorería */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setSubTabTesoreria('planes')}
                className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  subTabTesoreria === 'planes'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Cuotas Mensuales ({planesMensuales.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSubTabTesoreria('campamentos')}
                className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  subTabTesoreria === 'campamentos'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Tent className="w-4 h-4" />
                <span>Campamentos y Eventos</span>
              </button>

              <button
                type="button"
                onClick={() => setSubTabTesoreria('familias')}
                className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  subTabTesoreria === 'familias'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Descuento Hermanos ({familias.length})</span>
              </button>
            </div>

            {/* SUB-TAB 1: PLANES DE CUOTA MENSUAL */}
            {subTabTesoreria === 'planes' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center gap-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Toca un mes para habilitar o desactivar su cobro en el grupo.
                  </p>
                  {puedeGestionarTesoreria && (
                    <button
                      onClick={handleCrearPlan}
                      className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer transition shadow-xs shrink-0"
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
                        className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-snug">
                                {plan.nombre}
                              </h4>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {plan.unidad ? plan.unidad.nombre : 'Todo el Grupo Scout'} •{' '}
                                {plan.destinatarioTipo === 'EDUCADORES'
                                  ? 'Educadores'
                                  : plan.destinatarioTipo === 'PROTAGONISTAS'
                                    ? 'Protagonistas'
                                    : 'Todos'}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 block">
                                {formatearMoneda(plan.montoMensual)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">por mes</span>
                            </div>
                          </div>

                          {/* CASILLEROS DE MESES DEL AÑO (1 al 12) */}
                          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                              const activo = mesesHabilitados.includes(num);
                              const cargandoMes = sincronizandoPlanId === `${plan.id}-${num}`;
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  disabled={!puedeGestionarTesoreria || cargandoMes}
                                  onClick={() => puedeGestionarTesoreria && handleToggleMesPlan(plan, num)}
                                  className={`min-h-[42px] py-1.5 px-1 rounded-xl text-center font-bold text-[11px] transition flex flex-col items-center justify-center gap-0.5 border ${
                                    !puedeGestionarTesoreria ? 'cursor-default' : 'cursor-pointer'
                                  } ${
                                    activo
                                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-700'
                                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
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

                          {/* Métricas de Recaudación */}
                          {rec && rec.totalCargos > 0 && (
                            <div className="p-3 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 dark:text-slate-400">
                                  Cobrado:{' '}
                                  <strong className="text-emerald-600 dark:text-emerald-400">
                                    {formatearMoneda(rec.totalRecaudado)}
                                  </strong>
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  Pendiente:{' '}
                                  <strong className="text-rose-600 dark:text-rose-400">
                                    {formatearMoneda(rec.totalPendiente)}
                                  </strong>
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, rec.porcentajeCobrado || 0)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>
                                  {rec.cargosPagados} de {rec.totalCargos} cuotas al día
                                </span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {rec.porcentajeCobrado}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Footer Card */}
                        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {mesesHabilitados.length} de 12 meses activos
                            {excepciones.length > 0 && ` • ${excepciones.length} becados`}
                          </span>

                          {puedeGestionarTesoreria && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditarPlan(plan)}
                                className="min-h-[38px] py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>Editar</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSolicitarEliminarPlan(plan)}
                                className="min-h-[38px] py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
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
                    <div className="col-span-full py-10 text-center text-sm text-slate-400">
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
                          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between gap-4"
                        >
                          <div className="space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                  {con.nombre}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
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
                              <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  Vence: {new Date(con.fechaVencimiento).toLocaleDateString('es-AR')}
                                </span>
                              </div>
                            )}

                            {/* Métricas de Recaudación del Evento */}
                            {rec && (
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Cobrado:{' '}
                                    <strong className="text-emerald-600 dark:text-emerald-400">
                                      {formatearMoneda(rec.totalRecaudado)}
                                    </strong>
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Falta:{' '}
                                    <strong className="text-rose-600 dark:text-rose-400">
                                      {formatearMoneda(rec.totalPendiente)}
                                    </strong>
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, rec.porcentajeCobrado || 0)}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-400">
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
                            <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditarConcepto(con)}
                                className="flex-1 min-h-[38px] py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>Editar / Exentos</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSolicitarEliminarConcepto(con)}
                                className="min-h-[38px] p-2 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 cursor-pointer"
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
                    <div className="col-span-full py-10 text-center text-sm text-slate-400">
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
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                              {fam.nombreFamilia}
                            </h4>
                            <span className="text-xs text-slate-400">
                              {miembros.length} {miembros.length === 1 ? 'integrante' : 'hermanos'}
                            </span>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
                              pct > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
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
                                onClick={() => setMiembroDetalleId(m.id)}
                                className="w-full p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-emerald-50/70 dark:hover:bg-slate-700 flex items-center justify-between text-xs cursor-pointer transition text-left"
                              >
                                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {m.nombre} {m.apellido}
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold shrink-0">
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
                          className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar Grupo / Descuento</span>
                        </button>
                      )}
                    </div>
                  );
                })}

                {familias.length === 0 && !cargando && (
                  <div className="col-span-full py-10 text-center text-sm text-slate-400">
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
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800 text-slate-400">
                <HeartHandshake className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Aún no hay familias voluntarias registradas este año.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {colaboradores.map((col, idx) => (
                  <div
                    key={col.entregaId || idx}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {col.adulto.nombre}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {col.adulto.profesion} • Familia de{' '}
                          <strong className="text-emerald-700 dark:text-emerald-400">
                            {col.protagonista.nombre} {col.protagonista.apellido}
                          </strong>{' '}
                          ({col.protagonista.unidad})
                        </p>
                      </div>
                      {col.adulto.telefono && col.adulto.telefono !== '-' && (
                        <a
                          href={`tel:${col.adulto.telefono}`}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Llamar</span>
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {col.areas.cocinaCampamento && (
                        <span className="text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                          <Utensils className="w-3 h-3" /> Cocina
                        </span>
                      )}
                      {col.areas.campamento && (
                        <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                          Apoyo en Campamento
                        </span>
                      )}
                      {(col.areas.transporte || col.areas.camion || col.areas.camioneta || col.areas.colectivo) && (
                        <span className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                          <Truck className="w-3 h-3" /> Transporte
                        </span>
                      )}
                      {col.areas.manoObra && (
                        <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                          <Wrench className="w-3 h-3" /> Mantenimiento
                        </span>
                      )}
                      {col.areas.ensenando && (
                        <span className="text-[11px] bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 px-2 py-0.5 rounded-md font-medium">
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

        {/* TAB 5: PASES SUGERIDOS POR CAMADA (Corte al 30/06) */}
        {tab === 'pases' && (
          <PanelPasesPorCamada
            candidatos={candidatos}
            unidades={unidades}
            onRecargar={cargarDatos}
            onToast={mostrarToast}
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
          tabInicial="cuotas"
          onCerrar={() => setMiembroDetalleId(null)}
          onActualizado={() => {
            cargarDatos();
          }}
        />
      )}

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
