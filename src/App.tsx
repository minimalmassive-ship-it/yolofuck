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

import AuthCallbackPage from './pages/AuthCallbackPage';
import PublicSharedStoryPage from './pages/PublicSharedStoryPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { CookiePolicyPage } from './pages/CookiePolicyPage';
import { DpaPage } from './pages/DpaPage';
import { AcceptableUsePage } from './pages/AcceptableUsePage';
import { CookieBanner } from './components/legal/CookieBanner';

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
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/journal" element={user ? <JournalPage /> : <Navigate to="/" replace />} />
            <Route path="/story/:slug" element={<PublicSharedStoryPage />} />
            <Route path="/shared" element={user ? <JournalPage /> : <LandingPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/terms-of-service" element={<TermsOfServicePage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/cookies" element={<CookiePolicyPage />} />
            <Route path="/cookie-policy" element={<CookiePolicyPage />} />
            <Route path="/dpa" element={<DpaPage />} />
            <Route path="/acceptable-use" element={<AcceptableUsePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
                <CookieBanner />
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
