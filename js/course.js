'use strict';

document.addEventListener('DOMContentLoaded', function () {
    var redirects = {
        'course1.html': 'course.html?slug=postgresql-for-backend-developers',
        'course2.html': 'courses.html',
        'course3.html': 'courses.html',
        'course4.html': 'courses.html'
    };

    var pageName = window.location.pathname.replace(/\\/g, '/').split('/').pop() || '';
    var target = redirects[pageName];
    if (!target) {
        return;
    }

    window.location.replace(target);
});
