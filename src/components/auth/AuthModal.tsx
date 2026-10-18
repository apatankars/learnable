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
    <div className="fixed inset-0 bg-[rgba(31,26,46,0.6)] flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg)] rounded-3xl w-full max-w-sm overflow-hidden border-[3px] border-[var(--ink)] shadow-[7px_7px_0_var(--ink)]">
        {/* Header */}
        <div className="bg-[var(--sun)] px-6 pt-5 pb-4 border-b-[3px] border-[var(--ink)]">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto block text-[var(--ink)] text-2xl leading-none font-bold cursor-pointer"
            aria-label="Close authentication dialog"
          >
            ×
          </button>
          <h2 className="font-playfair font-extrabold text-3xl text-[var(--ink)] text-center">
            {tab === 'signin' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-[var(--t2)] text-sm text-center font-dm font-bold mt-1">
            {tab === 'signin' ? 'Sign in to sync your progress' : 'Save progress across devices'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b-[3px] border-[var(--ink)]">
          {(['signin', 'signup'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-3 text-sm font-dm font-extrabold transition-colors cursor-pointer ${
                tab === t
                  ? 'text-[var(--ink)] bg-[var(--sky-soft)]'
                  : 'text-[var(--t3)] hover:text-[var(--ink)]'
              }`}
            >
              {t === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {successMsg && (
            <div className="bg-[var(--green-soft)] border-2 border-[var(--ink)] text-[var(--ink)] text-sm rounded-xl px-4 py-3 font-dm font-bold">
              {successMsg}
            </div>
          )}
          {error && (
            <div className="bg-[var(--coral-soft)] border-2 border-[var(--ink)] text-[var(--ink)] text-sm rounded-xl px-4 py-3 font-dm font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-dm font-extrabold uppercase tracking-wider text-[var(--ink)] mb-1">Email</label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border-2 border-[var(--ink)] bg-white rounded-xl px-3 py-2.5 text-sm font-dm font-semibold text-[var(--ink)] focus:outline-none focus:shadow-[3px_3px_0_var(--sky)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-dm font-extrabold uppercase tracking-wider text-[var(--ink)] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full border-2 border-[var(--ink)] bg-white rounded-xl px-3 py-2.5 text-sm font-dm font-semibold text-[var(--ink)] focus:outline-none focus:shadow-[3px_3px_0_var(--sky)]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pop-btn w-full !bg-[var(--coral)] disabled:opacity-60 !text-white py-2.5 text-base"
          >
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
