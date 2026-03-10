// NeqCourse — Register page functionality
'use strict';

document.addEventListener('DOMContentLoaded', function () {


    if (typeof NeqAuth !== 'undefined' && NeqAuth.isLoggedIn()) {
        window.location.href = 'dashboard.html';
        return;
    }


    addPasswordToggle(document.getElementById('password'));
    addPasswordToggle(document.getElementById('confirmPassword'));


    const passwordEl = document.getElementById('password');
    const pwBar      = document.getElementById('pwBar');
    if (passwordEl && pwBar) {
        passwordEl.addEventListener('input', function () {
            pwBar.dataset.level = getStrength(passwordEl.value);
        });
    }


    const confirmEl = document.getElementById('confirmPassword');
    if (confirmEl) {
        confirmEl.addEventListener('input', checkMatch);
        if (passwordEl) passwordEl.addEventListener('input', function () {
            if (confirmEl.value) checkMatch();
        });
    }


    const regForm = document.querySelector('.reg-form');
    if (regForm) {
        regForm.addEventListener('submit', function (e) {
            e.preventDefault();
            removeNotice();

            const email   = document.getElementById('email');
            const pw      = document.getElementById('password');
            const pwConf  = document.getElementById('confirmPassword');
            const terms   = regForm.querySelector('input[name="terms"]');
            const age     = regForm.querySelector('input[name="age"]');

            if (!email || !email.value.trim() || !isValidEmail(email.value.trim())) {
                showAlert('danger', 'Introduceți o adresă de email validă.');
                if (email) email.focus();
                return;
            }

            if (!pw || pw.value.length < 8) {
                showAlert('danger', 'Parola trebuie să aibă cel puțin 8 caractere.');
                if (pw) pw.focus();
                return;
            }

            if (pwConf && pw.value !== pwConf.value) {
                showAlert('danger', 'Parolele nu coincid.');
                pwConf.focus();
                return;
            }

            if (terms && !terms.checked) {
                showAlert('danger', 'Trebuie să accepți Termenii și Politica de Confidențialitate.');
                return;
            }

            if (age && !age.checked) {
                showAlert('danger', 'Trebuie să confirmi că ai cel puțin 16 ani.');
                return;
            }

            if (typeof NeqAuth !== 'undefined') {
                var emailVal = document.getElementById('email').value.trim();
                var pwVal    = document.getElementById('password').value;
                var result   = NeqAuth.register(emailVal, pwVal);
                if (!result.ok) {
                    showAlert('danger', result.error);
                    return;
                }

                NeqAuth.login(emailVal, pwVal);
            }

            showAlert('success', 'Cont creat cu succes! Bine ai venit la NeqCourse!');
            regForm.reset();
            if (pwBar) pwBar.dataset.level = '0';
            setTimeout(function () {
                window.location.href = 'dashboard.html';
            }, 1200);
        });
    }


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

    function getStrength(pw) {
        if (!pw) return 0;
        let s = 0;
        if (pw.length >= 8)  s++;
        if (pw.length >= 12) s++;
        if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
        if (/[0-9]/.test(pw)) s++;
        if (/[^A-Za-z0-9]/.test(pw)) s++;
        return Math.min(s, 4);
    }

    function checkMatch() {
        const pw     = document.getElementById('password');
        const pwConf = document.getElementById('confirmPassword');
        if (!pw || !pwConf) return;
        if (pwConf.value && pw.value !== pwConf.value) {
            pwConf.setCustomValidity('Parolele nu coincid');
            pwConf.classList.add('input-error');
        } else {
            pwConf.setCustomValidity('');
            pwConf.classList.remove('input-error');
        }
    }

    function isValidEmail(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function showAlert(type, msg) {
        removeNotice();
        const div = document.createElement('div');
        div.className = 'alert alert-' + type + ' reg-notice';
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        div.innerHTML = '<i class="fas ' + icon + '"></i><div>' + msg + '</div>';
        const btn = document.querySelector('.reg-form .btn-full');
        if (btn) btn.before(div);
    }

    function removeNotice() {
        const el = document.querySelector('.reg-notice');
        if (el) el.remove();
    }

});
