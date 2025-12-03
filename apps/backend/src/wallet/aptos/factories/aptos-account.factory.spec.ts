import { describe, it, expect, beforeEach } from '@jest/globals';
import { AptosAccountFactory } from './aptos-account.factory.js';
import { AptosAddressManager } from '../managers/aptos-address.manager.js';

describe('AptosAccountFactory', () => {
  let factory: AptosAccountFactory;
  let addressManager: AptosAddressManager;

  beforeEach(() => {
    addressManager = new AptosAddressManager();
    factory = new AptosAccountFactory(addressManager);
  });

  // Standard test mnemonic (DO NOT USE IN PRODUCTION)
  const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  describe('createAccountFromSeed', () => {
    it('should create account from seed phrase', async () => {
      const account = await factory.createAccountFromSeed(testMnemonic, 0);

      expect(account).toBeDefined();
      expect(account.address).toMatch(/^0x[a-f0-9]{64}$/);
      expect(account.publicKey).toBeDefined();
      expect(account.privateKey).toBeDefined();
      expect(account.accountAddress).toBeDefined();
      expect(account.account).toBeDefined();
    });

    it('should create different accounts for different indices', async () => {
      const account0 = await factory.createAccountFromSeed(testMnemonic, 0);
      const account1 = await factory.createAccountFromSeed(testMnemonic, 1);

      expect(account0.address).not.toBe(account1.address);
    });

    it('should normalize addresses before returning', async () => {
      const account = await factory.createAccountFromSeed(testMnemonic, 0);
      expect(account.address).toBe(account.address.toLowerCase());
      expect(account.address.length).toBe(66);
    });

    it('should throw error for invalid seed phrase', async () => {
      await expect(factory.createAccountFromSeed('', 0)).rejects.toThrow();
      await expect(
        factory.createAccountFromSeed('invalid words', 0),
      ).rejects.toThrow();
    });

    it('should validate seed phrase word count', async () => {
      const invalidSeed = 'word '.repeat(10); // 10 words
      await expect(
        factory.createAccountFromSeed(invalidSeed.trim(), 0),
      ).rejects.toThrow('Invalid seed phrase');
    });
  });

  describe('createAccountFromPrivateKey', () => {
    it('should create account from valid private key', () => {
      // Valid 64-char hex private key
      const privateKey =
        '0x' + 'a'.repeat(64); // 32 bytes = 64 hex chars

      const account = factory.createAccountFromPrivateKey(privateKey);

      expect(account).toBeDefined();
      expect(account.address).toMatch(/^0x[a-f0-9]{64}$/);
      expect(account.publicKey).toBeDefined();
      expect(account.privateKey).toBeDefined();
    });

    it('should handle private key without 0x prefix', () => {
      const privateKey = 'a'.repeat(64);
      const account = factory.createAccountFromPrivateKey(privateKey);

      expect(account).toBeDefined();
      expect(account.address).toBeDefined();
    });

    it('should throw error for invalid private key length', () => {
      const tooShort = '0x' + 'a'.repeat(63); // 63 chars
      const tooLong = '0x' + 'a'.repeat(65); // 65 chars

      expect(() => factory.createAccountFromPrivateKey(tooShort)).toThrow(
        'Invalid private key length',
      );
      expect(() => factory.createAccountFromPrivateKey(tooLong)).toThrow(
        'Invalid private key length',
      );
    });

    it('should throw error for invalid hex characters', () => {
      const invalidKey = '0x' + 'G'.repeat(64);
      expect(() => factory.createAccountFromPrivateKey(invalidKey)).toThrow(
        'hex characters',
      );
    });
  });

  describe('createAccountFromMnemonic', () => {
    it('should be alias for createAccountFromSeed', async () => {
      const account1 = await factory.createAccountFromSeed(testMnemonic, 0);
      const account2 = await factory.createAccountFromMnemonic(testMnemonic, 0);

      expect(account1.address).toBe(account2.address);
    });
  });
});

