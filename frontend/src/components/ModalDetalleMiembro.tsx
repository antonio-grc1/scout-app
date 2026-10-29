import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ModalConfirmacion, type ModalConfirmacionProps } from './ModalConfirmacion';
import { ModalCobrarDeuda } from './ModalCobrarDeuda';
import { ModalGenerarDeudaManual } from './ModalGenerarDeudaManual';
import { ModalEditarFamilia } from './ModalEditarFamilia';
import { ModalVincularHermano } from './ModalVincularHermano';
import { obtenerConfigRama, RAMA_COLORS } from '../lib/ramaColors';
import {
  ESTADO_FICHA_CONFIG,
  ESTADO_CARGO_CONFIG,
  METODO_PAGO_LABELS,
  NOMBRES_MESES_CORTOS,
  calcularEdad,
  esRolAlcanceGlobal,
  esRolDeEducador,
  esRolDeProtagonista,
  formatearMoneda,
  rolRequiereRama,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
} from '../lib/formatters';
import { BotonLlamarMiembro } from './BotonLlamarMiembro';
import { usePermisosUI } from '../lib/permisos';
import {
  X,
  User,
  Users,
  FileCheck2,
  CreditCard,
  KeyRound,
  ArrowRightLeft,
  Save,
  Sparkles,
  FileText,
  Download,
  Wallet,
  PlusCircle,
  Receipt,
  Phone,
  Ban,
  Pencil,
  Loader2,
  Eye,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  generarFichaPdf,
  descargarPdfBlob,
  crearUrlPdfBlob,
  type MapeoPdf,
} from '../services/pdfGenerator';
import { DynamicFormRenderer, type EsquemaCampos } from './DynamicFormRenderer';
import { VisorFichaMiembro } from './VisorFichaMiembro';

interface Props {
  usuarioId: number | null;
  onCerrar: () => void;
  onActualizado?: () => void;
  onClaveReseteada?: (mensaje: string) => void;
  tabInicial?: 'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas';
}

const esUnidadRama = (u: any) => u?.tipo === 'SECCION_RAMA' || u?.ramaId != null;
const esUnidadJefatura = (u: any) => u?.tipo === 'JEFATURA';
const esUnidadSinRama = (u: any) => u?.tipo === 'SIN_RAMA_APOYO';

const esRolJefe = (r: any) => !rolRequiereRama(r) && esRolAlcanceGlobal(r);
const esRolSinRama = (r: any) => !rolRequiereRama(r) && !esRolAlcanceGlobal(r);
const esRolRama = (r: any) => rolRequiereRama(r);

const getRamaColorConfig = (nombreRama: string) => {
  const n = (nombreRama || '').toLowerCase();
  if (n.includes('lobat')) return RAMA_COLORS.lobatos;
  if (n.includes('scout')) return RAMA_COLORS.scout;
  if (n.includes('caminant')) return RAMA_COLORS.caminantes;
  if (n.includes('rover')) return RAMA_COLORS.rover;
  return RAMA_COLORS.otro;
};


export const ModalDetalleMiembro: React.FC<Props> = ({
  usuarioId,
  onCerrar,
  onActualizado,
  onClaveReseteada,
  tabInicial = 'datos',
}) => {
  const { tieneGlobal, tienePermiso, refrescarSesionDesdeServidor } = useAuthStore();
  const { canEdit, canView } = usePermisosUI();
  const puedeEditarIdentidad = canEdit('miembro', 'identidad');
  const puedeEditarContacto = canEdit('miembro', 'contacto');
  const puedeDarBaja = canEdit('miembro', 'estado');
  const puedeEditarFamilia = canEdit('miembro', 'familia');
  const puedeEditarDescuento = canEdit('miembro', 'descuentoFamiliar');
  const puedeEditarMiembro = puedeEditarIdentidad || puedeEditarContacto || puedeDarBaja;
  const puedeVerCuotas = canView('cuotas');
  const puedeCobrarCuotas = canEdit('cuotas', 'cobrar');
  const puedeGestionarTesoreria = tienePermiso('tesoreria.gestionar');
  const puedeVerFicha = canView('ficha');
  const puedeCompletarFicha = canEdit('ficha', 'completar');
  const puedeValidarFisico = canEdit('ficha', 'validarFisico');
  const puedeHacerPases = canEdit('miembro', 'pase');
  const puedeResetearClave = canEdit('miembro', 'clave');
  const [tab, setTab] = useState<'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas'>(tabInicial);
  const [miembro, setMiembro] = useState<any | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ramas, setRamas] = useState<any[]>([]);
  const [candidatosPase, setCandidatosPase] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ejecutandoPase, setEjecutandoPase] = useState(false);
  const [reseteandoClave, setReseteandoClave] = useState(false);
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

  const rolesRama = useMemo(() => roles.filter(esRolRama), [roles]);
  const rolesSinRama = useMemo(() => {
    const sr = roles.filter((r) => !rolRequiereRama(r) && (!esRolAlcanceGlobal(r) || tieneGlobal()));
    return sr.length > 0 ? sr : roles.filter((r) => !rolRequiereRama(r));
  }, [roles, tieneGlobal]);
  const rolesJefatura = useMemo(() => {
    const jf = roles.filter((r) => !rolRequiereRama(r) && esRolAlcanceGlobal(r));
    return jf.length > 0 ? jf : roles.filter((r) => !rolRequiereRama(r));
  }, [roles]);

  const asignacionPrincipal = miembro?.asignaciones?.[0];

  const esMismoDestino = useMemo(() => {
    if (!asignacionPrincipal) return false;
    const unidadIdActual = asignacionPrincipal.unidad?.id ?? asignacionPrincipal.unidadId;
    const rolIdActual = asignacionPrincipal.rol?.id ?? asignacionPrincipal.rolId;
    return (
      Number(unidadDestinoId) === unidadIdActual && Number(rolDestinoId) === rolIdActual
    );
  }, [asignacionPrincipal, unidadDestinoId, rolDestinoId]);

  const esEducador = esRolDeEducador(asignacionPrincipal?.rol);

  const candidatoPase = candidatosPase.find((c) => c.usuario?.id === miembro?.id);

  useEffect(() => {
    if (!usuarioId) {
      setMiembro(null);
      setAlerta(null);
      setEditandoFicha(false);
      return;
    }
    setTab(tabInicial);
    setAlerta(null);
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

      const asig = m.asignaciones?.[0];
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
            (resRoles.data || []).find((r: any) => !rolRequiereRama(r));
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
        payload.datosFijosJson = {
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
      const r = roles.find(esRolSinRama) || roles.find((x) => !rolRequiereRama(x));
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
      if (!currentRol || !esRolRama(currentRol)) {
        const asig = miembro?.asignaciones?.[0];
        const eraEdu = esRolDeEducador(asig?.rol);
        const rolDefecto = eraEdu
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
    if (!currentRol || !esRolRama(currentRol)) {
      const asig = miembro?.asignaciones?.[0];
      const eraEdu = esRolDeEducador(asig?.rol);
      const rolDefecto = eraEdu
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
      await api.post('/pases', {
        asignacionOrigenId: asignacionPrincipal.id,
        unidadDestinoId: unidadDestinoId ? Number(unidadDestinoId) : undefined,
        rolDestinoId: rolDestinoId ? Number(rolDestinoId) : undefined,
      });

      setAlerta({
        tipo: 'exito',
        texto: `Pase / cambio de rol a ${nombreDestino} realizado.`,
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

  const handleResetClave = () => {
    if (!miembro) return;

    setModalConf({
      abierto: true,
      titulo: 'Restablecer Contraseña',
      mensaje: `La contraseña de ${miembro.nombre} ${miembro.apellido} volverá a ser su DNI (${miembro.dni}).`,
      tipo: 'peligro',
      textoConfirmar: 'Restablecer a DNI',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        setReseteandoClave(true);
        setAlerta(null);
        try {
          const res = await api.post(`/auth/usuarios/${miembro.id}/resetear-clave`);
          setModalConf(null);
          setAlerta({
            tipo: 'exito',
            texto: `Contraseña restablecida a su DNI (${miembro.dni}).`,
          });
          if (onClaveReseteada) onClaveReseteada(res.data.mensaje);
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
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      const payload: any = {
        montoOriginal: Number(cargoEditando.montoOriginal),
        montoDescuento: Number(cargoEditando.montoDescuento || 0),
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
    const res = await api.get('/legajos/plantillas?cicloAnio=2026');
    let lista = Array.isArray(res.data) ? res.data : [];
    if (lista.length === 0) {
      const resTodas = await api.get('/legajos/plantillas');
      lista = Array.isArray(resTodas.data) ? resTodas.data : [];
    }
    const p = seleccionarPlantillaPorMiembro(lista, miembro) || lista[0] || null;
    setPlantillaActiva(p);
    return p;
  };

  const generarBytesPdfMiembro = async (ent?: any): Promise<Uint8Array> => {
    let mapeo: MapeoPdf;
    if (ent?.plantillaId) {
      const res = await api.get(`/legajos/plantillas/${ent.plantillaId}`);
      mapeo = res.data.mapeoPdfJson;
    } else {
      const p = await obtenerPlantillaActiva();
      mapeo = p?.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
    }

    const ramaNombre = miembro.asignaciones?.[0]?.unidad?.nombre || '';
    const respuestasBase = ent?.respuestasSnapshotJson || {
      protagonista_telefono: miembro.telefonoContacto || '',
      protagonista_domicilio: miembro.datosFijosJson?.domicilio || '',
      ...(miembro.datosFijosJson || {}),
    };

    return await generarFichaPdf(
      mapeo,
      respuestasBase,
      ent?.hashVerificacion || `FICHA-${miembro.dni}-2026`,
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
        `/legajos/miembro/${miembro.id}/plantilla/${p.id}/precarga?cicloAnio=${p.cicloAnio || 2026}`,
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
        cicloAnio: plantillaActiva.cicloAnio || 2026,
        respuestas: datos,
        finalizarParaFirma,
        actualizarDatosFijos: true,
      });

      const entrega = res.data;
      if (finalizarParaFirma && entrega.hashVerificacion) {
        const ramaNombre = miembro.asignaciones?.[0]?.unidad?.nombre || '';
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-surface rounded-t-3xl sm:rounded-3xl w-full max-w-2xl overflow-hidden shadow-md flex flex-col max-h-[92vh] border border-rule transition-colors animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 text-ink">
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
              <p className="text-xs text-ink-muted truncate">
                DNI {miembro?.dni || '—'} • {calcularEdad(miembro?.fechaNacimiento) ?? '—'} años •{' '}
                {asignacionPrincipal?.unidad?.nombre || 'Sin Sección'}
              </p>
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
        <div className="flex border-b border-rule bg-surface px-3 overflow-x-auto no-scrollbar text-xs font-bold text-ink-muted shrink-0">
          <button
            onClick={() => setTab('datos')}
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
        </div>

        {/* Alerta interna */}
        {alerta && (
          <div
            className={`mx-4 mt-3 p-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
              alerta.tipo === 'exito'
                ? 'bg-brand/10 border-brand/30 text-ink'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
            }`}
          >
            <span>{alerta.texto}</span>
            <button onClick={() => setAlerta(null)} className="ml-2 p-1 cursor-pointer">
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
                <form onSubmit={handleGuardarDatos} className="space-y-4">
                  {(() => {
                    type Campo = {
                      key: keyof typeof formData;
                      label: string;
                      editable: boolean;
                      type?: string;
                      placeholder?: string;
                      full?: boolean;
                      multiline?: boolean;
                      required?: boolean;
                    };
                    const campos: Campo[] = [
                      { key: 'nombre', label: 'Nombre', editable: puedeEditarIdentidad, required: true },
                      { key: 'apellido', label: 'Apellido', editable: puedeEditarIdentidad, required: true },
                      { key: 'dni', label: 'DNI', editable: puedeEditarIdentidad, required: true },
                      { key: 'fechaNacimiento', label: 'Fecha de Nacimiento', editable: puedeEditarIdentidad, type: 'date', required: true },
                      { key: 'telefonoContacto', label: 'Teléfono del Miembro', editable: puedeEditarContacto, type: 'tel', placeholder: 'Ej: 3511234567' },
                      { key: 'emailContacto', label: 'Email', editable: puedeEditarContacto, type: 'email', placeholder: 'correo@ejemplo.com' },
                      { key: 'madreNombres', label: 'Nombre y Apellido Madre', editable: puedeEditarContacto, placeholder: 'Nombre y apellido de la madre' },
                      { key: 'madreTelefono', label: 'Teléfono Madre', editable: puedeEditarContacto, type: 'tel', placeholder: 'Celular madre' },
                      { key: 'padreNombres', label: 'Nombre y Apellido Padre', editable: puedeEditarContacto, placeholder: 'Nombre y apellido del padre' },
                      { key: 'padreTelefono', label: 'Teléfono Padre', editable: puedeEditarContacto, type: 'tel', placeholder: 'Celular padre' },
                      { key: 'tutorNombres', label: 'Nombre y Apellido Tutor/a', editable: puedeEditarContacto, placeholder: 'Nombre y apellido del tutor/a' },
                      { key: 'tutorTelefono', label: 'Teléfono Tutor/a', editable: puedeEditarContacto, type: 'tel', placeholder: 'Celular tutor/a' },
                      { key: 'telefonoUrgencias', label: 'Teléfono de Urgencias', editable: puedeEditarContacto, type: 'tel', placeholder: 'Alternativo para emergencias' },
                      { key: 'domicilio', label: 'Domicilio', editable: puedeEditarContacto, placeholder: 'Calle y número' },
                      { key: 'obraSocial', label: 'Obra Social / Prepaga', editable: puedeEditarContacto, placeholder: 'OSDE, Apross, etc.', full: true },
                      { key: 'alergias', label: 'Alergias o Cuidados Médicos', editable: puedeEditarContacto, placeholder: 'Alergias, medicación habitual o dieta especial', full: true, multiline: true },
                    ];
                    const claseInput =
                      'w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors';
                    const mostrarValor = (c: Campo) => {
                      const v = String(formData[c.key] ?? '');
                      if (!v) return null;
                      if (c.type === 'date') return new Date(`${v}T00:00:00`).toLocaleDateString('es-AR');
                      return v;
                    };
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {campos.map((c) => {
                          const valor = mostrarValor(c);
                          // Solo lectura limpio: si no puede editar y no hay dato, no mostrar el campo
                          if (!c.editable && !valor) return null;
                          return (
                            <div key={c.key} className={c.full ? 'sm:col-span-2' : ''}>
                              <label className="block text-ink-2 font-bold mb-1">
                                {c.label}
                                {c.editable && c.required ? ' *' : ''}
                              </label>
                              {c.editable ? (
                                c.multiline ? (
                                  <textarea
                                    rows={2}
                                    placeholder={c.placeholder}
                                    value={String(formData[c.key] ?? '')}
                                    onChange={(e) => setFormData({ ...formData, [c.key]: e.target.value })}
                                    className={claseInput}
                                  />
                                ) : (
                                  <input
                                    type={c.type || 'text'}
                                    inputMode={c.type === 'tel' ? 'tel' : c.key === 'dni' ? 'numeric' : undefined}
                                    required={c.required}
                                    placeholder={c.placeholder}
                                    value={String(formData[c.key] ?? '')}
                                    onChange={(e) => setFormData({ ...formData, [c.key]: e.target.value })}
                                    className={`${claseInput} ${c.key === 'dni' ? 'font-mono' : ''}`}
                                  />
                                )
                              ) : (
                                <p className="min-h-[42px] px-1 py-2 text-sm font-semibold text-ink whitespace-pre-wrap break-words">
                                  {valor}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Grupo Familiar */}
                  {(() => {
                    const familiar = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
                    const integrantesFamilia = familiar?.miembros || [];
                    const pctDesc = familiar ? Number(familiar.porcentajeDescuentoHermanos ?? 0) : 0;

                    return (
                      <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/30 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Users className="w-4 h-4 text-brand" />
                            <span className="font-bold text-ink">
                              {familiar ? familiar.nombreFamilia : 'Sin hermanos vinculados'}
                            </span>
                            {familiar && pctDesc > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-brand/20 text-brand font-bold text-[10px] font-bold">
                                -{pctDesc}% cuota
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {familiar && (
                              <button
                                type="button"
                                onClick={() => setModalEditarFamiliaAbierto(true)}
                                className="min-h-[38px] px-3 rounded-xl border border-brand/40 bg-surface text-brand font-bold text-xs cursor-pointer"
                              >
                                Descuento ({pctDesc}%)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setModalVincularHermanoAbierto(true)}
                              className="min-h-[38px] px-3 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs cursor-pointer transition-colors"
                            >
                              + Hermano
                            </button>
                          </div>
                        </div>

                        {integrantesFamilia.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rule">
                            <span className="text-[11px] font-bold text-ink-muted mr-1">
                              Integrantes:
                            </span>
                            {integrantesFamilia.map((h: any) => (
                              <span
                                key={h.id}
                                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl bg-surface border border-brand/30 text-xs font-bold text-ink"
                              >
                                <span>
                                  {h.nombre} {h.apellido}
                                </span>
                                <button
                                  type="button"
                                  disabled={desvinculandoMiembroId === h.id}
                                  onClick={() =>
                                    handleDesvincularRapido(h.id, `${h.nombre} ${h.apellido}`)
                                  }
                                  title={`Quitar a ${h.nombre} del grupo familiar`}
                                  className="px-1.5 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold transition cursor-pointer disabled:opacity-50"
                                >
                                  {desvinculandoMiembroId === h.id ? '...' : 'Quitar'}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Estado Activo / Baja y Botón Guardar */}
                  {puedeEditarMiembro && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-rule">
                      <label className="flex items-center gap-2.5 cursor-pointer min-h-[42px]">
                        <input
                          type="checkbox"
                          checked={formData.activo}
                          onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                          className="w-5 h-5 text-brand rounded border-rule cursor-pointer focus:ring-brand/20"
                        />
                        <span className="font-bold text-ink-2">
                          {formData.activo ? 'Miembro activo en el grupo' : 'Dado de baja (Inactivo)'}
                        </span>
                      </label>

                      <button
                        type="submit"
                        disabled={guardando}
                        className="min-h-[44px] px-5 bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 2: CUOTAS Y PAGOS (Tarjetas Mobile-First + 1-Tap) */}
              {/* ======================================================== */}
              {tab === 'cuotas' && (
                <div className="space-y-4">
                  {/* Resumen Financiero + Botones de Acción Directa */}
                  <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <span className="text-xs font-semibold text-ink-muted block">
                          Deuda Total
                        </span>
                        <span
                          className={`text-xl font-black ${
                            saldoPendiente > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-ink'
                          }`}
                        >
                          {formatearMoneda(saldoPendiente)}
                        </span>
                      </div>

                      <div className="pl-4 border-l border-rule">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                            Saldo a Favor
                          </span>
                          {puedeGestionarTesoreria && (
                            <button
                              type="button"
                              onClick={() => {
                                setAjustandoSaldo(!ajustandoSaldo);
                                setMontoAjusteSaldo('');
                                setMotivoAjusteSaldo('');
                              }}
                              className="text-[10px] font-bold text-teal-700 dark:text-teal-300 underline hover:opacity-80 cursor-pointer"
                            >
                              {ajustandoSaldo ? 'Cerrar' : 'Ajustar'}
                            </button>
                          )}
                        </div>
                        <span className="text-xl font-black text-teal-600 dark:text-teal-400">
                          {formatearMoneda(saldoAFavor)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {puedeGestionarTesoreria && (
                        <button
                          type="button"
                          onClick={() => setModalGenerarDeudaAbierto(true)}
                          className="min-h-[42px] px-3.5 rounded-xl border border-rule bg-surface text-ink-2 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <PlusCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span>+ Cargo</span>
                        </button>
                      )}

                      {puedeCobrarCuotas && (
                        <button
                          type="button"
                          onClick={() => {
                            setCargoIdACobrar(null);
                            setModalCobrarAbierto(true);
                          }}
                          className="min-h-[42px] px-4 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>{saldoPendiente > 0 ? 'Cobrar / Pagar' : 'Registrar Adelanto'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panel desplegable de Ajuste Manual de Saldo a Favor */}
                  {ajustandoSaldo && (
                    <form
                      onSubmit={handleGuardarAjusteSaldo}
                      className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 space-y-3 animate-in fade-in"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-teal-950 dark:text-teal-100 flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-teal-600" />
                          Ajustar Saldo a Favor Manualmente
                        </span>
                        <button
                          type="button"
                          onClick={() => setAjustandoSaldo(false)}
                          className="text-ink-muted hover:text-ink cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { k: 'CARGAR', label: '+ Cargar saldo' },
                          { k: 'DESCONTAR', label: '- Devolver / Descontar' },
                          { k: 'FIJAR', label: '= Fijar saldo exacto' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.k}
                            type="button"
                            onClick={() => setTipoAjusteSaldo(opt.k)}
                            className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                              tipoAjusteSaldo === opt.k
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-surface text-ink-2 border-rule'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-teal-900 dark:text-teal-200 mb-1">
                            {tipoAjusteSaldo === 'FIJAR' ? 'Nuevo Saldo ($)' : 'Monto ($)'} *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min={tipoAjusteSaldo === 'FIJAR' ? 0 : 0.01}
                            required
                            value={montoAjusteSaldo}
                            onChange={(e) => setMontoAjusteSaldo(e.target.value)}
                            placeholder="Ej: 5000"
                            className="w-full px-3 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-surface text-xs font-bold text-ink"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-teal-900 dark:text-teal-200 mb-1">
                            Motivo / Nota (opcional)
                          </label>
                          <input
                            type="text"
                            value={motivoAjusteSaldo}
                            onChange={(e) => setMotivoAjusteSaldo(e.target.value)}
                            placeholder="Ej: Devolución en mano, saldo año anterior..."
                            className="w-full px-3 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-surface text-xs text-ink"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setAjustandoSaldo(false)}
                          className="px-3 py-1.5 rounded-xl border border-rule text-xs font-semibold text-ink-2 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={procesandoAccionCuota || montoAjusteSaldo === ''}
                          className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          {procesandoAccionCuota ? 'Guardando...' : 'Aplicar Ajuste'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Barra rápida de Grupo Familiar y Descuento Hermanos */}
                  {(() => {
                    const familiar = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
                    const integrantesFamilia = familiar?.miembros || [];
                    const pctDesc = familiar ? Number(familiar.porcentajeDescuentoHermanos ?? 0) : 0;

                    return (
                      <div className="p-3 rounded-2xl bg-brand/10 border border-brand/30 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Users className="w-4 h-4 text-brand shrink-0" />
                            <span className="font-bold text-ink text-xs">
                              {familiar ? familiar.nombreFamilia : 'Sin grupo familiar'}
                            </span>
                            {familiar && (
                              <span className="px-2 py-0.5 rounded-full bg-brand/15 text-brand text-[10px] font-bold">
                                {pctDesc > 0 ? `-${pctDesc}% desc. hermanos` : '0% desc.'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {familiar && (
                              <button
                                type="button"
                                onClick={() => setModalEditarFamiliaAbierto(true)}
                                className="px-2.5 py-1 rounded-lg bg-surface border border-brand/40 text-brand font-bold text-[11px] cursor-pointer"
                              >
                                Editar Familia ({pctDesc}%)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setModalVincularHermanoAbierto(true)}
                              className="px-2.5 py-1 rounded-lg bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-[11px] cursor-pointer transition-colors"
                            >
                              + Hermano
                            </button>
                          </div>
                        </div>

                        {integrantesFamilia.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rule">
                            <span className="text-[11px] font-bold text-ink-muted mr-1">
                              Integrantes:
                            </span>
                            {integrantesFamilia.map((h: any) => (
                              <span
                                key={h.id}
                                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-lg bg-surface border border-brand/30 text-[11px] font-bold text-ink"
                              >
                                <span>
                                  {h.nombre} {h.apellido}
                                </span>
                                <button
                                  type="button"
                                  disabled={desvinculandoMiembroId === h.id}
                                  onClick={() =>
                                    handleDesvincularRapido(h.id, `${h.nombre} ${h.apellido}`)
                                  }
                                  title={`Quitar a ${h.nombre} del grupo familiar`}
                                  className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold transition cursor-pointer disabled:opacity-50"
                                >
                                  {desvinculandoMiembroId === h.id ? '...' : 'Quitar'}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Lista de Cuotas / Cargos en Tarjetas Mobile-First */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-ink-muted block">
                      Cuotas y Conceptos Activos ({estadoCuenta?.cargos?.length || 0})
                    </span>

                    {estadoCuenta?.cargos?.length > 0 ? (
                      <div className="space-y-2">
                        {estadoCuenta.cargos.map((c: any) => {
                          const pendiente = Math.max(
                            0,
                            Number(c.montoFinal) - Number(c.montoPagado),
                          );
                          const desc = Number(c.montoDescuento ?? 0);
                          const cfgEstado =
                            ESTADO_CARGO_CONFIG[c.estado] || ESTADO_CARGO_CONFIG.PENDIENTE;
                          const puedeCobrar = c.estado !== 'PAGADO' && c.estado !== 'ANULADO';
                          const estaEditandoEste = cargoEditando?.id === c.id;

                          return (
                            <div
                              key={c.id}
                              className="p-3.5 rounded-2xl bg-surface border border-rule space-y-3"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-ink text-sm">
                                      {c.concepto?.nombre || 'Cuota'}
                                    </span>
                                    {c.concepto?.mes && (
                                      <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                        {NOMBRES_MESES_CORTOS[c.concepto.mes]}
                                      </span>
                                    )}
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfgEstado.badgeClass}`}
                                    >
                                      {cfgEstado.label}
                                    </span>
                                  </div>

                                  <div className="text-xs text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span>
                                      Total: <strong>{formatearMoneda(c.montoFinal)}</strong>
                                    </span>
                                    {desc > 0 && (
                                      <span className="text-brand font-semibold">
                                        (Base {formatearMoneda(c.montoOriginal)} • Desc. -{formatearMoneda(desc)})
                                      </span>
                                    )}
                                    {Number(c.montoPagado) > 0 && (
                                      <span className="text-teal-700 dark:text-teal-300 font-semibold">
                                        Abonado: {formatearMoneda(c.montoPagado)}
                                      </span>
                                    )}
                                    {pendiente > 0 && c.estado !== 'ANULADO' && (
                                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                                        Resta: {formatearMoneda(pendiente)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Acciones 1-Tap por Cuota */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {puedeCobrar && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCargoIdACobrar(c.id);
                                        setModalCobrarAbierto(true);
                                      }}
                                      className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" />
                                      <span>Cobrar {formatearMoneda(pendiente)}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      estaEditandoEste
                                        ? setCargoEditando(null)
                                        : handleIniciarEdicionCargo(c)
                                    }
                                    title="Editar monto o descuento de esta cuota"
                                    className="min-h-[38px] px-2.5 rounded-xl border border-rule text-ink-2 hover:bg-paper-2 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleAnularCargo(c)}
                                    title="Anular cuota (si tiene pagos, pasan a Saldo a Favor)"
                                    className="min-h-[38px] px-2.5 rounded-xl border border-rose-200/70 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Editor en línea de la cuota */}
                              {estaEditandoEste && cargoEditando && (
                                <form
                                  onSubmit={handleGuardarEdicionCargo}
                                  className="pt-3 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-in fade-in"
                                >
                                  {cargoEditando.esIndividual && (
                                    <div className="sm:col-span-3">
                                      <label className="block text-[11px] font-bold text-ink-2 mb-1">
                                        Concepto / Motivo
                                      </label>
                                      <input
                                        type="text"
                                        required
                                        value={cargoEditando.nombreConcepto}
                                        onChange={(e) =>
                                          setCargoEditando({
                                            ...cargoEditando,
                                            nombreConcepto: e.target.value,
                                          })
                                        }
                                        className="w-full px-3 py-1.5 rounded-xl border border-rule bg-paper-2 text-xs"
                                      />
                                    </div>
                                  )}
                                  <div>
                                    <label className="block text-[11px] font-bold text-ink-2 mb-1">
                                      Monto Original ($)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      required
                                      value={cargoEditando.montoOriginal}
                                      onChange={(e) =>
                                        setCargoEditando({
                                          ...cargoEditando,
                                          montoOriginal: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-1.5 rounded-xl border border-rule bg-paper-2 text-xs font-bold"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-bold text-ink-2 mb-1">
                                      Descuento ($)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={cargoEditando.montoDescuento}
                                      onChange={(e) =>
                                        setCargoEditando({
                                          ...cargoEditando,
                                          montoDescuento: e.target.value,
                                        })
                                      }
                                      className="w-full px-3 py-1.5 rounded-xl border border-rule bg-paper-2 text-xs font-bold text-brand"
                                    />
                                  </div>
                                  <div className="flex items-end justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setCargoEditando(null)}
                                      className="px-3 py-1.5 rounded-xl border border-rule text-xs font-semibold cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={procesandoAccionCuota}
                                      className="px-3.5 py-1.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold cursor-pointer disabled:opacity-50 transition-colors"
                                    >
                                      Guardar
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-6 text-center bg-paper-2 rounded-2xl border border-rule text-ink-muted">
                        Sin cuotas activas asignadas.
                      </div>
                    )}
                  </div>

                  {/* Cuotas Anuladas (Colapsable, permite Reactivar o Eliminar definitivamente) */}
                  {estadoCuenta?.cargosAnulados?.length > 0 && (
                    <div className="border border-rule rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setMostrarAnulados(!mostrarAnulados)}
                        className="w-full p-3 bg-paper-2 flex items-center justify-between text-xs font-bold text-ink-2 cursor-pointer"
                      >
                        <span>
                          Cuotas anuladas ({estadoCuenta.cargosAnulados.length})
                        </span>
                        {mostrarAnulados ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>

                      {mostrarAnulados && (
                        <div className="p-3 space-y-2 bg-surface divide-y divide-rule">
                          {estadoCuenta.cargosAnulados.map((ca: any) => (
                            <div
                              key={ca.id}
                              className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <span className="font-bold text-ink-2 line-through">
                                  {ca.concepto?.nombre || 'Cuota'}
                                </span>
                                <span className="ml-2 text-ink-muted">
                                  ({formatearMoneda(ca.montoFinal)})
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={procesandoAccionCuota}
                                  onClick={() =>
                                    handleReactivarCargo(ca.id, ca.concepto?.nombre || 'Cuota')
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand border border-brand/30 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reactivar</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={procesandoAccionCuota}
                                  onClick={() =>
                                    handleEliminarCargoDefinitivo(
                                      ca.id,
                                      ca.concepto?.nombre || 'Cuota',
                                    )
                                  }
                                  title="Eliminar definitivamente"
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Historial de Pagos (con Edición y Reversión) */}
                  {estadoCuenta?.pagos?.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-rule">
                      <span className="text-xs font-semibold text-ink-muted flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Pagos Registrados ({estadoCuenta.pagos.length})</span>
                      </span>

                      <div className="space-y-2">
                        {estadoCuenta.pagos.map((p: any) => {
                          const editandoEstePago = pagoEditando?.id === p.id;
                          const conceptosImputados =
                            p.imputaciones
                              ?.map((imp: any) => imp.cargo?.concepto?.nombre)
                              .filter(Boolean)
                              .join(', ') || 'Pago a cuenta / Saldo a favor';

                          return (
                            <div
                              key={p.id}
                              className="p-3 rounded-xl bg-paper-2 border border-rule space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-extrabold text-brand text-sm">
                                      +{formatearMoneda(p.montoTotal)}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-surface text-ink-2 text-[10px] font-bold border border-rule">
                                      {METODO_PAGO_LABELS[p.metodoPago] || p.metodoPago}
                                    </span>
                                    <span className="text-[11px] text-ink-muted font-semibold truncate">
                                      {conceptosImputados}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-ink-muted block mt-0.5">
                                    {new Date(p.fechaPago).toLocaleDateString('es-AR')}
                                    {p.referenciaComprobante &&
                                      ` • Comprobante: ${p.referenciaComprobante}`}
                                    {p.observaciones && ` • ${p.observaciones}`}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      editandoEstePago
                                        ? setPagoEditando(null)
                                        : setPagoEditando({
                                            id: p.id,
                                            metodoPago: p.metodoPago || 'EFECTIVO',
                                            referenciaComprobante: p.referenciaComprobante || '',
                                            observaciones: p.observaciones || '',
                                          })
                                    }
                                    title="Editar método o comprobante"
                                    className="p-1.5 rounded-lg text-ink-muted hover:bg-paper-3 cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRevertirPago(p)}
                                    title="Revertir / Anular este pago"
                                    className="px-2 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Revertir</span>
                                  </button>
                                </div>
                              </div>

                              {editandoEstePago && pagoEditando && (
                                <form
                                  onSubmit={handleGuardarEdicionPago}
                                  className="pt-2 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in"
                                >
                                  <select
                                    value={pagoEditando.metodoPago}
                                    onChange={(e) =>
                                      setPagoEditando({
                                        ...pagoEditando,
                                        metodoPago: e.target.value as any,
                                      })
                                    }
                                    className="px-2.5 py-1.5 rounded-xl border border-rule bg-surface text-xs font-semibold"
                                  >
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="TRANSFERENCIA">Transferencia</option>
                                    <option value="OTRO">Otro</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={pagoEditando.referenciaComprobante}
                                    onChange={(e) =>
                                      setPagoEditando({
                                        ...pagoEditando,
                                        referenciaComprobante: e.target.value,
                                      })
                                    }
                                    placeholder="N° Comprobante"
                                    className="px-2.5 py-1.5 rounded-xl border border-rule bg-surface text-xs"
                                  />
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={pagoEditando.observaciones}
                                      onChange={(e) =>
                                        setPagoEditando({
                                          ...pagoEditando,
                                          observaciones: e.target.value,
                                        })
                                      }
                                      placeholder="Observaciones"
                                      className="flex-1 px-2.5 py-1.5 rounded-xl border border-rule bg-surface text-xs"
                                    />
                                    <button
                                      type="submit"
                                      disabled={procesandoAccionCuota}
                                      className="px-3 py-1.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold cursor-pointer transition-colors"
                                    >
                                      OK
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 3: FICHA MÉDICA (1-Tap Validación, Descarga y Relleno) */}
              {/* ======================================================== */}
              {tab === 'ficha' && (
                <div className="space-y-3">
                  {editandoFicha && plantillaActiva && precargaFicha ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-ink-2">
                          Completando Ficha 2026
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditandoFicha(false)}
                          className="min-h-[36px] px-3 rounded-xl bg-paper-3 text-ink-2 font-bold text-xs cursor-pointer"
                        >
                          Volver al resumen
                        </button>
                      </div>

                      <DynamicFormRenderer
                        esquema={plantillaActiva.esquemaCamposJson as EsquemaCampos}
                        valoresIniciales={{
                          protagonista_telefono: precargaFicha.usuario?.telefonoContacto || '',
                          protagonista_domicilio:
                            (precargaFicha.usuario?.datosFijosJson as any)?.protagonista_domicilio ||
                            (precargaFicha.usuario?.datosFijosJson as any)?.domicilio ||
                            '',
                          ...(precargaFicha.datosFamiliaresSugeridos || {}),
                          ...(precargaFicha.usuario?.datosFijosJson || {}),
                          ...(precargaFicha.ultimaEntrega?.respuestasSnapshotJson || {}),
                        }}
                        onSubmit={handleGuardarFichaEducador}
                        cargando={guardando}
                      />
                    </div>
                  ) : (
                    (() => {
                      const ent = entregas[0] || null;
                      const estadoKey = ent?.estado || 'SIN_FICHA';
                      const cfgEstado =
                        ESTADO_FICHA_CONFIG[estadoKey] || ESTADO_FICHA_CONFIG.SIN_FICHA;
                      const esPendiente = ent?.estado === 'PENDIENTE_FIRMA_FISICA';

                      return (
                        <div className="space-y-3">
                          <div className="p-4 bg-surface rounded-2xl border border-rule space-y-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <span className="font-extrabold text-ink text-sm block">
                                  Ficha Médica y Autorizaciones 2026
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${cfgEstado.badgeClass}`}
                                  >
                                    {cfgEstado.label}
                                  </span>
                                </div>
                                {ent?.validadoPor && (
                                  <span className="block text-[11px] text-brand font-bold pt-0.5">
                                    ✓ Papel recibido por {ent.validadoPor.nombre}{' '}
                                    {ent.validadoPor.apellido}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Acciones Táctiles 1-Tap */}
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                              {esPendiente && puedeValidarFisico && (
                                <button
                                  type="button"
                                  disabled={validandoFichaId === ent.id}
                                  onClick={() => handleValidarFisicoDirecto(ent)}
                                  className="col-span-2 sm:flex-1 min-h-[44px] px-4 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                                >
                                  <FileCheck2 className="w-4 h-4" />
                                  <span>
                                    {validandoFichaId === ent.id
                                      ? 'Guardando...'
                                      : 'Recibir Papel'}
                                  </span>
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={generandoVistaPrevia}
                                onClick={() => handleVerPdfEducador(ent)}
                                className="min-h-[44px] px-3.5 rounded-xl bg-brand/10 hover:bg-brand/15 text-brand border border-brand/30 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {generandoVistaPrevia ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Eye className="w-4 h-4 text-brand" />
                                )}
                                <span>Ver Planilla PDF</span>
                              </button>

                              <button
                                type="button"
                                disabled={descargandoPdfId !== null}
                                onClick={() => handleDescargarPdfEducador(ent)}
                                className="min-h-[44px] px-3.5 rounded-xl bg-paper-3 hover:opacity-90 text-ink font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                              >
                                {descargandoPdfId !== null ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                                <span>Descargar PDF</span>
                              </button>

                              {puedeCompletarFicha && (
                                <button
                                  type="button"
                                  disabled={cargandoFichaEditor}
                                  onClick={handleAbrirEditorFicha}
                                  className="col-span-2 sm:col-span-1 min-h-[44px] px-3.5 rounded-xl border border-rule bg-surface text-ink-2 hover:bg-paper-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                >
                                  {cargandoFichaEditor ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Pencil className="w-4 h-4 text-brand" />
                                  )}
                                  <span>{ent ? 'Editar Ficha' : 'Rellenar Ficha'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Visualización Completa de la Ficha en Pantalla (Sin Descarga) */}
                          <VisorFichaMiembro
                            miembro={miembro}
                            entrega={ent}
                            pdfPreviewUrl={pdfPreviewUrl}
                            onCerrarPdfPreview={cerrarVistaPreviaPdf}
                            onDescargarPdf={() => handleDescargarPdfEducador(ent)}
                          />
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 4: PASE DE RAMA / CAMBIO DE SECCIÓN              */}
              {/* ======================================================== */}
              {tab === 'pase' && (
                <div className="space-y-4">
                  {candidatoPase && (
                    <div className="bg-brand/10 border border-brand/30 p-3.5 rounded-2xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-5 h-5 text-brand shrink-0" />
                        <div>
                          <span className="font-bold text-ink text-xs block">
                            Cumplió {candidatoPase.edad} años
                          </span>
                          <span className="text-[11px] text-ink-2">
                            Sugerido:{' '}
                            {candidatoPase.tipo === 'PROGRESION'
                              ? `Pasar a ${candidatoPase.ramaSugerida?.nombre}`
                              : 'Pasar a Equipo de Apoyo / Educador'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tipo de Destino */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCambioCategoria('RAMA')}
                      className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
                        categoriaDestino === 'RAMA'
                          ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/30 font-bold'
                          : 'border-rule text-ink-2'
                      }`}
                    >
                      Rama
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCambioCategoria('SIN_RAMA')}
                      className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
                        categoriaDestino === 'SIN_RAMA'
                          ? 'border-neutral-900 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ring-2 ring-neutral-400/30 font-bold'
                          : 'border-rule text-ink-2'
                      }`}
                    >
                      Sin Rama / Apoyo
                    </button>
                    {tieneGlobal() && (
                      <button
                        type="button"
                        onClick={() => handleCambioCategoria('JEFATURA')}
                        className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
                          categoriaDestino === 'JEFATURA'
                            ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/30'
                            : 'border-rule text-ink-2'
                        }`}
                      >
                        Jefatura / Global
                      </button>
                    )}
                  </div>

                  {categoriaDestino === 'RAMA' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ramas.map((rama) => {
                          const config = getRamaColorConfig(rama.nombre);
                          const seleccionada = ramaSeleccionadaId === rama.id;
                          return (
                            <button
                              key={rama.id}
                              type="button"
                              onClick={() => handleSeleccionarRama(rama)}
                              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                                seleccionada
                                  ? 'border-brand bg-brand/10 ring-2 ring-brand/40'
                                  : 'border-rule bg-surface'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-xs text-ink">
                                  {rama.nombre}
                                </span>
                                <span className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`} />
                              </div>
                              <span className="text-[10px] text-ink-muted block">
                                {rama.edadMinima}-{rama.edadMaxima} años
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {unidadesRamaSeleccionada.length > 1 && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-bold text-ink-2 block">
                            Sección de {ramaSeleccionadaObj?.nombre}:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {unidadesRamaSeleccionada.map((u) => {
                              const activa = Number(unidadDestinoId) === u.id;
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => setUnidadDestinoId(String(u.id))}
                                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                                    activa
                                      ? 'bg-brand text-brand-contrast border-brand font-bold shadow-xs'
                                      : 'bg-surface text-ink-2 border-rule'
                                  }`}
                                >
                                  {u.nombre}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selector de Rol Dinámico para la categoría seleccionada */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-ink-2 block">
                      Función / Rol:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(categoriaDestino === 'RAMA'
                        ? rolesRama
                        : categoriaDestino === 'SIN_RAMA'
                          ? rolesSinRama
                          : rolesJefatura
                      ).map((r) => {
                        const activo = Number(rolDestinoId) === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setRolDestinoId(String(r.id))}
                            className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                              activo
                                ? 'border-brand bg-brand/10 text-brand font-bold'
                                : 'border-rule text-ink-2'
                            }`}
                          >
                            {r.nombre}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={ejecutandoPase || (!unidadDestinoId && !rolDestinoId) || esMismoDestino}
                    onClick={handleEjecutarPase}
                    className="w-full min-h-[46px] rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>
                      {ejecutandoPase
                        ? 'Procesando pase...'
                        : esMismoDestino
                          ? 'Ya pertenece a esta sección y rol'
                          : 'Confirmar Pase / Cambio de Rol'}
                    </span>
                  </button>
                </div>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 5: SEGURIDAD Y CONTRASEÑA                        */}
              {/* ======================================================== */}
              {tab === 'seguridad' && (
                <div className="p-4 rounded-2xl bg-brand/10 border border-brand/30 space-y-3">
                  <span className="font-bold text-ink text-sm block">
                    ¿Olvidó su contraseña?
                  </span>
                  <p className="text-ink-2 text-xs">
                    Restablece su clave para que vuelva a ser su número de DNI (
                    <strong>{miembro.dni}</strong>).
                  </p>
                  <button
                    type="button"
                    onClick={handleResetClave}
                    disabled={reseteandoClave}
                    className="min-h-[44px] px-4 bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold rounded-xl text-xs inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>
                      {reseteandoClave ? 'Restableciendo...' : `Volver clave a DNI (${miembro.dni})`}
                    </span>
                  </button>
                </div>
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
          cargosPendientes={estadoCuenta?.cargos || []}
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
