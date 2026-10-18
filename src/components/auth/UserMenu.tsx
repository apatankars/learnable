import { useState, useRef, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';

interface UserMenuProps {
  user: User;
  onSignOut: () => void;
}

export function UserMenu({ user, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="pop-btn w-10 h-10 !rounded-full !bg-[var(--grape)] !text-[var(--ink)] text-sm flex items-center justify-center !border-b-[4px]"
        title={user.email}
      >
        {initials}
      </button>

      {open && (
        <div className="pop-card absolute right-0 top-12 py-2 min-w-48 z-50">
          <div className="px-4 py-2 border-b-2 border-[var(--ink)] mb-1">
            <p className="text-xs text-[var(--t3)] font-dm font-bold">Signed in as</p>
            <p className="text-sm text-[var(--ink)] font-dm font-bold truncate">{user.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            className="w-full text-left px-4 py-2 text-sm font-dm font-bold text-[var(--ink)] hover:bg-[var(--sun-soft)] transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
