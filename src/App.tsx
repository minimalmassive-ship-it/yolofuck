/**
 * App.tsx — yolofuck
 * Root component with AuthProvider and Router setup.
 * Strictly NO purple/pink colors.
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import JournalPage from './pages/JournalPage';
import LandingPage from './pages/LandingPage';
import { Loader2 } from 'lucide-react';

import PublicSharedStoryPage from './pages/PublicSharedStoryPage';

const AuthCallbackHandler: React.FC = () => {
    const { user } = useAuth();

    useEffect(() => {
        const timer = setTimeout(() => {
            window.location.href = '/journal';
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

    if (user) {
        return <Navigate to="/journal" replace />;
    }

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            background: '#12110F',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            color: '#F5F5F4',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <Loader2 size={28} className="vizja-spin" color="#C8F931" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Connecting Plasticin ID...</span>
        </div>
    );
};

const AppRoutes: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                background: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: '#94a3b8',
                fontSize: '14px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <Loader2 size={24} className="vizja-spin" color="#10b981" />
                <span>Loading Memcut...</span>
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/" element={user ? <JournalPage /> : <LandingPage />} />
            <Route path="/login" element={user ? <Navigate to="/journal" replace /> : <LandingPage initialAuthMode="signin" />} />
            <Route path="/signin" element={user ? <Navigate to="/journal" replace /> : <LandingPage initialAuthMode="signin" />} />
            <Route path="/signup" element={user ? <Navigate to="/journal" replace /> : <LandingPage initialAuthMode="signup" />} />
            <Route path="/join" element={user ? <Navigate to="/journal" replace /> : <LandingPage initialAuthMode="signup" />} />
            <Route path="/auth/callback" element={<AuthCallbackHandler />} />
            <Route path="/journal" element={user ? <JournalPage /> : <Navigate to="/" replace />} />
            <Route path="/story/:slug" element={<PublicSharedStoryPage />} />
            <Route path="/shared" element={user ? <JournalPage /> : <LandingPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
