import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import morgan from 'morgan';
import { globalValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors();
  
  // Configure Morgan logging
  const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(morgan(morganFormat));
  
  // Enable global validation
  app.useGlobalPipes(globalValidationPipe);

  const port = process.env.PORT ?? 8080;
  await app.listen(port);
  console.log(`🚀 Server is running on port ${port}`);

}
bootstrap();
