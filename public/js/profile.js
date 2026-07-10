'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole();
    if (!user) return;

    const content = renderDashboardShell({
        role: user.role,
        activeKey: 'profile',
        title: 'Profile',
        subtitle: 'Update your personal details and password.'
    });

    content.innerHTML = `
        <div class="card card-pad max-w-560 mb-20">
            <h3 class="mt-0">Personal Details</h3>
            <div id="profile-alert"></div>
            <form id="profile-form">
                <div class="field">
                    <label>Email</label>
                    <input class="input" value="${escapeHtml(user.email)}" disabled>
                </div>
                <div class="input-row">
                    <div class="field">
                        <label for="firstName">First name</label>
                        <input class="input" id="firstName" value="${escapeHtml(user.firstName)}" required maxlength="100">
                    </div>
                    <div class="field">
                        <label for="lastName">Last name</label>
                        <input class="input" id="lastName" value="${escapeHtml(user.lastName)}" required maxlength="100">
                    </div>
                </div>
                <div class="field">
                    <label for="phone">Phone</label>
                    <input class="input" id="phone" value="${escapeHtml(user.phone || '')}" maxlength="30">
                </div>
                <button type="submit" class="btn btn-primary" id="profile-submit">Save Changes</button>
            </form>
        </div>

        <div class="card card-pad max-w-560">
            <h3 class="mt-0">Change Password</h3>
            <div id="password-alert"></div>
            <form id="password-form">
                <div class="field">
                    <label for="currentPassword">Current password</label>
                    <input class="input" type="password" id="currentPassword" autocomplete="current-password" required maxlength="128">
                </div>
                <div class="field">
                    <label for="newPassword">New password</label>
                    <input class="input" type="password" id="newPassword" autocomplete="new-password" required maxlength="128">
                    <div class="form-hint">At least 8 characters, with uppercase, lowercase, a digit, and a symbol.</div>
                </div>
                <button type="submit" class="btn btn-secondary" id="password-submit">Update Password</button>
            </form>
        </div>
    `;

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('profile-alert');
        alertBox.innerHTML = '';
        try {
            await Api.put('/api/auth/profile', {
                firstName: document.getElementById('firstName').value.trim(),
                lastName: document.getElementById('lastName').value.trim(),
                phone: document.getElementById('phone').value.trim()
            });
            alertBox.innerHTML = `<div class="alert alert-success">Profile updated.</div>`;
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    });

    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('password-alert');
        alertBox.innerHTML = '';
        const form = e.target;
        try {
            await Api.post('/api/auth/change-password', {
                currentPassword: document.getElementById('currentPassword').value,
                newPassword: document.getElementById('newPassword').value
            });
            alertBox.innerHTML = `<div class="alert alert-success">Password updated.</div>`;
            form.reset();
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    });
});
