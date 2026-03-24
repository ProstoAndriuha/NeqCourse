// NeqCourse - Shared site functionality
'use strict';

document.addEventListener('DOMContentLoaded', function () {
    var header = document.querySelector('header');
    var nav = header && header.querySelector('nav');
    var navUl = nav && nav.querySelector('ul');

    if (header && nav) {
        var toggleBtn = header.querySelector('.nav-toggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'nav-toggle';
            toggleBtn.setAttribute('aria-label', 'Deschide meniu');
            toggleBtn.setAttribute('aria-expanded', 'false');
            header.appendChild(toggleBtn);
        }

        toggleBtn.hidden = false;
        setNavToggleIcon(toggleBtn, false);

        toggleBtn.addEventListener('click', function () {
            var isOpen = nav.classList.toggle('nav-open');
            toggleBtn.setAttribute('aria-expanded', String(isOpen));
            setNavToggleIcon(toggleBtn, isOpen);
        });

        nav.addEventListener('click', function (event) {
            if (!event.target.closest('a')) return;

            nav.classList.remove('nav-open');
            toggleBtn.setAttribute('aria-expanded', 'false');
            setNavToggleIcon(toggleBtn, false);
        });
    }

    if (typeof NeqAuth === 'undefined' || !navUl) return;

    var session = NeqAuth.getSession();
    if (!session) return;

    var inPages = window.location.pathname.replace(/\\/g, '/').indexOf('/pages/') !== -1;
    var pageBase = inPages ? '' : 'pages/';
    var rootBase = inPages ? '../' : '';
    var path = window.location.pathname.replace(/\\/g, '/');

    Array.prototype.forEach.call(navUl.querySelectorAll('li'), function (li) {
        var link = li.querySelector('a');
        if (!link) return;

        var href = link.getAttribute('href') || '';
        if (href.indexOf('login.html') !== -1 || href.indexOf('register.html') !== -1) {
            li.style.display = 'none';
        }
    });

    navUl.appendChild(createNavItem({
        href: pageBase + 'dashboard.html',
        iconClass: 'fa-tachometer-alt',
        text: session.name,
        isActive: path.endsWith('/dashboard.html')
    }));

    if (session.role === 'admin' || session.role === 'manager') {
        navUl.appendChild(createNavItem({
            href: pageBase + 'admin.html',
            iconClass: 'fa-shield-alt',
            text: 'Admin',
            isActive: path.endsWith('/admin.html')
        }));
    }

    var logoutItem = createNavItem({
        href: '#',
        iconClass: 'fa-sign-out-alt',
        text: 'Deconectare',
        linkClass: 'nav-logout-link'
    });

    var logoutLink = logoutItem.querySelector('a');
    logoutLink.addEventListener('click', async function (event) {
        event.preventDefault();
        await NeqAuth.logout();
        window.location.href = rootBase + 'index.html';
    });
    navUl.appendChild(logoutItem);

    function createNavItem(options) {
        var li = document.createElement('li');
        var link = document.createElement('a');
        var icon = document.createElement('i');
        var text = document.createTextNode(' ' + options.text);

        link.href = options.href;
        if (options.isActive) link.classList.add('active');
        if (options.linkClass) link.classList.add(options.linkClass);

        icon.classList.add('fas', options.iconClass);
        icon.setAttribute('aria-hidden', 'true');

        link.appendChild(icon);
        link.appendChild(text);
        li.appendChild(link);

        return li;
    }

    function setNavToggleIcon(button, isOpen) {
        var icon = button.querySelector('i');
        if (!icon) {
            icon = document.createElement('i');
            icon.classList.add('fas');
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
        }

        icon.classList.remove('fa-bars', 'fa-times');
        icon.classList.add(isOpen ? 'fa-times' : 'fa-bars');
    }
});
