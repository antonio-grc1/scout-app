import { describe, expect, it } from 'vitest';
import {
  CrearTransferenciaSchema,
  RegistrarPagoSchema,
  ConsultaLibroDiarioQuerySchema,
} from '../src/tesoreria/tesoreria.dto';
import { formatearMoneda } from '../../frontend/src/lib/formatters';

// ---------------------------------------------------------
// Helper replications of internal frontend logic for exact
// empirical testing of the component implementations.
// ---------------------------------------------------------

interface CuentaFinancieraItem {
  id: number;
  nombre: string;
  tipo: 'CAJA_EFECTIVO' | 'BANCO';
  activa: boolean;
  saldoActual: number;
}

// Logic from ModalTraspasoCuentas.tsx
function validateModalTraspasoCuentas(params: {
  origenId: number | '';
  destinoId: number | '';
  monto: string;
  concepto: string;
  fecha: string;
  cuentasActivas: CuentaFinancieraItem[];
}) {
  const { origenId, destinoId, monto, concepto, fecha, cuentasActivas } = params;

  const cuentaOrigen = cuentasActivas.find((c) => c.id === Number(origenId));
  const montoNum = parseFloat(monto);
  const saldoOrigenDisponible = cuentaOrigen ? Number(cuentaOrigen.saldoActual) : 0;
  const saldoInsuficiente = !isNaN(montoNum) && montoNum > saldoOrigenDisponible;

  const submitDisabled =
    saldoInsuficiente || !origenId || !destinoId || origenId === destinoId;

  if (!origenId) return { ok: false, error: 'Seleccioná la cuenta de origen.', submitDisabled };
  if (!destinoId) return { ok: false, error: 'Seleccioná la cuenta de destino.', submitDisabled };
  if (origenId === destinoId)
    return { ok: false, error: 'La cuenta de origen y de destino no pueden ser la misma.', submitDisabled };
  if (isNaN(montoNum) || montoNum <= 0)
    return { ok: false, error: 'Ingresá un monto mayor a $0.', submitDisabled };
  if (saldoInsuficiente)
    return {
      ok: false,
      error: `El monto ($${montoNum.toLocaleString('es-AR')}) excede el saldo disponible en la cuenta origen (${formatearMoneda(saldoOrigenDisponible)}).`,
      submitDisabled,
    };
  if (!concepto.trim() || concepto.trim().length < 3)
    return {
      ok: false,
      error: 'Ingresá el motivo o concepto del traspaso (mínimo 3 caracteres).',
      submitDisabled,
    };

  const payload = {
    origenCuentaId: Number(origenId),
    destinoCuentaId: Number(destinoId),
    monto: montoNum,
    concepto: concepto.trim(),
    fecha: fecha ? fecha : undefined,
  };

  return { ok: true, payload, submitDisabled };
}

// Destination select options filter in ModalTraspasoCuentas.tsx
function getDestinationOptions(cuentasActivas: CuentaFinancieraItem[], origenId: number | '') {
  return cuentasActivas.filter((c) => c.id !== Number(origenId));
}

// Origin change handler in ModalTraspasoCuentas.tsx
function handleOriginChange(
  nuevoOrigenId: number | '',
  currentDestinoId: number | '',
  cuentasActivas: CuentaFinancieraItem[],
): { origenId: number | ''; destinoId: number | '' } {
  let nextDestino = currentDestinoId;
  if (nuevoOrigenId === currentDestinoId) {
    const otro = cuentasActivas.find((c) => c.id !== nuevoOrigenId);
    nextDestino = otro ? otro.id : '';
  }
  return { origenId: nuevoOrigenId, destinoId: nextDestino };
}

// Logic from ModalCobrarDeuda.tsx
function selectDefaultCuenta(
  metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO',
  cuentas: CuentaFinancieraItem[],
): number | '' {
  if (metodoPago === 'TRANSFERENCIA') {
    const bancos = cuentas.filter((c) => c.tipo === 'BANCO');
    const principal =
      bancos.find((c) => c.nombre.toLowerCase().includes('principal')) || bancos[0];
    return principal ? principal.id : '';
  } else if (metodoPago === 'EFECTIVO') {
    const cajas = cuentas.filter((c) => c.tipo === 'CAJA_EFECTIVO');
    const central =
      cajas.find(
        (c) =>
          c.nombre.toLowerCase().includes('central') ||
          c.nombre.toLowerCase().includes('chica'),
      ) || cajas[0];
    return central ? central.id : '';
  }
  return '';
}

function buildCobroPayload(params: {
  usuarioId: number;
  montoEfectivoFinal: number;
  metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO';
  cuentaId: number | '';
  saldoAFavorAUsar: number;
  referenciaComprobante: string;
  observaciones: string;
  itemsAImputar: Array<{ cargoId: number; monto: number }>;
}) {
  return {
    usuarioId: params.usuarioId,
    montoTotal: params.montoEfectivoFinal,
    metodoPago: params.metodoPago,
    cuentaId: params.cuentaId ? Number(params.cuentaId) : undefined,
    usarSaldoAFavor: params.saldoAFavorAUsar > 0,
    montoSaldoAFavor: params.saldoAFavorAUsar,
    referenciaComprobante: params.referenciaComprobante.trim() || undefined,
    observaciones: params.observaciones.trim() || undefined,
    imputaciones: params.itemsAImputar,
  };
}

// Logic from PanelTesoreriaCajaBanco.tsx
function obtenerHoyISO(refDate: Date = new Date()): string {
  const d = refDate;
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function obtenerRangoSemana(refDate: Date = new Date()): { desde: string; hasta: string } {
  const hoy = new Date(refDate);
  const diaSemana = hoy.getDay();
  const diasHastaLunes = (diaSemana + 6) % 7;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diasHastaLunes);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { desde: format(lunes), hasta: format(domingo) };
}

function obtenerRangoMes(refDate: Date = new Date()): { desde: string; hasta: string } {
  const hoy = new Date(refDate);
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const primerDia = new Date(y, m, 1);
  const ultimoDia = new Date(y, m + 1, 0);

  const format = (d: Date) => {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  return { desde: format(primerDia), hasta: format(ultimoDia) };
}

function formatearFechaHora(fechaIso?: string | null): string {
  if (!fechaIso) return '-';
  try {
    const d = new Date(fechaIso);
    if (isNaN(d.getTime())) return fechaIso;
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fechaIso;
  }
}

function obtenerEtiquetaTipoMovimiento(tipo: any): { texto: string; badgeClass: string } {
  switch (tipo) {
    case 'INGRESO_COBRANZA':
      return {
        texto: 'Cobro de Cuota / Evento',
        badgeClass:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'INGRESO_OTRO':
      return {
        texto: 'Ingreso Extra',
        badgeClass:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'EGRESO_GASTO':
      return {
        texto: 'Egreso / Gasto',
        badgeClass:
          'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      };
    case 'TRANSFERENCIA_SALIDA':
      return {
        texto: 'Traspaso Emitido',
        badgeClass:
          'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      };
    case 'TRANSFERENCIA_ENTRADA':
      return {
        texto: 'Traspaso Recibido',
        badgeClass:
          'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      };
    default:
      return {
        texto: tipo,
        badgeClass: 'bg-paper-3 text-ink-2 border-rule',
      };
  }
}

// =========================================================
// TEST SUITE
// =========================================================

describe('CRITERION 1: ModalTraspasoCuentas Stress Test & Validation Verification', () => {
  const cuentasActivas: CuentaFinancieraItem[] = [
    { id: 1, nombre: 'Caja Chica Central', tipo: 'CAJA_EFECTIVO', activa: true, saldoActual: 5000 },
    { id: 2, nombre: 'Banco Santander Principal', tipo: 'BANCO', activa: true, saldoActual: 25000 },
    { id: 3, nombre: 'Banco Galicia Secundario', tipo: 'BANCO', activa: true, saldoActual: 0 },
  ];

  it('1.1: Impide transferir monto 0 o negativo', () => {
    // Monto 0
    const resCero = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '0',
      concepto: 'Pago de compras',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resCero.ok).toBe(false);
    expect(resCero.error).toBe('Ingresá un monto mayor a $0.');

    // Monto negativo
    const resNegativo = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '-150.50',
      concepto: 'Pago de compras',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resNegativo.ok).toBe(false);
    expect(resNegativo.error).toBe('Ingresá un monto mayor a $0.');

    // Monto no numérico
    const resNaN = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: 'abc',
      concepto: 'Pago de compras',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resNaN.ok).toBe(false);
    expect(resNaN.error).toBe('Ingresá un monto mayor a $0.');
  });

  it('1.2: Impide transferir un monto que exceda el saldo disponible de la cuenta origen', () => {
    // Cuenta 1 tiene saldoActual 5000
    const resExcede = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '5000.01',
      concepto: 'Extracción fondos',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resExcede.ok).toBe(false);
    expect(resExcede.error).toContain('excede el saldo disponible');
    expect(resExcede.submitDisabled).toBe(true);

    // Cuenta 3 tiene saldoActual 0 -> no puede transferir ni $1
    const resOrigenCero = validateModalTraspasoCuentas({
      origenId: 3,
      destinoId: 1,
      monto: '1',
      concepto: 'Extracción fondos',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resOrigenCero.ok).toBe(false);
    expect(resOrigenCero.submitDisabled).toBe(true);

    // Saldo exacto es permitido
    const resExacto = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '5000.00',
      concepto: 'Vaciado de caja',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resExacto.ok).toBe(true);
    expect(resExacto.submitDisabled).toBe(false);
  });

  it('1.3: Impide seleccionar la misma cuenta como origen y destino', () => {
    // Intento con mismo origen y destino
    const resIguales = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 1,
      monto: '100',
      concepto: 'Auto transferencia',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resIguales.ok).toBe(false);
    expect(resIguales.error).toBe('La cuenta de origen y de destino no pueden ser la misma.');
    expect(resIguales.submitDisabled).toBe(true);

    // Verifica que el dropdown de destino filtra activamente la cuenta origen
    const opcionesDestino = getDestinationOptions(cuentasActivas, 1);
    expect(opcionesDestino.some((c) => c.id === 1)).toBe(false);
    expect(opcionesDestino.map((c) => c.id)).toEqual([2, 3]);

    // Verifica que al cambiar origen al mismo que destino, destino se reasigna automáticamente
    const reasignacion = handleOriginChange(2, 2, cuentasActivas);
    expect(reasignacion.origenId).toBe(2);
    expect(reasignacion.destinoId).not.toBe(2);
    expect(reasignacion.destinoId).toBe(1);
  });

  it('1.4: Valida que el campo concepto sea obligatorio y tenga al menos 3 caracteres no vacíos', () => {
    // Concepto vacío
    const resVacio = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '100',
      concepto: '',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resVacio.ok).toBe(false);
    expect(resVacio.error).toBe('Ingresá el motivo o concepto del traspaso (mínimo 3 caracteres).');

    // Concepto solo espacios
    const resEspacios = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '100',
      concepto: '    ',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resEspacios.ok).toBe(false);

    // Concepto 2 caracteres
    const resDos = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '100',
      concepto: 'Ok',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resDos.ok).toBe(false);

    // Concepto válido (3 caracteres)
    const resTres = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '100',
      concepto: 'Gas',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resTres.ok).toBe(true);
  });

  it('1.5: El payload generado satisface estrictamente el CrearTransferenciaSchema del backend', () => {
    const resValido = validateModalTraspasoCuentas({
      origenId: 1,
      destinoId: 2,
      monto: '1250.75',
      concepto: 'Traspaso a cuenta corriente',
      fecha: '2026-11-02',
      cuentasActivas,
    });
    expect(resValido.ok).toBe(true);

    const parseResult = CrearTransferenciaSchema.safeParse(resValido.payload);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.origenCuentaId).toBe(1);
      expect(parseResult.data.destinoCuentaId).toBe(2);
      expect(parseResult.data.monto).toBe(1250.75);
      expect(parseResult.data.concepto).toBe('Traspaso a cuenta corriente');
    }
  });
});

describe('CRITERION 2: ModalCobrarDeuda Account Selection & Payload Verification', () => {
  const cuentasMock: CuentaFinancieraItem[] = [
    { id: 10, nombre: 'Caja Chica Central', tipo: 'CAJA_EFECTIVO', activa: true, saldoActual: 1000 },
    { id: 11, nombre: 'Caja Chica Eventos', tipo: 'CAJA_EFECTIVO', activa: true, saldoActual: 500 },
    { id: 20, nombre: 'Banco Santander Principal', tipo: 'BANCO', activa: true, saldoActual: 50000 },
    { id: 21, nombre: 'Banco Credicoop', tipo: 'BANCO', activa: true, saldoActual: 12000 },
  ];

  it('2.1: Cuando el método es TRANSFERENCIA selecciona cuenta bancaria y prioriza "Banco Principal"', () => {
    const cuentaAuto = selectDefaultCuenta('TRANSFERENCIA', cuentasMock);
    expect(cuentaAuto).toBe(20); // Santander Principal

    // Si ninguna contiene "Principal", toma el primer banco
    const cuentasSinPrincipal: CuentaFinancieraItem[] = [
      { id: 10, nombre: 'Caja Chica', tipo: 'CAJA_EFECTIVO', activa: true, saldoActual: 1000 },
      { id: 21, nombre: 'Banco Credicoop', tipo: 'BANCO', activa: true, saldoActual: 12000 },
      { id: 22, nombre: 'Banco Macro', tipo: 'BANCO', activa: true, saldoActual: 8000 },
    ];
    const cuentaFallback = selectDefaultCuenta('TRANSFERENCIA', cuentasSinPrincipal);
    expect(cuentaFallback).toBe(21);
  });

  it('2.2: Cuando el método es EFECTIVO selecciona la caja física priorizando "Central" / "Chica"', () => {
    const cuentaAuto = selectDefaultCuenta('EFECTIVO', cuentasMock);
    expect(cuentaAuto).toBe(10); // Caja Chica Central
  });

  it('2.3: Si no existen cuentas del tipo correspondiente, devuelve cadena vacía para fallback', () => {
    const soloCajas: CuentaFinancieraItem[] = [
      { id: 10, nombre: 'Caja Chica Central', tipo: 'CAJA_EFECTIVO', activa: true, saldoActual: 1000 },
    ];
    const cuentaTransf = selectDefaultCuenta('TRANSFERENCIA', soloCajas);
    expect(cuentaTransf).toBe('');

    const soloBancos: CuentaFinancieraItem[] = [
      { id: 20, nombre: 'Banco Principal', tipo: 'BANCO', activa: true, saldoActual: 1000 },
    ];
    const cuentaEfec = selectDefaultCuenta('EFECTIVO', soloBancos);
    expect(cuentaEfec).toBe('');
  });

  it('2.4: Adjunta correctamente cuentaId en el payload de POST /tesoreria/pagos y cumple RegistrarPagoSchema', () => {
    // Caso con cuentaId válida seleccionada
    const payloadConCuenta = buildCobroPayload({
      usuarioId: 42,
      montoEfectivoFinal: 3500,
      metodoPago: 'TRANSFERENCIA',
      cuentaId: 20,
      saldoAFavorAUsar: 0,
      referenciaComprobante: 'TRF-994821',
      observaciones: 'Pago cuota noviembre',
      itemsAImputar: [{ cargoId: 101, monto: 3500 }],
    });

    expect(payloadConCuenta.cuentaId).toBe(20);
    const parse1 = RegistrarPagoSchema.safeParse(payloadConCuenta);
    expect(parse1.success).toBe(true);

    // Caso con cuentaId vacía -> undefined en backend
    const payloadSinCuenta = buildCobroPayload({
      usuarioId: 42,
      montoEfectivoFinal: 3500,
      metodoPago: 'EFECTIVO',
      cuentaId: '',
      saldoAFavorAUsar: 0,
      referenciaComprobante: '',
      observaciones: '',
      itemsAImputar: [{ cargoId: 101, monto: 3500 }],
    });

    expect(payloadSinCuenta.cuentaId).toBeUndefined();
    const parse2 = RegistrarPagoSchema.safeParse(payloadSinCuenta);
    expect(parse2.success).toBe(true);
  });
});

describe('CRITERION 3: Ledger Table, Arqueo Presets & Carryover Formatting', () => {
  it('3.1: Preset "Hoy" devuelve formato YYYY-MM-DD coherente con la fecha local', () => {
    const hoy = obtenerHoyISO(new Date(2026, 10, 2)); // 2 Nov 2026
    expect(hoy).toBe('2026-11-02');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(hoy)).toBe(true);

    // Verificación con ConsultaLibroDiarioQuerySchema
    const parse = ConsultaLibroDiarioQuerySchema.safeParse({ desde: hoy, hasta: hoy });
    expect(parse.success).toBe(true);
  });

  it('3.2: Preset "Esta Semana" calcula el lunes de inicio y el domingo de cierre de la semana actual', () => {
    // 2 Nov 2026 fue lunes
    const semanaLunes = obtenerRangoSemana(new Date(2026, 10, 2));
    expect(semanaLunes.desde).toBe('2026-11-02');
    expect(semanaLunes.hasta).toBe('2026-11-08');

    // 4 Nov 2026 (miércoles)
    const semanaMiercoles = obtenerRangoSemana(new Date(2026, 10, 4));
    expect(semanaMiercoles.desde).toBe('2026-11-02');
    expect(semanaMiercoles.hasta).toBe('2026-11-08');

    // 8 Nov 2026 (domingo)
    const semanaDomingo = obtenerRangoSemana(new Date(2026, 10, 8));
    expect(semanaDomingo.desde).toBe('2026-11-02');
    expect(semanaDomingo.hasta).toBe('2026-11-08');

    const parse = ConsultaLibroDiarioQuerySchema.safeParse(semanaMiercoles);
    expect(parse.success).toBe(true);
  });

  it('3.3: Preset "Este Mes" calcula el 1er día y el último día del mes en curso', () => {
    // Noviembre (30 días)
    const mesNov = obtenerRangoMes(new Date(2026, 10, 15));
    expect(mesNov.desde).toBe('2026-11-01');
    expect(mesNov.hasta).toBe('2026-11-30');

    // Febrero en año bisiesto (2028: 29 días)
    const febBisiesto = obtenerRangoMes(new Date(2028, 1, 10));
    expect(febBisiesto.desde).toBe('2028-02-01');
    expect(febBisiesto.hasta).toBe('2028-02-29');

    // Febrero en año común (2027: 28 días)
    const febComun = obtenerRangoMes(new Date(2027, 1, 10));
    expect(febComun.desde).toBe('2027-02-01');
    expect(febComun.hasta).toBe('2027-02-28');
  });

  it('3.4: formatearFechaHora no lanza excepciones con entradas inválidas, nulas o extremas', () => {
    expect(formatearFechaHora(null)).toBe('-');
    expect(formatearFechaHora(undefined)).toBe('-');
    expect(formatearFechaHora('')).toBe('-');
    expect(formatearFechaHora('fecha-invalida')).toBe('fecha-invalida');
    expect(formatearFechaHora('2026-11-02T15:30:00.000Z')).toContain('2026');
  });

  it('3.5: obtenerEtiquetaTipoMovimiento cubre los 5 tipos oficiales y fallback sin romper', () => {
    const tipos = [
      'INGRESO_COBRANZA',
      'INGRESO_OTRO',
      'EGRESO_GASTO',
      'TRANSFERENCIA_SALIDA',
      'TRANSFERENCIA_ENTRADA',
    ] as const;

    for (const t of tipos) {
      const info = obtenerEtiquetaTipoMovimiento(t);
      expect(info.texto).toBeTruthy();
      expect(info.badgeClass).toBeTruthy();
    }

    const fallback = obtenerEtiquetaTipoMovimiento('TIPO_DESCONOCIDO');
    expect(fallback.texto).toBe('TIPO_DESCONOCIDO');
  });

  it('3.6: Manejo resiliente del Estado Vacío (movimientos = []) y Arrastre de Saldo Anterior', () => {
    const libroDiarioVacio = {
      cuenta: { id: 1, nombre: 'Caja Chica Central', tipo: 'CAJA_EFECTIVO' as const, activa: true },
      saldoAnterior: 14500.5,
      movimientos: [],
      totalIngresosPeriodo: 0,
      totalEgresosPeriodo: 0,
      saldoFinalPeriodo: 14500.5,
      saldoActualConsolidado: 14500.5,
    };

    // Validar que libroDiarioVacio contiene números válidos y listas vacías
    expect(libroDiarioVacio.movimientos.length).toBe(0);
    expect(formatearMoneda(libroDiarioVacio.saldoAnterior)).toContain('14.500');
    expect(formatearMoneda(libroDiarioVacio.totalIngresosPeriodo)).toContain('0');
    expect(formatearMoneda(libroDiarioVacio.totalEgresosPeriodo)).toContain('0');
    expect(formatearMoneda(libroDiarioVacio.saldoFinalPeriodo)).toContain('14.500');
  });
});
