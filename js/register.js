'use strict';

document.addEventListener('DOMContentLoaded', function () {
    if (typeof NeqAuth !== 'undefined' && NeqAuth.isLoggedIn()) {
        window.location.href = 'dashboard.html';
        return;
    }

    bindPasswordToggle(document.getElementById('password'));
    bindPasswordToggle(document.getElementById('confirmPassword'));

    var passwordEl = document.getElementById('password');
    var pwBar = document.getElementById('pwBar');
    if (passwordEl && pwBar) {
        passwordEl.addEventListener('input', function () {
            pwBar.dataset.level = getStrength(passwordEl.value);
        });
    }

    var confirmEl = document.getElementById('confirmPassword');
    if (confirmEl) {
        confirmEl.addEventListener('input', checkMatch);
        if (passwordEl) {
            passwordEl.addEventListener('input', function () {
                if (confirmEl.value) checkMatch();
            });
        }
    }

    var regForm = document.querySelector('.reg-form');
    if (regForm) {
        regForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            removeNotice();

            var email = document.getElementById('email');
            var password = document.getElementById('password');
            var passwordConfirm = document.getElementById('confirmPassword');
            var terms = regForm.querySelector('input[name="terms"]');
            var age = regForm.querySelector('input[name="age"]');
            var submitButton = regForm.querySelector('[type="submit"]');

            if (!email || !email.value.trim() || !isValidEmail(email.value.trim())) {
                showAlert('danger', 'Introduceti o adresa de email valida.');
                if (email) email.focus();
                return;
            }

            if (!password || password.value.length < 8) {
                showAlert('danger', 'Parola trebuie sa aiba cel putin 8 caractere.');
                if (password) password.focus();
                return;
            }

            if (passwordConfirm && password.value !== passwordConfirm.value) {
                showAlert('danger', 'Parolele nu coincid.');
                passwordConfirm.focus();
                return;
            }

            if (terms && !terms.checked) {
                showAlert('danger', 'Trebuie sa accepti Termenii si Politica de Confidentialitate.');
                return;
            }

            if (age && !age.checked) {
                showAlert('danger', 'Trebuie sa confirmi ca ai cel putin 16 ani.');
                return;
            }

            var firstName = (document.getElementById('firstName') || {}).value || email.value.trim().split('@')[0];
            var lastName = (document.getElementById('lastName') || {}).value || 'Student';

            if (submitButton) submitButton.disabled = true;

            try {
                if (typeof NeqAuth !== 'undefined') {
                    var emailValue = email.value.trim();
                    var passwordValue = password.value;
                    var registerResult = await NeqAuth.register(emailValue, passwordValue, firstName.trim(), lastName.trim());
                    if (!registerResult.ok) {
                        showAlert('danger', registerResult.error);
                        return;
                    }

                    var loginResult = await NeqAuth.login(emailValue, passwordValue);
                    if (!loginResult.ok) {
                        showAlert('danger', loginResult.error);
                        return;
                    }
                }

                showAlert('success', 'Cont creat cu succes! Bine ai venit la NeqCourse!');
                regForm.reset();
                if (pwBar) pwBar.dataset.level = '0';
                setTimeout(function () {
                    window.location.href = 'dashboard.html';
                }, 1200);
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

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

    function getStrength(password) {
        if (!password) return 0;
        var strength = 0;
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;
        return Math.min(strength, 4);
    }

    function checkMatch() {
        var password = document.getElementById('password');
        var passwordConfirm = document.getElementById('confirmPassword');
        if (!password || !passwordConfirm) return;

        if (passwordConfirm.value && password.value !== passwordConfirm.value) {
            passwordConfirm.setCustomValidity('Parolele nu coincid');
            passwordConfirm.classList.add('input-error');
        } else {
            passwordConfirm.setCustomValidity('');
            passwordConfirm.classList.remove('input-error');
        }
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function showAlert(type, message) {
        var notice = document.getElementById('reg-notice');
        var noticeText = document.getElementById('reg-notice-text');
        var noticeIcon = document.getElementById('reg-notice-icon');
        if (!notice || !noticeText || !noticeIcon) return;

        notice.classList.remove('alert-success', 'alert-danger');
        notice.classList.add('alert-' + type);
        noticeText.textContent = message;
        notice.hidden = false;
        setIcon(noticeIcon, type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle');
    }

    function removeNotice() {
        var notice = document.getElementById('reg-notice');
        var noticeText = document.getElementById('reg-notice-text');
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
