import React, { useEffect, useState, useMemo } from 'react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { ModalConfirmacion, type ModalConfirmacionProps } from './ModalConfirmacion';
import { ModalCobrarDeuda } from './ModalCobrarDeuda';
import { ModalGenerarDeudaManual } from './ModalGenerarDeudaManual';
import { ModalEditarFamilia } from './ModalEditarFamilia';
import { ModalVincularHermano } from './ModalVincularHermano';
import { obtenerConfigRama } from '../lib/ramaColors';
import {
  calcularEdad,
  obtenerAsignacionesActivas,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  obtenerRolesSecundarios,
  esRolAlcanceGlobal,
  esRolDeEducador,
  esRolDeProtagonista,
  esRolJefe,
  esRolRama,
  esRolSinRama,
  formatearMoneda,
  rolRequiereRama,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
} from '../lib/formatters';
import { BotonLlamarMiembro } from './BotonLlamarMiembro';
import {
  esUnidadJefatura,
  esUnidadRama,
  esUnidadSinRama,
  miembroEsEducador,
  miembroTieneAlcanceGlobal,
  obtenerUnidadesEnAlcanceIds,
  puedeCerrarAsignacionPorAlcance,
  puedeEditarFamiliaPorAlcance,
  usePermisosUI,
} from '../lib/permisos';
import {
  X,
  User,
  FileCheck2,
  CreditCard,
  KeyRound,
  ArrowRightLeft,
} from 'lucide-react';
import {
  generarFichaPdf,
  descargarPdfBlob,
  crearUrlPdfBlob,
  type MapeoPdf,
} from '../services/pdfGenerator';
import { PestanaDatosMiembro } from './detalle-miembro/PestanaDatosMiembro';
import { PestanaPaseRol } from './detalle-miembro/PestanaPaseRol';
import { PestanaSeguridad } from './detalle-miembro/PestanaSeguridad';
import { PestanaLegajosFichas } from './detalle-miembro/PestanaLegajosFichas';
import { PestanaCuotasTesoreria } from './detalle-miembro/PestanaCuotasTesoreria';

interface Props {
  usuarioId: number | null;
  onCerrar: () => void;
  onActualizado?: () => void;
  onEliminado?: (mensaje: string) => void;
  onClaveReseteada?: (mensaje: string) => void;
  tabInicial?: 'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas';
}

const CARGOS_VACIOS: any[] = [];

export const ModalDetalleMiembro: React.FC<Props> = ({
  usuarioId,
  onCerrar,
  onActualizado,
  onEliminado,
  onClaveReseteada,
  tabInicial = 'datos',
}) => {
  const { usuario: usuarioActual, asignaciones: asignacionesActuales, tieneGlobal, tienePermiso, refrescarSesionDesdeServidor } = useAuthStore();
  const { canEdit, canView } = usePermisosUI();
  const esGlobal = tieneGlobal();
  const unidadesEnAlcanceIds = useMemo(
    () => obtenerUnidadesEnAlcanceIds(asignacionesActuales),
    [asignacionesActuales],
  );
  const tieneBajaGlobal = asignacionesActuales.some(
    (a) => a.alcance === 'GLOBAL' && a.permisos.includes('miembros.baja'),
  );
  const puedeVerCuotas = canView('cuotas');
  const puedeCobrarCuotas = canEdit('cuotas', 'cobrar');
  const puedeCrearCargoIndividual = canEdit('cuotas', 'cargoIndividual');
  const puedeAjustarCuotas = canEdit('cuotas', 'editarCargo');
  const puedeGestionarTesoreria = tienePermiso('tesoreria.gestionar');
  const puedeVerFicha = canView('ficha');
  const puedeCompletarFicha = canEdit('ficha', 'completar');
  const puedeValidarFisico = canEdit('ficha', 'validarFisico');
  const [tab, setTab] = useState<'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas'>(tabInicial);
  const [miembro, setMiembro] = useState<any | null>(null);
  const targetEsGlobal = useMemo(() => miembroTieneAlcanceGlobal(miembro), [miembro]);
  const targetEsEducador = useMemo(() => miembroEsEducador(miembro), [miembro]);
  const esMismoUsuario = Boolean(miembro && usuarioActual && miembro.id === usuarioActual.id);
  const bloqueadoPorTargetGlobal = !esGlobal && targetEsGlobal;
  const puedeEditarIdentidad = canEdit('miembro', 'identidad') && !bloqueadoPorTargetGlobal;
  const puedeEditarContacto = canEdit('miembro', 'contacto') && !bloqueadoPorTargetGlobal;
  const puedeDarBaja = canEdit('miembro', 'estado') && !bloqueadoPorTargetGlobal;
  const puedeEditarMiembro = puedeEditarIdentidad || puedeEditarContacto || puedeDarBaja;
  const puedeHacerPases =
    canEdit('miembro', 'pase') &&
    !bloqueadoPorTargetGlobal &&
    !(!esGlobal && (esMismoUsuario || targetEsEducador));
  const puedeResetearClave = canEdit('miembro', 'clave') && !bloqueadoPorTargetGlobal;
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ramas, setRamas] = useState<any[]>([]);
  const [candidatosPase, setCandidatosPase] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoDefinitivo, setEliminandoDefinitivo] = useState(false);
  const [ejecutandoPase, setEjecutandoPase] = useState(false);
  const [reseteandoClave, setReseteandoClave] = useState(false);
  const [claveTemporalGenerada, setClaveTemporalGenerada] = useState<string | null>(null);
  const [validandoFichaId, setValidandoFichaId] = useState<number | null>(null);
  const [descargandoPdfId, setDescargandoPdfId] = useState<number | null>(null);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [editandoFicha, setEditandoFicha] = useState(false);
  const [plantillaActiva, setPlantillaActiva] = useState<any | null>(null);
  const [precargaFicha, setPrecargaFicha] = useState<any | null>(null);
  const [cargandoFichaEditor, setCargandoFichaEditor] = useState(false);
  const [alerta, setAlerta] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [modalConf, setModalConf] = useState<ModalConfirmacionProps | null>(null);

  // Modales secundarios de Cuotas y Familia
  const [modalCobrarAbierto, setModalCobrarAbierto] = useState(false);
  const [cargoIdACobrar, setCargoIdACobrar] = useState<number | null>(null);
  const [modalGenerarDeudaAbierto, setModalGenerarDeudaAbierto] = useState(false);
  const [modalEditarFamiliaAbierto, setModalEditarFamiliaAbierto] = useState(false);
  const [modalVincularHermanoAbierto, setModalVincularHermanoAbierto] = useState(false);

  const hayModalHijoAbierto = Boolean(
    modalConf ||
      modalCobrarAbierto ||
      modalGenerarDeudaAbierto ||
      modalEditarFamiliaAbierto ||
      modalVincularHermanoAbierto,
  );

  const { backdropProps, contentProps } = useModalOverlay({
    abierto: Boolean(usuarioId),
    onCerrar,
    bloqueado: hayModalHijoAbierto,
  });

  // Estados de edición y reversión en pestaña Cuotas
  const [mostrarAnulados, setMostrarAnulados] = useState(false);
  const [cargoEditando, setCargoEditando] = useState<{
    id: number;
    nombreConcepto: string;
    esIndividual: boolean;
    montoOriginal: string;
    montoDescuento: string;
    fechaVencimiento: string;
  } | null>(null);
  const [pagoEditando, setPagoEditando] = useState<{
    id: number;
    metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO';
    referenciaComprobante: string;
    observaciones: string;
  } | null>(null);
  const [ajustandoSaldo, setAjustandoSaldo] = useState(false);
  const [tipoAjusteSaldo, setTipoAjusteSaldo] = useState<'CARGAR' | 'DESCONTAR' | 'FIJAR'>('CARGAR');
  const [montoAjusteSaldo, setMontoAjusteSaldo] = useState('');
  const [motivoAjusteSaldo, setMotivoAjusteSaldo] = useState('');
  const [procesandoAccionCuota, setProcesandoAccionCuota] = useState(false);
  const [desvinculandoMiembroId, setDesvinculandoMiembroId] = useState<number | null>(null);

  // Formulario de edición
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    fechaNacimiento: '',
    emailContacto: '',
    telefonoContacto: '',
    madreNombres: '',
    madreTelefono: '',
    padreNombres: '',
    padreTelefono: '',
    tutorNombres: '',
    tutorTelefono: '',
    domicilio: '',
    obraSocial: '',
    telefonoUrgencias: '',
    alergias: '',
    activo: true,
  });

  // Formulario de pase
  const [categoriaDestino, setCategoriaDestino] = useState<'RAMA' | 'SIN_RAMA' | 'JEFATURA'>('RAMA');
  const [ramaSeleccionadaId, setRamaSeleccionadaId] = useState<number | null>(null);
  const [unidadDestinoId, setUnidadDestinoId] = useState<string>('');
  const [rolDestinoId, setRolDestinoId] = useState<string>('');

  const ramaSeleccionadaObj = useMemo(
    () => ramas.find((r) => r.id === ramaSeleccionadaId),
    [ramas, ramaSeleccionadaId],
  );

  const unidadesRamaSeleccionada = useMemo(
    () => unidades.filter((u) => u.ramaId === ramaSeleccionadaId && esUnidadRama(u)),
    [unidades, ramaSeleccionadaId],
  );

  const candidatoPase = candidatosPase.find((c) => c.usuario?.id === miembro?.id);

  const esEgreso = useMemo(() => {
    if (candidatoPase?.tipo === 'EGRESO' || candidatoPase?.tipo === 'EGRESO_SIN_RAMA') return true;
    const edad = miembro?.fechaNacimiento ? calcularEdad(miembro.fechaNacimiento) : 0;
    const asigActiva = obtenerRolPrincipal(miembro) ?? miembro?.asignaciones?.[0];
    const esRover = asigActiva?.unidad?.rama?.nombre?.toLowerCase().includes('rover');
    return Boolean(esRover && (edad ?? 0) >= 21);
  }, [candidatoPase, miembro]);

  const rolesRama = useMemo(() => {
    const base = roles.filter((r) => esRolRama(r) && (esGlobal || !esRolAlcanceGlobal(r)));
    if (esEgreso && esGlobal) {
      const edus = base.filter((r) => esRolDeEducador(r));
      return edus.length > 0 ? edus : base;
    }
    return base;
  }, [roles, esEgreso, esGlobal]);
  const rolesSinRama = useMemo(() => {
    const permitidos = esGlobal ? roles : roles.filter((r) => !esRolAlcanceGlobal(r));
    const sr = permitidos.filter(esRolSinRama);
    return sr.length > 0 ? sr : permitidos.filter((r) => !rolRequiereRama(r) && !esRolJefe(r));
  }, [roles, esGlobal]);
  const rolesJefatura = useMemo(() => {
    if (!esGlobal) return [];
    const jf = roles.filter(esRolJefe);
    return jf.length > 0 ? jf : roles.filter((r) => !rolRequiereRama(r));
  }, [roles, esGlobal]);

  const familiaActual = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
  const puedeVincularHermano = !bloqueadoPorTargetGlobal && canEdit('miembro', 'familia');
  const puedeEditarDescuentoFamilia = Boolean(
    familiaActual &&
      !bloqueadoPorTargetGlobal &&
      canEdit('miembro', 'descuentoFamiliar') &&
      puedeEditarFamiliaPorAlcance(familiaActual, { esGlobal, unidadesEnAlcanceIds }),
  );

  const asignacionPrincipal = miembro ? obtenerRolPrincipal(miembro) : null;
  const asignacionesActivas = useMemo(() => obtenerAsignacionesActivas(miembro), [miembro]);
  const rolesSecundarios = useMemo(() => obtenerRolesSecundarios(miembro), [miembro]);

  const esMismoDestino = useMemo(() => {
    if (!asignacionPrincipal) return false;
    const unidadIdActual = asignacionPrincipal.unidad?.id ?? asignacionPrincipal.unidadId;
    const rolIdActual = asignacionPrincipal.rol?.id ?? asignacionPrincipal.rolId;
    return (
      Number(unidadDestinoId) === unidadIdActual && Number(rolDestinoId) === rolIdActual
    );
  }, [asignacionPrincipal, unidadDestinoId, rolDestinoId]);

  const esEducador = esRolDeEducador(asignacionPrincipal?.rol);

  // candidatoPase moved above

  useEffect(() => {
    if (!usuarioId) {
      setMiembro(null);
      setAlerta(null);
      setClaveTemporalGenerada(null);
      setEditandoFicha(false);
      return;
    }
    setTab(tabInicial);
    setAlerta(null);
    setClaveTemporalGenerada(null);
    setEditandoFicha(false);
    setPlantillaActiva(null);
    cargarDatos(usuarioId);
  }, [usuarioId, tabInicial]);

  const cargarDatos = async (id: number) => {
    setCargando(true);
    try {
      const [resMiembro, resCuenta, resEntregas, resUnidades, resRoles, resCandidatos, resRamas] =
        await Promise.all([
          api.get(`/miembros/${id}`),
          api.get(`/tesoreria/estado-cuenta/${id}`).catch(() => null),
          api.get(`/legajos/entregas?usuarioId=${id}`).catch(() => null),
          api.get('/organizacion/unidades').catch(() => ({ data: [] })),
          api.get('/organizacion/roles').catch(() => ({ data: [] })),
          api.get('/pases/candidatos').catch(() => ({ data: [] })),
          api.get('/organizacion/ramas').catch(() => ({ data: [] })),
        ]);

      const m = resMiembro.data;
      setMiembro(m);
      if (resCuenta) setEstadoCuenta(resCuenta.data);
      if (resEntregas) setEntregas(resEntregas.data);
      setUnidades(resUnidades.data || []);
      setRoles(resRoles.data || []);
      setRamas(resRamas.data || []);
      setCandidatosPase(resCandidatos.data || []);

      const fechaNac = m.fechaNacimiento
        ? new Date(m.fechaNacimiento).toISOString().split('T')[0]
        : '';
      setFormData({
        nombre: m.nombre || '',
        apellido: m.apellido || '',
        dni: m.dni || '',
        fechaNacimiento: fechaNac,
        emailContacto: m.emailContacto || '',
        telefonoContacto: m.telefonoContacto || m.datosFijosJson?.protagonista_telefono || '',
        madreNombres: m.datosFijosJson?.madre_nombres || '',
        madreTelefono: m.datosFijosJson?.madre_telefono || '',
        padreNombres: m.datosFijosJson?.padre_nombres || '',
        padreTelefono: m.datosFijosJson?.padre_telefono || '',
        tutorNombres: m.datosFijosJson?.tutor_nombres || '',
        tutorTelefono: m.datosFijosJson?.tutor_telefono || '',
        domicilio: m.datosFijosJson?.domicilio || '',
        obraSocial: m.datosFijosJson?.obra_social || '',
        telefonoUrgencias: m.datosFijosJson?.telefono_urgencias || '',
        alergias: m.datosFijosJson?.alergias || '',
        activo: m.activo ?? true,
      });

      const asig = obtenerRolPrincipal(m) ?? m.asignaciones?.[0];
      const asigUnidadId = asig?.unidad?.id ?? asig?.unidadId;
      const candidato = (resCandidatos.data || []).find((c: any) => c.usuario?.id === id);

      let catIni: 'RAMA' | 'SIN_RAMA' | 'JEFATURA' = 'RAMA';
      let ramaIniId: number | null = null;
      let unidadIni = '';
      let rolIni = '';

      if (candidato) {
        if (candidato.tipo === 'EGRESO' || candidato.tipo === 'EGRESO_SIN_RAMA') {
          catIni = 'SIN_RAMA';
          const uSin = (resUnidades.data || []).find(esUnidadSinRama);
          const rSin =
            (resRoles.data || []).find(esRolSinRama) ||
            (resRoles.data || []).find((r: any) => !rolRequiereRama(r) && !esRolJefe(r));
          if (uSin) unidadIni = String(uSin.id);
          if (rSin) rolIni = String(rSin.id);
        } else if (candidato.ramaSugerida) {
          catIni = 'RAMA';
          ramaIniId = candidato.ramaSugerida.id;
          if (candidato.unidadesDestino?.length > 0) {
            unidadIni = String(candidato.unidadesDestino[0].id);
          } else {
            const uRama = (resUnidades.data || []).find((u: any) => u.ramaId === ramaIniId);
            if (uRama) unidadIni = String(uRama.id);
          }
          const rProt = (resRoles.data || []).find(
            (r: any) => esRolDeProtagonista(r) && esRolRama(r),
          );
          if (rProt) rolIni = String(rProt.id);
        }
      } else {
        const uActual = (resUnidades.data || []).find((u: any) => u.id === asigUnidadId);
        if (uActual && esUnidadSinRama(uActual)) {
          catIni = 'SIN_RAMA';
          unidadIni = String(uActual.id);
          const rSin =
            asig?.rol?.id ||
            (resRoles.data || []).find(esRolSinRama)?.id ||
            (resRoles.data || []).find((r: any) => !rolRequiereRama(r))?.id;
          if (rSin) rolIni = String(rSin);
        } else if (uActual && esUnidadJefatura(uActual)) {
          catIni = 'JEFATURA';
          unidadIni = String(uActual.id);
          const rJefe =
            asig?.rol?.id ||
            (resRoles.data || []).find(esRolJefe)?.id ||
            (resRoles.data || []).find((r: any) => !rolRequiereRama(r))?.id;
          if (rJefe) rolIni = String(rJefe);
        } else {
          catIni = 'RAMA';
          const allRamas = resRamas.data || [];
          let ramaTarget = null;
          if (uActual?.ramaId != null) {
            const idx = allRamas.findIndex((r: any) => r.id === uActual.ramaId);
            if (idx >= 0 && idx + 1 < allRamas.length) {
              ramaTarget = allRamas[idx + 1];
            } else if (idx >= 0) {
              ramaTarget = allRamas[idx];
            }
          }
          if (!ramaTarget && allRamas.length > 0) {
            ramaTarget = allRamas[0];
          }
          if (ramaTarget) {
            ramaIniId = ramaTarget.id;
            const uDest = (resUnidades.data || []).find((u: any) => u.ramaId === ramaTarget.id);
            if (uDest) unidadIni = String(uDest.id);
          }
          const eraEdu = esRolDeEducador(asig?.rol);
          const rolDef = eraEdu
            ? (resRoles.data || []).find((r: any) => esRolDeEducador(r) && esRolRama(r))
            : (resRoles.data || []).find((r: any) => esRolDeProtagonista(r) && esRolRama(r));
          if (rolDef) rolIni = String(rolDef.id);
        }
      }

      setCategoriaDestino(catIni);
      setRamaSeleccionadaId(ramaIniId);
      setUnidadDestinoId(unidadIni);
      setRolDestinoId(rolIni);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudieron cargar los datos.'),
      });
    } finally {
      setCargando(false);
    }
  };

  const handleGuardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miembro) return;
    setGuardando(true);
    setAlerta(null);

    try {
      // Actualización parcial: solo se envían los grupos de campos que el usuario puede modificar
      const payload: Record<string, unknown> = {};
      if (puedeEditarIdentidad) {
        payload.nombre = formData.nombre.trim();
        payload.apellido = formData.apellido.trim();
        payload.dni = formData.dni.trim();
        payload.fechaNacimiento = formData.fechaNacimiento || undefined;
      }
      if (puedeDarBaja) payload.activo = formData.activo;
      if (puedeEditarContacto) {
        payload.emailContacto = formData.emailContacto.trim() || null;
        payload.telefonoContacto = formData.telefonoContacto.trim() || null;

        const datosFijosPrevios =
          miembro.datosFijosJson && typeof miembro.datosFijosJson === 'object'
            ? miembro.datosFijosJson
            : {};

        const camposEditados: Record<string, string> = {
          protagonista_telefono: formData.telefonoContacto.trim(),
          madre_nombres: formData.madreNombres.trim(),
          madre_telefono: formData.madreTelefono.trim(),
          padre_nombres: formData.padreNombres.trim(),
          padre_telefono: formData.padreTelefono.trim(),
          tutor_nombres: formData.tutorNombres.trim(),
          tutor_telefono: formData.tutorTelefono.trim(),
          domicilio: formData.domicilio.trim(),
          obra_social: formData.obraSocial.trim(),
          telefono_urgencias: formData.telefonoUrgencias.trim(),
          alergias: formData.alergias.trim(),
        };

        const datosFijosMergeados: Record<string, any> = { ...datosFijosPrevios };
        for (const [k, v] of Object.entries(camposEditados)) {
          if (v !== '' || datosFijosPrevios[k] !== undefined) {
            datosFijosMergeados[k] = v;
          }
        }

        payload.datosFijosJson = datosFijosMergeados;
      }
      await api.patch(`/miembros/${miembro.id}`, payload);

      setAlerta({ tipo: 'exito', texto: 'Datos guardados.' });
      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudieron guardar los datos.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  const puedeEliminarDefinitivo = Boolean(
    miembro && !miembro.activo && tieneBajaGlobal && miembro.id !== usuarioActual?.id,
  );

  const handleEjecutarEliminarDefinitivo = async (miembroObjetivo: any, forzarFichas = false) => {
    setEliminandoDefinitivo(true);
    setModalConf((prev) => (prev ? { ...prev, cargando: true } : null));
    try {
      const res = await api.delete(`/miembros/${miembroObjetivo.id}`, {
        params: forzarFichas ? { forzarFichas: true } : undefined,
      });
      const msg =
        res.data?.mensaje ||
        `Miembro "${miembroObjetivo.nombre} ${miembroObjetivo.apellido}" eliminado definitivamente.`;
      setModalConf(null);
      if (onEliminado) {
        onEliminado(msg);
      } else {
        useToastStore.getState().mostrarToast(msg);
        if (onActualizado) onActualizado();
      }
      onCerrar();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        const msg =
          err.response?.data?.message ||
          'No se puede eliminar definitivamente porque posee historial asociado.';
        const puedeForzarFichas = Boolean(err.response?.data?.puedeForzarFichas) && !forzarFichas;
        if (puedeForzarFichas) {
          setModalConf({
            abierto: true,
            tipo: 'peligro',
            titulo: 'El miembro posee fichas médicas emitidas o validadas',
            mensaje: `${msg}\n\nSi deseas eliminar este registro (por ejemplo, una cuenta de prueba), puedes forzar la eliminación definitiva borrando también sus fichas médicas. Esta acción es irreversible.`,
            textoConfirmar: 'Sí, eliminar con sus fichas médicas',
            textoCancelar: 'Cancelar',
            cargando: false,
            onCerrar: () => setModalConf(null),
            onConfirmar: () => handleEjecutarEliminarDefinitivo(miembroObjetivo, true),
          });
        } else {
          setModalConf({
            abierto: true,
            tipo: 'alerta',
            titulo: 'No se puede eliminar definitivamente',
            mensaje: `${msg}\n\nPara proteger el legajo histórico y la integridad contable del Grupo, este miembro debe permanecer dado de baja.`,
            textoConfirmar: 'Entendido',
            textoCancelar: null,
            cargando: false,
            onCerrar: () => setModalConf(null),
            onConfirmar: () => setModalConf(null),
          });
        }
      } else {
        setModalConf(null);
        setAlerta({
          tipo: 'error',
          texto: traducirErrorAmigable(err, 'No se pudo eliminar definitivamente el miembro.'),
        });
      }
    } finally {
      setEliminandoDefinitivo(false);
    }
  };

  const handleSolicitarEliminarDefinitivo = () => {
    if (!miembro || !puedeEliminarDefinitivo) return;
    setModalConf({
      abierto: true,
      tipo: 'peligro',
      titulo: `Eliminar definitivamente a ${miembro.nombre} ${miembro.apellido}`,
      mensaje: `¿Estás seguro de que deseas eliminar permanentemente a ${miembro.nombre} ${miembro.apellido} (DNI ${miembro.dni})?\n\nEsta acción es irreversible y solo se completará si no posee historial contable, pagos, cargos activos ni fichas médicas emitidas o validadas. Si posee registros asociados, la eliminación será rechazada.`,
      textoConfirmar: 'Eliminar definitivamente',
      textoCancelar: 'Cancelar',
      cargando: false,
      onCerrar: () => setModalConf(null),
      onConfirmar: () => handleEjecutarEliminarDefinitivo(miembro),
    });
  };

  const handleDesvincularRapido = async (targetUserId: number, targetNombre: string) => {
    if (!miembro) return;
    setDesvinculandoMiembroId(targetUserId);
    setAlerta(null);
    try {
      await api.post('/tesoreria/familias/desvincular-hermano', { usuarioId: targetUserId });
      setAlerta({
        tipo: 'exito',
        texto: `${targetNombre} fue eliminado del grupo familiar.`,
      });
      if (onActualizado) onActualizado();
      await cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo eliminar del grupo familiar.'),
      });
    } finally {
      setDesvinculandoMiembroId(null);
    }
  };

  const handleCambioCategoria = (cat: 'RAMA' | 'SIN_RAMA' | 'JEFATURA') => {
    setCategoriaDestino(cat);

    if (cat === 'SIN_RAMA') {
      setRamaSeleccionadaId(null);
      const u = unidades.find(esUnidadSinRama) || unidades.find((x) => !esUnidadRama(x));
      const r = roles.find(esRolSinRama) || roles.find((x) => !rolRequiereRama(x) && !esRolJefe(x));
      if (u) setUnidadDestinoId(String(u.id));
      if (r) setRolDestinoId(String(r.id));
    } else if (cat === 'JEFATURA') {
      setRamaSeleccionadaId(null);
      const u = unidades.find(esUnidadJefatura) || unidades.find((x) => !esUnidadRama(x));
      const r = roles.find(esRolJefe) || roles.find((x) => !rolRequiereRama(x));
      if (u) setUnidadDestinoId(String(u.id));
      if (r) setRolDestinoId(String(r.id));
    } else if (cat === 'RAMA') {
      let targetRamaId = ramaSeleccionadaId;
      if (!targetRamaId || !ramas.some((r) => r.id === targetRamaId)) {
        if (candidatoPase?.ramaSugerida?.id) {
          targetRamaId = candidatoPase.ramaSugerida.id;
        } else if (ramas.length > 0) {
          targetRamaId = ramas[0].id;
        }
      }
      setRamaSeleccionadaId(targetRamaId || null);

      if (targetRamaId) {
        const units = unidades.filter((u) => u.ramaId === targetRamaId && esUnidadRama(u));
        const candUnit = candidatoPase?.unidadesDestino?.find((cu: any) =>
          units.some((u) => u.id === cu.id),
        );
        if (candUnit) {
          setUnidadDestinoId(String(candUnit.id));
        } else if (units.length > 0) {
          setUnidadDestinoId(String(units[0].id));
        }
      }

      const currentRol = roles.find((r) => r.id === Number(rolDestinoId));
      if (!currentRol || !esRolRama(currentRol) || (esEgreso && !esRolDeEducador(currentRol))) {
        const asig = asignacionPrincipal;
        const eraEdu = esRolDeEducador(asig?.rol);
        const rolDefecto = (eraEdu || esEgreso)
          ? roles.find((r) => esRolDeEducador(r) && esRolRama(r))
          : roles.find((r) => esRolDeProtagonista(r) && esRolRama(r));
        if (rolDefecto) {
          setRolDestinoId(String(rolDefecto.id));
        }
      }
    }
  };

  const handleSeleccionarRama = (rama: any) => {
    setRamaSeleccionadaId(rama.id);
    const units = unidades.filter((u) => u.ramaId === rama.id && esUnidadRama(u));
    const candUnit = candidatoPase?.unidadesDestino?.find((cu: any) =>
      units.some((u) => u.id === cu.id),
    );
    if (candUnit) {
      setUnidadDestinoId(String(candUnit.id));
    } else if (units.length > 0) {
      setUnidadDestinoId(String(units[0].id));
    }

    const currentRol = roles.find((r) => r.id === Number(rolDestinoId));
    if (!currentRol || !esRolRama(currentRol) || (esEgreso && !esRolDeEducador(currentRol))) {
      const asig = asignacionPrincipal;
      const eraEdu = esRolDeEducador(asig?.rol);
      const rolDefecto = (eraEdu || esEgreso)
        ? roles.find((r) => esRolDeEducador(r) && esRolRama(r))
        : roles.find((r) => esRolDeProtagonista(r) && esRolRama(r));
      if (rolDefecto) {
        setRolDestinoId(String(rolDefecto.id));
      }
    }
  };

  const handleEjecutarPase = async () => {
    if (!asignacionPrincipal || (!unidadDestinoId && !rolDestinoId)) return;
    const destinoUnidad = unidades.find((u) => u.id === Number(unidadDestinoId));
    const destinoRol = roles.find((r) => r.id === Number(rolDestinoId));
    const nombreDestino = destinoUnidad?.nombre || destinoRol?.nombre || 'la nueva función';

    setEjecutandoPase(true);
    setAlerta(null);
    try {
      const resPase = await api.post('/pases', {
        asignacionOrigenId: asignacionPrincipal.id,
        unidadDestinoId: unidadDestinoId ? Number(unidadDestinoId) : undefined,
        rolDestinoId: rolDestinoId ? Number(rolDestinoId) : undefined,
      });

      setAlerta({
        tipo: 'exito',
        texto: resPase.data?.pendienteAprobacion
          ? `Solicitud de pase a ${nombreDestino} enviada para confirmación de la sección receptora.`
          : `Pase / cambio de rol a ${nombreDestino} realizado.`,
      });
      await refrescarSesionDesdeServidor();
      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo realizar el pase.'),
      });
    } finally {
      setEjecutandoPase(false);
    }
  };

  const handleAgregarAsignacion = async (datos: { rolId: number; unidadId?: number }) => {
    if (!miembro) return;
    setEjecutandoPase(true);
    setAlerta(null);
    try {
      await api.post(`/miembros/${miembro.id}/asignaciones`, datos);
      setAlerta({
        tipo: 'exito',
        texto: 'Rol adicional asignado correctamente al miembro.',
      });
      await refrescarSesionDesdeServidor();
      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo asignar el rol adicional.'),
      });
    } finally {
      setEjecutandoPase(false);
    }
  };

  const handleCerrarAsignacion = async (asigId: number) => {
    if (!miembro) return;
    setEjecutandoPase(true);
    setAlerta(null);
    try {
      await api.delete(`/miembros/${miembro.id}/asignaciones/${asigId}`);
      setAlerta({
        tipo: 'exito',
        texto: 'Asignación de rol finalizada.',
      });
      await refrescarSesionDesdeServidor();
      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo finalizar la asignación.'),
      });
    } finally {
      setEjecutandoPase(false);
    }
  };

  const handleResetClave = (soloPorCorreo = false) => {
    if (!miembro) return;

    setModalConf({
      abierto: true,
      titulo: soloPorCorreo ? 'Enviar Clave Solo por Correo' : 'Restablecer Contraseña',
      mensaje: soloPorCorreo
        ? `Se generará una nueva clave temporal para ${miembro.nombre} ${miembro.apellido}, se enviará únicamente a ${miembro.emailContacto || 'su correo'} (sin mostrarla en pantalla) y se revocarán sus sesiones activas.`
        : `Se generará una nueva clave temporal para ${miembro.nombre} ${miembro.apellido} y se revocarán sus sesiones activas.`,
      tipo: 'peligro',
      textoConfirmar: soloPorCorreo ? 'Enviar por correo' : 'Generar clave temporal',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        setReseteandoClave(true);
        setAlerta(null);
        try {
          const res = await api.post(`/auth/usuarios/${miembro.id}/resetear-clave`, {
            soloPorCorreo,
          });
          const claveTemporal: string | undefined = res.data?.claveTemporal;
          const emailEnviado = Boolean(res.data?.emailEnviado);
          const emailDestino: string | undefined = res.data?.emailDestino;
          setClaveTemporalGenerada(claveTemporal ?? null);
          setModalConf(null);
          const detalleEmail = emailEnviado
            ? ` Se envió por correo a ${emailDestino}.`
            : emailDestino
              ? ' No se pudo enviar por correo; compartila manualmente.'
              : ' El miembro no tiene email registrado; compartila manualmente.';
          setAlerta({
            tipo: 'exito',
            texto: claveTemporal
              ? `Nueva clave temporal generada: ${claveTemporal}.${detalleEmail}`
              : res.data?.mensaje ||
                (emailDestino
                  ? `Se generó una nueva clave temporal y se envió únicamente por correo a ${emailDestino}.`
                  : 'Se generó una nueva clave temporal.'),
          });
          if (onClaveReseteada) onClaveReseteada(res.data?.mensaje || 'Clave restablecida.');
          cargarDatos(miembro.id);
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo restablecer la contraseña.'),
          });
        } finally {
          setReseteandoClave(false);
        }
      },
    });
  };

  const handleAnularCargo = (cargo: any) => {
    const conceptoNombre = cargo.concepto?.nombre || 'Cuota';
    const pagado = Number(cargo.montoPagado ?? 0);
    const mensajeDetalle =
      pagado > 0
        ? `¿Seguro que quieres anular "${conceptoNombre}"? Los ${formatearMoneda(pagado)} que ya estaban abonados pasarán automáticamente al Saldo a Favor del miembro.`
        : `¿Seguro que quieres anular "${conceptoNombre}"? Ya no figurará como deuda (podrás reactivarla cuando quieras desde Cuotas Anuladas).`;

    setModalConf({
      abierto: true,
      titulo: 'Anular Cuota',
      mensaje: mensajeDetalle,
      tipo: 'peligro',
      textoConfirmar: 'Sí, anular cuota',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          const res = await api.post(`/tesoreria/cargos/${cargo.id}/anular`);
          setModalConf(null);
          setAlerta({
            tipo: 'exito',
            texto: res.data?.mensaje || `"${conceptoNombre}" fue anulada.`,
          });
          if (usuarioId) cargarDatos(usuarioId);
          if (onActualizado) onActualizado();
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo anular el cargo.'),
          });
        }
      },
    });
  };

  const handleReactivarCargo = async (cargoId: number, conceptoNombre: string) => {
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      await api.post(`/tesoreria/cargos/${cargoId}/reactivar`);
      setAlerta({ tipo: 'exito', texto: `"${conceptoNombre}" reactivada.` });
      if (usuarioId) cargarDatos(usuarioId);
      if (onActualizado) onActualizado();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo reactivar la cuota.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleEliminarCargoDefinitivo = (cargoId: number, conceptoNombre: string) => {
    setModalConf({
      abierto: true,
      titulo: 'Eliminar Cuota Definitivamente',
      mensaje: `¿Seguro que quieres borrar para siempre "${conceptoNombre}"?`,
      tipo: 'peligro',
      textoConfirmar: 'Eliminar definitivamente',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          await api.delete(`/tesoreria/cargos/${cargoId}`);
          setModalConf(null);
          setAlerta({ tipo: 'exito', texto: `"${conceptoNombre}" eliminada.` });
          if (usuarioId) cargarDatos(usuarioId);
          if (onActualizado) onActualizado();
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo eliminar el cargo.'),
          });
        }
      },
    });
  };

  const handleIniciarEdicionCargo = (c: any) => {
    setCargoEditando({
      id: c.id,
      nombreConcepto: c.concepto?.nombre || '',
      esIndividual: c.concepto?.destinatarioTipo === 'INDIVIDUAL',
      montoOriginal: String(Number(c.montoOriginal ?? c.montoFinal ?? 0)),
      montoDescuento: String(Number(c.montoDescuento ?? 0)),
      fechaVencimiento: c.concepto?.fechaVencimiento
        ? String(c.concepto.fechaVencimiento).split('T')[0]
        : '',
    });
  };

  const handleGuardarEdicionCargo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cargoEditando) return;
    const montoOriginalNum = Number(cargoEditando.montoOriginal);
    const montoDescuentoNum = Number(cargoEditando.montoDescuento || 0);
    if (!Number.isFinite(montoOriginalNum) || montoOriginalNum < 0) {
      setAlerta({ tipo: 'error', texto: 'El monto original debe ser un número mayor o igual a 0.' });
      return;
    }
    if (!Number.isFinite(montoDescuentoNum) || montoDescuentoNum < 0) {
      setAlerta({ tipo: 'error', texto: 'El descuento no puede ser negativo.' });
      return;
    }
    if (montoDescuentoNum > montoOriginalNum) {
      setAlerta({
        tipo: 'error',
        texto: 'El descuento no puede superar el monto original de la cuota.',
      });
      return;
    }

    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      const payload: any = {
        montoOriginal: montoOriginalNum,
        montoDescuento: montoDescuentoNum,
      };
      if (cargoEditando.esIndividual) {
        payload.nombreConcepto = cargoEditando.nombreConcepto.trim();
        payload.fechaVencimiento = cargoEditando.fechaVencimiento || null;
      }
      const res = await api.patch(`/tesoreria/cargos/${cargoEditando.id}`, payload);
      const exc = Number(res.data?.excedenteAcreditado ?? 0);
      setCargoEditando(null);
      setAlerta({
        tipo: 'exito',
        texto:
          exc > 0
            ? `Cuota actualizada. Se acreditaron ${formatearMoneda(exc)} a Saldo a Favor.`
            : 'Cuota actualizada.',
      });
      if (usuarioId) cargarDatos(usuarioId);
      if (onActualizado) onActualizado();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo actualizar la cuota.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleRevertirPago = (pago: any) => {
    setModalConf({
      abierto: true,
      titulo: 'Revertir / Anular Pago',
      mensaje: `¿Seguro que quieres revertir este pago de ${formatearMoneda(pago.montoTotal)}? Las cuotas volverán a quedar pendientes por ese importe y se ajustará el saldo a favor correspondiente.`,
      tipo: 'peligro',
      textoConfirmar: 'Sí, revertir pago',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          const res = await api.delete(`/tesoreria/pagos/${pago.id}`);
          setModalConf(null);
          setAlerta({
            tipo: 'exito',
            texto: res.data?.mensaje || 'Pago revertido correctamente.',
          });
          if (usuarioId) cargarDatos(usuarioId);
          if (onActualizado) onActualizado();
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo revertir el pago.'),
          });
        }
      },
    });
  };

  const handleGuardarEdicionPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoEditando) return;
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      await api.patch(`/tesoreria/pagos/${pagoEditando.id}`, {
        metodoPago: pagoEditando.metodoPago,
        referenciaComprobante: pagoEditando.referenciaComprobante.trim() || null,
        observaciones: pagoEditando.observaciones.trim() || null,
      });
      setPagoEditando(null);
      setAlerta({ tipo: 'exito', texto: 'Datos del pago actualizados.' });
      if (usuarioId) cargarDatos(usuarioId);
      if (onActualizado) onActualizado();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo editar el pago.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleGuardarAjusteSaldo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miembro || montoAjusteSaldo === '') return;
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      const res = await api.post('/tesoreria/saldo-a-favor/ajustar', {
        usuarioId: miembro.id,
        tipoAjuste: tipoAjusteSaldo,
        monto: Number(montoAjusteSaldo),
        motivo: motivoAjusteSaldo.trim() || undefined,
      });
      setAjustandoSaldo(false);
      setMontoAjusteSaldo('');
      setMotivoAjusteSaldo('');
      setAlerta({
        tipo: 'exito',
        texto: res.data?.mensaje || 'Saldo a favor actualizado.',
      });
      cargarDatos(miembro.id);
      if (onActualizado) onActualizado();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo ajustar el saldo a favor.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleValidarFisicoDirecto = async (entrega: any) => {
    setValidandoFichaId(entrega.id);
    setAlerta(null);
    try {
      await api.post(`/legajos/qr/validar/${entrega.hashVerificacion}`);
      setAlerta({
        tipo: 'exito',
        texto: 'Papel firmado registrado como recibido.',
      });
      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo validar la ficha.'),
      });
    } finally {
      setValidandoFichaId(null);
    }
  };

  const obtenerPlantillaActiva = async () => {
    if (plantillaActiva) return plantillaActiva;
    try {
      const res = await api.get(`/legajos/plantillas?cicloAnio=${obtenerCicloAnioActual()}`);
      let lista = Array.isArray(res.data) ? res.data : [];
      if (lista.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        lista = Array.isArray(resTodas.data) ? resTodas.data : [];
      }
      const p = seleccionarPlantillaPorMiembro(lista, miembro) || lista[0] || null;
      setPlantillaActiva(p);
      return p;
    } catch {
      return null;
    }
  };

  const generarBytesPdfMiembro = async (ent?: any): Promise<Uint8Array> => {
    const mapeo: MapeoPdf = { pdfBaseUrl: '', campos: {} };
    const ramaNombre = obtenerRolPrincipal(miembro)?.unidad?.nombre || '';
    const respuestasBase = ent?.respuestasSnapshotJson || {
      protagonista_telefono: miembro.telefonoContacto || '',
      protagonista_domicilio: miembro.datosFijosJson?.domicilio || '',
      ...(miembro.datosFijosJson || {}),
    };

    return await generarFichaPdf(
      mapeo,
      respuestasBase,
      ent?.hashVerificacion || `FICHA-${miembro.dni}-${obtenerCicloAnioActual()}`,
      {
        nombre: miembro.nombre,
        apellido: miembro.apellido,
        dni: miembro.dni,
        fechaNacimiento: miembro.fechaNacimiento,
        ramaNombre,
        telefonoContacto: miembro.telefonoContacto,
      },
      ent?.versionImpresion || 1,
    );
  };

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const cerrarVistaPreviaPdf = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
  };

  const handleVerPdfEducador = async (ent?: any) => {
    if (!miembro) return;
    setGenerandoVistaPrevia(true);
    setAlerta(null);
    try {
      const pdfBytes = await generarBytesPdfMiembro(ent);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(crearUrlPdfBlob(pdfBytes));
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo previsualizar el PDF.'),
      });
    } finally {
      setGenerandoVistaPrevia(false);
    }
  };

  const handleDescargarPdfEducador = async (ent?: any) => {
    if (!miembro) return;
    setDescargandoPdfId(ent?.id ?? -1);
    try {
      const pdfBytes = await generarBytesPdfMiembro(ent);
      descargarPdfBlob(pdfBytes, `Ficha_${miembro.apellido}_${miembro.nombre}.pdf`);
      setAlerta({ tipo: 'exito', texto: 'PDF descargado.' });
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo generar el PDF.'),
      });
    } finally {
      setDescargandoPdfId(null);
    }
  };

  const handleAbrirEditorFicha = async () => {
    if (!miembro) return;
    setCargandoFichaEditor(true);
    setAlerta(null);
    try {
      const p = await obtenerPlantillaActiva();
      if (!p) {
        setAlerta({ tipo: 'error', texto: 'No hay formulario activo configurado.' });
        return;
      }
      const resPrecarga = await api.get(
        `/legajos/miembro/${miembro.id}/plantilla/${p.id}/precarga?cicloAnio=${p.cicloAnio || obtenerCicloAnioActual()}`,
      );
      setPrecargaFicha(resPrecarga.data);
      setEditandoFicha(true);
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo abrir el formulario.'),
      });
    } finally {
      setCargandoFichaEditor(false);
    }
  };

  const handleGuardarFichaEducador = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
    if (!miembro || !plantillaActiva) return;
    setGuardando(true);
    setAlerta(null);
    try {
      const res = await api.post('/legajos/entregas', {
        usuarioId: miembro.id,
        plantillaId: plantillaActiva.id,
        cicloAnio: plantillaActiva.cicloAnio || obtenerCicloAnioActual(),
        respuestas: datos,
        finalizarParaFirma,
        actualizarDatosFijos: true,
      });

      const entrega = res.data;
      if (finalizarParaFirma && entrega.hashVerificacion) {
        const ramaNombre = obtenerRolPrincipal(miembro)?.unidad?.nombre || '';
        const pdfBytes = await generarFichaPdf(
          plantillaActiva.mapeoPdfJson,
          datos,
          entrega.hashVerificacion,
          {
            nombre: miembro.nombre,
            apellido: miembro.apellido,
            dni: miembro.dni,
            fechaNacimiento: miembro.fechaNacimiento,
            ramaNombre,
            telefonoContacto: miembro.telefonoContacto,
          },
          entrega.versionImpresion,
        );
        descargarPdfBlob(pdfBytes, `Ficha_${miembro.apellido}_${miembro.nombre}.pdf`);
        setAlerta({ tipo: 'exito', texto: 'Ficha guardada y PDF descargado.' });
        setEditandoFicha(false);
      } else {
        setAlerta({ tipo: 'exito', texto: 'Avance de ficha guardado.' });
      }

      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo guardar la ficha.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  if (!usuarioId) return null;

  const saldoPendiente = Number(estadoCuenta?.resumen?.saldoPendiente ?? 0);
  const saldoAFavor = Number(estadoCuenta?.resumen?.saldoAFavor ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      {...backdropProps}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-3xl w-full max-w-2xl overflow-hidden shadow-md flex flex-col max-h-[92dvh] border border-rule transition-colors animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 text-ink"
        {...contentProps}
      >
        {/* Cabecera Compacta */}
        <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between bg-paper-2 shrink-0 text-ink">
          <div className="flex items-center gap-3 min-w-0">
            {(() => {
              const cfgRama = miembro ? obtenerConfigRama(miembro, unidades) : null;
              return (
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shadow-xs shrink-0 ${
                    !miembro?.activo
                      ? 'bg-paper-3 text-ink-muted'
                      : cfgRama?.avatarClases ||
                        (esEducador ? 'bg-paper-3 text-brand' : 'bg-brand text-brand-contrast')
                  }`}
                >
                  {miembro ? `${miembro.nombre?.[0] || ''}${miembro.apellido?.[0] || ''}` : '...'}
                </div>
              );
            })()}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-base sm:text-lg font-extrabold text-ink truncate">
                  {miembro ? `${miembro.apellido}, ${miembro.nombre}` : 'Cargando...'}
                </h3>
                {miembro && !miembro.activo && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-paper-3 text-ink-2">
                    Baja
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-xs text-ink-muted">
                  DNI {miembro?.dni || '—'} • {calcularEdad(miembro?.fechaNacimiento) ?? '—'} años
                </span>
                {asignacionPrincipal && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                    {asignacionPrincipal.rol?.nombre} ({asignacionPrincipal.unidad?.nombre})
                  </span>
                )}
                {rolesSecundarios.map((sec: any) => (
                  <span
                    key={sec.id}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-paper-3 text-ink-2 border border-rule"
                  >
                    +{sec.rol?.nombre} ({sec.unidad?.nombre || 'Global'})
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {miembro && (
              <BotonLlamarMiembro miembro={miembro} entrega={entregas?.[0]} />
            )}
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-ink-muted hover:text-ink hover:hover:bg-paper-3 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pestañas Táctiles (Touch Target >= 44px) */}
        <nav
          aria-label="Secciones del miembro"
          className="flex border-b border-rule bg-surface px-3 overflow-x-auto no-scrollbar text-xs font-bold text-ink-muted shrink-0"
        >
          <button
            onClick={() => setTab('datos')}
            aria-current={tab === 'datos' ? 'page' : undefined}
            className={`min-h-[46px] px-3.5 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
              tab === 'datos'
                ? 'border-brand text-brand font-bold'
                : 'border-transparent hover:text-ink'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Datos</span>
          </button>

          {puedeVerCuotas && (
            <button
              onClick={() => setTab('cuotas')}
              aria-current={tab === 'cuotas' ? 'page' : undefined}
              className={`min-h-[46px] px-3.5 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                tab === 'cuotas'
                  ? 'border-brand text-brand font-bold'
                  : 'border-transparent hover:text-ink'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Cuotas</span>
              {saldoPendiente > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  {formatearMoneda(saldoPendiente)}
                </span>
              )}
            </button>
          )}

          {puedeVerFicha && (
            <button
              onClick={() => setTab('ficha')}
              aria-current={tab === 'ficha' ? 'page' : undefined}
              className={`min-h-[46px] px-3.5 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                tab === 'ficha'
                  ? 'border-brand text-brand font-bold'
                  : 'border-transparent hover:text-ink'
              }`}
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Ficha</span>
            </button>
          )}

          {puedeHacerPases && (
            <button
              onClick={() => setTab('pase')}
              aria-current={tab === 'pase' ? 'page' : undefined}
              className={`min-h-[46px] px-3.5 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                tab === 'pase'
                  ? 'border-brand text-brand font-bold'
                  : 'border-transparent hover:text-ink'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Pase</span>
              {candidatoPase && (
                <span className="w-2 h-2 rounded-full bg-brand inline-block animate-pulse" />
              )}
            </button>
          )}

          {puedeResetearClave && (
            <button
              onClick={() => setTab('seguridad')}
              aria-current={tab === 'seguridad' ? 'page' : undefined}
              className={`min-h-[46px] px-3.5 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
                tab === 'seguridad'
                  ? 'border-brand text-brand font-bold'
                  : 'border-transparent hover:text-ink'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Clave</span>
            </button>
          )}
        </nav>

        {/* Alerta interna */}
        {alerta && (
          <div
            role={alerta.tipo === 'error' ? 'alert' : 'status'}
            className={`mx-4 mt-3 p-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
              alerta.tipo === 'exito'
                ? 'bg-brand/10 border-brand/30 text-ink'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
            }`}
          >
            <span>{alerta.texto}</span>
            <button
              onClick={() => setAlerta(null)}
              aria-label="Cerrar alerta"
              className="ml-2 p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Cuerpo del Modal */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs flex-1">
          {cargando ? (
            <div className="py-14 text-center text-ink-muted">
              <div className="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-brand mb-2" />
              <p>Cargando…</p>
            </div>
          ) : miembro ? (
            <>
              {/* ======================================================== */}
              {/* PESTAÑA 1: DATOS PERSONALES, FAMILIA Y SALUD              */}
              {/* ======================================================== */}
              {tab === 'datos' && (
                <PestanaDatosMiembro
                  miembro={miembro}
                  estadoCuenta={estadoCuenta}
                  formData={formData}
                  setFormData={setFormData}
                  guardando={guardando}
                  desvinculandoMiembroId={desvinculandoMiembroId}
                  puedeEditarIdentidad={puedeEditarIdentidad}
                  puedeEditarContacto={puedeEditarContacto}
                  puedeDarBaja={puedeDarBaja}
                  puedeEditarMiembro={puedeEditarMiembro}
                  puedeGestionarTesoreria={puedeGestionarTesoreria}
                  puedeVincularHermano={puedeVincularHermano}
                  puedeEditarDescuentoFamilia={puedeEditarDescuentoFamilia}
                  esGlobal={esGlobal}
                  unidadesEnAlcanceIds={unidadesEnAlcanceIds}
                  puedeEliminarDefinitivo={puedeEliminarDefinitivo}
                  eliminandoDefinitivo={eliminandoDefinitivo}
                  onGuardarDatos={handleGuardarDatos}
                  onDesvincularRapido={handleDesvincularRapido}
                  onAbrirEditarFamilia={() => setModalEditarFamiliaAbierto(true)}
                  onAbrirVincularHermano={() => setModalVincularHermanoAbierto(true)}
                  onSolicitarEliminarDefinitivo={handleSolicitarEliminarDefinitivo}
                />
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 2: CUOTAS Y PAGOS (Tarjetas Mobile-First + 1-Tap) */}
              {/* ======================================================== */}
              {tab === 'cuotas' && (
                <PestanaCuotasTesoreria
                  miembro={miembro}
                  estadoCuenta={estadoCuenta}
                  saldoPendiente={saldoPendiente}
                  saldoAFavor={saldoAFavor}
                  puedeGestionarTesoreria={puedeGestionarTesoreria}
                  puedeCobrarCuotas={puedeCobrarCuotas}
                  puedeCrearCargoIndividual={puedeCrearCargoIndividual}
                  puedeAjustarCuotas={puedeAjustarCuotas}
                  puedeVincularHermano={puedeVincularHermano}
                  puedeEditarDescuentoFamilia={puedeEditarDescuentoFamilia}
                  esGlobal={esGlobal}
                  unidadesEnAlcanceIds={unidadesEnAlcanceIds}
                  ajustandoSaldo={ajustandoSaldo}
                  setAjustandoSaldo={setAjustandoSaldo}
                  tipoAjusteSaldo={tipoAjusteSaldo}
                  setTipoAjusteSaldo={setTipoAjusteSaldo}
                  montoAjusteSaldo={montoAjusteSaldo}
                  setMontoAjusteSaldo={setMontoAjusteSaldo}
                  motivoAjusteSaldo={motivoAjusteSaldo}
                  setMotivoAjusteSaldo={setMotivoAjusteSaldo}
                  procesandoAccionCuota={procesandoAccionCuota}
                  desvinculandoMiembroId={desvinculandoMiembroId}
                  cargoEditando={cargoEditando}
                  setCargoEditando={setCargoEditando}
                  mostrarAnulados={mostrarAnulados}
                  setMostrarAnulados={setMostrarAnulados}
                  pagoEditando={pagoEditando}
                  setPagoEditando={setPagoEditando}
                  onGuardarAjusteSaldo={handleGuardarAjusteSaldo}
                  onIniciarEdicionCargo={handleIniciarEdicionCargo}
                  onGuardarEdicionCargo={handleGuardarEdicionCargo}
                  onAnularCargo={handleAnularCargo}
                  onReactivarCargo={handleReactivarCargo}
                  onEliminarCargoDefinitivo={handleEliminarCargoDefinitivo}
                  onRevertirPago={handleRevertirPago}
                  onGuardarEdicionPago={handleGuardarEdicionPago}
                  onDesvincularRapido={handleDesvincularRapido}
                  onCobrarCargo={(cId) => {
                    setCargoIdACobrar(cId ?? null);
                    setModalCobrarAbierto(true);
                  }}
                  onAbrirModalGenerarDeuda={() => setModalGenerarDeudaAbierto(true)}
                  onAbrirModalEditarFamilia={() => setModalEditarFamiliaAbierto(true)}
                  onAbrirModalVincularHermano={() => setModalVincularHermanoAbierto(true)}
                />
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 3: FICHA MÉDICA (1-Tap Validación, Descarga y Relleno) */}
              {/* ======================================================== */}
              {tab === 'ficha' && (
                <PestanaLegajosFichas
                  miembro={miembro}
                  entregas={entregas}
                  editandoFicha={editandoFicha}
                  setEditandoFicha={setEditandoFicha}
                  plantillaActiva={plantillaActiva}
                  precargaFicha={precargaFicha}
                  guardando={guardando}
                  validandoFichaId={validandoFichaId}
                  descargandoPdfId={descargandoPdfId}
                  generandoVistaPrevia={generandoVistaPrevia}
                  pdfPreviewUrl={pdfPreviewUrl}
                  cargandoFichaEditor={cargandoFichaEditor}
                  puedeValidarFisico={puedeValidarFisico}
                  puedeCompletarFicha={puedeCompletarFicha}
                  onGuardarFichaEducador={handleGuardarFichaEducador}
                  onValidarFisicoDirecto={handleValidarFisicoDirecto}
                  onVerPdfEducador={handleVerPdfEducador}
                  onDescargarPdfEducador={handleDescargarPdfEducador}
                  onAbrirEditorFicha={handleAbrirEditorFicha}
                  onCerrarPdfPreview={cerrarVistaPreviaPdf}
                />
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 4: PASE DE RAMA / CAMBIO DE SECCIÓN              */}
              {/* ======================================================== */}
              {tab === 'pase' && (
                <PestanaPaseRol
                  candidatoPase={candidatoPase}
                  categoriaDestino={categoriaDestino}
                  onCambioCategoria={handleCambioCategoria}
                  tieneGlobal={tieneGlobal}
                  unidades={unidades}
                  unidadesEnAlcanceIds={unidadesEnAlcanceIds}
                  ramaOrigenId={asignacionPrincipal?.unidad?.ramaId ?? null}
                  ramas={ramas}
                  ramaSeleccionadaId={ramaSeleccionadaId}
                  ramaSeleccionadaObj={ramaSeleccionadaObj}
                  unidadesRamaSeleccionada={unidadesRamaSeleccionada}
                  unidadDestinoId={unidadDestinoId}
                  setUnidadDestinoId={setUnidadDestinoId}
                  rolDestinoId={rolDestinoId}
                  setRolDestinoId={setRolDestinoId}
                  rolesRama={rolesRama}
                  rolesSinRama={rolesSinRama}
                  rolesJefatura={rolesJefatura}
                  onSeleccionarRama={handleSeleccionarRama}
                  onEjecutarPase={handleEjecutarPase}
                  ejecutandoPase={ejecutandoPase}
                  esMismoDestino={esMismoDestino}
                  asignacionesActivas={asignacionesActivas}
                  puedeCerrarAsignacion={(asig) =>
                    puedeCerrarAsignacionPorAlcance(asig, {
                      esGlobal,
                      unidadesEnAlcanceIds,
                      esMismoUsuario,
                    })
                  }
                  onCerrarAsignacion={handleCerrarAsignacion}
                  onAgregarAsignacion={
                    esGlobal || unidadesEnAlcanceIds.length > 0
                      ? handleAgregarAsignacion
                      : undefined
                  }
                  asignacionPrincipalId={asignacionPrincipal?.id}
                />
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 5: SEGURIDAD Y CONTRASEÑA                        */}
              {/* ======================================================== */}
              {tab === 'seguridad' && (
                <PestanaSeguridad
                  miembro={miembro}
                  reseteandoClave={reseteandoClave}
                  claveTemporalGenerada={claveTemporalGenerada}
                  onResetClave={handleResetClave}
                />
              )}
            </>
          ) : null}
        </div>
      </div>

      {modalConf && <ModalConfirmacion {...modalConf} />}

      {modalCobrarAbierto && miembro && (
        <ModalCobrarDeuda
          abierto={modalCobrarAbierto}
          miembro={{
            id: miembro.id,
            nombre: miembro.nombre,
            apellido: miembro.apellido,
            dni: miembro.dni,
            saldoAFavor,
          }}
          cargosPendientes={estadoCuenta?.cargos || CARGOS_VACIOS}
          cargoInicialId={cargoIdACobrar}
          onCerrar={() => setModalCobrarAbierto(false)}
          onPagoExitoso={(mensaje) => {
            setAlerta({ tipo: 'exito', texto: mensaje });
            cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}

      {modalGenerarDeudaAbierto && miembro && (
        <ModalGenerarDeudaManual
          abierto={modalGenerarDeudaAbierto}
          miembro={{
            id: miembro.id,
            nombre: miembro.nombre,
            apellido: miembro.apellido,
            dni: miembro.dni,
          }}
          onCerrar={() => setModalGenerarDeudaAbierto(false)}
          onGenerado={(mensaje) => {
            setAlerta({ tipo: 'exito', texto: mensaje });
            cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}

      {modalEditarFamiliaAbierto && (miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar) && (
        <ModalEditarFamilia
          abierto={modalEditarFamiliaAbierto}
          familia={miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar}
          onCerrar={() => setModalEditarFamiliaAbierto(false)}
          onGuardado={() => {
            setAlerta({ tipo: 'exito', texto: 'Descuento familiar actualizado.' });
            if (miembro) cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}

      {modalVincularHermanoAbierto && miembro && (
        <ModalVincularHermano
          abierto={modalVincularHermanoAbierto}
          usuarioId={miembro.id}
          usuarioNombre={`${miembro.nombre} ${miembro.apellido}`}
          onCerrar={() => setModalVincularHermanoAbierto(false)}
          onVinculado={() => {
            setAlerta({ tipo: 'exito', texto: 'Hermano vinculado.' });
            if (miembro) cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}
    </div>
  );
};
