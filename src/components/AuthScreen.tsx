import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import { auth, provider, signInWithPopup } from '../lib/firebase';

interface AuthScreenProps {
  onLogin: (username: string) => void;
  mode?: 'login' | 'register';
  onRegisterSuccess?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, mode = 'login' }) => {
  const isRegister = mode === 'register';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
                <p>{error}</p>
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full relative group bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl py-3.5 px-4 font-bold text-sm transition-all focus:ring-4 focus:ring-slate-900/10 flex items-center justify-center gap-2 overflow-hidden"
            >
              <span className="relative z-10">{loading ? 'Please wait...' : 'Continue with Google'}</span>
              {!loading && <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />}
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 group-hover:translate-x-full transition-transform duration-1000 -translate-x-full"></div>
            </button>
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

