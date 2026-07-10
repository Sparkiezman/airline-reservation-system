'use strict';

/**
 * Thin fetch wrapper: attaches the session-bound CSRF token to every
 * mutating request and normalizes error handling. All requests are
 * same-origin (the API is served by the same Express app as this page).
 */
const Api = (() => {
    let csrfToken = null;

    async function ensureCsrfToken() {
        if (csrfToken) return csrfToken;
        const res = await fetch('/api/auth/csrf-token', { credentials: 'same-origin' });
        const data = await res.json();
        csrfToken = data.csrfToken;
        return csrfToken;
    }

    async function request(path, { method = 'GET', body, headers = {} } = {}) {
        const opts = {
            method,
            credentials: 'same-origin',
            headers: { ...headers }
        };

        if (method !== 'GET' && method !== 'HEAD') {
            opts.headers['X-CSRF-Token'] = await ensureCsrfToken();
        }
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }

        let res = await fetch(path, opts);

        // Token may be stale (session rotated on login/register) — retry once.
        if (res.status === 403 && method !== 'GET') {
            csrfToken = null;
            opts.headers['X-CSRF-Token'] = await ensureCsrfToken();
            res = await fetch(path, opts);
        }

        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : null;

        if (!res.ok) {
            const error = new Error((data && data.error) || `Request failed (${res.status})`);
            error.status = res.status;
            error.details = data && data.details;
            throw error;
        }
        return data;
    }

    return {
        get: (path) => request(path, { method: 'GET' }),
        post: (path, body) => request(path, { method: 'POST', body }),
        put: (path, body) => request(path, { method: 'PUT', body }),
        del: (path) => request(path, { method: 'DELETE' }),
        resetCsrf: () => { csrfToken = null; },
        raw: request
    };
})();

function formatMoney(cents, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
}

function formatDateTime(value) {
    return new Date(value).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function formatDate(value) {
    return new Date(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'toast-stack';
        document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}
