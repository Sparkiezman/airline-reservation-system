'use strict';

/**
 * Attaches a custom suggestion dropdown to a text input: type 2+ characters,
 * get up to 20 matching airports (code, city, or name) back from the API,
 * pick one with mouse or arrow keys + Enter. Used on both the homepage hero
 * search and the full search page so origin/destination never require
 * typing an exact code.
 */
function attachAirportAutocomplete(input) {
    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const list = document.createElement('ul');
    list.className = 'autocomplete-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrapper.appendChild(list);

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');

    let items = [];
    let activeIndex = -1;
    let debounceTimer;

    function closeList() {
        list.hidden = true;
        list.innerHTML = '';
        items = [];
        activeIndex = -1;
        input.setAttribute('aria-expanded', 'false');
    }

    function updateActive(newIndex) {
        const options = list.querySelectorAll('.autocomplete-item');
        options.forEach((el) => el.classList.remove('active'));
        activeIndex = newIndex;
        if (newIndex >= 0 && options[newIndex]) {
            options[newIndex].classList.add('active');
            options[newIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function selectItem(index) {
        const airport = items[index];
        if (!airport) return;
        input.value = airport.code;
        closeList();
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
    }

    function renderList(airports) {
        items = airports;
        if (!airports.length) { closeList(); return; }
        list.innerHTML = airports.map((a, i) => `
            <li role="option" class="autocomplete-item" data-index="${i}">
                <span class="autocomplete-city">${escapeHtml(a.city)}, ${escapeHtml(a.country)}</span>
                <span class="autocomplete-code">${escapeHtml(a.code)}</span>
            </li>
        `).join('');
        list.hidden = false;
        activeIndex = -1;
        input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = input.value.trim();
        if (term.length < 2) { closeList(); return; }
        debounceTimer = setTimeout(async () => {
            try {
                const { airports } = await Api.get(`/api/flights/airports?q=${encodeURIComponent(term)}`);
                renderList(airports);
            } catch { closeList(); }
        }, 200);
    });

    input.addEventListener('keydown', (e) => {
        if (list.hidden) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            updateActive(Math.min(activeIndex + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            updateActive(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                selectItem(activeIndex);
            }
        } else if (e.key === 'Escape') {
            closeList();
        }
    });

    list.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        e.preventDefault(); // keep focus in the input so blur doesn't close the list first
        selectItem(Number(item.dataset.index));
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) closeList();
    });
}
