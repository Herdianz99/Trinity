import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnBase: string;

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('SPACES_BUCKET') || '';
    this.cdnBase = (this.config.get<string>('SPACES_CDN_BASE') || '').replace(/\/$/, '');
    this.client = new S3Client({
      endpoint: this.config.get<string>('SPACES_ENDPOINT'),
      region: this.config.get<string>('SPACES_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('SPACES_KEY') || '',
        secretAccessKey: this.config.get<string>('SPACES_SECRET') || '',
      },
    });
  }

  /** Sube un objeto con lectura pública y devuelve su URL de CDN. */
  async uploadPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return this.cdnUrl(key);
  }

  /** Sube un JSON público con cache corto (para snapshots que cambian). Devuelve su URL de CDN. */
  async uploadJson(key: string, data: unknown, maxAgeSeconds = 60): Promise<string> {
    const body = Buffer.from(JSON.stringify(data), 'utf-8');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json; charset=utf-8',
        ACL: 'public-read',
        CacheControl: `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
      }),
    );
    return this.cdnUrl(key);
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      // No es fatal: si el objeto ya no existe, seguimos.
      this.logger.warn(`No se pudo borrar el objeto ${key}: ${(e as Error).message}`);
    }
  }

  cdnUrl(key: string): string {
    return `${this.cdnBase}/${key}`;
  }
}
