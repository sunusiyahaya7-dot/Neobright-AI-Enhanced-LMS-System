import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import ProtectedRoute from './auth/ProtectedRoute';
import './index.css';

// Example Dashboard component (placeholder)
const Dashboard = () => {
  const { user } = useAuth();
  const { logoutUser } = useAuthService();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Welcome to NeoBright
            </h1>
            <button
              onClick={logoutUser}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-300">
              Hello, <strong>{user?.email}</strong>
            </p>
            <p className="text-gray-600 dark:text-gray-300">
              User ID: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{user?.uid}</code>
            </p>
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                🎉 Authentication Successful!
              </h2>
              <p className="text-blue-700 dark:text-blue-300">
                You are now logged in and can access protected routes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Import useAuth here since it's used in Dashboard
import { useAuth } from './auth/AuthContext';
import { logout as logoutUser } from './services/authService';

// Create a custom hook for auth service
const useAuthService = () => {
  return { logoutUser };
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={() => window.location.href = '/dashboard'} />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
