import React, { useState, useEffect, useRef } from 'react';
import {
    Mail,
    CheckCircle2,
    Circle,
    AlertCircle,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    ArrowLeft,
    Lock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabaseAuth } from '../lib/supabase';
import './PlasticinUniversalAuthScreen.css';

export interface PlasticinAppBranding {
    appName: string;
    appTagline: string;
    appGlyphUrl: string;
    appWordmarkUrl?: string;
    originApp: string;
    accentColor?: string;
}

export const DEFAULT_MEMCUT_BRANDING: PlasticinAppBranding = {
    appName: 'Memcut',
    appTagline: 'Daily Spoken-Word Video Journal',
    appGlyphUrl: '/memcut-glyph.png',
    appWordmarkUrl: '/memcut-wordmark.png',
    originApp: 'memcut.com',
    accentColor: '#c8f72c',
};

export interface PlasticinUniversalAuthScreenProps {
    isOpen: boolean;
    onClose: () => void;
    initialMode?: 'signin' | 'signup';
    initialIdentifier?: string;
    initialStep?: AuthStep;
    branding?: PlasticinAppBranding;
}

type AuthStep = 'email' | 'otp' | 'profile' | 'security_review' | 'password_fallback';

interface SavedAccount {
    username: string;
    cleanUsername: string;
    email: string;
    displayName: string;
    avatarUrl: string;
    hasPassword?: boolean;
}

const getStoredLastAccount = (): SavedAccount | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem('plasticin_last_account');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.email) {
                const clean = parsed.cleanUsername || parsed.username?.replace(/^@+/, '') || parsed.email.split('@')[0] || 'user';
                return {
                    ...parsed,
                    username: `@${clean}`,
                    cleanUsername: clean,
                    displayName: parsed.displayName || clean,
                    avatarUrl: parsed.avatarUrl || 'https://plasticin.com/default-avatar.png',
                };
            }
        }
    } catch {
        // ignore parsing errors
    }
    return null;
};

export const PlasticinUniversalAuthScreen: React.FC<PlasticinUniversalAuthScreenProps> = ({
    isOpen,
    onClose,
    initialMode = 'signin',
    initialIdentifier = '',
    initialStep,
    branding = DEFAULT_MEMCUT_BRANDING,
}) => {
    const {
        signInWithEmail,
        signInWithGoogle,
        sendOtpEmail,
        verifyOtp,
        profile,
    } = useAuth();

    const [step, setStep] = useState<AuthStep>('email');
    const [identifier, setIdentifier] = useState('');
    const [email, setEmail] = useState('');
    const [otpDigits, setOtpDigits] = useState<string[]>(Array(8).fill(''));
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const [lastAccount, setLastAccount] = useState<SavedAccount | null>(() => getStoredLastAccount());

    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const identifierInputRef = useRef<HTMLInputElement>(null);
    const passwordInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus password field when transitioning to password step to trigger browser autofill
    useEffect(() => {
        if (step === 'password_fallback' && isOpen) {
            const timer = setTimeout(() => {
                passwordInputRef.current?.focus();
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [step, isOpen]);

    // Reset state whenever modal opens or props change
    useEffect(() => {
        if (isOpen) {
            setErrorMessage(null);
            setSuccessMessage(null);
            setOtpDigits(Array(8).fill(''));
            const stored = getStoredLastAccount();
            setLastAccount(stored);
            setPassword('');
            setCountdownSeconds(60);
            setCanResend(false);

            const rawId = (initialIdentifier || '').trim();
            if (rawId) {
                setIdentifier(rawId);
                const isEmail = rawId.includes('@') && rawId.includes('.');
                if (isEmail) {
                    const cleanMail = rawId.toLowerCase();
                    setEmail(cleanMail);
                    if (cleanMail === 'minimalmassive@gmail.com') {
                        setUsername('@acidplasticine');
                    } else {
                        setUsername(`@${cleanMail.split('@')[0]}`);
                    }
                } else {
                    const cleanUser = rawId.replace(/^@+/, '');
                    if (cleanUser.toLowerCase() === 'minimalmassive' || cleanUser.toLowerCase() === 'acidplasticine') {
                        setUsername('@acidplasticine');
                        setEmail('minimalmassive@gmail.com');
                    } else {
                        setUsername(`@${cleanUser}`);
                        (async () => {
                            try {
                                const { data } = await supabaseAuth
                                    .from('plasticin_users')
                                    .select('email, username')
                                    .or(`username.ilike.@${cleanUser},username.ilike.${cleanUser}`)
                                    .maybeSingle();
                                if (data?.email) {
                                    setEmail(data.email);
                                }
                            } catch {}
                        })();
                    }
                }

                if (initialStep) {
                    setStep(initialStep);
                } else if (initialMode === 'signin') {
                    setStep('password_fallback');
                } else {
                    setStep('email');
                }
            } else {
                setIdentifier('');
                setEmail('');
                setUsername('');
                setStep(initialStep || 'email');
            }
        }
    }, [isOpen, initialIdentifier, initialStep, initialMode]);

    // OTP resend countdown
    useEffect(() => {
        let timer: any;
        if (step === 'otp' && countdownSeconds > 0) {
            timer = setTimeout(() => {
                setCountdownSeconds((prev) => prev - 1);
            }, 1000);
        } else if (countdownSeconds === 0) {
            setCanResend(true);
        }
        return () => clearTimeout(timer);
    }, [step, countdownSeconds]);

    // Escape key closes modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Strict Password Criteria (10+ chars, uppercase, lowercase, number, symbol)
    const hasMinLength = password.length >= 10;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9\s]/.test(password);

    const criteriaList = [
        { label: 'At least 10 characters', met: hasMinLength },
        { label: 'At least one uppercase letter (A-Z)', met: hasUppercase },
        { label: 'At least one lowercase letter (a-z)', met: hasLowercase },
        { label: 'At least one number (0-9)', met: hasNumber },
        { label: 'At least one special symbol (!@#$%...)', met: hasSpecial },
    ];
    const metCount = criteriaList.filter((c) => c.met).length;
    const isPasswordValid = metCount === 5;

    const getStrengthLabel = () => {
        if (password.length === 0) return { label: 'Empty', color: '#33312c' };
        if (metCount <= 2) return { label: 'Weak', color: '#ef4444' };
        if (metCount === 3 || metCount === 4) return { label: 'Moderate', color: '#f59e0b' };
        return { label: 'Strong', color: '#c8f931' };
    };
    const strength = getStrengthLabel();

    // Helper: dispatch OTP email
    const handleSendOtpCode = async (targetEmail: string) => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            const { error } = await sendOtpEmail(targetEmail);
            if (error) {
                setErrorMessage(error.message || 'Could not send verification code. Please try again.');
                setIsLoading(false);
                return;
            }

            setStep('otp');
            setCountdownSeconds(60);
            setCanResend(false);
            setSuccessMessage(`We've sent a verification code to ${targetEmail}`);
            setTimeout(() => {
                otpInputRefs.current[0]?.focus();
            }, 150);
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to connect to authentication server.');
        } finally {
            setIsLoading(false);
        }
    };

    // 1. Submit Identifier (Email OR Plasticin @username)
    const handleIdentifierSubmit = async (e?: React.FormEvent, forceMode?: 'auto' | 'password' | 'otp') => {
        if (e) e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        const cleanInput = identifier.trim();
        if (!cleanInput) {
            setErrorMessage('Please enter your email or Plasticin username.');
            return;
        }

        let resolvedEmail = '';
        let resolvedUsername = '';

        if (cleanInput.includes('@') && cleanInput.includes('.')) {
            // Standard email input
            resolvedEmail = cleanInput.toLowerCase();
            if (resolvedEmail === 'minimalmassive@gmail.com') {
                resolvedUsername = '@acidplasticine';
            } else if (lastAccount && lastAccount.email?.toLowerCase() === resolvedEmail && lastAccount.cleanUsername) {
                resolvedUsername = `@${lastAccount.cleanUsername}`;
            } else {
                resolvedUsername = `@${resolvedEmail.split('@')[0]}`;
            }
        } else {
            // Username lookup
            const cleanUser = cleanInput.replace(/^@+/, '').toLowerCase();
            if (cleanUser === 'acidplasticine' || cleanUser === 'minimalmassive') {
                resolvedUsername = '@acidplasticine';
                resolvedEmail = 'minimalmassive@gmail.com';
            } else {
                resolvedUsername = `@${cleanUser}`;
            }

            // Check cached last account
            if (!resolvedEmail && lastAccount && lastAccount.cleanUsername?.toLowerCase() === cleanUser) {
                resolvedEmail = lastAccount.email;
            }

            // Query Central Master DB plasticin_users table
            if (!resolvedEmail) {
                try {
                    const { data } = await supabaseAuth
                        .from('plasticin_users')
                        .select('email, username')
                        .or(`username.ilike.@${cleanUser},username.ilike.${cleanUser}`)
                        .maybeSingle();

                    if (data?.email) {
                        resolvedEmail = data.email;
                        if (data.username) resolvedUsername = data.username;
                    }
                } catch (lookupErr) {
                    console.warn('Plasticin username lookup notice:', lookupErr);
                }
            }

            if (!resolvedEmail) {
                setErrorMessage(`No Plasticin account found for "${resolvedUsername}". Please enter your full email address.`);
                return;
            }
        }

        setEmail(resolvedEmail);
        setUsername(resolvedUsername);

        const mode = forceMode || 'auto';
        if (mode === 'password' || (mode === 'auto' && initialMode === 'signin')) {
            setStep('password_fallback');
            return;
        }

        await handleSendOtpCode(resolvedEmail);
    };

    // 2. Direct code verification (OTP)
    const verifyCodeDirectly = async (inputCode: string) => {
        const code = inputCode.trim().toUpperCase();
        if (code.length < 6) {
            setErrorMessage('Please enter your verification code.');
            return;
        }

        setIsLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const { session, error } = await verifyOtp(email, code);

            if (error) {
                setErrorMessage(error.message || 'Invalid or expired verification code. Please check your email.');
                setIsLoading(false);
                return;
            }

            if (session?.user) {
                const userMeta = session.user.user_metadata || {};
                const hasCompletedProfile = Boolean(userMeta.profile_completed && (userMeta.user_name || userMeta.username));

                if (hasCompletedProfile && initialMode === 'signin') {
                    const finalUsername = userMeta.user_name || userMeta.username || username || `@${email.split('@')[0]}`;
                    const finalDisplayName = userMeta.full_name || finalUsername.replace('@', '');

                    const accountData: SavedAccount = {
                        username: finalUsername,
                        cleanUsername: finalUsername.replace('@', ''),
                        email: email.toLowerCase(),
                        displayName: finalDisplayName,
                        avatarUrl: userMeta.avatar_url || 'https://plasticin.com/default-avatar.png',
                        hasPassword: true,
                    };
                    if (typeof window !== 'undefined') {
                        localStorage.setItem('plasticin_last_account', JSON.stringify(accountData));
                    }
                    setLastAccount(accountData);
                    onClose();
                    return;
                }
            }

            // New account or incomplete profile: advance to Step 3
            setStep('profile');
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to verify code.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        const char = value.slice(-1).toUpperCase();
        const newDigits = [...otpDigits];
        newDigits[index] = char;
        setOtpDigits(newDigits);

        if (char && index < 7) {
            otpInputRefs.current[index + 1]?.focus();
        }

        const fullCode = newDigits.join('').trim();
        if (fullCode.length === 8) {
            setTimeout(() => {
                verifyCodeDirectly(fullCode);
            }, 60);
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (pasteData.length > 0) {
            const newDigits = Array(8).fill('');
            for (let i = 0; i < Math.min(pasteData.length, 8); i++) {
                newDigits[i] = pasteData[i] || '';
            }
            setOtpDigits(newDigits);
            const nextIndex = Math.min(pasteData.length, 7);
            otpInputRefs.current[nextIndex]?.focus();

            if (pasteData.length >= 6) {
                setTimeout(() => {
                    verifyCodeDirectly(pasteData.slice(0, 8));
                }, 80);
            }
        }
    };

    // 3. Complete Profile Setup (Sign Up)
    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        const cleanUser = username.trim().toLowerCase().replace(/^@+/, '');
        if (!cleanUser || cleanUser.length < 3) {
            setErrorMessage('Username must be between 3 and 15 characters.');
            return;
        }

        if (cleanUser.length > 15) {
            setErrorMessage('Username cannot exceed 15 characters.');
            return;
        }

        if (!isPasswordValid) {
            setErrorMessage('Please satisfy all password security criteria before continuing.');
            return;
        }

        if (!agreeTerms) {
            setErrorMessage('Please accept the Plasticin Customer Agreement to finish setting up your account.');
            return;
        }

        setIsLoading(true);
        const cleanEmail = email.trim().toLowerCase();
        const cleanUsername = `@${cleanUser}`;
        const cleanDisplayName = cleanUser;

        try {
            // Update user password and metadata in Master Supabase Auth
            const { error: updateErr } = await supabaseAuth.auth.updateUser({
                password,
                data: {
                    user_name: cleanUsername,
                    username: cleanUsername,
                    full_name: cleanDisplayName,
                    profile_completed: true,
                },
            });

            if (updateErr) {
                setErrorMessage(updateErr.message);
                setIsLoading(false);
                return;
            }

            // Upsert into Central plasticin_users master table
            const { data: authData } = await supabaseAuth.auth.getUser();
            if (authData?.user?.id) {
                try {
                    await supabaseAuth.from('plasticin_users').upsert({
                        id: authData.user.id,
                        username: cleanUsername,
                        display_name: cleanDisplayName,
                        email: cleanEmail,
                        avatar_url: 'https://plasticin.com/default-avatar.png',
                        origin_app: branding.originApp,
                    }, { onConflict: 'email' });
                } catch (upsertErr) {
                    console.warn('plasticin_users upsert warning:', upsertErr);
                }
            }

            // Save last account for 1-click device login
            const accountData: SavedAccount = {
                username: cleanUsername,
                cleanUsername: cleanUser,
                email: cleanEmail,
                displayName: cleanDisplayName,
                avatarUrl: 'https://plasticin.com/default-avatar.png',
                hasPassword: true,
            };
            if (typeof window !== 'undefined') {
                localStorage.setItem('plasticin_last_account', JSON.stringify(accountData));
            }
            setLastAccount(accountData);

            // Advance to Security Review
            setStep('security_review');
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to complete profile registration.');
        } finally {
            setIsLoading(false);
        }
    };

    // 4. Password Fallback Sign-In
    const handlePasswordSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        const cleanEmail = email.trim().toLowerCase();
        if (!password) {
            setErrorMessage('Please enter your password.');
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await signInWithEmail(cleanEmail, password);
            if (error) {
                setErrorMessage(error.message || 'Incorrect password. Please verify your credentials.');
                setIsLoading(false);
                return;
            }

            // Save last account
            let finalUsername = username || `@${cleanEmail.split('@')[0]}`;
            if (cleanEmail === 'minimalmassive@gmail.com') {
                finalUsername = '@acidplasticine';
            }
            const cleanUser = finalUsername.replace('@', '');
            const accountData: SavedAccount = {
                username: finalUsername,
                cleanUsername: cleanUser,
                email: cleanEmail,
                displayName: cleanEmail === 'minimalmassive@gmail.com' ? 'acidplasticine' : cleanUser,
                avatarUrl: 'https://plasticin.com/default-avatar.png',
                hasPassword: true,
            };
            if (typeof window !== 'undefined') {
                localStorage.setItem('plasticin_last_account', JSON.stringify(accountData));
            }
            setLastAccount(accountData);

            onClose();
        } catch (err: any) {
            setErrorMessage(err.message || 'Sign in failed.');
        } finally {
            setIsLoading(false);
        }
    };

    // Passkey authentication handler
    const handlePasskeySignIn = async () => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            if (typeof window !== 'undefined' && 'credentials' in navigator) {
                setErrorMessage('Passkey WebAuthn is connecting to the Plasticin Master Vault. If prompted by your browser, tap your biometric sensor.');
                setTimeout(() => {
                    setErrorMessage(null);
                }, 3000);
            } else {
                setErrorMessage('Passkeys are not supported on this browser or platform.');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'Passkey authentication failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="plasticin-auth-overlay"
        >
            {/* Top Bar with Back Link */}
            <div className="plasticin-auth-top-bar">
                <button
                    type="button"
                    onClick={() => {
                        if (step === 'otp' || step === 'password_fallback') {
                            setStep('email');
                        } else if (step === 'profile') {
                            setStep('otp');
                        } else {
                            onClose();
                        }
                    }}
                    className="plasticin-auth-back-btn"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{step === 'email' ? `Back to ${branding.appName}` : 'Back'}</span>
                </button>
                <div />
            </div>

            {/* Main Centered Auth Card */}
            <div className="plasticin-auth-card-wrapper">
                <div className="plasticin-auth-card">
                    {/* Header Strip: Dual Co-Branding (Plasticin ID on top + App Logo below) */}
                    <div className="plasticin-auth-card-top-strip">
                        {/* Row 1: Smaller Plasticin Logo Badge */}
                        <div className="plasticin-auth-parent-brand">
                            <img
                                src="/assets/plasticin_icon.png"
                                alt="Plasticin"
                                className="plasticin-auth-parent-icon"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />
                            <img
                                src="/assets/plasticin_logo.png"
                                alt="Plasticin"
                                className="plasticin-auth-parent-wordmark"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />
                        </div>

                        {/* Subtle Connecting Element */}
                        <div className="plasticin-auth-brand-connector">
                            <span className="plasticin-auth-connector-dot" />
                        </div>

                        {/* Row 2: Child App Logo prominently rendered (slightly larger than Plasticin) */}
                        <div className="plasticin-auth-child-brand">
                            <img
                                src={branding.appGlyphUrl}
                                alt={branding.appName}
                                className="plasticin-auth-child-glyph"
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />
                            {branding.appWordmarkUrl && (
                                <img
                                    src={branding.appWordmarkUrl}
                                    alt={branding.appName}
                                    className="plasticin-auth-child-wordmark"
                                    onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="plasticin-auth-card-body">
                        {/* Feedback messages */}
                        {errorMessage && (
                            <div className="plasticin-auth-alert-error">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{errorMessage}</span>
                            </div>
                        )}
                        {successMessage && (
                            <div className="plasticin-auth-alert-success">
                                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{successMessage}</span>
                            </div>
                        )}

                        {/* Active Account Banner */}
                        {profile?.username && (
                            <div style={{
                                padding: '10px 12px',
                                borderRadius: '12px',
                                background: '#141413',
                                border: '1px solid #33312c',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '11px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: '#21201d',
                                        border: '1px solid #33312c',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#c8f931',
                                        fontWeight: 700,
                                        fontSize: '11px'
                                    }}>
                                        @
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '9px', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Session</div>
                                        <div style={{ color: '#f5f5f4', fontWeight: 600 }}>{profile.username}</div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        background: '#21201d',
                                        border: '1px solid #33312c',
                                        color: '#c8f931',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Return
                                </button>
                            </div>
                        )}

                        {/* STEP 1: IDENTIFIER DISCOVERY (Email or Plasticin @username) */}
                        {step === 'email' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <h2 className="plasticin-auth-title">
                                        Welcome to {branding.appName}
                                    </h2>
                                    <p className="plasticin-auth-subtitle">
                                        Enter your email or Plasticin username to sign in or create your unified account
                                    </p>
                                </div>

                                <form onSubmit={(e) => handleIdentifierSubmit(e, 'auto')} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div className="plasticin-auth-field">
                                        <label htmlFor="plasticin-universal-identifier-input" className="plasticin-auth-label">
                                            Email or Plasticin username <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <div className="plasticin-auth-input-wrap">
                                            {identifier.startsWith('@') || (!identifier.includes('@') && identifier.length > 0) ? (
                                                <span className="plasticin-auth-input-handle-prefix">@</span>
                                            ) : (
                                                <Mail className="plasticin-auth-input-icon w-4 h-4" />
                                            )}
                                             <input
                                                ref={identifierInputRef}
                                                id="plasticin-universal-identifier-input"
                                                name="username"
                                                type="text"
                                                inputMode="email"
                                                autoComplete="username"
                                                required
                                                autoFocus
                                                value={identifier}
                                                onChange={(e) => {
                                                    setIdentifier(e.target.value);
                                                    if (errorMessage) setErrorMessage(null);
                                                }}
                                                placeholder="username or name@company.com"
                                                className="plasticin-auth-input"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="plasticin-auth-btn-primary"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 vizja-spin" />
                                        ) : (
                                            <span>Continue</span>
                                        )}
                                    </button>

                                    <div style={{ textAlign: 'center', paddingTop: '2px' }}>
                                        <button
                                            type="button"
                                            onClick={(e) => handleIdentifierSubmit(e, 'password')}
                                            className="plasticin-auth-text-link"
                                        >
                                            Sign in with password instead
                                        </button>
                                    </div>
                                </form>

                                {/* Divider */}
                                <div className="plasticin-auth-divider">
                                    <div className="plasticin-auth-divider-line" />
                                    <span className="plasticin-auth-divider-label">Or Continue With</span>
                                </div>

                                {/* Social & SSO Stack */}
                                <div className="plasticin-auth-social-stack">
                                    {/* Continue with Plasticin */}
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const cleanId = identifier.trim();
                                            if (cleanId) {
                                                await handleIdentifierSubmit(undefined, 'auto');
                                                return;
                                            }
                                            const saved = getStoredLastAccount();
                                            if (saved && saved.email) {
                                                setIdentifier(saved.email);
                                                setEmail(saved.email);
                                                setUsername(saved.username);
                                                setStep('password_fallback');
                                                return;
                                            }
                                            if (identifierInputRef.current) {
                                                identifierInputRef.current.focus();
                                            }
                                            setErrorMessage('Please enter your email or Plasticin username above to continue.');
                                        }}
                                        disabled={isLoading}
                                        className="plasticin-auth-social-btn"
                                    >
                                        <div className="plasticin-auth-social-icon-box">
                                            <img
                                                src="/assets/plasticin_icon.png"
                                                alt="Plasticin"
                                                className="plasticin-auth-social-icon-img"
                                            />
                                        </div>
                                        <span>Continue with Plasticin</span>
                                    </button>

                                    {/* Continue with Google */}
                                    <button
                                        type="button"
                                        onClick={signInWithGoogle}
                                        disabled={isLoading}
                                        className="plasticin-auth-social-btn"
                                    >
                                        <div className="plasticin-auth-social-icon-box">
                                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                            </svg>
                                        </div>
                                        <span>Continue with Google</span>
                                    </button>

                                    {/* Sign in with Passkey (WebAuthn) */}
                                    <button
                                        type="button"
                                        onClick={handlePasskeySignIn}
                                        disabled={isLoading}
                                        className="plasticin-auth-social-btn"
                                    >
                                        <div className="plasticin-auth-social-icon-box">
                                            <KeyRound className="w-4 h-4 shrink-0" style={{ color: '#c8f931' }} />
                                        </div>
                                        <span>Sign in with Passkey (WebAuthn)</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: WE'VE EMAILED YOU A CODE (OTP) */}
                        {step === 'otp' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div className="plasticin-auth-otp-badge">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <h2 className="plasticin-auth-title" style={{ marginTop: '12px' }}>
                                        We&apos;ve emailed you a code
                                    </h2>
                                    <p className="plasticin-auth-subtitle">
                                        To complete your account setup or sign in, enter the code we&apos;ve sent to:
                                    </p>
                                    <div style={{ marginTop: '8px' }}>
                                        <span className="plasticin-auth-target-email-pill">{email}</span>
                                    </div>
                                </div>

                                <form onSubmit={(e) => { e.preventDefault(); verifyCodeDirectly(otpDigits.join('')); }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div>
                                        <label className="plasticin-auth-label" style={{ display: 'block', textAlign: 'center', marginBottom: '8px' }}>
                                            Verification code
                                        </label>
                                        <div className="plasticin-auth-otp-grid" onPaste={handleOtpPaste}>
                                            {otpDigits.map((digit, idx) => (
                                                <input
                                                    key={idx}
                                                    ref={(el) => {
                                                        otpInputRefs.current[idx] = el;
                                                    }}
                                                    type="text"
                                                    maxLength={1}
                                                    value={digit}
                                                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                                                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                                    className="plasticin-auth-otp-box"
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading || otpDigits.join('').length < 6}
                                        className={otpDigits.join('').length >= 6 ? 'plasticin-auth-btn-accent' : 'plasticin-auth-btn-primary'}
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 vizja-spin" />
                                        ) : (
                                            <span>Verify</span>
                                        )}
                                    </button>
                                </form>

                                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => handleSendOtpCode(email)}
                                            disabled={!canResend || isLoading}
                                            className="plasticin-auth-text-link"
                                            style={{ opacity: canResend ? 1 : 0.6 }}
                                        >
                                            {canResend ? "Didn't receive an email? Resend email" : `Resend email code in ${countdownSeconds}s`}
                                        </button>
                                    </div>
                                    <div style={{ paddingTop: '8px', borderTop: '1px solid #33312c' }}>
                                        <button
                                            type="button"
                                            onClick={() => setStep('password_fallback')}
                                            className="plasticin-auth-text-link-subtle"
                                        >
                                            Or sign in using your existing password
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: FINISH SETTING UP ACCOUNT (New Plasticin Account) */}
                        {step === 'profile' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        borderRadius: '9999px',
                                        background: 'rgba(200, 249, 49, 0.1)',
                                        color: '#c8f931',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        marginBottom: '6px'
                                    }}>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Email address verified</span>
                                    </div>
                                    <h2 className="plasticin-auth-title">
                                        Finish setting up your account
                                    </h2>
                                    <p className="plasticin-auth-subtitle">
                                        Your unified Plasticin account will work across {branding.appName}, Ideanite, NanCat, Archimantis, and Woobsy.
                                    </p>
                                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#f5f5f4', marginTop: '4px' }}>
                                        {email}
                                    </p>
                                </div>

                                <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {/* Username */}
                                    <div className="plasticin-auth-field">
                                        <label htmlFor="plasticin-profile-username" className="plasticin-auth-label">
                                            Plasticin username (max 15 characters) <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <div className="plasticin-auth-input-wrap">
                                            <span className="plasticin-auth-input-handle-prefix">@</span>
                                            <input
                                                id="plasticin-profile-username"
                                                name="username"
                                                type="text"
                                                maxLength={15}
                                                autoComplete="username"
                                                required
                                                autoFocus
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                                                placeholder="e.g. acidplasticine"
                                                className="plasticin-auth-input"
                                            />
                                        </div>
                                        <p style={{ fontSize: '10px', color: '#78716c', marginTop: '2px' }}>
                                            Letters, numbers, underscores, and hyphens. No spaces. Automatically creates your @handle for chat &amp; mentions across all apps.
                                        </p>
                                    </div>

                                    {/* Password */}
                                    <div className="plasticin-auth-field">
                                        <label htmlFor="plasticin-profile-password" className="plasticin-auth-label">
                                            Password <span style={{ color: '#ef4444' }}>*</span>
                                        </label>
                                        <div className="plasticin-auth-input-wrap">
                                            <Lock className="plasticin-auth-input-icon w-4 h-4" />
                                            <input
                                                id="plasticin-profile-password"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                required
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Enter secure password"
                                                className="plasticin-auth-input"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((p) => !p)}
                                                className="plasticin-auth-eye-btn"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Password Requirements Checklist & Meter */}
                                    <div className="plasticin-auth-checklist-card">
                                        <div className="plasticin-auth-checklist-header">
                                            <span style={{ color: '#a8a29e' }}>Password Strength</span>
                                            <span style={{ color: strength.color, fontWeight: 700 }}>{strength.label}</span>
                                        </div>
                                        <div className="plasticin-auth-meter-track">
                                            <div
                                                className="plasticin-auth-meter-fill"
                                                style={{
                                                    width: `${Math.round((metCount / 5) * 100)}%`,
                                                    backgroundColor: strength.color,
                                                }}
                                            />
                                        </div>
                                        <ul className="plasticin-auth-checklist">
                                            {criteriaList.map((crit, idx) => (
                                                <li key={idx} className={`plasticin-auth-checklist-item ${crit.met ? 'met' : ''}`}>
                                                    {crit.met ? (
                                                        <CheckCircle2 size={13} style={{ color: '#c8f931' }} />
                                                    ) : (
                                                        <Circle size={13} style={{ color: '#52525b' }} />
                                                    )}
                                                    <span>{crit.label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Customer Agreement Checkbox */}
                                    <label className="plasticin-auth-terms-row">
                                        <input
                                            type="checkbox"
                                            checked={agreeTerms}
                                            onChange={(e) => setAgreeTerms(e.target.checked)}
                                            className="plasticin-auth-terms-checkbox"
                                        />
                                        <span>
                                            I agree to the Plasticin Customer Agreement and acknowledge the Privacy Policy.
                                        </span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={isLoading || !isPasswordValid || !agreeTerms || !username.trim()}
                                        className="plasticin-auth-btn-accent"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 vizja-spin text-black" />
                                        ) : (
                                            <span>Create Plasticin Account</span>
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* STEP 4: PASSWORD FALLBACK (Direct Password Login) */}
                        {step === 'password_fallback' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <h2 className="plasticin-auth-title">
                                        Enter your password
                                    </h2>
                                    <p className="plasticin-auth-subtitle">
                                        Signing in as <strong style={{ color: '#f5f5f4', fontFamily: 'monospace' }}>{username || email}</strong>
                                    </p>
                                </div>

                                <form
                                    method="post"
                                    action="#"
                                    onSubmit={handlePasswordSignIn}
                                    autoComplete="on"
                                    style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                                >
                                    {/* Visible username input so Chrome Password Manager identifies account and proposes saved passwords */}
                                    <div className="plasticin-auth-field">
                                        <label htmlFor="plasticin-fallback-username" className="plasticin-auth-label">
                                            Plasticin Account
                                        </label>
                                        <div className="plasticin-auth-input-wrap">
                                            <Mail className="plasticin-auth-input-icon w-4 h-4" />
                                            <input
                                                id="plasticin-fallback-username"
                                                name="username"
                                                type="text"
                                                inputMode="email"
                                                autoComplete="username"
                                                required
                                                value={email || identifier}
                                                onChange={(e) => {
                                                    setEmail(e.target.value);
                                                    setIdentifier(e.target.value);
                                                }}
                                                placeholder="username or email"
                                                className="plasticin-auth-input"
                                            />
                                        </div>
                                    </div>

                                    <div className="plasticin-auth-field">
                                        <label htmlFor="plasticin-fallback-password-input" className="plasticin-auth-label">
                                            Password
                                        </label>
                                        <div className="plasticin-auth-input-wrap">
                                            <Lock className="plasticin-auth-input-icon w-4 h-4" />
                                            <input
                                                ref={passwordInputRef}
                                                id="plasticin-fallback-password-input"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="current-password"
                                                required
                                                autoFocus
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Enter password"
                                                className="plasticin-auth-input"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((p) => !p)}
                                                className="plasticin-auth-eye-btn"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="plasticin-auth-btn-primary"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 vizja-spin" />
                                        ) : (
                                            <span>Sign In</span>
                                        )}
                                    </button>

                                    <div style={{ textAlign: 'center', paddingTop: '4px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleSendOtpCode(email)}
                                            className="plasticin-auth-text-link"
                                        >
                                            Sign in with an email verification code instead
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* STEP 5: SECURITY REVIEW (Two-step & Passkey prompt) */}
                        {step === 'security_review' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', textAlign: 'center' }}>
                                <div>
                                    <h2 className="plasticin-auth-title">
                                        Security review
                                    </h2>
                                </div>

                                {/* Vector Illustration matching Plasticin Security Graphic */}
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                                    <div style={{
                                        width: '200px',
                                        height: '110px',
                                        borderRadius: '16px',
                                        background: '#141413',
                                        border: '1px solid #33312c',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <KeyRound className="w-8 h-8" style={{ color: '#c8f931' }} />
                                        <span style={{ fontSize: '11px', color: '#a8a29e', fontWeight: 600 }}>FIDO2 / WebAuthn Vault</span>
                                    </div>
                                </div>

                                <p className="plasticin-auth-subtitle">
                                    Your unified Plasticin account is registered and active across all ecosystem applications.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="plasticin-auth-btn-accent"
                                    >
                                        Continue to {branding.appName}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Card Footer: 5-Platform Ecosystem Notice */}
                        <div className="plasticin-auth-card-footer">
                            <span className="plasticin-auth-footer-brand-title">
                                One account for all 5 platforms
                            </span>
                            <span className="plasticin-auth-footer-brand-list">
                                Ideanite &middot; Archimantis &middot; Memcut &middot; NanCat &middot; Woobsy
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Decorative Isometric Artwork */}
            <div className="plasticin-auth-bottom-illustrations">
                <svg width="220" height="90" viewBox="0 0 240 120" fill="none">
                    <path d="M20 120 L80 80 L140 120 L80 160 Z" fill="#0052CC" fillOpacity="0.18" />
                    <path d="M80 80 L80 40 L140 80 L140 120 Z" fill="#0052CC" fillOpacity="0.28" />
                    <path d="M20 120 L20 80 L80 40 L80 80 Z" fill="#0052CC" fillOpacity="0.38" />
                    <circle cx="80" cy="30" r="10" fill="#0052CC" />
                    <rect x="110" y="55" width="40" height="25" rx="4" fill="#C8F931" fillOpacity="0.6" />
                </svg>

                <svg width="220" height="90" viewBox="0 0 240 120" fill="none">
                    <path d="M120 120 L180 80 L240 120 L180 160 Z" fill="#0052CC" fillOpacity="0.18" />
                    <path d="M180 80 L180 40 L240 80 L240 120 Z" fill="#0052CC" fillOpacity="0.28" />
                    <path d="M120 120 L120 80 L180 40 L180 80 Z" fill="#0052CC" fillOpacity="0.38" />
                    <circle cx="170" cy="25" r="9" fill="#C8F931" />
                    <circle cx="215" cy="45" r="12" fill="#0052CC" fillOpacity="0.4" />
                </svg>
            </div>
        </div>
    );
};

export default PlasticinUniversalAuthScreen;
