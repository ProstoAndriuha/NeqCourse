// NeqCourse — Shared site functionality
'use strict';

document.addEventListener('DOMContentLoaded', function () {


    var header = document.querySelector('header');
    var nav    = header && header.querySelector('nav');

    if (header && nav) {
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'nav-toggle';
        toggleBtn.setAttribute('aria-label', 'Deschide meniu');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
        header.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', function () {
            var isOpen = nav.classList.toggle('nav-open');
            toggleBtn.setAttribute('aria-expanded', String(isOpen));
            toggleBtn.innerHTML = isOpen
                ? '<i class="fas fa-times"></i>'
                : '<i class="fas fa-bars"></i>';
        });

        nav.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                nav.classList.remove('nav-open');
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
            });
        });
    }


    if (typeof NeqAuth === 'undefined') return;

    var session = NeqAuth.getSession();
    var navUl   = document.querySelector('header nav ul');
    if (!navUl) return;


    var inPages  = window.location.pathname.replace(/\\/g, '/').indexOf('/pages/') !== -1;
    var pageBase = inPages ? '' : 'pages/';
    var rootBase = inPages ? '../' : '';
    var path     = window.location.pathname.replace(/\\/g, '/');

    if (session) {
        // Hide guest-only links
        Array.prototype.forEach.call(navUl.querySelectorAll('li'), function (li) {
            var a    = li.querySelector('a');
            if (!a) return;
            var href = a.getAttribute('href') || '';
            if (href.indexOf('login.html') !== -1 || href.indexOf('register.html') !== -1) {
                li.style.display = 'none';
            }
        });


        var dashHref    = pageBase + 'dashboard.html';
        var dashActive  = path.endsWith('/dashboard.html') ? ' class="active"' : '';
        var dashLi      = document.createElement('li');
        dashLi.innerHTML = '<a href="' + dashHref + '"' + dashActive + '>' +
            '<i class="fas fa-tachometer-alt"></i> ' + escHtml(session.name) + '</a>';
        navUl.appendChild(dashLi);


        if (session.role === 'admin') {
            var adminHref   = pageBase + 'admin.html';
            var adminActive = path.endsWith('/admin.html') ? ' class="active"' : '';
            var adminLi     = document.createElement('li');
            adminLi.innerHTML = '<a href="' + adminHref + '"' + adminActive + '>' +
                '<i class="fas fa-shield-alt"></i> Admin</a>';
            navUl.appendChild(adminLi);
        }


        var logoutLi = document.createElement('li');
        logoutLi.innerHTML = '<a href="#" class="nav-logout-link">' +
            '<i class="fas fa-sign-out-alt"></i> Deconectare</a>';
        navUl.appendChild(logoutLi);
        logoutLi.querySelector('a').addEventListener('click', function (e) {
            e.preventDefault();
            NeqAuth.logout();
            window.location.href = rootBase + 'index.html';
        });
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

});
