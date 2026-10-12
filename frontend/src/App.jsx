import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Incidents from './pages/Incidents';
import ServiceRequests from './pages/ServiceRequests';
import Problems from './pages/Problems';
import Changes from './pages/Changes';
import CMDB from './pages/CMDB';
import KnowledgeBase from './pages/KnowledgeBase';
import Admin from './pages/Admin';
import Landing from './marketing/Landing';
import Pricing from './marketing/Pricing';
import TrialSignup from './marketing/TrialSignup';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-ink/50">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* Public marketing site */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/start" element={<TrialSignup />} />
      <Route
        path="/login"
        element={loading ? null : user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Authenticated app */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
      <Route path="/service-requests" element={<ProtectedRoute><ServiceRequests /></ProtectedRoute>} />
      <Route path="/problems" element={<ProtectedRoute roles={['admin', 'agent']}><Problems /></ProtectedRoute>} />
      <Route path="/changes" element={<ProtectedRoute><Changes /></ProtectedRoute>} />
      <Route path="/cmdb" element={<ProtectedRoute roles={['admin', 'agent']}><CMDB /></ProtectedRoute>} />
      <Route path="/knowledge" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
