import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState(localStorage.getItem('token'));

    useEffect(() => {
        if (token) {
            // Validate token by fetching user info
            fetchUser();
        } else {
            setLoading(false);
        }
    }, [token]);

    const fetchUser = async () => {
        try {
            const userData = await api.getMe();
            setUser(userData);
        } catch (error) {
            // Token is invalid
            logout();
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        const response = await api.login(email, password);
        localStorage.setItem('token', response.access_token);
        setToken(response.access_token);
        setUser({
            id: response.user_id,
            name: response.name,
        });
        return response;
    };

    const register = async (email, password, name) => {
        const response = await api.register(email, password, name);
        localStorage.setItem('token', response.access_token);
        setToken(response.access_token);
        setUser({
            id: response.user_id,
            name: response.name,
        });
        return response;
    };

    const logout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    };

    const value = {
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser: fetchUser,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
