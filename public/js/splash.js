'use strict';

/**
 * Brand splash shown on every visit to the landing page.
 * Waits for a minimum visible time (so it never just flashes) and for
 * window "load" (so it doesn't disappear before styles/images are ready),
 * then fades out and removes itself from the DOM.
 */
(function () {
    var MIN_VISIBLE_MS = 500;
    var FADE_MS = 280;

    document.addEventListener('DOMContentLoaded', function () {
        var splash = document.getElementById('splash-screen');
        if (!splash) return;

        var start = Date.now();
        function dismiss() {
            var elapsed = Date.now() - start;
            var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
            setTimeout(function () {
                splash.classList.add('splash-hidden');
                setTimeout(function () { splash.remove(); }, FADE_MS);
            }, wait);
        }

        if (document.readyState === 'complete') {
            dismiss();
        } else {
            window.addEventListener('load', dismiss);
        }
    });
})();
