import React, { createContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import {
  canonicalizePermissionRows,
  hasPermission as checkPermission,
} from '../utils/permissions';
import { clearAttemptId } from '../utils/attemptSession';
import { clearScreenStream } from '../utils/screenShareState';

export const AuthContext = createContext(null);

const STORAGE_KEY = 'syra_tokens';
const rawBase = import.meta.env.VITE_API_BASE_URL || '/api/';
const apiBaseURL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

function resolveApiUrl(path) {
  return new URL(path, new URL(apiBaseURL, window.location.origin)).toString();
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function safeSessionRemoveItem(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function clearSessionArtifacts() {
  clearAttemptId();
  clearScreenStream();
  safeSessionRemoveItem('precheck_flags');
  try {
    const keys = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && key.startsWith('journey_start_error:')) {
        keys.push(key);
      }
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // ignore storage failures
  }
}

function isJwtLike(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return false;
  try {
    jwtDecode(token);
    return true;
  } catch {
    return false;
  }
}

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
    safeRemoveItem(STORAGE_KEY);
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
  const initialTokens = useMemo(() => loadStoredTokens(), []);
  const [tokens, setTokens] = useState(initialTokens);
  const [user, setUser] = useState(() => {
    return initialTokens ? decodeUser(initialTokens.access_token) : null;
  });
  const [permissionRows, setPermissionRows] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(Boolean(initialTokens?.access_token));
  const [permissionsError, setPermissionsError] = useState('');
  const [loading, setLoading] = useState(true);
  const refreshPromiseRef = useRef(null);

  const clearAuthState = useCallback(() => {
    safeRemoveItem(STORAGE_KEY);
    clearSessionArtifacts();
    setTokens(null);
    setUser(null);
    setPermissionRows([]);
    setPermissionsLoading(false);
    setPermissionsError('');
    setLoading(false);
  }, []);

  const refreshAccessToken = useCallback(async (currentTokens) => {
    if (!currentTokens?.refresh_token) return null;
    if (!isJwtLike(currentTokens.refresh_token)) return null;
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        try {
          const refreshUrl = resolveApiUrl('auth/refresh');
        const { data } = await axios.post(
          refreshUrl,
          { refresh_token: currentTokens.refresh_token },
          { timeout: 10000 },
        );
          if (!data?.access_token) return null;
          return {
            ...currentTokens,
            access_token: data.access_token,
            token_type: data.token_type || currentTokens.token_type || 'bearer',
          };
        } catch {
          return null;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();
    }
    try {
      return await refreshPromiseRef.current;
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
          clearAuthState();
        }
        return;
      }

      safeSetItem(STORAGE_KEY, JSON.stringify(refreshed));
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
  }, [clearAuthState, tokens, refreshAccessToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadPermissions() {
      if (!user || !tokens?.access_token) {
        if (!cancelled) {
          setPermissionRows([]);
          setPermissionsLoading(false);
          setPermissionsError('');
        }
        return;
      }
      if (!cancelled) {
        setPermissionsLoading(true);
        setPermissionsError('');
      }
      try {
        const permissionsUrl = resolveApiUrl('admin-settings/permissions/public');
        const { data } = await axios.get(permissionsUrl, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          timeout: 10000,
        });
        if (!cancelled) {
          setPermissionRows(canonicalizePermissionRows(data?.permissions));
          setPermissionsError('');
        }
      } catch {
        if (!cancelled) {
          setPermissionRows([]);
          setPermissionsError('Permissions could not be loaded.');
        }
      } finally {
        if (!cancelled) {
          setPermissionsLoading(false);
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
    if (!payload?.access_token) {
      throw new Error('Missing access token');
    }
    clearSessionArtifacts();
    safeSetItem(STORAGE_KEY, JSON.stringify(payload));
    setUser(decodeUser(payload.access_token));
    setLoading(false);
    setTokens(payload);
    setPermissionRows([]);
    setPermissionsLoading(true);
    setPermissionsError('');
  }, []);

  /**
   * Clear all auth state and redirect-worthy data.
   */
  const logout = useCallback(async () => {
    const accessToken = tokens?.access_token;
    clearAuthState();
    if (!accessToken) return;
    const logoutUrl = resolveApiUrl('auth/logout');
    try {
      await axios.post(logoutUrl, null, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 5000,
      });
    } catch (error) {
      console.error('Server-side logout failed after local session cleanup.', error);
    }
  }, [clearAuthState, tokens]);

  /**
   * Update stored tokens (e.g. after a token refresh).
   * @param {{ access_token: string, refresh_token?: string }} newTokens
   */
  const updateTokens = useCallback((newTokens) => {
    const merged = { ...(tokens || {}), ...(newTokens || {}) };
    safeSetItem(STORAGE_KEY, JSON.stringify(merged));
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

  // Proactive token refresh: refresh the access token before it expires
  useEffect(() => {
    if (!tokens?.access_token) return;
    let timer;
    try {
      const decoded = jwtDecode(tokens.access_token);
      if (!decoded.exp) return;
      // Refresh 2 minutes before expiry (or immediately if less than 2 min left)
      const msUntilExpiry = decoded.exp * 1000 - Date.now();
      const refreshAt = Math.max(msUntilExpiry - 2 * 60 * 1000, 0);
      timer = setTimeout(async () => {
        const refreshed = await refreshAccessToken(tokens);
        if (refreshed) {
          safeSetItem(STORAGE_KEY, JSON.stringify(refreshed));
          setTokens(refreshed);
          setUser(decodeUser(refreshed.access_token));
        }
      }, refreshAt);
    } catch {
      // invalid token, ignore
    }
    return () => clearTimeout(timer);
  }, [tokens, refreshAccessToken, clearAuthState]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      const nextTokens = loadStoredTokens();
      if (!nextTokens?.access_token) {
        clearAuthState();
        return;
      }
      setTokens(nextTokens);
      setUser(decodeUser(nextTokens.access_token));
      setPermissionsLoading(true);
      setLoading(false);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearAuthState]);

  const isAuthenticated = Boolean(user);

  const value = useMemo(
    () => ({
      user,
      setUser,
      tokens,
      loading,
      permissionsLoading,
      permissionsError,
      isAuthenticated,
      login,
      logout,
      updateTokens,
      hasRole,
      permissionRows,
      hasPermission,
    }),
    [user, tokens, loading, isAuthenticated, login, logout, updateTokens, hasRole, permissionRows, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
