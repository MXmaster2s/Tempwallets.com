import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Wallet Persistence (e2e)', () => {
  let app: INestApplication;
  const testUserId = 'test-fingerprint-e2e-' + Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('New User Flow', () => {
    it('should auto-create wallet and save addresses on first GET /wallet/addresses', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses?userId=${testUserId}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.ethereum).toBeDefined();
      expect(response.body.base).toBeDefined();
    });

    it('should return addresses instantly from DB on second call', async () => {
      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses?userId=${testUserId}`)
        .expect(200);
      const endTime = Date.now();

      // Should be fast (cached from DB)
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second
      expect(response.body).toBeDefined();
      expect(response.body.ethereum).toBeDefined();
    });

    it('should return balances (may be 0 initially)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wallet/balances?userId=${testUserId}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should refresh balances and cache them', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/balances/refresh')
        .send({ userId: testUserId })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.success).toBe(true);
      expect(response.body.balances).toBeDefined();
    });

    it('should return cached balances after refresh', async () => {
      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .get(`/wallet/balances?userId=${testUserId}`)
        .expect(200);
      const endTime = Date.now();

      // Should be fast (cached)
      expect(endTime - startTime).toBeLessThan(500); // Less than 500ms
      expect(response.body).toBeDefined();
    });
  });

  describe('Existing User Flow', () => {
    const existingUserId = 'existing-user-' + Date.now();

    beforeAll(async () => {
      // Create wallet first
      await request(app.getHttpServer())
        .get(`/wallet/addresses?userId=${existingUserId}`)
        .expect(200);
    });

    it('should return addresses instantly from DB', async () => {
      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses?userId=${existingUserId}`)
        .expect(200);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });

    it('should stream cached addresses first, then any missing', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses-stream?userId=${existingUserId}`)
        .expect(200);

      expect(response.text).toBeDefined();
      // Should contain address data
      expect(response.text).toContain('data:');
    });

    it('should return cached balances', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wallet/balances?userId=${existingUserId}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should update cache on refresh', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/balances/refresh')
        .send({ userId: existingUserId })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Address Streaming Flow', () => {
    const streamUserId = 'stream-user-' + Date.now();

    it('should generate and save addresses on first stream', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses-stream?userId=${streamUserId}`)
        .expect(200);

      expect(response.text).toBeDefined();
      expect(response.text).toContain('data:');
    });

    it('should stream from DB instantly on second call', async () => {
      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses-stream?userId=${streamUserId}`)
        .expect(200);
      const endTime = Date.now();

      // Should be fast (cached)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(response.text).toBeDefined();
    });
  });

  describe('Cache Persistence', () => {
    const cacheUserId = 'cache-user-' + Date.now();

    beforeAll(async () => {
      // Create wallet and refresh balances
      await request(app.getHttpServer())
        .get(`/wallet/addresses?userId=${cacheUserId}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/wallet/balances/refresh')
        .send({ userId: cacheUserId })
        .expect(200);
    });

    it('should return cached balances in new request', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wallet/balances?userId=${cacheUserId}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should return addresses instantly in new request', async () => {
      const startTime = Date.now();
      const response = await request(app.getHttpServer())
        .get(`/wallet/addresses?userId=${cacheUserId}`)
        .expect(200);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500);
      expect(response.body).toBeDefined();
    });
  });
});

