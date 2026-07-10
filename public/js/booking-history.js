'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole('customer');
    if (!user) return;

    const content = renderDashboardShell({
        role: 'customer',
        activeKey: 'bookings',
        title: 'My Bookings',
        subtitle: 'View, pay for, cancel, or download tickets for your trips.'
    });

    async function load() {
        content.innerHTML = `<div class="empty-hint">Loading...</div>`;
        try {
            const { bookings } = await Api.get('/api/bookings');
            renderTable(bookings);
        } catch (err) {
            content.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    function renderTable(bookings) {
        if (!bookings.length) {
            content.innerHTML = `<div class="card"><div class="empty-hint">No bookings yet. <a href="/search.html">Search flights</a> to book your first trip.</div></div>`;
            return;
        }

        content.innerHTML = `
            <div class="card">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr><th>Booking Ref</th><th>Route</th><th>Departure</th><th>Total</th><th>Status</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            ${bookings.map((b) => `
                                <tr>
                                    <td>${escapeHtml(b.bookingRef)}</td>
                                    <td>${escapeHtml(b.originCode)} &#10142; ${escapeHtml(b.destinationCode)}</td>
                                    <td>${formatDateTime(b.departureTime)}</td>
                                    <td>${formatMoney(b.totalPriceCents, b.currency)}</td>
                                    <td>${statusBadge(b.status)}</td>
                                    <td>
                                        <div class="flex gap-8">
                                            ${b.status === 'pending_payment' ? `<a class="btn btn-primary btn-sm" href="/payment.html?bookingId=${b.id}">Pay</a>` : ''}
                                            ${['confirmed', 'checked_in', 'completed'].includes(b.status) ? `<a class="btn btn-secondary btn-sm" href="/api/bookings/${b.id}/eticket" download>E-Ticket</a>` : ''}
                                            ${['pending_payment', 'confirmed'].includes(b.status) ? `<button class="btn btn-danger btn-sm cancel-btn" data-id="${b.id}">Cancel</button>` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        content.querySelectorAll('.cancel-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!window.confirm('Cancel this booking? This cannot be undone.')) return;
                btn.disabled = true;
                try {
                    await Api.post(`/api/bookings/${btn.dataset.id}/cancel`);
                    showToast('Booking cancelled.', 'success');
                    load();
                } catch (err) {
                    showToast(err.message, 'error');
                    btn.disabled = false;
                }
            });
        });
    }

    load();
});
