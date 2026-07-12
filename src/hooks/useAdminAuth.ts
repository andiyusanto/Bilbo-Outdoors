import { useState, useEffect, FormEvent } from 'react';
import { JSON_HEADERS, parseJsonOrThrow } from '../lib/api';

export function useAdminAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [token, setToken] = useState<string>('');

  // Load existing token
  useEffect(() => {
    const savedToken = localStorage.getItem('bilbo_admin_token');
    if (savedToken) {
      setToken(savedToken);
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await parseJsonOrThrow(res, 'Login failed');
      localStorage.setItem('bilbo_admin_token', data.token);
      setToken(data.token);
      setIsLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message || 'Error logging in');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('bilbo_admin_token');
    setToken('');
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
    handleLogin,
    handleLogout,
  };
}
