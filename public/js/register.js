'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('register-form');
    const alertBox = document.getElementById('form-alert');
    const submitBtn = document.getElementById('register-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertBox.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Creating account...';

        try {
            const payload = {
                firstName: document.getElementById('firstName').value.trim(),
                lastName: document.getElementById('lastName').value.trim(),
                email: document.getElementById('email').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                password: document.getElementById('password').value
            };
            const { user } = await Api.post('/api/auth/register', payload);
            AppSession.invalidate();
            window.location.href = dashboardHomeFor(user.role);
        } catch (err) {
            let msg = err.message;
            if (err.details && err.details.length) {
                msg = err.details.map((d) => d.message).join(' ');
            }
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Create Account';
        }
    });
});
