import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { config } from '../config.js';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/**
 * Redis-backed cache. If REDIS_URL is not set (or Redis is down), falls back to an
 * in-process memory cache so local development works without Docker.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: RedisClientType | null = null;
  private memory = new Map<string, MemoryEntry>();
  private inflight = new Map<string, Promise<unknown>>();

  async onModuleInit() {
    if (!config.redisUrl) {
      this.logger.warn('REDIS_URL not set — using in-memory cache');
      return;
    }
    let connected = false;
    let lastError = '';
    const client: RedisClientType = createClient({
      url: config.redisUrl,
      socket: {
        connectTimeout: 3000,
        // Fail fast on the first connection (fall back to memory); once connected, keep reconnecting.
        reconnectStrategy: (retries, cause) => (connected ? Math.min(retries * 500, 5000) : cause),
      },
    });
    client.on('error', (err: Error) => {
      const msg = err.message || err.name || 'connection error';
      if (connected && msg !== lastError) this.logger.error(`Redis error: ${msg}`);
      lastError = msg;
    });
    try {
      await client.connect();
      connected = true;
      this.redis = client;
      this.logger.log('Connected to Redis');
    } catch (err) {
      const e = err as Error & { code?: string };
      this.logger.warn(`Could not connect to Redis at ${config.redisUrl} (${e.code || e.message || 'connection refused'}) — using in-memory cache`);
      await client.destroy?.();
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  private get redisReady() {
    return this.redis?.isReady ?? false;
  }

  async get<T>(key: string): Promise<T | null> {
    let raw: string | null = null;
    if (this.redisReady) {
      raw = await this.redis!.get(key).catch(() => null);
    } else {
      const entry = this.memory.get(key);
      if (entry && entry.expiresAt > Date.now()) raw = entry.value;
      else if (entry) this.memory.delete(key);
    }
    return raw == null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redisReady) {
      await this.redis!.set(key, raw, { expiration: { type: 'EX', value: ttlSeconds } }).catch(() => undefined);
      return;
    }
    if (this.memory.size > 5000) this.evictMemory();
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    if (this.redisReady) await this.redis!.del(key).catch(() => undefined);
    this.memory.delete(key);
  }

  /** Return the cached value, or compute it once (concurrent callers share the same promise). */
  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const promise = (async () => {
      try {
        const value = await fn();
        if (value !== null && value !== undefined) await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  /** Atomic counter with expiry — used for per-user rate limits. */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (this.redisReady) {
      const n = await this.redis!.incr(key);
      if (n === 1) await this.redis!.expire(key, ttlSeconds);
      return n;
    }
    const current = (await this.get<number>(key)) ?? 0;
    const entry = this.memory.get(key);
    const ttlLeft = entry ? Math.max(1, Math.round((entry.expiresAt - Date.now()) / 1000)) : ttlSeconds;
    await this.set(key, current + 1, ttlLeft);
    return current + 1;
  }

  private evictMemory() {
    const now = Date.now();
    for (const [k, v] of this.memory) if (v.expiresAt <= now) this.memory.delete(k);
    // Still too big: drop the oldest-inserted half.
    if (this.memory.size > 4000) {
      let i = 0;
      for (const k of this.memory.keys()) {
        if (i++ > 2000) break;
        this.memory.delete(k);
      }
    }
  }
}
