'use strict';

const DASH_NAV = {
    customer: [
        { key: 'overview', href: '/customer-dashboard.html', label: 'Overview', icon: '&#128200;' },
        { key: 'bookings', href: '/booking-history.html', label: 'My Bookings', icon: '&#128197;' },
        { key: 'profile', href: '/profile.html', label: 'Profile', icon: '&#128100;' }
    ],
    staff: [
        { key: 'flights', href: '/staff-dashboard.html', label: 'Flights', icon: '&#9992;' },
        { key: 'schedules', href: '/staff-dashboard.html#schedules', label: 'Schedules', icon: '&#128197;' },
        { key: 'aircraft', href: '/staff-dashboard.html#aircraft', label: 'Aircraft', icon: '&#128736;' },
        { key: 'profile', href: '/profile.html', label: 'Profile', icon: '&#128100;' }
    ],
    admin: [
        { key: 'users', href: '/admin-dashboard.html', label: 'Users', icon: '&#128101;' },
        { key: 'audit', href: '/admin-dashboard.html#audit', label: 'Audit Logs', icon: '&#128269;' },
        { key: 'settings', href: '/admin-dashboard.html#settings', label: 'Settings', icon: '&#9881;' },
        { key: 'profile', href: '/profile.html', label: 'Profile', icon: '&#128100;' }
    ]
};

/**
 * Renders the two-column dashboard shell (sidebar + main content mount)
 * into <main id="dash-root"></main> and returns the main content element.
 */
function renderDashboardShell({ role, activeKey, title, subtitle }) {
    const root = document.getElementById('dash-root');
    const items = DASH_NAV[role] || [];

    root.innerHTML = `
        <div class="dash-shell">
            <aside class="dash-sidebar">
                <div class="nav-group-label">${role} menu</div>
                ${items.map((item) => `
                    <a class="dash-link ${item.key === activeKey ? 'active' : ''}" href="${item.href}">
                        <span>${item.icon}</span> ${escapeHtml(item.label)}
                    </a>
                `).join('')}
            </aside>
            <div class="dash-main">
                <div class="dash-header">
                    <div>
                        <h1>${escapeHtml(title)}</h1>
                        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
                    </div>
                </div>
                <div id="dash-content"></div>
            </div>
        </div>
    `;
    return document.getElementById('dash-content');
}

function statusBadge(status) {
    const map = {
        pending_payment: 'badge-yellow',
        confirmed: 'badge-green',
        checked_in: 'badge-purple',
        completed: 'badge-gray',
        cancelled: 'badge-red',
        scheduled: 'badge-purple',
        boarding: 'badge-yellow',
        departed: 'badge-gray',
        arrived: 'badge-gray',
        delayed: 'badge-yellow',
        active: 'badge-green',
        paused: 'badge-yellow',
        ended: 'badge-gray'
    };
    const cls = map[status] || 'badge-gray';
    return `<span class="badge ${cls}">${escapeHtml(status.replace('_', ' '))}</span>`;
}
