import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoEntrega, type Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { esRolEducadorEfectivo, filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { anioActual, calcularEdad } from '../common/utils/fechas.util.js';
import {
  CLAVES_FAMILIARES_CONTACTO_COMPARTIBLES,
  sanitizarJsonPlano,
} from '../common/utils/plantillas.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CrearPlantillaDto,
  EditarPlantillaDto,
  GuardarEntregaDto,
  ListarEntregasQueryDto,
} from './legajos.dto.js';

export const CAMPOS_DATOS_FIJOS_PERMITIDOS = new Set([
  'protagonista_domicilio',
  'protagonista_telefono',
  'obra_social',
  'obra_social_afiliado',
  'religion',
  'ocupacion_estudios',
  'profesion_ocupacion',
  'nivel_formacion_scout',
  'posee_licencia_conducir',
  'menor_nacionalidad',
  'grupo_sanguineo',
  'factor_rh',
  'alergias',
  'alergias_detalle',
  'enfermedades_cronicas',
  'enfermedades_cronicas_detalle',
  'medicacion_habitual',
  'medicacion_habitual_detalle',
  'tratamientos_actuales',
  'dieta_especial',
  'dieta_especial_detalle',
  'vacunas_completas',
  'observaciones_medicas',
  'telefono_urgencias_medicas',
  'medico_cabecera_nombre',
  'medico_cabecera_telefono',
  'emergencia_nombre',
  'emergencia_vinculo',
  'emergencia_telefono',
  'madre_nombres',
  'madre_telefono',
  'madre_profesion',
  'padre_nombres',
  'padre_telefono',
  'padre_profesion',
  'tutor_nombres',
  'tutor_telefono',
  'tutor_vinculo',
]);

export const CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR = new Set<string>(
  CLAVES_FAMILIARES_CONTACTO_COMPARTIBLES,
);

export function calcularHashVerificacion(
  usuarioId: number,
  plantillaId: number,
  cicloAnio: number,
  versionImpresion: number,
  respuestas: Record<string, unknown>,
): string {
  const payload = JSON.stringify({
    u: usuarioId,
    p: plantillaId,
    c: cicloAnio,
    v: versionImpresion,
    r: respuestas,
    salt: crypto.randomBytes(8).toString('hex'),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

@Injectable()
export class LegajosService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Plantillas ----------------
  async listarPlantillas(alcance?: AlcanceAcceso, incluirInactivas = false, cicloAnio?: number) {
    const puedeVerInactivas = incluirInactivas && alcance?.tipo === 'GLOBAL';
    return this.prisma.plantillaFormulario.findMany({
      where: {
        ...(puedeVerInactivas ? {} : { activa: true }),
        ...(cicloAnio ? { cicloAnio } : {}),
      },
      orderBy: [{ cicloAnio: 'desc' }, { id: 'asc' }],
    });
  }

  async obtenerPlantilla(id: number) {
    const plantilla = await this.prisma.plantillaFormulario.findUnique({ where: { id } });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
    return plantilla;
  }

  async crearPlantilla(alcance: AlcanceAcceso, dto: CrearPlantillaDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Gestionar plantillas requiere alcance global');
    }
    return this.prisma.plantillaFormulario.create({
      data: {
        codigo: dto.codigo,
        titulo: dto.titulo,
        version: dto.version,
        cicloAnio: dto.cicloAnio,
        esquemaCamposJson: dto.esquemaCamposJson as Prisma.InputJsonObject,
        mapeoPdfJson: dto.mapeoPdfJson as Prisma.InputJsonObject,
        activa: dto.activa,
      },
    });
  }

  async editarPlantilla(alcance: AlcanceAcceso, id: number, dto: EditarPlantillaDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Gestionar plantillas requiere alcance global');
    }
    const actual = await this.prisma.plantillaFormulario.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Plantilla no encontrada');
    return this.prisma.plantillaFormulario.update({
      where: { id },
      data: {
        codigo: dto.codigo,
        titulo: dto.titulo,
        version: dto.version,
        cicloAnio: dto.cicloAnio,
        esquemaCamposJson: dto.esquemaCamposJson ? (dto.esquemaCamposJson as Prisma.InputJsonObject) : undefined,
        mapeoPdfJson: dto.mapeoPdfJson ? (dto.mapeoPdfJson as Prisma.InputJsonObject) : undefined,
        activa: dto.activa,
      },
    });
  }

  // ---------------- Precarga de Formulario ----------------
  /**
   * Obtiene los datos fijos del usuario y la última entrega (si existe) para que
   * el cliente arme el formulario dinámico con los valores prellenados.
   */
  async obtenerDatosPrecarga(alcance: AlcanceAcceso, usuarioId: number, plantillaId: number, cicloAnio: number) {
    if (!Number.isInteger(cicloAnio) || cicloAnio < 2000 || cicloAnio > 2100) {
      throw new BadRequestException('Ciclo anual inválido');
    }
    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        fechaNacimiento: true,
        emailContacto: true,
        telefonoContacto: true,
        datosFijosJson: true,
        grupoFamiliar: { select: { id: true, nombreFamilia: true } },
        asignaciones: {
          where: { activo: true },
          select: {
            unidad: { select: { id: true, nombre: true } },
            rol: { select: { id: true, nombre: true, tipoMiembro: true, alcancePorDefecto: true } },
          },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado en su alcance');

    const plantilla = await this.prisma.plantillaFormulario.findUnique({ where: { id: plantillaId } });
    if (!plantilla || !plantilla.activa) throw new NotFoundException('Plantilla inexistente o inactiva');

    const ultimaEntrega = await this.prisma.entregaFormulario.findFirst({
      where: { usuarioId, plantillaId, cicloAnio },
      orderBy: { id: 'desc' },
      include: {
        validadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });

    const edad = calcularEdad(usuario.fechaNacimiento);
    const esMenor = edad < 18;
    const esEducador = usuario.asignaciones.some((a) => esRolEducadorEfectivo(a.rol));

    let datosFamiliaresSugeridos: Record<string, unknown> = {};
    if (usuario.grupoFamiliar) {
      const hermanos = await this.prisma.usuario.findMany({
        where: {
          grupoFamiliarId: usuario.grupoFamiliar.id,
          id: { not: usuario.id },
        },
        select: { datosFijosJson: true },
        take: 5,
      });
      for (const h of hermanos) {
        if (h.datosFijosJson && typeof h.datosFijosJson === 'object') {
          const obj = h.datosFijosJson as Record<string, unknown>;
          for (const [k, v] of Object.entries(obj)) {
            if (CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has(k) && !(k in datosFamiliaresSugeridos)) {
              datosFamiliaresSugeridos[k] = v;
            }
          }
        }
      }
    }

    return {
      usuario,
      plantilla,
      ultimaEntrega,
      edad,
      esMenor,
      esEducador,
      datosFamiliaresSugeridos,
    };
  }

  // ---------------- Guardado / Snapshot de Entrega ----------------
  async guardarEntrega(actor: AuthUser, alcance: AlcanceAcceso, dto: GuardarEntregaDto) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: dto.usuarioId }, filtroUsuariosPorAlcance(alcance)] },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado en su alcance');
    if (!usuario.activo) {
      throw new BadRequestException('No se pueden gestionar legajos para un miembro inactivo o dado de baja');
    }

    const plantilla = await this.prisma.plantillaFormulario.findUnique({ where: { id: dto.plantillaId } });
    if (!plantilla || !plantilla.activa) throw new BadRequestException('Plantilla no encontrada o inactiva');

    const edad = calcularEdad(usuario.fechaNacimiento);

    if (plantilla.codigo.startsWith('LEGAJO_MENORES_') && edad >= 18) {
      throw new BadRequestException(
        'La plantilla de Menores es exclusiva para menores de 18 años. Debe completar la plantilla de Rovers o Educadores.',
      );
    }
    if (plantilla.codigo.startsWith('LEGAJO_ROVERS_') && edad < 18) {
      throw new BadRequestException(
        'La plantilla Rover es exclusivamente para miembros mayores de edad.',
      );
    }
    if (plantilla.codigo.startsWith('LEGAJO_EDUCADORES_') && edad < 18) {
      throw new BadRequestException(
        'La plantilla de Educadores es para dirigentes y educadores adultos.',
      );
    }

    // Sanitizar respuestas eliminando propiedades de prototipo recursivamente
    const respuestasSanitizadas = sanitizarJsonPlano(dto.respuestas);

    return this.prisma.$transaction(async (tx) => {
      const entregaActual = await tx.entregaFormulario.findFirst({
        where: { usuarioId: dto.usuarioId, plantillaId: dto.plantillaId, cicloAnio: dto.cicloAnio },
        orderBy: { id: 'desc' },
      });

      let estado: EstadoEntrega = EstadoEntrega.BORRADOR;
      let versionImpresion = entregaActual ? entregaActual.versionImpresion : 1;
      let fechaGeneracionPdf = entregaActual?.fechaGeneracionPdf ?? null;
      let fechaValidacionFisica = entregaActual?.fechaValidacionFisica ?? null;
      let validadoPorUsuarioId = entregaActual?.validadoPorUsuarioId ?? null;

      if (dto.finalizarParaFirma) {
        // Al finalizar para firma, se pasa a PENDIENTE_FIRMA_FISICA
        estado = EstadoEntrega.PENDIENTE_FIRMA_FISICA;
        fechaGeneracionPdf = new Date();
        fechaValidacionFisica = null;
        validadoPorUsuarioId = null;
        if (entregaActual && entregaActual.estado !== EstadoEntrega.BORRADOR) {
          versionImpresion = entregaActual.versionImpresion + 1;
        }
      } else {
        // Si no se pide finalizar para firma:
        if (entregaActual) {
          if (entregaActual.estado === EstadoEntrega.VALIDADO_FISICAMENTE) {
            // Edición post-validación: la copia física previa queda desactualizada
            estado = EstadoEntrega.DESACTUALIZADO_REQUIERE_REIMPRESION;
            versionImpresion = entregaActual.versionImpresion + 1;
          } else if (entregaActual.estado === EstadoEntrega.PENDIENTE_FIRMA_FISICA) {
            // Edición en borrador luego de haber emitido QR para firma: invalidar la impresión anterior
            estado = EstadoEntrega.BORRADOR;
            versionImpresion = entregaActual.versionImpresion + 1;
            fechaGeneracionPdf = null;
          } else {
            estado = entregaActual.estado;
          }
        } else {
          estado = EstadoEntrega.BORRADOR;
        }
      }

      const hashVerificacion = calcularHashVerificacion(
        dto.usuarioId,
        dto.plantillaId,
        dto.cicloAnio,
        versionImpresion,
        respuestasSanitizadas,
      );

      const dataToSave = {
        usuarioId: dto.usuarioId,
        plantillaId: dto.plantillaId,
        cicloAnio: dto.cicloAnio,
        versionImpresion,
        respuestasSnapshotJson: respuestasSanitizadas as Prisma.InputJsonObject,
        hashVerificacion,
        estado,
        fechaGeneracionPdf,
        fechaValidacionFisica,
        validadoPorUsuarioId,
      };

      const entrega = entregaActual
        ? await tx.entregaFormulario.update({
            where: { id: entregaActual.id },
            data: dataToSave,
            include: {
              plantilla: { select: { id: true, codigo: true, titulo: true } },
              usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            },
          })
        : await tx.entregaFormulario.create({
            data: dataToSave,
            include: {
              plantilla: { select: { id: true, codigo: true, titulo: true } },
              usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            },
          });

      // Si se pidió actualizar datos fijos, sincronizar únicamente campos permitidos
      if (dto.actualizarDatosFijos) {
        const datosActuales = (usuario.datosFijosJson ?? {}) as Record<string, unknown>;
        const filtrados: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(respuestasSanitizadas)) {
          if (CAMPOS_DATOS_FIJOS_PERMITIDOS.has(k)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
              filtrados[k] = v;
            }
          }
        }
        const nuevosDatos = { ...datosActuales, ...filtrados };
        await tx.usuario.update({
          where: { id: usuario.id },
          data: { datosFijosJson: nuevosDatos as Prisma.InputJsonObject },
        });
      }

      return entrega;
    });
  }

  // ---------------- Listado de Entregas ----------------
  async listarEntregas(alcance: AlcanceAcceso, q: ListarEntregasQueryDto) {
    const where: Prisma.EntregaFormularioWhereInput = {
      AND: [
        { usuario: filtroUsuariosPorAlcance(alcance) },
        q.usuarioId ? { usuarioId: q.usuarioId } : {},
        q.plantillaId ? { plantillaId: q.plantillaId } : {},
        q.cicloAnio ? { cicloAnio: q.cicloAnio } : {},
        q.estado ? { estado: q.estado } : {},
        q.unidadId
          ? {
              usuario: {
                asignaciones: { some: { activo: true, unidadId: q.unidadId } },
              },
            }
          : {},
      ],
    };

    return this.prisma.entregaFormulario.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      take: 500,
      include: {
        plantilla: { select: { id: true, codigo: true, titulo: true } },
        usuario: { select: { id: true, dni: true, nombre: true, apellido: true } },
        validadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });
  }

  // ---------------- Verificación y Validación de QR ----------------
  /**
   * Consulta pública o semi-pública para cuando el educador escanea el QR.
   * Devuelve los datos del legajo asociado al hash para confirmar visualmente.
   */
  private async resolverEntregaPorCodigo(
    codigoRaw: string,
    opciones: { permitirPrefijo?: boolean; permitirDni?: boolean } = {},
  ) {
    const limpio = codigoRaw
      .trim()
      .replace(/^verif:\s*/i, '')
      .replace(/^c[oó]digo:\s*/i, '')
      .replace(/\.\.\.$/, '')
      .trim();

    if (!limpio) return null;

    const selectDetalle = {
      id: true,
      cicloAnio: true,
      estado: true,
      hashVerificacion: true,
      fechaValidacionFisica: true,
      plantillaId: true,
      usuarioId: true,
      validadoPorUsuarioId: true,
      updatedAt: true,
      plantilla: { select: { id: true, codigo: true, titulo: true, version: true } },
      usuario: {
        select: {
          id: true,
          dni: true,
          nombre: true,
          apellido: true,
          activo: true,
          asignaciones: {
            where: { activo: true },
            select: { unidadId: true, unidad: { select: { id: true, nombre: true } } },
          },
        },
      },
      validadoPor: { select: { id: true, nombre: true, apellido: true } },
    };

    const exacta = await this.prisma.entregaFormulario.findFirst({
      where: { hashVerificacion: { equals: limpio, mode: 'insensitive' } },
      select: selectDetalle,
    });
    if (exacta) return exacta;

    if (opciones.permitirPrefijo !== false && limpio.length >= 6 && /^[0-9a-f]+$/i.test(limpio)) {
      if (this.prisma.entregaFormulario.findMany) {
        const coincidencias = await this.prisma.entregaFormulario.findMany({
          where: { hashVerificacion: { startsWith: limpio, mode: 'insensitive' } },
          orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
          take: 2,
          select: selectDetalle,
        });
        if (coincidencias.length > 1) {
          throw new ConflictException('Código parcial ambiguo; ingresá el código completo o más caracteres');
        }
        if (coincidencias.length === 1) return coincidencias[0];
      } else {
        const porPrefijo = await this.prisma.entregaFormulario.findFirst({
          where: { hashVerificacion: { startsWith: limpio, mode: 'insensitive' } },
          orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
          select: selectDetalle,
        });
        if (porPrefijo) return porPrefijo;
      }
    }

    const soloDigitos = limpio.replace(/\D/g, '');
    if (
      opciones.permitirDni !== false &&
      soloDigitos.length >= 6 &&
      soloDigitos.length <= 10 &&
      /^\d+$/.test(limpio.replace(/\./g, ''))
    ) {
      const porDni = await this.prisma.entregaFormulario.findFirst({
        where: { usuario: { dni: soloDigitos } },
        orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
        select: selectDetalle,
      });
      if (porDni) return porDni;
    }

    return null;
  }

  async verificarQr(alcance: AlcanceAcceso, hashVerificacion: string) {
    const entrega = await this.resolverEntregaPorCodigo(hashVerificacion);
    if (!entrega) throw new NotFoundException('Comprobante QR no válido o inexistente');

    if (alcance.tipo === 'UNIDAD') {
      const unidadesUsuario = entrega.usuario.asignaciones.map((a) => a.unidadId);
      const enAlcance = unidadesUsuario.some((uId) => alcance.unidadIds.includes(uId));
      if (!enAlcance && entrega.usuario.id !== alcance.usuarioIdPropio) {
        throw new ForbiddenException('La ficha consultada pertenece a un miembro fuera de su unidad');
      }
    } else if (alcance.tipo === 'PROPIO') {
      if (entrega.usuario.id !== alcance.usuarioId) {
        throw new ForbiddenException('No tiene permisos para ver fichas de otros miembros');
      }
    }

    return entrega;
  }

  /**
   * El educador valida físicamente que la firma en papel coincide con el QR escaneado.
   */
  async validarFisico(actor: AuthUser, alcance: AlcanceAcceso, hashVerificacion: string) {
    // La validación física exige coincidencia exacta del código de verificación (no por DNI ni prefijo ambiguo).
    const entrega = await this.resolverEntregaPorCodigo(hashVerificacion, {
      permitirPrefijo: false,
      permitirDni: false,
    });
    if (!entrega) throw new NotFoundException('Ficha no encontrada para ese código QR');

    // Comprobar alcance sobre el usuario dueño de la ficha
    if (alcance.tipo === 'UNIDAD') {
      const unidadesUsuario = entrega.usuario.asignaciones.map((a) => a.unidadId);
      const perteneceAUnidad = unidadesUsuario.some((uId) => alcance.unidadIds.includes(uId));
      if (!perteneceAUnidad) {
        throw new ForbiddenException('La ficha pertenece a un miembro fuera de su unidad');
      }
    } else if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para validar físicamente fichas');
    }

    if (!entrega.usuario.activo) {
      throw new BadRequestException('No se puede validar físicamente la ficha de un miembro inactivo o dado de baja');
    }

    if (!entrega.usuario.asignaciones || entrega.usuario.asignaciones.length === 0) {
      throw new BadRequestException('El miembro no posee ninguna unidad o asignación activa en el grupo');
    }

    if (entrega.estado === EstadoEntrega.VALIDADO_FISICAMENTE) {
      throw new ConflictException('Esta ficha ya fue validada físicamente con anterioridad');
    }

    if (entrega.estado === EstadoEntrega.DESACTUALIZADO_REQUIERE_REIMPRESION) {
      throw new BadRequestException(
        'Esta impresión física está desactualizada. El miembro editó sus datos con posterioridad y debe presentar una nueva copia impresa.',
      );
    }

    if (entrega.estado === EstadoEntrega.BORRADOR) {
      throw new BadRequestException('Esta ficha aún está en estado BORRADOR y no fue finalizada para firma');
    }

    const dataValidacion = {
      estado: EstadoEntrega.VALIDADO_FISICAMENTE,
      fechaValidacionFisica: new Date(),
      validadoPorUsuarioId: actor.sub,
    };
    const includeValidacion = {
      plantilla: { select: { id: true, titulo: true } },
      usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
      validadoPor: { select: { id: true, nombre: true, apellido: true } },
    };

    // Transición atómica condicional: evita validar una ficha editada o validada concurrentemente.
    if (this.prisma.entregaFormulario.updateMany && this.prisma.entregaFormulario.findUniqueOrThrow) {
      const updated = await this.prisma.entregaFormulario.updateMany({
        where: { id: entrega.id, estado: EstadoEntrega.PENDIENTE_FIRMA_FISICA },
        data: dataValidacion,
      });
      if (updated.count !== 1) {
        throw new ConflictException('La ficha cambió de estado o ya fue validada por otro proceso');
      }
      return this.prisma.entregaFormulario.findUniqueOrThrow({
        where: { id: entrega.id },
        include: includeValidacion,
      });
    }

    return this.prisma.entregaFormulario.update({
      where: { id: entrega.id },
      data: dataValidacion,
      include: includeValidacion,
    });
  }

  // ---------------- Relevamiento de Colaboradores Adultos y Materiales ----------------
  async listarColaboradoresAdultos(alcance: AlcanceAcceso, cicloAnio = anioActual()) {
    if (!Number.isInteger(cicloAnio) || cicloAnio < 2000 || cicloAnio > 2100) {
      throw new BadRequestException('Ciclo anual inválido');
    }
    const entregas = await this.prisma.entregaFormulario.findMany({
      where: {
        cicloAnio,
        usuario: filtroUsuariosPorAlcance(alcance),
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            telefonoContacto: true,
            emailContacto: true,
            asignaciones: {
              where: { activo: true },
              select: { unidad: { select: { id: true, nombre: true } } },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    const colaboradores = [];
    for (const ent of entregas) {
      const resp = (ent.respuestasSnapshotJson as Record<string, any>) || {};
      if (resp.completar_ficha_adultos) {
        colaboradores.push({
          entregaId: ent.id,
          estado: ent.estado,
          protagonista: {
            id: ent.usuario.id,
            nombre: ent.usuario.nombre,
            apellido: ent.usuario.apellido,
            dni: ent.usuario.dni,
            unidad: ent.usuario.asignaciones[0]?.unidad?.nombre ?? 'Sin Asignación',
          },
          adulto: {
            nombre: resp.adulto_nombre || `${resp.madre_nombres || resp.padre_nombres || 'Adulto Colaborador'}`,
            profesion: resp.adulto_profesion || resp.madre_profesion || resp.padre_profesion || '-',
            telefono: resp.adulto_telefono || resp.madre_telefono || resp.padre_telefono || ent.usuario.telefonoContacto,
            preferenciaTrabajo: resp.adulto_preferencia_trabajo || 'Indistinto',
            observaciones: resp.adulto_observaciones || '-',
          },
          areas: {
            servicioComunitario: !!resp.colab_servicio_comunitario,
            fotocopias: !!resp.colab_fotocopias,
            manoObra: !!resp.colab_mano_obra,
            administrativo: !!resp.colab_administrativo,
            transporte: !!resp.colab_transporte,
            camion: !!resp.colab_camion,
            camioneta: !!resp.colab_camioneta,
            colectivo: !!resp.colab_colectivo,
            recaudacionFondos: !!resp.colab_recaudacion_fondos,
            campamento: !!resp.colab_campamento,
            cocinaCampamento: !!resp.colab_cocina_campamento,
            ensenando: !!resp.colab_ensenando,
            mostrandoTrabajo: !!resp.colab_mostrando_trabajo,
            alimentos: !!resp.colab_alimentos_no_perecederos,
            tareasEspeciales: !!resp.colab_tareas_especiales,
            otros: !!resp.colab_otros,
            otrosDetalle: resp.colab_otros_detalle || '',
          },
          materiales: {
            construccionPrestamo: resp.mat_construccion_prestamo || '',
            construccionDonacion: resp.mat_construccion_donacion || '',
            campamentoPrestamo: resp.mat_campamento_prestamo || '',
            campamentoDonacion: resp.mat_campamento_donacion || '',
          },
        });
      }
    }
    return colaboradores;
  }
}
