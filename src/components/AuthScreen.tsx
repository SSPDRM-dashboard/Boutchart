import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, KeyRound, Mail, Lock } from 'lucide-react';
import { auth, provider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../lib/firebase';

interface AuthScreenProps {
  onLogin: (username: string) => void;
  mode?: 'login' | 'register';
  onRegisterSuccess?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, mode = 'login' }) => {
  const [isRegister, setIsRegister] = useState(mode === 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (result.user.email) {
          onLogin(result.user.email);
        }
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        if (result.user.email) {
          onLogin(result.user.email);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user.email) {
        onLogin(result.user.email);
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-4 selection:bg-amber-500/30">
      <div className="w-full max-w-md animate-fade-in">
        {/* Auth Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/60 overflow-hidden">
          <div className="p-8 sm:p-10">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              {isRegister ? 'Create an Account' : 'Welcome Back'}
            </h2>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100/50 text-rose-600 text-sm font-semibold flex items-start gap-2">
                <div className="mt-0.5">⚠️</div>
                <div className="flex-1">
                  <p>{error}</p>
                  {error.includes('unauthorized-domain') && (
                    <div className="mt-3 p-3 bg-white/60 rounded-lg text-xs font-medium text-slate-700 space-y-2 border border-rose-100">
                      <p><strong>To fix this:</strong></p>
                      <ol className="list-decimal pl-4 space-y-1">
                        <li>Go to your <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Firebase Console</a>.</li>
                        <li>Select your project, then go to <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized domains</strong>.</li>
                        <li>Click <strong>Add domain</strong> and paste this exact domain:</li>
                      </ol>
                      <code className="block bg-slate-100 p-2 rounded text-slate-800 break-all select-all">
                        {window.location.hostname}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-slate-50/50"
                    placeholder="admin@example.com"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-slate-50/50"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full relative group bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl py-3 px-4 font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Please wait...' : (isRegister ? 'Sign Up' : 'Sign In')}
                {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>

            <div className="relative flex items-center justify-center mb-6">
              <div className="border-t border-slate-200 w-full"></div>
              <span className="bg-white px-3 text-xs text-slate-400 font-semibold uppercase absolute">or</span>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
              className="w-full bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 rounded-xl py-3 px-4 font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              Continue with Google
            </button>
            
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                {isRegister ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mt-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100/50 text-blue-700 text-xs font-semibold border border-blue-200/50">
            <KeyRound className="w-3 h-3" />
            <span>Firebase Secure Authentication Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

