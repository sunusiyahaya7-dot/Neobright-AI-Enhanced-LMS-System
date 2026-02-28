import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import CourseContent from './pages/CourseContent';
import Analytics from './pages/Analytics';
import AIDashboard from './pages/AIDashboard';
import AIInsights from './pages/AIInsights';
import Settings from './pages/Settings';
import ProtectedRoute from './auth/ProtectedRoute';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/courses"
            element={
              <ProtectedRoute>
                <Courses />
              </ProtectedRoute>
            }
          />

          <Route
            path="/courses/:id"
            element={
              <ProtectedRoute>
                <CourseContent />
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ai-dashboard"
            element={
              <ProtectedRoute>
                <AIDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ai-insights"
            element={
              <ProtectedRoute>
                <AIInsights />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Catch-all: redirect unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
