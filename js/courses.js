// NeqCourse — Courses catalog live filtering
'use strict';

document.addEventListener('DOMContentLoaded', function () {

    const searchInput  = document.getElementById('search');
    const categorySel  = document.getElementById('category');
    const levelSel     = document.getElementById('level');
    const filterForm   = document.querySelector('form[action="#"]');
    const noResults    = createNoResultsMsg();

    // Level value → badge class fragment
    const LEVEL_CLASS = {
        beginner:     'badge-beginner',
        intermediate: 'badge-intermediate',
        advanced:     'badge-advanced'
    };

    // Wire up live events
    [searchInput, categorySel, levelSel].forEach(function (el) {
        if (el) el.addEventListener('input', applyFilter);
    });

    // Intercept form submit to prevent page reload
    if (filterForm) {
        filterForm.addEventListener('submit', function (e) {
            e.preventDefault();
            applyFilter();
        });
    }

    // Reset button clears and resets filter
    const resetBtn = filterForm && filterForm.querySelector('[type="reset"]');
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            setTimeout(applyFilter, 0); // run after native reset
        });
    }

    // ---- Main filter function ----
    function applyFilter() {
        const query  = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const catVal = categorySel ? categorySel.value : '';
        const lvlVal = levelSel    ? levelSel.value    : '';

        let totalVisible = 0;
        const sections = document.querySelectorAll('.catalog-section');

        sections.forEach(function (section) {
            const sectionCat = section.dataset.category || '';
            let sectionVisible = 0;

            section.querySelectorAll('.course-card').forEach(function (card) {
                const title  = (card.querySelector('h3')  || {}).textContent || '';
                const desc   = (card.querySelector('p')   || {}).textContent || '';
                const badge  = card.querySelector('.badge');
                const badgeCls = badge ? badge.className : '';

                const matchText  = !query  || (title + ' ' + desc).toLowerCase().includes(query);
                const matchCat   = !catVal || sectionCat === catVal;
                const matchLevel = !lvlVal || badgeCls.includes(LEVEL_CLASS[lvlVal] || '');

                const visible = matchText && matchCat && matchLevel;
                card.style.display = visible ? '' : 'none';
                if (visible) sectionVisible++;
            });

            section.style.display = sectionVisible > 0 ? '' : 'none';
            totalVisible += sectionVisible;
        });

        // Show/hide no-results message
        const container = document.querySelector('.catalog-section') &&
                          document.querySelector('.catalog-section').parentElement;
        if (container) {
            if (totalVisible === 0) {
                container.appendChild(noResults);
                noResults.style.display = '';
            } else {
                noResults.style.display = 'none';
            }
        }
    }

    function createNoResultsMsg() {
        const div = document.createElement('div');
        div.className = 'catalog-no-results';
        div.innerHTML =
            '<i class="fas fa-search"></i>' +
            '<p>Niciun curs nu corespunde criteriilor selectate.</p>' +
            '<p><small>Încearcă să modifici cuvintele cheie sau filtrele.</small></p>';
        div.style.display = 'none';
        return div;
    }

});
