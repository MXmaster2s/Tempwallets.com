import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const keyStr = this.configService.get<string>('WALLET_ENC_KEY');
    if (!keyStr) {
      throw new Error('WALLET_ENC_KEY environment variable is required');
    }
    // Convert base64 encoded key to Buffer
    this.key = Buffer.from(keyStr, 'base64');
    
    if (this.key.length !== 32) {
      throw new Error('WALLET_ENC_KEY must be a 32-byte base64 encoded string');
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   * @param plaintext The data to encrypt
   * @returns Encrypted data with IV and auth tag
   */
  encrypt(plaintext: string): EncryptedData {
    // Generate a random IV for this encryption
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt ciphertext using AES-256-GCM
   * @param encryptedData The encrypted data with IV and auth tag
   * @returns Decrypted plaintext
   */
  decrypt(encryptedData: EncryptedData): string {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }
}

