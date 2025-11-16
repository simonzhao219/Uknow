// 輔助函數：生成隨機的公開ID
// 用於為用戶和刊登生成唯一的公開ID

const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 生成5碼用戶ID
export function generateUserId(): string {
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成7碼刊登ID
export function generateListingId(): string {
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成推薦碼（用戶ID + 刊登ID = 12碼）
export function generateReferralCode(userId: string, listingId: string): string {
  return `${userId}${listingId}`;
}

// 預生成的刊登ID列表（用於mockData）
export const mockListingIds = [
  'aB3xY7k', '1Km9pLq', 'zN5rT8m', 'pQ2wE9x', 'mV7hJ2n',
  'xW4gK8p', 'rL3nM9q', 'tY5bH7k', 'cF8dX2m', 'sG6vN4p',
  'uH9wT3k', 'vJ2bQ7m', 'wK5cR8p', 'aL7dS9k', 'bM3eT2m',
  'cN6fU8p', 'dP9gV3k', 'eQ2hW7m', 'fR5jX8p', 'gS8kY4k',
  'hT3mZ9m', 'jU6nA2p', 'kV9pB7k', 'mW2qC8m', 'nX5rD3p',
  'pY8sE9k', 'qZ3tF2m', 'rA6uG7p', 'sB9vH4k', 'tC2wJ8m',
  'uD5xK3p', 'vE8yL9k', 'wF3zM2m', 'xG6aN7p', 'yH9bP4k',
  'zJ2cQ8m', 'aK5dR3p', 'bL8eS9k', 'cM3fT2m', 'dN6gU7p',
  'eP9hV4k', 'fQ2jW8m', 'gR5kX3p', 'hS8mY9k', 'jT3nZ2m',
  'kU6pA7p', 'mV9qB4k', 'nW2rC8m', 'pX5sD3p', 'qY8tE9k',
  'rZ3uF2m', 'sA6vG7p', 'tB9wH4k', 'uC2xJ8m', 'vD5yK3p',
  'wE8zL9k', 'xF3aM2m', 'yG6bN7p', 'zH9cP4k', 'aJ2dQ8m',
  'bK5eR3p', 'cL8fS9k', 'dM3gT2m', 'eN6hU7p', 'fP9jV4k',
  'gQ2kW8m', 'hR5mX3p'
];

// 預生成的用戶ID列表（用於mockData）
export const mockUserIds = [
  'aB3xY', '1Km9p', 'zN5rT', 'pQ2wE', 'mV7hJ',
  'xW4gK', 'rL3nM', 'tY5bH', 'cF8dX', 'sG6vN',
  'uH9wT', 'vJ2bQ', 'wK5cR', 'aL7dS', 'bM3eT',
  'cN6fU', 'dP9gV', 'eQ2hW', 'fR5jX', 'gS8kY',
  'hT3mZ', 'jU6nA', 'kV9pB', 'mW2qC', 'nX5rD',
  'pY8sE', 'qZ3tF', 'rA6uG', 'sB9vH', 'tC2wJ',
  'uD5xK', 'vE8yL', 'wF3zM', 'xG6aN', 'yH9bP',
  'zJ2cQ', 'aK5dR', 'bL8eS', 'cM3fT', 'dN6gU',
  'eP9hV', 'fQ2jW', 'gR5kX', 'hS8mY', 'jT3nZ',
  'kU6pA', 'mV9qB', 'nW2rC', 'pX5sD', 'qY8tE',
  'rZ3uF', 'sA6vG', 'tB9wH', 'uC2xJ', 'vD5yK',
  'wE8zL', 'xF3aM', 'yG6bN', 'zH9cP', 'aJ2dQ',
  'bK5eR', 'cL8fS', 'dM3gT', 'eN6hU', 'fP9jV',
  'gQ2kW', 'hR5mX'
];
