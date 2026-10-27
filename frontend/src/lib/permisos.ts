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
    familia: ['miembros.editar'], // vincular / quitar hermanos
    descuentoFamiliar: ['tesoreria.gestionar'],
    clave: ['auth.resetear_clave'],
    pase: ['pases.ejecutar'],
  },
  cuotas: {
    cobrar: ['cuotas.cobrar'],
    cargoIndividual: ['cuotas.cobrar'],
    editarCargo: ['cuotas.cobrar'],
    anularCargo: ['cuotas.cobrar'],
    editarPago: ['cuotas.cobrar'],
    revertirPago: ['cuotas.cobrar'],
    ajustarSaldo: ['cuotas.cobrar'],
  },
  ficha: {
    completar: ['legajos.completar'],
    validarFisico: ['legajos.validar_fisico'],
    plantillas: ['legajos.plantillas_gestionar'],
  },
  organizacion: {
    gestionar: ['organizacion.gestionar'],
  },
  tesoreria: {
    gestionar: ['tesoreria.gestionar'],
  },
};

const PERMISOS_LECTURA: Record<string, string[]> = {
  cuotas: ['cuotas.ver', 'cuotas.cobrar', 'tesoreria.gestionar'],
  ficha: ['legajos.ver', 'legajos.completar', 'legajos.validar_fisico', 'legajos.plantillas_gestionar'],
  plantillas: ['legajos.plantillas_gestionar', 'legajos.ver'],
  pase: ['pases.ver', 'pases.ejecutar'],
  clave: ['auth.resetear_clave'],
  organizacion: ['organizacion.ver', 'organizacion.gestionar'],
  roles: ['organizacion.ver', 'organizacion.gestionar'],
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
