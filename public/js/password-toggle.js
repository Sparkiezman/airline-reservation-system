'use strict';

/**
 * Auto-enhances every <input type="password"> on the page with a show/hide
 * eye-icon toggle. Purely a display concern (toggles the input's type
 * attribute) — never touches or logs the value.
 *
 * Uses a MutationObserver (not just a DOMContentLoaded query) because some
 * pages (e.g. profile.js) render their password fields asynchronously into
 * the DOM after the initial page load.
 */
(function () {
    const EYE_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.4 18.4 0 0 1 4.22-5.06M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

    function enhance(input) {
        if (input.closest('.password-field')) return; // already enhanced

        const wrapper = document.createElement('div');
        wrapper.className = 'password-field';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'password-toggle-btn';
        toggle.setAttribute('aria-label', 'Show password');
        toggle.innerHTML = EYE_OPEN;
        wrapper.appendChild(toggle);

        toggle.addEventListener('click', () => {
            const showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            toggle.innerHTML = showing ? EYE_OPEN : EYE_OFF;
            toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        });
    }

    function scan(root) {
        if (root.matches && root.matches('input[type="password"]')) enhance(root);
        root.querySelectorAll && root.querySelectorAll('input[type="password"]').forEach(enhance);
    }

    document.addEventListener('DOMContentLoaded', () => {
        scan(document.body);

        new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) scan(node);
                });
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
})();
