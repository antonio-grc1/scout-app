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
  X,
  User,
  Phone,
  Mail,
  Home,
  HeartPulse,
  Users,
  ShieldAlert,
  FileCheck2,
  CreditCard,
  KeyRound,
  CheckCircle,
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Save,
  CheckCircle2,
  Sparkles,
  Lock,
  FileText,
  BadgeAlert,
  Clock,
  Download,
  Wallet,
  PlusCircle,
  Receipt,
} from 'lucide-react';
import { generarFichaPdf, descargarPdfBlob } from '../services/pdfGenerator';

interface Props {
  usuarioId: number | null;
  onCerrar: () => void;
  onActualizado?: () => void;
  onClaveReseteada?: (mensaje: string) => void;
  tabInicial?: 'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas';
}

// Helpers para coherencia de pase entre Rama y Rol
const esUnidadRama = (u: any) => u?.tipo === 'SECCION_RAMA' || u?.ramaId != null;
const esUnidadJefatura = (u: any) => u?.tipo === 'JEFATURA' || u?.nombre?.toLowerCase().includes('jefatura');
const esUnidadSinRama = (u: any) => u?.tipo === 'SIN_RAMA_APOYO' || u?.nombre?.toLowerCase().includes('sin rama');

const esRolJefe = (r: any) => r?.nombre?.toLowerCase().includes('jefe');
const esRolSinRama = (r: any) => r?.nombre?.toLowerCase().includes('sin rama');
const esRolRama = (r: any) => !esRolJefe(r) && !esRolSinRama(r);

const getRamaColorConfig = (nombreRama: string) => {
  const n = (nombreRama || '').toLowerCase();
  if (n.includes('lobat')) return RAMA_COLORS.lobatos;
  if (n.includes('scout')) return RAMA_COLORS.scout;
  if (n.includes('caminant')) return RAMA_COLORS.caminantes;
  if (n.includes('rover')) return RAMA_COLORS.rover;
  return RAMA_COLORS.otro;
};

const getRamaIcon = (nombreRama: string) => {
  const n = (nombreRama || '').toLowerCase();
  if (n.includes('lobat')) return '🐺';
  if (n.includes('scout')) return '⚜️';
  if (n.includes('caminant')) return '🧭';
  if (n.includes('rover')) return '🔴';
  return '🏕️';
};

export const ModalDetalleMiembro: React.FC<Props> = ({
  usuarioId,
  onCerrar,
  onActualizado,
  onClaveReseteada,
  tabInicial = 'datos',
}) => {
  const { tieneGlobal } = useAuthStore();
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
  const [alerta, setAlerta] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [modalConf, setModalConf] = useState<ModalConfirmacionProps | null>(null);

  // Estados para gestión de cuotas y deudas
  const [modalCobrarAbierto, setModalCobrarAbierto] = useState(false);
  const [cargoIdACobrar, setCargoIdACobrar] = useState<number | null>(null);
  const [modoSaldoAFavor, setModoSaldoAFavor] = useState(false);
  const [modalGenerarDeudaAbierto, setModalGenerarDeudaAbierto] = useState(false);
  const [modalEditarFamiliaAbierto, setModalEditarFamiliaAbierto] = useState(false);
  const [modalVincularHermanoAbierto, setModalVincularHermanoAbierto] = useState(false);

  // Formulario de edición
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    dni: '',
    fechaNacimiento: '',
    emailContacto: '',
    telefonoContacto: '',
    domicilio: '',
    obraSocial: '',
    telefonoUrgencias: '',
    alergias: '',
    activo: true,
  });

  // Formulario de pase rediseñado
  const [categoriaDestino, setCategoriaDestino] = useState<'RAMA' | 'SIN_RAMA' | 'JEFATURA'>('RAMA');
  const [ramaSeleccionadaId, setRamaSeleccionadaId] = useState<number | null>(null);
  const [unidadDestinoId, setUnidadDestinoId] = useState<string>('');
  const [rolDestinoId, setRolDestinoId] = useState<string>('');

  // 1. Hooks incondicionales al inicio
  const unidadSeleccionadaObj = useMemo(
    () => unidades.find((u) => u.id === Number(unidadDestinoId)),
    [unidades, unidadDestinoId],
  );

  const rolSeleccionadoObj = useMemo(
    () => roles.find((r) => r.id === Number(rolDestinoId)),
    [roles, rolDestinoId],
  );

  const ramaSeleccionadaObj = useMemo(
    () => ramas.find((r) => r.id === ramaSeleccionadaId),
    [ramas, ramaSeleccionadaId],
  );

  const unidadesRamaSeleccionada = useMemo(
    () => unidades.filter((u) => u.ramaId === ramaSeleccionadaId && esUnidadRama(u)),
    [unidades, ramaSeleccionadaId],
  );

  const rolesRama = useMemo(
    () => roles.filter(esRolRama),
    [roles],
  );

  const asignacionPrincipal = miembro?.asignaciones?.[0];

  const esMismoDestino = useMemo(() => {
    if (!asignacionPrincipal) return false;
    const unidadIdActual = asignacionPrincipal.unidad?.id ?? asignacionPrincipal.unidadId;
    const rolIdActual = asignacionPrincipal.rol?.id ?? asignacionPrincipal.rolId;
    return (
      Number(unidadDestinoId) === unidadIdActual &&
      Number(rolDestinoId) === rolIdActual
    );
  }, [asignacionPrincipal, unidadDestinoId, rolDestinoId]);
  const esEducador =
    asignacionPrincipal?.rol?.nombre?.toLowerCase().includes('educador') ||
    asignacionPrincipal?.rol?.nombre?.toLowerCase().includes('jefe');

  const candidatoPase = candidatosPase.find((c) => c.usuario?.id === miembro?.id);

  const calcularEdad = (fechaNacStr?: string) => {
    if (!fechaNacStr) return null;
    const nac = new Date(fechaNacStr);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  };

  useEffect(() => {
    if (!usuarioId) {
      setMiembro(null);
      setAlerta(null);
      return;
    }
    setTab(tabInicial);
    setAlerta(null);
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

      // Inicializar formulario de edición
      const fechaNac = m.fechaNacimiento
        ? new Date(m.fechaNacimiento).toISOString().split('T')[0]
        : '';
      setFormData({
        nombre: m.nombre || '',
        apellido: m.apellido || '',
        dni: m.dni || '',
        fechaNacimiento: fechaNac,
        emailContacto: m.emailContacto || '',
        telefonoContacto: m.telefonoContacto || '',
        domicilio: m.datosFijosJson?.domicilio || '',
        obraSocial: m.datosFijosJson?.obra_social || '',
        telefonoUrgencias: m.datosFijosJson?.telefono_urgencias || '',
        alergias: m.datosFijosJson?.alergias || '',
        activo: m.activo ?? true,
      });

      // Inicializar formulario de pase según contexto scout
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
          const rSin = (resRoles.data || []).find(esRolSinRama);
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
            (r: any) =>
              r.nombre.toLowerCase() === 'protagonista' ||
              (esRolRama(r) && !r.nombre.toLowerCase().includes('educador')),
          );
          if (rProt) rolIni = String(rProt.id);
        }
      } else {
        const uActual = (resUnidades.data || []).find((u: any) => u.id === asigUnidadId);
        if (uActual && esUnidadSinRama(uActual)) {
          catIni = 'SIN_RAMA';
          unidadIni = String(uActual.id);
          const rSin = (resRoles.data || []).find(esRolSinRama);
          if (rSin) rolIni = String(rSin.id);
        } else if (uActual && esUnidadJefatura(uActual)) {
          catIni = 'JEFATURA';
          unidadIni = String(uActual.id);
          const rJefe = (resRoles.data || []).find(esRolJefe);
          if (rJefe) rolIni = String(rJefe.id);
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
          const eraEdu = asig?.rol?.nombre?.toLowerCase().includes('educador');
          const rolDef = eraEdu
            ? (resRoles.data || []).find((r: any) => r.nombre.toLowerCase().includes('educador') && esRolRama(r))
            : (resRoles.data || []).find(
                (r: any) =>
                  r.nombre.toLowerCase() === 'protagonista' ||
                  (esRolRama(r) && !r.nombre.toLowerCase().includes('educador')),
              );
          if (rolDef) rolIni = String(rolDef.id);
        }
      }

      setCategoriaDestino(catIni);
      setRamaSeleccionadaId(ramaIniId);
      setUnidadDestinoId(unidadIni);
      setRolDestinoId(rolIni);
    } catch (err: any) {
      console.error('Error al cargar detalle de miembro', err);
      setAlerta({
        tipo: 'error',
        texto: err.response?.data?.message || 'Error al cargar los datos del miembro.',
      });
    } finally {
      setCargando(false);
    }
  };

  // 1. Guardar edición de datos personales
  const handleGuardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miembro) return;
    setGuardando(true);
    setAlerta(null);

    try {
      await api.patch(`/miembros/${miembro.id}`, {
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        dni: formData.dni.trim(),
        fechaNacimiento: formData.fechaNacimiento || undefined,
        emailContacto: formData.emailContacto.trim() || null,
        telefonoContacto: formData.telefonoContacto.trim() || null,
        activo: formData.activo,
        datosFijosJson: {
          ...(miembro.datosFijosJson || {}),
          domicilio: formData.domicilio.trim(),
          obra_social: formData.obraSocial.trim(),
          telefono_urgencias: formData.telefonoUrgencias.trim(),
          alergias: formData.alergias.trim(),
        },
      });

      setAlerta({ tipo: 'exito', texto: '¡Datos del miembro actualizados con éxito!' });
      if (onActualizado) onActualizado();
      cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: err.response?.data?.message || 'Error al actualizar los datos.',
      });
    } finally {
      setGuardando(false);
    }
  };

  // Handlers para pase de rama rediseñado
  const handleCambioCategoria = (cat: 'RAMA' | 'SIN_RAMA' | 'JEFATURA') => {
    setCategoriaDestino(cat);

    if (cat === 'SIN_RAMA') {
      setRamaSeleccionadaId(null);
      const u = unidades.find(esUnidadSinRama);
      const r = roles.find(esRolSinRama);
      if (u) setUnidadDestinoId(String(u.id));
      if (r) setRolDestinoId(String(r.id));
    } else if (cat === 'JEFATURA') {
      setRamaSeleccionadaId(null);
      const u = unidades.find(esUnidadJefatura);
      const r = roles.find(esRolJefe);
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
        const eraEdu = asig?.rol?.nombre?.toLowerCase().includes('educador');
        const rolDefecto = eraEdu
          ? roles.find((r) => r.nombre.toLowerCase().includes('educador') && esRolRama(r))
          : roles.find(
              (r) =>
                r.nombre.toLowerCase() === 'protagonista' ||
                (esRolRama(r) && !r.nombre.toLowerCase().includes('educador')),
            );
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
      const eraEdu = asig?.rol?.nombre?.toLowerCase().includes('educador');
      const rolDefecto = eraEdu
        ? roles.find((r) => r.nombre.toLowerCase().includes('educador') && esRolRama(r))
        : roles.find(
            (r) =>
              r.nombre.toLowerCase() === 'protagonista' ||
              (esRolRama(r) && !r.nombre.toLowerCase().includes('educador')),
          );
      if (rolDefecto) {
        setRolDestinoId(String(rolDefecto.id));
      }
    }
  };

  const aplicarSugerenciaCandidato = () => {
    if (!candidatoPase) return;
    if (candidatoPase.tipo === 'EGRESO' || candidatoPase.tipo === 'EGRESO_SIN_RAMA') {
      handleCambioCategoria('SIN_RAMA');
    } else if (candidatoPase.ramaSugerida) {
      setCategoriaDestino('RAMA');
      setRamaSeleccionadaId(candidatoPase.ramaSugerida.id);
      const units = unidades.filter((u) => u.ramaId === candidatoPase.ramaSugerida.id && esUnidadRama(u));
      const candUnit = candidatoPase.unidadesDestino?.[0];
      if (candUnit) {
        setUnidadDestinoId(String(candUnit.id));
      } else if (units.length > 0) {
        setUnidadDestinoId(String(units[0].id));
      }
      const rProt = roles.find(
        (r) =>
          r.nombre.toLowerCase() === 'protagonista' ||
          (esRolRama(r) && !r.nombre.toLowerCase().includes('educador')),
      );
      if (rProt) setRolDestinoId(String(rProt.id));
    }
  };

  // 2. Ejecutar Pase de Rama / Unidad
  const handleEjecutarPase = () => {
    if (!asignacionPrincipal) {
      setAlerta({
        tipo: 'error',
        texto: 'El miembro no posee una asignación activa para realizar el pase.',
      });
      return;
    }
    if (!unidadDestinoId) {
      setAlerta({
        tipo: 'error',
        texto: 'Por favor selecciona la unidad destino.',
      });
      return;
    }
    const destinoUnidad = unidades.find((u) => u.id === Number(unidadDestinoId));
    const nombreDestino = destinoUnidad?.nombre || 'la unidad seleccionada';

    setModalConf({
      abierto: true,
      titulo: 'Confirmar Pase de Rama / Unidad',
      mensaje: `¿Confirmas el pase de ${miembro.nombre} ${miembro.apellido} hacia ${nombreDestino}? Se cerrará la asignación actual y se iniciará la nueva según el protocolo scout.`,
      tipo: 'confirmacion',
      textoConfirmar: 'Confirmar Pase',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        setEjecutandoPase(true);
        setAlerta(null);
        try {
          await api.post('/pases', {
            asignacionOrigenId: asignacionPrincipal.id,
            unidadDestinoId: Number(unidadDestinoId),
            rolDestinoId: rolDestinoId ? Number(rolDestinoId) : undefined,
          });

          setModalConf(null);
          setAlerta({
            tipo: 'exito',
            texto: `¡Pase a ${nombreDestino} ejecutado con éxito!`,
          });
          if (onActualizado) onActualizado();
          cargarDatos(miembro.id);
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: err.response?.data?.message || 'Error al ejecutar el pase de rama/unidad.',
          });
        } finally {
          setEjecutandoPase(false);
        }
      },
    });
  };

  // 3. Resetear Clave a DNI
  const handleResetClave = () => {
    if (!miembro) return;

    setModalConf({
      abierto: true,
      titulo: 'Restablecer Contraseña',
      mensaje: `¿Confirmas el reseteo de la contraseña de ${miembro.nombre} ${miembro.apellido} a su número de DNI (${miembro.dni})?\n\nAl ingresar, el sistema le pedirá cambiarla obligatoriamente.`,
      tipo: 'peligro',
      textoConfirmar: 'Resetear a DNI',
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
            texto: `Contraseña restablecida exitosamente. La nueva clave de acceso es su DNI: ${miembro.dni}`,
          });
          if (onClaveReseteada) onClaveReseteada(res.data.mensaje);
          cargarDatos(miembro.id);
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: err.response?.data?.message || 'Error al resetear la contraseña.',
          });
        } finally {
          setReseteandoClave(false);
        }
      },
    });
  };

  // 3.b Anular Cargo no cobrado
  const handleAnularCargo = (cargoId: number, conceptoNombre: string) => {
    setModalConf({
      abierto: true,
      titulo: 'Anular Cargo Pendiente',
      mensaje: `¿Estás seguro de que deseas anular el cargo "${conceptoNombre}"? El estado pasará a ANULADO y ya no figurará como deuda pendiente.`,
      tipo: 'peligro',
      textoConfirmar: 'Anular Cargo',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        try {
          await api.post(`/tesoreria/cargos/${cargoId}/anular`);
          setModalConf(null);
          setAlerta({ tipo: 'exito', texto: `El cargo "${conceptoNombre}" fue anulado correctamente.` });
          if (usuarioId) cargarDatos(usuarioId);
          if (onActualizado) onActualizado();
        } catch (err: any) {
          setModalConf(null);
          setAlerta({ tipo: 'error', texto: err.response?.data?.message || 'Error al anular cargo.' });
        }
      },
    });
  };

  // 4. Validar Ficha Física manualmente si tiene el documento
  const handleValidarFisicoManual = (entrega: any) => {
    setModalConf({
      abierto: true,
      titulo: 'Validación Física de Ficha',
      mensaje: `¿Deseas validar físicamente la entrega "${entrega.plantilla?.titulo}" de ${miembro.nombre} ${miembro.apellido}? Confirma que tienes la ficha impresa y firmada en mano.`,
      tipo: 'confirmacion',
      textoConfirmar: 'Validar Físicamente',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConf(null),
      onConfirmar: async () => {
        setValidandoFichaId(entrega.id);
        setAlerta(null);
        try {
          await api.post(`/legajos/qr/validar/${entrega.hashVerificacion}`);
          setModalConf(null);
          setAlerta({
            tipo: 'exito',
            texto: '¡Ficha médica validada físicamente con éxito!',
          });
          if (onActualizado) onActualizado();
          cargarDatos(miembro.id);
        } catch (err: any) {
          setModalConf(null);
          setAlerta({
            tipo: 'error',
            texto: err.response?.data?.message || 'Error al validar la ficha física.',
          });
        } finally {
          setValidandoFichaId(null);
        }
      },
    });
  };

  const handleDescargarPdfEducador = async (ent: any) => {
    if (!miembro) return;
    setDescargandoPdfId(ent.id);
    try {
      const res = await api.get(`/legajos/plantillas/${ent.plantillaId}`);
      const mapeo = res.data.mapeoPdfJson;
      const ramaNombre = miembro.asignaciones?.[0]?.unidad?.nombre || '';
      const pdfBytes = await generarFichaPdf(
        mapeo,
        ent.respuestasSnapshotJson || {},
        ent.hashVerificacion,
        {
          nombre: miembro.nombre,
          apellido: miembro.apellido,
          dni: miembro.dni,
          fechaNacimiento: miembro.fechaNacimiento,
          ramaNombre,
          telefonoContacto: miembro.telefonoContacto,
        },
        ent.versionImpresion,
      );
      descargarPdfBlob(pdfBytes, `Legajo_${miembro.dni}_V${ent.versionImpresion}.pdf`);
    } catch (err: any) {
      console.error('Error al descargar PDF:', err);
      setAlerta({
        tipo: 'error',
        texto: 'Error al generar la descarga del PDF del legajo.',
      });
    } finally {
      setDescargandoPdfId(null);
    }
  };

  if (!usuarioId) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-6 flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800 transition-colors">
        {/* Encabezado del Modal */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/80 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            {(() => {
              const cfgRama = miembro ? obtenerConfigRama(miembro, unidades) : null;
              return (
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-xs shrink-0 ${
                    !miembro?.activo
                      ? 'bg-slate-400 text-white'
                      : cfgRama?.avatarClases || (esEducador ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white')
                  }`}
                >
                  {miembro ? `${miembro.nombre?.[0] || ''}${miembro.apellido?.[0] || ''}` : '...'}
                </div>
              );
            })()}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  {miembro ? `${miembro.apellido}, ${miembro.nombre}` : 'Cargando...'}
                </h3>
                {miembro && (() => {
                  const cfgRama = obtenerConfigRama(miembro, unidades);
                  return (
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs flex items-center gap-1 ${cfgRama.badgeClases}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfgRama.dotColor}`} />
                      <span>{cfgRama.nombre}</span>
                    </span>
                  );
                })()}
                {asignacionPrincipal?.rol?.nombre && (
                  <span
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                  >
                    {asignacionPrincipal.rol.nombre}
                  </span>
                )}
                {miembro && !miembro.activo && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                    Inactivo / Dado de baja
                  </span>
                )}
                {candidatoPase && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/50 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    Pase de rama sugerido
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                DNI {miembro?.dni || '—'} • {calcularEdad(miembro?.fechaNacimiento) ?? '—'} años •{' '}
                {asignacionPrincipal?.unidad?.nombre || 'Sin Unidad'}
              </p>
            </div>
          </div>

          <button
            onClick={onCerrar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas internas de navegación */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 overflow-x-auto text-xs font-semibold text-slate-600 dark:text-slate-400 gap-2 shrink-0">
          <button
            onClick={() => setTab('datos')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
              tab === 'datos'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Datos y Edición</span>
          </button>

          <button
            onClick={() => setTab('pase')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer relative ${
              tab === 'pase'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Pase de Rama</span>
            {candidatoPase && (
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setTab('seguridad')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
              tab === 'seguridad'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Seguridad y Clave</span>
          </button>

          <button
            onClick={() => setTab('ficha')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
              tab === 'ficha'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Ficha Médica ({entregas.length})</span>
          </button>

          <button
            onClick={() => setTab('cuotas')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer ${
              tab === 'cuotas'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Cuotas</span>
          </button>
        </div>

        {/* Notificación interna en el modal */}
        {alerta && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
              alerta.tipo === 'exito'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300'
            }`}
          >
            <span>{alerta.texto}</span>
            <button
              onClick={() => setAlerta(null)}
              className="ml-2 hover:underline text-[11px] font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Contenido scrolleable de cada pestaña */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {cargando ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 dark:border-emerald-500 mb-2"></div>
              <p>Cargando información del miembro...</p>
            </div>
          ) : miembro ? (
            <>
              {/* ======================================================== */}
              {/* PESTAÑA 1: DATOS Y EDICIÓN DEL MIEMBRO                   */}
              {/* ======================================================== */}
              {tab === 'datos' && (
                <form onSubmit={handleGuardarDatos} className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        Modificar Datos del Miembro
                      </h4>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Actualiza la información personal, datos de contacto familiar y salud.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={guardando}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
                    </button>
                  </div>

                  {/* Datos Básicos */}
                  <div className="space-y-3">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] block">
                      Información Personal
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Nombre</label>
                        <input
                          type="text"
                          required
                          value={formData.nombre}
                          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Apellido</label>
                        <input
                          type="text"
                          required
                          value={formData.apellido}
                          onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">DNI</label>
                        <input
                          type="text"
                          required
                          value={formData.dni}
                          onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                          Fecha de Nacimiento
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.fechaNacimiento}
                          onChange={(e) =>
                            setFormData({ ...formData, fechaNacimiento: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                      <div className="flex items-center pt-2 sm:pt-4">
                        <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100/60 transition w-full">
                          <input
                            type="checkbox"
                            checked={formData.activo}
                            onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 focus:ring-emerald-500 cursor-pointer mt-0.5"
                          />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">
                              {formData.activo ? 'Miembro Activo en el Grupo' : 'Miembro Inactivo / Dado de Baja'}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                              {formData.activo
                                ? 'Visible en el padrón activo de la rama y unidad.'
                                : 'Se guardará como baja. Podrás consultarlo y reactivarlo desde la pestaña "Inactivos" del padrón.'}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Contacto Familiar */}
                  <div className="space-y-3 pt-2">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] block">
                      Contacto y Domicilio Familiar
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                          Teléfono de Contacto
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: 3511234567"
                          value={formData.telefonoContacto}
                          onChange={(e) =>
                            setFormData({ ...formData, telefonoContacto: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                          Correo Electrónico
                        </label>
                        <input
                          type="email"
                          placeholder="ejemplo@correo.com"
                          value={formData.emailContacto}
                          onChange={(e) =>
                            setFormData({ ...formData, emailContacto: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                        Domicilio Real
                      </label>
                      <input
                        type="text"
                        placeholder="Calle, número, barrio, localidad"
                        value={formData.domicilio}
                        onChange={(e) => setFormData({ ...formData, domicilio: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                      />
                    </div>

                    {/* Grupo Familiar y Hermanos */}
                    {(() => {
                      const familiar = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
                      const hermanos = (miembro?.grupoFamiliar?.miembros || []).filter(
                        (m: any) => m.id !== miembro?.id,
                      );
                      const pctDesc = familiar ? Number(familiar.porcentajeDescuentoHermanos ?? 0) : 0;

                      return (
                        <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                              <span className="font-extrabold text-indigo-950 dark:text-indigo-100 text-xs">
                                {familiar ? familiar.nombreFamilia : 'Sin Grupo Familiar Asignado'}
                              </span>
                              {familiar ? (
                                <span className="px-2 py-0.5 rounded-full bg-indigo-200/80 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100 text-[10px] font-bold">
                                  {pctDesc}% desc. hermanos
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                                  Individual
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {familiar && (
                                <button
                                  type="button"
                                  onClick={() => setModalEditarFamiliaAbierto(true)}
                                  className="px-2.5 py-1 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] transition cursor-pointer"
                                >
                                  Configurar % Descuento
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setModalVincularHermanoAbierto(true)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] transition cursor-pointer"
                              >
                                {familiar ? 'Vincular Otro Hermano' : 'Vincular Hermano por DNI'}
                              </button>
                            </div>
                          </div>

                          {hermanos.length > 0 ? (
                            <div className="text-[11px] text-slate-600 dark:text-slate-400">
                              <span className="font-semibold text-indigo-900 dark:text-indigo-200">
                                Hermanos en el grupo ({hermanos.length}):
                              </span>{' '}
                              {hermanos.map((h: any, idx: number) => (
                                <span key={h.id}>
                                  {h.nombre} {h.apellido} (
                                  {h.asignaciones?.[0]?.unidad?.nombre || 'Sin sección'})
                                  {idx < hermanos.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                              {familiar
                                ? 'No hay otros hermanos registrados en este grupo familiar.'
                                : 'Si tiene hermanos en el grupo, vincúlelos para que se les aplique el descuento por hermanos en las cuotas.'}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Datos Médicos Fijos */}
                  <div className="space-y-3 pt-2">
                    <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] block">
                      Datos de Salud y Urgencias
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                          Obra Social / Prepaga
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: OSDE, Apross, Ninguna"
                          value={formData.obraSocial}
                          onChange={(e) => setFormData({ ...formData, obraSocial: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                          Teléfono de Urgencias
                        </label>
                        <input
                          type="text"
                          placeholder="Número alternativo para emergencias"
                          value={formData.telefonoUrgencias}
                          onChange={(e) =>
                            setFormData({ ...formData, telefonoUrgencias: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                        Alergias o Tratamientos Crónicos
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Indica alergias conocidas, medicamentos habituales o requerimientos especiales"
                        value={formData.alergias}
                        onChange={(e) => setFormData({ ...formData, alergias: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-3">
                    <button
                      type="submit"
                      disabled={guardando}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 2: PASE DE RAMA Y CAMBIO DE UNIDAD               */}
              {/* ======================================================== */}
              {tab === 'pase' && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Cambio de Rama / Unidad (Pase de Sección)</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                      Transfiere al miembro a una nueva sección o rol. La asignación actual se cerrará
                      registrando la fecha de finalización y se creará la nueva respetando el historial scout.
                    </p>
                  </div>

                  {/* Estado Actual */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                        Rama y Unidad Actual
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5 mt-0.5">
                        <span>🏕️</span>
                        <span>{asignacionPrincipal?.unidad?.nombre || 'Sin Unidad'}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                        Rol Actual
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm block mt-0.5">
                        {asignacionPrincipal?.rol?.nombre || 'Sin Rol'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                        Edad del Protagonista
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm block mt-0.5">
                        {calcularEdad(miembro?.fechaNacimiento) ?? '—'} años
                      </span>
                    </div>
                  </div>

                  {/* Sugerencia de Pase por Edad (si existe) */}
                  {candidatoPase && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-4 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                          <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span>Sugerencia Automática por Edad Cumplida</span>
                        </div>
                        <button
                          type="button"
                          onClick={aplicarSugerenciaCandidato}
                          className="text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 underline cursor-pointer"
                        >
                          ✨ Restablecer a sugerencia
                        </button>
                      </div>
                      <p className="text-amber-900/90 dark:text-amber-200/90 text-xs leading-relaxed">
                        Este protagonista cumplió <strong className="text-amber-950 dark:text-amber-100">{candidatoPase.edad} años</strong> y superó
                        la edad máxima de su rama actual (
                        <strong className="text-amber-950 dark:text-amber-100">{candidatoPase.ramaActual?.nombre}</strong>, máx.{' '}
                        {candidatoPase.ramaActual?.edadMaxima} años).
                      </p>
                      <div className="text-emerald-800 dark:text-emerald-300 font-bold text-xs pt-1">
                        👉 Sugerencia:{' '}
                        {candidatoPase.tipo === 'PROGRESION'
                          ? `Progresión a Rama ${candidatoPase.ramaSugerida?.nombre}`
                          : 'Egreso a Educador / Equipo de Apoyo'}
                      </div>
                    </div>
                  )}

                  {/* Selector Guiado de Pase */}
                  <div className="bg-white dark:bg-slate-900/60 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
                    {/* Paso 1: Tipo de Destino */}
                    <div>
                      <label className="block text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wider mb-2">
                        Paso 1: Seleccionar Tipo de Destino
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleCambioCategoria('RAMA')}
                          className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                            categoriaDestino === 'RAMA'
                              ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/40 shadow-2xs'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-base ${
                            categoriaDestino === 'RAMA'
                              ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200'
                              : 'bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300'
                          }`}>
                            🌿
                          </div>
                          <div>
                            <span className={`font-bold text-xs block ${categoriaDestino === 'RAMA' ? 'text-emerald-950 dark:text-emerald-100' : 'text-slate-900 dark:text-slate-100'}`}>
                              Rama Pedagógica
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                              Lobatos, Scout, Caminantes, Rovers
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCambioCategoria('SIN_RAMA')}
                          className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                            categoriaDestino === 'SIN_RAMA'
                              ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/40 shadow-2xs'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-base ${
                            categoriaDestino === 'SIN_RAMA'
                              ? 'bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-200'
                              : 'bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300'
                          }`}>
                            🤝
                          </div>
                          <div>
                            <span className={`font-bold text-xs block ${categoriaDestino === 'SIN_RAMA' ? 'text-indigo-950 dark:text-indigo-100' : 'text-slate-900 dark:text-slate-100'}`}>
                              Equipo de Apoyo
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                              Sin Rama / Colaboradores adultos
                            </span>
                          </div>
                        </button>

                        {tieneGlobal() && (
                          <button
                            type="button"
                            onClick={() => handleCambioCategoria('JEFATURA')}
                            className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                              categoriaDestino === 'JEFATURA'
                                ? 'border-amber-500 bg-amber-50/80 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/40 shadow-2xs'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-base ${
                              categoriaDestino === 'JEFATURA'
                                ? 'bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200'
                                : 'bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300'
                            }`}>
                              ⭐
                            </div>
                            <div>
                              <span className={`font-bold text-xs block ${categoriaDestino === 'JEFATURA' ? 'text-amber-950 dark:text-amber-100' : 'text-slate-900 dark:text-slate-100'}`}>
                                Jefatura de Grupo
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                                Conducción institucional
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Paso 2 y 3: Configuración según Categoría */}
                    {categoriaDestino === 'RAMA' && (
                      <div className="space-y-4 pt-1">
                        {/* Selector de Rama */}
                        <div>
                          <label className="block text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wider mb-2">
                            Paso 2: Elegir Rama Pedagógica
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {ramas.map((rama) => {
                              const config = getRamaColorConfig(rama.nombre);
                              const seleccionada = ramaSeleccionadaId === rama.id;
                              const esSugerida = candidatoPase?.ramaSugerida?.id === rama.id;
                              const unidadesDeEstaRama = unidades.filter((u) => u.ramaId === rama.id);

                              return (
                                <button
                                  key={rama.id}
                                  type="button"
                                  onClick={() => handleSeleccionarRama(rama)}
                                  className={`relative p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                                    seleccionada
                                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/50 shadow-2xs'
                                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                                  }`}
                                >
                                  <div className="flex items-start justify-between w-full gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xl">{getRamaIcon(rama.nombre)}</span>
                                      <div>
                                        <span className={`font-bold text-xs block ${seleccionada ? 'text-emerald-950 dark:text-emerald-100' : 'text-slate-900 dark:text-slate-100'}`}>
                                          {rama.nombre}
                                        </span>
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                                          {rama.edadMinima} a {rama.edadMaxima} años
                                        </span>
                                      </div>
                                    </div>
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${config.dotColor}`} />
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    {esSugerida && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 flex items-center gap-0.5">
                                        <Sparkles className="w-2.5 h-2.5" /> Sugerida
                                      </span>
                                    )}
                                    <span className="text-[10px] text-slate-400 dark:text-slate-400">
                                      {unidadesDeEstaRama.length === 1
                                        ? '1 sección'
                                        : `${unidadesDeEstaRama.length} secciones`}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Subsección si la rama tiene múltiples unidades */}
                        {unidadesRamaSeleccionada.length > 1 && (
                          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block">
                              Sección de {ramaSeleccionadaObj?.nombre || 'la rama'}:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {unidadesRamaSeleccionada.map((u) => {
                                const activa = Number(unidadDestinoId) === u.id;
                                return (
                                  <button
                                    key={u.id}
                                    type="button"
                                    onClick={() => setUnidadDestinoId(String(u.id))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border flex items-center gap-1.5 cursor-pointer ${
                                      activa
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <span>🏕️</span>
                                    <span>{u.nombre}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Selector de Rol en la Rama */}
                        <div>
                          <label className="block text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wider mb-2">
                            Paso 3: Rol en la Rama
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {rolesRama.map((r) => {
                              const activo = Number(rolDestinoId) === r.id;
                              const esEdu = r.nombre.toLowerCase().includes('educador');
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => setRolDestinoId(String(r.id))}
                                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                                    activo
                                      ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/40 shadow-2xs'
                                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                                  }`}
                                >
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base ${
                                      activo
                                        ? 'bg-emerald-600 text-white font-bold'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {esEdu ? '🎓' : '⚜️'}
                                  </div>
                                  <div>
                                    <span className={`block font-bold text-xs ${activo ? 'text-emerald-950 dark:text-emerald-100' : 'text-slate-900 dark:text-slate-100'}`}>{r.nombre}</span>
                                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                      {esEdu
                                        ? 'Dirige y guía pedagógicamente la sección'
                                        : 'Beneficiario activo del programa scout'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Vista Equipo de Apoyo / Sin Rama */}
                    {categoriaDestino === 'SIN_RAMA' && (
                      <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 text-xl font-bold">
                            🤝
                          </div>
                          <div>
                            <h5 className="font-bold text-xs sm:text-sm text-indigo-950 dark:text-indigo-200">
                              Equipo de Apoyo y Educadores Sin Rama
                            </h5>
                            <p className="text-[11px] text-indigo-900/80 dark:text-indigo-300/80 mt-0.5 leading-relaxed">
                              Destinado a jóvenes que egresan de la Rama Rover (22 años cumplidos) o adultos colaboradores que apoyan al grupo en intendencia, logística, tesorería y eventos institucionales.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="bg-white/90 dark:bg-slate-800/90 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/60">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Unidad Asignada</span>
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                              {unidades.find(esUnidadSinRama)?.nombre || 'Educadores Sin Rama / Equipo de Apoyo'}
                            </span>
                          </div>
                          <div className="bg-white/90 dark:bg-slate-800/90 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/60">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Rol Asignado</span>
                            <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300">
                              {roles.find(esRolSinRama)?.nombre || 'Educador Sin Rama'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                          ✓ Esta asignación es institucional y no requiere seleccionar ninguna rama pedagógica.
                        </p>
                      </div>
                    )}

                    {/* Vista Jefatura de Grupo */}
                    {categoriaDestino === 'JEFATURA' && (
                      <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-xl font-bold">
                            ⭐
                          </div>
                          <div>
                            <h5 className="font-bold text-xs sm:text-sm text-amber-950 dark:text-amber-200">
                              Jefatura de Grupo (Conducción Institucional)
                            </h5>
                            <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
                              Destinado a miembros designados para la dirección, coordinación general y representación civil/institucional del Grupo Scout.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="bg-white/90 dark:bg-slate-800/90 p-2.5 rounded-lg border border-amber-100 dark:border-amber-800/60">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Unidad Asignada</span>
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                              {unidades.find(esUnidadJefatura)?.nombre || 'Jefatura de Grupo'}
                            </span>
                          </div>
                          <div className="bg-white/90 dark:bg-slate-800/90 p-2.5 rounded-lg border border-amber-100 dark:border-amber-800/60">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 block uppercase">Rol Asignado</span>
                            <span className="font-bold text-xs text-amber-700 dark:text-amber-300">
                              {roles.find(esRolJefe)?.nombre || 'Jefe de Grupo'}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                          ✓ Rol con alcance global en el sistema. No pertenece a ninguna rama pedagógica.
                        </p>
                      </div>
                    )}

                    {/* Previsualización del Pase Scout */}
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 space-y-3">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        Resumen del Pase Scout
                      </span>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/70 shadow-2xs">
                        {/* Origen */}
                        <div className="flex-1 space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase block">Asignación Actual</span>
                          <div className="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-1.5">
                            <span>🏕️</span>
                            <span>{asignacionPrincipal?.unidad?.nombre || 'Sin Unidad'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <span>Rol:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{asignacionPrincipal?.rol?.nombre || 'Sin Rol'}</span>
                          </div>
                        </div>

                        {/* Flecha */}
                        <div className="flex items-center justify-center py-1 sm:py-0 text-emerald-600 dark:text-emerald-400">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border border-transparent dark:border-emerald-800/50 flex items-center justify-center">
                            <ArrowRightLeft className="w-4 h-4" />
                          </div>
                        </div>

                        {/* Destino */}
                        <div className="flex-1 space-y-1 sm:text-right">
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block">Nueva Asignación</span>
                          <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5 sm:justify-end">
                            <span>{unidadSeleccionadaObj ? '🎯' : '⚠️'}</span>
                            <span className={unidadSeleccionadaObj ? 'text-slate-900 dark:text-slate-100' : 'text-amber-600 dark:text-amber-400'}>
                              {unidadSeleccionadaObj?.nombre || 'Pendiente de selección'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 sm:justify-end">
                            <span>Rol:</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{rolSeleccionadoObj?.nombre || 'Pendiente'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Advertencia si no hay cambio */}
                      {esMismoDestino ? (
                        <div className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/60 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span>El destino seleccionado es idéntico a la asignación actual. Selecciona una rama o rol diferente para ejecutar el pase.</span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          ℹ️ La asignación actual se dará de baja hoy y comenzará inmediatamente la nueva asignación. El historial scout quedará registrado de forma permanente.
                        </p>
                      )}
                    </div>

                    {/* Botón de Ejecución */}
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleEjecutarPase}
                        disabled={ejecutandoPase || !unidadDestinoId || !rolDestinoId || esMismoDestino}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>
                          {ejecutandoPase ? 'Ejecutando pase transaccional...' : 'Confirmar y Ejecutar Pase'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 3: SEGURIDAD Y RESETEO DE CLAVE                  */}
              {/* ======================================================== */}
              {tab === 'seguridad' && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Acceso y Restablecimiento de Contraseña</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                      Gestión de credenciales para el inicio de sesión del miembro o su familia.
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-400 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                          Usuario de Acceso (Login)
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">
                          DNI {miembro.dni}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-400 block text-[10px] uppercase font-semibold">
                          Estado de Contraseña
                        </span>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] mt-0.5 ${
                            miembro.requiereCambioClave
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/50'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/50'
                          }`}
                        >
                          {miembro.requiereCambioClave
                            ? 'Pendiente de cambio inicial'
                            : 'Contraseña personalizada activa'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta explicativa y botón de acción */}
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/40 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200 text-xs">
                      <Lock className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                      <span>Resetear Contraseña al DNI</span>
                    </div>
                    <p className="text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                      Si el miembro o sus padres olvidaron su clave, puedes restablecerla para que
                      vuelva a ser su <strong>número de DNI ({miembro.dni})</strong>. Al iniciar sesión
                      nuevamente, el sistema le pedirá definir una nueva clave personal.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleResetClave}
                        disabled={reseteandoClave}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>
                          {reseteandoClave
                            ? 'Restableciendo...'
                            : `Resetear Contraseña a DNI (${miembro.dni})`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 4: FICHAS MÉDICAS Y DOCUMENTACIÓN                */}
              {/* ======================================================== */}
              {tab === 'ficha' && (
                <div className="space-y-4">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Fichas Médicas y Formularios Anuales</span>
                    </h4>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                      Control del estado de entrega digital y validación física presencial de fichas.
                    </p>
                  </div>

                  {entregas.length > 0 ? (
                    <div className="space-y-3">
                      {entregas.map((ent) => (
                        <div
                          key={ent.id}
                          className="p-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block">
                              {ent.plantilla?.titulo || 'Formulario'}
                            </span>
                            <span className="text-slate-400 dark:text-slate-400 text-[10px]">
                              Ciclo {ent.cicloAnio} • Versión Impresión {ent.versionImpresion}
                            </span>
                            {ent.validadoPor && (
                              <span className="block text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1">
                                ✓ Validado físicamente por: {ent.validadoPor.nombre}{' '}
                                {ent.validadoPor.apellido}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`px-3 py-1 rounded-full font-bold text-[10px] ${
                                ent.estado === 'VALIDADO_FISICAMENTE'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/50'
                                  : ent.estado === 'PENDIENTE_FIRMA_FISICA'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/50'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {ent.estado.replace(/_/g, ' ')}
                            </span>

                            {ent.respuestasSnapshotJson && (
                              <button
                                type="button"
                                disabled={descargandoPdfId === ent.id}
                                onClick={() => handleDescargarPdfEducador(ent)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer"
                                title="Descargar copia PDF oficial con QR"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}

                            {ent.estado === 'PENDIENTE_FIRMA_FISICA' && (
                              <button
                                type="button"
                                disabled={validandoFichaId === ent.id}
                                onClick={() => handleValidarFisicoManual(ent)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition cursor-pointer"
                              >
                                {validandoFichaId === ent.id ? 'Validando...' : 'Validar Ahora'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400">
                      <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">Sin entregas registradas</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        El protagonista aún no ha completado el formulario digital para el ciclo actual.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* PESTAÑA 5: ESTADO DE CUOTAS Y TESORERÍA                 */}
              {/* ======================================================== */}
              {tab === 'cuotas' && (
                <div className="space-y-5">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Estado de Cuenta, Cuotas y Deudas</span>
                      </h4>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                        Gestión individual de cobros, cancelación de deuda, créditos y cargos manuales.
                      </p>
                    </div>

                    {/* Botones de Acción Rápida */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setModalGenerarDeudaAbierto(true)}
                        className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Generar Deuda</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCargoIdACobrar(null);
                          setModoSaldoAFavor(false);
                          setModalCobrarAbierto(true);
                        }}
                        disabled={!estadoCuenta?.resumen?.saldoPendiente || estadoCuenta.resumen.saldoPendiente <= 0}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Cobrar / Cancelar Deuda</span>
                      </button>
                    </div>
                  </div>

                  {estadoCuenta && estadoCuenta.resumen ? (
                    <div className="space-y-4">
                      {/* Tarjeta de Grupo Familiar y Descuento por Hermanos */}
                      {(() => {
                        const familiar = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
                        const hermanos = (miembro?.grupoFamiliar?.miembros || []).filter(
                          (m: any) => m.id !== miembro?.id,
                        );
                        const pctDesc = familiar ? Number(familiar.porcentajeDescuentoHermanos ?? 0) : 0;

                        return (
                          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                                  <Users className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-indigo-950 dark:text-indigo-100 text-sm">
                                      {familiar ? familiar.nombreFamilia : 'Sin Grupo Familiar Asignado'}
                                    </span>
                                    {familiar ? (
                                      <span className="px-2 py-0.5 rounded-full bg-indigo-200/80 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100 text-[10px] font-bold">
                                        {pctDesc > 0 ? `${pctDesc}% desc. hermanos` : '0% desc.'}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                                        Hijo único / Individual
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                                    {familiar
                                      ? `Descuento automático aplicado en cada cuota mensual y campamento institucional con descuento por hermanos.`
                                      : `Este miembro no tiene hermanos vinculados en el sistema.`}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {familiar ? (
                                  <button
                                    type="button"
                                    onClick={() => setModalEditarFamiliaAbierto(true)}
                                    className="px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                                  >
                                    <span>Configurar Descuento ({pctDesc}%)</span>
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => setModalVincularHermanoAbierto(true)}
                                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                >
                                  <span>{familiar ? 'Vincular Otro Hermano' : 'Vincular Hermano por DNI'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Lista de hermanos registrados */}
                            {hermanos.length > 0 && (
                              <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/50">
                                <span className="text-[10px] uppercase font-bold text-indigo-900/70 dark:text-indigo-300/70 tracking-wider block mb-1.5">
                                  Hermanos registrados en el grupo scout ({hermanos.length}):
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {hermanos.map((h: any) => {
                                    const uNombre = h.asignaciones?.[0]?.unidad?.nombre || 'Sin sección';
                                    return (
                                      <div
                                        key={h.id}
                                        className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-between text-xs"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-bold text-slate-800 dark:text-slate-200">
                                            {h.nombre} {h.apellido}
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-mono">({h.dni})</span>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                                          {uNombre}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Banner de Saldo a Favor si existe */}
                      {Number(estadoCuenta.resumen.saldoAFavor ?? 0) > 0 && (
                        <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-teal-900 dark:text-teal-100 text-sm">
                                  Saldo a Favor: ${Number(estadoCuenta.resumen.saldoAFavor).toFixed(2)}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-teal-200/80 dark:bg-teal-800 text-teal-800 dark:text-teal-200 text-[10px] font-bold">
                                  Crédito disponible
                                </span>
                              </div>
                              <p className="text-[11px] text-teal-700 dark:text-teal-300 mt-0.5">
                                Este miembro posee dinero a favor por pagos adelantados o excedentes.
                              </p>
                            </div>
                          </div>

                          {Number(estadoCuenta.resumen.saldoPendiente ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setCargoIdACobrar(null);
                                setModoSaldoAFavor(true);
                                setModalCobrarAbierto(true);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs self-start sm:self-center"
                            >
                              <Wallet className="w-3.5 h-3.5" />
                              <span>Aplicar a Deuda Pendiente</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Tarjetas de Resumen */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase block">
                            Cargos Emitidos
                          </span>
                          <span className="text-xl font-black text-slate-800 dark:text-slate-100">
                            {estadoCuenta.resumen.totalCargos ?? 0}
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase block">
                            Total Abonado
                          </span>
                          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                            ${Number(estadoCuenta.resumen.totalPagado ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase block">
                            Saldo Deudor
                          </span>
                          <span
                            className={`text-xl font-black ${
                              (estadoCuenta.resumen.saldoPendiente ?? 0) > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            ${Number(estadoCuenta.resumen.saldoPendiente ?? 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60">
                          <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold uppercase block">
                            Saldo a Favor
                          </span>
                          <span className="text-xl font-black text-teal-600 dark:text-teal-400">
                            ${Number(estadoCuenta.resumen.saldoAFavor ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Tabla de Cargos y Deudas */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                          Detalle de Cargos y Cuotas Acumuladas
                        </span>

                        {estadoCuenta.cargos?.length > 0 ? (
                          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-400 uppercase text-[10px]">
                                <tr>
                                  <th className="p-2.5">Concepto / Mes</th>
                                  <th className="p-2.5">Monto Original</th>
                                  <th className="p-2.5">Desc. Hermanos</th>
                                  <th className="p-2.5">Monto Final</th>
                                  <th className="p-2.5">Pagado</th>
                                  <th className="p-2.5">Pendiente</th>
                                  <th className="p-2.5 text-center">Estado</th>
                                  <th className="p-2.5 text-center">Acciones</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {estadoCuenta.cargos.map((c: any) => {
                                  const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
                                  const desc = Number(c.montoDescuento ?? 0);
                                  const nombreMeses = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                                  return (
                                    <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                                      <td className="p-2.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-bold text-slate-800 dark:text-slate-200">
                                            {c.concepto?.nombre || 'Concepto'}
                                          </span>
                                          {c.concepto?.mes && (
                                            <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                              {nombreMeses[c.concepto.mes]}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                          Ciclo {c.concepto?.cicloAnio || '2026'}
                                          {c.concepto?.fechaVencimiento && (
                                            <> • Vence: {new Date(c.concepto.fechaVencimiento).toLocaleDateString('es-AR')}</>
                                          )}
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-slate-500 dark:text-slate-400">
                                        ${Number(c.montoOriginal).toFixed(2)}
                                      </td>
                                      <td className="p-2.5">
                                        {desc > 0 ? (
                                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            -${desc.toFixed(2)}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[11px]">$0.00</span>
                                        )}
                                      </td>
                                      <td className="p-2.5 text-slate-800 dark:text-slate-200 font-bold">
                                        ${Number(c.montoFinal).toFixed(2)}
                                      </td>
                                      <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                        ${Number(c.montoPagado).toFixed(2)}
                                      </td>
                                      <td className="p-2.5 font-bold text-amber-600 dark:text-amber-400">
                                        ${pendiente.toFixed(2)}
                                      </td>
                                      <td className="p-2.5 text-center">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            c.estado === 'PAGADO'
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/50'
                                              : c.estado === 'PARCIAL'
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800/50'
                                                : c.estado === 'ANULADO'
                                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/50'
                                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/50'
                                          }`}
                                        >
                                          {c.estado}
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-center">
                                        {c.estado === 'PENDIENTE' && Number(c.montoPagado) === 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => handleAnularCargo(c.id, c.concepto?.nombre || 'Cargo')}
                                            className="px-2 py-1 text-[10px] rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition font-semibold cursor-pointer"
                                            title="Anular cargo no cobrado"
                                          >
                                            Anular
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 dark:text-slate-600 text-[11px]">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                            No hay cargos registrados para este miembro.
                          </div>
                        )}
                      </div>

                      {/* Historial de Pagos Registrados */}
                      {estadoCuenta.pagos?.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-slate-500" />
                            <span>Historial de Pagos Recientes</span>
                          </span>

                          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {estadoCuenta.pagos.map((p: any) => (
                              <div
                                key={p.id}
                                className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                                      ${Number(p.montoTotal).toFixed(2)}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                                      {p.metodoPago}
                                    </span>
                                    {p.referenciaComprobante && (
                                      <span className="text-[11px] text-slate-400">
                                        Ref: {p.referenciaComprobante}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {new Date(p.fechaPago).toLocaleDateString('es-AR', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                    {p.registradoPor && ` • Registrado por: ${p.registradoPor.nombre} ${p.registradoPor.apellido}`}
                                  </span>
                                </div>

                                <div className="text-right text-[11px] text-slate-500">
                                  {p.imputaciones?.length ?? 0} {p.imputaciones?.length === 1 ? 'cargo saldado' : 'cargos saldados'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-500 text-xs italic">
                      No se encontraron registros de tesorería para este miembro.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer del Modal */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {miembro && <span>ID de Miembro: {miembro.id}</span>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="px-5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>

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

      {/* Modal para Cobrar Cuotas / Cancelar Deudas */}
      {modalCobrarAbierto && miembro && (
        <ModalCobrarDeuda
          abierto={modalCobrarAbierto}
          miembro={{
            id: miembro.id,
            nombre: miembro.nombre,
            apellido: miembro.apellido,
            dni: miembro.dni,
            saldoAFavor: Number(estadoCuenta?.resumen?.saldoAFavor ?? 0),
          }}
          cargosPendientes={estadoCuenta?.cargos || []}
          cargoInicialId={cargoIdACobrar}
          modoSaldoAFavor={modoSaldoAFavor}
          onCerrar={() => setModalCobrarAbierto(false)}
          onPagoExitoso={(mensaje) => {
            setAlerta({ tipo: 'exito', texto: mensaje });
            cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}

      {/* Modal para Generar Deuda Individual */}
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

      {/* Modal para Editar Grupo Familiar y Porcentaje de Descuento */}
      {modalEditarFamiliaAbierto && (miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar) && (
        <ModalEditarFamilia
          abierto={modalEditarFamiliaAbierto}
          familia={miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar}
          onCerrar={() => setModalEditarFamiliaAbierto(false)}
          onGuardado={() => {
            setAlerta({ tipo: 'exito', texto: 'Descuento familiar actualizado con éxito.' });
            if (miembro) cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}

      {/* Modal para Vincular Hermano por DNI */}
      {modalVincularHermanoAbierto && miembro && (
        <ModalVincularHermano
          abierto={modalVincularHermanoAbierto}
          usuarioId={miembro.id}
          usuarioNombre={`${miembro.nombre} ${miembro.apellido}`}
          onCerrar={() => setModalVincularHermanoAbierto(false)}
          onVinculado={() => {
            setAlerta({ tipo: 'exito', texto: 'Hermano vinculado al grupo familiar con éxito.' });
            if (miembro) cargarDatos(miembro.id);
            if (onActualizado) onActualizado();
          }}
        />
      )}
    </div>
  );
};
