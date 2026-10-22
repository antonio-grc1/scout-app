import { PrismaClient } from '@prisma/client';

export const ESQUEMA_CAMPOS_2026 = {
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
        { key: 'madre_profesion', label: 'Madre: Profesión / Ocupación', type: 'text', required: true },
        { key: 'madre_estado_civil', label: 'Madre: Estado Civil', type: 'text', required: true },

        // Padre
        { key: 'padre_nombres', label: 'Padre: Apellido y Nombres', type: 'text', required: true },
        { key: 'padre_dni', label: 'Padre: DNI', type: 'text', required: true },
        { key: 'padre_domicilio', label: 'Padre: Domicilio', type: 'text', required: true },
        { key: 'padre_convive', label: 'Padre: ¿Vive en el mismo hogar que el protagonista?', type: 'boolean', required: false },
        { key: 'padre_email', label: 'Padre: E-mail', type: 'email', required: true },
        { key: 'padre_telefono', label: 'Padre: Teléfono', type: 'tel', required: true },
        { key: 'padre_profesion', label: 'Padre: Profesión / Ocupación', type: 'text', required: true },
        { key: 'padre_estado_civil', label: 'Padre: Estado Civil', type: 'text', required: true },

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
        { key: 'toma_medicacion_detalle', label: 'Medicación que toma', type: 'text', required: false },
        { key: 'enfermedad_cronica', label: '¿Padece alguna enfermedad crónica?', type: 'boolean', required: false },
        { key: 'enfermedad_cronica_detalle', label: 'Detalle de enfermedad crónica', type: 'text', required: false },
        { key: 'requiere_tratamiento', label: '¿Requiere tratamiento?', type: 'boolean', required: false },
        { key: 'requiere_tratamiento_detalle', label: 'Tratamiento requerido', type: 'text', required: false },
        { key: 'tiene_cud', label: '¿Tiene CUD (Certificado Único de Discapacidad)?', type: 'boolean', required: false },
        { key: 'sufre_alergia', label: '¿Sufre alguna alergia?', type: 'boolean', required: false },
        { key: 'sufre_alergia_detalle', label: 'Detalle de alergias', type: 'text', required: false },
        { key: 'esta_anticoagulado', label: '¿Está anticoagulado/a?', type: 'boolean', required: false },
        { key: 'anticoagulado_droga', label: 'Droga anticoagulante', type: 'text', required: false },
        { key: 'regimen_dietario', label: '¿Sigue algún régimen dietario especial?', type: 'boolean', required: false },
        { key: 'regimen_dietario_detalle', label: 'Detalle de régimen dietario', type: 'text', required: false },
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
        { key: 'grupo_sanguineo', label: 'Grupo Sanguíneo (A, B, AB, 0)', type: 'text', required: true },
        { key: 'factor_rh', label: 'Factor RH (+ o -)', type: 'text', required: true },
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

export const MAPEO_PDF_2026 = {
  pdfBaseUrl: '/pdf-templates/legajo_ingreso_menores_2026.pdf',
  qrVerificacion: {
    page: 0,
    x: 480,
    y: 28,
    width: 68,
  },
  campos: {
    // ---------------- PÁGINA 1: INSCRIPCIÓN (Letter: 612 x 792) ----------------
    rama_nombre: { page: 0, x: 90, y: 662, size: 8 },
    protagonista_nombre_completo: { page: 0, x: 145, y: 609, size: 8 },
    protagonista_dni: { page: 0, x: 325, y: 609, size: 8 },
    protagonista_fecha_nac: { page: 0, x: 495, y: 609, size: 8 },
    protagonista_domicilio: { page: 0, x: 100, y: 584, size: 8 },
    protagonista_telefono: { page: 0, x: 100, y: 560, size: 8 },
    protagonista_religion: { page: 0, x: 455, y: 560, size: 8 },
    religion: { page: 0, x: 455, y: 560, size: 8 },
    protagonista_escolaridad: { page: 0, x: 180, y: 537, size: 8 },
    escolaridad_institucion: { page: 0, x: 180, y: 537, size: 8 },
    protagonista_grado_anio: { page: 0, x: 475, y: 537, size: 8 },
    escolaridad_grado: { page: 0, x: 475, y: 537, size: 8 },
    obra_social: { page: 0, x: 115, y: 512, size: 8 },
    obra_social_afiliado: { page: 0, x: 465, y: 512, size: 8 },
    tiene_hermanos_texto: { page: 0, x: 155, y: 488, size: 8 },
    hobby_texto: { page: 0, x: 395, y: 488, size: 8 },
    condicion_salud_preexistente_texto: { page: 0, x: 365, y: 464, size: 8 },

    // Madre
    madre_nombres: { page: 0, x: 260, y: 418, size: 8 },
    madre_dni: { page: 0, x: 485, y: 418, size: 8 },
    madre_domicilio: { page: 0, x: 205, y: 393, size: 8 },
    madre_convive_texto: { page: 0, x: 370, y: 381, size: 8 },
    madre_email: { page: 0, x: 195, y: 355, size: 8 },
    madre_telefono: { page: 0, x: 420, y: 355, size: 8 },
    madre_profesion: { page: 0, x: 210, y: 323, size: 8 },
    madre_estado_civil: { page: 0, x: 430, y: 323, size: 8 },

    // Padre
    padre_nombres: { page: 0, x: 260, y: 287, size: 8 },
    padre_dni: { page: 0, x: 485, y: 287, size: 8 },
    padre_domicilio: { page: 0, x: 205, y: 262, size: 8 },
    padre_convive_texto: { page: 0, x: 370, y: 250, size: 8 },
    padre_email: { page: 0, x: 195, y: 224, size: 8 },
    padre_telefono: { page: 0, x: 420, y: 224, size: 8 },
    padre_profesion: { page: 0, x: 210, y: 192, size: 8 },
    padre_estado_civil: { page: 0, x: 430, y: 192, size: 8 },

    // Tutor
    tutor_nombres: { page: 0, x: 260, y: 158, size: 8 },
    tutor_dni: { page: 0, x: 485, y: 158, size: 8 },
    tutor_domicilio: { page: 0, x: 205, y: 133, size: 8 },
    tutor_convive_texto: { page: 0, x: 370, y: 120, size: 8 },
    tutor_email: { page: 0, x: 195, y: 95, size: 8 },
    tutor_telefono: { page: 0, x: 420, y: 95, size: 8 },
    tutor_profesion: { page: 0, x: 210, y: 63, size: 8 },
    tutor_estado_civil: { page: 0, x: 430, y: 63, size: 8 },

    // ---------------- PÁGINA 2: SALUD (A4: 595.56 x 842.04) ----------------
    salud_apellido: { page: 1, x: 120, y: 672, size: 8 },
    salud_nombre: { page: 1, x: 120, y: 657, size: 8 },
    salud_fecha_nac: { page: 1, x: 175, y: 644, size: 8 },
    salud_dni: { page: 1, x: 110, y: 629, size: 8 },
    salud_zona: { page: 1, x: 115, y: 600, size: 8 },
    salud_distrito: { page: 1, x: 215, y: 600, size: 8 },
    salud_grupo: { page: 1, x: 310, y: 600, size: 8 },
    salud_domicilio: { page: 1, x: 125, y: 572, size: 8 },
    salud_tel_emergencia1: { page: 1, x: 215, y: 545, size: 8 },
    tel_emergencia_1: { page: 1, x: 215, y: 545, size: 8 },
    salud_tel_emergencia2: { page: 1, x: 215, y: 525, size: 8 },
    tel_emergencia_2: { page: 1, x: 215, y: 525, size: 8 },
    salud_control_medico_fecha: { page: 1, x: 420, y: 669, size: 8 },
    fecha_control_medico: { page: 1, x: 420, y: 669, size: 8 },

    // Vacunas
    salud_vac_quintuple: { page: 1, x: 235, y: 451, size: 8 },
    vacuna_quintuple: { page: 1, x: 235, y: 451, size: 8 },
    salud_vac_triple_celular: { page: 1, x: 235, y: 440, size: 8 },
    vacuna_triple_celular: { page: 1, x: 235, y: 440, size: 8 },
    salud_vac_triple_acelular: { page: 1, x: 235, y: 428, size: 8 },
    vacuna_triple_acelular: { page: 1, x: 235, y: 428, size: 8 },
    salud_vac_doble_bacteriana: { page: 1, x: 235, y: 417, size: 8 },
    vacuna_doble_bacteriana: { page: 1, x: 235, y: 417, size: 8 },
    no_tiene_vacunas_mencionadas: { page: 1, type: 'checkbox_x', trueCoords: { page: 1, x: 485, y: 406 } },
    no_sabe_vacunas: { page: 1, type: 'checkbox_x', trueCoords: { page: 1, x: 485, y: 394 } },

    // Preguntas médicas izquierda
    salud_toma_medicacion: { page: 1, x: 205, y: 375, size: 8 },
    toma_medicacion_texto: { page: 1, x: 205, y: 375, size: 8 },
    salud_toma_medicacion_detalle: { page: 1, x: 75, y: 360, size: 8 },
    toma_medicacion_detalle: { page: 1, x: 75, y: 360, size: 8 },

    salud_enfermedad_cronica: { page: 1, x: 250, y: 341, size: 8 },
    enfermedad_cronica_texto: { page: 1, x: 250, y: 341, size: 8 },
    salud_enfermedad_cronica_detalle: { page: 1, x: 75, y: 328, size: 8 },
    enfermedad_cronica_detalle: { page: 1, x: 75, y: 328, size: 8 },

    salud_requiere_tratamiento: { page: 1, x: 190, y: 312, size: 8 },
    requiere_tratamiento_texto: { page: 1, x: 190, y: 312, size: 8 },
    salud_requiere_tratamiento_detalle: { page: 1, x: 75, y: 298, size: 8 },
    requiere_tratamiento_detalle: { page: 1, x: 75, y: 298, size: 8 },

    salud_tiene_cud: { page: 1, x: 160, y: 288, size: 8 },
    tiene_cud_texto: { page: 1, x: 160, y: 288, size: 8 },

    salud_sufre_alergia: { page: 1, x: 185, y: 271, size: 8 },
    sufre_alergia_texto: { page: 1, x: 185, y: 271, size: 8 },
    salud_sufre_alergia_detalle: { page: 1, x: 75, y: 257, size: 8 },
    sufre_alergia_detalle: { page: 1, x: 75, y: 257, size: 8 },

    salud_anticoagulado: { page: 1, x: 185, y: 247, size: 8 },
    esta_anticoagulado_texto: { page: 1, x: 185, y: 247, size: 8 },
    salud_anticoagulado_droga: { page: 1, x: 75, y: 233, size: 8 },
    anticoagulado_droga: { page: 1, x: 75, y: 233, size: 8 },

    salud_regimen_dietario: { page: 1, x: 255, y: 218, size: 8 },
    regimen_dietario_texto: { page: 1, x: 255, y: 218, size: 8 },
    salud_regimen_dietario_detalle: { page: 1, x: 75, y: 204, size: 8 },
    regimen_dietario_detalle: { page: 1, x: 75, y: 204, size: 8 },

    salud_ataques_panico: { page: 1, x: 260, y: 182, size: 8 },
    ataques_panico_ansiedad_texto: { page: 1, x: 260, y: 182, size: 8 },
    salud_ataques_panico_frecuencia: { page: 1, x: 75, y: 168, size: 8 },
    ataques_panico_frecuencia: { page: 1, x: 75, y: 168, size: 8 },

    salud_salud_mental: { page: 1, x: 235, y: 136, size: 8 },
    diagnostico_salud_mental_texto: { page: 1, x: 235, y: 136, size: 8 },
    salud_salud_mental_detalle: { page: 1, x: 75, y: 122, size: 8 },
    diagnostico_salud_mental_detalle: { page: 1, x: 75, y: 122, size: 8 },

    salud_tratamiento_mental: { page: 1, x: 235, y: 112, size: 8 },
    recibe_tratamiento_salud_mental_texto: { page: 1, x: 235, y: 112, size: 8 },
    salud_tratamiento_mental_detalle: { page: 1, x: 75, y: 98, size: 8 },
    recibe_tratamiento_salud_mental_detalle: { page: 1, x: 75, y: 98, size: 8 },

    salud_fobia: { page: 1, x: 250, y: 64, size: 8 },
    miedo_fobia_excesivo_texto: { page: 1, x: 250, y: 64, size: 8 },

    // Situaciones (tabla derecha)
    sit_hemorragias_nasales: { page: 1, x: 485, y: 614, size: 8 },
    sit_hemorragias_nasales_texto: { page: 1, x: 485, y: 614, size: 8 },
    sit_sangrado_encias: { page: 1, x: 485, y: 602, size: 8 },
    sit_sangrado_encias_texto: { page: 1, x: 485, y: 602, size: 8 },
    sit_dolor_cabeza: { page: 1, x: 485, y: 590, size: 8 },
    sit_dolor_cabeza_texto: { page: 1, x: 485, y: 590, size: 8 },
    sit_presion_alta: { page: 1, x: 485, y: 578, size: 8 },
    sit_presion_alta_texto: { page: 1, x: 485, y: 578, size: 8 },
    sit_presion_baja: { page: 1, x: 485, y: 566, size: 8 },
    sit_presion_baja_texto: { page: 1, x: 485, y: 566, size: 8 },
    sit_transfusiones: { page: 1, x: 485, y: 554, size: 8 },
    sit_transfusiones_texto: { page: 1, x: 485, y: 554, size: 8 },
    sit_convulsiones: { page: 1, x: 485, y: 542, size: 8 },
    sit_convulsiones_texto: { page: 1, x: 485, y: 542, size: 8 },
    sit_cirugias_ultimo_anio: { page: 1, x: 485, y: 530, size: 8 },
    sit_cirugias_ultimo_anio_texto: { page: 1, x: 485, y: 530, size: 8 },
    sit_internaciones_ultimo_anio: { page: 1, x: 485, y: 518, size: 8 },
    sit_internaciones_ultimo_anio_texto: { page: 1, x: 485, y: 518, size: 8 },
    sit_actividad_fisica: { page: 1, x: 485, y: 506, size: 8 },
    sit_actividad_fisica_texto: { page: 1, x: 485, y: 506, size: 8 },
    sit_cualquier_actividad_fisica: { page: 1, x: 485, y: 494, size: 8 },
    sit_cualquier_actividad_fisica_texto: { page: 1, x: 485, y: 494, size: 8 },
    sit_actividad_fisica_no_detalle: { page: 1, x: 330, y: 478, size: 7 },
    sit_actividad_fisica_no_especifique: { page: 1, x: 330, y: 478, size: 7 },

    // Biometría y Obra Social
    salud_grupo_sanguineo: { page: 1, x: 390, y: 459, size: 8 },
    grupo_sanguineo: { page: 1, x: 390, y: 459, size: 8 },
    salud_factor_rh: { page: 1, x: 505, y: 459, size: 8 },
    factor_rh: { page: 1, x: 505, y: 459, size: 8 },
    salud_peso: { page: 1, x: 360, y: 431, size: 8 },
    peso_kg: { page: 1, x: 360, y: 431, size: 8 },
    salud_talla: { page: 1, x: 460, y: 431, size: 8 },
    talla_m: { page: 1, x: 460, y: 431, size: 8 },
    salud_comunicacion_educador_detalle: { page: 1, x: 330, y: 348, size: 7 },
    comunicacion_educador_necesaria: { page: 1, x: 330, y: 348, size: 7 },
    salud_obra_social: { page: 1, x: 420, y: 327, size: 8 },
    salud_obra_social_afiliado: { page: 1, x: 390, y: 282, size: 8 },
    salud_obra_social_emergencia: { page: 1, x: 435, y: 250, size: 8 },
    tel_emergencia_obra_social: { page: 1, x: 435, y: 250, size: 8 },

    salud_firmante_aclaracion: { page: 1, x: 380, y: 128, size: 8 },
    salud_firmante_dni: { page: 1, x: 345, y: 104, size: 8 },
    salud_firmante_fecha: { page: 1, x: 480, y: 104, size: 8 },

    // ---------------- PÁGINA 3: INGRESO MENORES (A4: 595.32 x 841.92) ----------------
    ingreso_localidad: { page: 2, x: 135, y: 641, size: 8 },
    ingreso_departamento: { page: 2, x: 375, y: 641, size: 8 },
    ingreso_provincia: { page: 2, x: 120, y: 628, size: 8 },
    ingreso_dia: { page: 2, x: 335, y: 628, size: 8 },
    ingreso_mes: { page: 2, x: 415, y: 628, size: 8 },
    ingreso_anio: { page: 2, x: 515, y: 628, size: 8 },
    autorizante_nombre_p3: { page: 2, x: 110, y: 615, size: 8 },
    autorizante_nacionalidad_p3: { page: 2, x: 360, y: 615, size: 8 },
    autorizante_nac_dia_p3: { page: 2, x: 505, y: 615, size: 8 },
    autorizante_nac_mes_p3: { page: 2, x: 85, y: 601, size: 8 },
    autorizante_nac_anio_p3: { page: 2, x: 140, y: 601, size: 8 },
    autorizante_dni_p3: { page: 2, x: 220, y: 601, size: 8 },
    autorizante_telefono_p3: { page: 2, x: 360, y: 601, size: 8 },
    autorizante_domicilio_p3: { page: 2, x: 85, y: 588, size: 8 },
    autorizante_caracter_p3: { page: 2, x: 130, y: 576, size: 8 },
    menor_nombre_p3: { page: 2, x: 75, y: 562, size: 8 },
    menor_nacionalidad_p3: { page: 2, x: 360, y: 562, size: 8 },
    menor_nac_dia_p3: { page: 2, x: 515, y: 562, size: 8 },
    menor_nac_mes_p3: { page: 2, x: 85, y: 548, size: 8 },
    menor_nac_anio_p3: { page: 2, x: 220, y: 548, size: 8 },
    menor_dni_p3: { page: 2, x: 345, y: 548, size: 8 },
    menor_domicilio_p3: { page: 2, x: 85, y: 535, size: 8 },
    aclaraciones_tenencia_guarda: { page: 2, x: 380, y: 394, size: 8 },

    // ---------------- PÁGINA 4: SALIDAS CERCANAS (A4: 595.32 x 841.92) ----------------
    salidas_localidad: { page: 3, x: 135, y: 655, size: 8 },
    salidas_departamento: { page: 3, x: 375, y: 655, size: 8 },
    salidas_provincia: { page: 3, x: 120, y: 641, size: 8 },
    salidas_dia: { page: 3, x: 335, y: 641, size: 8 },
    salidas_mes: { page: 3, x: 415, y: 641, size: 8 },
    salidas_anio: { page: 3, x: 515, y: 641, size: 8 },
    autorizante_nombre_p4: { page: 3, x: 110, y: 628, size: 8 },
    autorizante_nacionalidad_p4: { page: 3, x: 360, y: 628, size: 8 },
    autorizante_nac_dia_p4: { page: 3, x: 505, y: 628, size: 8 },
    autorizante_nac_mes_p4: { page: 3, x: 85, y: 615, size: 8 },
    autorizante_nac_anio_p4: { page: 3, x: 140, y: 615, size: 8 },
    autorizante_dni_p4: { page: 3, x: 220, y: 615, size: 8 },
    autorizante_telefono_p4: { page: 3, x: 360, y: 615, size: 8 },
    autorizante_domicilio_p4: { page: 3, x: 85, y: 602, size: 8 },
    autorizante_caracter_p4: { page: 3, x: 130, y: 588, size: 8 },
    menor_nombre_p4: { page: 3, x: 140, y: 575, size: 8 },
    menor_nacionalidad_p4: { page: 3, x: 420, y: 575, size: 8 },
    menor_nac_dia_p4: { page: 3, x: 115, y: 562, size: 8 },
    menor_nac_mes_p4: { page: 3, x: 175, y: 562, size: 8 },
    menor_nac_anio_p4: { page: 3, x: 260, y: 562, size: 8 },
    menor_dni_p4: { page: 3, x: 365, y: 562, size: 8 },
    menor_domicilio_p4: { page: 3, x: 85, y: 549, size: 8 },
    salidas_ciclo_anio: { page: 3, x: 440, y: 522, size: 8 },

    // ---------------- PÁGINA 5: NECESIDADES ESPECIALES (Letter: 612 x 792) ----------------
    ne_diagnostico: { page: 4, x: 130, y: 560, size: 8 },
    ne_evolucion: { page: 4, x: 120, y: 542, size: 8 },
    ne_medico_cabecera: { page: 4, x: 170, y: 522, size: 8 },
    ne_medicacion: { page: 4, x: 135, y: 503, size: 8 },
    ne_otros_antecedentes: { page: 4, x: 240, y: 485, size: 8 },
    ne_medicamento_horarios: { page: 4, x: 200, y: 466, size: 8 },
    ne_escolaridad: { page: 4, x: 135, y: 447, size: 8 },
    ne_obra_social: { page: 4, x: 135, y: 428, size: 8 },
    ne_cud_vencimiento_prestacion: { page: 4, x: 70, y: 389, size: 8 },
    ne_grupo_acompanante: { page: 4, x: 70, y: 316, size: 8 },
    ne_terapias_previas: { page: 4, x: 150, y: 272, size: 8 },
    ne_situaciones_estres_abordaje: { page: 4, x: 70, y: 231, size: 8 },
    ne_descripcion_hijo_gustos_miedos: { page: 4, x: 70, y: 162, size: 8 },
    ne_expectativas_familia: { page: 4, x: 70, y: 102, size: 8 },

    // ---------------- PÁGINA 6: RETIRO DE MENORES (Letter: 612 x 792) ----------------
    ret_autorizante_nombre: { page: 5, x: 70, y: 621, size: 8 },
    ret_autorizante_nacionalidad: { page: 5, x: 345, y: 621, size: 8 },
    ret_autorizante_nac: { page: 5, x: 480, y: 621, size: 8 },
    ret_autorizante_dni: { page: 5, x: 150, y: 607, size: 8 },
    ret_autorizante_telefono: { page: 5, x: 265, y: 607, size: 8 },
    ret_autorizante_domicilio: { page: 5, x: 70, y: 592, size: 8 },
    ret_menor_nombre: { page: 5, x: 70, y: 578, size: 8 },
    ret_menor_nacionalidad: { page: 5, x: 320, y: 578, size: 8 },
    ret_menor_nac: { page: 5, x: 480, y: 578, size: 8 },
    ret_menor_dni: { page: 5, x: 75, y: 563, size: 8 },
    ret_menor_domicilio: { page: 5, x: 210, y: 563, size: 8 },

    // Personas autorizadas
    ret_persona1_nombre: { page: 5, x: 160, y: 504, size: 8 },
    ret_persona1_dni: { page: 5, x: 420, y: 504, size: 8 },
    ret_persona1_telefono: { page: 5, x: 110, y: 486, size: 8 },
    ret_persona1_caracter: { page: 5, x: 310, y: 486, size: 8 },

    ret_persona2_nombre: { page: 5, x: 160, y: 457, size: 8 },
    ret_persona2_dni: { page: 5, x: 420, y: 457, size: 8 },
    ret_persona2_telefono: { page: 5, x: 110, y: 443, size: 8 },
    ret_persona2_caracter: { page: 5, x: 310, y: 443, size: 8 },

    ret_persona3_nombre: { page: 5, x: 160, y: 414, size: 8 },
    ret_persona3_dni: { page: 5, x: 420, y: 414, size: 8 },
    ret_persona3_telefono: { page: 5, x: 110, y: 400, size: 8 },
    ret_persona3_caracter: { page: 5, x: 310, y: 400, size: 8 },

    ret_autoriza_retirarse_solo: { page: 5, x: 210, y: 363, size: 8 },
    ret_retiro_solo_texto: { page: 5, x: 210, y: 363, size: 8 },
    ret_fecha_completa: { page: 5, x: 90, y: 308, size: 8 },
    ret_provincia_ciudad: { page: 5, x: 150, y: 279, size: 8 },
    ret_firmante_aclaracion: { page: 5, x: 280, y: 230, size: 8 },

    // ---------------- PÁGINA 7: ADULTOS (Letter: 612 x 792) ----------------
    adulto_nombre: { page: 6, x: 100, y: 596, size: 8 },
    adulto_hijo_nombre: { page: 6, x: 140, y: 579, size: 8 },
    adulto_direccion: { page: 6, x: 110, y: 562, size: 8 },
    adulto_domicilio: { page: 6, x: 110, y: 562, size: 8 },
    adulto_localidad: { page: 6, x: 110, y: 545, size: 8 },
    adulto_codigo_postal: { page: 6, x: 370, y: 545, size: 8 },
    adulto_profesion: { page: 6, x: 140, y: 527, size: 8 },
    adulto_telefono: { page: 6, x: 110, y: 510, size: 8 },
    adulto_preferencia_trabajo: { page: 6, x: 440, y: 510, size: 8 },

    // Checkboxes colaborar columna izquierda
    colab_servicio_comunitario: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 459 } },
    colab_fotocopias: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 442 } },
    colab_mano_obra: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 425 } },
    colab_administrativo: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 408 } },
    colab_transporte: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 391 } },
    colab_camion: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 374 } },
    colab_camioneta: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 357 } },
    colab_colectivo: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 232, y: 340 } },

    // Checkboxes colaborar columna derecha
    colab_recaudacion_fondos: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 459 } },
    colab_campamento: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 442 } },
    colab_cocina_campamento: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 425 } },
    colab_ensenando: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 408 } },
    colab_mostrando_trabajo: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 391 } },
    colab_alimentos_no_perecederos: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 374 } },
    colab_tareas_especiales: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 357 } },
    colab_otros: { page: 6, type: 'checkbox_x', trueCoords: { page: 6, x: 465, y: 340 } },
    colab_otros_detalle: { page: 6, x: 110, y: 299, size: 8 },

    // Materiales
    mat_construccion_prestamo: { page: 6, x: 175, y: 216, size: 7 },
    mat_construccion_donacion: { page: 6, x: 226, y: 216, size: 7 },
    mat_campamento_prestamo: { page: 6, x: 395, y: 216, size: 7 },
    mat_campamento_donacion: { page: 6, x: 449, y: 216, size: 7 },
    adulto_observaciones: { page: 6, x: 150, y: 49, size: 8 },
  },
};

export async function seedPlantillaOficial(prisma: PrismaClient) {
  const codigo = 'LEGAJO_MENORES_2026';
  const data = {
    codigo,
    titulo: 'Inscripción y Legajo Anual 2026 (Menores de 18 años)',
    version: '2026.1',
    cicloAnio: 2026,
    esquemaCamposJson: ESQUEMA_CAMPOS_2026,
    mapeoPdfJson: MAPEO_PDF_2026,
    activa: true,
  };

  const existente = await prisma.plantillaFormulario.findFirst({
    where: { codigo, cicloAnio: 2026 },
  });

  if (existente) {
    await prisma.plantillaFormulario.update({
      where: { id: existente.id },
      data,
    });
    console.log(`📄 Plantilla "${data.titulo}" actualizada (ID: ${existente.id})`);
    return existente.id;
  } else {
    const creada = await prisma.plantillaFormulario.create({ data });
    console.log(`📄 Plantilla "${data.titulo}" creada (ID: ${creada.id})`);
    return creada.id;
  }
}
