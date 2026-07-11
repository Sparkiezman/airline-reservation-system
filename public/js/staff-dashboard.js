'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await AppSession.requireRole('staff', 'admin');
    if (!user) return;

    function currentTabFromHash() {
        const hash = window.location.hash.replace('#', '');
        return ['aircraft', 'schedules'].includes(hash) ? hash : 'flights';
    }

    const content = renderDashboardShell({
        role: 'staff',
        activeKey: currentTabFromHash(),
        title: 'Staff Operations',
        subtitle: 'Manage flights, schedules, aircraft, and passenger check-in.'
    });

    const modalRoot = document.getElementById('modal-root');
    let aircraftCache = [];

    function closeModal() { modalRoot.innerHTML = ''; }

    function openModal(title, bodyHtml) {
        modalRoot.innerHTML = `
            <div class="modal-overlay">
                <div class="card modal">
                    <div class="modal-header">
                        <h3 class="m-0">${escapeHtml(title)}</h3>
                        <button type="button" class="close-btn" id="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">${bodyHtml}</div>
                </div>
            </div>
        `;
        document.getElementById('modal-close').addEventListener('click', closeModal);
        modalRoot.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) closeModal();
        });
    }

    function renderTabs(active) {
        return `
            <div class="tabs">
                <button type="button" class="tab-btn ${active === 'flights' ? 'active' : ''}" data-tab="flights">Flights</button>
                <button type="button" class="tab-btn ${active === 'schedules' ? 'active' : ''}" data-tab="schedules">Schedules</button>
                <button type="button" class="tab-btn ${active === 'aircraft' ? 'active' : ''}" data-tab="aircraft">Aircraft</button>
            </div>
        `;
    }

    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // ---------- Flights tab ----------

    async function loadAircraftOptions() {
        const { aircraft } = await Api.get('/api/staff/aircraft');
        aircraftCache = aircraft;
        return aircraft;
    }

    async function renderFlightsTab() {
        content.innerHTML = renderTabs('flights') + `
            <div class="flex-between mb-16">
                <div></div>
                <button class="btn btn-primary btn-sm" id="new-flight-btn">+ New Flight</button>
            </div>
            <div id="flights-table" class="card"><div class="empty-hint">Loading...</div></div>
        `;
        wireTabButtons();
        document.getElementById('new-flight-btn').addEventListener('click', openFlightFormModal);

        try {
            const [{ flights }] = await Promise.all([Api.get('/api/staff/flights'), loadAircraftOptions()]);
            renderFlightsTable(flights);
        } catch (err) {
            document.getElementById('flights-table').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    function renderFlightsTable(flights) {
        const el = document.getElementById('flights-table');
        if (!flights.length) {
            el.innerHTML = `<div class="empty-hint">No flights yet. Create one to get started.</div>`;
            return;
        }
        el.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Flight</th><th>Route</th><th>Departure</th><th>Aircraft</th><th>Bookings</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${flights.map((f) => `
                            <tr>
                                <td>${escapeHtml(f.flightNumber)}</td>
                                <td>${escapeHtml(f.originCode)} &#10142; ${escapeHtml(f.destinationCode)}</td>
                                <td>${formatDateTime(f.departureTime)}</td>
                                <td>${escapeHtml(f.aircraftTailNumber)}</td>
                                <td>${f.confirmedBookings}</td>
                                <td>${statusBadge(f.status)}</td>
                                <td>
                                    <div class="flex gap-8">
                                        <button class="btn btn-secondary btn-sm edit-flight-btn" data-id="${f.id}">Edit</button>
                                        <button class="btn btn-secondary btn-sm manifest-btn" data-id="${f.id}" data-label="${escapeHtml(f.flightNumber)}">Manifest</button>
                                        ${f.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm cancel-flight-btn" data-id="${f.id}">Cancel</button>` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        el.querySelectorAll('.edit-flight-btn').forEach((btn) => {
            const flight = flights.find((f) => String(f.id) === btn.dataset.id);
            btn.addEventListener('click', () => openFlightEditModal(flight));
        });
        el.querySelectorAll('.manifest-btn').forEach((btn) => {
            btn.addEventListener('click', () => openManifestModal(btn.dataset.id, btn.dataset.label));
        });
        el.querySelectorAll('.cancel-flight-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!window.confirm('Cancel this flight? All active bookings will be cancelled.')) return;
                try {
                    await Api.post(`/api/staff/flights/${btn.dataset.id}/cancel`);
                    showToast('Flight cancelled.', 'success');
                    renderFlightsTab();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });
    }

    function openFlightFormModal() {
        openModal('New Flight', `
            <form id="flight-form">
                <div id="flight-form-alert"></div>
                <div class="input-row">
                    <div class="field"><label>Flight number</label><input class="input" name="flightNumber" required maxlength="10" placeholder="FA100"></div>
                    <div class="field"><label>Aircraft</label>
                        <select class="input" name="aircraftId" required>
                            ${aircraftCache.map((a) => `<option value="${a.id}">${escapeHtml(a.tail_number)} (${escapeHtml(a.model)})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Origin code</label><input class="input" name="originCode" required maxlength="3" placeholder="TPA"></div>
                    <div class="field"><label>Destination code</label><input class="input" name="destinationCode" required maxlength="3" placeholder="COS"></div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Departure</label><input class="input" type="datetime-local" name="departureTime" required></div>
                    <div class="field"><label>Arrival</label><input class="input" type="datetime-local" name="arrivalTime" required></div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Economy price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceEconomy" required></div>
                    <div class="field"><label>Business price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceBusiness" required></div>
                    <div class="field"><label>First class price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceFirst" value="0"></div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Gate</label><input class="input" name="gate" maxlength="10"></div>
                    <div class="field"><label>Terminal</label><input class="input" name="terminal" maxlength="10"></div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Create Flight</button>
            </form>
        `);

        document.getElementById('flight-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const alertBox = document.getElementById('flight-form-alert');
            try {
                await Api.post('/api/staff/flights', {
                    flightNumber: fd.get('flightNumber'),
                    aircraftId: Number(fd.get('aircraftId')),
                    originCode: fd.get('originCode'),
                    destinationCode: fd.get('destinationCode'),
                    departureTime: new Date(fd.get('departureTime')).toISOString(),
                    arrivalTime: new Date(fd.get('arrivalTime')).toISOString(),
                    basePriceEconomyCents: Math.round(Number(fd.get('basePriceEconomy')) * 100),
                    basePriceBusinessCents: Math.round(Number(fd.get('basePriceBusiness')) * 100),
                    basePriceFirstCents: Math.round(Number(fd.get('basePriceFirst') || 0) * 100),
                    gate: fd.get('gate'),
                    terminal: fd.get('terminal')
                });
                closeModal();
                showToast('Flight created.', 'success');
                renderFlightsTab();
            } catch (err) {
                let msg = err.message;
                if (err.details && err.details.length) msg = err.details.map((d) => d.message).join(' ');
                alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
            }
        });
    }

    function openFlightEditModal(flight) {
        openModal(`Edit ${flight.flightNumber}`, `
            <form id="flight-edit-form">
                <div id="flight-edit-alert"></div>
                <div class="field"><label>Status</label>
                    <select class="input" name="status">
                        ${['scheduled', 'boarding', 'departed', 'arrived', 'delayed', 'cancelled'].map((s) => `<option value="${s}" ${s === flight.status ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="input-row">
                    <div class="field"><label>Gate</label><input class="input" name="gate" value="${escapeHtml(flight.gate || '')}" maxlength="10"></div>
                    <div class="field"><label>Terminal</label><input class="input" name="terminal" value="${escapeHtml(flight.terminal || '')}" maxlength="10"></div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Economy price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceEconomy" value="${(flight.basePriceEconomyCents / 100).toFixed(2)}"></div>
                    <div class="field"><label>Business price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceBusiness" value="${(flight.basePriceBusinessCents / 100).toFixed(2)}"></div>
                    <div class="field"><label>First class price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceFirst" value="${(flight.basePriceFirstCents / 100).toFixed(2)}"></div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Save Changes</button>
            </form>
        `);

        document.getElementById('flight-edit-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const alertBox = document.getElementById('flight-edit-alert');
            try {
                await Api.put(`/api/staff/flights/${flight.id}`, {
                    status: fd.get('status'),
                    gate: fd.get('gate'),
                    terminal: fd.get('terminal'),
                    basePriceEconomyCents: Math.round(Number(fd.get('basePriceEconomy')) * 100),
                    basePriceBusinessCents: Math.round(Number(fd.get('basePriceBusiness')) * 100),
                    basePriceFirstCents: Math.round(Number(fd.get('basePriceFirst') || 0) * 100)
                });
                closeModal();
                showToast('Flight updated.', 'success');
                renderFlightsTab();
            } catch (err) {
                alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
            }
        });
    }

    async function openManifestModal(flightId, label) {
        openModal(`Manifest — ${label}`, `<div id="manifest-body" class="empty-hint">Loading...</div>`);
        try {
            const { manifest } = await Api.get(`/api/staff/flights/${flightId}/manifest`);
            const body = document.getElementById('manifest-body');
            if (!manifest.length) {
                body.innerHTML = `<div class="empty-hint">No passengers booked yet.</div>`;
                return;
            }
            body.innerHTML = `
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Passenger</th><th>Seat</th><th>Status</th><th></th></tr></thead>
                        <tbody>
                            ${manifest.map((m) => `
                                <tr>
                                    <td>${escapeHtml(m.passengerName)}</td>
                                    <td>${escapeHtml(m.seatNumber)}</td>
                                    <td>${statusBadge(m.itemStatus)}</td>
                                    <td>${m.itemStatus === 'booked' ? `<button class="btn btn-secondary btn-sm checkin-btn" data-id="${m.bookingItemId}">Check In</button>` : ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            body.querySelectorAll('.checkin-btn').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    try {
                        await Api.post(`/api/staff/booking-items/${btn.dataset.id}/check-in`);
                        showToast('Passenger checked in.', 'success');
                        openManifestModal(flightId, label);
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            });
        } catch (err) {
            document.getElementById('manifest-body').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    // ---------- Schedules tab ----------

    async function renderSchedulesTab() {
        content.innerHTML = renderTabs('schedules') + `
            <div class="flex-between mb-16">
                <div></div>
                <button class="btn btn-primary btn-sm" id="new-schedule-btn">+ New Schedule</button>
            </div>
            <div id="schedules-table" class="card"><div class="empty-hint">Loading...</div></div>
        `;
        wireTabButtons();
        document.getElementById('new-schedule-btn').addEventListener('click', openScheduleFormModal);

        try {
            const [{ schedules }] = await Promise.all([Api.get('/api/staff/schedules'), loadAircraftOptions()]);
            renderSchedulesTable(schedules);
        } catch (err) {
            document.getElementById('schedules-table').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    function renderSchedulesTable(schedules) {
        const el = document.getElementById('schedules-table');
        if (!schedules.length) {
            el.innerHTML = `<div class="empty-hint">No recurring schedules yet. Create one so flights generate automatically for any future date.</div>`;
            return;
        }
        el.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Flight</th><th>Route</th><th>Departs</th><th>Days</th><th>Aircraft</th><th>Generated Until</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${schedules.map((s) => `
                            <tr>
                                <td>${escapeHtml(s.flightNumber)}${s.isAutoGenerated ? ' <span class="badge badge-gray">Auto</span>' : ''}</td>
                                <td>${escapeHtml(s.originCode)} &#10142; ${escapeHtml(s.destinationCode)}</td>
                                <td>${escapeHtml(s.departureTimeOfDay.slice(0, 5))}</td>
                                <td>${s.daysOfWeek.slice().sort().map((d) => DAY_LABELS[d]).join(', ')}</td>
                                <td>${escapeHtml(s.aircraftTailNumber)}</td>
                                <td>${s.generatedUntil ? formatDate(s.generatedUntil) : '&mdash;'}</td>
                                <td>${statusBadge(s.status)}</td>
                                <td>
                                    <div class="flex gap-8">
                                        ${s.status === 'active'
                                            ? `<button class="btn btn-secondary btn-sm schedule-status-btn" data-id="${s.id}" data-status="paused">Pause</button>`
                                            : s.status === 'paused'
                                                ? `<button class="btn btn-secondary btn-sm schedule-status-btn" data-id="${s.id}" data-status="active">Resume</button>`
                                                : ''}
                                        ${s.status !== 'ended'
                                            ? `<button class="btn btn-danger btn-sm schedule-status-btn" data-id="${s.id}" data-status="ended">End</button>`
                                            : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        el.querySelectorAll('.schedule-status-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const newStatus = btn.dataset.status;
                if (newStatus === 'ended' && !window.confirm('End this schedule? It will stop generating new flights (already-generated flights are unaffected).')) return;
                try {
                    const result = await Api.put(`/api/staff/schedules/${btn.dataset.id}/status`, { status: newStatus });
                    showToast(newStatus === 'active' ? `Resumed — ${result.flightsCreated} flight(s) generated.` : 'Schedule updated.', 'success');
                    renderSchedulesTab();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });
    }

    function openScheduleFormModal() {
        openModal('New Recurring Schedule', `
            <form id="schedule-form">
                <div id="schedule-form-alert"></div>
                <div class="input-row">
                    <div class="field"><label>Flight number</label><input class="input" name="flightNumber" required maxlength="10" placeholder="FA100"></div>
                    <div class="field"><label>Aircraft</label>
                        <select class="input" name="aircraftId" required>
                            ${aircraftCache.map((a) => `<option value="${a.id}">${escapeHtml(a.tail_number)} (${escapeHtml(a.model)})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Origin code</label><input class="input" name="originCode" required maxlength="3" placeholder="TPA"></div>
                    <div class="field"><label>Destination code</label><input class="input" name="destinationCode" required maxlength="3" placeholder="COS"></div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Departure time (local, 24h)</label><input class="input" type="time" name="departureTimeOfDay" required></div>
                    <div class="field"><label>Arrival time (local, 24h)</label><input class="input" type="time" name="arrivalTimeOfDay" required></div>
                </div>
                <div class="field">
                    <label>Operates on</label>
                    <div class="flex gap-12" style="flex-wrap:wrap">
                        ${DAY_LABELS.map((label, i) => `
                            <label class="flex gap-8" style="align-items:center; font-weight:400">
                                <input type="checkbox" name="daysOfWeek" value="${i}" ${i >= 1 && i <= 5 ? 'checked' : ''}> ${label}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Economy price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceEconomy" required></div>
                    <div class="field"><label>Business price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceBusiness" required></div>
                    <div class="field"><label>First class price ($)</label><input class="input" type="number" step="0.01" min="0" name="basePriceFirst" value="0"></div>
                </div>
                <div class="input-row">
                    <div class="field"><label>Gate</label><input class="input" name="gate" maxlength="10"></div>
                    <div class="field"><label>Terminal</label><input class="input" name="terminal" maxlength="10"></div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Create Schedule</button>
            </form>
        `);

        document.getElementById('schedule-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const alertBox = document.getElementById('schedule-form-alert');
            try {
                const [depH, depM] = fd.get('departureTimeOfDay').split(':').map(Number);
                const [arrH, arrM] = fd.get('arrivalTimeOfDay').split(':').map(Number);
                let durationMinutes = (arrH * 60 + arrM) - (depH * 60 + depM);
                if (durationMinutes <= 0) durationMinutes += 24 * 60; // arrival is next day

                const daysOfWeek = fd.getAll('daysOfWeek').map(Number);
                if (!daysOfWeek.length) throw new Error('Select at least one operating day');

                const result = await Api.post('/api/staff/schedules', {
                    flightNumber: fd.get('flightNumber'),
                    aircraftId: Number(fd.get('aircraftId')),
                    originCode: fd.get('originCode'),
                    destinationCode: fd.get('destinationCode'),
                    departureTimeOfDay: fd.get('departureTimeOfDay'),
                    durationMinutes,
                    daysOfWeek,
                    basePriceEconomyCents: Math.round(Number(fd.get('basePriceEconomy')) * 100),
                    basePriceBusinessCents: Math.round(Number(fd.get('basePriceBusiness')) * 100),
                    basePriceFirstCents: Math.round(Number(fd.get('basePriceFirst') || 0) * 100),
                    gate: fd.get('gate'),
                    terminal: fd.get('terminal')
                });
                closeModal();
                showToast(`Schedule created — ${result.flightsCreated} flight(s) generated.`, 'success');
                renderSchedulesTab();
            } catch (err) {
                let msg = err.message;
                if (err.details && err.details.length) msg = err.details.map((d) => d.message).join(' ');
                alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
            }
        });
    }

    // ---------- Aircraft tab ----------

    async function renderAircraftTab() {
        content.innerHTML = renderTabs('aircraft') + `
            <div class="flex-between mb-16">
                <div></div>
                <button class="btn btn-primary btn-sm" id="new-aircraft-btn">+ New Aircraft</button>
            </div>
            <div id="aircraft-table" class="card"><div class="empty-hint">Loading...</div></div>
        `;
        wireTabButtons();
        document.getElementById('new-aircraft-btn').addEventListener('click', openAircraftFormModal);

        try {
            const { aircraft } = await Api.get('/api/staff/aircraft');
            aircraftCache = aircraft;
            renderAircraftTable(aircraft);
        } catch (err) {
            document.getElementById('aircraft-table').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    function renderAircraftTable(aircraft) {
        const el = document.getElementById('aircraft-table');
        el.innerHTML = `
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Tail #</th><th>Model</th><th>Seats</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${aircraft.map((a) => `
                            <tr>
                                <td>${escapeHtml(a.tail_number)}</td>
                                <td>${escapeHtml(a.model)}</td>
                                <td>${a.total_seats}</td>
                                <td>${statusBadge(a.status)}</td>
                                <td>
                                    <select class="input status-select select-inline" data-id="${a.id}">
                                        ${['active', 'maintenance', 'retired'].map((s) => `<option value="${s}" ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
                                    </select>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        el.querySelectorAll('.status-select').forEach((sel) => {
            sel.addEventListener('change', async () => {
                try {
                    await Api.put(`/api/staff/aircraft/${sel.dataset.id}/status`, { status: sel.value });
                    showToast('Aircraft status updated.', 'success');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });
    }

    function openAircraftFormModal() {
        openModal('New Aircraft', `
            <form id="aircraft-form">
                <div id="aircraft-form-alert"></div>
                <div class="input-row">
                    <div class="field"><label>Tail number</label><input class="input" name="tailNumber" required maxlength="20" placeholder="N123FA"></div>
                    <div class="field"><label>Model</label><input class="input" name="model" required maxlength="100" placeholder="A320"></div>
                </div>
                <div class="field"><label>Manufacturer</label><input class="input" name="manufacturer" maxlength="100" placeholder="Airbus"></div>
                <div class="input-row">
                    <div class="field"><label>Total rows</label><input class="input" type="number" name="rows" min="1" max="60" required placeholder="24"></div>
                    <div class="field"><label>Seat columns</label><input class="input" name="cols" required placeholder="A,B,C,D,E,F"></div>
                </div>
                <div class="field"><label>First class rows (start-end, 0-0 for none)</label>
                    <div class="input-row">
                        <input class="input" type="number" name="firstRowStart" min="0" value="0">
                        <input class="input" type="number" name="firstRowEnd" min="0" value="0">
                    </div>
                </div>
                <div class="field"><label>Business rows (start-end, 0-0 for none)</label>
                    <div class="input-row">
                        <input class="input" type="number" name="businessRowStart" min="0" value="1">
                        <input class="input" type="number" name="businessRowEnd" min="0" value="4">
                    </div>
                </div>
                <div class="field"><label>Economy rows (start-end)</label>
                    <div class="input-row">
                        <input class="input" type="number" name="economyRowStart" min="1" value="5">
                        <input class="input" type="number" name="economyRowEnd" min="1" value="24">
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Create Aircraft</button>
            </form>
        `);

        document.getElementById('aircraft-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const alertBox = document.getElementById('aircraft-form-alert');
            try {
                await Api.post('/api/staff/aircraft', {
                    tailNumber: fd.get('tailNumber'),
                    model: fd.get('model'),
                    manufacturer: fd.get('manufacturer'),
                    rows: Number(fd.get('rows')),
                    cols: fd.get('cols').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
                    firstRowStart: Number(fd.get('firstRowStart')),
                    firstRowEnd: Number(fd.get('firstRowEnd')),
                    businessRowStart: Number(fd.get('businessRowStart')),
                    businessRowEnd: Number(fd.get('businessRowEnd')),
                    economyRowStart: Number(fd.get('economyRowStart')),
                    economyRowEnd: Number(fd.get('economyRowEnd'))
                });
                closeModal();
                showToast('Aircraft created.', 'success');
                renderAircraftTab();
            } catch (err) {
                let msg = err.message;
                if (err.details && err.details.length) msg = err.details.map((d) => d.message).join(' ');
                alertBox.innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
            }
        });
    }

    function renderTab(tab) {
        if (tab === 'schedules') renderSchedulesTab();
        else if (tab === 'aircraft') renderAircraftTab();
        else renderFlightsTab();
    }

    function wireTabButtons() {
        content.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                window.location.hash = btn.dataset.tab === 'flights' ? '' : btn.dataset.tab;
                renderTab(btn.dataset.tab);
            });
        });
    }

    renderTab(currentTabFromHash());
});
