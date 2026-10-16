import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import pg from 'pg';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

// Return `date` columns as 'YYYY-MM-DD' strings and bigint ids as numbers.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(20, (v: string) => Number(v));

function sslOption(url: string, urlSslMode: string | null): pg.PoolConfig['ssl'] {
  let mode = config.databaseSsl.toLowerCase();
  if (mode === 'auto' && urlSslMode) mode = urlSslMode === 'disable' ? 'disable' : 'require';
  if (mode === 'disable' || mode === 'false' || mode === 'off') return false;
  if (mode === 'require' || mode === 'true' || mode === 'on') return { rejectUnauthorized: false };
  // auto: local databases without TLS, hosted ones with it.
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  return ['localhost', '127.0.0.1', '::1', 'postgres', 'db', ''].includes(host) ? false : { rejectUnauthorized: false };
}

/**
 * PostgreSQL access (node-postgres pool). The schema is created/updated on startup.
 * The API is the only thing that talks to the database, and every user-owned query
 * filters by the verified user id.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool: pg.Pool | null = null;
  private ready = false;

  async onModuleInit() {
    if (!config.databaseUrl) {
      this.logger.warn('DATABASE_URL not set — accounts, bookmarks, alerts and other database features are disabled');
      return;
    }
    // Strip sslmode from the URL so our explicit `ssl` option is the one that applies.
    const urlSslMode = config.databaseUrl.match(/[?&]sslmode=([^&]*)/)?.[1]?.toLowerCase() ?? null;
    const url = config.databaseUrl.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
    this.pool = new pg.Pool({ connectionString: url, ssl: sslOption(url, urlSslMode), max: 10, idleTimeoutMillis: 30_000 });
    this.pool.on('error', (err) => this.logger.error(`Postgres pool error: ${err.message}`));
    try {
      await this.pool.query(SCHEMA_SQL);
      this.ready = true;
      this.logger.log('Connected to PostgreSQL (schema up to date)');
    } catch (err) {
      this.logger.error(
        `Could not connect to PostgreSQL / apply schema: ${(err as Error).message}. ` +
          'Check DATABASE_URL (and DATABASE_SSL=require for hosted databases).',
      );
    }
  }

  async onModuleDestroy() {
    await this.pool?.end().catch(() => undefined);
  }

  get enabled() {
    return this.ready;
  }

  private get client(): pg.Pool {
    if (!this.pool || !this.ready) throw new ServiceUnavailableException('Database is not configured on the server');
    return this.pool;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.client.query(sql, params);
    return res.rows as T[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async one<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /** Run `fn` inside a transaction on a dedicated connection. */
  async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.client.connect();
    try {
      await c.query('begin');
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  /** Try to take a session-level advisory lock (so only one API instance runs a job). */
  async withLock<T>(lockId: number, fn: () => Promise<T>): Promise<T | null> {
    const c = await this.client.connect();
    try {
      const { rows } = await c.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [lockId]);
      if (!rows[0]?.ok) return null;
      try {
        return await fn();
      } finally {
        await c.query('select pg_advisory_unlock($1)', [lockId]).catch(() => undefined);
      }
    } finally {
      c.release();
    }
  }
}
