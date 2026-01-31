/**
 * API service for Run Sync AI backend
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
    constructor() {
        this.baseUrl = `${API_BASE}/api/v1`;
    }

    getAuthHeader() {
        const token = localStorage.getItem('token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async fetch(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;

        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeader(),
                ...options.headers,
            },
            ...options,
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // Auth
    async login(email, password) {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Login failed');
        }

        return await response.json();
    }

    register(email, password, name) {
        return this.fetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
    }

    getMe() {
        return this.fetch('/auth/me');
    }

    getAuthStatus() {
        return this.fetch('/auth/status');
    }

    syncStrava(days = 30) {
        return this.fetch(`/auth/strava/sync?days=${days}`, { method: 'POST' });
    }

    // Activities
    getActivities(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.fetch(`/activities/${query ? '?' + query : ''}`);
    }

    getActivity(id) {
        return this.fetch(`/activities/${id}`);
    }

    getActivityStats(days = 7) {
        return this.fetch(`/activities/stats/summary?days=${days}`);
    }

    updateClassification(id, classification) {
        return this.fetch(`/activities/${id}/classification`, {
            method: 'PATCH',
            body: JSON.stringify(classification),
        });
    }

    // Checkins
    getCheckins(days = 14) {
        return this.fetch(`/checkins/?days=${days}`);
    }

    getTodayCheckin() {
        return this.fetch('/checkins/today');
    }

    createCheckin(data) {
        return this.fetch('/checkins/', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    getCheckinSummary(days = 7) {
        return this.fetch(`/checkins/history/summary?days=${days}`);
    }

    // Coaching
    getTrainingMetrics() {
        return this.fetch('/coaching/metrics');
    }

    getFitnessHistory(days = 90) {
        return this.fetch(`/coaching/fitness-history?days=${days}`);
    }

    getRecommendation() {
        return this.fetch('/coaching/recommendation');
    }

    getAcwrStatus() {
        return this.fetch('/coaching/acwr-status');
    }

    // Goals
    getGoals(status = null) {
        const query = status ? `?status=${status}` : '';
        return this.fetch(`/goals/${query}`);
    }

    getGoal(id) {
        return this.fetch(`/goals/${id}`);
    }

    createGoal(data) {
        return this.fetch('/goals/', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    updateGoal(id, data) {
        return this.fetch(`/goals/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    deleteGoal(id) {
        return this.fetch(`/goals/${id}`, { method: 'DELETE' });
    }

    generatePlan(goalId) {
        return this.fetch(`/goals/${goalId}/generate-plan`, { method: 'POST' });
    }

    getGoalCalendar(goalId) {
        return this.fetch(`/goals/${goalId}/calendar`);
    }
}

export const api = new ApiService();
export default api;

