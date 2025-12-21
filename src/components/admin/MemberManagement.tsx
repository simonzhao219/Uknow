import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { mockServiceProviders } from '../../data/mockServiceProviders';
import { mockUsers } from '../../data/mockUsers';
import { Users, UserX, Shield } from 'lucide-react';

export function MemberManagement() {
  const [users, setUsers] = useState(mockUsers);

  const getUserServiceProvidersCount = (userId: string) => {
    return mockServiceProviders.filter(r => r.userId === userId).length;
  };

  const handleSuspendUser = (userId: string) => {
    setUsers(prev => 
      prev.map(u => 
        u.id === userId 
          ? { ...u, suspended: !u.suspended }
          : u
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-blue-600" />
              總會員數
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{users.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserX className="h-5 w-5 text-red-600" />
              暫停會員
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {users.filter(u => u.suspended).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-green-600" />
              管理員
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {users.filter(u => u.isAdmin).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 會員列表 */}
      <Card>
        <CardHeader>
          <CardTitle>會員管理</CardTitle>
          <CardDescription>管理平台所有會員帳號</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>電話</TableHead>
                <TableHead>服務者數量</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.phone}</TableCell>
                  <TableCell>{getUserServiceProvidersCount(user.id)}</TableCell>
                  <TableCell>
                    {user.isAdmin ? (
                      <Badge variant="default">管理員</Badge>
                    ) : (
                      <Badge variant="outline">一般會員</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.suspended ? (
                      <Badge variant="destructive">已暫停</Badge>
                    ) : (
                      <Badge variant="default">正常</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={user.suspended ? "default" : "destructive"}
                      onClick={() => handleSuspendUser(user.id)}
                    >
                      {user.suspended ? '恢復' : '暫停'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}