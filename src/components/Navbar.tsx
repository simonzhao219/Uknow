import React, { useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { UserContext } from '../App';
import { User, Settings, Award, Users, LogOut, Shield, Target } from 'lucide-react';
import { useFeatures } from '../contexts/FeatureContext';
import { createClient } from '../utils/supabase/client';

export function Navbar() {
  const { user, setUser, isLoggedIn, isAdmin } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { isFeatureEnabled } = useFeatures();
  const supabase = createClient();

  const handleLogout = async () => {
    console.log('Navbar: Logging out user...');
    
    // 1. 登出 Supabase Auth
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Navbar: Error signing out from Supabase:', error);
    } else {
      console.log('Navbar: Successfully signed out from Supabase');
    }
    
    // 2. 清除本地狀態和 localStorage
    setUser(null);
    localStorage.removeItem('user');
    console.log('Navbar: Cleared local user data');
    
    // 3. ��航到首頁
    navigate('/');
  };

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold">U</span>
          </div>
          <span className="text-xl font-semibold">Uknow</span>
        </Link>

        <div className="flex items-center space-x-4">
          {!isLoggedIn ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">登入</Link>
              </Button>
              <Button asChild>
                <Link to="/register">註冊</Link>
              </Button>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{user?.name}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard" className="w-full cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    會員中心
                  </Link>
                </DropdownMenuItem>
                {isFeatureEnabled('serviceProviderManagement') && (
                  <DropdownMenuItem asChild>
                    <Link to="/service-providers" className="w-full cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      刊登管理
                    </Link>
                  </DropdownMenuItem>
                )}
                {isFeatureEnabled('referralManagement') && (
                  <DropdownMenuItem asChild>
                    <Link to="/referrals" className="w-full cursor-pointer">
                      <Users className="mr-2 h-4 w-4" />
                      推薦管理
                    </Link>
                  </DropdownMenuItem>
                )}
                {isFeatureEnabled('taskCenter') && (
                  <DropdownMenuItem asChild>
                    <Link to="/tasks" className="w-full cursor-pointer">
                      <Target className="mr-2 h-4 w-4" />
                      任務中心
                    </Link>
                  </DropdownMenuItem>
                )}
                {isFeatureEnabled('rewardSystem') && (
                  <DropdownMenuItem asChild>
                    <Link to="/rewards" className="w-full cursor-pointer">
                      <Award className="mr-2 h-4 w-4" />
                      獎勵回饋
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="w-full cursor-pointer">
                        <Shield className="mr-2 h-4 w-4" />
                        平台管理
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </nav>
  );
}