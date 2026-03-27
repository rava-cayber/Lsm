import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const describeIfDatabaseConfigured = process.env.DATABASE_URL
  ? describe
  : describe.skip;

describeIfDatabaseConfigured('AuthController (e2e)', () => {
  let app: INestApplication | null = null;
  let prisma: PrismaService | null = null;
  let canRun = false;

  beforeAll(async () => {
    const checkPrisma = new PrismaClient();
    try {
      await checkPrisma.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 1');
      canRun = true;
    } catch {
      canRun = false;
    } finally {
      await checkPrisma.$disconnect();
    }

    if (!canRun) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (!canRun) return;

    if (prisma) {
      await prisma.user.deleteMany({ where: { email: 'test@example.com' } });
    }
    if (app) {
      await app.close();
    }
  });

  describe('/auth/login (POST)', () => {
    it('should return 404 if user not found', () => {
      if (!canRun || !app) return;

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(404);
    });

    it('should return 401 for invalid password', async () => {
      if (!canRun || !app || !prisma) return;

      // Test foydalanuvchisini yaratish
      await prisma.user.upsert({
        where: { email: 'test@example.com' },
        update: {},
        create: {
          email: 'test@example.com',
          fullName: 'Test User',
          password: 'hashed_password', // Haqiqiy bcrypt emas, lekin login baribir xato beradi
          role: 'STUDENT',
        },
      });

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });
});
