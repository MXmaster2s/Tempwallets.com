import { describe, it, expect } from '@jest/globals';
import {
  normalizeAddress,
  validateAddress,
  areAddressesEqual,
} from './address.utils.js';

describe('Address Utils', () => {
  describe('normalizeAddress', () => {
    it('should pad short addresses', () => {
      const result = normalizeAddress('0x1');
      expect(result).toBe('0x' + '0'.repeat(63) + '1');
      expect(result.length).toBe(66); // 0x + 64 hex chars
    });

    it('should lowercase addresses', () => {
      const result = normalizeAddress('0xABC');
      expect(result).toBe('0x' + '0'.repeat(61) + 'abc');
      expect(result).not.toContain('ABC');
    });

    it('should reject addresses without 0x prefix', () => {
      expect(() => normalizeAddress('1')).toThrow('must start with 0x prefix');
      expect(() => normalizeAddress('abc123')).toThrow('must start with 0x prefix');
    });

    it('should reject invalid hex characters', () => {
      expect(() => normalizeAddress('0xGGG')).toThrow('Invalid hex characters');
      expect(() => normalizeAddress('0xZZZ')).toThrow('Invalid hex characters');
    });

    it('should reject too-long addresses', () => {
      const tooLong = '0x' + '1'.repeat(65);
      expect(() => normalizeAddress(tooLong)).toThrow('too long');
    });

    it('should handle full 64-char addresses', () => {
      const fullAddress = '0x' + 'a'.repeat(64);
      const result = normalizeAddress(fullAddress);
      expect(result).toBe(fullAddress.toLowerCase());
      expect(result.length).toBe(66);
    });

    it('should reject empty addresses', () => {
      expect(() => normalizeAddress('')).toThrow('cannot be empty');
      expect(() => normalizeAddress('0x')).toThrow('Invalid hex characters');
    });
  });

  describe('validateAddress', () => {
    it('should validate correct addresses', () => {
      expect(validateAddress('0x1')).toBe(true);
      expect(validateAddress('0x' + 'a'.repeat(64))).toBe(true);
      expect(validateAddress('0xABC123')).toBe(true);
    });

    it('should reject addresses without 0x prefix', () => {
      expect(validateAddress('1')).toBe(false);
      expect(validateAddress('abc123')).toBe(false);
    });

    it('should reject invalid hex characters', () => {
      expect(validateAddress('0xGGG')).toBe(false);
      expect(validateAddress('0xZZZ')).toBe(false);
    });

    it('should reject too-long addresses', () => {
      expect(validateAddress('0x' + '1'.repeat(65))).toBe(false);
    });

    it('should reject empty or null addresses', () => {
      expect(validateAddress('')).toBe(false);
      expect(validateAddress(null as any)).toBe(false);
      expect(validateAddress(undefined as any)).toBe(false);
    });
  });

  describe('areAddressesEqual', () => {
    it('should compare normalized addresses correctly', () => {
      expect(areAddressesEqual('0x1', '0x' + '0'.repeat(63) + '1')).toBe(true);
      expect(areAddressesEqual('0xABC', '0xabc')).toBe(true);
      expect(areAddressesEqual('0x1', '0x2')).toBe(false);
    });

    it('should handle different formats', () => {
      expect(areAddressesEqual('0x1', '0x0001')).toBe(true);
      expect(areAddressesEqual('0xabc', '0xABC')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(areAddressesEqual('0xGGG', '0x1')).toBe(false);
      expect(areAddressesEqual('invalid', '0x1')).toBe(false);
    });
  });
});

