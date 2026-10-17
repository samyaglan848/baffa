import * as dotenv from 'dotenv';
import * as nodePath from 'path';
// Load apps/server/.env for local development (never overrides variables set by the host, e.g. Render).
dotenv.config({ path: nodePath.resolve(__dirname, '..', '.env') });
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as express from 'express';
import { getPersistentUploadsDir, getStorageReport } from './config/runtime';
import { PersistenceService } from './modules/persistence/persistence.service';

export function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o.length > 0 && o !== '*');
}

async function bootstrap() {
  const logger = new Logger('BAFFA-Server');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // CORS: restrict to the configured web origins when CORS_ORIGINS / CORS_ORIGIN is set
  // (comma-separated). Auth uses the Authorization header, not cookies, so credentials are off.
  const allowedOrigins = getAllowedOrigins();
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: false,
  });
  if (allowedOrigins.length === 0) {
    logger.warn('CORS_ORIGINS is not set: API accepts requests from any website. Set it to your web app URL.');
  }

  // Avatar uploads are limited to 2MB images (≈2.7MB as base64); 5MB leaves headroom.
  // The previous 50MB limit let a single request tie up the server's memory.
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ limit: '5mb', extended: true }));

  // Production Health Check Endpoint
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/health', (req: any, res: any) => {
    let accounts: number | null = null;
    let database: string = 'unknown';
    try {
      const persistence = app.get(PersistenceService);
      accounts = persistence.getAllUsers().length;
      database = persistence.getCloudStatus();
    } catch {}
    res.status(200).json({
      status: 'healthy',
      service: 'BAFFA Game Server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      storage: { ...getStorageReport(), accounts, database },
    });
  });

  // Serve static uploaded avatars safely across monorepo layouts
  const persistentUploads = getPersistentUploadsDir();
  const uploadsCandidateDirs = [
    ...(persistentUploads ? [persistentUploads] : []),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'apps', 'server', 'uploads'),
    path.resolve(__dirname, '..', 'uploads'),
    path.resolve(__dirname, '..', '..', 'uploads'),
  ];
  uploadsCandidateDirs.forEach((uDir) => {
    if (fs.existsSync(uDir)) {
      expressApp.use('/uploads', express.static(uDir, { maxAge: '7d' }));
    }
  });

  // Graceful Shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`\n🚀 =================================================`);
  console.log(`   🟢 BAFFA Game Server: http://localhost:${port}`);
  console.log(`   🌐 BAFFA Web App:     http://localhost:3000`);
  console.log(`=================================================\n`);
}

// Last-resort safety net: log unexpected errors instead of letting one bad timer callback or
// rejected promise take down the whole server (all live matches are held in memory).
process.on('unhandledRejection', (reason: any) => {
  new Logger('Process').error(`Unhandled promise rejection: ${reason?.stack || reason}`);
});
process.on('uncaughtException', (err: any) => {
  new Logger('Process').error(`Uncaught exception: ${err?.stack || err}`);
});

bootstrap();
