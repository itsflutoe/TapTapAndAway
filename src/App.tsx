import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './styles/global.css';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import HomePage from './pages/HomePage';
import InboxPage from './pages/InboxPage';
import SendPage from './pages/SendPage';
import FriendsPage from './pages/FriendsPage';
import ProfilePage from './pages/ProfilePage';
import StorePage from './pages/StorePage';
import AdminPage from './pages/AdminPage';
import DeliveryPage from './pages/DeliveryPage';
import BottomNav from './components/BottomNav';
import LoadingScreen from './components/LoadingScreen';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdminMode } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  if (profile?.is_admin && isAdminMode) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdminMode, setIsAdminMode } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.is_admin) return <Navigate to="/" replace />;

  if (!isAdminMode) {
    return (
      <>
        <div style={{ background: '#1d1d1f', color: '#fff', textAlign: 'center', padding: '6px', fontSize: 12, fontWeight: 600 }}>
          ADMIN USER MODE{' '}
          <button
            onClick={() => setIsAdminMode(true)}
            style={{ marginLeft: 8, background: '#0071e3', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}
          >
            RETURN TO ADMIN
          </button>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />

      <Route path="/" element={<ProtectedRoute><div className="app-shell"><HomePage /><BottomNav /></div></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><div className="app-shell"><InboxPage /><BottomNav /></div></ProtectedRoute>} />
      <Route path="/send" element={<ProtectedRoute><div className="app-shell"><SendPage /><BottomNav /></div></ProtectedRoute>} />
      <Route path="/friends" element={<ProtectedRoute><div className="app-shell"><FriendsPage /><BottomNav /></div></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><div className="app-shell"><ProfilePage /><BottomNav /></div></ProtectedRoute>} />
      <Route path="/store" element={<ProtectedRoute><div className="app-shell"><StorePage /><BottomNav /></div></ProtectedRoute>} />
      <Route path="/delivery/:deliveryId" element={<ProtectedRoute><div className="app-shell"><DeliveryPage /></div></ProtectedRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
