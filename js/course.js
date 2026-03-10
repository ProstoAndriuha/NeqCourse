
'use strict';

document.addEventListener('DOMContentLoaded', function () {

    ['cd1', 'cd2', 'cd3', 'cd4'].forEach(function (prefix) {
        const hEl = document.getElementById(prefix + '-h');
        const mEl = document.getElementById(prefix + '-m');
        const sEl = document.getElementById(prefix + '-s');
        if (!hEl || !mEl || !sEl) return;


        const initH = parseInt(hEl.textContent, 10) || 0;
        const initM = parseInt(mEl.textContent, 10) || 0;
        const initS = parseInt(sEl.textContent, 10) || 0;
        const initTotal = initH * 3600 + initM * 60 + initS;


        const storageKey = 'neq_countdown_' + prefix;
        const tsKey      = storageKey + '_ts';

        let remaining;
        const stored = sessionStorage.getItem(storageKey);
        if (stored !== null) {
            const elapsed = Math.floor((Date.now() - Number(sessionStorage.getItem(tsKey) || Date.now())) / 1000);
            remaining = Math.max(0, Number(stored) - elapsed);
        } else {
            remaining = initTotal;
        }
        sessionStorage.setItem(storageKey, remaining);
        sessionStorage.setItem(tsKey, Date.now());

        function render(secs) {
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            hEl.textContent = String(h).padStart(2, '0');
            mEl.textContent = String(m).padStart(2, '0');
            sEl.textContent = String(s).padStart(2, '0');
        }

        render(remaining);

        if (remaining <= 0) return; 

        const interval = setInterval(function () {
            remaining--;
            sessionStorage.setItem(storageKey, remaining);
            render(remaining);
            if (remaining <= 0) {
                clearInterval(interval);

                const countdownEl = hEl.closest('.countdown');
                const offerLabel  = countdownEl &&
                    countdownEl.previousElementSibling; 
                if (countdownEl)  countdownEl.style.opacity  = '0.4';
                if (offerLabel)   offerLabel.style.opacity   = '0.4';
            }
        }, 1000);
    });

 
    document.querySelectorAll('details.curriculum-item, details.module-details').forEach(function (det) {
        det.addEventListener('toggle', function () {
            if (det.open) {
                det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    });


    document.querySelectorAll('.faq-item details, details.faq-details').forEach(function (det) {
        det.addEventListener('toggle', function () {
            if (det.open) {
       
                const parent = det.closest('.faq-list, .faq-section, section');
                if (parent) {
                    parent.querySelectorAll('details').forEach(function (sibling) {
                        if (sibling !== det) sibling.open = false;
                    });
                }
            }
        });
    });

    var COURSE_MAP = {
        'course1.html': { id: 'course1', name: 'Dezvoltare Web Full-Stack' },
        'course2.html': { id: 'course2', name: 'Data Science \u0219i Machine Learning' },
        'course3.html': { id: 'course3', name: 'Design UI/UX pentru \xCenceptori' },
        'course4.html': { id: 'course4', name: 'Marketing Digital Avansat' }
    };

    var pageName   = window.location.pathname.replace(/\\/g, '/').split('/').pop() || '';
    var courseInfo = COURSE_MAP[pageName];

    document.querySelectorAll('a.btn-danger[href="register.html"]').forEach(function (btn) {

        if (typeof NeqAuth !== 'undefined' && NeqAuth.isLoggedIn() && courseInfo) {

            var enrolled = NeqAuth.getEnrolledCourses();
            var alreadyIn = enrolled.some(function (c) { return c.id === courseInfo.id; });

            if (alreadyIn) {
                markEnrolled(btn);
            } else {
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    NeqAuth.enrollCourse(courseInfo.id, courseInfo.name);
                    markEnrolled(btn);
                    showToast('\u2713 Te-ai \xEEnscris la cursul \u201e' + courseInfo.name +
                        '\u201d! <a href="dashboard.html">Dashboard \u2192</a>');
                });
            }
        } else if (typeof NeqAuth !== 'undefined' && !NeqAuth.isLoggedIn()) {

        }
    });

    function markEnrolled(btn) {
        btn.innerHTML = '<i class="fas fa-check"></i> \xCEnscris';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-success');
        btn.style.pointerEvents = 'none';
    }

    function showToast(html) {
        var old = document.querySelector('.enroll-toast');
        if (old) old.remove();
        var div = document.createElement('div');
        div.className = 'alert alert-success enroll-toast';
        div.innerHTML = '<i class="fas fa-check-circle"></i><div>' + html + '</div>';
        document.body.appendChild(div);
        setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
    }

});
