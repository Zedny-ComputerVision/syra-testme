import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

type User = { id: number; name: string; email: string; role: string };

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<User>;
    register: (name: string, email: string, password: string, photos?: { idPhoto?: File, liveFacePhoto?: File }) => Promise<User>;
    logout: () => void;
    setAuth: (user: User, token: string) => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    console.log("AuthProvider initializing, user:", user, "isLoading:", isLoading);

    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
        try {
            localStorage.removeItem('auth');
        } catch { }
    }, []);

    const setAuth = useCallback((u: User, t: string) => {
        setUser(u);
        setToken(t);
        try {
            localStorage.setItem('auth', JSON.stringify({ user: u, token: t }));
        } catch { }
    }, []);

    const checkAuth = useCallback(async () => {
        try {
            const raw = localStorage.getItem('auth');
            let storedToken = null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.token) {
                    storedToken = parsed.token;
                    setToken(parsed.token);
                    if (parsed.user) setUser(parsed.user);
                }
            }

            if (storedToken) {
                // Add a small timeout to the fetch to prevent hanging forever
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                try {
                    const res = await fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${storedToken}` },
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (res && res.ok) {
                        const userData = await res.json();
                        setUser(userData);
                        localStorage.setItem('auth', JSON.stringify({ user: userData, token: storedToken }));
                    } else {
                        logout();
                    }
                } catch (e) {
                    console.error("Auth validation failed or timed out", e);
                    // On network error, keep current local state but stop loading
                }
            }
        } catch (err) {
            console.error("Auth check internal error", err);
        } finally {
            setIsLoading(false);
        }
    }, [logout]);

    console.log("AuthProvider rendered, isLoading:", isLoading);

    useEffect(() => {
        // Run checkAuth once on mount
        checkAuth();
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const body = JSON.stringify({ email, password });
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Login failed');
        }

        const data = await res.json();
        const newUser = data.user;
        const newToken = data.token;

        setUser(newUser);
        setToken(newToken);
        localStorage.setItem('auth', JSON.stringify({ user: newUser, token: newToken }));
        return newUser;
    }, []);

    const register = useCallback(async (name: string, email: string, password: string, photos?: { idPhoto?: File, liveFacePhoto?: File }) => {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('password', password);
        if (photos?.idPhoto) formData.append('id_photo', photos.idPhoto);
        if (photos?.liveFacePhoto) formData.append('live_face_photo', photos.liveFacePhoto);

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Registration failed');
        }

        const data = await res.json();
        const newUser = data.user;
        const newToken = data.token;

        setUser(newUser);
        setToken(newToken);
        localStorage.setItem('auth', JSON.stringify({ user: newUser, token: newToken }));
        return newUser;
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout, register, setAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
