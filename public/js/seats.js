'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole();
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const flightId = params.get('flightId');
    const passengerCount = Math.min(6, Math.max(1, parseInt(params.get('passengers'), 10) || 1));

    if (!flightId) {
        window.location.href = '/search.html';
        return;
    }

    const flightHeader = document.getElementById('flight-header');
    const pageAlert = document.getElementById('page-alert');
    const seatMapEl = document.getElementById('seat-map');
    const passengerPanel = document.getElementById('passenger-panel');
    const summaryBar = document.getElementById('summary-bar');
    const summaryCount = document.getElementById('summary-count');
    const summaryTotal = document.getElementById('summary-total');
    const continueBtn = document.getElementById('continue-btn');

    let flight = null;
    let seats = [];
    /** @type {Array<{id:number, seatNumber:string, class:string, price:number}>} */
    let selectedSeats = [];

    function parseSeat(seatNumber) {
        const match = seatNumber.match(/^([A-Z]+)(\d+)$/);
        return { col: match[1], row: parseInt(match[2], 10) };
    }

    function renderFlightHeader() {
        flightHeader.innerHTML = `
            <div class="flex-between">
                <div>
                    <h2 class="confirmation-title">${escapeHtml(flight.originCode)} &#10142; ${escapeHtml(flight.destinationCode)}</h2>
                    <div class="text-muted">${escapeHtml(flight.flightNumber)} &middot; ${formatDateTime(flight.departureTime)}</div>
                </div>
                <div class="text-muted text-center">
                    Gate ${escapeHtml(flight.gate || '--')} &middot; Terminal ${escapeHtml(flight.terminal || '--')}
                </div>
            </div>
        `;
    }

    function renderSeatMap() {
        const cols = [...new Set(seats.map((s) => parseSeat(s.seatNumber).col))].sort();
        const rows = [...new Set(seats.map((s) => parseSeat(s.seatNumber).row))].sort((a, b) => a - b);
        const aisleAfter = Math.floor(cols.length / 2) - 1;

        const byKey = new Map(seats.map((s) => [s.seatNumber, s]));

        seatMapEl.innerHTML = rows.map((row) => {
            const cells = cols.map((col, i) => {
                const seatNumber = `${col}${row}`;
                const seat = byKey.get(seatNumber);
                if (!seat) return '<div class="seat seat-hidden"></div>';

                const isSelected = selectedSeats.some((s) => s.id === seat.id);
                const isOccupied = seat.status !== 'available' && seat.status !== 'held_by_you' && !isSelected;
                const classes = ['seat'];
                if (seat.class === 'business') classes.push('seat-business');
                if (seat.class === 'first') classes.push('seat-first');
                if (isOccupied) classes.push('seat-occupied');
                if (isSelected) classes.push('seat-selected');

                const aisleGap = i === aisleAfter ? '<div class="seat-aisle"></div>' : '';
                return `<button type="button" class="${classes.join(' ')}" data-seat-id="${seat.id}" ${isOccupied ? 'disabled' : ''} title="${seatNumber} · ${seat.class} · ${formatMoney(seat.price)}">${escapeHtml(seatNumber)}</button>${aisleGap}`;
            }).join('');

            return `<div class="seat-row"><span class="row-label">${row}</span>${cells}</div>`;
        }).join('');
    }

    function updateSummary() {
        summaryCount.textContent = `${selectedSeats.length} / ${passengerCount}`;
        const total = selectedSeats.reduce((sum, s) => sum + s.price, 0);
        summaryTotal.textContent = formatMoney(total);
        continueBtn.disabled = selectedSeats.length !== passengerCount;
        summaryBar.classList.remove('hidden');
    }

    async function loadSeats() {
        const data = await Api.get(`/api/flights/${flightId}/seats`);
        seats = data.seats;
        renderSeatMap();
    }

    async function toggleSeat(seatId) {
        const seat = seats.find((s) => String(s.id) === String(seatId));
        if (!seat) return;

        const alreadySelected = selectedSeats.some((s) => s.id === seat.id);
        if (alreadySelected) {
            selectedSeats = selectedSeats.filter((s) => s.id !== seat.id);
            renderSeatMap();
            updateSummary();
            return;
        }

        if (seat.status !== 'available' && seat.status !== 'held_by_you') return;
        if (selectedSeats.length >= passengerCount) {
            showToast(`You can only select ${passengerCount} seat(s) for this trip.`, 'error');
            return;
        }

        selectedSeats.push({ id: seat.id, seatNumber: seat.seatNumber, class: seat.class, price: seat.price });
        renderSeatMap();
        updateSummary();
    }

    seatMapEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.seat');
        if (!btn || btn.disabled) return;
        toggleSeat(btn.dataset.seatId);
    });

    function renderPassengerForm() {
        passengerPanel.classList.remove('hidden');
        passengerPanel.innerHTML = `
            <h3 class="mt-0">Passenger Details</h3>
            <form id="passenger-form">
                ${selectedSeats.map((s, i) => `
                    <div class="panel passenger-seat-card">
                        <div class="badge badge-purple mb-12">Seat ${escapeHtml(s.seatNumber)} &middot; ${escapeHtml(s.class)}</div>
                        <div class="input-row">
                            <div class="field no-mb">
                                <label>First name</label>
                                <input class="input" name="firstName-${i}" required maxlength="100">
                            </div>
                            <div class="field no-mb">
                                <label>Last name</label>
                                <input class="input" name="lastName-${i}" required maxlength="100">
                            </div>
                        </div>
                    </div>
                `).join('')}
                <div id="passenger-alert"></div>
                <button type="submit" class="btn btn-primary btn-block" id="passenger-submit">
                    <span class="btn-label">Reserve Seats &amp; Continue to Payment</span>
                </button>
            </form>
        `;
        passengerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

        document.getElementById('passenger-form').addEventListener('submit', submitPassengers);
    }

    async function submitPassengers(e) {
        e.preventDefault();
        const alertBox = document.getElementById('passenger-alert');
        const submitBtn = document.getElementById('passenger-submit');
        alertBox.innerHTML = '';
        submitBtn.disabled = true;

        const passengers = selectedSeats.map((s, i) => ({
            seatId: s.id,
            firstName: document.querySelector(`[name="firstName-${i}"]`).value.trim(),
            lastName: document.querySelector(`[name="lastName-${i}"]`).value.trim()
        }));

        const heldSeatIds = [];
        try {
            for (const s of selectedSeats) {
                await Api.post(`/api/flights/${flightId}/seats/${s.id}/hold`);
                heldSeatIds.push(s.id);
            }

            const { booking } = await Api.post('/api/bookings', { flightId: Number(flightId), passengers });
            window.location.href = `/payment.html?bookingId=${booking.id}`;
        } catch (err) {
            for (const seatId of heldSeatIds) {
                await Api.del(`/api/flights/${flightId}/seats/${seatId}/hold`).catch(() => {});
            }
            alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            submitBtn.disabled = false;
            await loadSeats();
        }
    }

    continueBtn.addEventListener('click', () => {
        if (selectedSeats.length !== passengerCount) return;
        renderPassengerForm();
    });

    try {
        const [{ flight: f }] = await Promise.all([Api.get(`/api/flights/${flightId}`), loadSeats()]);
        flight = f;
        renderFlightHeader();
        updateSummary();
    } catch (err) {
        pageAlert.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
});
