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
        className="w-9 h-9 rounded-full bg-leaf-600 text-white font-dm font-bold text-sm flex items-center justify-center hover:bg-leaf-700 transition-colors shadow-sm"
        title={user.email}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-11 bg-white border border-bark-200 rounded-xl shadow-lg py-2 min-w-48 z-50">
          <div className="px-4 py-2 border-b border-bark-100 mb-1">
            <p className="text-xs text-bark-400 font-dm">Signed in as</p>
            <p className="text-sm text-bark-700 font-dm font-medium truncate">{user.email}</p>
          </div>
          <button
            onClick={() => { setOpen(false); onSignOut(); }}
            className="w-full text-left px-4 py-2 text-sm font-dm text-bark-600 hover:bg-leaf-50 hover:text-bark-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
