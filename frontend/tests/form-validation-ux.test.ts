import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';

let vite: ViteDevServer;

before(async () => {
  vite = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  });
});

after(async () => {
  await vite?.close();
});

const ESQUEMA_MENORES_MOCK = {
  destinatario: 'MENORES' as const,
  secciones: [
    {
      id: 'seccion_inscripcion',
      titulo: '1. Ficha de Inscripción',
      campos: [
        { key: 'protagonista_domicilio', label: 'Domicilio', type: 'text', required: true },
        { key: 'protagonista_telefono', label: 'Teléfono', type: 'tel', required: true },
        { key: 'escolaridad_institucion', label: 'Escolaridad', type: 'text', required: true },
        { key: 'escolaridad_grado', label: 'Grado', type: 'text', required: true },
        { key: 'obra_social', label: 'Obra Social', type: 'text', required: true },
        { key: 'madre_nombres', label: 'Madre: Nombres', type: 'text', required: true },
        { key: 'madre_dni', label: 'Madre: DNI', type: 'text', required: true },
        { key: 'madre_domicilio', label: 'Madre: Domicilio', type: 'text', required: true },
        { key: 'madre_convive', label: 'Madre: ¿Convive?', type: 'boolean', required: false },
        { key: 'madre_email', label: 'Madre: E-mail', type: 'email', required: true },
        { key: 'madre_telefono', label: 'Madre: Teléfono', type: 'tel', required: true },
        { key: 'padre_nombres', label: 'Padre: Nombres', type: 'text', required: false },
        { key: 'padre_dni', label: 'Padre: DNI', type: 'text', required: false },
        { key: 'padre_domicilio', label: 'Padre: Domicilio', type: 'text', required: false },
        { key: 'padre_convive', label: 'Padre: ¿Convive?', type: 'boolean', required: false },
        { key: 'padre_email', label: 'Padre: E-mail', type: 'email', required: false },
        { key: 'padre_telefono', label: 'Padre: Teléfono', type: 'tel', required: false },
        { key: 'tutor_nombres', label: 'Tutor: Nombres', type: 'text', required: false },
        { key: 'tutor_dni', label: 'Tutor: DNI', type: 'text', required: false },
        { key: 'tutor_domicilio', label: 'Tutor: Domicilio', type: 'text', required: false },
        { key: 'tutor_convive', label: 'Tutor: ¿Convive?', type: 'boolean', required: false },
        { key: 'tutor_email', label: 'Tutor: E-mail', type: 'email', required: false },
        { key: 'tutor_telefono', label: 'Tutor: Teléfono', type: 'tel', required: false },
      ],
    },
    {
      id: 'seccion_salud',
      titulo: '2. Declaración Jurada de Salud',
      campos: [
        { key: 'tel_emergencia_1', label: 'Tel Emergencia 1', type: 'tel', required: true },
        { key: 'vacuna_quintuple', label: 'Quíntuple', type: 'text', required: false },
        { key: 'vacuna_triple_celular', label: 'Triple Celular', type: 'text', required: false },
        { key: 'vacuna_triple_acelular', label: 'Triple Acelular', type: 'text', required: false },
        { key: 'vacuna_doble_bacteriana', label: 'Doble Bacteriana', type: 'text', required: false },
        { key: 'no_tiene_vacunas_mencionadas', label: 'No tiene', type: 'boolean', required: false },
        { key: 'no_sabe_vacunas', label: 'No sabe', type: 'boolean', required: false },
        { key: 'tiene_cud', label: '¿Tiene CUD?', type: 'boolean', required: false },
        { key: 'sufre_alergia', label: '¿Sufre alguna alergia?', type: 'boolean', required: false },
        {
          key: 'alergias_tipos',
          label: 'Categorías de alergia',
          type: 'multiselect',
          required: false,
          esDetalleDe: 'sufre_alergia',
          options: [{ label: 'Alimentos', value: 'ALIMENTOS' }],
        },
        { key: 'sufre_alergia_detalle', label: 'Detalle alergias', type: 'text', required: false },
        { key: 'sit_cualquier_actividad_fisica', label: 'Cualquier actividad', type: 'boolean', required: false },
        { key: 'sit_actividad_fisica_no_especifique', label: 'Especifique restricción', type: 'textarea', required: false },
        {
          key: 'grupo_sanguineo',
          label: 'Grupo Sanguíneo',
          type: 'select',
          required: true,
          options: [{ label: '0', value: '0' }, { label: 'A', value: 'A' }],
        },
        {
          key: 'factor_rh',
          label: 'Factor RH',
          type: 'select',
          required: true,
          options: [{ label: 'RH +', value: '+' }, { label: 'RH -', value: '-' }],
        },
        { key: 'peso_kg', label: 'Peso', type: 'text', required: true },
        { key: 'talla_m', label: 'Talla', type: 'text', required: true },
      ],
    },
    {
      id: 'seccion_autorizacion_ingreso',
      titulo: '3. Autorización Ingreso',
      campos: [
        {
          key: 'autorizante_tipo',
          label: 'Adulto autorizante',
          type: 'select',
          required: true,
          options: [{ label: 'Madre', value: 'madre' }],
        },
        { key: 'autorizante_nombre', label: 'Nombre', type: 'text', required: true },
        { key: 'autorizante_dni', label: 'DNI', type: 'text', required: true },
      ],
    },
    {
      id: 'seccion_autorizacion_salidas',
      titulo: '4. Salidas Cercanas',
      campos: [
        {
          key: 'confirma_autorizacion_salidas',
          label: 'Otorgo Autorización Salidas',
          type: 'boolean',
          required: true,
        },
      ],
    },
    {
      id: 'seccion_necesidades_especiales',
      titulo: '5. Necesidades Especiales',
      campos: [
        { key: 'ne_diagnostico', label: 'Diagnóstico', type: 'text', required: false },
        { key: 'ne_cud_vencimiento_prestacion', label: 'Vencimiento CUD', type: 'text', required: false },
      ],
    },
    {
      id: 'seccion_ficha_adultos',
      titulo: '7. Voluntariado',
      campos: [
        { key: 'completar_ficha_adultos', label: 'Deseo colaborar', type: 'boolean', required: false },
        { key: 'adulto_nombre', label: 'Nombre', type: 'text', required: false },
        { key: 'adulto_telefono', label: 'Teléfono', type: 'tel', required: false },
        { key: 'colab_campamento', label: 'En campamento', type: 'boolean', required: false },
        { key: 'colab_otros', label: 'Otras áreas', type: 'boolean', required: false },
        { key: 'colab_otros_detalle', label: 'Detalle otras', type: 'text', required: false },
        { key: 'materiales_prestamo_donacion_tabla', label: 'Materiales', type: 'materiales_tabla', required: false },
        { key: 'adulto_observaciones', label: 'Observaciones', type: 'textarea', required: false },
      ],
    },
  ],
};

function datosCompletosBase() {
  return {
    protagonista_domicilio: 'Av. Colón 1234',
    protagonista_telefono: '3515123456',
    escolaridad_institucion: 'Instituto Juan XXIII',
    escolaridad_grado: '4to grado',
    obra_social: 'APROSS',
    madre_nombres: 'Pérez, Ana',
    madre_dni: '28111222',
    madre_domicilio: 'Av. Colón 1234',
    madre_email: 'ana@ejemplo.com',
    madre_telefono: '3515123456',
    tel_emergencia_1: '3515123456',
    sit_cualquier_actividad_fisica: true,
    grupo_sanguineo: '0',
    factor_rh: '+',
    peso_kg: '45',
    talla_m: '1.48',
    autorizante_tipo: 'madre',
    autorizante_nombre: 'Pérez, Ana',
    autorizante_dni: '28111222',
    confirma_autorizacion_salidas: true,
  };
}

describe('formValidation: reglas integrales de formulario y UX', () => {
  it('detecta campos obligatorios faltantes en pasos no visitados/desmontados', async () => {
    const { validarFormularioCompleto } = await vite.ssrLoadModule('/src/lib/formValidation.ts');

    const datos = datosCompletosBase();
    // Faltan campos del Paso 2 (Salud) y Paso 3 (Ingreso)
    delete (datos as any).peso_kg;
    delete (datos as any).autorizante_nombre;

    const res = validarFormularioCompleto(ESQUEMA_MENORES_MOCK, datos);
    assert.equal(res.valido, false);
    assert.equal(res.primerPasoConError, 1);
    assert.ok('peso_kg' in res.errores);
    assert.ok('autorizante_nombre' in res.errores);
    assert.deepEqual(res.pasosConError, [1, 2]);
  });

  it('exige confirmar boolean obligatorio (confirma_autorizacion_salidas === true)', async () => {
    const { validarFormularioCompleto } = await vite.ssrLoadModule('/src/lib/formValidation.ts');

    const sinConfirmar = { ...datosCompletosBase(), confirma_autorizacion_salidas: false };
    const resFallo = validarFormularioCompleto(ESQUEMA_MENORES_MOCK, sinConfirmar);
    assert.equal(resFallo.valido, false);
    assert.equal(resFallo.primerPasoConError, 3);
    assert.ok('confirma_autorizacion_salidas' in resFallo.errores);

    const confirmado = datosCompletosBase();
    const resOk = validarFormularioCompleto(ESQUEMA_MENORES_MOCK, confirmado);
    assert.equal(resOk.valido, true);
  });

  it('admite familias monoparentales o con tutor y sugiere pestaña adecuada si falta responsable', async () => {
    const { validarSeccionFormulario, validarFormularioCompleto } = await vite.ssrLoadModule(
      '/src/lib/formValidation.ts',
    );
    const secInscripcion = ESQUEMA_MENORES_MOCK.secciones[0];

    // 1. Solo Padre completo -> válido
    const soloPadre = {
      ...datosCompletosBase(),
      madre_nombres: '',
      madre_dni: '',
      madre_domicilio: '',
      madre_email: '',
      madre_telefono: '',
      padre_nombres: 'Gómez, Carlos',
      padre_dni: '27444555',
      padre_domicilio: 'Av. Colón 1234',
      padre_email: 'carlos@ejemplo.com',
      padre_telefono: '3515987654',
    };
    assert.equal(validarFormularioCompleto(ESQUEMA_MENORES_MOCK, soloPadre).valido, true);

    // 2. Solo Tutor completo -> válido
    const soloTutor = {
      ...datosCompletosBase(),
      madre_nombres: '',
      madre_dni: '',
      madre_domicilio: '',
      madre_email: '',
      madre_telefono: '',
      tutor_nombres: 'López, Marta',
      tutor_dni: '20111333',
      tutor_domicilio: 'Av. Colón 1234',
      tutor_email: 'marta@ejemplo.com',
      tutor_telefono: '3514445566',
    };
    assert.equal(validarFormularioCompleto(ESQUEMA_MENORES_MOCK, soloTutor).valido, true);

    // 3. Padre parcial y ninguno completo -> falla y sugiere 'padre'
    const padreParcial = {
      ...datosCompletosBase(),
      madre_nombres: '',
      madre_dni: '',
      madre_domicilio: '',
      madre_email: '',
      madre_telefono: '',
      padre_nombres: 'Gómez, Carlos',
    };
    const resParcial = validarSeccionFormulario(ESQUEMA_MENORES_MOCK, secInscripcion, padreParcial, 0);
    assert.equal(resParcial.valido, false);
    assert.equal(resParcial.tabFamiliarSugerida, 'padre');
    assert.ok('padre_dni' in resParcial.errores);
    assert.ok(!('madre_dni' in resParcial.errores));

    // 4. Mayores (+18) no requiere ningún familiar
    const esquemaMayores = {
      destinatario: 'MAYORES' as const,
      secciones: [
        {
          ...secInscripcion,
          campos: secInscripcion.campos.map((c) =>
            c.key.startsWith('madre_') || c.key.startsWith('padre_') || c.key.startsWith('tutor_')
              ? { ...c, required: false }
              : c,
          ),
        },
      ],
    };
    const sinFamiliares = {
      protagonista_domicilio: 'Av. Colón 1234',
      protagonista_telefono: '3515123456',
      escolaridad_institucion: 'UNC',
      escolaridad_grado: '2do año',
      obra_social: 'APROSS',
    };
    assert.equal(validarFormularioCompleto(esquemaMayores, sinFamiliares).valido, true);
  });

  it('valida formatos de email, dni, teléfono, peso_kg y talla_m (detectando cm)', async () => {
    const { validarFormularioCompleto } = await vite.ssrLoadModule('/src/lib/formValidation.ts');

    const invalidos = {
      ...datosCompletosBase(),
      madre_email: 'correo-invalido',
      madre_dni: 'abc',
      tel_emergencia_1: '123',
      peso_kg: '400',
      talla_m: '165',
    };

    const res = validarFormularioCompleto(ESQUEMA_MENORES_MOCK, invalidos);
    assert.equal(res.valido, false);
    assert.ok(res.errores.madre_email.includes('e-mail'));
    assert.ok(res.errores.madre_dni.includes('DNI'));
    assert.ok(res.errores.tel_emergencia_1.includes('teléfono'));
    assert.ok(res.errores.peso_kg.includes('peso'));
    assert.ok(res.errores.talla_m.includes('no en cm'));

    // Acepta coma decimal y DNI con puntos
    const validosConComa = {
      ...datosCompletosBase(),
      madre_dni: '28.111.222',
      peso_kg: '52,5',
      talla_m: '1,65',
    };
    assert.equal(validarFormularioCompleto(ESQUEMA_MENORES_MOCK, validosConComa).valido, true);
  });

  it('aplica obligatoriedad condicional en Paso 5 cuando tiene_cud está activo desde cualquier paso', async () => {
    const { validarFormularioCompleto } = await vite.ssrLoadModule('/src/lib/formValidation.ts');

    const conCudSinDetalle = {
      ...datosCompletosBase(),
      tiene_cud: true,
    };
    const resFalla = validarFormularioCompleto(ESQUEMA_MENORES_MOCK, conCudSinDetalle);
    assert.equal(resFalla.valido, false);
    assert.equal(resFalla.primerPasoConError, 4);
    assert.ok('ne_diagnostico' in resFalla.errores);
    assert.ok('ne_cud_vencimiento_prestacion' in resFalla.errores);

    const conCudCompleto = {
      ...conCudSinDetalle,
      ne_diagnostico: 'TEA',
      ne_cud_vencimiento_prestacion: '12/2027',
    };
    assert.equal(validarFormularioCompleto(ESQUEMA_MENORES_MOCK, conCudCompleto).valido, true);
  });

  it('normaliza valores iniciales y limpia dependencias desactivadas sin dejar basura', async () => {
    const { normalizarValoresInicialesFormulario, limpiarDependenciasDesactivadas } =
      await vite.ssrLoadModule('/src/lib/formValidation.ts');

    // 1. Default true para sit_cualquier_actividad_fisica si está undefined y sin restricción
    const normSinRestriccion = normalizarValoresInicialesFormulario(ESQUEMA_MENORES_MOCK, {});
    assert.equal(normSinRestriccion.sit_cualquier_actividad_fisica, true);

    // 2. Si había texto de restricción previo, lo infiere en false
    const normConTexto = normalizarValoresInicialesFormulario(ESQUEMA_MENORES_MOCK, {
      sit_actividad_fisica_no_especifique: 'Sin alto impacto',
    });
    assert.equal(normConTexto.sit_cualquier_actividad_fisica, false);

    // 3. Respeta false explícito
    const normExplicitoFalse = normalizarValoresInicialesFormulario(ESQUEMA_MENORES_MOCK, {
      sit_cualquier_actividad_fisica: false,
    });
    assert.equal(normExplicitoFalse.sit_cualquier_actividad_fisica, false);

    // 4. Activa boolean padre si viene multiselect poblado
    const normConChips = normalizarValoresInicialesFormulario(ESQUEMA_MENORES_MOCK, {
      alergias_tipos: ['ALIMENTOS'],
    });
    assert.equal(normConChips.sufre_alergia, true);

    // 5. Limpieza integral
    const sucios = {
      sufre_alergia: false,
      alergias_tipos: ['ALIMENTOS'],
      sufre_alergia_detalle: 'Maní',
      sit_cualquier_actividad_fisica: true,
      sit_actividad_fisica_no_especifique: 'Texto residual',
      no_tiene_vacunas_mencionadas: true,
      vacuna_quintuple: '10/10/2020',
      vacuna_doble_bacteriana: '11/11/2022',
      completar_ficha_adultos: false,
      adulto_nombre: 'Carlos',
      adulto_telefono: '3515000000',
      adulto_observaciones: 'Disponible sábados',
      adulto_hijo_nombre: 'Sofía Scout',
      colab_campamento: true,
      colab_otros: true,
      colab_otros_detalle: 'Electricidad',
      mat_carpas_prestamo: true,
    };

    const limpios = limpiarDependenciasDesactivadas(ESQUEMA_MENORES_MOCK, sucios);
    assert.deepEqual(limpios.alergias_tipos, []);
    assert.equal(limpios.sufre_alergia_detalle, '');
    assert.equal(limpios.sit_actividad_fisica_no_especifique, '');
    assert.equal(limpios.vacuna_quintuple, '');
    assert.equal(limpios.vacuna_doble_bacteriana, '');
    assert.equal(limpios.adulto_nombre, '');
    assert.equal(limpios.adulto_telefono, '');
    assert.equal(limpios.adulto_observaciones, '');
    assert.equal(limpios.adulto_hijo_nombre, 'Sofía Scout');
    assert.equal(limpios.colab_campamento, false);
    assert.equal(limpios.colab_otros_detalle, '');
    assert.equal(limpios.mat_carpas_prestamo, false);
  });
});

describe('parsearMontoAR: montos escritos en formato argentino', () => {
  it('interpreta miles con punto, decimales con coma y decimales con punto', async () => {
    const { parsearMontoAR } = await vite.ssrLoadModule('/src/lib/formatters.ts');
    assert.equal(parsearMontoAR('1.500'), 1500);
    assert.equal(parsearMontoAR('12.345.678'), 12345678);
    assert.equal(parsearMontoAR('1.500,50'), 1500.5);
    assert.equal(parsearMontoAR('1500,5'), 1500.5);
    assert.equal(parsearMontoAR('1500.5'), 1500.5);
    assert.equal(parsearMontoAR('12.34'), 12.34);
    assert.equal(parsearMontoAR('$ 2.000'), 2000);
    assert.equal(parsearMontoAR(''), null);
    assert.equal(parsearMontoAR('abc'), null);
    assert.equal(parsearMontoAR('1.50.0'), null);
  });
});

describe('validarNuevaContrasena (B7-06)', () => {
  it('aplica las mismas reglas en Cambiar clave y Mi Perfil', async () => {
    const { validarNuevaContrasena } = await vite.ssrLoadModule('/src/lib/formValidation.ts');
    assert.match(validarNuevaContrasena({ nueva: 'corta', repetir: 'corta' }), /8 caracteres/);
    assert.match(validarNuevaContrasena({ nueva: 'larguisima1', repetir: 'otra' }), /no coinciden/);
    assert.match(validarNuevaContrasena({ nueva: '12345678', repetir: '12345678', dni: '12345678' }), /DNI/);
    assert.match(
      validarNuevaContrasena({ nueva: 'larguisima1', repetir: 'larguisima1', actual: 'larguisima1' }),
      /distinta a la actual/,
    );
    assert.equal(validarNuevaContrasena({ nueva: 'larguisima1', repetir: 'larguisima1', actual: 'vieja' }), null);
  });
});

describe('esDniValido (alta de miembro)', () => {
  it('acepta DNI de 7 a 9 dígitos y rechaza el resto', async () => {
    const { esDniValido } = await vite.ssrLoadModule('/src/lib/formValidation.ts');
    assert.equal(esDniValido('12345678'), true);
    assert.equal(esDniValido('1234567'), true);
    assert.equal(esDniValido('123456789'), true);
    assert.equal(esDniValido(' 45123456 '), true);
    assert.equal(esDniValido('123456'), false);
    assert.equal(esDniValido('1234567890'), false);
    assert.equal(esDniValido('12.345.678'), false);
    assert.equal(esDniValido(''), false);
  });
});

describe('desarmarConceptoIngreso (editar / deshacer ingreso)', () => {
  it('conserva guiones de la descripción y recupera el comprobante', async () => {
    const { desarmarConceptoIngreso } = await vite.ssrLoadModule('/src/lib/formatters.ts');
    assert.deepEqual(
      desarmarConceptoIngreso('Ingreso: Rifa - edición invierno - Donaciones (Comp. #A-12)'),
      { descripcion: 'Rifa - edición invierno', comprobanteNro: 'A-12' },
    );
    assert.deepEqual(
      desarmarConceptoIngreso('Ingreso: Venta - Bufet - Kiosco', { rubroNombre: 'Bufet - Kiosco' }),
      { descripcion: 'Venta', comprobanteNro: '' },
    );
    assert.deepEqual(
      desarmarConceptoIngreso('Ingreso: Bono - Rifas', { comprobanteNro: '99' }),
      { descripcion: 'Bono', comprobanteNro: '99' },
    );
  });
});
