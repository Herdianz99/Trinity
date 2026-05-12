import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;
  private connected = false;
  private readonly logger = new Logger(RedisService.name);
  private readonly memoryCache = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.warn('Redis not available, using in-memory cache fallback');
            return null; // stop retrying
          }
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      });

      this.client.on('error', () => {
        this.connected = false;
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.logger.log('Connected to Redis');
      });

      this.client.connect().catch(() => {
        this.logger.warn('Redis not available, using in-memory cache fallback');
        this.connected = false;
      });
    } catch {
      this.logger.warn('Redis not available, using in-memory cache fallback');
      this.client = null;
      this.connected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.connected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        this.connected = false;
      }
    }
    // Fallback: in-memory cache
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.connected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        this.connected = false;
      }
    }
    // Fallback: in-memory cache
    this.memoryCache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    if (this.connected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        this.connected = false;
      }
    }
    // Fallback: in-memory cache
    this.memoryCache.delete(key);
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
