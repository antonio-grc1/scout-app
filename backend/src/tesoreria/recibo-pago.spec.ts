import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TesoreriaCuotasService } from './tesoreria-cuotas.service.js';
import { TesoreriaService } from './tesoreria.service.js';

const pagoBase = {
  id: 58,
  fechaPago: new Date('2026-11-25T12:00:00Z'),
  montoTotal: '15000',
  metodoPago: 'EFECTIVO',
  referenciaComprobante: null,
  observaciones: null,
  registradoPor: { nombre: 'Admin', apellido: 'Jefatura' },
  imputaciones: [
    { montoImputado: '15000', cargo: { concepto: { nombre: 'Cuota Noviembre' }, usuario: null } },
  ],
  usuario: {
    nombre: 'Ana',
    apellido: 'Pérez',
    dni: '40111222',
    emailContacto: 'familia@test.com',
    telefonoContacto: '351 555 1111',
    datosFijosJson: {
      madre_nombres: 'Laura',
      madre_telefono: '351-555-2222',
      padre_telefono: '3515551111', // mismo número que el del miembro: no se repite
      alergias: 'Maní',
    },
  },
};

const pdfValido = Buffer.from('%PDF-1.7 contenido').toString('base64');

describe('contactos del recibo y envío por correo', () => {
  it('devuelve email y teléfonos sin repetir, sin exponer el resto de la ficha', async () => {
    const service = new TesoreriaCuotasService({ pago: { findFirst: vi.fn().mockResolvedValue(pagoBase) } } as any);
    const recibo: any = await service.obtenerReciboPago({ tipo: 'GLOBAL' }, 58);

    expect(recibo.contactos).toEqual({
      email: 'familia@test.com',
      telefonos: [
        { etiqueta: 'Miembro', numero: '351 555 1111' },
        { etiqueta: 'Madre (Laura)', numero: '351-555-2222' },
      ],
    });
    expect(recibo.usuario).toEqual({ nombre: 'Ana', apellido: 'Pérez', dni: '40111222' });
    expect(JSON.stringify(recibo)).not.toContain('Maní');
  });

  it('envía el PDF adjunto al email del titular', async () => {
    const mailer = {
      estaDisponibleParaEnvio: vi.fn().mockResolvedValue(true),
      enviarReciboPago: vi.fn().mockResolvedValue(true),
    };
    const service = new TesoreriaCuotasService(
      { pago: { findFirst: vi.fn().mockResolvedValue(pagoBase) } } as any,
      mailer as any,
    );

    const res = await service.enviarReciboPorCorreo({ tipo: 'GLOBAL' }, 58, pdfValido);

    expect(res).toEqual({ enviado: true, destinatario: 'familia@test.com' });
    const datos = mailer.enviarReciboPago.mock.calls[0][0];
    expect(datos.destinatario).toBe('familia@test.com');
    expect(datos.numero).toBe('000058');
    expect(datos.pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rechaza si el miembro no tiene email', async () => {
    const sinEmail = { ...pagoBase, usuario: { ...pagoBase.usuario, emailContacto: null } };
    const service = new TesoreriaCuotasService(
      { pago: { findFirst: vi.fn().mockResolvedValue(sinEmail) } } as any,
      { estaDisponibleParaEnvio: vi.fn().mockResolvedValue(true), enviarReciboPago: vi.fn() } as any,
    );
    await expect(service.enviarReciboPorCorreo({ tipo: 'GLOBAL' }, 58, pdfValido)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza un archivo que no es PDF', async () => {
    const mailer = { estaDisponibleParaEnvio: vi.fn().mockResolvedValue(true), enviarReciboPago: vi.fn() };
    const service = new TesoreriaCuotasService(
      { pago: { findFirst: vi.fn().mockResolvedValue(pagoBase) } } as any,
      mailer as any,
    );
    await expect(
      service.enviarReciboPorCorreo({ tipo: 'GLOBAL' }, 58, Buffer.from('<html>').toString('base64')),
    ).rejects.toThrow(BadRequestException);
    expect(mailer.enviarReciboPago).not.toHaveBeenCalled();
  });
});

describe('obtenerReciboPago', () => {
  it('alcance PROPIO: solo busca pagos propios o que imputan a sus cuotas', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7 });
    const service = new TesoreriaService({ pago: { findFirst } } as any);

    await service.obtenerReciboPago({ tipo: 'PROPIO', usuarioId: 5 }, 7);

    expect(findFirst.mock.calls[0][0].where).toEqual({
      AND: [
        { id: 7 },
        {
          OR: [{ usuarioId: 5 }, { imputaciones: { some: { cargo: { usuarioId: 5 } } } }],
        },
      ],
    });
  });

  it('alcance GLOBAL: no agrega filtro de alcance', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7 });
    const service = new TesoreriaService({ pago: { findFirst } } as any);

    await service.obtenerReciboPago({ tipo: 'GLOBAL' }, 7);

    expect(findFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: 7 }] });
  });

  it('un pago fuera del alcance responde 404', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new TesoreriaService({ pago: { findFirst } } as any);

    await expect(service.obtenerReciboPago({ tipo: 'PROPIO', usuarioId: 5 }, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
