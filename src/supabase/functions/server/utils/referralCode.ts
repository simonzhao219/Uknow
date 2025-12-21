/**
 * Referral Code Generation & Validation Utilities
 * 
 * Format: 3 lowercase letters + 6 digits
 * Example: abc123456
 * 
 * @module referralCode
 */

/**
 * Generate a unique referral code
 * 
 * Format: 3 lowercase letters (a-z) + 6 digits (0-9)
 * 
 * @returns {string} A 9-character referral code (e.g., "abc123456")
 * 
 * @example
 * const code = generateReferralCode();
 * console.log(code); // "xyz789012"
 */
export function generateReferralCode(): string {
  // Generate 3 lowercase letters (a-z)
  const letters = Array.from({ length: 3 }, () => 
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join('');
  
  // Generate 6 digits (0-9)
  const numbers = Array.from({ length: 6 }, () => 
    Math.floor(Math.random() * 10)
  ).join('');
  
  return letters + numbers;
}

/**
 * Validate referral code format
 * 
 * @param {string} code - The referral code to validate
 * @returns {boolean} True if valid, false otherwise
 * 
 * @example
 * validateReferralCode("abc123456"); // true
 * validateReferralCode("ABC123456"); // false (uppercase not allowed)
 * validateReferralCode("ab1234567"); // false (wrong length)
 */
export function validateReferralCode(code: string): boolean {
  // Must be exactly 9 characters: 3 lowercase letters + 6 digits
  return /^[a-z]{3}\d{6}$/.test(code);
}

/**
 * Format referral code for display
 * 
 * @param {string} code - The referral code
 * @returns {string} Formatted code with separator (e.g., "abc-123456")
 * 
 * @example
 * formatReferralCode("abc123456"); // "abc-123456"
 */
export function formatReferralCode(code: string): string {
  if (!validateReferralCode(code)) {
    return code;
  }
  
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/**
 * Parse formatted referral code back to plain format
 * 
 * @param {string} formattedCode - Formatted code with separator
 * @returns {string} Plain code without separator
 * 
 * @example
 * parseFormattedCode("abc-123456"); // "abc123456"
 */
export function parseFormattedCode(formattedCode: string): string {
  return formattedCode.replace(/-/g, '');
}
