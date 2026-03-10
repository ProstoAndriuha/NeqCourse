'use strict';

document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.gsap === 'undefined') return;

    var body = document.body;
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isCompactViewport = window.matchMedia('(max-width: 991px)').matches;
    var hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    var gsap = window.gsap;
    var hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined';

    body.classList.add('is-gsap-ready');

    if (hasScrollTrigger) {
        gsap.registerPlugin(window.ScrollTrigger);
    }

    if (prefersReducedMotion) {
        gsap.set('header, main > *, .course-card, .feature-card, .dash-stat-card, .admin-stat-card', {
            clearProps: 'all'
        });
        return;
    }

    animateHeader();
    animatePageIntro();
    animateScrollBlocks();

    if (hasFinePointer && !isCompactViewport) {
        attachHeroParallax();
    }

    if (!isCompactViewport) {
        attachFloatingMotion();
    }

    function animateHeader() {
        gsap.from('header', {
            y: -18,
            opacity: 0,
            duration: 0.8,
            ease: 'power2.out'
        });

        gsap.from('header nav li', {
            y: -10,
            opacity: 0,
            duration: 0.55,
            ease: 'power2.out',
            stagger: 0.06,
            delay: 0.18
        });
    }

    function animatePageIntro() {
        if (body.querySelector('.landing-page')) {
            gsap.set('.landing-kicker', { autoAlpha: 0, y: 20 });
            gsap.set('.landing-hero h2', { autoAlpha: 0, y: 36 });
            gsap.set('.landing-hero > p', { autoAlpha: 0, y: 20 });
            gsap.set('.hero-stats span', { autoAlpha: 0, y: 18 });
            gsap.set('.landing-hero .btn-group .btn', { autoAlpha: 0, y: 18 });
            gsap.set('.landing-proof-card', { autoAlpha: 0, y: 24 });
            var landingIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            landingIntro
                .to('.landing-kicker', { autoAlpha: 1, y: 0, duration: 0.45 })
                .to('.landing-hero h2', { autoAlpha: 1, y: 0, duration: 0.68 }, '-=0.15')
                .to('.landing-hero > p', { autoAlpha: 1, y: 0, duration: 0.45 }, '-=0.35')
                .to('.hero-stats span', { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08 }, '-=0.18')
                .to('.landing-hero .btn-group .btn', { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.08 }, '-=0.2')
                .to('.landing-proof-card', { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.1 }, '-=0.2');
        }

        if (body.querySelector('.catalog-page')) {
            var catalogIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            catalogIntro
                .from('.catalog-hero-copy > *', { y: 26, opacity: 0, duration: 0.5, stagger: 0.08 })
                .from('.catalog-hero-stats > div', { y: 26, opacity: 0, duration: 0.42, stagger: 0.08 }, '-=0.2')
                .from('.catalog-filter-card', { y: 26, opacity: 0, duration: 0.5 }, '-=0.2');
        }

        if (body.querySelector('.auth-page')) {
            var authIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            authIntro
                .from('.auth-hero', { x: -28, opacity: 0, duration: 0.7 })
                .from('.auth-card', { y: 28, opacity: 0, duration: 0.55 }, '-=0.4')
                .from('.auth-sidebar > *', { y: 24, opacity: 0, duration: 0.42, stagger: 0.1 }, '-=0.35')
                .from('.auth-form .input-icon-wrap, .auth-form .btn-group, .auth-inline-row, .auth-device-select', {
                    y: 16,
                    opacity: 0,
                    duration: 0.36,
                    stagger: 0.05
                }, '-=0.25');
        }

        if (body.querySelector('.register-page')) {
            var registerIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            registerIntro
                .from('.register-hero', { x: -28, opacity: 0, duration: 0.7 })
                .from('.register-card', { y: 28, opacity: 0, duration: 0.55 }, '-=0.4')
                .from('.register-optional-shell', { y: 28, opacity: 0, duration: 0.45 }, '-=0.28');
        }

        if (body.querySelector('.course-page')) {
            var courseIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            courseIntro
                .from('.course-header', { y: 30, opacity: 0, duration: 0.68 })
                .from('.course-sidebar', { x: 24, opacity: 0, duration: 0.5 }, '-=0.42')
                .from('.course-header .btn', { y: 18, opacity: 0, duration: 0.38, stagger: 0.08 }, '-=0.26');
        }

        if (body.querySelector('.dashboard-page')) {
            var dashboardIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            dashboardIntro
                .from('.dashboard-hero', { y: 26, opacity: 0, duration: 0.65 })
                .from('.dash-admin-banner', { y: 18, opacity: 0, duration: 0.36 }, '-=0.35')
                .from('.dash-stat-card', { y: 24, opacity: 0, duration: 0.4, stagger: 0.08 }, '-=0.28');
        }

        if (body.querySelector('.admin-page')) {
            var adminIntro = gsap.timeline({ defaults: { ease: 'power3.out' } });
            adminIntro
                .from('.admin-hero', { y: 26, opacity: 0, duration: 0.65 })
                .from('.admin-demo-notice', { y: 18, opacity: 0, duration: 0.36 }, '-=0.35')
                .from('.admin-stat-card', { y: 24, opacity: 0, duration: 0.4, stagger: 0.08 }, '-=0.28');
        }
    }

    function animateScrollBlocks() {
        if (!hasScrollTrigger) return;

        revealOnScroll('.landing-surface', { y: 28, stagger: 0.1 });
        revealOnScroll('.feature-card', { y: 18, stagger: 0.06 });
        revealOnScroll('.course-card', { y: 18, stagger: 0.06 });
        revealOnScroll('.catalog-section', { y: 24, stagger: 0.08 });
        revealOnScroll('.course-article > section', { y: 20, stagger: 0.06 });
        revealOnScroll('.course-sidebar > *', { x: 16, stagger: 0.06, start: 'top 88%' });
        revealOnScroll('.dash-course-item, .dash-profile-item', { y: 18, stagger: 0.05 });
        revealOnScroll('.admin-table-wrap, .admin-page section table, .admin-page section > .section-heading-row', { y: 18, stagger: 0.06 });
    }

    function revealOnScroll(selector, options) {
        var items = gsap.utils.toArray(selector);
        if (!items.length) return;

        gsap.fromTo(items, {
            y: options.y || 24,
            x: options.x || 0,
            opacity: 0
        }, {
            y: 0,
            x: 0,
            opacity: 1,
            duration: 0.55,
            ease: 'power2.out',
            stagger: options.stagger || 0.06,
            immediateRender: false,
            overwrite: 'auto',
            scrollTrigger: {
                trigger: options.trigger || items[0],
                start: options.start || 'top 88%',
                once: true
            }
        });
    }

    function attachHeroParallax() {
        var hero = document.querySelector('.landing-hero, .auth-hero, .register-hero, .dashboard-hero, .admin-hero, .course-header');
        if (!hero) return;

        hero.addEventListener('pointermove', function (event) {
            var rect = hero.getBoundingClientRect();
            var xPercent = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
            var yPercent = ((event.clientY - rect.top) / rect.height - 0.5) * 8;

            gsap.to(hero, {
                rotateX: -yPercent,
                rotateY: xPercent,
                transformPerspective: 900,
                transformOrigin: 'center',
                duration: 0.45,
                ease: 'power2.out'
            });
        });

        hero.addEventListener('pointerleave', function () {
            gsap.to(hero, {
                rotateX: 0,
                rotateY: 0,
                duration: 0.5,
                ease: 'power2.out'
            });
        });
    }

    function attachFloatingMotion() {
        floatItems('.hero-stats span, .auth-hero-points span, .catalog-hero-stats > div', 4);
    }

    function floatItems(selector, distance) {
        var items = gsap.utils.toArray(selector);
        items.forEach(function (item, index) {
            gsap.to(item, {
                y: -distance,
                duration: 3.4 + index * 0.12,
                repeat: -1,
                yoyo: true,
                ease: 'sine.inOut',
                delay: index * 0.06
            });
        });
    }
});