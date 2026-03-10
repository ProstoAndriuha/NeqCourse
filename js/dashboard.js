
'use strict';

document.addEventListener('DOMContentLoaded', function () {


    if (typeof NeqAuth === 'undefined' || !NeqAuth.requireLogin('login.html')) return;

    var session = NeqAuth.getSession();


    var greetEl = document.getElementById('dash-greeting');
    var emailEl = document.getElementById('dash-email');
    var roleEl  = document.getElementById('dash-role');

    if (greetEl) greetEl.innerHTML = '<i class="fas fa-tachometer-alt"></i> Bun venit, ' + escHtml(session.name) + '!';
    if (emailEl) emailEl.textContent = session.email;
    if (roleEl)  roleEl.textContent  = session.role === 'admin' ? 'Administrator' : 'Student';


    if (session.role === 'admin') {
        var banner = document.getElementById('dash-admin-banner');
        if (banner) banner.style.display = '';
    }


    var courses  = NeqAuth.getEnrolledCourses();
    var countEl  = document.getElementById('dash-course-count');
    var listEl   = document.getElementById('dash-course-list');

    if (countEl) countEl.textContent = courses.length;

    if (listEl) {
        if (courses.length === 0) {
            listEl.innerHTML =
                '<div class="dash-empty">' +
                    '<i class="fas fa-book-open"></i>' +
                    '<p>Nu ești înscris la niciun curs.</p>' +
                    '<a href="courses.html" class="btn btn-primary" style="margin-top:.75rem">' +
                        '<i class="fas fa-search"></i> Explorează cursurile disponibile' +
                    '</a>' +
                '</div>';
        } else {
            var html = '<div class="dash-course-items">';
            courses.forEach(function (c) {
                var date = new Date(c.enrolledAt).toLocaleDateString('ro-RO', {
                    day: '2-digit', month: 'long', year: 'numeric'
                });
                html +=
                    '<div class="dash-course-item">' +
                        '<i class="fas fa-graduation-cap dash-course-icon"></i>' +
                        '<div class="dash-course-info">' +
                            '<strong>' + escHtml(c.name) + '</strong>' +
                            '<small>Înscris pe ' + date + '</small>' +
                        '</div>' +
                        '<span class="badge badge-beginner">În progres</span>' +
                    '</div>';
            });
            html += '</div>';
            listEl.innerHTML = html;
        }
    }


    var profName  = document.getElementById('dash-profile-name');
    var profEmail = document.getElementById('dash-profile-email');
    var profRole  = document.getElementById('dash-profile-role');

    if (profName)  profName.textContent  = session.name;
    if (profEmail) profEmail.textContent = session.email;
    if (profRole)  profRole.textContent  = session.role === 'admin' ? 'Administrator' : 'Student';


    var logoutBtn = document.getElementById('dash-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            NeqAuth.logout();
            window.location.href = '../index.html';
        });
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

});
