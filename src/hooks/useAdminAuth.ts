import { useState, useEffect, FormEvent } from 'react';
import { JSON_HEADERS, authHeaders, parseJsonOrThrow } from '../lib/api';
import { UserRole } from '../types';
import { useLoading } from '../contexts/LoadingContext';

export function useAdminAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [displayName, setDisplayName] = useState<string>('');
  const { withLoading } = useLoading();

  // Load existing session
  useEffect(() => {
    const savedToken = localStorage.getItem('bilbo_admin_token');
    const savedRole = localStorage.getItem('bilbo_admin_role');
    const savedDisplayName = localStorage.getItem('bilbo_admin_display_name');
    if (savedToken && savedRole) {
      setToken(savedToken);
      setRole(savedRole as UserRole);
      setDisplayName(savedDisplayName || '');
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await withLoading(async () => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await parseJsonOrThrow(res, 'Login failed');
        localStorage.setItem('bilbo_admin_token', data.token);
        localStorage.setItem('bilbo_admin_role', data.role);
        localStorage.setItem('bilbo_admin_display_name', data.displayName);
        setToken(data.token);
        setRole(data.role);
        setDisplayName(data.displayName);
        setIsLoggedIn(true);
      });
    } catch (err: any) {
      setLoginError(err.message || 'Error logging in');
    }
  };

  // Called after a successful password change - the server rotates the
  // session token, so the client must adopt the new one to stay logged in.
  const updateSessionToken = (newToken: string) => {
    localStorage.setItem('bilbo_admin_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    // Best-effort server-side session invalidation - logout should still
    // succeed client-side even if this fails (e.g. session already expired).
    fetch('/api/auth/logout', { method: 'POST', headers: authHeaders(token) }).catch(() => {});
    localStorage.removeItem('bilbo_admin_token');
    localStorage.removeItem('bilbo_admin_role');
    localStorage.removeItem('bilbo_admin_display_name');
    setToken('');
    setRole('');
    setDisplayName('');
    setIsLoggedIn(false);
  };

  return {
    isLoggedIn,
    usernameInput,
    setUsernameInput,
    passwordInput,
    setPasswordInput,
    loginError,
    token,
    role,
    displayName,
    handleLogin,
    handleLogout,
    updateSessionToken,
  };
}
