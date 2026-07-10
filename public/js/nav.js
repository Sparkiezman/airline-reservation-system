'use strict';

/**
 * Renders the shared navbar into <div id="app-navbar"></div> based on
 * current session state, and exposes AppSession for pages that need to
 * gate content by role (dashboards) or redirect anonymous users.
 */
const AppSession = (() => {
    let cached = null;
    let loaded = false;

    async function getUser() {
        if (loaded) return cached;
        try {
            const data = await Api.get('/api/auth/me');
            cached = data.user;
        } catch {
            cached = null;
        }
        loaded = true;
        return cached;
    }

    function invalidate() {
        loaded = false;
        cached = null;
    }

    /** Redirects to /login.html if not authenticated; to /index.html if role not allowed. */
    async function requireRole(...roles) {
        const user = await getUser();
        if (!user) {
            window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname);
            return null;
        }
        if (roles.length && !roles.includes(user.role)) {
            window.location.href = '/index.html';
            return null;
        }
        return user;
    }

    return { getUser, invalidate, requireRole };
})();

function dashboardHomeFor(role) {
    if (role === 'admin') return '/admin-dashboard.html';
    if (role === 'staff') return '/staff-dashboard.html';
    return '/customer-dashboard.html';
}

async function renderNavbar(activePath = '') {
    const mount = document.getElementById('app-navbar');
    if (!mount) return;

    const user = await AppSession.getUser();

    const links = [
        { href: '/index.html', label: 'Home' },
        { href: '/search.html', label: 'Find Flights' }
    ];

    const linksHtml = links.map(
        (l) => `<a href="${l.href}" class="${activePath === l.href ? 'active' : ''}">${l.label}</a>`
    ).join('');

    let actionsHtml;
    if (user) {
        actionsHtml = `
            <a href="${dashboardHomeFor(user.role)}" class="btn btn-secondary btn-sm">Dashboard</a>
            <button id="nav-logout-btn" class="btn btn-ghost btn-sm">Log out</button>
        `;
    } else {
        actionsHtml = `
            <a href="/login.html" class="btn btn-ghost btn-sm">Log in</a>
            <a href="/register.html" class="btn btn-primary btn-sm">Sign up</a>
        `;
    }

    mount.innerHTML = `
        <nav class="navbar">
            <div class="navbar-inner">
                <a href="/index.html" class="brand">
                    <span class="brand-mark"><img src="/assets/logo-mark.svg" width="20" height="20" alt=""></span> SkyReserve
                </a>
                <div class="nav-links">${linksHtml}</div>
                <div class="nav-actions">${actionsHtml}</div>
            </div>
        </nav>
    `;

    const logoutBtn = document.getElementById('nav-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await Api.post('/api/auth/logout');
            } catch { /* proceed regardless */ }
            AppSession.invalidate();
            Api.resetCsrf();
            window.location.href = '/index.html';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderNavbar(window.location.pathname);
});
