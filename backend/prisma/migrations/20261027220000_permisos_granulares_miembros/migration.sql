-- Permisos granulares por campo para la ficha de miembros
INSERT INTO "permisos" ("clave", "descripcion") VALUES
  ('miembros.editar_identidad', 'Editar nombre, apellido, DNI y fecha de nacimiento'),
  ('miembros.baja', 'Dar de baja o reactivar miembros')
ON CONFLICT ("clave") DO NOTHING;

-- Conservar el comportamiento previo: los roles no-PROPIO que ya editaban miembros reciben los nuevos permisos
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT rp."rol_id", p."id"
FROM "rol_permisos" rp
JOIN "permisos" pe ON pe."id" = rp."permiso_id" AND pe."clave" = 'miembros.editar'
JOIN "roles" r ON r."id" = rp."rol_id" AND r."alcance_por_defecto" <> 'PROPIO'
CROSS JOIN "permisos" p
WHERE p."clave" IN ('miembros.editar_identidad', 'miembros.baja')
ON CONFLICT DO NOTHING;
