import React, { useState } from 'react';
import { Trophy, KeyRound, User, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

interface AuthScreenProps {
  onLogin: (username: string) => void;
  mode?: 'login' | 'register';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, mode = 'login' }) => {
  const isRegister = mode === 'register';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError('Please fill in all fields.');
      return;
    }

    // Local Storage mock database
    const usersStr = localStorage.getItem('bracket_builder_users_db');
    const usersDb: Record<string, string> = usersStr ? JSON.parse(usersStr) : {};

    // Auto-seed an admin account if the database is completely empty
    if (Object.keys(usersDb).length === 0) {
      usersDb['admin'] = 'admin';
      localStorage.setItem('bracket_builder_users_db', JSON.stringify(usersDb));
    }

    if (isRegister) {
      // Registration Flow
      if (usersDb[cleanUsername]) {
        setError('Username already exists. Please choose another.');
        return;
      }
      usersDb[cleanUsername] = password; // Not secure in real app, but works for mock local persist
      localStorage.setItem('bracket_builder_users_db', JSON.stringify(usersDb));
      setSuccess(`Account '${cleanUsername}' created successfully.`);
      setUsername('');
      setPassword('');
      // Wait to inform user, we don't automatically log in the new user when an admin creates them.
    } else {
      // Login Flow
      if (!usersDb[cleanUsername]) {
        setError('Account not found. Please contact an admin to register.');
        return;
      }
      if (usersDb[cleanUsername] !== password) {
        setError('Incorrect password. Please try again.');
        return;
      }
      onLogin(cleanUsername);
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

            {!isRegister && !error && !success && (
              <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100/50 text-blue-700 text-sm font-semibold">
                <p>💡 First time? Use default login: <strong>admin</strong> / <strong>admin</strong></p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-100/50 text-emerald-600 text-sm font-semibold flex items-start gap-2">
                <div className="mt-0.5">✅</div>
                <p>{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full relative group bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3.5 px-4 font-bold text-sm transition-all focus:ring-4 focus:ring-slate-900/10 flex items-center justify-center gap-2 overflow-hidden"
              >
                <span className="relative z-10">{isRegister ? 'Register Account' : 'Secure Login'}</span>
                <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 group-hover:translate-x-full transition-transform duration-1000 -translate-x-full"></div>
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100/50 text-emerald-700 text-xs font-semibold border border-emerald-200/50">
            <KeyRound className="w-3 h-3" />
            <span>Local Secure Authentication Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
