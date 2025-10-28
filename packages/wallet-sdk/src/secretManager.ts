import { WdkSecretManager, wdkSaltGenerator } from '@tetherto/wdk-secret-manager';

export interface EncryptedWalletSecrets {
  salt: string;
  encryptedSeed: Buffer;
  encryptedEntropy: Buffer;
}

export interface DecryptedWalletData {
  mnemonic: string;
  entropy: Buffer;
}

/**
 * Generate and encrypt wallet secrets using a session/user passkey
 * @param passkey - User-provided passkey for encryption (not persisted)
 * @returns Encrypted secrets ready for database storage
 */
export async function createEncryptedWalletSecrets(passkey: string): Promise<EncryptedWalletSecrets> {
  const salt = wdkSaltGenerator.generate();
  const secretManager = new WdkSecretManager(passkey, salt);
  
  try {
    // Generate mnemonic/seed and encrypt them
    const { encryptedSeed, encryptedEntropy } = await secretManager.generateAndEncrypt();
    
    return {
      salt: salt.toString('hex'),
      encryptedSeed,
      encryptedEntropy
    };
  } finally {
    // Always dispose to zeroize memory
    secretManager.dispose();
  }
}

/**
 * Decrypt secrets later for rehydration
 * @param encryptedPayload - The encrypted payload with salt
 * @param passkey - User-provided passkey for decryption
 * @returns Decrypted mnemonic for wallet operations
 */
export function decryptWalletSecrets(
  encryptedPayload: { salt: string; encryptedSeed: Buffer; encryptedEntropy: Buffer }, 
  passkey: string
): DecryptedWalletData {
  const saltBuffer = Buffer.from(encryptedPayload.salt, 'hex');
  const secretManager = new WdkSecretManager(passkey, saltBuffer);
  
  try {
    const entropy = secretManager.decrypt(encryptedPayload.encryptedEntropy);
    const mnemonic = secretManager.entropyToMnemonic(entropy);
    
    return { mnemonic, entropy };
  } finally {
    // Always dispose to zeroize memory
    secretManager.dispose();
  }
}

