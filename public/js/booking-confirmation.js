'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole();
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('bookingId');
    const pageAlert = document.getElementById('page-alert');
    const content = document.getElementById('confirmation-content');
    if (!bookingId) {
        window.location.href = '/customer-dashboard.html';
        return;
    }

    try {
        const { booking } = await Api.get(`/api/bookings/${bookingId}`);

        content.innerHTML = `
            <div class="text-center my-28">
                <div class="feature-icon icon-hero">&#9989;</div>
                <h1 class="confirmation-title">Booking Confirmed</h1>
                <p class="text-muted">Your seats are reserved. A copy of your e-ticket is ready to download.</p>
            </div>

            <div class="boarding-pass">
                <div class="bp-header">
                    <div class="route">
                        <span>${escapeHtml(booking.flight.originCode)}</span>
                        <span class="text-purple">&#8594;</span>
                        <span>${escapeHtml(booking.flight.destinationCode)}</span>
                    </div>
                    <div class="sub">Booking Ref: ${escapeHtml(booking.bookingRef)}</div>
                </div>
                <div class="bp-body">
                    <div class="bp-row"><span class="k">Flight</span><span class="v">${escapeHtml(booking.flight.flightNumber)}</span></div>
                    <div class="bp-row"><span class="k">Departure</span><span class="v">${formatDateTime(booking.flight.departureTime)}</span></div>
                    <div class="bp-row"><span class="k">Arrival</span><span class="v">${formatDateTime(booking.flight.arrivalTime)}</span></div>
                    <div class="bp-row"><span class="k">Gate / Terminal</span><span class="v">${escapeHtml(booking.flight.gate || '--')} / ${escapeHtml(booking.flight.terminal || '--')}</span></div>
                    ${booking.passengers.map((p) => `
                        <div class="bp-row"><span class="k">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span><span class="v">Seat ${escapeHtml(p.seatNumber)} &middot; ${escapeHtml(p.class)}</span></div>
                    `).join('')}
                    <div class="bp-row"><span class="k">Total Paid</span><span class="v">${formatMoney(booking.totalPriceCents, booking.currency)}</span></div>
                </div>
            </div>

            <div class="flex gap-12 mt-24">
                <a class="btn btn-primary btn-block" href="/api/bookings/${booking.id}/eticket" download>Download E-Ticket (PDF)</a>
            </div>
            <div class="flex gap-12 mt-12">
                <a class="btn btn-secondary btn-block" href="/customer-dashboard.html">Back to Dashboard</a>
            </div>
        `;
    } catch (err) {
        pageAlert.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
});
