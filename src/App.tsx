import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomePage } from './components/HomePage';
import { ServiceProviderDetail } from './components/ServiceProviderDetail';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { MemberDashboard } from './components/MemberDashboard';
import { ServiceProviderManagement } from './components/ServiceProviderManagement';
import { CreateServiceProvider } from './components/CreateServiceProvider';
import { EditServiceProvider } from './components/EditServiceProvider';
import { ReferralManagement } from './components/ReferralManagement';
import { SubscriptionManagement } from './components/SubscriptionManagement';
import { TaskDashboard } from './components/TaskDashboard';
import { RewardDashboard } from './components/RewardDashboard';
import { EditMemberProfile } from './components/EditMemberProfile';
import { AdminDashboard } from './components/AdminDashboard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { Toaster } from './components/ui/sonner';
import { NotificationProvider } from './components/notifications/NotificationContext';

// Mock user context
export const UserContext = React.createContext<{
  user: any;
  setUser: (user: any) => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
}>({
  user: null,
  setUser: () => {},
  isLoggedIn: false,
  isAdmin: false,
});

export default function App() {
  const [user, setUser] = useState(null);
  
  // Check if user is admin (mock logic)
  const isAdmin = user?.isAdmin === true;
  const isLoggedIn = !!user;

  useEffect(() => {
    // Check for existing session (mock)
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, isLoggedIn, isAdmin }}>
      <NotificationProvider>
        <Router>
          <div className="min-h-screen bg-background">
            <Navbar />
            <main className="container mx-auto px-4 py-6">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/service-provider/:id" element={<ServiceProviderDetail />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                
                {/* Protected Member Routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <MemberDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/service-providers" element={
                  <ProtectedRoute>
                    <ServiceProviderManagement />
                  </ProtectedRoute>
                } />
                <Route path="/service-providers/create" element={
                  <ProtectedRoute>
                    <CreateServiceProvider />
                  </ProtectedRoute>
                } />
                <Route path="/service-providers/edit/:id" element={
                  <ProtectedRoute>
                    <EditServiceProvider />
                  </ProtectedRoute>
                } />
                <Route path="/referrals" element={
                  <ProtectedRoute>
                    <ReferralManagement />
                  </ProtectedRoute>
                } />
                <Route path="/subscriptions" element={
                  <ProtectedRoute>
                    <SubscriptionManagement />
                  </ProtectedRoute>
                } />
                <Route path="/tasks" element={
                  <ProtectedRoute>
                    <TaskDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/rewards" element={
                  <ProtectedRoute>
                    <RewardDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/profile/edit" element={
                  <ProtectedRoute>
                    <EditMemberProfile />
                  </ProtectedRoute>
                } />
                
                {/* Admin Routes */}
                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                } />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </Router>
        <Toaster />
      </NotificationProvider>
    </UserContext.Provider>
  );
}