import { Controller, Get } from '@nestjs/common';
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
