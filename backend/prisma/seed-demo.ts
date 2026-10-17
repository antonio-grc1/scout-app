import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const lobatos = await prisma.unidadOrganizativa.findFirstOrThrow({
    where: { nombre: { in: ['Rama Lobatos', 'Lobatos'] } },
  });
  const brochero = await prisma.unidadOrganizativa.findFirstOrThrow({
    where: { nombre: { in: ['Rama Scout Cura Brochero', 'Unidad Scout Cura Brochero'] } },
  });
  const inakayal = await prisma.unidadOrganizativa.findFirstOrThrow({
    where: { nombre: { in: ['Rama Scout Inakayal', 'Unidad Scout Inakayal'] } },
  });
  const caminante = await prisma.unidadOrganizativa.findFirstOrThrow({
    where: { nombre: { in: ['Rama Caminantes', 'Caminante'] } },
  });
  const rover = await prisma.unidadOrganizativa.findFirstOrThrow({
    where: { nombre: { in: ['Rama Rovers', 'Rover'] } },
  });
  const jefatura = await prisma.unidadOrganizativa.findFirstOrThrow({ where: { nombre: 'Jefatura de Grupo' } });

  const rolEdu = await prisma.rol.findFirstOrThrow({
    where: { nombre: { in: ['Educador de Rama', 'Educador de Unidad'] } },
  });
  const rolProta = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Protagonista' } });
  const rolJefe = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'Jefe de Grupo' } });

  const hashComun = await bcrypt.hash('scout2026', 10);

  // Familias demo
  let familiaGomez = await prisma.grupoFamiliar.findFirst({ where: { nombreFamilia: 'Familia Gómez' } });
  if (!familiaGomez) {
    familiaGomez = await prisma.grupoFamiliar.create({
      data: { nombreFamilia: 'Familia Gómez', porcentajeDescuentoHermanos: 20.00 },
    });
  }

  // Lista de miembros a asegurar en cada rama y sección
  const miembrosDemo = [
    // --- RAMA LOBATOS (7-9 años) ---
    {
      dni: '20333444', nombre: 'Laura', apellido: 'Baloo', rol: rolEdu, unidad: lobatos,
      nac: '1989-08-15', email: 'baloo@juanxxiii.org', tel: '11-4433-2211', fijos: { domicilio: 'Belgrano 450, Ramos Mejía' }
    },
    {
      dni: '48111222', nombre: 'Tomasito', apellido: 'Pérez', rol: rolProta, unidad: lobatos,
      nac: '2017-06-10', email: 'padres.perez@gmail.com', tel: '11-5544-3322', fijos: { domicilio: 'San Martín 120, Morón', obra_social: 'IOMA' }
    },
    // --- RAMA SCOUT CURA BROCHERO (10-13 años) ---
    {
      dni: '20111222', nombre: 'Carlos', apellido: 'Akela', rol: rolEdu, unidad: brochero,
      nac: '1985-04-12', email: 'akela@juanxxiii.org', tel: '11-4567-8901', fijos: { domicilio: 'Mitre 890, Morón' }
    },
    {
      dni: '45123456', nombre: 'Santiago', apellido: 'Gómez', rol: rolProta, unidad: brochero,
      nac: '2013-05-10', email: 'padres.gomez@gmail.com', tel: '11-2345-6789', fijos: { domicilio: 'Calle Falsa 123, Morón', obra_social: 'OSDE 210' },
      grupoFamiliarId: familiaGomez.id
    },
    {
      dni: '46000111', nombre: 'Lucía', apellido: 'Fernández', rol: rolProta, unidad: brochero,
      nac: '2012-02-15', email: 'padres.fernandez@gmail.com', tel: '11-3322-1100', fijos: { domicilio: 'Av. Rivadavia 14200', obra_social: 'Swiss Medical' }
    },
    // --- RAMA SCOUT INAKAYAL (10-13 años) ---
    {
      dni: '20555666', nombre: 'Mariana', apellido: 'Bagheera', rol: rolEdu, unidad: inakayal,
      nac: '1991-03-22', email: 'bagheera@juanxxiii.org', tel: '11-6655-4433', fijos: { domicilio: 'Colón 340, Castelar' }
    },
    {
      dni: '47222333', nombre: 'Martín', apellido: 'Gómez', rol: rolProta, unidad: inakayal, // Hermano de Santiago en otra rama!
      nac: '2014-11-04', email: 'padres.gomez@gmail.com', tel: '11-2345-6789', fijos: { domicilio: 'Calle Falsa 123, Morón', obra_social: 'OSDE 210' },
      grupoFamiliarId: familiaGomez.id
    },
    {
      dni: '47333444', nombre: 'Joaquín', apellido: 'Sosa', rol: rolProta, unidad: inakayal,
      nac: '2013-09-18', email: 'padres.sosa@gmail.com', tel: '11-7788-9900', fijos: { domicilio: 'Lavalle 780, Castelar', obra_social: 'Medifé' }
    },
    // --- CAMINANTES (14-17 años) ---
    {
      dni: '20777888', nombre: 'Facundo', apellido: 'Guía', rol: rolEdu, unidad: caminante,
      nac: '1993-12-01', email: 'facundo@juanxxiii.org', tel: '11-8899-0011', fijos: { domicilio: 'Caseros 650, Haedo' }
    },
    {
      dni: '44333222', nombre: 'Sofía', apellido: 'Romero', rol: rolProta, unidad: caminante,
      nac: '2010-07-25', email: 'sofia.romero@gmail.com', tel: '11-1234-5678', fijos: { domicilio: 'Güemes 1120, Haedo', obra_social: 'Galeno' }
    },
    // --- ROVERS (18-21 años) ---
    {
      dni: '20999000', nombre: 'Gonzalo', apellido: 'Rover Scout', rol: rolEdu, unidad: rover,
      nac: '1990-05-30', email: 'gonzalo@juanxxiii.org', tel: '11-9900-1122', fijos: { domicilio: 'Estrada 230, Morón' }
    },
    {
      dni: '42111000', nombre: 'Franco', apellido: 'Díaz', rol: rolProta, unidad: rover,
      nac: '2006-03-14', email: 'franco.diaz@gmail.com', tel: '11-5678-9012', fijos: { domicilio: 'Sarmiento 940, Morón', obra_social: 'OSDE 310' }
    },
  ];

  for (const m of miembrosDemo) {
    let u = await prisma.usuario.findUnique({ where: { dni: m.dni } });
    if (!u) {
      await prisma.usuario.create({
        data: {
          dni: m.dni,
          nombre: m.nombre,
          apellido: m.apellido,
          fechaNacimiento: new Date(m.nac),
          passwordHash: hashComun,
          requiereCambioClave: false,
          emailContacto: m.email,
          telefonoContacto: m.tel,
          grupoFamiliarId: m.grupoFamiliarId ?? null,
          datosFijosJson: m.fijos,
          asignaciones: {
            create: {
              unidadId: m.unidad.id,
              rolId: m.rol.id,
              cicloAnio: 2026,
            },
          },
        },
      });
      console.log(`👤 Creado ${m.rol.nombre}: ${m.nombre} ${m.apellido} en ${m.unidad.nombre}`);
    }
  }

  console.log('✅ Base de datos poblada con Educadores y Protagonistas en todas las ramas');
}

main().finally(() => prisma.$disconnect());
