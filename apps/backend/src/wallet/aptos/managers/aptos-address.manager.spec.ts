import { describe, it, expect } from '@jest/globals';
import { AptosAddressManager } from './aptos-address.manager.js';

describe('AptosAddressManager', () => {
  let manager: AptosAddressManager;

  beforeEach(() => {
    manager = new AptosAddressManager();
  });

  // Standard test mnemonic (DO NOT USE IN PRODUCTION)
  const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  describe('deriveAddress', () => {
    it('should derive address from seed phrase', async () => {
      const address = await manager.deriveAddress(testMnemonic, 0);

      expect(address).toBeDefined();
      expect(address).toMatch(/^0x[a-f0-9]{64}$/);
      expect(address.length).toBe(66); // 0x + 64 hex chars
    });

    it('should derive different addresses for different account indices', async () => {
      const address0 = await manager.deriveAddress(testMnemonic, 0);
      const address1 = await manager.deriveAddress(testMnemonic, 1);
      const address2 = await manager.deriveAddress(testMnemonic, 2);

      expect(address0).not.toBe(address1);
      expect(address1).not.toBe(address2);
      expect(address0).not.toBe(address2);
    });

    it('should normalize addresses to lowercase', async () => {
      const address = await manager.deriveAddress(testMnemonic, 0);
      expect(address).toBe(address.toLowerCase());
    });

    it('should throw error for invalid seed phrase', async () => {
      await expect(manager.deriveAddress('', 0)).rejects.toThrow();
      await expect(manager.deriveAddress('invalid', 0)).rejects.toThrow();
    });

    it('should derive same address for same account index', async () => {
      const address1 = await manager.deriveAddress(testMnemonic, 0);
      const address2 = await manager.deriveAddress(testMnemonic, 0);

      expect(address1).toBe(address2);
    });
  });

  describe('deriveKeypair', () => {
    it('should derive Ed25519 keypair from seed phrase', async () => {
      const account = await manager.deriveKeypair(testMnemonic, 0);

      expect(account).toBeDefined();
      expect(account.accountAddress).toBeDefined();
      expect(account.publicKey).toBeDefined();
      expect(account.privateKey).toBeDefined();
    });

    it('should derive different keypairs for different account indices', async () => {
      const account0 = await manager.deriveKeypair(testMnemonic, 0);
      const account1 = await manager.deriveKeypair(testMnemonic, 1);

      expect(account0.accountAddress.toString()).not.toBe(
        account1.accountAddress.toString(),
      );
    });
  });

  describe('normalizeAddress', () => {
    it('should normalize short addresses', () => {
      const normalized = manager.normalizeAddress('0x1');
      expect(normalized).toBe('0x' + '0'.repeat(63) + '1');
      expect(normalized.length).toBe(66);
    });

    it('should lowercase addresses', () => {
      const normalized = manager.normalizeAddress('0xABC');
      expect(normalized).toContain('abc');
    });
  });

  describe('validateAddress', () => {
    it('should validate correct addresses', () => {
      expect(manager.validateAddress('0x1')).toBe(true);
      expect(manager.validateAddress('0x' + 'a'.repeat(64))).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(manager.validateAddress('1')).toBe(false);
      expect(manager.validateAddress('0xGGG')).toBe(false);
    });
  });
});

