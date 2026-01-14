import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class HealthController {
  constructor(private configService: ConfigService) {}

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Get('debug/config')
  debugConfig() {
    // Helper to mask sensitive values
    const maskSecret = (value: string | undefined): string => {
      if (!value) return 'NOT_SET';
      if (value.length < 8) return 'SET_TOO_SHORT';
      return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    };

    return {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      config: {
        // Critical API keys (masked)
        zerionApiKey: maskSecret(this.configService.get<string>('ZERION_API_KEY')),
        pimlicoApiKey: maskSecret(this.configService.get<string>('PIMLICO_API_KEY')),
        walletEncKey: maskSecret(this.configService.get<string>('WALLET_ENC_KEY')),
        jwtSecret: maskSecret(this.configService.get<string>('JWT_SECRET')),

        // URLs (safe to show)
        frontendUrl: this.configService.get<string>('FRONTEND_URL') || 'NOT_SET',
        yellowNetworkWsUrl: this.configService.get<string>('YELLOW_NETWORK_WS_URL') || 'NOT_SET',

        // Database (show if set, not value)
        databaseUrl: this.configService.get<string>('DATABASE_URL') ? 'SET' : 'NOT_SET',

        // RPC URLs (show if set)
        ethRpcUrl: this.configService.get<string>('ETH_RPC_URL') ? 'SET' : 'NOT_SET',
        baseRpcUrl: this.configService.get<string>('BASE_RPC_URL') ? 'SET' : 'NOT_SET',

        // Server config
        port: this.configService.get<string>('PORT') || '5005',
        logLevel: this.configService.get<string>('LOG_LEVEL') || 'NOT_SET',
      },
      warnings: this.getConfigWarnings(),
    };
  }

  @Get('debug/network')
  async debugNetwork(@Query('url') testUrl?: string) {
    const results: any = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      tests: {},
    };

    // Test URLs to diagnose
    const urlsToTest = [
      { name: 'Zerion API', url: 'https://api.zerion.io/v1' },
      { name: 'Google (baseline)', url: 'https://www.google.com' },
      { name: 'GitHub (baseline)', url: 'https://api.github.com' },
    ];

    // Add Yellow Network if configured
    const yellowUrl = this.configService.get<string>('YELLOW_NETWORK_WS_URL');
    if (yellowUrl && yellowUrl.startsWith('http')) {
      urlsToTest.push({ name: 'Yellow Network', url: yellowUrl });
    }

    // Add custom test URL if provided
    if (testUrl) {
      urlsToTest.push({ name: 'Custom URL', url: testUrl });
    }

    // Test each URL
    for (const { name, url } of urlsToTest) {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Tempwallets-Debug/1.0',
          },
        });

        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        results.tests[name] = {
          url,
          success: true,
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          headers: Object.fromEntries(response.headers.entries()),
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        results.tests[name] = {
          url,
          success: false,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : 'Unknown',
        };
      }
    }

    // Test DNS resolution
    try {
      const dns = await import('dns');
      const { promisify } = await import('util');
      const resolve4 = promisify(dns.resolve4);
      const resolve6 = promisify(dns.resolve6);

      results.dns = {};

      try {
        const ipv4 = await resolve4('api.zerion.io');
        results.dns.zerion_ipv4 = ipv4;
      } catch (e) {
        results.dns.zerion_ipv4_error = e instanceof Error ? e.message : 'Failed';
      }

      try {
        const ipv6 = await resolve6('api.zerion.io');
        results.dns.zerion_ipv6 = ipv6;
      } catch (e) {
        results.dns.zerion_ipv6_error = e instanceof Error ? e.message : 'Failed';
      }
    } catch (error) {
      results.dns_error = 'DNS module not available';
    }

    return results;
  }

  @Get('debug/zerion-test')
  async debugZerionTest() {
    const zerionApiKey = this.configService.get<string>('ZERION_API_KEY');

    if (!zerionApiKey) {
      return {
        error: 'ZERION_API_KEY not configured',
      };
    }

    const testAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // Vitalik's address
    const url = `https://api.zerion.io/v1/wallets/${testAddress}/positions/?sort=value`;

    const results: any = {
      timestamp: new Date().toISOString(),
      testAddress,
      url,
      apiKeyConfigured: true,
    };

    // Test 1: Basic fetch with short timeout
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const auth = Buffer.from(`${zerionApiKey}:`).toString('base64');
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        results.success = true;
        results.status = response.status;
        results.duration = `${duration}ms`;
        results.dataReceived = Array.isArray(data?.data);
        results.recordCount = Array.isArray(data?.data) ? data.data.length : 0;
      } else {
        const errorText = await response.text();
        results.success = false;
        results.status = response.status;
        results.duration = `${duration}ms`;
        results.error = errorText.substring(0, 500); // Limit error text
      }
    } catch (error) {
      results.success = false;
      results.error = error instanceof Error ? error.message : 'Unknown error';
      results.errorName = error instanceof Error ? error.name : 'Unknown';
      results.errorStack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined;
    }

    return results;
  }

  @Get()
  root() {
    return {
      message: 'Tempwallets Backend API',
      version: '0.0.1',
      status: 'running',
    };
  }

  private getConfigWarnings(): string[] {
    const warnings: string[] = [];

    if (!this.configService.get<string>('ZERION_API_KEY')) {
      warnings.push('ZERION_API_KEY not set - balance fetching will fail');
    }

    if (!this.configService.get<string>('WALLET_ENC_KEY')) {
      warnings.push('WALLET_ENC_KEY not set - wallet encryption will fail');
    }

    if (!this.configService.get<string>('JWT_SECRET')) {
      warnings.push('JWT_SECRET not set - authentication will fail');
    }

    if (!this.configService.get<string>('DATABASE_URL')) {
      warnings.push('DATABASE_URL not set - database operations will fail');
    }

    if (!this.configService.get<string>('FRONTEND_URL') && process.env.NODE_ENV === 'production') {
      warnings.push('FRONTEND_URL not set - CORS might fail for production frontend');
    }

    return warnings;
  }
}
