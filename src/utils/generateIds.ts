// 輔助函數：生成隨機的公開ID
// 用於為用戶和刊登生成唯一的公開ID

const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 生成10碼用戶ID（用於組成推薦碼）
export function generateUserId(): string {
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成6碼刊登ID（用於組成推薦碼）
export function generateListingId(): string {
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成推薦碼（用戶ID 10碼 + 刊登ID 6碼 = 16碼）
export function generateReferralCode(userId: string, listingId: string): string {
  const userPart = userId.substring(0, 10);
  const listingPart = listingId.substring(0, 6);
  return `${userPart}${listingPart}`;
}

// 解析推薦碼
export function parseReferralCode(code: string): { userPart: string; listingPart: string } | null {
  if (code.length !== 16) {
    return null;
  }
  return {
    userPart: code.substring(0, 10),
    listingPart: code.substring(10, 16)
  };
}

// 預生成的刊登ID列表（用於mockData）- 6碼格式
export const mockListingIds = [
  'aB3xY7', '1Km9pL', 'zN5rT8', 'pQ2wE9', 'mV7hJ2',
  'xW4gK8', 'rL3nM9', 'tY5bH7', 'cF8dX2', 'sG6vN4',
  'uH9wT3', 'vJ2bQ7', 'wK5cR8', 'aL7dS9', 'bM3eT2',
  'cN6fU8', 'dP9gV3', 'eQ2hW7', 'fR5jX8', 'gS8kY4',
  'hT3mZ9', 'jU6nA2', 'kV9pB7', 'mW2qC8', 'nX5rD3',
  'pY8sE9', 'qZ3tF2', 'rA6uG7', 'sB9vH4', 'tC2wJ8',
  'uD5xK3', 'vE8yL9', 'wF3zM2', 'xG6aN7', 'yH9bP4',
  'zJ2cQ8', 'aK5dR3', 'bL8eS9', 'cM3fT2', 'dN6gU7',
  'eP9hV4', 'fQ2jW8', 'gR5kX3', 'hS8mY9', 'jT3nZ2',
  'kU6pA7', 'mV9qB4', 'nW2rC8', 'pX5sD3', 'qY8tE9',
  'rZ3uF2', 'sA6vG7', 'tB9wH4', 'uC2xJ8', 'vD5yK3',
  'wE8zL9', 'xF3aM2', 'yG6bN7', 'zH9cP4', 'aJ2dQ8',
  'bK5eR3', 'cL8fS9', 'dM3gT2', 'eN6hU7', 'fP9jV4',
  'gQ2kW8', 'hR5mX3'
];

// 預生成的用戶ID列表（用於mockData）- 10碼格式
export const mockUserIds = [
  'aB3xY7k9pQ', '1Km9pLqRsT', 'zN5rT8mVwX', 'pQ2wE9xYzA', 'mV7hJ2nBcD',
  'xW4gK8pLqM', 'rL3nM9qRsT', 'tY5bH7kVwX', 'cF8dX2mYzA', 'sG6vN4pBcD',
  'uH9wT3kLqM', 'vJ2bQ7mRsT', 'wK5cR8pVwX', 'aL7dS9kYzA', 'bM3eT2mBcD',
  'cN6fU8pLqM', 'dP9gV3kRsT', 'eQ2hW7mVwX', 'fR5jX8pYzA', 'gS8kY4kBcD',
  'hT3mZ9mLqM', 'jU6nA2pRsT', 'kV9pB7kVwX', 'mW2qC8mYzA', 'nX5rD3pBcD',
  'pY8sE9kLqM', 'qZ3tF2mRsT', 'rA6uG7pVwX', 'sB9vH4kYzA', 'tC2wJ8mBcD',
  'uD5xK3pLqM', 'vE8yL9kRsT', 'wF3zM2mVwX', 'xG6aN7pYzA', 'yH9bP4kBcD',
  'zJ2cQ8mLqM', 'aK5dR3pRsT', 'bL8eS9kVwX', 'cM3fT2mYzA', 'dN6gU7pBcD',
  'eP9hV4kLqM', 'fQ2jW8mRsT', 'gR5kX3pVwX', 'hS8mY9kYzA', 'jT3nZ2mBcD',
  'kU6pA7pLqM', 'mV9qB4kRsT', 'nW2rC8mVwX', 'pX5sD3pYzA', 'qY8tE9kBcD',
  'rZ3uF2mLqM', 'sA6vG7pRsT', 'tB9wH4kVwX', 'uC2xJ8mYzA', 'vD5yK3pBcD',
  'wE8zL9kLqM', 'xF3aM2mRsT', 'yG6bN7pVwX', 'zH9cP4kYzA', 'aJ2dQ8mBcD',
  'bK5eR3pLqM', 'cL8fS9kRsT', 'dM3gT2mVwX', 'eN6hU7pYzA', 'fP9jV4kBcD',
  'gQ2kW8mLqM', 'hR5mX3pRsT'
];