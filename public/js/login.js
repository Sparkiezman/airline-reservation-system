'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const alertBox = document.getElementById('form-alert');
    const submitBtn = document.getElementById('login-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Logging in...';

        try {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const { user } = await Api.post('/api/auth/login', { email, password });

            AppSession.invalidate();
            const params = new URLSearchParams(window.location.search);
            const next = params.get('next');
            window.location.href = next || dashboardHomeFor(user.role);
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Log In';
        }
    });
});
