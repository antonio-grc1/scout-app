# Auditoría UX/UI del frontend — Juan XXIII

**Fecha:** 20/11/2026 · **Rama:** `dev` (commit `e78bbd8`) · **Alcance:** `frontend/src` completo (~55k líneas)

**Cómo se hizo**
- Revisión de código de todas las páginas, pestañas, modales, drawers y menús, separada en 4 dominios.
- Revisión visual en la app corriendo local, en escritorio (1366×820) y móvil (375×812), modo claro y oscuro, con medición automática de contraste (WCAG) sobre el DOM real.
- Roles probados en vivo: **Jefe de Grupo (GLOBAL)**, **Jefe de Rama (UNIDAD)** y **Protagonista (PROPIO)**. Los roles GLOBAL parciales (Tesorero, Secretaría, Organizador de Eventos) se revisaron por código.

**Convenciones**
- Las rutas son relativas a `frontend/src/` salvo que se indique otra cosa.
- Severidad: **CRÍTICO** = rompe funcionalidad, error de dinero o expone acción/dato sin permiso · **ALTO** = bloquea a un rol o falla WCAG AA de forma notoria · **MEDIO** = inconsistencia o UX molesta · **BAJO** = pulido.
- Cada hallazgo tiene un ID (`B0-01`, …) para poder referenciarlo al corregir.
- (V) = confirmado visualmente en el navegador.

**Orden sugerido de corrección:** B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8. Los bloques B3 y B4 son cambios transversales (tokens y primitivos) que conviene hacer de una vez, antes de pulir pantalla por pantalla.

---

## Resumen ejecutivo

| Bloque | Tema | Crít. | Alto | Medio/Bajo |
|---|---|---|---|---|
| B0 | Bugs funcionales que rompen flujos ✅ corregido | 7 | 5 | 2 |
| B1 | Permisos y vistas por rol ✅ corregido (salvo B1-25, B1-28 y B1-29) | 4 | 12 | 13 |
| B2 | Integridad de datos (errores tragados, PDFs, dinero) ✅ corregido en su mayoría | — | 11 | 26 |
| B3 | Sistema de diseño: color, contraste, tipografía ✅ corregido (salvo B3-10) | — | 6 | 8 |
| B4 | Accesibilidad estructural (foco, diálogos, labels, ARIA) ✅ corregido en su mayoría | — | 8 | 10 |
| B5 | Mobile / responsive | — | 3 | 14 |
| B6 | Confirmaciones de acciones destructivas | — | 3 | 13 |
| B7 | Consistencia (primitivos, idioma, formatos, duplicados) | — | — | 16 |
| B8 | Mejoras UX y pulido por pantalla | — | — | ~40 |

**Lo más urgente:**
1. **Pases no funciona para educadores de rama:** la página entera falla con "No tienes permisos" (B0-01, V).
2. **No se puede editar, finalizar ni cancelar un evento que ya tiene ventas** (B0-03).
3. **"Cobro rápido a integrante" en Tesorería siempre sale vacío** (B0-02).
4. **Expediente:** con `?tab=seguridad|pase|cuotas` en la URL se muestran acciones sin permiso (B1-01).
5. **El escáner QR queda inutilizable** después de un error en modo no continuo (B0-04).
6. **Contraste:** el ámbar de marca como color de texto (342 usos) da 2.15:1 en modo claro, y el indicador de foco es invisible (B3-01, B3-02, V).
7. **Ningún modal maneja el foco:** no hay foco inicial, trampa de foco ni retorno de foco (B4-01, V).

8. **El selector de unidad del Jefe de Grupo es una lista plana con secciones vacías que se llaman igual que su rama** (B0-13, V).

**Lo que está bien:** el modo oscuro pasa contraste en todas las pantallas medidas, con los tres roles. No hay overflow horizontal en 375px en las páginas principales. El cierre de sesión purga correctamente el caché local con datos sensibles. Login y Mi Legajo tienen labels bien asociados y pestañas con `role="tab"`.

---

## B0 — Bugs funcionales que rompen flujos

> **Estado (20/11/2026): corregido**, sin commitear. Verificados en el navegador: B0-01, B0-02, B0-03, B0-06, B0-08 y B0-13. Verificados solo por código: B0-04 (requiere cámara), B0-05, B0-07, B0-09, B0-10, B0-11 (el Enter solo se probó en un formulario de un paso) y B0-12. B0-14 se resolvió con un guard en el backend (`tesoreria-eventos.service.ts`): ya no se puede revertir el cobro de un pedido con la ganancia acreditada. El dato inconsistente que ya existe en la base local no se tocó. B0-01 también corrige el vacío engañoso de B2-05.

| ID | Sev. | Dónde | Problema | Fix sugerido |
|---|---|---|---|---|
| B0-01 | CRÍTICO (V) | `pages/pases/PasesPage.tsx:57-61` | `Promise.all` incluye `api.get('/organizacion/unidades')` **sin `.catch`**. El backend responde 403 a usuarios UNIDAD (exige `organizacion.ver`), así que se rechaza todo y el Jefe/Educador de Rama nunca ve candidatos: aparece "No tienes permisos para realizar esta acción." y debajo un vacío engañoso. | Agregar `.catch(() => ({ data: [] }))`, o pedir unidades solo si `caps.canViewOrganizacion`. Resolver el nombre de unidad con `caps.unidadesAsignadas`. |
| B0-02 | CRÍTICO (V) | `pages/tesoreria/TesoreriaPage.tsx:302-306` | "Cobro rápido a integrante" lee `res.data.datos`, pero `GET /miembros` devuelve `{ items, total, … }`. La lista sale **siempre vacía**. | Leer `res.data.items`. |
| B0-03 | CRÍTICO | `components/ModalCrearEventoEconomico.tsx:242-270` | En edición siempre manda `items`. El backend (`tesoreria-eventos.service.ts:462-471`) rechaza el reemplazo de items si el evento tiene pedidos o está finalizado. Resultado: **no se puede editar, finalizar ni cancelar un evento con ventas**. | Mandar `items` solo si cambiaron y no hay pedidos; si hay pedidos, bloquear la sección de productos en la UI. |
| B0-04 | CRÍTICO | `components/qr/QrScannerUniversalModal.tsx:241-268, 339-378` | En modo no continuo, tras un escaneo de legajo con error (o un evento offline) la cámara se detiene, `camaraActiva` sigue en true y `scanInProgressRef` queda en `true`. Queda un recuadro negro sin "Reintentar" hasta cerrar el modal. | Después de cualquier resultado o error, resetear `scanInProgressRef` y reiniciar la cámara (nonce en las deps del hook). Agregar un botón "Reintentar". |
| B0-05 | CRÍTICO | `pages/eventos/EventoWorkspacePage.tsx:369-381, 1552, 1669` | La liquidación cuenta como "listos" pedidos PENDIENTES con vales retirados, pero el backend solo acredita los PAGADOS. **El monto confirmado es mayor que el acreditado.** | Filtrar por `p.estado === 'PAGADO'`. |
| B0-06 | CRÍTICO | `components/ModalCargarPedidoEvento.tsx:132-137` | Con alcance GLOBAL, "Editar" un pedido PENDIENTE preselecciona EFECTIVO y la primera cuenta. Guardar solo para corregir el nombre lo marca **PAGADO y crea un ingreso**. | Con `preferirCobro=false`, mantener PENDIENTE y no enviar método ni cuenta. |
| B0-07 | CRÍTICO | `pages/tesoreria/TesoreriaPage.tsx:406-414, 1027-1033` | Si se tocan dos meses de un plan seguido, ambos requests parten del mismo `mesesHabilitadosJson` viejo y el segundo pisa al primero: **un mes se pierde y los cargos quedan mal**. | Bloquear todo el plan mientras sincroniza, o usar estado optimista local. |
| B0-08 | ALTO (V) | `pages/inicio/InicioPage.tsx:939` | El enlace "Ver cuadro completo" apunta a `/tesoreria?sub=cuadro-resultados`, pero el id real es `balance`, así que cae en Cobranzas. | `?sub=balance`. |
| B0-09 | ALTO | `components/PanelTesoreriaCajaBanco.tsx:1541-1554` | "- Gasto" desde el libro de una cuenta abre `ModalRegistrarGasto` sin la cuenta: se imputa a `cuentasList[0]` (p. ej. Caja en vez de Banco). | Pasar `cuentaIdInicial`, como ya se hace en Ingreso. |
| B0-10 | ALTO | `components/ModalCargarPedidoEvento.tsx:347-351` | En un pedido PAGADO, elegir "Cobrar al retirar" manda `cuentaId` undefined. El backend lo conserva y el cambio se ignora sin aviso. | Enviar `cuentaId: null` explícito o deshabilitar la opción. |
| B0-11 | ALTO | `components/DynamicFormRenderer.tsx:1449-1456, 1626-1633` | Hay un `type="submit"` en todos los pasos: Enter en cualquier input **finaliza el legajo** y descarga el PDF si estaba precargado completo. | Interceptar Enter: si no es el último paso, ir al siguiente paso. El botón secundario debe ser `type="button"`. |
| B0-12 | ALTO | `pages/mi-espacio/MiEspacioPage.tsx:540-568, 1059` | Al cambiar de documento en Mi Legajo, el formulario nuevo se monta con los valores iniciales del documento anterior: queda precargado con **respuestas de otro documento**. | Setear la plantilla recién después de recibir la precarga, con spinner y guarda de carrera. |
| B0-13 | MEDIO (V) | `components/layout/AppShell.tsx:350-368` + `core/capabilities.ts:obtenerUnidadesVisibles` | El selector "Unidad activa" (GLOBAL) es una lista plana de 11 secciones sin agrupar. Varias secciones se llaman como su rama y están vacías ("Rama Lobatos", "Rama Caminantes", "Rama Rovers": tipo SECCION_RAMA con 0 miembros, creadas junto con cada rama). Elegirlas deja el padrón vacío y parece que se eligió "la rama entera". *(Corrección: en la primera versión se atribuyó a un bug del filtro; el filtro funciona bien.)* | Agrupar con `<optgroup>` por rama e indicar las secciones sin miembros. Evaluar si esas secciones automáticas deben existir. |
| B0-14 | MEDIO (V, a verificar) | Eventos → Pedidos (evento "Cumple Grupo 2026") | Hay un pedido en estado **PENDIENTE (RETIRADO)** marcado "+$3 · Acred.": la ganancia figura acreditada en un pedido no pagado. El backend solo acredita PAGADOS, así que probablemente el pedido se pasó a PENDIENTE después de acreditar (editar o revertir el cobro) sin revertir la ganancia. | Revisar en el backend que pasar un pedido de PAGADO a PENDIENTE (o revertir el cobro) revierta `gananciaAcreditada` o lo impida. En la UI, no ofrecer ese cambio si ya está acreditado. |

---

## B1 — Permisos y vistas por rol

> **Estado (21/11/2026): corregido**, sin commitear, excepto B1-25, B1-28 y B1-29.
> - Se agregaron en `lib/permisos.ts` los helpers `tienePermisoSobreUnidades` y `tienePermisoSobreMiembro`, que se usan para las acciones por fila (legajos, pases por camada, cobro en búsqueda).
> - En el Expediente, todos los permisos se evalúan ahora con alcance mínimo UNIDAD.
> - `canConfigureEventos` pasa a ser solo GLOBAL, alineado con el backend.
> - Verificado en el navegador como Jefe de Rama y como Protagonista. B1-01 y B1-17: el expediente propio con `?tab=seguridad` cae en Datos. B1-05: sin "Nuevo evento" ni "Configurar". B1-19: barra móvil. B1-20: cero respuestas 403. B1-27: título del padrón. Los botones de legajos de B1-02 también se probaron.
> - **Pendientes:** B1-25 (Inicio casi vacío para educadores sin padrón) y B1-28 (KPIs de Tesorería por permiso) quedan para B8. B1-29 necesita backend: `GET /miembros` exige `padron.ver`, así que hace falta un endpoint de búsqueda para tesorería. B1-20 quedó resuelto solo del lado del front (se evitan los 403 y se usan los datos de respaldo). Para que un Jefe de Rama vea las secciones destino de un pase, el backend tendría que exponer un catálogo de unidades y ramas de solo lectura para alcance UNIDAD.

### B1.a Acciones o datos expuestos sin permiso

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B1-01 | CRÍTICO | `pages/miembros/ExpedienteMiembro360.tsx:1857-2027` + `MiembroDetallePage.tsx:26-29` | El contenido de cada pestaña se renderiza con `tab === X` sin verificar que X esté en `tabsItems`. Con `/miembros/5?tab=seguridad`, `?tab=pase` o `?tab=cuotas`, alguien con solo `padron.ver` ve "Generar clave temporal", "Confirmar pase" o anular/revertir pagos. | Si el tab no está permitido, caer a `datos`. |
| B1-02 | CRÍTICO | `pages/legajos/LegajosPage.tsx:1206-1214` + `pages/legajos/CompletarLegajoPage.tsx:75` | "Editar/Completar" el legajo de otro miembro se muestra con `legajos.ver` o `plantillas.ver`, y la página acepta el `usuarioId` con solo `canViewLegajosModule`. | Mostrar el botón y aceptar `usuarioId` solo con `legajos.editar` en alcance UNIDAD. |
| B1-03 | CRÍTICO | `components/PanelPasesPorCamada.tsx:25-26, 295, 397` | `esGlobal = tienePermisoGlobal(['pases.ver','pases.editar'])`: con `pases.ver` GLOBAL + `pases.editar` UNIDAD se habilita EGRESO y pases sobre cualquier unidad. | Usar `caps.canExecuteEgreso` y verificar la unidad de cada camada con `obtenerUnidadesConPermiso('pases.editar')`. |
| B1-04 | CRÍTICO | `pages/miembros/MiembrosPage.tsx:933-1031, 1146` | La exportación Excel/CSV incluye alertas médicas, régimen alimentario, deuda y saldo para **cualquiera con `padron.ver`**. | Armar las columnas según `legajos.ver` y `cobranzas/caja.ver`. |
| B1-05 | ALTO | `pages/eventos/EventosCatalogoPage.tsx:221-231, 310-320` · `EventoWorkspacePage.tsx:719-740, 1537` | "Nuevo evento", "Configurar", "Eliminar" y "Acreditar" se muestran con `canConfigureEventos` (UNIDAD), pero el backend las permite **solo con GLOBAL** (403). | Usar `canCreateGlobalEventos`. |
| B1-06 | ALTO | `pages/eventos/EventoWorkspacePage.tsx:1029-1040, 415-437` | Un vendedor UNIDAD puede elegir "Venta general" o no asignar vendedor; el backend lo rechaza y el usuario ve un genérico "No tienes permisos". | Ocultar esa opción y exigir vendedor para UNIDAD, como ya hace `ModalCargarPedidoEvento`. |
| B1-07 | ALTO | `pages/miembros/MiembrosPage.tsx:1818-1834, 2183-2191` | El chip "Alerta médica" y el badge con resumen médico en `title` se muestran sin `puedeVerFichas`. | Gatear igual que FALTA_FICHA. |
| B1-08 | ALTO | `pages/miembros/ExpedienteMiembro360.tsx:1569-1623` | La tira "Seguridad Vital" (alergias, medicación) se muestra sin `puedeVerFicha`. Si la carga falla dice "Sin alertas médicas declaradas", un **falso negativo peligroso**. | Gatear y mostrar "Sin acceso a la ficha". |
| B1-09 | ALTO | `pages/miembros/ExpedienteMiembro360.tsx:257-277, 318-323` | Todos los `puede*` usan `usePermisosUI.canEdit()`, que **ignora el alcance**: con `padron.editar` PROPIO se ven formularios editables de otros. | Usar `canEditInScope(…, 'UNIDAD')` o `caps`. |
| B1-10 | ALTO | `pages/miembros/ExpedienteMiembro360.tsx:262` + `lib/permisos.ts:74` | `puedeVerFicha` incluye `plantillas.ver`: quien solo diseña plantillas ve fichas de salud completas. | Exigir `legajos.ver`. |
| B1-11 | ALTO | `pages/legajos/LegajosPage.tsx:140-141, 878-911` | Las pestañas Cumplimiento, Salud y Colaboradores se ven con `plantillas.ver`, y Plantillas exige GLOBAL aunque el editor de roles ofrece `plantillas.ver` UNIDAD. | Tres pestañas según `legajos.*` y Plantillas según `puedeVerPlantillas`. |
| B1-12 | ALTO | `pages/legajos/LegajosPage.tsx:1178` | "Validar físico" depende de `canValidateQr` global, no de la unidad de la fila. | Chequear la unidad con `obtenerUnidadesConPermiso('legajos.editar')`. |
| B1-13 | ALTO | `pages/miembros/MiembrosPage.tsx:138` vs `components/MiembroCard.tsx:51` | `puedeVerCuotas` difiere entre desktop (incluye `padron.editar` vía `canSeeTesoreriaGestion`) y mobile: **todo editor de padrón ve deudas** en desktop. | Usar un único `caps.canViewCuotas`. |
| B1-14 | MEDIO | `App.tsx:248-250` | `/legajos/completar` no tiene `allow`. | `allow={(c) => c.canCompleteLegajos \|\| c.canViewLegajosModule}`. |
| B1-15 | MEDIO | `pages/miembros/MiembrosPage.tsx:175, 207-210` | `?filtro=CON_DEUDA` en la URL filtra deudores aunque no haya permiso de cuotas, y no hay chip visible para salir del filtro. | Normalizar el filtro según permisos. |
| B1-16 | MEDIO | `pages/tesoreria/TesoreriaPage.tsx:783` | "Cobrar" en resultados de búsqueda no valida el alcance de unidad (las tarjetas sí lo hacen). | Aplicar `enAlcanceUnidad`. |
| B1-17 | MEDIO | `ExpedienteMiembro360.tsx:258-277` | Sin guarda `esMismoUsuario`: uno puede darse de baja, revocarse sesiones o cobrarse/ajustarse el propio saldo. | Ocultar esas acciones sobre uno mismo (y validar en el backend). |

### B1.b Navegación y vistas por rol inconsistentes

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B1-18 | ALTO | `components/layout/AppShell.tsx:170-177` vs `App.tsx:296-302` | El ítem "Organización" exige `canViewOrganizacion`, pero la ruta acepta `canViewRoles \|\| canEditCorreo`. Un rol con solo Roles o Correo **no tiene cómo llegar**. | `show: caps.canViewOrganizacion \|\| caps.canViewRoles \|\| caps.canEditCorreo`. |
| B1-19 | ALTO | `AppShell.tsx:205-224, 405-421` | La barra inferior móvil y el FAB enlazan a `/eventos` sin chequear `canViewEventos` (redirige a Inicio). Para el Protagonista, Eventos aparece **dos veces** (FAB + tab) (V). | Armar los slots según capacidades. Si no hay QR, el FAB podría ser "Mi Legajo" o no mostrarse. |
| B1-20 | ALTO | Organización (`organizacion/*`) desde Miembros, Expediente, Pases, Inicio, Tesorería | Para usuarios UNIDAD, `/organizacion/unidades`, `/roles` y `/ramas` dan **403** (V). Donde hay `.catch`, los catálogos quedan vacíos (filtros de rol y sección, nombres de unidades); donde no, rompe (B0-01). | Que el backend exponga catálogos de solo lectura para UNIDAD, o resolver en el front con `caps.unidadesAsignadas` y no pedirlos sin permiso. |
| B1-21 | MEDIO | `pages/mi-espacio/MiEspacioPage.tsx:873-877` + `InicioPage.tsx:777-801` | La pestaña "Mis Pedidos y Vales" y la tarjeta del checklist se muestran siempre; sin `eventos.ver` dan 403 y muestran "No hay eventos". | Condicionar a `caps.canViewEventos`. |
| B1-22 | MEDIO | `pages/mi-espacio/MiEspacioPage.tsx:829-832` | Para UNIDAD/GLOBAL llegan eventos BORRADOR y CANCELADO y se muestran como "Finalizado". | Filtrar y etiquetar según `estado`. |
| B1-23 | MEDIO (V) | `pages/eventos/EventosCatalogoPage.tsx:236-265` | El Protagonista ve KPIs de gestión ("Recaudación acumulada", "Ganancia familias", "Vales entregados") en $0. | Mostrarlos solo con `canSellEventos`. |
| B1-24 | MEDIO | `pages/inicio/InicioPage.tsx:896-924` | La tarjeta de Alertas médicas usa `canViewMiembros`, pero las entregas solo se cargan con `canViewLegajosModule`: sin ese permiso afirma "Sin alertas". | Condicionar a `canViewLegajosModule`. |
| B1-25 | MEDIO | `InicioPage.tsx:807, 521` | Un educador UNIDAD/GLOBAL sin `padron.ver` (p. ej. solo Tesorería) ve un Inicio casi vacío. | Mostrar el checklist personal cuando `!canViewMiembros`. |
| B1-26 | MEDIO | `pages/organizacion/OrganizacionPage.tsx:208-230` | Con solo Roles o Correo se ven "Ramas activas 0 / Secciones 0". | KPIs según capacidad. |
| B1-27 | MEDIO (V) | `pages/miembros/MiembrosPage.tsx` (header) | El título dice "Padrón del Grupo" aunque un Jefe de Rama ve solo su rama. | Título según alcance ("Padrón · Rama Scout Cura Brochero"). |
| B1-28 | MEDIO | `pages/tesoreria/TesoreriaPage.tsx:669-708` | Con un solo permiso (Cobranzas o Planes) los otros KPIs muestran "0". | KPI por permiso. |
| B1-29 | MEDIO | `pages/tesoreria/TesoreriaPage.tsx:749` | Un tesorero sin `padron.ver` no puede buscar a un integrante sin hermanos para cobrarle. | Habilitar la búsqueda con `canCobrar`. |

**Raíz común de B1:** hay **tres fuentes de permisos que divergen** (`caps` con alcance, `usePermisosUI.canEdit` sin alcance, `authStore.tienePermisoUnidadOGlobal`), además de permisos por fila evaluados como booleanos globales. Se recomienda un único helper `puedeEn(permiso, unidadId?)` sobre `capabilities.ts` y eliminar `canEdit` sin alcance.

---

## B2 — Integridad de datos y estados (carga / error / vacío)

> **Estado (21/11/2026): corregido en su mayoría**, sin commitear.
> - **Corregidos:** B2-01 a 04, 07, 10, 13 a 16, 20 a 24 y 26 a 35.
> - **Novedades técnicas:**
>   - Marca de agua "BORRADOR - NO VÁLIDO" en `pdfGenerator` cuando el hash no es el oficial.
>   - Store `cambiosSinGuardarStore`: la navegación del AppShell pide confirmación antes de salir con cambios sin guardar. `useBlocker` no está disponible porque la app usa `BrowserRouter`.
>   - `parsearMontoAR` (con test) para el monto recibido en Cobrar deuda.
>   - `/auth/me` ya no vuelve a setear la sesión si no cambió nada.
> - **Verificado en el navegador:** la marca de agua en la vista previa con cambios sin guardar, y la confirmación al cambiar de pestaña y al navegar desde el menú lateral.
> - **Pendientes:**
>   - B2-05: ya estaba resuelto en B0.
>   - B2-06, 08, 09, 11 y 12: estados de error en Tesorería, Completar legajo, roles de Organización, modales de rubros, gastos e ingresos, y Familias y Expediente sin "Reintentar".
>   - B2-17: el molde A4 en blanco cuando falta el PDF base.
>   - B2-25: respuestas viejas que pisan a las nuevas en el libro diario, el cuadro de resultados y los buscadores.
>   - B2-36: los totales exportados.
>   - B2-37: el orden de las cuotas es intencional en el backend (ciclo más reciente primero).
>   - B2-21 sigue sin cubrir el botón Atrás del navegador ni el editor visual de plantillas.
>   - El parser de montos solo se aplicó al monto recibido de Cobrar deuda; los demás campos de monto siguen como `type="number"`.

### B2.a Error tratado como dato real (patrón `.catch(() => ({ data: [] }))`)

| ID | Sev. | Dónde | Lo que ve el usuario cuando falla |
|---|---|---|---|
| B2-01 | ALTO | `MiEspacioPage.tsx:276-280, 1082-1150` | "Cuotas al día" aunque haya deuda (el `estado-cuenta` no se espera y su error se traga). |
| B2-02 | ALTO | `MiEspacioPage.tsx:418-427, 1663-1852` | Si falla `/mi-perfil`, el form aparece vacío y "Guardar contacto" **borra los teléfonos de emergencia**. |
| B2-03 | ALTO | `components/PanelConfiguracionCorreo.tsx:54-58` | Si falla el GET, el form aparece vacío y "Guardar" **borra la configuración SMTP**. |
| B2-04 | MEDIO | `InicioPage.tsx:162-166, 233, 545-547` | "Cuotas al día" o "0 miembros" sin aviso de error. |
| B2-05 | MEDIO | `PasesPage.tsx:193-223` | "Todas las camadas se encuentran en la rama correspondiente" debajo del error (V). |
| B2-06 | MEDIO | `TesoreriaPage.tsx:226-238` | "No hay grupos familiares…"; el banner offline nunca se activa. |
| B2-07 | MEDIO | `PestanaCuotasTesoreria.tsx:150-185` | "Deuda total $0" y "Sin cuotas activas". |
| B2-08 | MEDIO | `CompletarLegajoPage.tsx:117-126, 704-719` | "No hay plantillas oficiales activas. Un administrador debe…". |
| B2-09 | MEDIO | `OrganizacionPage.tsx:118, 121` | La pestaña Roles aparece vacía. |
| B2-10 | MEDIO | `EventosCatalogoPage.tsx:277-322` · `EventoWorkspacePage.tsx:191-195` | Error y "Crear primer evento" a la vez; sin conexión, "No se encontró el evento". |
| B2-11 | MEDIO | `ModalGestionRubros.tsx:87` · `ModalRegistrarGasto.tsx:117` · `ModalRegistrarIngreso.tsx:123` | "Creá tu primera categoría" / selects vacíos con `required`. |
| B2-12 | MEDIO | `MiembrosPage.tsx:2393-2412` · `ExpedienteMiembro360.tsx:1855` | Familias vacías / error sin "Reintentar". |
| B2-13 | MEDIO | `MiembrosPage.tsx:2232-2255` · `MiembroCard.tsx:166-178` | "Sin ficha" para todos cuando no se cargaron las entregas (falta permiso). |

**Fix general:** separar los tres estados **cargando / error (con "Reintentar") / vacío**. Idealmente migrar estas cargas a `react-query`, que ya está instalado pero casi no se usa: aporta caché, cancelación e invalidación, y reduce requests duplicados (en Pases, `candidatos` y `solicitudes` se piden 4 veces cada uno al entrar, V).

### B2.b PDFs oficiales y QR

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B2-14 | ALTO | `MiEspacioPage.tsx:502, 524-538` · `CompletarLegajoPage.tsx:278-298, 316-322` | "Descargar" y "Vista previa" usan los valores **sin guardar** con el `hashVerificacion` oficial: el papel firmado no coincide con lo que valida el QR. | Regla única: hash oficial solo con entrega finalizada y sin cambios; en cualquier otro caso, marca de agua "BORRADOR". |
| B2-15 | ALTO | `MiEspacioPage.tsx:681-699` · `CompletarLegajoPage.tsx:437-455` | Si el POST funciona pero falla el PDF, se muestra "No se pudo guardar el formulario" (falso). | try/catch separado: "Guardado; no se pudo generar el PDF". |
| B2-16 | ALTO | `CompletarLegajoPage.tsx:118, 129, 166-172` | Si falla `/miembros/:id`, se usa el usuario de la sesión: el educador puede guardar **sus propios datos en el legajo de otro**. | Bloquear el formulario con un error. |
| B2-17 | MEDIO | `LegajosPage.tsx:691` + `services/pdfGenerator.ts:1451-1453` | Sin `mapeoPdfJson` o sin PDF base se genera en silencio un A4 en blanco que parece el oficial. | Error explícito. |
| B2-18 | MEDIO | `QrScannerUniversalModal.tsx:990-1005` | "Confirmar recibido" aparece también para estados BORRADOR. | Solo con `PENDIENTE_FIRMA_FISICA`. |
| B2-19 | BAJO | `QrScannerUniversalModal.tsx:351` | Los QR `BORRADOR-dni-ciclo` se mandan a eventos y dan un error confuso. | Reconocer el prefijo y explicarlo. |

### B2.c Datos sobrescritos o desincronizados

| ID | Sev. | Dónde | Problema |
|---|---|---|---|
| B2-20 | ALTO | `MiEspacioPage.tsx:437, 667` | Perfil cacheado: guardar el legajo con `actualizarDatosFijos` y después "Guardar contacto" **pisa los datos nuevos**. Invalidar perfil y precarga tras cada guardado. |
| B2-21 | ALTO | `MiEspacioPage.tsx:103-159` · `CompletarLegajoPage.tsx:213-218, 505-509` · `VisualPdfEditorDrawer.tsx:1136-1174` | Cambios sin guardar: el botón Atrás o la navegación del AppShell pierden el formulario o el diseño sin aviso. Usar `useBlocker` + `ConfirmImpactDialog`. |
| B2-22 | MEDIO | `ExpedienteMiembro360.tsx:637-641` | Guardar contacto sobrescribe `regimen_dietario`/`sufre_alergia` con booleanos y **se pierde el texto médico**. |
| B2-23 | MEDIO | `components/PanelGestorRoles.tsx:488-507` | Guardar un rol borra permisos que no estén en `PANELES_SISTEMA`. |
| B2-24 | MEDIO | `ExpedienteMiembro360.tsx:568-576` | Al cambiar de miembro no se resetea `miembro`: se ve a la persona anterior mientras carga. |
| B2-25 | MEDIO | `PanelTesoreriaCajaBanco.tsx:276-319` · `PanelCuadroResultados.tsx:113-115` · `SelectorDestinatarios.tsx:118-148` · `CommandPaletteModal.tsx:102-111` | Respuestas viejas pisan las nuevas (sin AbortController ni id de request). |
| B2-26 | MEDIO | `ModalCrearCuentaFinanciera.tsx:99-118` · `ModalCrearRubro.tsx:101-120` | El reset depende de `unidadesDisponibles` y borra lo que el usuario ya escribió. |
| B2-27 | MEDIO | `App.tsx:146-148` + `InicioPage.tsx:265-296` | Cada `focus` de ventana llama `/auth/me`, crea objetos nuevos y dispara **2 recargas completas** de Inicio con spinners. |
| B2-28 | MEDIO | `ExpedienteMiembro360.tsx:369, 1438` · `PestanaLegajosFichas.tsx:240` | Las entregas se piden sin `cicloAnio` y se mezclan años. |

### B2.d Dinero y fechas

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B2-29 | ALTO | `ModalCobrarDeuda.tsx:577-587` (y demás inputs de monto) | `type="number"` sin `inputMode="decimal"`: "1.500" (miles en es-AR) se interpreta como 1.5. | Un `InputMonto` común con parser AR y vista previa formateada. |
| B2-30 | ALTO | `utils/exportadorPlanillas.ts:40, 89-91` | El CSV separado por ";" escribe decimales con punto: Excel AR lo lee como texto o como ×10. | Coma decimal en CSV. |
| B2-31 | ALTO | `TesoreriaPage.tsx:1210` · `MiEspacioPage.tsx:1180` · `PanelSolicitudesPase.tsx:82` | Fechas ISO medianoche UTC se muestran con el **día anterior**, y timestamps con `timeZone: 'UTC'` con el día siguiente. | Usar los formateadores de `lib/formatters`. |
| B2-32 | MEDIO | `ModalCobrarDeuda.tsx:315-322, 609-670` | Transferencia sin cuenta bancaria u "Otro medio": el pago no entra en ningún libro diario. | Avisar o bloquear. |
| B2-33 | MEDIO | `EventoWorkspacePage.tsx:178, 1114` · `ModalCargarPedidoEvento.tsx:765` | La cuenta no se filtra por método (efectivo→caja, transferencia→banco) y el backend lo rechaza. | Filtrar y autoseleccionar. |
| B2-34 | MEDIO | `ModalCrearEventoEconomico.tsx:245-249` | Permite ganancia mayor que el precio. | Validar. |
| B2-35 | MEDIO | `ModalPlanCuotaMensual.tsx:196-199` | Permite guardar un plan con 0 meses. | Validar. |
| B2-36 | MEDIO | `PanelTesoreriaCajaBanco.tsx:527-568` · `PanelGastosTesoreria.tsx:166-173, 259` | Totales exportados o del KPI que no cuadran con los filtros ("5 gastos de 4"). | Totalizar lo filtrado. |
| B2-37 | MEDIO (V) | Mi Espacio → Mis Cuotas | Las cuotas no están en orden cronológico (aparecen 2027 antes que 2026). Se muestran a la vez "Deuda $771.666" y "Saldo a favor $22.234" sin explicar por qué el saldo no se aplica. | Ordenar por período y agregar una línea explicativa o un CTA "Aplicar saldo". |

---

## B3 — Sistema de diseño: color, contraste, tipografía

> **Estado (21/11/2026): corregido** (sin commitear), salvo B3-10.
> - **B3-01:** en modo claro, `text-brand` se remapea a `--color-brand-ink` mediante un override en `index.css`, solo para texto; los íconos SVG conservan el ámbar. Cubre los 342 usos de una vez.
> - **B3-02:** `--color-focus` pasa a `brand-ink` en claro, y el borde de foco de `.s-input` usa ese token. En oscuro se mantiene el ámbar claro.
> - **B3-03:** los tonos de texto emerald/rose/blue/teal/amber 500-600 se remapean a tokens nuevos `--color-text-*` (≥ 4.5:1) en modo claro.
> - **B3-04 y B3-05:** botones y avatares blancos se pasaron a tonos -700 (emerald, sky), y el chip de saldo seleccionado usa `text-brand-contrast`.
> - **B3-06:** Inter Variable autoalojada (`@fontsource-variable/inter`, solo `latin` y `latin-ext`, ~130 KB) y precacheada por la PWA. Es una dependencia nueva.
> - **B3-07:** los 23 textos de 10–11px pasaron a `text-xs`.
> - **B3-08, 09, 11, 13 y 14:**
>   - Variantes `dark:` en los hovers.
>   - KpiCard y los montos del cuadro dejan de truncarse.
>   - El anillo de foco del modal de deuda usa el token de marca.
>   - `s-anim-fade-up` se reemplazó por `s-anim-view`.
>   - Se sacó el hex técnico del subtítulo del tema.
> - **B3-12:** se corrigió el README (existe un solo preset, `scout`). No se implementó el preset AAA.
> - **Verificado en el navegador** con `getComputedStyle` y cálculo de contraste: las pantallas de los tres roles en modo claro y varias en oscuro, más el modal de rol y el expediente (4 pestañas), dan 0 fallas. Quedan solo dos símbolos decorativos ("·" de mes no habilitado y el separador "/").
> - **Pendiente:** B3-10 (estados solo por color) se trata junto con `aria-pressed` en B4.

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B3-01 | ALTO (V) | `tokens.css:39` · **342 usos de `text-brand`** | En modo claro `--color-brand` #f59e0b sobre blanco da **2.15:1** (AA pide 4.5). Afecta links "Revisar →", "Cobrar →", "Ver Mi Perfil →", "Ver ficha PDF", "Abrir mesa operativa", contadores, KPIs en ámbar ("$ 0") y el tab activo de la barra móvil. Ya existe `--color-brand-ink` (#92400e, ≥6:1) pensado para texto. | Mapear `text-brand` a `brand-ink` en claro: crear la utilidad `text-brand-ink` y reemplazar en masa, o hacer que `--color-brand` se use solo para fondos. En oscuro se mantiene (#fbbf24 pasa). |
| B3-02 | ALTO | `tokens.css:51` · `base.css:6` · `index.css:166-169` | `--color-focus = --color-brand`: el contorno de foco y el borde de `s-input:focus` quedan en ~2.1:1 sobre blanco, y sobre botones ámbar el foco es **invisible**. El halo `brand-soft` tampoco se distingue. | `--color-focus: var(--color-brand-ink)` en claro, con `outline-offset` y un halo de 2px. |
| B3-03 | ALTO (V) | Clases Tailwind hardcodeadas: `text-emerald-600` (41), `text-rose-500/600` (77), `text-teal-600`, `text-blue-600`, `text-amber-600` | En 12-15px dan 3.1–3.9:1 sobre surface/paper (Cuadro de resultados, Caja, Ganancias, "Saldo a favor", checklist de CambiarClave, estados de Importar). | Usar los tokens `--s-ok-ink` / `--s-err-ink` / `--s-info-ink`, o subir a `-700`. Mejor: crear utilidades semánticas `text-ok`, `text-err`, `text-info`. |
| B3-04 | ALTO | `PanelTesoreriaCajaBanco.tsx:640, 727` · `ModalRegistrarIngreso.tsx:423` · `ModalGestionRubros.tsx` | Texto blanco sobre `bg-brand` (~2:1) y blanco sobre `emerald-600` (3.77:1) en botones. | `text-brand-contrast`; emerald-700 o `s-btn-ok`. |
| B3-05 | ALTO (V) | `lib/ramaColors.ts:38, 48` | Avatares con iniciales blancas sobre `emerald-600` (3.65:1) y `sky-500` (~2.8:1). | Tonos -700 o texto oscuro. |
| B3-06 | ALTO | `tokens.css:13-14` · `index.html` | La fuente **'Inter' se declara pero no se carga** (no hay `@font-face`, Google Fonts ni fontsource). Cada sistema muestra una fuente distinta (Segoe UI en Windows, Roboto en Android, SF en iOS) y se pierde el look diseñado y las métricas. | Cargar Inter (p. ej. `@fontsource-variable/inter`, autohosteada para PWA/offline) o declarar honestamente el stack del sistema. |
| B3-07 | MEDIO | 22× `text-[11px]`, 1× `text-[10px]` (+ barra móvil 11px) | Texto menor a 12px: badges, montos mensuales del cuadro, labels de la barra móvil, descripciones de categoría. | Mínimo 12px; en la barra móvil, 12px. |
| B3-08 | MEDIO | `PanelAdminRamas.tsx:507, 629` · `PanelGestorRoles.tsx:763` · `PestanaPaseRol.tsx:364` | `hover:bg-*-100` sin variante dark (rosa sobre rosa ~1.3:1); `border-neutral-900` invisible en dark. | Agregar variantes `dark:`. |
| B3-09 | MEDIO | Montos con `truncate` en `KpiCard.tsx:54` y `PanelCuadroResultados.tsx:539-545` | Se cortan cifras. | Tamaño responsivo y nunca truncar montos. |
| B3-10 | MEDIO | Estados transmitidos **solo por color** | Meses activos del plan, chips de filtro, punto rojo de alertas, vale retirado solo tachado, selecciones con ring. | Agregar ícono o texto, más `aria-pressed` (ver B4). |
| B3-11 | BAJO | `ModalGenerarDeudaManual.tsx:163` | Anillo de foco blue-500 distinto del de marca. | Token de foco. |
| B3-12 | BAJO | `README` de `src` / `store/themeStore.ts` | La documentación promete 3 presets (Claro, Oscuro, **AAA**) pero solo existe "scout". | Implementar el AAA (alto contraste) o corregir la documentación. |
| B3-13 | BAJO | `index.css` | La clase `s-anim-fade-up` se usa en 3 lugares (p. ej. `PasesPage`) pero no existe. | Definirla o usar `s-anim-view`. |
| B3-14 | BAJO | `ThemeCustomizerModal.tsx:57` | El subtítulo muestra un hex técnico ("#f6f6f2"). | Quitarlo. |

**Nota:** el **modo oscuro pasa contraste en todas las pantallas medidas** (V). Los problemas de B3-01 a B3-05 son casi exclusivos del modo claro.

---

## B4 — Accesibilidad estructural

> **Estado (21/11/2026): corregido en su mayoría**, sin commitear.
> - **B4-01 y B4-02:** `useModalOverlay` ahora da foco inicial al panel, trampa de Tab (también con Shift+Tab), retorno de foco al disparador, y completa `role="dialog"`, `aria-modal` y el nombre (del primer título) si el panel no los declaraba. Cubre los 29 modales y drawers. `ModalHistorialSeccion` tenía el rol en el fondo y se movió al panel.
> - **B4-03 y B4-11:** nuevo `lib/accesibilidadAuto.ts`, un `MutationObserver` iniciado en `main.tsx` que asocia cada `<label>` con el control que le sigue, usa el `placeholder` como `aria-label` en campos sin nombre, y nombra botones de solo ícono (desde `title` o según el ícono: cerrar, eliminar, editar…). Es una **red de seguridad**: la solución de fondo sigue siendo migrar los formularios a `Input`/`Select`. Medido antes/después: Mi Perfil pasó de 14 de 15 campos sin nombre a 0, Correo de 7 a 0 y los buscadores a 0.
> - **B4-04 a 07:** filas del padrón y tarjetas móviles abribles con Enter/Espacio, encabezados ordenables como botones con `aria-sort`, selector de vendedor del POS como combobox accesible (flechas, Enter, Escape), zona de carga de archivos como `<label>` accesible por teclado y con arrastrar-y-soltar real, y preguntas del editor de plantillas seleccionables por teclado.
> - **B4-09:** `SegmentedTabs` con flechas, Inicio/Fin y tabindex itinerante, y la pestaña activa siempre visible en móvil (resuelve parte de B5-04).
> - **B4-10 (y B3-10):** `aria-pressed` en ~52 botones de selección (filtros, chips, métodos de pago, meses, KPIs), más el nombre completo de los meses y de los niveles/alcances del gestor de roles.
> - **B4-12 a 14:** los toasts de error usan `role="alert"` (assertive), duran 8 s, se pausan con hover/foco y no se cortan a 2 líneas; se renderizan por portal con z-index por encima de los modales. 21 banners de error en línea tienen `role="alert"`.
> - **B4-15:** hook `useMenuKeyboard` en los menús de tema, exportar y "Más acciones" (foco al abrir, flechas, Escape, retorno de foco).
> - **B4-16, 17 y 18:** buscador rápido como combobox/listbox con flechas y Enter, 4 barras de progreso con `role="progressbar"`, y asterisco de `Input` oculto a lectores de pantalla.
> - **Verificado en el navegador** (Jefe de Grupo): trampa de Tab y retorno de foco en "Crear rol", tabs, menú, buscador, fila con Enter, `aria-sort` y etiquetas del modal "Nueva cuenta".
> - **Pendiente:**
>   - B4-08 (`DynamicFormRenderer`): `fieldset/legend` en grupos de chips, `aria-required`, `aria-describedby` en errores y foco al primer campo con error.
>   - B4-09 (parte): `aria-controls` y `tabpanel` (los paneles viven en cada página); tabs caseros de `VisorFichaMiembro`, `ModalHistorialSeccion` y `VisualPdfEditorDrawer` sin `role="tab"`.
>   - B4-18 (parte): `aria-required` en campos obligatorios.
>   - No se probó con lector de pantalla real.

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B4-01 | ALTO (V) | `hooks/useModalOverlay.ts`, `components/ui/Drawer.tsx` | **No hay foco inicial, trampa de foco ni retorno de foco** en ningún overlay (verificado: al abrir el Expediente el foco queda en `body`, y al cerrar no vuelve a la fila). | Resolverlo una vez en `useModalOverlay`: guardar `activeElement`, enfocar el primer foco o el título, atrapar Tab y restaurar al cerrar. |
| B4-02 | ALTO (V en "Crear rol") | Modales "caseros" sin `role="dialog"`/`aria-modal`/`aria-labelledby`: `PdfViewerModal`, `PanelAdminRamas` (rama/sección), `PanelGestorRoles` (rol), `BotonInstalarPwa` (guía), `ModalCobrarDeuda` (no embebido), `ModalPlanCuotaMensual`, `ModalGenerarDeudaManual`, `ModalRegistrarGasto/Ingreso`, `ModalCrearRubro`, `ModalCobroCampamento`, `ModalCrearEventoEconomico`, `ModalCargarPedidoEvento`, `ModalTicketQR`. `ModalConfirmacion`, `BotonLlamarMiembro` y `ModalHistorialSeccion` tienen el rol pero sin label (o en el backdrop). | Migrar todos a `Drawer` (`mode="modal"\|"sheet"`). |
| B4-03 | ALTO | Labels sin `htmlFor`/`id` en casi todos los formularios: Mi Perfil (11 campos + 3 de contraseña), `ModalAltaMiembro`, `PestanaDatosMiembro`, `PestanaCuotasTesoreria`, `ModalEditarFamilia`, `ModalVincularHermano`, `ModalCobrarDeuda`, `ModalRegistrarGasto/Ingreso`, `ModalPlanCuotaMensual`, `ModalCrearRubro`, `ModalCobroCampamento`, `ModalCargarPedidoEvento`, `PanelAdminRamas`, `PanelGestorRoles`, `PanelConfiguracionCorreo`, `SelectorDestinatarios`, `VisualPdfEditorDrawer`. Buscadores y selects con solo placeholder. | Usar los primitivos `Input`/`Select` de `ui/` con la prop `label` (ya resuelven `id` y error). |
| B4-04 | ALTO (V) | `MiembrosPage.tsx:2156-2162` · `MiembroCard.tsx:74-81` | La fila `<tr onClick>` y la card `div onClick` son la **única forma de abrir el expediente** y no se pueden usar con teclado. | Nombre como `<button>` o `<Link>`. |
| B4-05 | ALTO | `MiembrosPage.tsx:2103-2138` | `<th onClick>` para ordenar: sin foco ni `aria-sort`. | `<button>` dentro del th + `aria-sort`. |
| B4-06 | ALTO | `EventoWorkspacePage.tsx:1014-1063` | Selector de vendedor solo con `onMouseDown`: **imposible elegir vendedor con teclado**. | Patrón combobox. |
| B4-07 | ALTO | `VisualPdfEditorDrawer.tsx:1760-1767` · `ModalImportarMiembros.tsx:751-761` | Preguntas del editor como `div onClick`; zona de carga de archivo como `div` con el input oculto. | `<button>` / `<label htmlFor>`. |
| B4-08 | ALTO | `DynamicFormRenderer.tsx:586, 637, 994-1019` | Grupos de chips sin `fieldset/legend`; los obligatorios sin `aria-required`; errores sin `aria-describedby`; el foco no va al primer error (`shouldFocusError: false`). | Corregir en el renderer: impacta a todas las familias. |
| B4-09 | MEDIO | `ui/SegmentedTabs.tsx:36-48` y tabs caseros (`VisorFichaMiembro`, `ModalHistorialSeccion`, `VisualPdfEditorDrawer`, `DynamicFormRenderer` Madre/Padre/Tutor) | Sin `aria-controls`/`tabpanel`, sin tabindex itinerante ni flechas; algunos sin `role="tab"`. | Completar el patrón en `SegmentedTabs` y reutilizarlo. |
| B4-10 | MEDIO | Toggles y segmentados sin `aria-pressed`/`radiogroup` | Protagonista/Educador, niveles de permiso en el gestor de roles (el lector oye "Edición" diez veces), métodos de pago, meses, filtros, chips, modo del QR, selección de rama/rol en Pase, tipo de rubro, tema y escala. | `aria-pressed` o `role="radiogroup"` + `aria-checked`, con `aria-label` de grupo. |
| B4-11 | MEDIO | Botones solo-ícono sin `aria-label` (solo `title` o nada) | X de cierre en casi todos los modales caseros, zoom del PDF, lápiz/papelera de tablas (Caja, Gastos, Cuotas), limpiar búsqueda, eliminar sección, botón Llamar (nombre accesible "3", V), "Esc" del buscador. | `aria-label` descriptivo. |
| B4-12 | MEDIO | `ui/ToastGlobal.tsx:58-69` + `store/toastStore.ts:178` | Los errores se anuncian `polite`; se autocierran a los 4s sin pausa (WCAG 2.2.1); `line-clamp-2` corta los mensajes. | `role="alert"` para errores, pausa con hover/focus y que los errores no se autocierren. |
| B4-13 | MEDIO | `App.tsx:330` vs portales de `Drawer` | ToastGlobal (z-50) queda **debajo del backdrop** de los drawers: los toasts disparados desde un modal no se ven. | Portal con z mayor. |
| B4-14 | MEDIO | Errores sin `role="alert"`: `ModalAltaMiembro`, `ModalCobrarDeuda`, resultados del QR, prueba SMTP. | Agregar. |
| B4-15 | MEDIO | Menús `role="menu"` sin teclado: `ThemeToggle`, `BotonExportar`, "Más acciones" de Miembros. | Foco al primer ítem, ↑/↓, Escape y retorno de foco. |
| B4-16 | MEDIO | `CommandPaletteModal.tsx:286-346` | Sin ↑/↓/Enter ni roles combobox/listbox; el input sin `aria-label`. | Índice activo + `aria-activedescendant`; Enter abre el primer resultado. |
| B4-17 | BAJO | Barras de progreso sin `role="progressbar"`: Inicio (sync), wizard del legajo, importación. | Agregar `aria-valuenow`. |
| B4-18 | BAJO | `ui/Input.tsx:43`: el `*` se lee como "asterisco"; `aria-label` sobre `<span>` sin rol en `DynamicFormRenderer.tsx:1100-1113`. | `aria-hidden` en el asterisco + `aria-required`; `sr-only` en el span. |

---

## B5 — Mobile / responsive

| ID | Sev. | Dónde | Problema | Fix |
|---|---|---|---|---|
| B5-01 | ALTO (V) | `App.tsx:178-186` | El `Suspense` está **fuera** del AppShell: al navegar a una ruta lazy por primera vez desaparece todo el shell (sidebar y barra inferior) y aparece "Cargando…" a pantalla completa. | Mover el `Suspense` dentro de `AppShell`, alrededor de `{children}`. |
| B5-02 | ALTO | `MiembrosPage.tsx:2099` | La tabla aparece desde 768px, pero con la sidebar de 256px quedan ~460px para 5 columnas dentro de un `overflow-hidden`: **las acciones se recortan entre 768 y 1024px**. | Tabla desde `lg:` o `overflow-x-auto`. |
| B5-03 | ALTO | `CommandPaletteModal.tsx:244` | En mobile el buscador es una hoja inferior: en iOS **el teclado tapa el input** (V: el input queda abajo). | Anclarlo arriba también en mobile. |
| B5-04 | MEDIO (V) | `MiEspacioPage` y `TesoreriaPage` (tablist) | La pestaña activa queda fuera de la vista: en "Mi Perfil" la franja de pestañas muestra solo "Mi Legajo / Mis Cuotas", con la activa a x=605px en un viewport de 375. En Tesorería, con "Cuadro de Resultados" activa, se ve "Cobranzas y Familias / Planes y C…". | `scrollIntoView({ inline: 'nearest' })` al activar, más un fade o flecha en el borde. Lo mismo en Tesorería (B5-05). |
| B5-05 | MEDIO (V) | `TesoreriaPage.tsx:660` · `PanelTesoreriaCajaBanco.tsx:815` · chips de Miembros | Franjas horizontales con `no-scrollbar` sin indicio de que hay más ("Cuadro de Resultados", "Todo el Histórico" y "Alerta Médica" quedan ocultos). | Fade/gradiente en el borde o wrap. |
| B5-06 | MEDIO (V) | `KpiCard` en grid de 2 columnas | Labels truncados: "GRUPOS FAMIL…", "COBROS MENS…", "RECAUDADO (P…", "Sin ficha / Borr…". | `line-clamp-2` y labels más cortos en mobile. |
| B5-07 | MEDIO (V) | Mi Espacio → Mi Perfil | El badge "Protagonista · Comunidad Caminante Aconcagua" desborda (right=385px) y se corta. | `flex-wrap` / `min-w-0` + wrap. |
| B5-08 | MEDIO (V) | `InicioPage` hero | "Hola, Antonio Garcia…" truncado: el `h1` debería envolver. | Quitar `truncate` del h1. |
| B5-09 | MEDIO | `PanelPasesPorCamada.tsx:341-342` | `min-w-[540px]` provoca scroll horizontal en 375px. | Quitarlo. |
| B5-10 | MEDIO | `VisualPdfEditorDrawer.tsx:1961-2031, 750` | En mobile la vista previa queda debajo de todo y el canvas mide 520px fijos. | Alternar Editar/Vista previa y escalar según el ancho. |
| B5-11 | MEDIO | `ModalCobrarDeuda.tsx:724-748` y modales largos | El botón Confirmar queda al final del scroll (además con scroll anidado). | Footer fijo con `safe-area-inset-bottom`. |
| B5-12 | MEDIO | `BannerOffline.tsx:20, 38` | El banner (sticky, z-50) tapa 36px del header sticky al scrollear. | Integrarlo en el AppShell antes del header. |
| B5-13 | MEDIO | Áreas táctiles | `Button size="sm"` 38px; X de Drawer 38px; X de modales caseros 24-28px; toggle de contraseña en Mi Perfil **16×16** (V; WCAG 2.5.8 pide ≥24); íconos de tablas 26-34px; zoom del PDF ~20px; quitar opción en el editor 12px. | Mínimo 24px siempre y 44px en mobile; usar `s-touch`. |
| B5-14 | MEDIO | `ModalCrearRubro.tsx:340-371` | Selects con texto de 12px: iOS hace zoom al enfocar. | 16px en inputs mobile. |
| B5-15 | BAJO | `ui/Drawer.tsx:203` · `ToastGlobal.tsx:57` | Sin `env(safe-area-inset-bottom)` en el footer del sheet ni en el toast. | Agregar. |
| B5-16 | BAJO (V) | Placeholders truncados en 375px ("Buscar por nombr…", "Buscar familia, hermano o miem…") | Placeholders más cortos ("Buscar…"). |
| B5-17 | BAJO | `PdfViewerModal.tsx:365-374` | Renderiza todas las hojas con dpr de hasta 2.5: riesgo de memoria en celulares de gama baja. | Renderizar por visibilidad. |

---

## B6 — Confirmaciones de acciones destructivas o masivas

Hoy hay **tres patrones distintos** (`ModalConfirmacion`, `ConfirmImpactDialog` e inline), con textos que se contradicen sobre si la acción se puede deshacer, y muchas acciones irreversibles se ejecutan en un solo toque. Propuesta: usar siempre `ConfirmImpactDialog`, que muestre el impacto (cantidad de personas, montos) y ofrezca deshacer cuando exista.

| ID | Sev. | Acción sin confirmación | Dónde |
|---|---|---|---|
| B6-01 | ALTO | "Pasar camada N" (pase en lote) | `MiembrosPage.tsx:1986-1993` |
| B6-02 | ALTO | "Disolver grupo familiar" (recalcula cuotas) | `ModalEditarFamilia.tsx:297-306` |
| B6-03 | ALTO | Descartar borrador offline del legajo | `MiEspacioPage.tsx:606-618` · `CompletarLegajoPage.tsx:365-377` |
| B6-04 | MEDIO | Desmarcar un mes de plan sin pagos (anula cuotas de todo el grupo) | `TesoreriaPage.tsx:441` |
| B6-05 | MEDIO | Validar físico de legajo | `LegajosPage.tsx:671-683` |
| B6-06 | MEDIO | Pausar plantilla (la oculta a las familias) | `LegajosPage.tsx:1862-1871` |
| B6-07 | MEDIO | Pase individual / "Confirmar pase o cambio de rol" | `PanelPasesPorCamada.tsx:422-434` · `PestanaPaseRol.tsx:484-496` |
| B6-08 | MEDIO | Rechazar solicitud de pase | `PanelSolicitudesPase.tsx:151-176` |
| B6-09 | MEDIO | Desactivar rama o sección con miembros activos | `PanelAdminRamas.tsx:502-511, 624-633` |
| B6-10 | MEDIO | Eliminar sección o pregunta en el editor de plantillas | `VisualPdfEditorDrawer.tsx:952-971, 1015-1026` |
| B6-11 | MEDIO | Desvincular hermano / "Quitar" del grupo familiar | `ModalEditarFamilia.tsx:277-286` · `PestanaDatosMiembro.tsx:408-416` |
| B6-12 | MEDIO | Dar de baja vía checkbox guardado junto con otros cambios | `PestanaDatosMiembro.tsx:431-441` |
| B6-13 | MEDIO | Editar el monto de un cobro ya cobrado (reprecia cargos) | `ModalCobroCampamento.tsx:162-164` |
| B6-14 | MEDIO | Cerrar el editor PDF o el wizard con cambios | ver B2-21 |
| B6-15 | MEDIO | Cerrar el Drawer durante un cobro o una importación (`bloqueado` no se propaga; se pierden las claves temporales del resumen) | `TesoreriaPage.tsx:1331-1345` · `MiembrosPage.tsx:2348-2377` |
| B6-16 | BAJO | `window.confirm` nativo para cambios sin guardar | `MiEspacioPage.tsx:146` · `CompletarLegajoPage.tsx:215` |

---

## B7 — Consistencia

| ID | Tema | Detalle | Fix |
|---|---|---|---|
| B7-01 | Idioma: registro mezclado | La app usa voseo, pero hay tuteo ("No tienes permisos", "Crea", "Ingresa", "Selecciona", "Haz clic", "Puedes", "Detalla", "¿Confirmas que deseas…?") y ustedeo ("Configure", "Indique", "Escriba", "usted no posee"). **La fuente principal es `lib/formatters.ts:348-405` (`traducirErrorAmigable`)**, que se ve en toda la app (V en Pases). Otros: `PanelGestorRoles`, `ModalImportarMiembros`, `ExpedienteMiembro360`, `ModalCrearCuentaFinanciera`, `PanelTesoreriaCajaBanco`, `ModalGestionRubros`, `ModalTraspasoCuentas`, `ModalCargarPedidoEvento`, `SelectorDestinatarios`, `PestanaSeguridad`, `PestanaLegajosFichas`. | Pasada de redacción con una guía breve (voseo, mayúscula solo inicial, "contraseña" en vez de "clave"). |
| B7-02 | Errores técnicos expuestos | `traducirErrorAmigable` devuelve `err.message` crudo (errores de pdf-lib/pdfjs/atob llegan a toasts); convierte **cualquier 401** en "DNI o contraseña incorrectos" y cualquier texto con "alcance" en un genérico de permisos. `Login.tsx:86`, `ModalAltaMiembro.tsx:249`, `ModalPlanCuotaMensual.tsx:230`, `ModalImportarMiembros.tsx:548` muestran `response.data.message` tal cual (inglés o "Datos inválidos"). | Que los errores que no vienen de axios devuelvan el mensaje por defecto; 401 fuera del login → "Tu sesión venció". |
| B7-03 | Primitivos ignorados | Muchos `<button>`, `<input>` y `<select>` crudos (`bg-brand hover:opacity-90 text-brand-contrast` en lugar de `s-btn-brand`/`Button`). Mezcla de `bg-paper`/`bg-surface` en modales. Explica buena parte de los problemas de foco, tamaño y dark mode. | Migrar a `ui/Button`, `ui/Input` y `ui/Select` por módulo. |
| B7-04 | Formato de moneda | `formatearMoneda` con decimales variables (desalinea columnas), `` `$${x.toFixed(2)}` `` ("$1500.00") en `ModalGenerarDeudaManual`, y `toLocaleString` manual. | Un solo `formatearMoneda` con decimales fijos y `s-tabular`. |
| B7-05 | Validación de DNI | Tres reglas distintas: ninguna (alta), 6-10 (importar), 7-9 (`formValidation`). Fecha de nacimiento sin `max` (acepta fechas futuras). | Centralizar en `validarFormatoCampo`. |
| B7-06 | Lógica duplicada que ya diverge | `formatearFecha` (3 copias), `esVerdadero` (2; la de `VisorFichaMiembro` no acepta "si"/"1" y puede invertir "se retira solo"), `combinarRespuestas` (2), color de rama (2), bloque Grupo Familiar (2 + modal, con textos distintos), toggle de contraseña (3 versiones: Login, CambiarClave, Mi Perfil), cambio de clave con reglas distintas (CambiarClave valida ≠ DNI y Mi Perfil no). | Extraer componentes y helpers compartidos. |
| B7-07 | Terminología | "Clave" vs "Contraseña"; Title Case ("Cambio Obligatorio de Clave", "Nueva Cuenta Financiera") vs mayúscula inicial; estados en mayúsculas crudas ("PENDIENTE (RETIRADO)"); "Ocultar todos" cuando en realidad quita permisos. | Guía de microcopy. |
| B7-08 | Confirmaciones | Ver B6 (tres patrones y textos contradictorios). | — |
| B7-09 | Duplicación de accesos (V) | "Escanear QR" aparece en el header, en el hero de Inicio y en el header de Miembros. "Instalar App" aparece en el header, en una card de Mi Perfil ("Descargar en Celular") y en el sheet "Más". El header de Miembros tiene un botón "Eventos" fuera de contexto. "Mi Espacio" aparece 3 veces en el Inicio del Protagonista. | Un único acceso por acción y por contexto. "Instalar" en vez de "Descargar" (es una PWA). |
| B7-10 | Títulos | Título de ruta "Miembro " con espacio sobrante (`App.tsx:231`); "Expediente / Miembro #4" expone el id interno (V); `alt` del logo duplica el h1 en Login. | Usar el nombre del miembro. |
| B7-11 | Unidad activa ignorada | Caja, Gastos, Cuadro de Resultados y Eventos no filtran por el selector de unidad del header (Cobranzas y Planes sí). | Filtrar o indicar "Mostrando todo tu alcance". |
| B7-12 | Toasts duplicados | El feedback inline más un toast en cada acción del expediente ("Cambios guardados.", "Expediente actualizado."), incluso cuando el pase quedó pendiente; el Traspaso anuncia el error dos veces. | Uno solo. |
| B7-13 | Código muerto | `components/ModalConcepto.tsx` no se importa; el banner `requiereCambioClave` de `AppShell.tsx:276-284` nunca se ve (la ruta redirige antes); `ToastGlobal` con estado `ejecutando` inalcanzable; `rolesRama`/`rolesSinRama` idénticos en el Expediente. | Limpiar (con OK). |
| B7-14 | Fetch duplicado | `/pases/solicitudes` y `/pases/candidatos` ×4 al entrar a Pases (V); Inicio vuelve a bajar el padrón paginado completo; Tesorería dispara hasta 10 GET de libro diario en cada "Actualizar"; el expediente baja todos los candidatos para buscar uno. | react-query + endpoints puntuales. |
| B7-15 | Datos sensibles en `localStorage` | Mientras hay sesión, el caché offline guarda en `localStorage` el padrón con DNI, precargas de legajo con salud y estados de cuenta (V). Se purga bien al cerrar sesión (V), pero en un dispositivo compartido sin logout queda expuesto. | Mover a IndexedDB con TTL, limitar a lo necesario para Modo Campamento y avisar en "Preparar para campamento". |
| B7-16 | `authStore` sin try/catch | `localStorage` bloqueado (Safari privado) → pantalla blanca fuera del ErrorBoundary (`store/authStore.ts:138-158`). | Envolver los accesos, como ya hace `themeStore`. |

---

## B8 — Mejoras UX y pulido, por pantalla

Lista por cada pestaña, modal o ventana. Los ítems ya cubiertos en B0–B7 se referencian por ID.

### Shell (AppShell, sidebar, header, barra inferior, sheet "Más")
- Ver B1-18, B1-19, B5-01, B5-12, B7-09.
- [BAJO (V)] En escritorio el header no muestra el título de la página; en mobile, si hay selector de unidad (GLOBAL o multiunidad), el título se oculta y solo se ve "Todo el grupo". Mostrar un breadcrumb o título corto.
- [BAJO] `button:active { transform }` global en `base.css` choca con `s-btn-*:active { scale }`.
- [BAJO] El sheet "Más" repite la promo de instalación (B7-09).
- [MEDIO] Hay un solo `ErrorBoundary` global: un error en una vista tira toda la app y "Reintentar" con un chunk fallido vuelve a fallar. Poner un boundary por ruta dentro del AppShell y recargar ante `ChunkLoadError`.

### Login / Recuperar clave
- [MEDIO] Un 429 muestra dos alertas a la vez (`Login.tsx:72-77, 236-254`).
- [MEDIO] Al alternar login/recuperar, el foco cae en `body` (`:223/283`).
- [MEDIO (V)] "¿Olvidaste tu contraseña?" en ámbar (B3-01) con un área de toque de ~20px.
- [BAJO] En el toggle de tema segmentado, en mobile solo queda el ícono, sin `aria-label`, con ~26px.

### Cambiar clave (obligatorio)
- [ALTO] **No hay forma de cerrar sesión** en modo obligatorio: un dispositivo compartido queda atado a esa cuenta (`CambiarClave.tsx:308-317`).
- [ALTO] El checklist en emerald-600 da 3.2:1 (B3-03).
- [MEDIO] Al terminar, se ve un salto de layout durante 900ms (`:99, 300`).
- [BAJO] `.trim()` en contraseñas; `navigate(-1)` saca de la app si se entró directo.

### Inicio
- Ver B0-08, B1-24, B1-25, B2-04, B2-27, B5-08.
- [MEDIO] Los KPIs muestran "0" antes de cargar: usar skeleton.
- [MEDIO] El conteo de alertas médicas difiere del de `/miembros?filtro=ALERTA_MEDICA` (`:313-321`).
- [MEDIO] `|| plantillas[0]` calcula el estado del legajo con una plantilla ajena (`:175`).
- [MEDIO (V)] "Resumen actual (2 activos)" no explica qué cuenta. El link "Cobrar →" aparece con deuda $0. "Sin validación física 20…" se trunca.
- [BAJO] En la sub-vista de teléfonos, Esc cierra todo el drawer en vez de volver al listado. "Sincronizar ahora" con 0 borradores no da feedback.

### Mi Espacio
- **Mi Legajo:** B0-12, B2-14, B2-15, B2-21, B6-03. [MEDIO] Si no aplica ninguna plantilla se ofrecen todas (`:320`). [MEDIO] La descarga reutiliza `guardandoLegajo` y bloquea el submit. [MEDIO] El drawer del PDF repite título y tiene doble scroll.
- **Mis Cuotas:** B2-01, B2-31, B2-37. [BAJO] Un método de pago desconocido aparece como "Efectivo".
- **Mis Pedidos y Vales:** B1-21, B1-22. [MEDIO] "Editar pedido" ~32px; "Hacé clic" → "Tocá"; guardar recarga todo Mi Espacio solo para refrescar el saldo.
- **Mi Perfil:** B2-02, B2-20, B4-03, B5-07, B5-13. [MEDIO (V)] Para adultos (educadores) se piden "Madre/Padre/Tutor": mostrar esos campos solo para menores. [MEDIO] El toggle de contraseña siempre muestra el mismo ícono y no tiene `aria-pressed`. [BAJO] Faltan `autoComplete` e `inputMode="tel"`; sin fecha de nacimiento se lee "— años".

### Miembros (listado)
- Ver B1-04, B1-07, B1-13, B1-15, B1-27, B4-04, B4-05, B5-02, B6-01.
- [MEDIO] El chip "Pases por camada (N)" no coincide con la lista filtrada; el chip "Con deuda" desaparece activo cuando llega a 0.
- [MEDIO] Cada guardado del expediente recarga el padrón completo + 6 catálogos y muestra un toast.
- [BAJO] El botón "Quitar filtro" mide ~18px; el padrón vacío no ofrece "Nuevo miembro"; el nombre del grupo está hardcodeado en la exportación.
- [BAJO (V)] El botón de llamar muestra solo un número ("3"): el ícono más el número no explican qué es.

### Expediente 360 (Drawer y página)
- **Encabezado:** B1-08, B2-24, B7-10.
- **Datos:** B4-03, B6-11, B6-12, B7-05. [MEDIO] Alergias y dieta se editan con `padron.editar` por fuera de `legajos.editar`.
- **Cuotas:** B2-07, B3-03, B4-11. [MEDIO] El bloque Grupo Familiar está duplicado y diverge con el de Datos.
- **Ficha (Visor):** [MEDIO (V)] Muestra "Sin restricciones alimentarias declaradas" junto a una alergia alimentaria (maní): unificar el resumen. [MEDIO] `esVerdadero` local (B7-06). [BAJO] "Tocá 'Rellenar ficha'" aparece aunque el botón esté oculto por permisos.
- **Pase / Rol:** B6-07, B4-10.
- **Clave:** [MEDIO] La clave temporal también se repite en la alerta superior (`role="status"`), que persiste y la lee el lector de pantalla.
- **Trayectoria:** [BAJO] `animate-pulse` sin `motion-reduce`.

### Modales de Miembros
- **Alta:** B4-03, B7-02, B7-05. [MEDIO] El error aparece arriba, fuera de vista en mobile.
- **Importar:** B4-07, B6-15. [MEDIO] Dice "arrastrá" pero no hay drag & drop. [MEDIO] La coincidencia de columnas por `includes` puede cargar "DNI Madre" como DNI. [MEDIO] Toast "Padrón actualizado" aunque no se creó nada. [BAJO] Un DNI fuera del alcance se marca "Nuevo" y luego falla.
- **Editar familia:** B6-02, B6-11. [MEDIO] Desvincular cierra la subvista y muestra "Descuento familiar actualizado.".
- **Vincular hermano / Historial de sección / Llamar:** B4-02, B4-10, B4-11. [MEDIO] El historial muestra "— Actualidad" junto al badge "Finalizada"; el acordeón no tiene `aria-expanded`.

### Legajos
- **Cumplimiento:** B1-02, B1-11, B1-12, B6-05. [MEDIO] La KPI "Sin ficha / Borrador" filtra solo SIN_FICHA. [MEDIO] "Ver PDF" no muestra carga y permite doble toque.
- **Salud y Alimentación:** [MEDIO] Tres filtros de dieta superpuestos, sin "Limpiar filtros". [BAJO] El badge de la pestaña cuenta doble.
- **Colaboradores:** [BAJO] Accesos sin `?.`.
- **Plantillas / editor visual:** B5-10, B6-06, B6-10, B4-07. [MEDIO] El editor se importa estático y arrastra pdfjs para todos (anula el `lazy`). [MEDIO] El preview genera un toast de error cada 350ms mientras se escribe. [MEDIO] En modo PDF externo sin archivo se sigue viendo el PDF anterior.
- **Completar legajo:** B1-14, B2-08, B2-14 a B2-16, B6-03.
- **Wizard (DynamicFormRenderer):** B0-11, B4-08. [MEDIO] El texto legal muestra claves técnicas `[autorizante_nombre]`. [MEDIO] Los chips de opción única no se pueden deseleccionar en campos opcionales. [BAJO] A la familia se le muestra "Agregale secciones desde Legajos → Plantillas".
- **Visor PDF:** B4-02, B4-11. [MEDIO] `URL.revokeObjectURL` inmediato: en iOS o Firefox la descarga puede no arrancar.

### Pases
- B0-01, B1-03, B2-05, B5-09, B6-07, B6-08, B7-14.
- [MEDIO] La confirmación cuenta también a quienes tienen una solicitud pendiente. [BAJO] Quien solo tiene `pases.ver` no ve el badge "Pendiente".
- [BAJO (V)] En el select de destino, cada opción repite el prefijo "Sección destino:"; ponerlo como label del select y dejar solo el nombre en las opciones.

### Eventos
- **Catálogo:** B1-05, B1-23, B2-10. [MEDIO] Los KPIs suman borradores y cancelados. [BAJO] La tarjeta es un `<button>` con un `<h2>` adentro.
- **Mesa operativa (POS / Pedidos / Liquidación):** B0-05, B0-14, B1-06, B2-33, B4-06. [MEDIO (V)] En mobile hay 5 botones de acción (Volver, Refrescar, Escáner, Configurar, **Eliminar**) antes del título del evento; "Eliminar" queda muy expuesto arriba de todo. Moverlo a un menú "⋯" y dejar visible solo lo operativo. [BAJO (V)] El título "Pre-flight de Liquidación" es un anglicismo: usar "Revisión previa". [MEDIO] Solo abre el primer vale QR. [MEDIO] Tras eliminar el evento queda una pantalla de error en lugar de volver a /eventos. [BAJO] Botones de vale de ~28px; el KPI "Pendientes de cobro" es clickeable sin acción para UNIDAD.
- **Crear/editar evento:** B0-03, B2-34. [MEDIO] El campo Ganancia se autocompleta y es difícil de editar. [BAJO] `step="1"` impide centavos; por defecto publica sin pasar por borrador.
- **Cargar pedido:** B0-06, B0-10. [MEDIO] No limita la cantidad al stock.
- **Ticket QR:** [MEDIO] `clipboard` sin try/catch (falla en http LAN); un vale CANCELADO se ve válido. [BAJO] Canvas 1x (se ve borroso); emojis 📍📅 en el vale.

### Tesorería
- **Cobranzas y Familias:** B0-02, B1-16, B1-29, B2-06, B6-15. [MEDIO] El título y el miembro aparecen duplicados en el Drawer de cobro.
- **Planes y Conceptos:** B0-07, B6-04, B2-31. [MEDIO] Los botones de mes no tienen `aria-pressed` ni nombre completo ("Ene" → "Enero habilitado").
- **Caja, Bancos y Gastos:** B0-09, B2-36, B3-04. [MEDIO] No valida "desde > hasta". [MEDIO] Las cuentas archivadas quedan inaccesibles. [MEDIO] Deshacer un ingreso pierde el comprobante. [MEDIO] "Total gastos (período)" no filtra por período.
- **Cuadro de Resultados:** B3-03, B3-07, B3-09. [BAJO] Un resultado de 0 se muestra como "Superávit" (debería decir "Equilibrio"); exportar falla en silencio si no hay conexión.
- **Modales:** Cobrar deuda (B2-29, B2-32), Plan mensual (B2-35), Deuda manual (B7-04), Gasto/Ingreso (B0-09; [MEDIO] `split(' - ')` trunca descripciones), Traspaso ([MEDIO] con una sola cuenta el botón queda deshabilitado sin explicación), Cuenta/Rubro (B2-26; [MEDIO] "Eliminar" habilitado con saldo; deshacer un borrado no reinserta el rubro), Gestión de rubros (B2-11), Cobro campamento (B6-13).

### Organización
- **Ramas/Secciones:** B4-02, B4-03, B6-09. [MEDIO] Si falla la creación automática de la sección, el toast igual dice "creada". [BAJO] Vaciar un input numérico lo pone en 0.
- **Roles:** B2-23, B4-02 (V), B4-10. [MEDIO] El motivo de "Editar/Eliminar deshabilitado" solo está en `title` (no se ve en táctil). [MEDIO (V)] En el modal de rol, la descripción de cada panel ("Menú Miembros + Pestañas…") está en ámbar de 12px (1.75–2.15:1, B3-01).
- **Correo (SMTP):** B2-03. [MEDIO] "Probar envío" usa la configuración guardada aunque haya cambios sin guardar; no valida host ni puerto. [BAJO] Precarga `window.location.origin` y queda persistido.
- **Selector de destinatarios:** B2-25, B4-10, B4-11. [BAJO] La búsqueda de excepciones no se limita a la unidad elegida.
- [BAJO] Cambiar de pestaña suma una entrada al historial (usar `replace`).

### Escáner QR universal
- B0-04, B2-18, B2-19. [MEDIO] Un único mensaje para todo error de cámara: distinguir permiso denegado, sin cámara y contexto http. [MEDIO] Los resultados no tienen `aria-live`. [BAJO] Un `setTimeout` de 1200ms no se limpia al cerrar.

### Tema, PWA, offline
- [MEDIO] `BotonInstalarPwa`: en escritorio sin `beforeinstallprompt` igual muestra "Descargar en Celular" y la guía de Android; iPadOS no se detecta como iOS.
- [MEDIO] `BannerOffline`: sin timestamp de caché muestra la hora actual como "últimos datos guardados".
- [BAJO] La preparación para campamento no incluye tesorería ni eventos (cuentas, vales): en campamento esas pantallas quedan vacías.
- [BAJO] La vista previa del ThemeCustomizer tiene botones enfocables que no hacen nada.

---

## Patrones transversales (la raíz de la mayoría de los hallazgos)

1. **Permisos con tres fuentes distintas y evaluación sin alcance o sin unidad de la fila** (B1). Un helper único sobre `capabilities.ts` elimina gran parte del bloque.
2. **Errores tragados que se muestran como datos reales** (B2.a). Separar carga/error/vacío; adoptar `react-query`.
3. **Overlays sin gestión de foco y modales caseros** (B4-01, B4-02). Arreglar `useModalOverlay` y migrar a `Drawer`.
4. **Formularios fuera de los primitivos** (B4-03, B7-03). Los primitivos `Input`/`Select`/`Button` ya resuelven labels, foco y tamaños.
5. **El ámbar de marca usado como color de texto y de foco** (B3-01, B3-02). Hay dos cambios de token que resuelven cientos de casos.
6. **Colores de estado hardcodeados** en vez de tokens `--s-*-ink` (B3-03, B3-04).
7. **Acciones irreversibles sin confirmación y tres patrones de diálogo** (B6).
8. **Registro de idioma mezclado, con origen en `traducirErrorAmigable`** (B7-01, B7-02).
9. **Ruta con dos fuentes de verdad (URL + estado) y deep links no validados** contra los ids reales (B0-08, B1-01, MiEspacio tabs).
10. **Integridad del PDF oficial**: hash o QR oficial sobre datos no guardados (B2-14).

---

## Pendientes y limitaciones de esta auditoría

- El Jefe de Grupo (GLOBAL) se verificó en pantalla: Inicio, Miembros con el selector de unidad, Legajos con Plantillas, Pases, Eventos (POS, Pedidos, Liquidación), Tesorería (las 4 pestañas) y Organización (las 3 pestañas y el modal de rol), en escritorio, móvil y oscuro. Los roles GLOBAL **parciales** (Tesorero, Secretaría/Legajos, Organizador de Eventos) no tienen usuarios en la base local y se revisaron solo por código.
- No se probó en dispositivos reales (iOS/Android): teclado virtual, cámara del QR, instalación de la PWA y descargas de PDF.
- No se probó con lector de pantalla real (NVDA/VoiceOver). Los hallazgos de B4 salen del código y del DOM.
- Varias severidades del bloque B1 dependen de que el backend no bloquee la acción. En algunos casos el backend sí la bloquea (B1-05, B1-06): ahí el problema es de UX (botones que siempre fallan), no de seguridad.


> **B4 (cierre):** DynamicFormRenderer: asteriscos `aria-hidden`, `aria-required` en inputs/textarea, grupos de chips con `aria-invalid`/`aria-describedby` al error, y foco automático al primer campo inválido. Los selectores de sección (Visor de ficha, historial) quedan como grupos de botones con `aria-pressed` (semántica válida; no son tabs con paneles).

> **B5 — estado (corregido):** B5-01 (Suspense dentro de `AppShell`: el shell ya no desaparece al cargar rutas lazy), B5-02 (tabla de Miembros desde `lg:`, tarjetas en 2 columnas desde `sm:`), B5-03 (buscador Ctrl+K anclado arriba en móvil), B5-04/05 (fade en el borde de las franjas con scroll horizontal, `.s-fade-edge`/`.s-scroll-strip`; `SegmentedTabs` ya centraba la pestaña activa), B5-06 (KpiCard con `line-clamp-2`), B5-07 (badge de rol/unidad envuelve), B5-08 (h1 de Inicio sin `truncate`), B5-09 (sin `min-w-[540px]`), B5-12 (banner offline ya no es sticky y no tapa el header), B5-13 parcial (toggles de contraseña con área táctil ≥ 36px), B5-14 (selects de Crear Rubro a 16px en móvil), B5-15 parcial (footer del Drawer con `safe-area-inset-bottom`).
> **Pendiente de B5:** B5-10 (editor PDF: alternar Editar/Vista previa y canvas escalable), B5-11 (footer fijo en modales largos), B5-13 resto de áreas táctiles, B5-15 toast, B5-16 placeholders cortos.

> **B6 — estado (corregido):** nuevo hook `hooks/useConfirmar.tsx` (envuelve `ConfirmImpactDialog`: `pedir(opciones, accion)` + `dialogo`). Ahora confirman, mostrando el impacto: B6-01 pase de camada, B6-02 disolver grupo familiar, B6-11 desvincular hermano, B6-03 descartar borrador offline (Mi Espacio y Completar Legajo), B6-04 desmarcar mes de plan (también sin pagos), B6-05 validar físico, B6-06 pausar plantilla, B6-07 pase individual, B6-08 rechazar/cancelar solicitud de pase, B6-09 desactivar rama/sección (avisa miembros activos), B6-10 eliminar sección/pregunta del editor, B6-12 baja por checkbox, B6-13 guardar edición de cobro puntual. B6-15: los Drawers de cobro e importación quedan `bloqueado` mientras la operación está en curso (`onOcupadoChange`).
> **Pendiente de B6:** B6-14 (cierre del editor PDF/wizard con cambios, ver B2-21) y B6-16 (`window.confirm` nativo en Mi Espacio y Completar Legajo; migrar al diálogo estándar).

> **B7 — estado (parcial):** B7-01 voseo en `traducirErrorAmigable` y en los textos tuteados/ustedeados detectados (importar, traspaso, rubros, roles, plan de cuotas, destinatarios, cuenta financiera, pedidos). B7-02 `traducirErrorAmigable`: 401 fuera del login → "Tu sesión venció"; errores técnicos del navegador (TypeError, pdf-lib, atob…) devuelven el mensaje por defecto (+ test). B7-04 `ModalGenerarDeudaManual` usa `formatearMoneda` (se mantiene sin decimales para montos enteros). B7-05 DNI 7–9 dígitos en alta e importación, fecha de nacimiento no futura. B7-06 `esVerdadero` unificada (la de `VisorFichaMiembro` ya acepta "si"/"1"). B7-10 título "Miembro" sin espacio y sin "#id" en el Expediente. B7-16 `authStore` tolera `localStorage` bloqueado.
> **Pendiente de B7:** B7-03 (migrar a primitivos), B7-06 resto (formatearFecha, combinarRespuestas, toggle de contraseña, regla de cambio de clave), B7-07 (microcopy Title Case / "clave"), B7-09, B7-11, B7-12, B7-13 (código muerto; requiere OK), B7-14, B7-15; B7-02 en Login/ModalAlta/PlanCuota/Importar (muestran `response.data.message` crudo).

> **B8 — estado (parcial, primera tanda):** Cambiar clave obligatorio ahora tiene "Cerrar sesión"; `ErrorBoundary` por ruta dentro del `AppShell` (compacto, se reinicia al navegar, y ante error de carga de chunk ofrece solo "Recargar"); "Pre-flight de Liquidación" → "Revisión previa de la liquidación"; Cuadro de Resultados muestra "Equilibrio" con resultado 0; Ticket QR no falla si el portapapeles está bloqueado; Caja valida "Desde > Hasta"; `animate-pulse` de Trayectoria respeta `prefers-reduced-motion`.
> **B8 — pendiente:** el resto de los ítems por pantalla de esta sección (alrededor de 100 hallazgos de pulido) quedan abiertos y se pueden tomar por pantalla a pedido.

> **Paso 1 del plan (datos y permisos pendientes) — estado:**
> - **B2-06/08/09/11/12:** los errores de carga ya no se muestran como vacío. Tesorería y Organización avisan qué solicitud falló ("No se pudieron cargar: …") con Reintentar; Completar Legajo muestra error si fallan las plantillas; Gestión de Rubros y Familias voluntarias tienen error con Reintentar; los modales de Gasto e Ingreso avisan si no cargan categorías y cuentas.
> - **B1-25:** quien no ve el padrón (p. ej. solo Tesorería) ve el checklist personal y el acceso a Mi Espacio en Inicio. **B1-28:** los KPIs de Tesorería se muestran por permiso (Cobranzas / Planes).
> - **B1-29:** un tesorero sin `padron.ver` busca integrantes con `GET /miembros/hermanos/buscar` (ya existente, acotado a su alcance) y puede abrir el cobro desde el resultado; no hizo falta endpoint nuevo.
> - **B2-17:** si el mapeo declara un PDF base y no se puede cargar, se informa el error en lugar de generar una hoja en blanco que parezca oficial.
> - **B2-25:** Cuadro de Resultados y Libro diario descartan respuestas viejas (id de solicitud). Quedan sin protección SelectorDestinatarios y el buscador Ctrl+K.
> - **B2-36:** el KPI de gastos cuenta y suma solo no anulados y sigue a la búsqueda. La exportación de Caja no se revisó.
> - **No hecho:** B2-21 (el router actual, `BrowserRouter`, no admite `useBlocker`; requiere pasar a router de datos), B7-15 (el caché offline depende de `localStorage` en varias lecturas síncronas; moverlo a IndexedDB necesita su propia sesión y pruebas offline).

> **Paso 2 del plan (primitivos y duplicados) — estado:**
> - **B7-06:** toggle de contraseña unificado en `ui/BotonVerContrasena` (Login, Cambiar clave y Mi Perfil: ícono según estado, `aria-pressed`, área ≥ 44px); reglas de contraseña nueva unificadas en `validarNuevaContrasena` (`lib/formValidation.ts`, con test), así Mi Perfil ahora también exige que no sea igual al DNI; `formatearFecha` de Trayectoria reutiliza la compartida. El de `generadorValeQR` es un formato largo distinto a propósito y se deja. `esVerdadero` ya estaba unificada en B7.
> - **B7-14:** Pases deja de pedir `/pases/solicitudes` dos veces: `PasesPage` las pide una vez y se las pasa a `PanelPasesPorCamada`. La deduplicación de GET concurrentes del cliente ya existía. Verificado en el navegador: 1 petición de candidatos y 1 de solicitudes al entrar.
> - **No hecho:** B7-03 (migración masiva a `ui/Button`, `ui/Input`, `ui/Select`; son cientos de usos y conviene hacerla por módulo, junto con el pulido de B8), B7-13 (código muerto: sigue esperando tu OK), Inicio/Tesorería/Expediente siguen bajando datos repetidos y no pasaron a react-query.

> **B7-13 (hecho con tu OK):** se eliminó `ModalConcepto.tsx` (sin importaciones), el banner `requiereCambioClave` de `AppShell` (inalcanzable) y el filtro duplicado `rolesSinRama` del Expediente. El estado `ejecutando` de `ToastGlobal` sí se usa mientras corre "Deshacer", así que se mantiene.
> **Paso 3 (parcial):** B7-11 Caja, Cuadro de Resultados y Eventos indican "muestra todo tu alcance" cuando hay una sección elegida (el backend no filtra esas vistas por sección; filtrarlas es trabajo de backend). B7-02: Login, Alta de miembro, Plan de cuotas e Importar pasan por `traducirErrorAmigable` (el 429 del login usa texto fijo en español).
> **Pendiente del paso 3:** B7-12 (toasts duplicados del expediente), B6-14 (aviso al cerrar el editor PDF con cambios: la carga asíncrona del editor impide detectar "sin cambios" de forma fiable sin rehacer su estado), B6-16 (`window.confirm` nativo), B5-10/11/13/15/16.

> **Cierre del paso 3 (B5):** B5-11 el botón de confirmar del modal de cobro queda fijo al pie (verificado a 375px; en modo embebido el contenedor pasó a `overflow-clip` para que `sticky` funcione); B5-13 las X de cierre de los 15 modales y del Drawer miden ≥ 44px; B5-15 el toast respeta `safe-area-inset-bottom`; B5-16 placeholders de búsqueda cortos (el texto completo quedó como `aria-label`).
> **Sigue pendiente:** B5-10 (editor PDF en móvil), B5-13 (íconos de tablas y zoom del PDF), B6-14, B6-16, B7-12.

> **B8 — segunda tanda:** Login (un 429 ya no muestra dos alertas; "¿Olvidaste tu contraseña?" con área táctil de 44px); Inicio (el link "Cobrar →" solo aparece si hay deuda); Mi Espacio ("Tocá" en vez de "Hacé clic", método de pago desconocido ya no se muestra como "Efectivo"); Escáner QR (mensajes de cámara distintos para permiso denegado, sin cámara y contexto no seguro; el éxito se anuncia con `role="status"`); BannerOffline (sin marca de tiempo ya no inventa la hora actual); Traspaso (explica que hacen falta dos cuentas activas); Legajos ("Ver PDF" ya no admite doble toque y avisa "Generando PDF…").
> **B8 — pendiente:** el resto de los ítems por pantalla (Mi Perfil para adultos, Expediente, Eventos —acciones de la mesa operativa, Eliminar—, Tesorería —cuentas archivadas—, Organización, PWA, etc.).

> **B8 — tercera tanda:** Eventos (la mesa operativa mueve "Eliminar" a un menú "⋯" con navegación por teclado, así deja de estar expuesto junto a Refrescar y Escáner; el vale del ticket QR avisa si está CANCELADO o ya UTILIZADO); Mi Perfil (los datos de madre, padre y tutor solo se piden a menores de 18 o sin fecha de nacimiento); Expediente (la clave temporal ya no se repite en la alerta `role="status"`, solo en la sección Clave); Roles (el motivo por el que Editar/Eliminar están deshabilitados ahora se ve en pantalla y no solo en `title`; texto en voseo).
> **Bug corregido en esta tanda:** el alta de miembros rechazaba todo DNI (en B7 se perdió la barra del regex `\d`). Ahora la regla vive en `esDniValido` con test; además los errores de validación del servidor en inglés ("Too small: expected string…") se traducen.
> **B8 — pendiente:** Tesorería (cuentas archivadas, comprobante al deshacer ingreso, "Total gastos (período)"), Eventos (solo abre el primer vale QR, cantidad sin límite de stock), Inicio (KPIs en "0" antes de cargar), Correo SMTP, PWA y el resto del listado.

> **B8 — cuarta tanda:** Inicio (los KPIs de Legajos pendientes, Cuotas con deuda y Pases muestran "—" mientras carga en vez de "0"); Correo SMTP (valida host al habilitar y puerto 1–65535 antes de guardar); PWA ("Instalar App" en vez de "Descargar en Celular"; iPadOS se detecta como iOS); Cargar pedido (no permite pedir más que el stock disponible, contando lo que el propio pedido ya reservaba — verificado solo con tipos, no se pudo abrir el modal desde el script de prueba); Gastos (el KPI decía "Total (Período)" sin tener filtro de período: ahora "Total de gastos registrados").
> **B8 — pendiente:** Tesorería (cuentas archivadas inaccesibles, el comprobante se pierde al deshacer un ingreso), Eventos (solo abre el primer vale QR), "Probar envío" de correo con cambios sin guardar, y el resto del listado de pulido por pantalla.

> **B8 — quinta tanda:** Correo SMTP ("Probar envío" se desactiva y avisa cuando hay cambios sin guardar; verificado en el navegador); Eventos (el modal del vale permite pasar entre los vales de un pedido con varios: "Vale N de M" con anterior/siguiente; verificado que abre, pero los datos de prueba solo tienen pedidos con un vale, así que la navegación no se vio en pantalla).
> **B8 — pendiente:** Tesorería (cuentas archivadas inaccesibles —requiere decidir dónde se ven—; el comprobante se pierde al deshacer un ingreso —probablemente backend—) y el resto de ítems menores del listado por pantalla.

> **Etapa 6 (cierre de pendientes chicos):** B6-16 resuelto (los `window.confirm` de Mi Espacio, Completar Legajo y la navegación del AppShell usan ahora el diálogo estándar "Cambios sin guardar", asíncrono, montado una vez en `App`; espera el `history.back()` del modal antes de navegar). B6-14 resuelto (el editor PDF compara el contenido con una foto tomada al abrir y pide confirmación al cerrar con cambios). B7-12 resuelto (sin toast genérico al actualizar el expediente, que ya confirma cada acción en línea; el Traspaso muestra el error una sola vez). Se quitó también la doble confirmación del botón "Volver" del legajo.

> **B8 — Tesorería y Expediente:** cuentas archivadas visibles con "Ver archivadas" (insignia "Archivada", aviso de que no admite movimientos y botón "Reactivar cuenta"; el Traspaso solo ofrece cuentas activas); deshacer un ingreso conserva el comprobante y ya no repite el rubro en la descripción (`desarmarConceptoIngreso`, con test, también usado al editar: deja de truncar descripciones con guiones); "Eliminar" cuenta deshabilitado con saldo, con el motivo visible; Traspaso explica que necesita dos cuentas activas; meses del plan mensual con nombre completo; el cobro embebido no repite título y miembro; deshacer el borrado de un rubro lo reinserta en la lista; exportar a Excel avisa si falla (p. ej. sin conexión). Expediente: el bloque Grupo Familiar es un solo componente compartido por Datos y Cuotas (mismos textos); la ficha no dice "Sin restricciones alimentarias" si hay una alergia; "Tocá Rellenar Ficha" solo aparece si el botón está disponible. `esVerdadero` y `motion-safe` de Trayectoria ya estaban resueltos.
> **Pendiente:** permiso de edición de alergias y dieta (`padron.editar` vs `legajos.editar`: decisión de permisos). La vista de cuentas archivadas no se vio con datos reales porque la base de prueba no tiene ninguna.

> **Decisión de permisos:** alergias y dieta del expediente pasan a requerir `legajos.editar` (son datos de salud de la ficha médica). El backend rechaza el cambio de esas claves de `datosFijosJson` en otro miembro sin ese permiso con alcance sobre él (3 tests nuevos) y el expediente solo habilita esos campos con ese permiso; el propio perfil sigue pudiendo editarlos.
>
> **B8 — tanda de menores (Miembros, Pases, Organización, Escáner, Eventos):** Importar (las columnas de otra persona como "DNI Madre" ya no se toman como datos del miembro: primero coincidencia exacta y después parcial excluyendo madre/padre/tutor; sin el toast "Padrón actualizado", el modal ya muestra el resumen); Editar familia (cada acción muestra su propio mensaje y quitar a un integrante deja la subvista abierta); Historial de sección ("Actualidad" solo si sigue vigente; acordeón con `aria-expanded`); listado de Miembros ("Quitar filtro" con área táctil de 32px, padrón vacío ofrece "Nuevo miembro", el botón de llamar dice "3 tel." y tiene nombre accesible); Pases ("Sección destino" pasa a ser la etiqueta del select); Organización (cambiar de pestaña no suma historial; si falla la sección automática de una rama nueva se avisa; vaciar un campo numérico ya no lo pone en 0); Escáner QR (resultados con `aria-live`; el temporizador del modo continuo se limpia al cerrar); Eventos (los KPIs del catálogo no suman borradores ni cancelados; eliminar desde el modal de edición vuelve a /eventos en vez de dejar una pantalla de error). Drag & drop de Importar ya existía.

> **B8 — tanda Legajos / Inicio / Mi Espacio:** Legajos (la KPI "Sin ficha / Borrador" filtra ambos estados; chips de estado con `aria-pressed`; en Salud, la KPI de régimen y el chip "Con régimen especial" usan el mismo filtro y se quitó la opción duplicada del selector; botón "Limpiar filtros"; el badge de la pestaña cuenta personas con dieta o alergia sin duplicar; el error de vista previa del editor PDF se muestra en línea en vez de un toast por cada intento mientras se escribe). Asistente del legajo (el texto legal muestra "______ (Etiqueta)" en lugar de claves técnicas; los chips de opción única opcionales se pueden desmarcar; la familia ya no ve "Agregale secciones desde Legajos → Plantillas"). Inicio (el conteo de alertas médicas consolida todas las entregas, igual que /miembros; Esc en la subvista de teléfonos vuelve al listado: nuevo `onEscape` en `Drawer`/`useModalOverlay`). Mi Espacio (si ningún formulario aplica al perfil ya no se ofrecen todos, se explica; la descarga del PDF tiene su propio estado y no bloquea el envío). El `revokeObjectURL` del visor ya estaba diferido. Completar Legajo y el Expediente conservan el respaldo "todas las plantillas" porque son vistas de gestión.

> **Robustez de datos (cierre de B2-25 y B2-36):** SelectorDestinatarios descarta respuestas de búsquedas anteriores (cancelación en la limpieza del efecto) y busca excepciones dentro de la unidad elegida; el buscador Ctrl+K ya usaba react-query con el término en la `queryKey`, así que no tenía la carrera. Exportación del Libro diario: con búsqueda activa, los totales del pie salen de las filas exportadas (antes eran los del período completo y no cuadraban) y el encabezado indica el filtro; la columna "N° Comprobante" incluye el de los ingresos manuales; el criterio de búsqueda de lista y exportación es uno solo.

> **Refactor — react-query en Inicio:** Inicio deja la carga manual (un `useCallback` con 9 pedidos repetido en cada visita y en cada foco) por una consulta por recurso (`inicio-personal`, `inicio-miembros-activos`, `legajos-entregas`, `pases-candidatos`, `pases-solicitudes`, `tesoreria-cuadro-resultados`, `unidades-org`). Al volver a la pantalla los datos se muestran al instante desde la caché y se refrescan en segundo plano (`refetchOnMount: 'always'`, también al recuperar el foco); validar un QR invalida legajos y estado personal. Un error ya no se muestra como "sin datos": aparece un aviso con "Reintentar". Las claves incluyen el usuario para que la caché no se cruce entre sesiones; el selector de unidad del AppShell comparte la clave `unidades-org` y Organización la invalida al cambiar ramas o secciones. **Pendiente:** Tesorería y el Expediente.
