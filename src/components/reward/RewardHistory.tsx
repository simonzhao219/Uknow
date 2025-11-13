import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar, TrendingUp, TrendingDown, Receipt } from 'lucide-react';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: string;
  balance: number;
}

// 模擬交易記錄
const mockTransactions: Transaction[] = [
  {
    id: 't1',
    type: 'income',
    amount: 50,
    description: '推薦獎勵 - 王小明註冊成功',
    date: '2024-01-15',
    balance: 1850
  },
  {
    id: 't2',
    type: 'income',
    amount: 30,
    description: '二等親獎勵 - 李小華推薦成功',
    date: '2024-01-20',
    balance: 1880
  },
  {
    id: 't3',
    type: 'expense',
    amount: 1000,
    description: 'Point提領申請',
    date: '2024-01-25',
    balance: 880
  },
  {
    id: 't4',
    type: 'expense',
    amount: 15,
    description: 'Point提領手續費',
    date: '2024-01-25',
    balance: 865
  },
  {
    id: 't5',
    type: 'income',
    amount: 50,
    description: '推薦獎勵 - 陳美華註冊成功',
    date: '2024-02-01',
    balance: 915
  },
  {
    id: 't6',
    type: 'income',
    amount: 20,
    description: '三等親獎勵 - 張志明推薦成功',
    date: '2024-02-05',
    balance: 935
  },
  {
    id: 't7',
    type: 'income',
    amount: 100,
    description: '活動獎勵 - 新春推薦活動',
    date: '2024-02-10',
    balance: 1035
  },
  {
    id: 't8',
    type: 'income',
    amount: 50,
    description: '推薦獎勵 - 劉小芳註冊成功',
    date: '2024-02-15',
    balance: 1085
  },
  {
    id: 't9',
    type: 'expense',
    amount: 273,
    description: '服務訂閱費用扣除',
    date: '2024-02-20',
    balance: 812
  },
  {
    id: 't10',
    type: 'income',
    amount: 30,
    description: '二等親獎勵 - 黃志偉推薦成功',
    date: '2024-02-25',
    balance: 842
  }
];

export function RewardHistory() {
  const [filterType, setFilterType] = useState('all');

  const filteredTransactions = mockTransactions.filter(transaction => {
    return filterType === 'all' || transaction.type === filterType;
  });

  const getTransactionIcon = (type: string) => {
    return type === 'income' ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const getTransactionColor = (type: string) => {
    return type === 'income' ? 'text-green-600' : 'text-red-600';
  };



  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          獎勵明細
        </CardTitle>
        <CardDescription>
          查看您的Point收支記錄和餘額變化
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 篩選器 */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="選擇交易類型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                <SelectItem value="income">收入</SelectItem>
                <SelectItem value="expense">支出</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 交易記錄列表 */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">沒有符合條件的交易記錄</p>
            </div>
          ) : (
            filteredTransactions.map((transaction) => (
              <div 
                key={transaction.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1">
                  {getTransactionIcon(transaction.type)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate mb-1">{transaction.description}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{transaction.date}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`font-medium ${getTransactionColor(transaction.type)}`}>
                    {transaction.type === 'income' ? '+' : '-'}{transaction.amount}P
                  </div>
                  <div className="text-sm text-muted-foreground">
                    餘額: {transaction.balance}P
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 統計摘要 */}{/*
        <div className="border-t pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <p className="text-muted-foreground">本期收入</p>
              <p className="font-medium text-green-600">
                +{filteredTransactions
                  .filter(t => t.type === 'income')
                  .reduce((sum, t) => sum + t.amount, 0)}P
              </p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">本期支出</p>
              <p className="font-medium text-red-600">
                -{filteredTransactions
                  .filter(t => t.type === 'expense')
                  .reduce((sum, t) => sum + t.amount, 0)}P
              </p>
            </div>
          </div>
        </div>*/}
      </CardContent>
    </Card>
  );
}