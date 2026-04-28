import { useState, useRef, useEffect } from 'react';

interface AuthModalProps {
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<Error | null>;
  onSignUp: (email: string, password: string) => Promise<Error | null>;
}

type Tab = 'signin' | 'signup';

export function AuthModal({ onClose, onSignIn, onSignUp }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const err = tab === 'signin'
      ? await onSignIn(email, password)
      : await onSignUp(email, password);

    setLoading(false);
    if (err) {
      setError(err.message);
    } else if (tab === 'signup') {
      setSuccessMsg('Check your email to confirm your account, then sign in.');
      setTab('signin');
      setPassword('');
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-bark-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-bark-200">
        {/* Header */}
        <div className="bg-leaf-600 px-6 pt-6 pb-4">
          <h2 className="font-playfair font-bold text-2xl text-white text-center">
            {tab === 'signin' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-leaf-100 text-sm text-center font-dm mt-1">
            {tab === 'signin' ? 'Sign in to sync your progress' : 'Save progress across devices'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-bark-100">
          {(['signin', 'signup'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-3 text-sm font-dm font-medium transition-colors ${
                tab === t
                  ? 'text-leaf-700 border-b-2 border-leaf-500'
                  : 'text-bark-400 hover:text-bark-600'
              }`}
            >
              {t === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {successMsg && (
            <div className="bg-leaf-50 border border-leaf-200 text-leaf-700 text-sm rounded-lg px-4 py-3 font-dm">
              {successMsg}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 font-dm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-dm font-medium text-bark-500 mb-1">Email</label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-bark-200 rounded-lg px-3 py-2.5 text-sm font-dm text-bark-800 focus:outline-none focus:ring-2 focus:ring-leaf-400 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-dm font-medium text-bark-500 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border border-bark-200 rounded-lg px-3 py-2.5 text-sm font-dm text-bark-800 focus:outline-none focus:ring-2 focus:ring-leaf-400 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-leaf-600 hover:bg-leaf-700 disabled:opacity-60 text-white font-dm font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs text-bark-400 hover:text-bark-600 font-dm transition-colors py-1"
          >
            Continue as guest
          </button>
        </form>
      </div>
    </div>
  );
}
