'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole('admin');
    if (!user) return;

    function initialTab() {
        const hash = window.location.hash.replace('#', '');
        return ['audit', 'settings'].includes(hash) ? hash : 'users';
    }

    const content = renderDashboardShell({
        role: 'admin',
        activeKey: initialTab() === 'users' ? 'users' : initialTab(),
        title: 'Admin Console',
        subtitle: 'Manage users, roles, audit logs, and system settings.'
    });

    function renderTabs(active) {
        return `
            <div class="tabs">
                <button type="button" class="tab-btn ${active === 'users' ? 'active' : ''}" data-tab="users">Users</button>
                <button type="button" class="tab-btn ${active === 'audit' ? 'active' : ''}" data-tab="audit">Audit Logs</button>
                <button type="button" class="tab-btn ${active === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
            </div>
        `;
    }

    function wireTabButtons() {
        content.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                window.location.hash = btn.dataset.tab === 'users' ? '' : btn.dataset.tab;
                renderTab(btn.dataset.tab);
            });
        });
    }

    // ---------- Users tab ----------

    async function renderUsersTab() {
        content.innerHTML = renderTabs('users') + `
            <div class="card card-pad mb-16">
                <form id="user-filter-form" class="input-row">
                    <input class="input" id="user-search" placeholder="Search name or email">
                    <select class="input" id="user-role-filter">
                        <option value="">All roles</option>
                        <option value="customer">Customer</option>
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" class="btn btn-secondary">Filter</button>
                </form>
            </div>
            <div id="users-table" class="card"><div class="empty-hint">Loading...</div></div>
        `;
        wireTabButtons();

        let page = 1;
        async function load() {
            const search = document.getElementById('user-search').value.trim();
            const role = document.getElementById('user-role-filter').value;
            const params = new URLSearchParams({ page, pageSize: 20 });
            if (search) params.set('search', search);
            if (role) params.set('role', role);

            try {
                const { users, pagination } = await Api.get(`/api/admin/users?${params.toString()}`);
                renderUsersTable(users, pagination);
            } catch (err) {
                document.getElementById('users-table').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            }
        }

        function renderUsersTable(users, pagination) {
            const el = document.getElementById('users-table');
            if (!users.length) {
                el.innerHTML = `<div class="empty-hint">No users match this filter.</div>`;
                return;
            }
            el.innerHTML = `
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${users.map((u) => `
                                <tr>
                                    <td>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</td>
                                    <td>${escapeHtml(u.email)}</td>
                                    <td>
                                        <select class="input role-select select-inline" data-id="${u.id}" ${u.id === user.id ? 'disabled' : ''}>
                                            ${['customer', 'staff', 'admin'].map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
                                        </select>
                                    </td>
                                    <td>${u.isActive ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Disabled</span>'}</td>
                                    <td>${formatDate(u.createdAt)}</td>
                                    <td>
                                        ${u.id === user.id
                                            ? '<span class="text-muted fs-xs">(you)</span>'
                                            : `<button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-secondary'} status-toggle-btn" data-id="${u.id}" data-active="${u.isActive}">${u.isActive ? 'Disable' : 'Enable'}</button>`}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="flex-between table-footer">
                    <span class="text-muted fs-sm">Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} users)</span>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-sm" id="prev-page" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
                        <button class="btn btn-secondary btn-sm" id="next-page" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            `;

            el.querySelectorAll('.role-select').forEach((sel) => {
                sel.addEventListener('change', async () => {
                    try {
                        await Api.put(`/api/admin/users/${sel.dataset.id}/role`, { role: sel.value });
                        showToast('Role updated.', 'success');
                    } catch (err) {
                        showToast(err.message, 'error');
                        load();
                    }
                });
            });
            el.querySelectorAll('.status-toggle-btn').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const nextActive = btn.dataset.active !== 'true';
                    try {
                        await Api.put(`/api/admin/users/${btn.dataset.id}/status`, { isActive: nextActive });
                        showToast('User status updated.', 'success');
                        load();
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            });
            const prevBtn = document.getElementById('prev-page');
            const nextBtn = document.getElementById('next-page');
            if (prevBtn) prevBtn.addEventListener('click', () => { page = Math.max(1, page - 1); load(); });
            if (nextBtn) nextBtn.addEventListener('click', () => { page += 1; load(); });
        }

        document.getElementById('user-filter-form').addEventListener('submit', (e) => {
            e.preventDefault();
            page = 1;
            load();
        });

        load();
    }

    // ---------- Audit logs tab ----------

    async function renderAuditTab() {
        content.innerHTML = renderTabs('audit') + `
            <div class="card card-pad mb-16">
                <form id="audit-filter-form" class="input-row">
                    <input class="input" id="audit-action" placeholder="Filter by action (e.g. login_failed)">
                    <button type="submit" class="btn btn-secondary">Filter</button>
                </form>
            </div>
            <div id="audit-table" class="card"><div class="empty-hint">Loading...</div></div>
        `;
        wireTabButtons();

        let page = 1;
        async function load() {
            const action = document.getElementById('audit-action').value.trim();
            const params = new URLSearchParams({ page, pageSize: 30 });
            if (action) params.set('action', action);

            try {
                const { logs, pagination } = await Api.get(`/api/admin/audit-logs?${params.toString()}`);
                renderLogsTable(logs, pagination);
            } catch (err) {
                document.getElementById('audit-table').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            }
        }

        function renderLogsTable(logs, pagination) {
            const el = document.getElementById('audit-table');
            if (!logs.length) {
                el.innerHTML = `<div class="empty-hint">No matching audit events.</div>`;
                return;
            }
            el.innerHTML = `
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
                        <tbody>
                            ${logs.map((l) => `
                                <tr>
                                    <td>${formatDateTime(l.created_at)}</td>
                                    <td>${escapeHtml(l.actor_email || 'anonymous')}</td>
                                    <td><span class="badge badge-purple">${escapeHtml(l.action)}</span></td>
                                    <td>${escapeHtml(l.entity_type || '')} ${escapeHtml(l.entity_id || '')}</td>
                                    <td class="text-muted">${escapeHtml(l.ip_address || '')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="flex-between table-footer">
                    <span class="text-muted fs-sm">Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} events)</span>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-sm" id="audit-prev" ${pagination.page <= 1 ? 'disabled' : ''}>Previous</button>
                        <button class="btn btn-secondary btn-sm" id="audit-next" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            `;
            const prevBtn = document.getElementById('audit-prev');
            const nextBtn = document.getElementById('audit-next');
            if (prevBtn) prevBtn.addEventListener('click', () => { page = Math.max(1, page - 1); load(); });
            if (nextBtn) nextBtn.addEventListener('click', () => { page += 1; load(); });
        }

        document.getElementById('audit-filter-form').addEventListener('submit', (e) => {
            e.preventDefault();
            page = 1;
            load();
        });

        load();
    }

    // ---------- Settings tab ----------

    async function renderSettingsTab() {
        content.innerHTML = renderTabs('settings') + `<div id="settings-list" class="card card-pad"><div class="empty-hint">Loading...</div></div>`;
        wireTabButtons();

        try {
            const { settings } = await Api.get('/api/admin/settings');
            const el = document.getElementById('settings-list');
            el.innerHTML = settings.map((s) => `
                <div class="field setting-row">
                    <label>${escapeHtml(s.key)}</label>
                    <div class="flex gap-8">
                        <input class="input setting-value" data-key="${escapeHtml(s.key)}" value="${escapeHtml(JSON.stringify(s.value))}">
                        <button class="btn btn-secondary btn-sm save-setting-btn" data-key="${escapeHtml(s.key)}">Save</button>
                    </div>
                    <div class="form-hint">Last updated ${formatDateTime(s.updated_at)}</div>
                </div>
            `).join('');

            el.querySelectorAll('.save-setting-btn').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const input = el.querySelector(`.setting-value[data-key="${CSS.escape(btn.dataset.key)}"]`);
                    try {
                        const value = JSON.parse(input.value);
                        await Api.put(`/api/admin/settings/${encodeURIComponent(btn.dataset.key)}`, { value });
                        showToast('Setting saved.', 'success');
                    } catch (err) {
                        showToast(err.message || 'Invalid JSON value', 'error');
                    }
                });
            });
        } catch (err) {
            document.getElementById('settings-list').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    function renderTab(tab) {
        if (tab === 'audit') renderAuditTab();
        else if (tab === 'settings') renderSettingsTab();
        else renderUsersTab();
    }

    renderTab(initialTab());
});
