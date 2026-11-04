import { useAuthStore } from '../store/authStore';

/**
 * Mapa central de qué permiso habilita ver/editar cada módulo y campo de la UI.
 * Debe mantenerse sincronizado con los @RequirePermission del backend.
 */
const PERMISOS_EDICION: Record<string, Record<string, string[]>> = {
  miembro: {
    identidad: ['miembros.editar_identidad'], // nombre, apellido, dni, fechaNacimiento
    contacto: ['miembros.editar'], // teléfonos, email, familiares, domicilio, salud
    estado: ['miembros.baja'], // activo / baja
    familia: ['miembros.editar', 'cuotas.ajustar', 'tesoreria.gestionar'], // vincular / quitar hermanos
    descuentoFamiliar: ['tesoreria.gestionar', 'tesoreria.conceptos_planes'],
    clave: ['auth.resetear_clave'],
    pase: ['pases.ejecutar', 'miembros.editar'],
  },
  cuotas: {
    cobrar: ['cuotas.cobrar'],
    cargoIndividual: ['cuotas.cobrar', 'cuotas.ajustar', 'tesoreria.conceptos_planes'],
    editarCargo: ['cuotas.ajustar', 'tesoreria.gestionar'],
    anularCargo: ['cuotas.ajustar', 'tesoreria.gestionar'],
    editarPago: ['cuotas.ajustar', 'tesoreria.gestionar'],
    revertirPago: ['cuotas.ajustar', 'tesoreria.gestionar'],
    ajustarSaldo: ['cuotas.ajustar', 'tesoreria.gestionar'],
  },
  ficha: {
    completar: ['legajos.completar'],
    validarFisico: ['legajos.validar_fisico'],
    plantillas: ['legajos.plantillas_gestionar'],
  },
  organizacion: {
    gestionar: ['organizacion.gestionar'],
  },
  roles: {
    gestionar: ['roles.gestionar', 'organizacion.gestionar'],
  },
  tesoreria: {
    gestionar: ['tesoreria.gestionar'],
    caja: ['tesoreria.caja_ver', 'tesoreria.gestionar'],
    gastos: ['tesoreria.gastos_registrar', 'tesoreria.gestionar'],
    conceptos: ['tesoreria.conceptos_planes', 'tesoreria.gestionar'],
  },
  eventos: {
    ver: ['eventos.ver', 'eventos.vender', 'eventos.gestionar'],
    vender: ['eventos.vender', 'eventos.gestionar'],
    gestionar: ['eventos.gestionar'],
  },
};

const PERMISOS_LECTURA: Record<string, string[]> = {
  cuotas: ['cuotas.ver', 'cuotas.cobrar', 'cuotas.ajustar', 'tesoreria.gestionar'],
  ficha: ['legajos.ver', 'legajos.completar', 'legajos.validar_fisico', 'legajos.plantillas_gestionar'],
  plantillas: ['legajos.plantillas_gestionar', 'legajos.ver'],
  pase: ['pases.ver', 'pases.ejecutar'],
  clave: ['auth.resetear_clave'],
  organizacion: ['organizacion.ver', 'organizacion.gestionar'],
  roles: ['organizacion.ver', 'roles.gestionar', 'organizacion.gestionar'],
  tesoreria: ['tesoreria.caja_ver', 'tesoreria.gastos_registrar', 'tesoreria.conceptos_planes', 'tesoreria.gestionar'],
  eventos: ['eventos.ver', 'eventos.vender', 'eventos.gestionar'],
};

export const usePermisosUI = () => {
  const tienePermiso = useAuthStore((s) => s.tienePermiso);
  // Suscribirse a asignaciones para re-renderizar cuando cambian los permisos del rol
  useAuthStore((s) => s.asignaciones);

  const canEdit = (modulo: string, campo: string) =>
    (PERMISOS_EDICION[modulo]?.[campo] ?? []).some((p) => tienePermiso(p));

  const canView = (modulo: string) => (PERMISOS_LECTURA[modulo] ?? []).some((p) => tienePermiso(p));

  return { canEdit, canView };
};
