import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import FriendProfilePage from './pages/FriendProfilePage';
import BottomNav from './components/BottomNav';
import LoadingScreen from './components/LoadingScreen';
import MaintenanceBanner from './components/MaintenanceBanner';

function AdminUserModeBanner() {
  const { profile, isAdminMode, setIsAdminMode } = useAuth();
  const navigate = useNavigate();

  if (!profile?.is_admin || isAdminMode) return null;

  return (
    <div
      style={{
        background: '#1d1d1f',
        color: '#fff',
        textAlign: 'center',
        padding: '8px 12px',
        fontSize: 12,
        fontWeight: 600,
        zIndex: 300,
        position: 'sticky',
        top: 0,
      }}
    >
      ADMIN USER MODE{' '}
      <button
        type="button"
        onClick={() => {
          setIsAdminMode(true);
          navigate('/admin');
        }}
        style={{
          marginLeft: 8,
          background: '#0071e3',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 11,
          border: 'none',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        RETURN TO ADMIN
      </button>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdminMode } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  // Admins in admin mode always go to admin panel
  if (profile?.is_admin && isAdminMode) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <>
      <AdminUserModeBanner />
      <MaintenanceBanner />
      {children}
    </>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdminMode } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.is_admin) return <Navigate to="/" replace />;

  // User mode: leave admin panel and use the normal app
  if (!isAdminMode) {
    return <Navigate to="/" replace />;
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

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <HomePage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/inbox"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <InboxPage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/send"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <SendPage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <FriendsPage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/friend/:userId"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <FriendProfilePage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <ProfilePage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/store"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <StorePage />
              <BottomNav />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery/:deliveryId"
        element={
          <ProtectedRoute>
            <div className="app-shell">
              <DeliveryPage />
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />
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
