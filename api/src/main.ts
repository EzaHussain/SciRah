import { existsSync } from 'node:fs';

// Load api/.env in development (Node's built-in loader — no dotenv dependency).
// Everything else is imported dynamically so config.ts sees the loaded variables.
if (existsSync('.env')) process.loadEnvFile('.env');

await import('reflect-metadata');
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('./app.module.js');
const { config } = await import('./config.js');

const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
// Behind Railway/Render/Vercel proxies: use X-Forwarded-For for the client IP (rate limits).
app.getHttpAdapter().getInstance().set('trust proxy', true);
app.enableCors({ origin: config.webOrigins, credentials: false, allowedHeaders: ['Authorization', 'Content-Type'] });
app.enableShutdownHooks();
await app.listen(config.port);
console.log(`SciRah API listening on http://localhost:${config.port}`);
