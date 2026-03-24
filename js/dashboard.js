'use strict';

document.addEventListener('DOMContentLoaded', async function () {
    if (typeof NeqAuth === 'undefined' || !NeqAuth.requireLogin('login.html')) return;

    var greetingText = document.getElementById('dash-greeting-text');
    var emailEl = document.getElementById('dash-email');
    var roleEl = document.getElementById('dash-role');
    var courseCountEl = document.getElementById('dash-course-count');
    var completedCountEl = document.getElementById('dash-completed-count');
    var emptyState = document.getElementById('dash-empty-state');
    var itemsEl = document.getElementById('dash-course-items');
    var template = document.getElementById('dash-course-item-template');
    var profileName = document.getElementById('dash-profile-name');
    var profileEmail = document.getElementById('dash-profile-email');
    var profileRole = document.getElementById('dash-profile-role');

    try {
        var user = await NeqAuth.getCurrentUser();
        var enrollments = await NeqAuth.fetchMyEnrollments();
        var items = enrollments.items || [];
        var completedItems = items.filter(function (item) {
            return item.progressPercent >= 100;
        });

        if (greetingText) greetingText.textContent = 'Bun venit, ' + [user.firstName, user.lastName].filter(Boolean).join(' ') + '!';
        if (emailEl) emailEl.textContent = user.email;
        if (roleEl) roleEl.textContent = humanizeRole(user.role);
        if (profileName) profileName.textContent = [user.firstName, user.lastName].filter(Boolean).join(' ');
        if (profileEmail) profileEmail.textContent = user.email;
        if (profileRole) profileRole.textContent = humanizeRole(user.role);
        if (courseCountEl) courseCountEl.textContent = String(items.length);
        if (completedCountEl) completedCountEl.textContent = String(completedItems.length);

        if (user.role === 'admin' || user.role === 'manager') {
            var banner = document.getElementById('dash-admin-banner');
            if (banner) banner.style.display = '';
        }

        if (itemsEl) {
            itemsEl.replaceChildren();
            if (!items.length) {
                if (emptyState) emptyState.hidden = false;
                itemsEl.hidden = true;
            } else {
                if (emptyState) emptyState.hidden = true;
                itemsEl.hidden = false;
                items.forEach(function (item) {
                    itemsEl.appendChild(createCourseItem(item));
                });
            }
        }
    } catch (error) {
        if (greetingText) greetingText.textContent = 'Dashboard indisponibil';
        if (emailEl) emailEl.textContent = error.message || 'Nu am putut încărca datele.';
    }

    var logoutBtn = document.getElementById('dash-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function () {
            await NeqAuth.logout();
            window.location.href = '/index.html';
        });
    }

    function createCourseItem(course) {
        var fragment = template && template.content
            ? template.content.firstElementChild.cloneNode(true)
            : buildCourseItemFallback();
        var date = course.lastActivityAt ? new Date(course.lastActivityAt).toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        }) : 'fără activitate recentă';

        fragment.querySelector('[data-dash-course-name]').textContent = course.title;
        fragment.querySelector('[data-dash-course-date]').textContent = 'Progres ' + course.progressPercent + '% – activitate ' + date;

        var badge = fragment.querySelector('.badge');
        if (badge) {
            badge.textContent = course.progressPercent >= 100 ? 'Finalizat' : 'În progres';
        }

        var info = fragment.querySelector('.dash-course-info');
        if (info) {
            var link = document.createElement('a');
            link.href = 'course.html?slug=' + encodeURIComponent(course.slug);
            link.className = 'btn btn-outline btn-compact';
            link.innerHTML = '<i class="fas fa-play"></i> Continuă';
            info.appendChild(link);
        }

        return fragment;
    }

    function buildCourseItemFallback() {
        var item = document.createElement('div');
        item.className = 'dash-course-item';

        var icon = document.createElement('i');
        icon.className = 'fas fa-graduation-cap dash-course-icon';
        icon.setAttribute('aria-hidden', 'true');

        var info = document.createElement('div');
        info.className = 'dash-course-info';

        var name = document.createElement('strong');
        name.setAttribute('data-dash-course-name', '');

        var date = document.createElement('small');
        date.setAttribute('data-dash-course-date', '');

        var badge = document.createElement('span');
        badge.className = 'badge badge-beginner';
        badge.textContent = 'In progres';

        info.appendChild(name);
        info.appendChild(date);
        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(badge);

        return item;
    }

    function humanizeRole(role) {
        if (role === 'admin') return 'Administrator';
        if (role === 'manager') return 'Manager';
        if (role === 'teacher') return 'Profesor';
        return 'Student';
    }
});
