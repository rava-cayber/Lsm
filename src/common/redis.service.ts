import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService extends Redis {
  private readonly logger = new Logger(RedisService.name);
  private readonly otpStore = new Map<
    string,
    { otp: string; expiresAt: number; timeout: NodeJS.Timeout }
  >();
  private useInMemoryFallback = false;

  constructor() {
    super(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });

    this.on('connect', () => this.logger.log('Redis connected successfully'));
    this.on('error', () => this.enableFallback());

    this.connect().catch(() => this.enableFallback());
  }

  private enableFallback() {
    if (this.useInMemoryFallback) return;

    this.useInMemoryFallback = true;
    this.logger.warn('Redis is unavailable. OTP will be stored in memory.');
  }

  private saveOTPInMemory(email: string, otp: string, ttlSeconds: number) {
    const key = `otp:${email}`;
    const existing = this.otpStore.get(key);
    if (existing) clearTimeout(existing.timeout);

    const timeout = setTimeout(() => this.otpStore.delete(key), ttlSeconds * 1000);
    this.otpStore.set(key, {
      otp,
      expiresAt: Date.now() + ttlSeconds * 1000,
      timeout,
    });
  }

  async saveOTP(email: string, otp: string, ttlSeconds = 300) {
    if (this.useInMemoryFallback) {
      this.saveOTPInMemory(email, otp, ttlSeconds);
      return;
    }

    try {
      await this.set(`otp:${email}`, otp, 'EX', ttlSeconds);
    } catch {
      this.enableFallback();
      this.saveOTPInMemory(email, otp, ttlSeconds);
    }
  }

  async getOTP(email: string): Promise<string | null> {
    if (this.useInMemoryFallback) {
      const key = `otp:${email}`;
      const item = this.otpStore.get(key);
      if (!item) return null;

      if (item.expiresAt <= Date.now()) {
        clearTimeout(item.timeout);
        this.otpStore.delete(key);
        return null;
      }

      return item.otp;
    }

    try {
      return await this.get(`otp:${email}`);
    } catch {
      this.enableFallback();
      return this.getOTP(email);
    }
  }

  async deleteOTP(email: string) {
    if (this.useInMemoryFallback) {
      const key = `otp:${email}`;
      const item = this.otpStore.get(key);
      if (item) clearTimeout(item.timeout);
      this.otpStore.delete(key);
      return;
    }

    try {
      await this.del(`otp:${email}`);
    } catch {
      this.enableFallback();
      await this.deleteOTP(email);
    }
  }
}
