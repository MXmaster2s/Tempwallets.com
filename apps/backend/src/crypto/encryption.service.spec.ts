import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service.js';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let configService: ConfigService;

  // Generate a valid 32-byte base64 key for testing
  const validKey = Buffer.from('a'.repeat(32)).toString('base64');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WALLET_ENC_KEY') {
                return validKey;
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should throw error if WALLET_ENC_KEY is missing', async () => {
      try {
        const module = await Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => undefined),
              },
            },
          ],
        }).compile();
        
        // If we get here, the service was created, which shouldn't happen
        module.get<EncryptionService>(EncryptionService);
        fail('Expected EncryptionService to throw an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('WALLET_ENC_KEY environment variable is required');
      }
    });

    it('should throw error if key length is incorrect', async () => {
      const invalidKey = Buffer.from('short').toString('base64');

      try {
        const module = await Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn((key: string) => {
                  if (key === 'WALLET_ENC_KEY') {
                    return invalidKey;
                  }
                  return undefined;
                }),
              },
            },
          ],
        }).compile();
        
        // If we get here, the service was created, which shouldn't happen
        module.get<EncryptionService>(EncryptionService);
        fail('Expected EncryptionService to throw an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('WALLET_ENC_KEY must be a 32-byte base64 encoded string');
      }
    });
  });

  describe('Encryption', () => {
    it('should encrypt plaintext', () => {
      const plaintext = 'test seed phrase here';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.ciphertext).not.toBe(plaintext);
    });

    it('should generate different IVs for same plaintext', () => {
      const plaintext = 'same plaintext';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      // IVs should be different (random)
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Ciphertexts should be different (due to different IVs)
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('should generate different authTags for same plaintext', () => {
      const plaintext = 'same plaintext';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
    });
  });

  describe('Decryption', () => {
    it('should decrypt to original plaintext', () => {
      const plaintext = 'test seed phrase here';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt empty string', () => {
      const plaintext = '';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt long strings', () => {
      const plaintext = 'a'.repeat(1000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt different encryptions of same plaintext', () => {
      const plaintext = 'same plaintext';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      const decrypted1 = service.decrypt(encrypted1);
      const decrypted2 = service.decrypt(encrypted2);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });
  });

  describe('Security', () => {
    it('should fail decryption with tampered ciphertext', () => {
      const plaintext = 'test seed phrase';
      const encrypted = service.encrypt(plaintext);

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -2) + 'XX',
      };

      expect(() => {
        service.decrypt(tampered);
      }).toThrow();
    });

    it('should fail decryption with tampered authTag', () => {
      const plaintext = 'test seed phrase';
      const encrypted = service.encrypt(plaintext);

      // Tamper with authTag - change it completely
      const tampered = {
        ...encrypted,
        authTag: '00'.repeat(16), // Invalid authTag
      };

      expect(() => {
        service.decrypt(tampered);
      }).toThrow();
    });

    it('should fail decryption with wrong IV', () => {
      const plaintext = 'test seed phrase';
      const encrypted = service.encrypt(plaintext);

      // Use wrong IV
      const wrongIv = Buffer.alloc(16, 0).toString('hex');
      const tampered = {
        ...encrypted,
        iv: wrongIv,
      };

      expect(() => {
        service.decrypt(tampered);
      }).toThrow();
    });

    it('should fail decryption with invalid hex strings', () => {
      const plaintext = 'test seed phrase';
      const encrypted = service.encrypt(plaintext);

      // Invalid hex in ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: 'invalid-hex-string',
      };

      expect(() => {
        service.decrypt(tampered);
      }).toThrow();
    });
  });

  describe('Round-trip', () => {
    it('should encrypt and decrypt various seed phrases', () => {
      const testCases = [
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
        'test',
        '',
        'a'.repeat(200),
      ];

      testCases.forEach((plaintext) => {
        const encrypted = service.encrypt(plaintext);
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
      });
    });
  });
});

