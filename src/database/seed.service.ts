import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly usersService: UsersService) {}

  async seed() {
    this.logger.log('Seeding database...');

    // Seed Users
    await this.seedUsers();

    this.logger.log('Database seeding completed.');
  }

  private async seedUsers() {
    const adminEmail = 'admin@example.com';
    const existingAdmin = await this.usersService.findOne(adminEmail);

    if (!existingAdmin) {
      await this.usersService.create({
        email: adminEmail,
        name: 'Admin User',
        passwordHash: 'admin123', // Will be hashed by service
      });
      this.logger.log(`Created admin user: ${adminEmail}`);
    } else {
      this.logger.log(`Admin user ${adminEmail} already exists. Skipping.`);
    }

    const demoEmail = 'demo@example.com';
    const existingDemo = await this.usersService.findOne(demoEmail);

    if (!existingDemo) {
      await this.usersService.create({
        email: demoEmail,
        name: 'Demo User',
        passwordHash: 'demo123', // Will be hashed by service
      });
      this.logger.log(`Created demo user: ${demoEmail}`);
    } else {
      this.logger.log(`Demo user ${demoEmail} already exists. Skipping.`);
    }
  }
}
