import { requestLog } from './observability/request-log';
import { RequestErrorFilter } from './observability/request-error.filter';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Production requests reach the API through the single trusted reverse proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(requestLog);
  app.useGlobalFilters(new RequestErrorFilter(app.getHttpAdapter()));

  // Global API Prefix
  app.setGlobalPrefix('api');

  // CORS Configuration
  app.enableCors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : [
      'http://localhost:5173',   // Dev Vite
      'http://localhost:3000',   // Dev alternatif
      'http://localhost:80',     // Docker frontend
      'http://localhost',        // Docker frontend sans port
      'http://127.0.0.1:5173',
      'http://127.0.0.1:80',
      'http://127.0.0.1',
    ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    exposedHeaders: ['X-Correlation-ID'],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Swagger Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Système de Gestion Scolaire - Institut Oumouna Khadija')
    .setDescription(
      'API REST complète pour la gestion d\'une école primaire: Inscriptions, Élèves, Parents, Factures & Paiements, Bulletins scolaires, Présences & Absences, sécurisé avec Keycloak.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Documentation API - Institut Oumouna Khadija',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Serveur NestJS démarré avec succès sur: http://localhost:${port}/api`);
  console.log(`📚 Documentation Swagger disponible sur: http://localhost:${port}/api/docs`);
}

bootstrap();
