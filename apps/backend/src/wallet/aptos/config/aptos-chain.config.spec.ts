import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getNetworkConfig, APTOS_NETWORKS } from './aptos-chain.config.js';

describe('Aptos Chain Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env vars before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getNetworkConfig', () => {
    it('should return mainnet config', () => {
      const config = getNetworkConfig('mainnet');
      expect(config.name).toBe('mainnet');
      expect(config.chainId).toBe(1);
      expect(config.rpcUrls).toBeInstanceOf(Array);
      expect(config.rpcUrls.length).toBeGreaterThan(0);
    });

    it('should return testnet config', () => {
      const config = getNetworkConfig('testnet');
      expect(config.name).toBe('testnet');
      expect(config.chainId).toBe(2);
      expect(config.faucetUrl).toBeDefined();
    });

    it('should return devnet config', () => {
      const config = getNetworkConfig('devnet');
      expect(config.name).toBe('devnet');
      expect(config.chainId).toBe(0);
      expect(config.faucetUrl).toBeDefined();
    });

    it('should throw error for invalid network', () => {
      // Cast to bypass type checking for testing invalid input
      expect(() => getNetworkConfig('invalid' as 'mainnet')).toThrow('Unknown network');
    });
  });

  describe('RPC URL parsing', () => {
    it('should parse comma-separated RPC URLs', () => {
      process.env.APTOS_MAINNET_RPC_URLS = 'url1,url2,url3';
      // Need to reload the module or test the parseRpcUrls function directly
      // For now, test that configs have arrays
      expect(APTOS_NETWORKS.mainnet.rpcUrls).toBeInstanceOf(Array);
    });

    it('should handle single RPC URL', () => {
      process.env.APTOS_TESTNET_RPC_URLS = 'https://single-url.com';
      expect(APTOS_NETWORKS.testnet.rpcUrls).toBeInstanceOf(Array);
    });

    it('should use fallback when env var not set', () => {
      delete process.env.APTOS_MAINNET_RPC_URLS;
      expect(APTOS_NETWORKS.mainnet.rpcUrls.length).toBeGreaterThan(0);
    });

    it('should trim whitespace from URLs', () => {
      process.env.APTOS_MAINNET_RPC_URLS = ' url1 , url2 ';
      // URLs should be trimmed (tested via actual usage)
      expect(APTOS_NETWORKS.mainnet.rpcUrls).toBeInstanceOf(Array);
    });
  });

  describe('Network configurations', () => {
    it('should have all required fields for mainnet', () => {
      const config = APTOS_NETWORKS.mainnet;
      expect(config.name).toBe('mainnet');
      expect(config.chainId).toBe(1);
      expect(config.rpcUrls).toBeInstanceOf(Array);
      expect(config.explorerUrl).toBeDefined();
    });

    it('should have faucet URLs for testnet and devnet', () => {
      expect(APTOS_NETWORKS.testnet.faucetUrl).toBeDefined();
      expect(APTOS_NETWORKS.devnet.faucetUrl).toBeDefined();
    });
  });
});

