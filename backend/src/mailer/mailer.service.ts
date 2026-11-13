import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GuardarConfigCorreoDto } from './mailer.dto.js';

export interface DatosEmailBienvenida {
  destinatario: string;
  nombre: string;
  apellido: string;
  dni: string;
  claveTemporal?: string;
  unidadNombre?: string;
  rolNombre?: string;
}

export interface DatosEmailNuevaClave {
  destinatario: string;
  nombre: string;
  apellido: string;
  dni: string;
  claveTemporal: string;
}

export interface ConfiguracionCorreoPublica {
  habilitado: boolean;
  host: string;
  port: number;
  user: string;
  tienePassword: boolean;
  from: string;
  appUrl: string;
  fuente: 'db' | 'env' | 'sin_configurar';
}

interface ConfiguracionCorreoInterna {
  habilitado: boolean;
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  from?: string;
  appUrl: string;
  fuente: 'db' | 'env' | 'sin_configurar';
}

function escapeHtml(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizarAsuntoTextoPlano(text?: string | null): string {
  return String(text ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function validarHttpUrl(rawUrl?: string | null): string {
  const candidate = rawUrl?.trim();
  if (!candidate) return 'http://localhost:5173';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return candidate;
    }
  } catch {
    // Fallback a localhost por URL malformada
  }
  return 'http://localhost:5173';
}

function derivarClaveCifrado(): Buffer {
  return crypto.createHash('sha256').update(env.JWT_SECRET).digest();
}

function cifrarSecreto(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivarClaveCifrado(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function descifrarSecreto(payload?: string | null): string | undefined {
  if (!payload) return undefined;
  const parts = payload.split(':');
  if (parts.length !== 3) return undefined;
  try {
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      derivarClaveCifrado(),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return undefined;
  }
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private cachedTransporter: nodemailer.Transporter | null = null;
  private cachedConfigKey = '';

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private leerConfigEnv(): ConfiguracionCorreoInterna {
    const host = (env.SMTP_HOST ?? process.env.SMTP_HOST)?.trim() || undefined;
    const port = Number(env.SMTP_PORT || process.env.SMTP_PORT || 587);
    const user = (env.SMTP_USER ?? process.env.SMTP_USER)?.trim() || undefined;
    const pass = env.SMTP_PASS ?? process.env.SMTP_PASS ?? undefined;
    const from = (env.SMTP_FROM ?? process.env.SMTP_FROM)?.trim() || undefined;
    const appUrl = validarHttpUrl(process.env.APP_URL ?? env.APP_URL);
    const configurada = Boolean(host && user && pass);
    return {
      habilitado: true,
      host,
      port,
      user,
      pass,
      from,
      appUrl,
      fuente: configurada ? 'env' : 'sin_configurar',
    };
  }

  private async resolverConfiguracionActiva(): Promise<ConfiguracionCorreoInterna> {
    const fallbackEnv = this.leerConfigEnv();

    if (typeof this.prisma?.configuracionCorreo?.findUnique !== 'function') {
      return fallbackEnv;
    }

    try {
      const db = await this.prisma.configuracionCorreo.findUnique({ where: { id: 1 } });
      if (!db) return fallbackEnv;

      const dbHost = db.host?.trim() || undefined;
      const dbUser = db.user?.trim() || undefined;
      const dbPass = descifrarSecreto(db.passEncrypted);
      const dbFrom = db.from?.trim() || undefined;
      const dbAppUrl = db.appUrl?.trim() ? validarHttpUrl(db.appUrl) : fallbackEnv.appUrl;

      if (dbHost && dbUser && dbPass) {
        return {
          habilitado: db.habilitado,
          host: dbHost,
          port: db.port || 587,
          user: dbUser,
          pass: dbPass,
          from: dbFrom || fallbackEnv.from,
          appUrl: dbAppUrl,
          fuente: 'db',
        };
      }

      return {
        ...fallbackEnv,
        habilitado: db.habilitado,
        host: dbHost ?? fallbackEnv.host,
        port: db.port || fallbackEnv.port,
        user: dbUser ?? fallbackEnv.user,
        pass: dbPass ?? fallbackEnv.pass,
        from: dbFrom ?? fallbackEnv.from,
        appUrl: dbAppUrl,
      };
    } catch (err: any) {
      this.logger.warn(`No se pudo leer configuracion_correo de BD: ${err?.message || err}`);
      return fallbackEnv;
    }
  }

  private obtenerTransporter(config?: ConfiguracionCorreoInterna): nodemailer.Transporter | null {
    const resolved = config ?? this.leerConfigEnv();
    const host = resolved.host?.trim();
    const port = Number(resolved.port || 587);
    const user = resolved.user?.trim();
    const pass = resolved.pass;

    if (!resolved.habilitado || !host || !user || !pass) {
      return null;
    }

    const passDigest = crypto.createHash('sha256').update(pass).digest('hex').slice(0, 12);
    const configKey = `${host}:${port}:${user}:${passDigest}`;
    if (this.cachedTransporter && this.cachedConfigKey === configKey) {
      return this.cachedTransporter;
    }

    this.cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    this.cachedConfigKey = configKey;
    return this.cachedTransporter;
  }

  async estaDisponibleParaEnvio(): Promise<boolean> {
    const config = await this.resolverConfiguracionActiva();
    return Boolean(config.habilitado && config.host && config.user && config.pass);
  }

  async obtenerConfiguracionPublica(): Promise<ConfiguracionCorreoPublica> {
    const config = await this.resolverConfiguracionActiva();
    return {
      habilitado: config.habilitado,
      host: config.host ?? '',
      port: config.port,
      user: config.user ?? '',
      tienePassword: Boolean(config.pass),
      from: config.from ?? '',
      appUrl: config.appUrl,
      fuente: config.fuente,
    };
  }

  async guardarConfiguracion(dto: GuardarConfigCorreoDto): Promise<ConfiguracionCorreoPublica> {
    if (!this.prisma?.configuracionCorreo) {
      throw new BadRequestException('Servicio de base de datos no disponible');
    }

    const actual = await this.prisma.configuracionCorreo.findUnique({ where: { id: 1 } });
    const passEncrypted =
      dto.pass === null
        ? null
        : typeof dto.pass === 'string' && dto.pass.length > 0
          ? cifrarSecreto(dto.pass)
          : (actual?.passEncrypted ?? null);

    await this.prisma.configuracionCorreo.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        habilitado: dto.habilitado,
        host: dto.host ?? null,
        port: dto.port,
        user: dto.user ?? null,
        passEncrypted,
        from: dto.from ?? null,
        appUrl: dto.appUrl ?? null,
      },
      update: {
        habilitado: dto.habilitado,
        host: dto.host ?? null,
        port: dto.port,
        user: dto.user ?? null,
        passEncrypted,
        from: dto.from ?? null,
        appUrl: dto.appUrl ?? null,
      },
    });

    this.cachedTransporter = null;
    this.cachedConfigKey = '';
    return this.obtenerConfiguracionPublica();
  }

  async enviarCorreoPrueba(destinatario: string): Promise<{ ok: true; mensaje: string }> {
    const destino = destinatario.trim();
    const config = await this.resolverConfiguracionActiva();
    if (!config.habilitado) {
      throw new BadRequestException('El envío automático de correos está deshabilitado.');
    }

    const transporter = this.obtenerTransporter({ ...config, habilitado: true });
    if (!transporter) {
      throw new BadRequestException(
        'Falta configurar Servidor SMTP (host), Usuario o Contraseña SMTP antes de enviar un correo de prueba.',
      );
    }

    const remitente =
      config.from?.trim() ||
      `"Grupo Scout Juan XXIII" <${config.user ?? 'no-reply@scoutjuanxxiii.org'}>`;
    const html = this.renderizarPlantillaHtml(`
      <p style="margin-top: 0;">Este es un <strong>correo de prueba</strong> enviado desde la configuración de Scout App.</p>
      <p>Si recibiste este mensaje, el servidor SMTP está configurado correctamente para enviar contraseñas temporales y avisos de bienvenida.</p>
      <p style="font-size: 12px; color: #475569;">URL configurada: <code>${escapeHtml(config.appUrl)}</code></p>
    `);

    try {
      await transporter.sendMail({
        from: remitente,
        to: destino,
        subject: 'Grupo Scout Juan XXIII - Correo de prueba SMTP',
        html,
      });
      this.logger.log(`Correo de prueba enviado correctamente a ${destino}`);
      return {
        ok: true,
        mensaje: `Correo de prueba enviado correctamente a ${destino}.`,
      };
    } catch (err: any) {
      this.logger.warn(`Error enviando correo de prueba a ${destino}: ${err?.message || err}`);
      throw new BadRequestException(
        `No se pudo enviar el correo de prueba: ${err?.message || 'Error de conexión SMTP'}`,
      );
    }
  }

  private renderizarPlantillaHtml(contenidoHtml: string): string {
    return `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff; color: #0f172a;">
        <div style="background-color: #18181b; padding: 24px; text-align: center; border-bottom: 4px solid #eab308;">
          <div style="font-size: 28px; margin-bottom: 6px;">⚜</div>
          <h1 style="margin: 0; font-size: 20px; color: #facc15; font-weight: 800;">Grupo Scout Juan XXIII</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #d4d4d8;">Sistema de Gestión Institucional</p>
        </div>
        <div style="padding: 24px; line-height: 1.6; font-size: 14px;">
          ${contenidoHtml}
        </div>
        <div style="background-color: #f8fafc; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
          Siempre Listo • Grupo Scout San Juan XXIII
        </div>
      </div>
    `;
  }

  private async enviarCorreoHtml(params: {
    destinatario?: string | null;
    asunto: string;
    buildHtml: (appUrl: string) => string;
    contextoLog: string;
  }): Promise<boolean> {
    const destinatario = params.destinatario?.trim();
    if (!destinatario) return false;

    const config = await this.resolverConfiguracionActiva();
    if (!config.habilitado) {
      this.logger.log(`[Correo deshabilitado] Se omitió ${params.contextoLog} para ${destinatario}.`);
      return false;
    }

    const transporter = this.obtenerTransporter(config);
    if (!transporter) {
      this.logger.log(
        `[SMTP no configurado] ${params.contextoLog} preparado para ${destinatario}. Configure SMTP en Panel de Gestión o en variables de entorno.`,
      );
      return false;
    }

    const remitente =
      config.from?.trim() ||
      `"Grupo Scout Juan XXIII" <${config.user ?? 'no-reply@scoutjuanxxiii.org'}>`;
    const html = params.buildHtml(escapeHtml(config.appUrl));

    try {
      await transporter.sendMail({
        from: remitente,
        to: destinatario,
        subject: params.asunto,
        html,
      });
      this.logger.log(`${params.contextoLog} enviado a ${destinatario}`);
      return true;
    } catch (err: any) {
      this.logger.warn(
        `No se pudo enviar ${params.contextoLog} a ${destinatario}: ${err?.message || err}`,
      );
      return false;
    }
  }

  async enviarBienvenidaAlta(datos: DatosEmailBienvenida): Promise<boolean> {
    const safeNombre = escapeHtml(datos.nombre);
    const safeApellido = escapeHtml(datos.apellido);
    const safeUnidad = escapeHtml(datos.unidadNombre);
    const safeRol = escapeHtml(datos.rolNombre);
    const safeDni = escapeHtml(datos.dni);
    const safeClaveTemporal = datos.claveTemporal ? escapeHtml(datos.claveTemporal) : null;

    const asunto = `¡Bienvenido/a al Grupo Scout Juan XXIII! - Alta de ${sanitizarAsuntoTextoPlano(datos.nombre)} ${sanitizarAsuntoTextoPlano(datos.apellido)}`;

    return this.enviarCorreoHtml({
      destinatario: datos.destinatario,
      asunto,
      contextoLog: `Correo de bienvenida (DNI ${datos.dni})`,
      buildHtml: (appUrl) =>
        this.renderizarPlantillaHtml(`
          <p style="margin-top: 0;">¡Hola <strong>${safeNombre} ${safeApellido}</strong> (y familia)!</p>
          <p>Te informamos que se ha registrado tu alta en el padrón oficial del <strong>Grupo Scout Juan XXIII</strong>${
            safeUnidad ? ` en la sección <strong>${safeUnidad}</strong>` : ''
          }${safeRol ? ` (${safeRol})` : ''}.</p>
          
          <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 12px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #854d0e; font-size: 13px; text-transform: uppercase;">Tus credenciales de ingreso:</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Usuario (DNI):</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${safeDni}</code></p>
            ${
              safeClaveTemporal
                ? `<p style="margin: 4px 0; font-size: 14px;"><strong>Contraseña temporal inicial:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${safeClaveTemporal}</code></p>`
                : `<p style="margin: 4px 0; font-size: 14px;"><strong>Contraseña temporal inicial:</strong> solicitá la clave generada al momento del alta a tu educador/a.</p>`
            }
          </div>

          <p style="font-size: 13px; color: #475569;">Al ingresar por primera vez, el sistema te solicitará elegir una contraseña personal segura. Desde la aplicación podrás completar tu ficha médica anual y consultar el estado de tus cuotas.</p>

          <div style="text-align: center; margin: 24px 0 12px;">
            <a href="${appUrl}" style="display: inline-block; background-color: #eab308; color: #09090b; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 14px;">Ingresar a la Plataforma</a>
          </div>
        `),
    });
  }

  /** Envía por correo la nueva contraseña temporal generada al restablecer la clave de un usuario. */
  async enviarNuevaClaveTemporal(datos: DatosEmailNuevaClave): Promise<boolean> {
    const safeNombre = escapeHtml(datos.nombre);
    const safeApellido = escapeHtml(datos.apellido);
    const safeDni = escapeHtml(datos.dni);
    const safeClaveTemporal = escapeHtml(datos.claveTemporal);

    const asunto = `Grupo Scout Juan XXIII - Nueva contraseña temporal para ${sanitizarAsuntoTextoPlano(datos.nombre)} ${sanitizarAsuntoTextoPlano(datos.apellido)}`;

    return this.enviarCorreoHtml({
      destinatario: datos.destinatario,
      asunto,
      contextoLog: `Correo de nueva clave temporal (DNI ${datos.dni})`,
      buildHtml: (appUrl) =>
        this.renderizarPlantillaHtml(`
          <p style="margin-top: 0;">¡Hola <strong>${safeNombre} ${safeApellido}</strong>!</p>
          <p>Se generó una nueva contraseña temporal para tu cuenta en el sistema del <strong>Grupo Scout Juan XXIII</strong>.</p>

          <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 12px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #854d0e; font-size: 13px; text-transform: uppercase;">Tus nuevas credenciales de ingreso:</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Usuario (DNI):</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${safeDni}</code></p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Nueva contraseña temporal:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${safeClaveTemporal}</code></p>
          </div>

          <p style="font-size: 13px; color: #475569;">Al iniciar sesión con esta clave temporal, el sistema te pedirá definir una nueva contraseña personal.</p>

          <div style="text-align: center; margin: 24px 0 12px;">
            <a href="${appUrl}" style="display: inline-block; background-color: #eab308; color: #09090b; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 14px;">Ingresar a la Plataforma</a>
          </div>
        `),
    });
  }
}
