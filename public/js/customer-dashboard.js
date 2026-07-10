'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole('customer');
    if (!user) return;

    const content = renderDashboardShell({
        role: 'customer',
        activeKey: 'overview',
        title: `Welcome, ${user.firstName}`,
        subtitle: 'Here is a summary of your upcoming travel.'
    });

    try {
        const { bookings } = await Api.get('/api/bookings');
        const upcoming = bookings.filter((b) => ['pending_payment', 'confirmed', 'checked_in'].includes(b.status));
        const confirmedCount = bookings.filter((b) => b.status === 'confirmed' || b.status === 'checked_in').length;
        const pendingCount = bookings.filter((b) => b.status === 'pending_payment').length;

        content.innerHTML = `
            <div class="stat-grid">
                <div class="card stat-card"><div class="label">Total Bookings</div><div class="value">${bookings.length}</div></div>
                <div class="card stat-card"><div class="label">Confirmed</div><div class="value">${confirmedCount}</div></div>
                <div class="card stat-card"><div class="label">Awaiting Payment</div><div class="value">${pendingCount}</div></div>
            </div>

            <div class="card card-pad">
                <div class="flex-between mb-16">
                    <h3 class="m-0">Upcoming Trips</h3>
                    <a class="btn btn-secondary btn-sm" href="/search.html">Book a Flight</a>
                </div>
                ${upcoming.length ? `
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead><tr><th>Booking Ref</th><th>Route</th><th>Departure</th><th>Status</th><th></th></tr></thead>
                            <tbody>
                                ${upcoming.map((b) => `
                                    <tr>
                                        <td>${escapeHtml(b.bookingRef)}</td>
                                        <td>${escapeHtml(b.originCode)} &#10142; ${escapeHtml(b.destinationCode)}</td>
                                        <td>${formatDateTime(b.departureTime)}</td>
                                        <td>${statusBadge(b.status)}</td>
                                        <td>
                                            ${b.status === 'pending_payment'
                                                ? `<a class="btn btn-primary btn-sm" href="/payment.html?bookingId=${b.id}">Pay Now</a>`
                                                : `<a class="btn btn-secondary btn-sm" href="/booking-confirmation.html?bookingId=${b.id}">View</a>`}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `<div class="empty-hint">No upcoming trips yet. <a href="/search.html">Search flights</a> to get started.</div>`}
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
});
