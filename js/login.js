'use strict';

document.addEventListener('DOMContentLoaded', function () {
    if (typeof NeqAuth !== 'undefined' && NeqAuth.isLoggedIn()) {
        window.location.href = NeqAuth.isAdmin() ? 'admin.html' : 'dashboard.html';
        return;
    }

    bindPasswordToggle(document.getElementById('password'));

    var hint = document.getElementById('auth-demo-hint');
    if (hint) hint.hidden = false;

    var form = document.querySelector('.auth-form');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        removeNotice();

        var emailEl = document.getElementById('email');
        var passwordEl = document.getElementById('password');
        var submitButton = form.querySelector('[type="submit"]');
        var emailValue = emailEl ? emailEl.value.trim() : '';
        var passwordValue = passwordEl ? passwordEl.value : '';

        if (!emailValue) {
            showAlert('danger', 'Introduceti email-ul sau numele de utilizator.');
            if (emailEl) emailEl.focus();
            return;
        }

        if (!passwordValue) {
            showAlert('danger', 'Introduceti parola.');
            if (passwordEl) passwordEl.focus();
            return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            if (typeof NeqAuth !== 'undefined') {
                var result = await NeqAuth.login(emailValue, passwordValue);
                if (!result.ok) {
                    showAlert('danger', result.error);
                    return;
                }

                showAlert('success', 'Autentificare reusita! Redirectionare...');
                setTimeout(function () {
                    window.location.href = result.session.role === 'admin' || result.session.role === 'manager' ? 'admin.html' : 'dashboard.html';
                }, 900);
            }
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    function bindPasswordToggle(input) {
        if (!input) return;

        var wrap = input.closest('.input-icon-wrap');
        var button = wrap && wrap.querySelector('[data-password-toggle]');
        if (!button) return;

        button.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.setAttribute('aria-label', show ? 'Ascunde parola' : 'Arata parola');
            setIcon(button, show ? 'fa-eye-slash' : 'fa-eye');
        });
    }

    function showAlert(type, message) {
        var notice = document.getElementById('auth-notice');
        var noticeText = document.getElementById('auth-notice-text');
        var noticeIcon = document.getElementById('auth-notice-icon');
        if (!notice || !noticeText || !noticeIcon) return;

        notice.classList.remove('alert-success', 'alert-danger');
        notice.classList.add('alert-' + type);
        noticeText.textContent = message;
        notice.hidden = false;
        setIcon(noticeIcon, type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle');
    }

    function removeNotice() {
        var notice = document.getElementById('auth-notice');
        var noticeText = document.getElementById('auth-notice-text');
        if (!notice || !noticeText) return;

        notice.hidden = true;
        notice.classList.remove('alert-success', 'alert-danger');
        noticeText.textContent = '';
    }

    function setIcon(target, iconClass) {
        var icon = target.tagName === 'I' ? target : target.querySelector('i');
        if (!icon) return;

        icon.className = 'fas ' + iconClass;
        icon.setAttribute('aria-hidden', 'true');
    }
});
