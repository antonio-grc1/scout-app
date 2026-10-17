import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Navbar } from '../../components/Navbar';
import { ModalConcepto, type ConceptoData } from '../../components/ModalConcepto';
import { ModalPlanCuotaMensual } from '../../components/ModalPlanCuotaMensual';
import { ModalCobroCampamento } from '../../components/ModalCobroCampamento';
import { ModalEditarFamilia } from '../../components/ModalEditarFamilia';
import { ModalConfirmacion, type ModalConfirmacionProps } from '../../components/ModalConfirmacion';
import {
  Shield,
  ArrowRightLeft,
  DollarSign,
  PlusCircle,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
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
  Sparkles,
} from 'lucide-react';

export const GlobalPage: React.FC = () => {
  const [tab, setTab] = useState<'pases' | 'tesoreria' | 'organizacion' | 'colaboradores'>('pases');
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [planesMensuales, setPlanesMensuales] = useState<any[]>([]);
  const [familias, setFamilias] = useState<any[]>([]);
  const [subTabTesoreria, setSubTabTesoreria] = useState<'planes' | 'campamentos' | 'familias'>('planes');
  const [ramas, setRamas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [notificacion, setNotificacion] = useState<string | null>(null);

  // Estados de Modales
  const [modalConceptoAbierto, setModalConceptoAbierto] = useState(false);
  const [conceptoAEditar, setConceptoAEditar] = useState<ConceptoData | null>(null);
  const [modalPlanAbierto, setModalPlanAbierto] = useState(false);
  const [planAEditar, setPlanAEditar] = useState<any | null>(null);
  const [modalCampamentoAbierto, setModalCampamentoAbierto] = useState(false);
  const [modalFamiliaAbierto, setModalFamiliaAbierto] = useState(false);
  const [familiaAEditar, setFamiliaAEditar] = useState<any | null>(null);
  const [modalConf, setModalConf] = useState<ModalConfirmacionProps | null>(null);

  useEffect(() => {
    cargarDatos();
  }, [tab]);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      if (tab === 'pases') {
        const res = await api.get('/pases/candidatos');
        setCandidatos(res.data);
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
        const [resRamas, resUnidades] = await Promise.all([
          api.get('/organizacion/ramas'),
          api.get('/organizacion/unidades'),
        ]);
        setRamas(resRamas.data);
        setUnidades(resUnidades.data);
      } else if (tab === 'colaboradores') {
        const res = await api.get('/legajos/colaboradores-adultos?cicloAnio=2026');
        setColaboradores(res.data);
      }
    } catch (err) {
      console.error('Error al cargar datos globales', err);
    } finally {
      setCargando(false);
    }
  };

  const mostrarAlerta = (
    titulo: string,
    mensaje: string | React.ReactNode,
    tipo: 'alerta' | 'peligro' | 'exito' | 'info' = 'alerta',
  ) => {
    setModalConf({
      abierto: true,
      titulo,
      mensaje,
      tipo,
      textoConfirmar: 'Entendido',
      textoCancelar: null,
      onCerrar: () => setModalConf(null),
      onConfirmar: () => setModalConf(null),
    });
  };

  const handleEjecutarPase = (candidato: any) => {
    let destino = candidato.unidadesDestino?.[0];
    if (!destino) {
      if (candidato.tipo === 'EGRESO') {
        const uSin = unidades.find(
          (u) => u.tipo === 'SIN_RAMA_APOYO' || u.nombre.toLowerCase().includes('sin rama') || u.nombre.toLowerCase().includes('apoyo'),
        );
        if (uSin) destino = uSin;
      }
    }

    if (!destino) {
      mostrarAlerta('Sin destino', 'No hay rama o sección destino configurada para este pase.', 'alerta');
      return;
    }

    const esEgreso = candidato.tipo === 'EGRESO';
    const titulo = esEgreso ? 'Confirmar Egreso a Educador' : 'Confirmar Pase de Rama';
    const mensaje = esEgreso
      ? `¿Confirmas el egreso de ${candidato.usuario.nombre} ${candidato.usuario.apellido} hacia ${destino.nombre}? Finalizará su etapa como protagonista y pasará al equipo de educadores.`
      : `¿Confirmas ejecutar el pase de ${candidato.usuario.nombre} ${candidato.usuario.apellido} a ${destino.nombre}? Se cerrará la asignación actual y se iniciará la nueva según el protocolo scout.`;

    setModalConf({
      abierto: true,
      titulo,
      mensaje,
      tipo: 'confirmacion',
      textoConfirmar: 'Ejecutar Pase',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          await api.post('/pases', {
            asignacionOrigenId: candidato.asignacionId,
            unidadDestinoId: destino.id,
          });
          setModalConf(null);
          setNotificacion(`Pase de ${candidato.usuario.nombre} a ${destino.nombre} ejecutado con éxito.`);
          cargarDatos();
        } catch (err: any) {
          setModalConf(null);
          mostrarAlerta('Error al ejecutar pase', err.response?.data?.message || 'Error al ejecutar pase.', 'peligro');
        }
      },
    });
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
    setModalConf({
      abierto: true,
      titulo: 'Eliminar Cuadro de Cuota Mensual',
      mensaje: `¿Estás seguro de que deseas eliminar el cuadro "${plan.nombre}"? Si alguno de sus meses ya cuenta con pagos registrados, la eliminación será rechazada para resguardar la consistencia contable.`,
      tipo: 'peligro',
      textoConfirmar: 'Eliminar Cuadro',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          await api.delete(`/tesoreria/planes-mensuales/${plan.id}`);
          setModalConf(null);
          setNotificacion(`Cuadro "${plan.nombre}" eliminado exitosamente.`);
          cargarDatos();
        } catch (err: any) {
          setModalConf(null);
          mostrarAlerta(
            'Error al eliminar cuadro',
            err.response?.data?.message || 'Error al eliminar cuadro de cuota mensual.',
            'peligro',
          );
        }
      },
    });
  };

  const handleToggleMesPlan = async (plan: any, mesNum: number) => {
    const mesesActuales: number[] = Array.isArray(plan.mesesHabilitadosJson) ? plan.mesesHabilitadosJson : [];
    const estaHabilitado = mesesActuales.includes(mesNum);
    const nombreMeses = [
      '',
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];

    if (!estaHabilitado) {
      // Habilitar mes y acumular deuda
      setModalConf({
        abierto: true,
        titulo: `Habilitar Cuota de ${nombreMeses[mesNum]}`,
        mensaje: `¿Deseas habilitar el mes de ${nombreMeses[mesNum]} en el cuadro "${plan.nombre}"? Se generará automáticamente la cuota y se acumulará la deuda de $${Number(plan.montoMensual).toFixed(2)} para todos los destinatarios configurados.`,
        tipo: 'confirmacion',
        textoConfirmar: 'Habilitar Mes y Acumular Deuda',
        textoCancelar: 'Cancelar',
        onCerrar: () => setModalConf(null),
        onConfirmar: async () => {
          try {
            const nuevosMeses = [...mesesActuales, mesNum].sort((a, b) => a - b);
            await api.post(`/tesoreria/planes-mensuales/${plan.id}/sincronizar-meses`, {
              mesesHabilitados: nuevosMeses,
            });
            setModalConf(null);
            setNotificacion(`Mes de ${nombreMeses[mesNum]} habilitado con éxito.`);
            cargarDatos();
          } catch (err: any) {
            setModalConf(null);
            mostrarAlerta(
              'Error al habilitar mes',
              err.response?.data?.message || 'Error al sincronizar meses del plan.',
              'peligro',
            );
          }
        },
      });
    } else {
      // Desmarcar mes
      try {
        const nuevosMeses = mesesActuales.filter((m) => m !== mesNum);
        await api.post(`/tesoreria/planes-mensuales/${plan.id}/sincronizar-meses`, {
          mesesHabilitados: nuevosMeses,
        });
        setNotificacion(`Mes de ${nombreMeses[mesNum]} desmarcado.`);
        cargarDatos();
      } catch (err: any) {
        mostrarAlerta(
          'Error al desmarcar mes',
          err.response?.data?.message || 'Error al desmarcar mes del cuadro.',
          'peligro',
        );
      }
    }
  };

  const handleCrearConcepto = () => {
    setConceptoAEditar(null);
    setModalConceptoAbierto(true);
  };

  const handleEditarConcepto = (con: any) => {
    setConceptoAEditar(con);
    setModalConceptoAbierto(true);
  };

  const handleSolicitarEliminarConcepto = (con: any) => {
    const tieneCargos = con._count?.cargos > 0;

    setModalConf({
      abierto: true,
      titulo: 'Eliminar Concepto de Cuota',
      mensaje: (
        <div className="space-y-2">
          <p>
            ¿Estás seguro de que deseas eliminar el concepto <strong>"{con.nombre}"</strong>?
          </p>
          {tieneCargos ? (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
              Atención: Este concepto tiene <strong>{con._count.cargos}</strong> cargo(s) asociados. Si ninguno tiene pagos registrados, se eliminarán en cascada. Si existen pagos registrados vinculados, la eliminación será rechazada.
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">Esta acción no se puede deshacer.</p>
          )}
        </div>
      ),
      tipo: 'peligro',
      textoConfirmar: 'Eliminar Concepto',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          await api.delete(`/tesoreria/conceptos/${con.id}`);
          setModalConf(null);
          setNotificacion(`Concepto "${con.nombre}" eliminado con éxito.`);
          cargarDatos();
        } catch (err: any) {
          setModalConf(null);
          mostrarAlerta(
            'No se pudo eliminar el concepto',
            err.response?.data?.message || 'Error al eliminar concepto.',
            'peligro',
          );
        }
      },
    });
  };

  const handleSolicitarGenerarCargos = (con: any) => {
    const destinatariosDesc = con.esParaEducadores
      ? 'todos los EDUCADORES del grupo'
      : con.unidad
        ? `los miembros de ${con.unidad.nombre}`
        : 'todos los miembros del grupo';

    let descDescuento = '';
    if (con.permiteDescuentoHermanos === false) {
      descDescuento = 'Sin descuento por hermanos (costo fijo individual).';
    } else if (con.porcentajeDescuentoHermanos !== null && con.porcentajeDescuentoHermanos !== undefined) {
      descDescuento = `Con ${con.porcentajeDescuentoHermanos}% de descuento fijo para hermanos.`;
    } else {
      descDescuento = 'Con descuento familiar estándar aplicado.';
    }

    setModalConf({
      abierto: true,
      titulo: 'Generar Cargos Masivos',
      mensaje: `¿Deseas generar los cargos para ${destinatariosDesc} correspondientes al concepto "${con.nombre}" por un monto base de $${Number(con.montoBase).toLocaleString('es-AR', { minimumFractionDigits: 2 })}?\n\n• Regla de descuento: ${descDescuento}`,
      tipo: 'confirmacion',
      textoConfirmar: 'Generar Cargos',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          const res = await api.post('/tesoreria/cargos/generar', {
            conceptoId: con.id,
            aplicarDescuentoFamiliar: true,
          });
          setModalConf(null);
          setNotificacion(`Se generaron ${res.data.totalGenerados} cargos con descuento familiar.`);
          cargarDatos();
        } catch (err: any) {
          setModalConf(null);
          mostrarAlerta(
            'Error al generar cargos',
            err.response?.data?.message || 'Error al generar los cargos masivos.',
            'peligro',
          );
        }
      },
    });
  };

  const handleConceptoGuardado = (nombre: string, esEdicion: boolean) => {
    setNotificacion(`Concepto "${nombre}" ${esEdicion ? 'actualizado' : 'creado'} con éxito.`);
    cargarDatos();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Panel de Jefatura de Grupo</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Alcance Global: Gestión institucional, pases de rama y finanzas centrales
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setTab('pases')}
                className={`px-4 py-2 rounded-lg transition cursor-pointer ${
                  tab === 'pases'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Pases de Rama
              </button>
              <button
                onClick={() => setTab('tesoreria')}
                className={`px-4 py-2 rounded-lg transition cursor-pointer ${
                  tab === 'tesoreria'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Tesorería Central
              </button>
              <button
                onClick={() => setTab('organizacion')}
                className={`px-4 py-2 rounded-lg transition cursor-pointer ${
                  tab === 'organizacion'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Ramas y Secciones
              </button>
              <button
                onClick={() => setTab('colaboradores')}
                className={`px-4 py-2 rounded-lg transition cursor-pointer ${
                  tab === 'colaboradores'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Adultos y Recursos
              </button>
            </div>

            <Link
              to="/padron"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-xs cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Padrón General</span>
            </Link>
          </div>
        </div>

        {notificacion && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-sm font-medium flex items-center justify-between">
            <span>{notificacion}</span>
            <button onClick={() => setNotificacion(null)} className="text-emerald-600 dark:text-emerald-400 hover:underline text-xs cursor-pointer">
              Cerrar
            </button>
          </div>
        )}

        {/* TAB 1: PASES */}
        {tab === 'pases' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4 transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Candidatos Sugeridos para Pase de Rama</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Calculado dinámicamente comparando la fecha de nacimiento con la edad máxima de cada rama
                </p>
              </div>
              <span className="text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full">
                {candidatos.length} Candidatos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Protagonista</th>
                    <th className="py-3 px-4">Edad</th>
                    <th className="py-3 px-4">Rama Actual</th>
                    <th className="py-3 px-4">Sugerencia</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {candidatos.map((c) => (
                    <tr key={c.asignacionId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-100">
                        {c.usuario.nombre} {c.usuario.apellido}
                      </td>
                      <td className="py-3 px-4 font-bold text-amber-700 dark:text-amber-400">{c.edad} años</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{c.unidadActual.nombre}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-[10px] border ${
                          c.tipo === 'PROGRESION'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                        }`}>
                          {c.tipo === 'PROGRESION' ? `Pasar a ${c.ramaSugerida?.nombre}` : 'Egreso a Educador'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleEjecutarPase(c)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer"
                        >
                          Ejecutar Pase
                        </button>
                      </td>
                    </tr>
                  ))}
                  {candidatos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-slate-500">
                        No hay candidatos sugeridos en este momento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: TESORERÍA */}
        {tab === 'tesoreria' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-6 transition-colors">
            {/* Selector de Sub-pestañas de Tesorería */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Tesorería y Finanzas Institucionales
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Administre los cuadros de cuota mensual por sección y los cobros extraordinarios de campamento
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('planes')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    subTabTesoreria === 'planes'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Cuadros de Cuota Mensual ({planesMensuales.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('campamentos')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    subTabTesoreria === 'campamentos'
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Tent className="w-3.5 h-3.5" />
                  <span>Campamentos y Eventos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTabTesoreria('familias')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    subTabTesoreria === 'familias'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Familias y Descuentos ({familias.length})</span>
                </button>
              </div>
            </div>

            {/* SUB-TAB 1: PLANES DE CUOTA MENSUAL (CUADROS ANUALES) */}
            {subTabTesoreria === 'planes' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Cuadros de Cuota Mensual y Casilleros de Meses</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Habilite o desmarque casilleros de meses para acumular la deuda progresivamente a lo largo del año
                    </p>
                  </div>

                  <button
                    onClick={handleCrearPlan}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer transition shadow-xs"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Nuevo Cuadro de Cuota</span>
                  </button>
                </div>

                {/* Grilla de Cuadros Mensuales */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {planesMensuales.map((plan) => {
                    const mesesHabilitados: number[] = Array.isArray(plan.mesesHabilitadosJson)
                      ? plan.mesesHabilitadosJson
                      : [];
                    const nombresMesesCortos = [
                      '',
                      'Ene',
                      'Feb',
                      'Mar',
                      'Abr',
                      'May',
                      'Jun',
                      'Jul',
                      'Ago',
                      'Sep',
                      'Oct',
                      'Nov',
                      'Dic',
                    ];
                    const excepciones: number[] = Array.isArray(plan.excepcionesJson) ? plan.excepcionesJson : [];

                    return (
                      <div
                        key={plan.id}
                        className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/70 transition-all shadow-xs flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3.5">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-snug">
                                  {plan.nombre}
                                </h4>
                                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[10px] border border-slate-200 dark:border-slate-600">
                                  Ciclo {plan.cicloAnio}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                Vence los días {plan.diaVencimiento || 10} de cada mes
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 block">
                                ${Number(plan.montoMensual).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">por mes</span>
                            </div>
                          </div>

                          {/* Badges de Alcance y Descuento */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold border ${
                                plan.destinatarioTipo === 'EDUCADORES'
                                  ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60'
                                  : plan.destinatarioTipo === 'PROTAGONISTAS'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                                    : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
                              }`}
                            >
                              {plan.destinatarioTipo === 'EDUCADORES'
                                ? '★ Solo Educadores'
                                : plan.destinatarioTipo === 'PROTAGONISTAS'
                                  ? 'Solo Protagonistas'
                                  : 'Todos (Ambos)'}
                            </span>

                            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-600">
                              {plan.unidad ? plan.unidad.nombre : 'Todo el Grupo Scout'}
                            </span>

                            {excepciones.length > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-800/60">
                                {excepciones.length} {excepciones.length === 1 ? 'exento' : 'exentos'}
                              </span>
                            )}

                            {plan.permiteDescuentoHermanos === false ? (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium border border-slate-200 dark:border-slate-700">
                                Sin desc. hermanos
                              </span>
                            ) : plan.porcentajeDescuentoHermanos !== null &&
                              plan.porcentajeDescuentoHermanos !== undefined ? (
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-semibold border border-teal-200 dark:border-teal-800/60">
                                {Number(plan.porcentajeDescuentoHermanos)}% desc. hermanos
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-medium border border-teal-200 dark:border-teal-800/60">
                                Con desc. familiar
                              </span>
                            )}
                          </div>

                          {/* CASILLEROS DE MESES DEL AÑO (1 al 12) */}
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="font-semibold">Casilleros de Meses del Año:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {mesesHabilitados.length} de 12 meses acumulados
                              </span>
                            </div>

                            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                                const activo = mesesHabilitados.includes(num);
                                return (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleToggleMesPlan(plan, num)}
                                    title={
                                      activo
                                        ? `Mes ${num} (${nombresMesesCortos[num]}) habilitado. Clic para desmarcar.`
                                        : `Mes ${num} (${nombresMesesCortos[num]}) inactivo. Clic para habilitar y acumular deuda.`
                                    }
                                    className={`py-1.5 px-1 rounded-lg text-center font-bold text-[10px] transition flex flex-col items-center justify-center gap-0.5 cursor-pointer border ${
                                      activo
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs hover:bg-emerald-700'
                                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                  >
                                    <span>{nombresMesesCortos[num]}</span>
                                    {activo ? (
                                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                                    ) : (
                                      <span className="text-[9px] opacity-40">·</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Footer Card */}
                        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">
                            ID #{plan.id}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditarPlan(plan)}
                              className="py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5 text-slate-500" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSolicitarEliminarPlan(plan)}
                              className="py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {planesMensuales.length === 0 && !cargando && (
                    <div className="col-span-full py-12 text-center bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
                      <Layers className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                      <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                        No hay cuadros de cuota mensual creados para este ciclo
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                        Cree un nuevo cuadro de cuota mensual para definir el valor y los meses en los que se acumula la deuda progresiva.
                      </p>
                      <button
                        type="button"
                        onClick={handleCrearPlan}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Crear Primer Cuadro de Cuota</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: COBROS EXTRAORDINARIOS Y CAMPAMENTOS */}
            {subTabTesoreria === 'campamentos' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Tent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Cobros Extraordinarios, Campamentos y Eventos</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Definición de cobros especiales de campamento, salidas, inscripciones o eventos especiales
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setModalCampamentoAbierto(true)}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer transition shadow-xs"
                    >
                      <Tent className="w-4 h-4" />
                      <span>Nuevo Cobro de Campamento</span>
                    </button>

                    <button
                      onClick={handleCrearConcepto}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs cursor-pointer hover:bg-slate-50 transition"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Otro Concepto</span>
                    </button>
                  </div>
                </div>

                {/* Grilla de Conceptos Extraordinarios */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {conceptos
                    .filter((con) => !con.planCuotaMensualId)
                    .map((con) => (
                      <div
                        key={con.id}
                        className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800/80 transition-all shadow-xs flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug">
                              {con.nombre}
                            </h3>
                            <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 shrink-0">
                              ${Number(con.montoBase).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800/60">
                              {con.tipo === 'CAMPAMENTO'
                                ? 'Campamento'
                                : con.tipo === 'INSCRIPCION'
                                  ? 'Inscripción'
                                  : con.tipo === 'EVENTO'
                                    ? 'Evento'
                                    : con.tipo === 'MATERIALES'
                                      ? 'Materiales'
                                      : con.tipo === 'OTRO'
                                        ? 'Otro'
                                        : 'Extraordinario'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/60 dark:border-slate-700">
                              Ciclo {con.cicloAnio}
                            </span>
                            {con.esParaEducadores ? (
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800/60">
                                ★ Solo Educadores
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium border border-emerald-200 dark:border-emerald-800/60">
                                {con.unidad ? con.unidad.nombre : 'Todo el Grupo'}
                              </span>
                            )}
                            {con.fechaVencimiento && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800/60 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Vence: {new Date(con.fechaVencimiento).toLocaleDateString('es-AR')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                            <span>
                              {con._count?.cargos ?? 0}{' '}
                              {con._count?.cargos === 1 ? 'cargo generado' : 'cargos generados'}
                            </span>
                            {con.permiteDescuentoHermanos === false ? (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                Sin desc. hermanos
                              </span>
                            ) : con.porcentajeDescuentoHermanos !== null &&
                              con.porcentajeDescuentoHermanos !== undefined ? (
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50 font-semibold">
                                {Number(con.porcentajeDescuentoHermanos)}% desc. hermanos
                              </span>
                            ) : (
                              <span className="text-[10px] text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800/50 font-medium">
                                Desc. familiar
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                          <button
                            onClick={() => handleSolicitarGenerarCargos(con)}
                            className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-300 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-800 shadow-2xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Generar Cargos Masivos</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditarConcepto(con)}
                              className="flex-1 py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Editar concepto"
                            >
                              <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Editar</span>
                            </button>

                            <button
                              onClick={() => handleSolicitarEliminarConcepto(con)}
                              className="py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                              title="Eliminar concepto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                  {conceptos.filter((con) => !con.planCuotaMensualId).length === 0 && !cargando && (
                    <div className="col-span-full py-12 text-center text-slate-400 dark:text-slate-500">
                      No hay cobros extraordinarios o de campamentos creados para el ciclo seleccionado.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: GRUPOS FAMILIARES Y DESCUENTO POR HERMANOS */}
            {subTabTesoreria === 'familias' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Grupos Familiares y Descuentos por Hermanos</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Gestione el porcentaje de bonificación por hermanos que se aplicará automáticamente en las cuotas del grupo
                    </p>
                  </div>
                </div>

                {/* Explicación de cómo funciona el descuento */}
                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-start gap-3 text-xs text-indigo-900 dark:text-indigo-200">
                  <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-sm block text-indigo-950 dark:text-indigo-100">
                      ¿Dónde y cómo se aplica el Descuento por Hermanos?
                    </span>
                    <p className="text-[11px] leading-relaxed text-indigo-800/90 dark:text-indigo-300/90">
                      Cada familia registrada tiene configurado un <strong>porcentaje de descuento por hermanos</strong> (ej. 10%, 15%, 20%).
                      Al habilitar un mes en los <strong>Cuadros de Cuota Mensual</strong> o al generar cargos de <strong>Campamentos</strong> con la opción de descuento familiar activa, el sistema calcula automáticamente la bonificación restando este porcentaje sobre el monto base a todos los hermanos de esa familia.
                    </p>
                  </div>
                </div>

                {/* Grilla de Familias */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {familias.map((fam) => {
                    const pct = Number(fam.porcentajeDescuentoHermanos ?? 0);
                    const miembros = fam.miembros || [];
                    return (
                      <div
                        key={fam.id}
                        className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:shadow-md transition-all flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                                {fam.nombreFamilia}
                              </h4>
                              <span className="text-[10px] text-slate-400">
                                {miembros.length} {miembros.length === 1 ? 'miembro' : 'hermanos vinculados'}
                              </span>
                            </div>

                            <span
                              className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
                                pct > 0
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {pct > 0 ? `${pct}% Descuento` : '0% (Sin desc.)'}
                            </span>
                          </div>

                          {/* Lista de hermanos */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                              Integrantes en el grupo:
                            </span>
                            {miembros.map((m: any) => {
                              const uNombre = m.asignaciones?.[0]?.unidad?.nombre || 'Sin sección';
                              return (
                                <div
                                  key={m.id}
                                  className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                      {m.nombre} {m.apellido}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">DNI: {m.dni}</span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                                    {uNombre}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setFamiliaAEditar(fam);
                              setModalFamiliaAbierto(true);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Configurar Descuento Familiar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {familias.length === 0 && !cargando && (
                    <div className="col-span-full py-12 text-center text-slate-400 dark:text-slate-500">
                      No hay grupos familiares registrados aún. Al dar de alta miembros vinculando el DNI de sus hermanos, se crearán aquí automáticamente.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ORGANIZACIÓN */}
        {tab === 'organizacion' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4 transition-colors">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ramas Pedagógicas</h2>
              <div className="space-y-2">
                {ramas.map((r) => (
                  <div key={r.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{r.nombre}</span>
                      <span className="text-slate-400 dark:text-slate-500 block">Orden: {r.ordenProgresion}</span>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full">
                      {r.edadMinima} a {r.edadMaxima} años
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4 transition-colors">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ramas y Secciones Reales</h2>
              <div className="space-y-2">
                {unidades.map((u) => (
                  <div key={u.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{u.nombre}</span>
                      <span className="text-slate-400 dark:text-slate-500 block">{u.tipo}</span>
                    </div>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      {u.rama?.nombre || 'Sin Rama (Jefatura/Apoyo)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Relevamiento de Adultos Voluntarios y Recursos */}
        {tab === 'colaboradores' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <HeartHandshake className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  Adultos Voluntarios y Recursos Materiales (Ciclo 2026)
                </h2>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Relevamiento consolidado a partir de las Fichas de Adultos (Página 7) completadas por las familias del grupo.
                </p>
              </div>
              <span className="px-3.5 py-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold">
                {colaboradores.length} Voluntario(s) Registrado(s)
              </span>
            </div>

            {colaboradores.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
                <p className="text-base font-medium text-slate-600 dark:text-slate-300">
                  Aún no hay adultos voluntarios registrados para el ciclo 2026.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Aparecerán aquí automáticamente a medida que las familias completen la Ficha de Adultos en su portal de autogestión.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {colaboradores.map((col, idx) => (
                  <div
                    key={col.entregaId || idx}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
                  >
                    <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                          {col.adulto.nombre}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Profesión / Oficio: <span className="font-medium text-slate-700 dark:text-slate-300">{col.adulto.profesion}</span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Familia de: <span className="font-medium text-emerald-700 dark:text-emerald-400">{col.protagonista.nombre} {col.protagonista.apellido}</span> ({col.protagonista.unidad})
                        </p>
                      </div>
                      <span className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-semibold">
                        {col.adulto.preferenciaTrabajo}
                      </span>
                    </div>

                    {/* Teléfono de contacto */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Teléfono: <strong>{col.adulto.telefono}</strong></span>
                    </div>

                    {/* Áreas de Colaboración */}
                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                        Áreas de Colaboración Ofrecidas:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {col.areas.cocinaCampamento && (
                          <span className="text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                            <Utensils className="w-3 h-3" /> Cocina en Campamento
                          </span>
                        )}
                        {col.areas.campamento && (
                          <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-md font-medium">
                            🏕️ En Campamento
                          </span>
                        )}
                        {(col.areas.transporte || col.areas.camion || col.areas.camioneta || col.areas.colectivo) && (
                          <span className="text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                            <Truck className="w-3 h-3" />
                            Transporte ({[
                              col.areas.camion && 'Camión',
                              col.areas.camioneta && 'Camioneta',
                              col.areas.colectivo && 'Colectivo',
                            ].filter(Boolean).join(', ') || 'Vehículo propio'})
                          </span>
                        )}
                        {col.areas.manoObra && (
                          <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                            <Wrench className="w-3 h-3" /> Mano de Obra
                          </span>
                        )}
                        {col.areas.ensenando && (
                          <span className="text-[11px] bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 px-2 py-0.5 rounded-md font-medium">
                            🎓 Enseñando Talleres / Especialidades
                          </span>
                        )}
                        {col.areas.fotocopias && (
                          <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium">
                            📄 Fotocopias
                          </span>
                        )}
                        {col.areas.alimentos && (
                          <span className="text-[11px] bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 px-2 py-0.5 rounded-md font-medium">
                            🥫 Alimentos no perecederos
                          </span>
                        )}
                        {col.areas.servicioComunitario && (
                          <span className="text-[11px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 px-2 py-0.5 rounded-md font-medium">
                            🤝 Servicio Comunitario
                          </span>
                        )}
                        {col.areas.otros && col.areas.otrosDetalle && (
                          <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md font-medium">
                            Otro: {col.areas.otrosDetalle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Materiales ofrecidos */}
                    {(col.materiales.campamentoPrestamo ||
                      col.materiales.campamentoDonacion ||
                      col.materiales.construccionPrestamo ||
                      col.materiales.construccionDonacion) && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          Materiales y Herramientas:
                        </span>
                        {col.materiales.campamentoPrestamo && (
                          <p><span className="text-emerald-700 dark:text-emerald-400 font-semibold">Campamento (Préstamo):</span> {col.materiales.campamentoPrestamo}</p>
                        )}
                        {col.materiales.campamentoDonacion && (
                          <p><span className="text-emerald-700 dark:text-emerald-400 font-semibold">Campamento (Donación):</span> {col.materiales.campamentoDonacion}</p>
                        )}
                        {col.materiales.construccionPrestamo && (
                          <p><span className="text-blue-700 dark:text-blue-400 font-semibold">Construcción (Préstamo):</span> {col.materiales.construccionPrestamo}</p>
                        )}
                        {col.materiales.construccionDonacion && (
                          <p><span className="text-blue-700 dark:text-blue-400 font-semibold">Construcción (Donación):</span> {col.materiales.construccionDonacion}</p>
                        )}
                      </div>
                    )}

                    {col.adulto.observaciones && col.adulto.observaciones !== '-' && (
                      <p className="text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        "{col.adulto.observaciones}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal para Crear y Editar Conceptos de Cuota */}
      <ModalConcepto
        abierto={modalConceptoAbierto}
        onCerrar={() => {
          setModalConceptoAbierto(false);
          setConceptoAEditar(null);
        }}
        onGuardado={handleConceptoGuardado}
        concepto={conceptoAEditar}
        unidades={unidades}
      />

      {/* Modal para Crear y Editar Cuadros de Cuota Mensual */}
      <ModalPlanCuotaMensual
        abierto={modalPlanAbierto}
        planAEditar={planAEditar}
        unidades={unidades}
        onCerrar={() => {
          setModalPlanAbierto(false);
          setPlanAEditar(null);
        }}
        onGuardado={() => {
          setNotificacion('Cuadro de cuota mensual guardado con éxito.');
          cargarDatos();
        }}
      />

      {/* Modal para Crear Cobro Extraordinario / Campamento */}
      <ModalCobroCampamento
        abierto={modalCampamentoAbierto}
        unidades={unidades}
        onCerrar={() => setModalCampamentoAbierto(false)}
        onGenerado={(mensaje) => {
          setNotificacion(mensaje);
          cargarDatos();
        }}
      />

      {/* Modal para Editar Grupo Familiar y Descuento por Hermanos */}
      {modalFamiliaAbierto && familiaAEditar && (
        <ModalEditarFamilia
          abierto={modalFamiliaAbierto}
          familia={familiaAEditar}
          onCerrar={() => {
            setModalFamiliaAbierto(false);
            setFamiliaAEditar(null);
          }}
          onGuardado={() => {
            setNotificacion('Grupo familiar y descuento por hermanos guardados con éxito.');
            cargarDatos();
          }}
        />
      )}

      {/* Modal Reutilizable para Confirmaciones y Alertas */}
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
