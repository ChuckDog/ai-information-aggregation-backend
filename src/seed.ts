import { NestFactory } from '@nestjs/core';
import { SeedModule } from './database/seed.module';
import { SeedService } from './database/seed.service';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(SeedModule);
  const seeder = appContext.get(SeedService);
  try {
    await seeder.seed();
  } catch (error) {
    console.error('Seeding failed', error);
  } finally {
    await appContext.close();
  }
}
bootstrap();
