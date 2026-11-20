import { Prisma, PrismaClient } from '@prisma/client';

export const ESQUEMA_CAMPOS_2026 = {
  destinatario: 'MENORES' as const,
  esPrincipal: true,
  orden: 1,
  tituloDocumento: 'Legajo de Ingreso 2026 — Menores de 18 años',
  secciones: [
    {
      id: 'seccion_inscripcion',
      titulo: '1. Ficha de Inscripción',
      descripcion: 'Datos personales del protagonista, escolaridad y contactos de la madre, padre o tutor para el legajo institucional anual.',
      permiteCopiarHermano: true,
      campos: [
        { key: 'protagonista_domicilio', label: 'Domicilio real del protagonista (Calle, N°, Barrio, Localidad)', type: 'text', required: true },
        { key: 'protagonista_telefono', label: 'Teléfono de contacto (Protagonista o Familiar)', type: 'tel', required: true },
        { key: 'religion', label: 'Religión', type: 'text', required: false },
        { key: 'escolaridad_institucion', label: 'Escolaridad (Tipo e Institución)', type: 'text', required: true },
        { key: 'escolaridad_grado', label: 'Grado / Año escolar', type: 'text', required: true },
        { key: 'obra_social', label: 'Obra Social / Prepaga', type: 'text', required: true },
        { key: 'obra_social_afiliado', label: 'N° de Afiliado (Obra Social)', type: 'text', required: false },
        { key: 'tiene_hermanos', label: '¿Tiene hermanos en el grupo?', type: 'boolean', required: false },
        { key: 'realiza_hobby', label: '¿Realiza alguna actividad o hobby?', type: 'boolean', required: false },
        { key: 'hobby_detalle', label: '¿Cuál actividad o hobby?', type: 'text', required: false },
        { key: 'condicion_salud_preexistente', label: '¿Tiene alguna condición de salud o discapacidad preexistente?', type: 'boolean', required: false },

        // Madre
        { key: 'madre_nombres', label: 'Madre: Apellido y Nombres', type: 'text', required: true },
        { key: 'madre_dni', label: 'Madre: DNI', type: 'text', required: true },
        { key: 'madre_domicilio', label: 'Madre: Domicilio', type: 'text', required: true },
        { key: 'madre_convive', label: 'Madre: ¿Vive en el mismo hogar que el protagonista?', type: 'boolean', required: false },
        { key: 'madre_email', label: 'Madre: E-mail', type: 'email', required: true },
        { key: 'madre_telefono', label: 'Madre: Teléfono', type: 'tel', required: true },
        { key: 'madre_profesion', label: 'Madre: Profesión / Ocupación', type: 'text', required: false },
        { key: 'madre_estado_civil', label: 'Madre: Estado Civil', type: 'text', required: false },

        // Padre
        { key: 'padre_nombres', label: 'Padre: Apellido y Nombres', type: 'text', required: false },
        { key: 'padre_dni', label: 'Padre: DNI', type: 'text', required: false },
        { key: 'padre_domicilio', label: 'Padre: Domicilio', type: 'text', required: false },
        { key: 'padre_convive', label: 'Padre: ¿Vive en el mismo hogar que el protagonista?', type: 'boolean', required: false },
        { key: 'padre_email', label: 'Padre: E-mail', type: 'email', required: false },
        { key: 'padre_telefono', label: 'Padre: Teléfono', type: 'tel', required: false },
        { key: 'padre_profesion', label: 'Padre: Profesión / Ocupación', type: 'text', required: false },
        { key: 'padre_estado_civil', label: 'Padre: Estado Civil', type: 'text', required: false },

        // Tutor
        { key: 'tutor_nombres', label: 'Tutor: Apellido y Nombres (si aplica)', type: 'text', required: false },
        { key: 'tutor_dni', label: 'Tutor: DNI', type: 'text', required: false },
        { key: 'tutor_domicilio', label: 'Tutor: Domicilio', type: 'text', required: false },
        { key: 'tutor_convive', label: 'Tutor: ¿Vive en el mismo hogar?', type: 'boolean', required: false },
        { key: 'tutor_email', label: 'Tutor: E-mail', type: 'email', required: false },
        { key: 'tutor_telefono', label: 'Tutor: Teléfono', type: 'tel', required: false },
        { key: 'tutor_profesion', label: 'Tutor: Profesión', type: 'text', required: false },
        { key: 'tutor_estado_civil', label: 'Tutor: Estado Civil', type: 'text', required: false },
      ],
    },
    {
      id: 'seccion_salud',
      titulo: '2. Declaración Jurada de Salud (Planilla 01-25)',
      descripcion: 'Antecedentes médicos, vacunas, situaciones clínicas y teléfonos de emergencia. Esta planilla tiene carácter de declaración jurada.',
      campos: [
        { key: 'tel_emergencia_1', label: 'Teléfono para Emergencia 1', type: 'tel', required: true },
        { key: 'tel_emergencia_2', label: 'Teléfono para Emergencia 2', type: 'tel', required: false },
        { key: 'fecha_control_medico', label: 'Fecha de último control médico (si realizó)', type: 'date', required: false },

        // Vacunas
        { key: 'vacuna_quintuple', label: 'Vacuna Quíntuple (Última dosis dd/mm/aaaa)', type: 'text', required: false },
        { key: 'vacuna_triple_celular', label: 'Triple Bacteriana Celular (Última dosis dd/mm/aaaa)', type: 'text', required: false },
        { key: 'vacuna_triple_acelular', label: 'Triple Bacteriana Acelular (Última dosis dd/mm/aaaa)', type: 'text', required: false },
        { key: 'vacuna_doble_bacteriana', label: 'Doble Bacteriana (Última dosis dd/mm/aaaa)', type: 'text', required: false },
        { key: 'no_tiene_vacunas_mencionadas', label: 'No tiene las vacunas mencionadas', type: 'boolean', required: false },
        { key: 'no_sabe_vacunas', label: 'No sabe / no contesta', type: 'boolean', required: false },

        // Preguntas médicas
        { key: 'toma_medicacion', label: '¿Toma alguna medicación?', type: 'boolean', required: false },
        {
          key: 'medicacion_tipos',
          label: 'Tipo de medicación',
          type: 'multiselect',
          required: false,
          categoriaMedica: 'MEDICACION',
          critico: true,
          esDetalleDe: 'toma_medicacion',
          options: [
            { label: 'Diaria / Permanente', value: 'DIARIA' },
            { label: 'Rescate / SOS', value: 'RESCATE' },
            { label: 'Analgésicos autorizados', value: 'ANALGESICOS' },
            { label: 'Temporal', value: 'TEMPORAL' },
          ],
        },
        { key: 'toma_medicacion_detalle', label: 'Medicación que toma (nombre, dosis y horarios)', type: 'text', required: false },
        { key: 'enfermedad_cronica', label: '¿Padece alguna enfermedad crónica?', type: 'boolean', required: false },
        {
          key: 'condiciones_medicas_tipos',
          label: 'Condición o enfermedad crónica',
          type: 'multiselect',
          required: false,
          categoriaMedica: 'ENFERMEDAD_CRONICA',
          critico: true,
          esDetalleDe: 'enfermedad_cronica',
          options: [
            { label: 'Asma / Broncoespasmo', value: 'ASMA' },
            { label: 'Diabetes', value: 'DIABETES' },
            { label: 'Epilepsia / Convulsiones', value: 'EPILEPSIA' },
            { label: 'Cardiopatía', value: 'CARDIOPATIA' },
            { label: 'Hipertensión', value: 'HIPERTENSION' },
            { label: 'Hipotensión', value: 'HIPOTENSION' },
            { label: 'Otra', value: 'OTRA' },
          ],
        },
        { key: 'enfermedad_cronica_detalle', label: 'Detalle de enfermedad crónica', type: 'text', required: false },
        { key: 'requiere_tratamiento', label: '¿Requiere tratamiento?', type: 'boolean', required: false },
        { key: 'requiere_tratamiento_detalle', label: 'Tratamiento requerido', type: 'text', required: false },
        { key: 'tiene_cud', label: '¿Tiene CUD (Certificado Único de Discapacidad)?', type: 'boolean', required: false },
        { key: 'sufre_alergia', label: '¿Sufre alguna alergia?', type: 'boolean', required: false },
        {
          key: 'alergias_tipos',
          label: 'Categorías de alergia',
          type: 'multiselect',
          required: false,
          categoriaMedica: 'ALERGIA',
          critico: true,
          esDetalleDe: 'sufre_alergia',
          options: [
            { label: 'Alimentos', value: 'ALIMENTOS' },
            { label: 'Medicamentos', value: 'MEDICAMENTOS' },
            { label: 'Picaduras / Insectos', value: 'PICADURAS' },
            { label: 'Ambientales / Polen / Ácaros', value: 'AMBIENTALES' },
            { label: 'Otras', value: 'OTRAS' },
          ],
        },
        { key: 'sufre_alergia_detalle', label: 'Detalle de alergias (sustancia, alimento o medicamento)', type: 'text', required: false },
        { key: 'esta_anticoagulado', label: '¿Está anticoagulado/a?', type: 'boolean', required: false },
        { key: 'anticoagulado_droga', label: 'Droga anticoagulante', type: 'text', required: false },
        { key: 'regimen_dietario', label: '¿Sigue algún régimen dietario especial?', type: 'boolean', required: false },
        {
          key: 'regimen_dietario_tipos',
          label: 'Tipo de régimen o restricción alimentaria',
          type: 'multiselect',
          required: false,
          categoriaMedica: 'DIETA',
          esDetalleDe: 'regimen_dietario',
          options: [
            { label: 'Vegetariano', value: 'VEGETARIANO' },
            { label: 'Vegano', value: 'VEGANO' },
            { label: 'Celíaco / Sin TACC', value: 'CELIACO' },
            { label: 'Sin Lactosa', value: 'SIN_LACTOSA' },
            { label: 'Diabético', value: 'DIABETICO' },
            { label: 'Sin Sal / Hiposódico', value: 'HIPOSODICO' },
            { label: 'Otro', value: 'OTRO' },
          ],
        },
        { key: 'regimen_dietario_detalle', label: 'Detalle u observaciones de régimen dietario', type: 'text', required: false },
        { key: 'ataques_panico_ansiedad', label: '¿Ha tenido ataques de pánico o ansiedad?', type: 'boolean', required: false },
        { key: 'ataques_panico_frecuencia', label: 'Frecuencia de ataques de pánico', type: 'text', required: false },
        { key: 'diagnostico_salud_mental', label: '¿Cuenta con diagnóstico de un profesional de salud mental?', type: 'boolean', required: false },
        { key: 'diagnostico_salud_mental_detalle', label: 'Diagnóstico de salud mental', type: 'text', required: false },
        { key: 'recibe_tratamiento_salud_mental', label: '¿Recibe tratamiento de salud mental?', type: 'boolean', required: false },
        { key: 'recibe_tratamiento_salud_mental_detalle', label: 'Tratamiento de salud mental', type: 'text', required: false },
        { key: 'miedo_fobia_excesivo', label: '¿Tiene algún miedo excesivo o fobia?', type: 'boolean', required: false },
        { key: 'miedo_fobia_detalle', label: '¿Cuál miedo o fobia padece? (si aplica)', type: 'text', required: false },

        // Situaciones
        { key: 'sit_hemorragias_nasales', label: 'Tiene hemorragias nasales frecuentes', type: 'boolean', required: false },
        { key: 'sit_sangrado_encias', label: 'Sangran sus encías al cepillarse', type: 'boolean', required: false },
        { key: 'sit_dolor_cabeza', label: 'Tiene dolor de cabeza frecuente', type: 'boolean', required: false },
        { key: 'sit_presion_alta', label: 'Sufre de presión alta', type: 'boolean', required: false },
        { key: 'sit_presion_baja', label: 'Sufre de presión baja', type: 'boolean', required: false },
        { key: 'sit_transfusiones', label: 'Alguna vez recibió transfusiones de sangre', type: 'boolean', required: false },
        { key: 'sit_convulsiones', label: 'Ha tenido convulsiones', type: 'boolean', required: false },
        { key: 'sit_cirugias_ultimo_anio', label: 'Tuvo cirugías en el último año', type: 'boolean', required: false },
        { key: 'sit_internaciones_ultimo_anio', label: 'Tuvo internaciones en el último año', type: 'boolean', required: false },
        { key: 'sit_actividad_fisica', label: 'Realiza actividad física habitualmente', type: 'boolean', required: false },
        { key: 'sit_cualquier_actividad_fisica', label: 'Puede realizar cualquier tipo de actividad física', type: 'boolean', required: false },
        { key: 'sit_actividad_fisica_no_especifique', label: 'Si NO puede realizar cualquier actividad, especifique:', type: 'textarea', required: false },

        // Biometría
        {
          key: 'grupo_sanguineo',
          label: 'Grupo Sanguíneo (A, B, AB, 0)',
          type: 'select',
          required: true,
          options: [
            { label: '0', value: '0' },
            { label: 'A', value: 'A' },
            { label: 'B', value: 'B' },
            { label: 'AB', value: 'AB' },
          ],
        },
        {
          key: 'factor_rh',
          label: 'Factor RH (+ o -)',
          type: 'select',
          required: true,
          options: [
            { label: 'RH +', value: '+' },
            { label: 'RH -', value: '-' },
          ],
        },
        { key: 'peso_kg', label: 'Peso aproximado (Kg)', type: 'text', required: true },
        { key: 'talla_m', label: 'Talla / Altura (metros, ej. 1.45)', type: 'text', required: true },

        // Cobertura y comunicación
        { key: 'tel_emergencia_obra_social', label: 'Teléfono de Emergencia de la Obra Social', type: 'tel', required: false },
        { key: 'comunicacion_educador_necesaria', label: '¿Considera necesario que algún educador se comunique con Ud.? Indique motivo', type: 'textarea', required: false },
      ],
    },
    {
      id: 'seccion_autorizacion_ingreso',
      titulo: '3. Autorización de Ingreso de Menores (Planilla 07-21)',
      descripcion: 'Autorización legal obligatoria de Scouts de Argentina para la participación del menor en las actividades del Grupo Scout Juan XXIII N° 196.',
      campos: [
        {
          key: 'autorizante_tipo',
          label: 'Adulto que firma la autorización',
          type: 'select',
          required: true,
          options: [
            { label: 'Madre', value: 'madre' },
            { label: 'Padre', value: 'padre' },
            { label: 'Tutor / Guardador', value: 'tutor' },
          ],
        },
        { key: 'autorizante_nombre', label: 'Nombre y Apellido completo del autorizante', type: 'text', required: true },
        { key: 'autorizante_nacionalidad', label: 'Nacionalidad del autorizante', type: 'text', required: true },
        { key: 'autorizante_fecha_nac', label: 'Fecha de nacimiento del autorizante', type: 'date', required: true },
        { key: 'autorizante_dni', label: 'DNI del autorizante', type: 'text', required: true },
        { key: 'autorizante_telefono', label: 'Teléfono del autorizante', type: 'tel', required: true },
        { key: 'autorizante_domicilio', label: 'Domicilio del autorizante', type: 'text', required: true },
        { key: 'autorizante_caracter', label: 'En carácter de (madre / padre / tutor judicial)', type: 'text', required: true },
        { key: 'menor_nacionalidad', label: 'Nacionalidad del menor', type: 'text', required: true },
        { key: 'aclaraciones_tenencia_guarda', label: 'Aclaraciones sobre tenencia o guarda judicial (si corresponde)', type: 'textarea', required: false },
      ],
    },
    {
      id: 'seccion_autorizacion_salidas',
      titulo: '4. Autorización Anual para Salidas Cercanas (Planilla 07-21)',
      descripcion: 'Autorización oficial para actividades barriales, visitas y salidas por el día sin pernocte, y traslados oficiales organizados por la Institución (según Capítulo 4 del Manual General de Normas de SAAC).',
      campos: [
        {
          key: 'confirma_autorizacion_salidas',
          label: 'Otorgo la Autorización Anual para Salidas Cercanas y traslados oficiales según las normas de SAAC (Planilla 07-21)',
          type: 'boolean',
          required: true,
        },
      ],
    },
    {
      id: 'seccion_necesidades_especiales',
      titulo: '5. Ficha de Necesidades Especiales',
      descripcion: 'Ficha de adaptación pedagógica para conocer diagnósticos, tratamientos, profesionales de apoyo y situaciones de estrés para una mejor inclusión.',
      campos: [
        { key: 'ne_diagnostico', label: 'Diagnóstico o patología', type: 'text', required: false },
        { key: 'ne_evolucion', label: 'Evolución', type: 'text', required: false },
        { key: 'ne_medico_cabecera', label: 'Médico de cabecera', type: 'text', required: false },
        { key: 'ne_medicacion', label: 'Medicación habitual', type: 'text', required: false },
        { key: 'ne_otros_antecedentes', label: 'Otros antecedentes médicos a saber', type: 'text', required: false },
        { key: 'ne_medicamento_horarios', label: 'Medicamento y sus horarios', type: 'text', required: false },
        { key: 'ne_cud_vencimiento_prestacion', label: 'Certificado de discapacidad (vencimiento y orientación prestacional)', type: 'text', required: false },
        { key: 'ne_grupo_acompanante', label: 'Grupo Acompañante (Psicopedagogo, Psicólogo, Acompañante Terapéutico, etc.)', type: 'text', required: false },
        { key: 'ne_terapias_previas', label: 'Terapias previas', type: 'text', required: false },
        { key: 'ne_situaciones_estres_abordaje', label: 'Situaciones que pueden generarle estrés y cómo las abordan en familia/escuela', type: 'textarea', required: false },
        { key: 'ne_descripcion_hijo_gustos_miedos', label: 'Descripción breve: gustos, preferencias, estímulos que le atraen, miedos y cómo ayudarle', type: 'textarea', required: false },
        { key: 'ne_expectativas_familia', label: '¿Cuáles son las expectativas de la familia con el Grupo Scout?', type: 'textarea', required: false },
      ],
    },
    {
      id: 'seccion_retiro_menores',
      titulo: '6. Autorización Retiro de Menores',
      descripcion: 'Registro de personas mayores expresamente autorizadas por la familia para retirar al menor al finalizar las actividades, o autorización de retiro autónomo.',
      campos: [
        // Persona 1
        { key: 'ret_persona1_nombre', label: 'Persona 1 autorizada a retirar: Nombre y Apellido', type: 'text', required: false },
        { key: 'ret_persona1_dni', label: 'Persona 1: DNI', type: 'text', required: false },
        { key: 'ret_persona1_telefono', label: 'Persona 1: Teléfono de contacto', type: 'tel', required: false },
        { key: 'ret_persona1_caracter', label: 'Persona 1: Vínculo o relación con el menor (ej. Abuela, Tío, Vecino)', type: 'text', required: false },
        // Persona 2
        { key: 'ret_persona2_nombre', label: 'Persona 2 autorizada a retirar: Nombre y Apellido', type: 'text', required: false },
        { key: 'ret_persona2_dni', label: 'Persona 2: DNI', type: 'text', required: false },
        { key: 'ret_persona2_telefono', label: 'Persona 2: Teléfono de contacto', type: 'tel', required: false },
        { key: 'ret_persona2_caracter', label: 'Persona 2: Vínculo o relación con el menor', type: 'text', required: false },
        // Persona 3
        { key: 'ret_persona3_nombre', label: 'Persona 3 autorizada a retirar: Nombre y Apellido', type: 'text', required: false },
        { key: 'ret_persona3_dni', label: 'Persona 3: DNI', type: 'text', required: false },
        { key: 'ret_persona3_telefono', label: 'Persona 3: Teléfono de contacto', type: 'tel', required: false },
        { key: 'ret_persona3_caracter', label: 'Persona 3: Vínculo o relación con el menor', type: 'text', required: false },
        // Retiro solo
        { key: 'ret_autoriza_retirarse_solo', label: 'Autorizo a que el menor se retire solo/a al término de las actividades', type: 'boolean', required: false },
        { key: 'ret_retiro_solo_aclaracion', label: 'Aclaración o condiciones para el retiro autónomo', type: 'text', required: false },
      ],
    },
    {
      id: 'seccion_ficha_adultos',
      titulo: '7. Ficha de Adultos Colaboradores y Materiales',
      descripcion: 'Relevamiento voluntario de adultos y familias predispuestas a colaborar con oficios, talleres, cocina, campamento, transporte o préstamo/donación de materiales.',
      campos: [
        { key: 'completar_ficha_adultos', label: 'Deseo registrarme para colaborar como adulto voluntario / prestar materiales', type: 'boolean', required: false },
        { key: 'adulto_nombre', label: 'Nombre y Apellido del adulto colaborador', type: 'text', required: false },
        { key: 'adulto_profesion', label: 'Profesión u Oficio', type: 'text', required: false },
        { key: 'adulto_telefono', label: 'Teléfono de contacto', type: 'tel', required: false },
        { key: 'adulto_direccion', label: 'Domicilio / Dirección', type: 'text', required: false },
        { key: 'adulto_localidad', label: 'Localidad', type: 'text', required: false },
        { key: 'adulto_codigo_postal', label: 'Código Postal', type: 'text', required: false },
        {
          key: 'adulto_preferencia_trabajo',
          label: 'Preferencia de trabajo voluntario',
          type: 'select',
          required: false,
          options: [
            { label: 'Con Jóvenes', value: 'JOVENES' },
            { label: 'Con Adultos', value: 'ADULTOS' },
            { label: 'Indistinto', value: 'AMBOS' },
          ],
        },
        // Áreas de colaboración
        { key: 'colab_servicio_comunitario', label: 'En proyectos de servicio comunitario', type: 'boolean', required: false },
        { key: 'colab_fotocopias', label: 'Proveyendo fotocopias', type: 'boolean', required: false },
        { key: 'colab_mano_obra', label: 'Proveyendo mano de obra', type: 'boolean', required: false },
        { key: 'colab_administrativo', label: 'Ayudando con tareas administrativas', type: 'boolean', required: false },
        { key: 'colab_transporte', label: 'Proveyendo transporte', type: 'boolean', required: false },
        { key: 'colab_camion', label: 'Tengo un camión disponible', type: 'boolean', required: false },
        { key: 'colab_camioneta', label: 'Tengo una camioneta disponible', type: 'boolean', required: false },
        { key: 'colab_colectivo', label: 'Tengo un colectivo/minibús disponible', type: 'boolean', required: false },
        { key: 'colab_recaudacion_fondos', label: 'Recaudación de fondos / cuotas', type: 'boolean', required: false },
        { key: 'colab_campamento', label: 'En campamento', type: 'boolean', required: false },
        { key: 'colab_cocina_campamento', label: 'En cocina de campamento', type: 'boolean', required: false },
        { key: 'colab_ensenando', label: 'Enseñando (deportes, primeros auxilios, artes, danzas, oficios)', type: 'boolean', required: false },
        { key: 'colab_mostrando_trabajo', label: 'Mostrando mi trabajo / profesión', type: 'boolean', required: false },
        { key: 'colab_alimentos_no_perecederos', label: 'Proveyendo alimentos no perecederos', type: 'boolean', required: false },
        { key: 'colab_tareas_especiales', label: 'Ayudar en tareas especiales', type: 'boolean', required: false },
        { key: 'colab_otros', label: 'Otras áreas de ayuda', type: 'boolean', required: false },
        { key: 'colab_otros_detalle', label: 'Detalle de otras colaboraciones', type: 'text', required: false },
        // Relevamiento de Materiales con casilleros de Préstamo y Donación
        {
          key: 'materiales_prestamo_donacion_tabla',
          label: 'Materiales para Construcción y Campamento (Préstamo o Donación)',
          type: 'materiales_tabla',
          required: false,
        },
        { key: 'adulto_observaciones', label: 'Observaciones / Comentarios adicionales', type: 'textarea', required: false },
      ],
    },
  ],
};

export const ESQUEMA_CAMPOS_ROVERS_2026 = {
  destinatario: 'MAYORES' as const,
  esPrincipal: true,
  orden: 1,
  tituloDocumento: 'Legajo de Afiliación 2026 — Protagonistas Mayores (+18)',
  secciones: [
    {
      ...ESQUEMA_CAMPOS_2026.secciones[0],
      titulo: '1. Ficha de Inscripción (+18)',
      descripcion:
        'Datos personales, estudios/ocupación y contactos familiares opcionales del protagonista mayor de edad.',
      campos: ESQUEMA_CAMPOS_2026.secciones[0].campos.map((c) => {
        if (
          c.key.startsWith('madre_') ||
          c.key.startsWith('padre_') ||
          c.key.startsWith('tutor_')
        ) {
          return { ...c, required: false };
        }
        if (c.key === 'escolaridad_institucion') {
          return {
            ...c,
            label: 'Estudios / Escolaridad / Institución',
            required: false,
          };
        }
        if (c.key === 'escolaridad_grado') {
          return {
            ...c,
            label: 'Año / Carrera / Cursado',
            required: false,
          };
        }
        return c;
      }),
    },
    ESQUEMA_CAMPOS_2026.secciones[1],
    ESQUEMA_CAMPOS_2026.secciones[4],
    ESQUEMA_CAMPOS_2026.secciones[6],
  ],
};

export const ESQUEMA_CAMPOS_EDUCADORES_2026 = {
  destinatario: 'EDUCADORES' as const,
  esPrincipal: true,
  orden: 1,
  tituloDocumento: 'Declaración Jurada de Salud 2026 — Educadores y Adultos',
  secciones: [
    {
      ...ESQUEMA_CAMPOS_2026.secciones[1],
      titulo: 'Declaración Jurada de Salud (Planilla 01-25)',
      campos: [
        {
          key: 'protagonista_domicilio',
          label: 'Domicilio real (Calle, N°, Barrio, Localidad)',
          type: 'text',
          required: true,
        },
        {
          key: 'obra_social',
          label: 'Obra Social / Prepaga / ART',
          type: 'text',
          required: true,
        },
        {
          key: 'obra_social_afiliado',
          label: 'N° de Credencial / Afiliado (Obra Social)',
          type: 'text',
          required: false,
        },
        ...ESQUEMA_CAMPOS_2026.secciones[1].campos,
      ],
    },
  ],
};

const PAGINAS_CONDICIONALES_MENORES = [
  {
    page: 4,
    incluirSiAlguno: [
      'condicion_salud_preexistente',
      'tiene_cud',
      'ne_diagnostico',
      'ne_evolucion',
      'ne_medico_cabecera',
      'ne_medicacion',
      'ne_otros_antecedentes',
      'ne_medicamento_horarios',
      'ne_cud_vencimiento_prestacion',
      'ne_grupo_acompanante',
      'ne_terapias_previas',
      'ne_situaciones_estres_abordaje',
      'ne_descripcion_hijo_gustos_miedos',
      'ne_expectativas_familia',
    ],
  },
  {
    page: 6,
    incluirSiAlguno: [
      'completar_ficha_adultos',
      'adulto_observaciones',
      'colab_otros_detalle',
    ],
    incluirSiPrefijoTruthy: ['colab_', 'mat_'],
  },
];

const PAGINAS_CONDICIONALES_MAYORES = [
  { ...PAGINAS_CONDICIONALES_MENORES[0], page: 2 },
  { ...PAGINAS_CONDICIONALES_MENORES[1], page: 3 },
];

export const PLANTILLAS_OFICIALES_2026 = [
  {
    codigo: 'LEGAJO_MENORES_2026',
    titulo: 'Legajo de Ingreso 2026 — Menores de 18 años',
    version: '2026.3',
    cicloAnio: 2026,
    esquemaCamposJson: ESQUEMA_CAMPOS_2026 as unknown as Prisma.InputJsonObject,
    mapeoPdfJson: {
      pdfBaseUrl: '/pdf-templates/legajo_menores_2026_acroform.pdf',
      pdfFileName: 'legajo_menores_2026_acroform.pdf',
      modoRender: 'PDF_ACROFORM',
      indexBase: 0,
      campos: {},
      qrVerificacion: { page: 1, x: 514, y: 749, width: 52 },
      qrPaginas: [
        { page: 0, x: 520, y: 12, width: 44 },
        { page: 1, x: 514, y: 749, width: 52 },
      ],
      paginasCondicionales: PAGINAS_CONDICIONALES_MENORES,
    } as unknown as Prisma.InputJsonObject,
    activa: true,
  },
  {
    codigo: 'LEGAJO_ROVERS_2026',
    titulo: 'Legajo de Afiliación 2026 — Protagonistas Mayores (+18)',
    version: '2026.3',
    cicloAnio: 2026,
    esquemaCamposJson: ESQUEMA_CAMPOS_ROVERS_2026 as unknown as Prisma.InputJsonObject,
    mapeoPdfJson: {
      pdfBaseUrl: '/pdf-templates/legajo_mayores_2026_acroform.pdf',
      pdfFileName: 'legajo_mayores_2026_acroform.pdf',
      modoRender: 'PDF_ACROFORM',
      indexBase: 0,
      campos: {},
      qrVerificacion: { page: 1, x: 514, y: 749, width: 52 },
      qrPaginas: [
        { page: 0, x: 520, y: 12, width: 44 },
        { page: 1, x: 514, y: 749, width: 52 },
      ],
      paginasCondicionales: PAGINAS_CONDICIONALES_MAYORES,
    } as unknown as Prisma.InputJsonObject,
    activa: true,
  },
  {
    codigo: 'LEGAJO_EDUCADORES_2026',
    titulo: 'Declaración Jurada de Salud 2026 — Educadores y Adultos',
    version: '2026.3',
    cicloAnio: 2026,
    esquemaCamposJson: ESQUEMA_CAMPOS_EDUCADORES_2026 as unknown as Prisma.InputJsonObject,
    mapeoPdfJson: {
      pdfBaseUrl: '/pdf-templates/planilla_salud_01_25_acroform.pdf',
      pdfFileName: 'planilla_salud_01_25_acroform.pdf',
      modoRender: 'PDF_ACROFORM',
      indexBase: 0,
      campos: {},
      qrVerificacion: { page: 0, x: 514, y: 749, width: 52 },
    } as unknown as Prisma.InputJsonObject,
    activa: true,
  },
];

const CODIGOS_OFICIALES_ACTIVOS = PLANTILLAS_OFICIALES_2026.map((p) => p.codigo);

export async function seedPlantillaOficial(prisma: PrismaClient) {
  let firstId = 0;

  for (const data of PLANTILLAS_OFICIALES_2026) {
    const existente = await prisma.plantillaFormulario.findFirst({
      where: { codigo: data.codigo, cicloAnio: data.cicloAnio },
    });

    if (existente) {
      await prisma.plantillaFormulario.update({
        where: { id: existente.id },
        data,
      });
      console.log(`📄 Documento "${data.titulo}" actualizado (ID: ${existente.id})`);
      if (!firstId) firstId = existente.id;
    } else {
      const creada = await prisma.plantillaFormulario.create({ data });
      console.log(`📄 Documento "${data.titulo}" creado (ID: ${creada.id})`);
      if (!firstId) firstId = creada.id;
    }
  }

  // Limpiar cualquier otra plantilla que no pertenezca a los 3 legajos oficiales provistos
  const obsoletas = await prisma.plantillaFormulario.findMany({
    where: {
      codigo: { notIn: CODIGOS_OFICIALES_ACTIVOS },
    },
    include: {
      _count: { select: { entregas: true } },
    },
  });

  let eliminadas = 0;
  let pausadas = 0;
  for (const p of obsoletas) {
    if (p._count.entregas === 0) {
      await prisma.plantillaFormulario.delete({ where: { id: p.id } });
      eliminadas++;
    } else {
      await prisma.plantillaFormulario.update({
        where: { id: p.id },
        data: { activa: false },
      });
      pausadas++;
      console.warn(
        `⚠️  Plantilla "${p.codigo}" (ID ${p.id}) pausada y conservada porque tiene ${p._count.entregas} entrega(s) histórica(s).`,
      );
    }
  }

  if (eliminadas > 0 || pausadas > 0) {
    console.log(`🧹 Limpieza de plantillas: ${eliminadas} eliminada(s), ${pausadas} pausada(s).`);
  }

  return firstId;
}
