'use strict';

/**
 * Appends a simple copyright footer to every page. Year is computed at
 * render time so it never needs to be updated by hand.
 */
document.addEventListener('DOMContentLoaded', () => {
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.textContent = `© ${new Date().getFullYear()} SkyReserve Airlines. All Rights Reserved.`;
    document.body.appendChild(footer);
});
