'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('hero-search-form');
    if (!form) return;

    const dateInput = document.getElementById('hero-date');
    dateInput.min = new Date().toISOString().slice(0, 10);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const origin = document.getElementById('hero-origin').value.trim();
        const destination = document.getElementById('hero-destination').value.trim();
        const date = dateInput.value;
        const passengers = document.getElementById('hero-passengers').value || 1;
        if (!origin || !destination || !date) return;

        const params = new URLSearchParams({ origin, destination, date, passengers });
        window.location.href = `/search.html?${params.toString()}`;
    });
});
