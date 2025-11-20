/**
 * Simple verification script for encryption service
 * Run with: pnpm test encryption-verification
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service.js';
import { ConfigService } from '@nestjs/config';

describe('Encryption Service Verification', () => {
  let encryptionService: EncryptionService;
  let module: TestingModule;

  // Generate a valid 32-byte base64 key for testing
  const validKey = Buffer.from('a'.repeat(32)).toString('base64');

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'WALLET_ENC_KEY') {
                return validKey;
              }
              return undefined;
            },
          },
        },
      ],
    }).compile();

    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  it('should encrypt and decrypt correctly', () => {
    const plaintext = 'test seed phrase word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    const encrypted = encryptionService.encrypt(plaintext);
    const decrypted = encryptionService.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
  });

  it('should generate different IVs for same plaintext', () => {
    const plaintext = 'same plaintext';
    const encrypted1 = encryptionService.encrypt(plaintext);
    const encrypted2 = encryptionService.encrypt(plaintext);

    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
  });

  it('should fail with tampered data', () => {
    const plaintext = 'test seed phrase';
    const encrypted = encryptionService.encrypt(plaintext);

    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -2) + 'XX',
    };

    expect(() => {
      encryptionService.decrypt(tampered);
    }).toThrow();
  });
});

