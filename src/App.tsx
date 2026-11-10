/**
 * App.tsx — yolofuck
 * Root component with AuthProvider and Router setup.
 * Strictly NO purple/pink colors.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import JournalPage from './pages/JournalPage';
import LandingPage from './pages/LandingPage';
import { Loader2 } from 'lucide-react';

import PublicSharedStoryPage from './pages/PublicSharedStoryPage';

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
                <span>Loading yolofuck...</span>
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/" element={user ? <JournalPage /> : <LandingPage />} />
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
