// Mock for TokenListService to avoid import.meta.url issues in Jest
import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenListService {
  private polkadotEvmTokens: any[] = [];
  private allTokens: any[] = [];

  getTokensForChain(chain: string): any[] {
    return [];
  }

  getAllTokens(): any[] {
    return [];
  }
}

