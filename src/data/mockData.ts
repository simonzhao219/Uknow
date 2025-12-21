// 模擬獎金申請記錄
export const mockWithdrawals = [
  {
    id: 'wd1',
    userId: 'user1',
    amount: 1000,
    fee: 15,
    actualAmount: 985,
    status: 'pending',
    appliedAt: '2024-02-01',
    processedAt: null
  },
  {
    id: 'wd2',
    userId: 'user2',
    amount: 2000,
    fee: 15,
    actualAmount: 1985,
    status: 'awaiting_collection',
    appliedAt: '2024-01-15',
    processedAt: '2024-01-20'
  },
  {
    id: 'wd3',
    userId: 'user1',
    amount: 1500,
    fee: 15,
    actualAmount: 1485,
    status: 'completed',
    appliedAt: '2024-01-10',
    processedAt: '2024-01-15'
  }
];
