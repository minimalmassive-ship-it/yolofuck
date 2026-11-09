/**
 * App.tsx — yolofuck
 * Root component with AuthProvider and Router setup.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import JournalPage from './pages/JournalPage';

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<JournalPage />} />
                    <Route path="/journal" element={<Navigate to="/" replace />} />
                    <Route path="/story/:date" element={<JournalPage />} />
                    <Route path="/shared" element={<JournalPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
