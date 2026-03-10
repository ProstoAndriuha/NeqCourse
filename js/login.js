
'use strict';

document.addEventListener('DOMContentLoaded', function () {

    if (typeof NeqAuth !== 'undefined' && NeqAuth.isLoggedIn()) {
        window.location.href = NeqAuth.isAdmin() ? 'admin.html' : 'dashboard.html';
        return;
    }

    addPasswordToggle(document.getElementById('password'));


    var hint = document.createElement('div');
    hint.className = 'alert alert-info auth-demo-hint';
    hint.innerHTML = '<i class="fas fa-info-circle"></i><div>' +
        '<strong>Demo:</strong> ' +
        '<code>admin@neqcourse.com</code> / <code>Admin@2026</code>' +
        '</div>';
    var legend = document.querySelector('fieldset legend');
    if (legend) legend.after(hint);


    var form = document.querySelector('.auth-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        removeNotice();

        var emailEl    = document.getElementById('email');
        var passwordEl = document.getElementById('password');
        var emailVal   = emailEl ? emailEl.value.trim() : '';
        var passVal    = passwordEl ? passwordEl.value : '';

        if (!emailVal) {
            showAlert('danger', 'Introduceți email-ul sau numele de utilizator.');
            if (emailEl) emailEl.focus();
            return;
        }

        if (!passVal) {
            showAlert('danger', 'Introduceți parola.');
            if (passwordEl) passwordEl.focus();
            return;
        }

        if (typeof NeqAuth !== 'undefined') {
            var result = NeqAuth.login(emailVal, passVal);
            if (!result.ok) {
                showAlert('danger', result.error);
                return;
            }
            showAlert('success', 'Autentificare reușită! Redirecționare…');
            setTimeout(function () {
                window.location.href = result.session.role === 'admin'
                    ? 'admin.html'
                    : 'dashboard.html';
            }, 900);
        }
    });

    // ---- Helpers ----

    function addPasswordToggle(input) {
        if (!input) return;
        const wrap = input.closest('.input-icon-wrap');
        if (!wrap) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pw-eye';
        btn.setAttribute('aria-label', 'Arată parola');
        btn.innerHTML = '<i class="fas fa-eye"></i>';
        wrap.appendChild(btn);
        btn.addEventListener('click', function () {
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.innerHTML = show
                ? '<i class="fas fa-eye-slash"></i>'
                : '<i class="fas fa-eye"></i>';
            btn.setAttribute('aria-label', show ? 'Ascunde parola' : 'Arată parola');
        });
    }

    function showAlert(type, msg) {
        removeNotice();
        const div = document.createElement('div');
        div.className = 'alert alert-' + type + ' auth-notice';
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        div.innerHTML = '<i class="fas ' + icon + '"></i><div>' + msg + '</div>';
        const target = document.querySelector('.auth-card-head');
        if (target) target.after(div);
    }

    function removeNotice() {
        const existing = document.querySelector('.auth-notice');
        if (existing) existing.remove();
    }

});
