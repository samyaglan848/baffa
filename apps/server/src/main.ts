import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import * as path from 'path';
import * as express from 'express';

async function bootstrap() {
  const logger = new Logger('BAFFA-Server');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable high-limit payload parsing for large high-res photo uploads (up to 50MB)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // Production Health Check Endpoint
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/health', (req: any, res: any) => {
    res.status(200).json({
      status: 'healthy',
      service: 'BAFFA Game Server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  });

  // Serve static uploaded avatars safely
  const path = require('path');
  const express = require('express');
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  expressApp.use('/uploads', express.static(uploadsDir));

  // Graceful Shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`\n🚀 =================================================`);
  console.log(`   🟢 BAFFA Game Server: http://localhost:${port}`);
  console.log(`   🌐 BAFFA Web App:     http://localhost:3000`);
  console.log(`=================================================\n`);
}

bootstrap();
