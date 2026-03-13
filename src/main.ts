import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import { globalValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS — restrict to known origins ──────────────────────────────────────
  // In production set ALLOWED_ORIGINS to a comma-separated list of allowed
  // origins (e.g. "https://app.parchi.pk,https://admin.parchi.pk").
  // For local development leave it unset and the wildcard fallback is used.
  // const rawOrigins = process.env.ALLOWED_ORIGINS;
  // const allowedOrigins = rawOrigins
  //   ? rawOrigins.split(',').map((o) => o.trim())
  //   : [];

  app.enableCors();

  // ── Gzip compression (reduces JSON payload by ~70 %) ─────────────────────
  app.use(compression());

  // ── HTTP request logging ──────────────────────────────────────────────────
  const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(morganFormat));

  // ── Global validation ─────────────────────────────────────────────────────
  app.useGlobalPipes(globalValidationPipe);

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
  console.log(`🚀 Server is running on port ${port}`);
}
bootstrap();
