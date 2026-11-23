import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/**
 * Point d'entrée. Variables d'environnement :
 * - PORT : port d'écoute (3000 par défaut) ;
 * - CORS_ORIGIN : origines autorisées, séparées par des virgules (toutes par défaut).
 *
 * Le front React compilé est servi depuis le dossier `public` (à côté de dist/).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, '..', 'public'));
  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: origins && origins.length > 0 ? origins : true,
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Application ML-KEM Chat sur http://localhost:${port}`);
}

bootstrap();
