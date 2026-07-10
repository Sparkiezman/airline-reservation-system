'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('search-form');
    const resultsAlert = document.getElementById('results-alert');
    const flightList = document.getElementById('flight-list');
    const dateInput = document.getElementById('date');
    const airportList = document.getElementById('airport-list');

    dateInput.min = new Date().toISOString().slice(0, 10);

    try {
        const { airports } = await Api.get('/api/flights/airports');
        airportList.innerHTML = airports
            .map((a) => `<option value="${escapeHtml(a.code)}">${escapeHtml(a.city)} (${escapeHtml(a.code)})</option>`)
            .join('');
    } catch { /* datalist is a nice-to-have; ignore failures */ }

    function renderFlights(flights, passengers) {
        if (!flights.length) {
            flightList.innerHTML = `<div class="card empty-state">No flights found for that route and date. Try another search.</div>`;
            return;
        }
        flightList.innerHTML = flights.map((f) => `
            <div class="card flight-row">
                <div class="flight-route">
                    <div class="flight-endpoint">
                        <div class="code">${escapeHtml(f.originCode)}</div>
                        <div class="city">${escapeHtml(f.originCity)}</div>
                    </div>
                    <div class="flight-arrow">&#10142;</div>
                    <div class="flight-endpoint">
                        <div class="code">${escapeHtml(f.destinationCode)}</div>
                        <div class="city">${escapeHtml(f.destinationCity)}</div>
                    </div>
                </div>
                <div class="flight-meta">
                    <div>${escapeHtml(f.flightNumber)} &middot; ${formatDate(f.departureTime)}</div>
                    <div>${formatTime(f.departureTime)} &ndash; ${formatTime(f.arrivalTime)}</div>
                    <div>${f.seatsAvailable ?? ''} seats available</div>
                </div>
                <div class="flight-price">
                    <div class="amount">${formatMoney(f.basePriceEconomy)}</div>
                    <div class="per">economy, per seat</div>
                </div>
                <a class="btn btn-primary" href="/seats.html?flightId=${f.id}&passengers=${passengers}">Select Seats</a>
            </div>
        `).join('');
    }

    async function runSearch(origin, destination, date, passengers) {
        resultsAlert.innerHTML = '';
        flightList.innerHTML = `<div class="empty-hint">Searching...</div>`;
        try {
            const params = new URLSearchParams({ origin, destination, date, passengers });
            const { flights } = await Api.get(`/api/flights/search?${params.toString()}`);
            renderFlights(flights, passengers);
        } catch (err) {
            flightList.innerHTML = '';
            resultsAlert.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const origin = document.getElementById('origin').value.trim().toUpperCase();
        const destination = document.getElementById('destination').value.trim().toUpperCase();
        const date = dateInput.value;
        const passengers = document.getElementById('passengers').value || 1;
        if (!origin || !destination || !date) return;
        runSearch(origin, destination, date, passengers);

        const url = new URL(window.location.href);
        url.searchParams.set('origin', origin);
        url.searchParams.set('destination', destination);
        url.searchParams.set('date', date);
        url.searchParams.set('passengers', passengers);
        window.history.replaceState({}, '', url);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('origin') && params.get('destination') && params.get('date')) {
        document.getElementById('origin').value = params.get('origin');
        document.getElementById('destination').value = params.get('destination');
        dateInput.value = params.get('date');
        document.getElementById('passengers').value = params.get('passengers') || 1;
        runSearch(params.get('origin'), params.get('destination'), params.get('date'), params.get('passengers') || 1);
    } else {
        flightList.innerHTML = `<div class="empty-hint">Search for a route to see available flights. Try TPA &rarr; COS.</div>`;
    }
});
