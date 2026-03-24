'use strict';

document.addEventListener('DOMContentLoaded', function () {
    var searchInput = document.getElementById('search');
    var categorySel = document.getElementById('category');
    var levelSel = document.getElementById('level');
    var filterForm = document.getElementById('catalog-filter-form');
    var noResults = document.getElementById('catalog-no-results');
    var listEl = document.getElementById('catalog-list');
    var stateEl = document.getElementById('catalog-state');

    if (!listEl || typeof NeqAuth === 'undefined') {
        return;
    }

    [searchInput, categorySel, levelSel].forEach(function (element) {
        if (element) {
            element.addEventListener('input', debounce(loadCourses, 250));
        }
    });

    if (filterForm) {
        filterForm.addEventListener('submit', function (event) {
            event.preventDefault();
            loadCourses();
        });
    }

    loadCourses();

    async function loadCourses() {
        setState('Se încărcă lista cursurilor...');
        noResults.hidden = true;

        try {
            var response = await NeqAuth.fetchCourses({
                search: searchInput && searchInput.value ? searchInput.value.trim() : '',
                category: categorySel && categorySel.value ? categorySel.value : '',
                level: levelSel && levelSel.value ? levelSel.value : ''
            });

            renderCourses(response.items || []);
        } catch (error) {
            setState(error.message || 'Nu am putut încărca cursurile.');
        }
    }

    function renderCourses(courses) {
        listEl.replaceChildren();
        if (!courses.length) {
            setState('Nu există cursuri pentru filtrele selectate.');
            noResults.hidden = false;
            return;
        }

        if (stateEl) {
            stateEl.hidden = true;
            stateEl.textContent = '';
        }

        courses.forEach(function (course) {
            listEl.appendChild(createCourseCard(course));
        });
    }

    function createCourseCard(course) {
        var article = document.createElement('article');
        article.className = 'course-card';

        var title = document.createElement('h3');
        var titleLink = document.createElement('a');
        titleLink.href = 'course.html?slug=' + encodeURIComponent(course.slug);
        titleLink.textContent = course.title;
        title.appendChild(titleLink);

        var meta = document.createElement('div');
        meta.className = 'course-meta';
        meta.innerHTML = '' +
            '<span><i class="fas fa-user-tie"></i> ' + escapeHtml(course.teacher.displayName) + '</span>' +
            '<span><i class="fas fa-sack-dollar"></i> ' + Number(course.priceAmount).toFixed(2) + ' ' + escapeHtml(course.currency) + '</span>';

        var description = document.createElement('p');
        description.textContent = 'Curs disponibil în catalogul live. Deschide pagina cursului pentru checkout, acces și progres.';

        var actions = document.createElement('div');
        actions.className = 'btn-group';

        var detailsLink = document.createElement('a');
        detailsLink.href = titleLink.href;
        detailsLink.className = 'btn btn-primary';
        detailsLink.innerHTML = '<i class="fas fa-arrow-right"></i> Vezi cursul';
        actions.appendChild(detailsLink);

        if (NeqAuth.isLoggedIn()) {
            var buyButton = document.createElement('button');
            buyButton.type = 'button';
            buyButton.className = 'btn btn-outline';
            buyButton.innerHTML = '<i class="fas fa-cart-plus"></i> Cumpără demo';
            buyButton.addEventListener('click', async function () {
                buyButton.disabled = true;
                buyButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se procesează';
                try {
                    await NeqAuth.purchaseCourse(course.id);
                    window.location.href = 'course.html?slug=' + encodeURIComponent(course.slug);
                } catch (error) {
                    alert(error.message || 'Checkout eșuat.');
                    buyButton.disabled = false;
                    buyButton.innerHTML = '<i class="fas fa-cart-plus"></i> Cumpără demo';
                }
            });
            actions.appendChild(buyButton);
        }

        article.appendChild(title);
        article.appendChild(meta);
        article.appendChild(description);
        article.appendChild(actions);
        return article;
    }

    function setState(message) {
        if (!stateEl) {
            return;
        }

        stateEl.hidden = false;
        stateEl.textContent = message;
        listEl.replaceChildren();
    }

    function debounce(fn, wait) {
        var timeout = 0;
        return function () {
            clearTimeout(timeout);
            timeout = setTimeout(fn, wait);
        };
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
