-- 1. Insertar o actualizar el catálogo de 18 permisos basado en 9 Paneles/Pestañas (ver / editar)
INSERT INTO "permisos" ("clave", "descripcion") VALUES
  ('padron.ver', 'Padrón y Ficha de Miembro: Solo lectura'),
  ('padron.editar', 'Padrón y Ficha de Miembro: Alta, edición de datos, baja y reseteo de clave'),
  ('legajos.ver', 'Legajos y Colaboradores: Solo lectura y descarga PDF'),
  ('legajos.editar', 'Legajos y Colaboradores: Completar fichas y validar entrega física QR'),
  ('plantillas.ver', 'Plantillas de Formularios: Solo lectura'),
  ('plantillas.editar', 'Plantillas de Formularios: Diseñar y editar moldes PDF'),
  ('pases.ver', 'Pases y Progresión: Solo lectura de candidatos y trayectoria'),
  ('pases.editar', 'Pases y Progresión: Ejecutar pases y gestionar asignaciones de rol'),
  ('cobranzas.ver', 'Cobranzas y Cuotas: Solo lectura de estado de cuenta y familias'),
  ('cobranzas.editar', 'Cobranzas y Cuotas: Cobrar, generar/ajustar cargos y descuentos familiares'),
  ('planes.ver', 'Planes y Conceptos: Solo lectura de planes anuales y campamentos'),
  ('planes.editar', 'Planes y Conceptos: Crear y editar planes de cuota y campamentos'),
  ('caja.ver', 'Caja, Bancos y Balance: Solo lectura de saldos, movimientos y cuadro de resultados'),
  ('caja.editar', 'Caja, Bancos y Balance: Registrar ingresos/gastos, traspasos, cuentas y rubros'),
  ('eventos.ver', 'Eventos Económicos: Solo lectura de eventos y pedidos'),
  ('eventos.editar', 'Eventos Económicos: Vender en POS, cobrar pedidos, validar QR y configurar eventos'),
  ('organizacion.ver', 'Organización y Sistema: Solo lectura de ramas, unidades y roles'),
  ('organizacion.editar', 'Organización y Sistema: Administrar ramas, unidades, roles y correo institucional')
ON CONFLICT ("clave") DO UPDATE SET "descripcion" = EXCLUDED."descripcion";

-- 2. Migrar asignaciones de permisos de roles existentes al nuevo esquema de paneles
WITH mapa_equivalencias (clave_vieja, clave_nueva) AS (
  VALUES
    ('miembros.ver', 'padron.ver'),
    ('miembros.crear', 'padron.ver'),
    ('miembros.crear', 'padron.editar'),
    ('miembros.editar', 'padron.ver'),
    ('miembros.editar', 'padron.editar'),
    ('miembros.editar_identidad', 'padron.ver'),
    ('miembros.editar_identidad', 'padron.editar'),
    ('miembros.baja', 'padron.ver'),
    ('miembros.baja', 'padron.editar'),
    ('auth.resetear_clave', 'padron.ver'),
    ('auth.resetear_clave', 'padron.editar'),
    ('legajos.completar', 'legajos.ver'),
    ('legajos.completar', 'legajos.editar'),
    ('legajos.validar_fisico', 'legajos.ver'),
    ('legajos.validar_fisico', 'legajos.editar'),
    ('legajos.plantillas_gestionar', 'plantillas.ver'),
    ('legajos.plantillas_gestionar', 'plantillas.editar'),
    ('pases.ejecutar', 'pases.ver'),
    ('pases.ejecutar', 'pases.editar'),
    ('cuotas.ver', 'cobranzas.ver'),
    ('cuotas.cobrar', 'cobranzas.ver'),
    ('cuotas.cobrar', 'cobranzas.editar'),
    ('cuotas.ajustar', 'cobranzas.ver'),
    ('cuotas.ajustar', 'cobranzas.editar'),
    ('tesoreria.conceptos_planes', 'planes.ver'),
    ('tesoreria.conceptos_planes', 'planes.editar'),
    ('tesoreria.caja_ver', 'caja.ver'),
    ('tesoreria.gastos_registrar', 'caja.ver'),
    ('tesoreria.gastos_registrar', 'caja.editar'),
    ('tesoreria.gestionar', 'cobranzas.ver'),
    ('tesoreria.gestionar', 'cobranzas.editar'),
    ('tesoreria.gestionar', 'planes.ver'),
    ('tesoreria.gestionar', 'planes.editar'),
    ('tesoreria.gestionar', 'caja.ver'),
    ('tesoreria.gestionar', 'caja.editar'),
    ('eventos.vender', 'eventos.ver'),
    ('eventos.vender', 'eventos.editar'),
    ('eventos.gestionar', 'eventos.ver'),
    ('eventos.gestionar', 'eventos.editar'),
    ('organizacion.gestionar', 'organizacion.ver'),
    ('organizacion.gestionar', 'organizacion.editar'),
    ('roles.gestionar', 'organizacion.ver'),
    ('roles.gestionar', 'organizacion.editar')
)
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT DISTINCT rp."rol_id", p_nuevo."id"
FROM "rol_permisos" rp
JOIN "permisos" p_viejo ON p_viejo."id" = rp."permiso_id"
JOIN mapa_equivalencias m ON m.clave_vieja = p_viejo."clave"
JOIN "permisos" p_nuevo ON p_nuevo."clave" = m.clave_nueva
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;

-- 3. Eliminar los micro-permisos obsoletos del catálogo
DELETE FROM "permisos"
WHERE "clave" NOT IN (
  'padron.ver', 'padron.editar',
  'legajos.ver', 'legajos.editar',
  'plantillas.ver', 'plantillas.editar',
  'pases.ver', 'pases.editar',
  'cobranzas.ver', 'cobranzas.editar',
  'planes.ver', 'planes.editar',
  'caja.ver', 'caja.editar',
  'eventos.ver', 'eventos.editar',
  'organizacion.ver', 'organizacion.editar'
);
