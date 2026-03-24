'use strict';

document.addEventListener('DOMContentLoaded', async function () {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get('slug');
    var titleEl = document.getElementById('course-title');
    var teacherEl = document.getElementById('course-teacher');
    var descriptionEl = document.getElementById('course-description');
    var priceEl = document.getElementById('course-price');
    var actionEl = document.getElementById('course-action');
    var modulesEl = document.getElementById('course-modules');
    var stateEl = document.getElementById('course-state');

    if (!slug || typeof NeqAuth === 'undefined') {
        if (stateEl) stateEl.textContent = 'Slug-ul cursului lipsește.';
        return;
    }

    try {
        var course = await NeqAuth.fetchCourseBySlug(slug);
        var access = null;
        var progressMap = {};

        if (NeqAuth.isLoggedIn()) {
            access = await NeqAuth.fetchCourseAccess(course.id).catch(function () { return { hasAccess: false }; });
            if (access.hasAccess) {
                var progress = await NeqAuth.fetchCourseProgress(course.id).catch(function () { return { items: [] }; });
                (progress.items || []).forEach(function (item) {
                    progressMap[item.lessonId] = item;
                });
            }
        }

        renderCourse(course, access, progressMap);
    } catch (error) {
        if (stateEl) stateEl.textContent = error.message || 'Nu am putut încărca cursul.';
    }

    function renderCourse(course, access, progressMap) {
        if (stateEl) stateEl.hidden = true;
        if (titleEl) titleEl.textContent = course.title;
        if (teacherEl) teacherEl.textContent = 'Profesor: ' + course.teacher.displayName;
        if (descriptionEl) descriptionEl.textContent = course.description || course.shortDescription || '';
        if (priceEl) priceEl.textContent = Number(course.priceAmount).toFixed(2) + ' ' + course.currency;

        renderAction(course, access);
        renderModules(course.modules || [], access, progressMap);
    }

    function renderAction(course, access) {
        if (!actionEl) return;
        actionEl.replaceChildren();

        if (!NeqAuth.isLoggedIn()) {
            var loginLink = document.createElement('a');
            loginLink.href = 'login.html';
            loginLink.className = 'btn btn-primary';
            loginLink.innerHTML = '<i class="fas fa-sign-in-alt"></i> Autentifică-te pentru acces';
            actionEl.appendChild(loginLink);
            return;
        }

        if (access && access.hasAccess) {
            var badge = document.createElement('span');
            badge.className = 'badge badge-beginner';
            badge.textContent = 'Ai acces – ' + access.accessType;
            actionEl.appendChild(badge);
            return;
        }

        var buyButton = document.createElement('button');
        buyButton.type = 'button';
        buyButton.className = 'btn btn-danger';
        buyButton.innerHTML = '<i class="fas fa-credit-card"></i> Cumpără și activează demo';
        buyButton.addEventListener('click', async function () {
            buyButton.disabled = true;
            buyButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se procesează';
            try {
                await NeqAuth.purchaseCourse(course.id);
                window.location.reload();
            } catch (error) {
                alert(error.message || 'Checkout eșuat.');
                buyButton.disabled = false;
                buyButton.innerHTML = '<i class="fas fa-credit-card"></i> Cumpără și activează demo';
            }
        });
        actionEl.appendChild(buyButton);
    }

    function renderModules(modules, access, progressMap) {
        if (!modulesEl) return;
        modulesEl.replaceChildren();

        modules.forEach(function (module) {
            var moduleCard = document.createElement('section');
            moduleCard.className = 'course-card';

            var heading = document.createElement('h3');
            heading.textContent = module.title;
            moduleCard.appendChild(heading);

            var lessonList = document.createElement('div');
            lessonList.className = 'dash-course-list';

            module.lessons.forEach(function (lesson) {
                lessonList.appendChild(createLessonCard(lesson, access, progressMap[lesson.id]));
            });

            moduleCard.appendChild(lessonList);
            modulesEl.appendChild(moduleCard);
        });
    }

    function createLessonCard(lesson, access, progress) {
        var card = document.createElement('article');
        card.className = 'dash-course-item';

        var info = document.createElement('div');
        info.className = 'dash-course-info';

        var title = document.createElement('strong');
        title.textContent = lesson.title;
        var meta = document.createElement('small');
        var status = progress ? progress.status : (lesson.isPreview ? 'preview' : 'locked');
        var percent = progress ? progress.progressPercent : 0;
        meta.textContent = 'Status: ' + status + (percent ? ' – ' + percent + '%' : '');
        info.appendChild(title);
        info.appendChild(meta);

        var actions = document.createElement('div');
        actions.className = 'btn-group';

        if (access && access.hasAccess) {
            actions.appendChild(buildProgressButton(lesson.id, '50%', {
                status: 'in_progress',
                progressPercent: 50,
                watchPercent: 50,
                lastPositionSeconds: 600,
                isCompleted: false
            }));
            actions.appendChild(buildProgressButton(lesson.id, 'Completeaza', {
                status: 'completed',
                progressPercent: 100,
                watchPercent: 100,
                lastPositionSeconds: 1200,
                isCompleted: true
            }));
        } else {
            var badge = document.createElement('span');
            badge.className = 'badge badge-intermediate';
            badge.textContent = lesson.isPreview ? 'Preview' : 'Blocat';
            actions.appendChild(badge);
        }

        card.appendChild(info);
        card.appendChild(actions);
        return card;
    }

    function buildProgressButton(lessonId, label, payload) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline btn-compact';
        button.textContent = label;
        button.addEventListener('click', async function () {
            button.disabled = true;
            try {
                await NeqAuth.updateLessonProgress(lessonId, payload);
                window.location.reload();
            } catch (error) {
                alert(error.message || 'Nu am putut salva progresul.');
                button.disabled = false;
            }
        });
        return button;
    }
});
