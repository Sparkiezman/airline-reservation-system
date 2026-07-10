'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-form');
    const alertBox = document.getElementById('form-alert');
    const submitBtn = document.getElementById('forgot-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Sending...';

        try {
            const email = document.getElementById('email').value.trim();
            const data = await Api.post('/api/auth/forgot-password', { email });

            let html = `<div class="alert alert-success">${escapeHtml(data.message)}</div>`;
            if (data.devResetToken) {
                const link = `/reset-password.html?token=${encodeURIComponent(data.devResetToken)}`;
                html += `<div class="alert alert-info">Dev mode only — no email service is configured. <a href="${link}">Click here to reset your password</a>.</div>`;
            }
            alertBox.innerHTML = html;
            form.reset();
        } catch (err) {
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Send Reset Link';
        }
    });
});
