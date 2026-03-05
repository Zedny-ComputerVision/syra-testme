import React, { createContext, useEffect, useState, useCallback, useMemo } from 'react';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext(null);

const STORAGE_KEY = 'syra_tokens';

/**
 * Safely parse stored tokens from localStorage.
 * Returns null when nothing is stored or when JSON is corrupt.
 */
function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.access_token) {
      return parsed;
    }
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Decode a JWT access token and extract user fields.
 * Returns null if the token is invalid or expired.
 */
function decodeUser(accessToken) {
  try {
    const decoded = jwtDecode(accessToken);

    // Check expiration
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      id: decoded.sub,
      role: decoded.role,
      user_id: decoded.user_id,
      name: decoded.name || decoded.user_id || decoded.sub,
      email: decoded.email || null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(loadStoredTokens);
  const [user, setUser] = useState(() => {
    const stored = loadStoredTokens();
    return stored ? decodeUser(stored.access_token) : null;
  });
  const [loading, setLoading] = useState(true);

  /* Sync user state whenever tokens change */
  useEffect(() => {
    if (tokens?.access_token) {
      const decoded = decodeUser(tokens.access_token);
      if (decoded) {
        setUser(decoded);
      } else {
        // Token expired or invalid — clean up
        setTokens(null);
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, [tokens]);

  /**
   * Store tokens after a successful login.
   * @param {{ access_token: string, refresh_token?: string }} payload
   */
  const login = useCallback((payload) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setUser(decodeUser(payload.access_token));
    setLoading(false);
    setTokens(payload);
  }, []);

  /**
   * Clear all auth state and redirect-worthy data.
   */
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTokens(null);
    setUser(null);
  }, []);

  /**
   * Update stored tokens (e.g. after a token refresh).
   * @param {{ access_token: string, refresh_token?: string }} newTokens
   */
  const updateTokens = useCallback((newTokens) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newTokens));
    setUser(decodeUser(newTokens.access_token));
    setTokens(newTokens);
  }, []);

  /** Whether the user has one of the given roles */
  const hasRole = useCallback(
    (...roles) => {
      if (!user?.role) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const isAuthenticated = Boolean(user);

  const value = useMemo(
    () => ({
      user,
      tokens,
      loading,
      isAuthenticated,
      login,
      logout,
      updateTokens,
      hasRole,
    }),
    [user, tokens, loading, isAuthenticated, login, logout, updateTokens, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
