'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole();
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('bookingId');
    if (!bookingId) {
        window.location.href = '/search.html';
        return;
    }

    const pageAlert = document.getElementById('page-alert');
    const summaryEl = document.getElementById('booking-summary');
    const form = document.getElementById('payment-form');
    const submitBtn = document.getElementById('pay-submit');

    function renderSummary(booking) {
        summaryEl.innerHTML = `
            <div class="flex-between">
                <div>
                    <div class="badge badge-purple">${escapeHtml(booking.bookingRef)}</div>
                    <h3 class="title-tight">${escapeHtml(booking.flight.originCode)} &#10142; ${escapeHtml(booking.flight.destinationCode)}</h3>
                    <div class="text-muted">${escapeHtml(booking.flight.flightNumber)} &middot; ${formatDateTime(booking.flight.departureTime)}</div>
                </div>
                <div class="text-center">
                    <div class="text-muted fs-xs">Total Due</div>
                    <div class="fs-xl fw-800">${formatMoney(booking.totalPriceCents, booking.currency)}</div>
                </div>
            </div>
            <div class="summary-divider">
                ${booking.passengers.map((p) => `
                    <div class="flex-between py-6">
                        <span>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span>
                        <span class="text-muted">Seat ${escapeHtml(p.seatNumber)} &middot; ${escapeHtml(p.class)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    let booking;
    try {
        const data = await Api.get(`/api/bookings/${bookingId}`);
        booking = data.booking;
        if (booking.status !== 'pending_payment') {
            pageAlert.innerHTML = `<div class="alert alert-info">This booking is already ${escapeHtml(booking.status)}.</div>`;
            form.classList.add('hidden');
        }
        renderSummary(booking);
    } catch (err) {
        pageAlert.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        form.classList.add('hidden');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        pageAlert.innerHTML = '';
        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Processing...';

        try {
            const payload = {
                cardholderName: document.getElementById('cardholderName').value.trim(),
                cardNumber: document.getElementById('cardNumber').value.trim(),
                expMonth: Number(document.getElementById('expMonth').value),
                expYear: Number(document.getElementById('expYear').value),
                cvc: document.getElementById('cvc').value.trim()
            };
            await Api.post(`/api/bookings/${bookingId}/pay`, payload);
            window.location.href = `/booking-confirmation.html?bookingId=${bookingId}`;
        } catch (err) {
            pageAlert.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Pay Now';
        }
    });
});
