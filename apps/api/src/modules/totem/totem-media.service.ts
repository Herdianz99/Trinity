import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TotemMediaKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { StartTotemUploadDto, TotemUploadChunkDto } from './dto/totem.dto';
// sharp 0.35 tipa la funcion como default export; bajo CommonJS se usa require (igual que product-images).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp') as typeof import('sharp').default;

// Pantalla del totem: TV de 32" vertical (1080x1920).
const MAX_W = 1080;
const MAX_H = 1920;
const THUMB_W = 360;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 125; // "2 minutos" con un margen
const UPLOAD_TTL_MS = 24 * 3600 * 1000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface UploadMeta {
  fileName: string;
  mimeType: string;
  kind: TotemMediaKind;
  size: number;
  received: number;
  nextIndex: number;
  createdById: string | null;
  createdAt: number;
}

/**
 * Archivos del totem. La subida va por pedazos en base64 (el proxy de Next reenvia el cuerpo como texto y el
 * API acepta JSON de 15 MB), se arma en una carpeta temporal y se procesa en segundo plano, de a uno:
 *  - imagen -> WebP de maximo 1080x1920 + miniatura;
 *  - video  -> ffmpeg con prioridad baja (nice 19, 2 hilos): H.264 CRF 22, maximo 1080x1920, AAC, +faststart.
 * Se guarda en Spaces (carpeta totem/) con cache inmutable para que el TV no lo vuelva a descargar.
 */
@Injectable()
export class TotemMediaService implements OnModuleInit {
  private readonly logger = new Logger(TotemMediaService.name);
  private readonly root = path.join(os.tmpdir(), 'trinity-totem-uploads');
  private queue: Promise<void> = Promise.resolve();

  constructor(private prisma: PrismaService, private spaces: SpacesService) {}

  // Si el API se reinicio a mitad de un procesado, ese archivo nunca va a terminar.
  async onModuleInit() {
    try {
      await this.prisma.totemMedia.updateMany({
        where: { status: 'PROCESSING' },
        data: { status: 'FAILED', error: 'Se interrumpió el procesado. Vuelve a subirlo.' },
      });
    } catch (e) {
      this.logger.warn(`No se pudo revisar archivos pendientes: ${(e as Error).message}`);
    }
  }

  private dir(uploadId: string) {
    if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new BadRequestException('Subida inválida');
    return path.join(this.root, uploadId);
  }

  private async readMeta(uploadId: string): Promise<UploadMeta> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir(uploadId), 'meta.json'), 'utf-8'));
    } catch {
      throw new NotFoundException('La subida no existe o ya venció. Vuelve a intentarlo.');
    }
  }

  private async writeMeta(uploadId: string, meta: UploadMeta) {
    await fs.writeFile(path.join(this.dir(uploadId), 'meta.json'), JSON.stringify(meta));
  }

  // Borra subidas abandonadas (mas de un dia).
  private async sweep() {
    try {
      for (const name of await fs.readdir(this.root)) {
        const p = path.join(this.root, name);
        const st = await fs.stat(p).catch(() => null);
        if (st && Date.now() - st.mtimeMs > UPLOAD_TTL_MS) await fs.rm(p, { recursive: true, force: true });
      }
    } catch { /* la carpeta aun no existe */ }
  }

  async startUpload(dto: StartTotemUploadDto, userId: string | null) {
    const mime = dto.mimeType.toLowerCase();
    let kind: TotemMediaKind;
    if (IMAGE_TYPES.includes(mime)) {
      kind = 'IMAGE';
      if (dto.size > MAX_IMAGE_BYTES) throw new BadRequestException('La imagen pesa más de 25 MB.');
    } else if (mime.startsWith('video/')) {
      kind = 'VIDEO';
      if (dto.size > MAX_VIDEO_BYTES) throw new BadRequestException('El video pesa más de 300 MB.');
    } else {
      throw new BadRequestException('Formato no admitido. Usa JPG, PNG, WebP o un video (MP4, MOV, etc.).');
    }
    await this.sweep();
    const uploadId = randomUUID();
    await fs.mkdir(this.dir(uploadId), { recursive: true });
    await this.writeMeta(uploadId, {
      fileName: dto.fileName, mimeType: mime, kind, size: dto.size, received: 0, nextIndex: 0,
      createdById: userId, createdAt: Date.now(),
    });
    return { uploadId, chunkBytes: 5 * 1024 * 1024 };
  }

  async appendChunk(uploadId: string, dto: TotemUploadChunkDto) {
    const meta = await this.readMeta(uploadId);
    if (dto.index < meta.nextIndex) return { received: meta.received }; // reintento de un pedazo ya guardado
    if (dto.index !== meta.nextIndex) throw new BadRequestException('Pedazo fuera de orden');
    const buf = Buffer.from(dto.data, 'base64');
    if (meta.received + buf.length > meta.size) throw new BadRequestException('El archivo es más grande de lo indicado');
    await fs.appendFile(path.join(this.dir(uploadId), 'original'), buf);
    meta.received += buf.length;
    meta.nextIndex += 1;
    await this.writeMeta(uploadId, meta);
    return { received: meta.received };
  }

  async completeUpload(uploadId: string) {
    const meta = await this.readMeta(uploadId);
    if (meta.received !== meta.size) throw new BadRequestException('La subida está incompleta');
    const media = await this.prisma.totemMedia.create({
      data: { kind: meta.kind, status: 'PROCESSING', originalName: meta.fileName.slice(0, 200), createdById: meta.createdById },
    });
    this.queue = this.queue
      .then(() => this.process(media.id, uploadId, meta))
      .catch((e) => this.logger.error(`Procesado del totem: ${(e as Error).message}`));
    return media;
  }

  private async process(mediaId: string, uploadId: string, meta: UploadMeta) {
    const dir = this.dir(uploadId);
    try {
      const data = meta.kind === 'IMAGE'
        ? await this.processImage(mediaId, dir)
        : await this.processVideo(mediaId, dir);
      await this.prisma.totemMedia.update({ where: { id: mediaId }, data: { ...data, status: 'READY', error: null } });
    } catch (e) {
      const msg = (e as Error).message || 'Error procesando el archivo';
      this.logger.warn(`Totem ${mediaId}: ${msg}`);
      await this.prisma.totemMedia.update({ where: { id: mediaId }, data: { status: 'FAILED', error: msg.slice(0, 500) } }).catch(() => undefined);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async thumb(input: string | Buffer) {
    return sharp(input).rotate().resize(THUMB_W, THUMB_W * 2, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  }

  private async processImage(mediaId: string, dir: string) {
    const src = path.join(dir, 'original');
    let out: { data: Buffer; info: import('sharp').OutputInfo };
    try {
      out = await sharp(src).rotate()
        .resize(MAX_W, MAX_H, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new Error('No se pudo leer la imagen. ¿Está dañada?');
    }
    const key = `totem/${mediaId}.webp`;
    const thumbKey = `totem/${mediaId}-thumb.webp`;
    const url = await this.spaces.uploadPublic(key, out.data, 'image/webp');
    const thumbUrl = await this.spaces.uploadPublic(thumbKey, await this.thumb(out.data), 'image/webp');
    return { key, url, thumbKey, thumbUrl, bytes: out.data.length, width: out.info.width, height: out.info.height };
  }

  private async processVideo(mediaId: string, dir: string) {
    const src = path.join(dir, 'original');
    const probe = await this.probe(src).catch((e: Error) => {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('El servidor no tiene ffmpeg instalado para comprimir videos.');
      throw new Error('No se pudo leer el video. ¿Está dañado o es un formato raro?');
    });
    if (!probe.duration) throw new Error('No se pudo leer la duración del video.');
    if (probe.duration > MAX_VIDEO_SECONDS) throw new Error(`El video dura ${Math.round(probe.duration)} s; el máximo es 2 minutos.`);

    const out = path.join(dir, 'out.mp4');
    await this.run(this.ffmpegBin(), [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=w='min(${MAX_W},iw)':h='min(${MAX_H},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      '-movflags', '+faststart', '-threads', '2', out,
    ]);
    const outProbe = await this.probe(out);
    const frame = path.join(dir, 'frame.jpg');
    await this.run(this.ffmpegBin(), [
      '-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.min(1, outProbe.duration / 2)), '-i', out,
      '-frames:v', '1', '-q:v', '3', frame,
    ]);

    const key = `totem/${mediaId}.mp4`;
    const thumbKey = `totem/${mediaId}-thumb.webp`;
    const video = await fs.readFile(out);
    const url = await this.spaces.uploadPublic(key, video, 'video/mp4');
    const thumbUrl = await this.spaces.uploadPublic(thumbKey, await this.thumb(frame), 'image/webp');
    return {
      key, url, thumbKey, thumbUrl, bytes: video.length,
      width: outProbe.width, height: outProbe.height, durationSec: Math.round(outProbe.duration * 10) / 10,
    };
  }

  private ffmpegBin() { return process.env.FFMPEG_PATH || 'ffmpeg'; }
  private ffprobeBin() { return process.env.FFPROBE_PATH || 'ffprobe'; }

  private async probe(file: string) {
    const json = await this.run(this.ffprobeBin(), [
      '-v', 'error', '-print_format', 'json', '-show_entries', 'format=duration:stream=codec_type,width,height', file,
    ], false);
    const parsed = JSON.parse(json || '{}');
    const v = (parsed.streams || []).find((s: { codec_type?: string }) => s.codec_type === 'video');
    if (!v) throw new Error('El archivo no tiene imagen de video.');
    return { duration: Number(parsed.format?.duration) || 0, width: Number(v.width) || null, height: Number(v.height) || null };
  }

  // En Linux con prioridad baja (nice 19) para no frenar al ERP mientras se comprime un video.
  private run(bin: string, args: string[], lowPriority = true): Promise<string> {
    const useNice = lowPriority && process.platform === 'linux';
    const [cmd, cmdArgs] = useNice ? ['nice', ['-n', '19', bin, ...args]] : [bin, args];
    return new Promise((resolve, reject) => {
      const p = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', reject);
      p.on('close', (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(`No se pudo procesar el video (${err.trim().split('\n').pop() || `código ${code}`})`));
      });
    });
  }

  /** Borra el registro y sus archivos en Spaces. */
  async deleteMediaFiles(media: { key: string | null; thumbKey: string | null }) {
    if (media.key) await this.spaces.delete(media.key);
    if (media.thumbKey) await this.spaces.delete(media.thumbKey);
  }
}

