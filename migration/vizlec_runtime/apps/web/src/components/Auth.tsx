
import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  ChevronLeft, 
  PlayCircle, 
  Quote,
  Palette,
  Check,
  Sparkles
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

type AuthMode = 'login' | 'bootstrap-admin' | 'accept-invite' | 'forgot-password';

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

interface AuthProps {
  onLogin: (user: SessionUser) => void;
  isDarkMode: boolean;
}

// Imagens para teste de conceito visual
const TEST_IMAGES = [
  "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1920&auto=format&fit=crop", // Atual (Studio)
  "https://images.unsplash.com/photo-1522211988038-6fcbb8c12c7e?q=80&w=2070&auto=format&fit=crop", // Colaboração/Equipe
  "https://plus.unsplash.com/premium_photo-1675644727129-9e2fbc03c500?q=80&w=1344&auto=format&fit=crop", // VR/Tech Futuro
  "https://images.unsplash.com/photo-1614899099690-3bd319d25f99?q=80&w=1170&auto=format&fit=crop", // Abstract 3D
  "https://images.unsplash.com/photo-1609619385076-36a873425636?q=80&w=1170&auto=format&fit=crop", // Dark Fluid
  "https://images.unsplash.com/photo-1618933974351-e38629016464?q=80&w=1133&auto=format&fit=crop", // Neon/Cyber
  "https://images.unsplash.com/photo-1516979187457-637abb4f9353?q=80&w=1170&auto=format&fit=crop", // Event/Stage
  "https://images.unsplash.com/photo-1535868463750-c78d9543614f?q=80&w=1176&auto=format&fit=crop"  // Tech Office
];

const Auth: React.FC<AuthProps> = ({ onLogin, isDarkMode }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthStateReady, setIsAuthStateReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // States para o seletor de background (Debug)
  const [bgImage, setBgImage] = useState(TEST_IMAGES[0]);
  const [showBgSelector, setShowBgSelector] = useState(false);
  const bgSelectorRef = useRef<HTMLDivElement | null>(null);

  // Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [invitePreview, setInvitePreview] = useState<{
    email: string;
    role: string;
    expiresAt: string;
  } | null>(null);

  const getAuthErrorMessage = (error: unknown): string => {
    if (error instanceof TypeError) {
      return 'Unable to complete access right now. Service may be unavailable.';
    }
    return 'Unable to complete access. Please verify your data and try again.';
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite')?.trim() ?? '';
    setInviteToken(token);

    const bootstrapRequest = apiGet<{ requiresBootstrap: boolean }>('/auth/bootstrap-status', {
      cacheMs: 0,
      dedupe: false
    });
    const inviteRequest = token
      ? apiGet<{ email: string; role: string; expiresAt: string }>(
          `/auth/invite/${encodeURIComponent(token)}`,
          { cacheMs: 0, dedupe: false }
        )
      : Promise.resolve(null);

    Promise.all([bootstrapRequest, inviteRequest])
      .then(([bootstrap, invite]) => {
        if (cancelled) return;
        if (token) {
          if (invite) {
            setInvitePreview(invite);
            setEmail(invite.email);
            setMode('accept-invite');
          } else {
            setMode(bootstrap.requiresBootstrap ? 'bootstrap-admin' : 'login');
          }
          return;
        }
        setMode(bootstrap.requiresBootstrap ? 'bootstrap-admin' : 'login');
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(getAuthErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) {
          setIsAuthStateReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    apiGet<{ auth?: { loginBackground?: string | null } }>('/settings')
      .then((data) => {
        const saved = data.auth?.loginBackground;
        if (saved && TEST_IMAGES.includes(saved)) {
          setBgImage(saved);
        }
      })
      .catch(() => {
        // keep default
      });
  }, []);

  useEffect(() => {
    if (!showBgSelector) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (bgSelectorRef.current && !bgSelectorRef.current.contains(target)) {
        setShowBgSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBgSelector]);

  useEffect(() => {
    setErrorMessage(null);
  }, [mode]);

  useEffect(() => {
    if (!bgImage) return;
    const fallback = TEST_IMAGES[0];
    const img = new Image();
    img.onload = () => {};
    img.onerror = () => {
      if (bgImage !== fallback) {
        setBgImage(fallback);
      }
    };
    img.src = bgImage;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [bgImage]);

  const handleSelectBackground = (img: string) => {
    setBgImage(img);
    apiPatch('/settings', { auth: { loginBackground: img } }).catch(() => {
      // ignore save errors
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'bootstrap-admin' || mode === 'accept-invite') {
      const normalizedName = name.trim().replace(/\s+/g, ' ');
      if (normalizedName.length < 2) {
        setErrorMessage('Minimum requirements: full name with 2+ characters.');
        return;
      }
    }
    if (!email.includes('@')) {
      setErrorMessage('Minimum requirements: valid email address.');
      return;
    }
    if (mode !== 'forgot-password' && password.length < 8) {
      setErrorMessage('Minimum requirements: password with at least 8 characters.');
      return;
    }

    setIsLoading(true);

    if (mode === 'bootstrap-admin') {
      apiGet<{ requiresBootstrap: boolean }>('/auth/bootstrap-status', { cacheMs: 0, dedupe: false })
        .then((state) => {
          if (!state.requiresBootstrap) {
            setMode('login');
            setErrorMessage('Admin account already configured. Please sign in.');
            setIsLoading(false);
            return;
          }
          const action = apiPost('/auth/bootstrap-admin', { name, email, password });
          action
            .then(async () => {
              const session = await apiGet<{ user: SessionUser }>('/auth/me', { cacheMs: 0, dedupe: false });
              setPassword('');
              onLogin(session.user);
            })
            .catch(async (err) => {
              const stateAfter = await apiGet<{ requiresBootstrap: boolean }>('/auth/bootstrap-status', { cacheMs: 0, dedupe: false }).catch(() => null);
              if (stateAfter && !stateAfter.requiresBootstrap) {
                setMode('login');
                setErrorMessage('Admin account already configured. Please sign in.');
              } else {
                setErrorMessage(getAuthErrorMessage(err));
              }
            })
            .finally(() => {
              setIsLoading(false);
            });
        })
        .catch((err) => {
          setErrorMessage(getAuthErrorMessage(err));
          setIsLoading(false);
        });
      return;
    }

    if (mode === 'forgot-password') {
      setIsLoading(false);
      alert('Password reset link sent to your email!');
      setMode('login');
      return;
    }

    const action = mode === 'accept-invite'
        ? apiPost('/auth/invite/accept', { token: inviteToken, name, password })
        : apiPost('/auth/login', { email, password });

    action
      .then(async () => {
        const session = await apiGet<{ user: SessionUser }>('/auth/me', { cacheMs: 0, dedupe: false });
        setPassword('');
        onLogin(session.user);
      })
      .catch((err) => {
        setErrorMessage(getAuthErrorMessage(err));
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const Logo = () => (
    <div className="flex items-center gap-2.5 mb-2 group cursor-default">
      <img
        src="/branding/logo-light.png"
        alt="Video Automation"
        className="block dark:hidden h-8 w-auto object-contain"
      />
      <img
        src="/branding/logo-dark.png"
        alt="Video Automation"
        className="hidden dark:block h-8 w-auto object-contain"
      />
      <img
        src="/branding/wordmark-light.png"
        alt="Video Automation"
        className="block dark:hidden h-5 w-auto object-contain"
      />
      <img
        src="/branding/wordmark-dark.png"
        alt="Video Automation"
        className="hidden dark:block h-5 w-auto object-contain"
      />
    </div>
  );

  const rightPanelBase = isDarkMode ? "bg-zinc-900" : "bg-slate-100";
  const rightPanelGlow = isDarkMode
    ? "from-orange-600/20 via-transparent to-transparent"
    : "from-orange-400/20 via-transparent to-transparent";
  const rightPanelOverlay = isDarkMode ? "bg-zinc-950/40" : "bg-white/40";
  const rightPanelGradientTop = isDarkMode
    ? "from-zinc-950 via-transparent to-zinc-950/20"
    : "from-white via-transparent to-white/30";
  const rightPanelGradientSide = isDarkMode
    ? "from-zinc-950/80 to-transparent"
    : "from-white/80 to-transparent";
  const cardBase = isDarkMode
    ? "bg-white/5 border-white/10 hover:bg-white/10"
    : "bg-white/70 border-white/70 hover:bg-white/80";
  const cardText = isDarkMode ? "text-white" : "text-slate-900";
  const cardSubText = isDarkMode ? "text-zinc-200" : "text-slate-600";
  const statsText = isDarkMode ? "text-zinc-400" : "text-slate-500";

  if (!isAuthStateReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-orange-500/30 selection:text-orange-600 relative overflow-hidden">
      
      {/* Left Side - Form Section */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24 relative z-10 bg-white dark:bg-[#09090b]">
        
        {/* Mobile Header Logo */}
        <div className="absolute top-8 left-8 lg:hidden">
            <Logo />
        </div>

        <div className="max-w-[360px] w-full mx-auto">
          <div className="hidden lg:block mb-16">
             <Logo />
          </div>

          <div className="mb-10">
            <h1 className="text-3xl font-bold tracking-tight mb-3 text-zinc-900 dark:text-white">
              {mode === 'login' && 'Welcome back'}
              {mode === 'bootstrap-admin' && 'Create Admin Account'}
              {mode === 'accept-invite' && 'Accept Team Invitation'}
              {mode === 'forgot-password' && 'Reset password'}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
              {mode === 'login' && 'Enter your credentials to access your workspace.'}
              {mode === 'bootstrap-admin' && 'First-time setup: create the owner account for this installation.'}
              {mode === 'accept-invite' && 'Set your full name and password to activate your invite.'}
              {mode === 'forgot-password' && 'We’ll send you a secure link to reset.'}
            </p>
            {mode === 'accept-invite' && invitePreview && (
              <div className="mt-4 rounded-xl border border-[hsl(var(--editor-input-border))] bg-[hsl(var(--editor-input))] p-3 text-xs text-zinc-600 dark:text-zinc-300">
                <p><span className="font-bold">Email:</span> {invitePreview.email}</p>
                <p><span className="font-bold">Role:</span> {invitePreview.role}</p>
                <p><span className="font-bold">Expires:</span> {new Date(invitePreview.expiresAt).toLocaleString()}</p>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            
            {(mode === 'bootstrap-admin' || mode === 'accept-invite') && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Full Name</label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-orange-500 transition-colors" size={18} />
                  <input 
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-xl pl-11 pr-4 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Minimum 2 characters.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-orange-500 transition-colors" size={18} />
                <input 
                  type="email"
                  required
                  disabled={mode === 'accept-invite'}
                  maxLength={200}
                  className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-xl pl-11 pr-4 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Use a valid email format.</p>
            </div>

            {mode !== 'forgot-password' && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">Password</label>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-orange-500 transition-colors" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={200}
                    className="w-full h-9 bg-[hsl(var(--editor-input))] border border-[hsl(var(--editor-input-border))] rounded-xl pl-11 pr-11 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-muted-foreground"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Minimum 8 characters.</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {mode === 'login' && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" className="w-4 h-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500 bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700" />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium group-hover:text-zinc-800 dark:group-hover:text-zinc-200 transition-colors">Remember me</span>
                  </label>
              )}
              
              {mode === 'login' && (
                  <button 
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="text-sm font-semibold text-orange-600 hover:text-orange-500 transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold .5 rounded-xl transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group h-9"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' && 'Sign In'}
                  {mode === 'bootstrap-admin' && 'Create Admin'}
                  {mode === 'accept-invite' && 'Accept Invite'}
                  {mode === 'forgot-password' && 'Send Reset Link'}
                  {mode !== 'forgot-password' && <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />}
                </>
              )}
            </button>

            {errorMessage && (
              <p className="text-sm text-red-500 font-medium">{errorMessage}</p>
            )}

            {mode === 'login' && (
                <div className="space-y-5 pt-4">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-zinc-200 dark:border-zinc-800"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="px-3 bg-white dark:bg-[#09090b] text-zinc-400 font-medium uppercase tracking-wider">Or continue with</span>
                        </div>
                    </div>

                    <button 
                        type="button"
                        className="w-full flex items-center justify-center gap-3 px-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all font-bold text-sm text-zinc-700 dark:text-zinc-200 group h-9"
                    >
                        <div className="w-5 h-5 group-hover:scale-110 transition-transform duration-300">
                             <svg viewBox="0 0 24 24" className="w-full h-full">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                        </div>
                        Google Account
                    </button>
                </div>
            )}
          </form>

          <div className="mt-8 text-center">
            {mode === 'login' && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Sign-up is managed by your workspace administrator.
              </p>
            )}
            {(mode === 'bootstrap-admin' || mode === 'accept-invite') && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Already have access?{' '}
                <button onClick={() => setMode('login')} className="text-orange-600 font-bold hover:text-orange-500 transition-colors">
                  Sign in
                </button>
              </p>
            )}
            {mode === 'forgot-password' && (
              <button 
                onClick={() => setMode('login')} 
                className="flex items-center justify-center gap-2 w-full text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-bold text-sm transition-colors"
              >
                <ChevronLeft size={16} /> Back to Sign In
              </button>
            )}
          </div>
        </div>
        
        {/* Footer Links */}
        <div className="absolute bottom-6 left-0 right-0 text-center lg:text-left lg:px-16 xl:px-24">
            <p className="text-xs text-zinc-400 dark:text-zinc-600">© 2024 VizLec Inc. <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors ml-2">Privacy Policy</a> <span className="mx-1">•</span> <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Terms of Service</a></p>
        </div>
      </div>

      {/* Right Side - Visual Section (Premium Glassmorphism) */}
      <div
        className={`hidden lg:flex w-[55%] xl:w-[60%] ${rightPanelBase} relative overflow-hidden items-center justify-center p-12`}
      >
        <div
          className={`pointer-events-none absolute left-0 top-0 h-full w-40 ${
            isDarkMode
              ? "bg-[linear-gradient(90deg,rgba(9,9,11,0.95),rgba(9,9,11,0.6),rgba(9,9,11,0))]"
              : "bg-[linear-gradient(90deg,rgba(255,255,255,1),rgba(255,255,255,0.65),rgba(255,255,255,0))]"
          }`}
          style={{
            WebkitMaskImage:
              "linear-gradient(180deg, transparent 0%, black 18%, black 82%, transparent 100%)",
            maskImage:
              "linear-gradient(180deg, transparent 0%, black 18%, black 82%, transparent 100%)",
            boxShadow: isDarkMode
              ? "-60px 0 140px rgba(0,0,0,0.55)"
              : "-60px 0 140px rgba(30,41,59,0.25)"
          }}
        ></div>
         {/* Background Image with Motion Blur Effect */}
         <div 
            className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
            style={{ 
                backgroundImage: `url('${bgImage}')`,
            }}
         >
            <div className={`absolute inset-0 ${rightPanelOverlay} backdrop-blur-[2px]`}></div>
         </div>

         {/* Premium Overlay Gradients */}
         <div className={`absolute inset-0 bg-gradient-to-t ${rightPanelGradientTop}`}></div>
         <div className={`absolute inset-0 bg-gradient-to-l ${rightPanelGradientSide}`}></div>
         <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${rightPanelGlow} opacity-60`}></div>
         <div
            className={`absolute left-0 top-0 h-full w-16 pointer-events-none ${
              isDarkMode
                ? "bg-[linear-gradient(90deg,rgba(9,9,11,0.35),rgba(9,9,11,0.12),rgba(9,9,11,0))]"
                : "bg-[linear-gradient(90deg,rgba(255,255,255,0.45),rgba(255,255,255,0.12),rgba(255,255,255,0))]"
            } blur-[10px]`}
         ></div>

         {/* DEBUG: Background Image Selector */}
         <div className="absolute top-6 right-6 z-50" ref={bgSelectorRef}>
            <button 
              onClick={() => setShowBgSelector(!showBgSelector)}
              className="p-3 bg-black/40 hover:bg-orange-600/90 backdrop-blur-xl rounded-full text-white/70 hover:text-white transition-all shadow-xl border border-white/10 group"
              title="Change Background (Concept Test)"
            >
              <Palette size={18} className="group-hover:rotate-45 transition-transform duration-300" />
            </button>
            
            {showBgSelector && (
              <div className={`absolute top-14 right-0 w-72 ${isDarkMode ? "bg-zinc-950/90 border-white/10 text-zinc-400" : "bg-white/90 border-slate-200 text-slate-500"} backdrop-blur-2xl border p-4 rounded-2xl shadow-2xl grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 z-50`}>
                <div className="col-span-2 flex items-center justify-between mb-2 pl-1">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? "text-zinc-400" : "text-slate-500"}`}>Concept Gallery</span>
                    <span className={`text-[10px] ${isDarkMode ? "text-zinc-600" : "text-slate-400"}`}>{TEST_IMAGES.length} presets</span>
                </div>
                {TEST_IMAGES.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectBackground(img)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all group ${bgImage === img ? 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : isDarkMode ? 'border-transparent hover:border-white/30' : 'border-transparent hover:border-slate-300'}`}
                  >
                    <img src={img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={`Concept ${idx + 1}`} />
                    <div className={`absolute inset-0 ${isDarkMode ? "bg-black/40" : "bg-white/30"} group-hover:bg-transparent transition-colors duration-300`}></div>
                    {bgImage === img && (
                      <div className="absolute inset-0 flex items-center justify-center bg-orange-500/10 backdrop-blur-[1px]">
                         <div className="w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_10px_#f97316]"></div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
         </div>

         {/* Main Content Content (Floating Glass Card) */}
         <div className="relative z-10 max-w-xl w-full">
             
             {/* Glow Effect behind the card */}
             <div className={`absolute -inset-4 ${isDarkMode ? "bg-orange-500/30" : "bg-orange-400/30"} blur-[60px] rounded-[30%] opacity-40 animate-pulse`}></div>

             <div className={`relative ${cardBase} backdrop-blur-2xl p-10 rounded-3xl shadow-2xl overflow-hidden group transition-colors duration-500`}>
                {/* Noise texture overlay for premium feel */}
                <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] pointer-events-none"></div>
                
                {/* Decorative Elements */}
                <div className={`absolute -top-10 -right-10 w-32 h-32 ${isDarkMode ? "bg-orange-500/20" : "bg-orange-400/25"} rounded-full blur-2xl`}></div>
                <div className={`absolute -bottom-10 -left-10 w-32 h-32 ${isDarkMode ? "bg-blue-500/20" : "bg-sky-400/20"} rounded-full blur-2xl`}></div>

                <div className="relative z-10">
                    <div className={`w-14 h-14 ${isDarkMode ? "bg-gradient-to-br from-white/20 to-white/5 border-white/20" : "bg-gradient-to-br from-white to-white/70 border-white/70"} backdrop-blur-md border rounded-2xl flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                        <Sparkles size={24} className="text-orange-400 fill-orange-400/20" />
                    </div>
                    
                    <h2 className={`text-4xl md:text-5xl font-bold ${cardText} mb-8 leading-tight tracking-tight`}>
                       Transform ideas into <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-200">cinematic</span> reality.
                    </h2>
                    
                    <div className={`flex flex-col gap-6 pt-6 ${isDarkMode ? "border-white/10" : "border-slate-200"} border-t`}>
                       <Quote className={`text-orange-500 opacity-80 rotate-180`} size={32} />
                       
                       <p className={`text-xl ${cardSubText} leading-relaxed font-medium`}>
                          "VizLec automates 90% of our workflow. It's not just a tool; it's our entire production studio in a browser."
                       </p>
                       
                       <div className="flex items-center gap-4">
                           <div className="relative">
                               <div className="absolute inset-0 bg-orange-500 rounded-full blur-md opacity-40"></div>
                               <img 
                                   src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=100&auto=format&fit=crop" 
                                   alt="User" 
                                   className="w-12 h-12 rounded-full border-2 border-white/20 relative z-10 object-cover"
                               />
                           </div>
                           <div>
                               <p className={`text-base font-bold ${cardText}`}>Sarah Jenkins</p>
                               <p className={`text-xs ${isDarkMode ? "text-orange-300" : "text-orange-600"} font-bold uppercase tracking-wider`}>Head of Education @ TechFlow</p>
                           </div>
                       </div>
                    </div>
                </div>
             </div>

             {/* Bottom floating stats */}
             <div className="flex items-center gap-8 mt-12 pl-4">
                <div className="flex items-center gap-3">
                   <div className="flex -space-x-3">
                      {[1,2,3].map((i) => (
                        <div key={i} className={`w-10 h-10 rounded-full border-2 ${isDarkMode ? "border-zinc-900 bg-zinc-800" : "border-white bg-slate-200"} overflow-hidden relative z-0`}>
                           <img src={`https://i.pravatar.cc/100?img=${i + 10}`} className="w-full h-full object-cover opacity-80" alt="user" />
                        </div>
                      ))}
                   </div>
                   <div className={`text-xs font-medium ${statsText}`}>
                      <span className={`${cardText} font-bold block`}>10k+ Creators</span>
                      Joined this week
                   </div>
                </div>
                <div className={`h-8 w-px ${isDarkMode ? "bg-white/10" : "bg-slate-300/70"}`}></div>
                <div className={`flex items-center gap-2 ${statsText} text-xs font-bold uppercase tracking-widest`}>
                   <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse"></div>
                   System Online
                </div>
             </div>
         </div>
         
      </div>

    </div>
  );
};

export default Auth;
