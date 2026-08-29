'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { setCsrfToken } from '@/lib/api-client';

interface AuthContextValue {
  csrfToken: string | null;
  updateCsrfToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [csrfToken, setStateCsrfToken] = useState<string | null>(null);
  const value = useMemo<AuthContextValue>(() => ({
    csrfToken,
    updateCsrfToken: (token) => {
      setStateCsrfToken(token);
      setCsrfToken(token);
    },
  }), [csrfToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('AuthProvider is required');
  return ctx;
}
