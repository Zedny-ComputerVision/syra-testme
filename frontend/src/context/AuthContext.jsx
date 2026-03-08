import React, { createContext, useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import {
  DEFAULT_PERMISSION_ROWS,
  canonicalizePermissionRows,
  hasPermission as checkPermission,
} from '../utils/permissions';

export const AuthContext = createContext(null);

const STORAGE_KEY = 'syra_tokens';
const rawBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/';
const apiBaseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

/**
 * Safely parse stored tokens from localStorage.
 * Returns null when nothing is stored or when JSON is corrupt.
 */
function loadStoredTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && (parsed.access_token || parsed.refresh_token)) {
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
    if (!accessToken) return null;
    const decoded = jwtDecode(accessToken);

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
  const [permissionRows, setPermissionRows] = useState(DEFAULT_PERMISSION_ROWS);
  const [loading, setLoading] = useState(true);

  const refreshAccessToken = useCallback(async (currentTokens) => {
    if (!currentTokens?.refresh_token) return null;
    try {
      const refreshUrl = new URL('auth/refresh', apiBaseURL).toString();
      const { data } = await axios.post(refreshUrl, { refresh_token: currentTokens.refresh_token });
      if (!data?.access_token) return null;
      return {
        ...currentTokens,
        access_token: data.access_token,
        token_type: data.token_type || currentTokens.token_type || 'bearer',
      };
    } catch {
      return null;
    }
  }, []);

  // Keep session alive across browser refresh by using refresh token when access token is expired.
  useEffect(() => {
    let cancelled = false;

    async function syncSession() {
      if (!tokens) {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const decoded = decodeUser(tokens.access_token);
      if (decoded) {
        if (!cancelled) {
          setUser(decoded);
          setLoading(false);
        }
        return;
      }

      const refreshed = await refreshAccessToken(tokens);
      if (!refreshed) {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setTokens(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
      if (!cancelled) {
        setTokens(refreshed);
        setUser(decodeUser(refreshed.access_token));
        setLoading(false);
      }
    }

    syncSession();
    return () => {
      cancelled = true;
    };
  }, [tokens, refreshAccessToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadPermissions() {
      if (!user || !tokens?.access_token) {
        if (!cancelled) {
          setPermissionRows(DEFAULT_PERMISSION_ROWS);
        }
        return;
      }
      try {
        const permissionsUrl = new URL('admin-settings/permissions/public', apiBaseURL).toString();
        const { data } = await axios.get(permissionsUrl, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!cancelled && Array.isArray(data?.permissions) && data.permissions.length > 0) {
          setPermissionRows(canonicalizePermissionRows(data.permissions));
        }
      } catch {
        if (!cancelled) {
          setPermissionRows(DEFAULT_PERMISSION_ROWS);
        }
      }
    }

    loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [user, tokens]);

  /**
   * Store tokens after a successful login.
   * @param {{ access_token: string, refresh_token?: string }} payload
   */
  const login = useCallback((payload) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setUser(decodeUser(payload.access_token));
    setLoading(false);
    setTokens(payload);
    setPermissionRows(DEFAULT_PERMISSION_ROWS);
  }, []);

  /**
   * Clear all auth state and redirect-worthy data.
   */
  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTokens(null);
    setUser(null);
    setLoading(false);
    setPermissionRows(DEFAULT_PERMISSION_ROWS);
  }, []);

  /**
   * Update stored tokens (e.g. after a token refresh).
   * @param {{ access_token: string, refresh_token?: string }} newTokens
   */
  const updateTokens = useCallback((newTokens) => {
    const merged = { ...(tokens || {}), ...(newTokens || {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    setUser(decodeUser(merged.access_token));
    setTokens(merged);
  }, [tokens]);

  /** Whether the user has one of the given roles */
  const hasRole = useCallback(
    (...roles) => {
      if (!user?.role) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const hasPermission = useCallback(
    (feature) => {
      if (!user?.role) return false;
      return checkPermission(permissionRows, user.role, feature);
    },
    [permissionRows, user]
  );

  const isAuthenticated = Boolean(user);

  const value = useMemo(
    () => ({
      user,
      setUser,
      tokens,
      loading,
      isAuthenticated,
      login,
      logout,
      updateTokens,
      hasRole,
      permissionRows,
      hasPermission,
    }),
    [user, setUser, tokens, loading, isAuthenticated, login, logout, updateTokens, hasRole, permissionRows, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
