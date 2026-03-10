
'use strict';

document.addEventListener('DOMContentLoaded', function () {


    if (typeof NeqAuth === 'undefined' || !NeqAuth.requireAdmin('../index.html')) return;

    renderStats();
    renderUsersTable();


    function renderStats() {
        var users    = NeqAuth.getAllUsers();
        var students = users.filter(function (u) { return u.role === 'student'; });
        var admins   = users.filter(function (u) { return u.role === 'admin'; });
        var today    = new Date().toDateString();
        var newToday = users.filter(function (u) {
            return new Date(u.createdAt).toDateString() === today;
        });

        setText('stat-total-users', users.length);
        setText('stat-students',    students.length);
        setText('stat-admins',      admins.length);
        setText('stat-new-today',   newToday.length);
    }


    function renderUsersTable() {
        var users   = NeqAuth.getAllUsers();
        var session = NeqAuth.getSession();
        var tbody   = document.getElementById('admin-users-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        users.forEach(function (u) {
            var isMe    = u.id === session.id;
            var isAdmin = u.role === 'admin';
            var date    = new Date(u.createdAt).toLocaleDateString('ro-RO', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
            var enrolled = u.enrolledCourses ? u.enrolledCourses.length : 0;

            var nameCellHtml =
                '<strong>' + escHtml(u.name) + '</strong>' +
                (isMe ? ' <span class="admin-you-tag">tu</span>' : '');

            var roleCellHtml =
                '<span class="admin-role-tag admin-role-' + u.role + '">' +
                    (isAdmin ? '<i class="fas fa-shield-alt"></i> Admin'
                              : '<i class="fas fa-user-graduate"></i> Student') +
                '</span>';

            var actionCellHtml;
            if (isMe) {
                actionCellHtml =
                    '<button class="btn btn-outline btn-compact" disabled title="Nu te poți șterge">' +
                        '<i class="fas fa-user-shield"></i>' +
                    '</button>';
            } else if (isAdmin) {
                actionCellHtml =
                    '<button class="btn btn-outline btn-compact" disabled title="Nu poți șterge alt admin">' +
                        '<i class="fas fa-ban"></i>' +
                    '</button>';
            } else {
                actionCellHtml =
                    '<button class="btn btn-danger btn-compact admin-del-btn"' +
                        ' data-id="' + u.id + '"' +
                        ' data-name="' + escHtml(u.name) + '">' +
                        '<i class="fas fa-trash"></i> Șterge' +
                    '</button>';
            }

            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td class="admin-id-cell">' + u.id + '</td>' +
                '<td>' + nameCellHtml + '</td>' +
                '<td class="admin-email-cell">' + escHtml(u.email) + '</td>' +
                '<td>' + roleCellHtml + '</td>' +
                '<td>' + date + '</td>' +
                '<td class="admin-center-cell">' + enrolled + '</td>' +
                '<td>' + actionCellHtml + '</td>';
            tbody.appendChild(tr);
        });


        tbody.querySelectorAll('.admin-del-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id   = Number(btn.dataset.id);
                var name = btn.dataset.name;
                if (!confirm('Ești sigur că vrei să ștergi utilizatorul "' + name + '"?\nAceastă acțiune este ireversibilă.')) return;
                if (NeqAuth.deleteUser(id)) {
                    renderStats();
                    renderUsersTable();
                } else {
                    alert('Ștergerea nu a reușit.');
                }
            });
        });
    }


    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

});
