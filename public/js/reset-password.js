'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-form');
    const alertBox = document.getElementById('form-alert');
    const submitBtn = document.getElementById('reset-submit');

    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    if (tokenFromUrl) document.getElementById('token').value = tokenFromUrl;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Updating...';

        try {
            const token = document.getElementById('token').value.trim();
            const newPassword = document.getElementById('newPassword').value;
            await Api.post('/api/auth/reset-password', { token, newPassword });

            alertBox.innerHTML = `<div class="alert alert-success">Password updated. Redirecting to log in...</div>`;
            setTimeout(() => { window.location.href = '/login.html'; }, 1500);
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Update Password';
        }
    });
});
