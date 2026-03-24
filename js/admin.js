'use strict';

document.addEventListener('DOMContentLoaded', async function () {
    if (typeof NeqAuth === 'undefined' || !NeqAuth.requireAdmin('../index.html')) return;

    var currentData = null;

    await loadOverview();

    // ─── Modal open/close ───
    setupModal('btn-add-user', 'modal-add-user');
    setupModal('btn-add-course', 'modal-add-course');

    // ─── Form: Add user ───
    document.getElementById('form-add-user').addEventListener('submit', async function (e) {
        e.preventDefault();
        var errorEl = document.getElementById('add-user-error');
        errorEl.hidden = true;

        try {
            await NeqAuth.createUser({
                firstName: document.getElementById('add-user-first').value.trim(),
                lastName: document.getElementById('add-user-last').value.trim(),
                email: document.getElementById('add-user-email').value.trim(),
                password: document.getElementById('add-user-password').value,
                role: document.getElementById('add-user-role').value
            });
            closeModal('modal-add-user');
            e.target.reset();
            await loadOverview();
        } catch (err) {
            errorEl.textContent = err.message || 'Eroare la creare.';
            errorEl.hidden = false;
        }
    });

    // ─── Form: Add course ───
    document.getElementById('form-add-course').addEventListener('submit', async function (e) {
        e.preventDefault();
        var errorEl = document.getElementById('add-course-error');
        errorEl.hidden = true;

        try {
            await NeqAuth.createCourse({
                title: document.getElementById('add-course-title').value.trim(),
                slug: document.getElementById('add-course-slug').value.trim(),
                shortDescription: document.getElementById('add-course-desc').value.trim() || undefined,
                level: document.getElementById('add-course-level').value,
                priceAmount: parseFloat(document.getElementById('add-course-price').value) || 0,
                status: document.getElementById('add-course-status').value
            });
            closeModal('modal-add-course');
            e.target.reset();
            await loadOverview();
        } catch (err) {
            errorEl.textContent = err.message || 'Eroare la creare.';
            errorEl.hidden = false;
        }
    });

    // ─── Auto-generate slug from title ───
    document.getElementById('add-course-title').addEventListener('input', function () {
        var slugField = document.getElementById('add-course-slug');
        if (!slugField.dataset.manual) {
            slugField.value = this.value.toLowerCase()
                .replace(/[ăâ]/g, 'a').replace(/[îï]/g, 'i')
                .replace(/[șş]/g, 's').replace(/[țţ]/g, 't')
                .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        }
    });
    document.getElementById('add-course-slug').addEventListener('input', function () {
        this.dataset.manual = '1';
    });

    // ═══════════════════════════════════════════════════════
    async function loadOverview() {
        try {
            currentData = await NeqAuth.fetchAdminOverview();
            renderStats(currentData.stats || {}, currentData.users || [], currentData.courses || []);
            renderUsersTable(currentData.users || []);
            renderCoursesTable(currentData.courses || []);
            updateNotice(true);
        } catch (error) {
            updateNotice(false, error.message || 'Nu am putut încărca statisticile.');
        }
    }

    function renderStats(stats, users, courses) {
        setText('stat-total-users', stats.totalUsers || 0);
        setText('stat-students', stats.students || 0);
        setText('stat-admins', stats.admins || 0);
        setText('stat-new-today', stats.newToday || 0);
        setText('stat-teachers', users.filter(function (u) { return u.role === 'teacher'; }).length);
        setText('stat-courses', courses.length);
    }

    function renderUsersTable(users) {
        var session = NeqAuth.getSession();
        var tbody = document.getElementById('admin-users-tbody');
        if (!tbody) return;

        tbody.replaceChildren();
        users.forEach(function (user) {
            tbody.appendChild(createUserRow(user, session));
        });
    }

    function createUserRow(user, session) {
        var isMe = session && user.id === session.id;
        var isPrivileged = user.role === 'admin' || user.role === 'manager';
        var row = document.createElement('tr');

        row.innerHTML = '' +
            '<td class="admin-id-cell">' + escapeHtml(String(user.id).slice(0, 8)) + '</td>' +
            '<td><strong>' + escapeHtml(user.name) + '</strong>' +
                (isMe ? ' <span class="admin-you-tag">tu</span>' : '') + '</td>' +
            '<td class="admin-email-cell">' + escapeHtml(user.email) + '</td>' +
            '<td class="admin-role-cell"></td>' +
            '<td>' + formatDate(user.createdAt) + '</td>' +
            '<td class="admin-center-cell">' + String(user.enrolledCourses || 0) + '</td>' +
            '<td>' + humanizeUserStatus(user.status) + '</td>' +
            '<td class="admin-actions-cell"></td>';

        // Role column: dropdown (or static for self)
        var roleCell = row.querySelector('.admin-role-cell');
        if (isMe) {
            roleCell.innerHTML = '<span class="admin-role-tag admin-role-admin"><i class="fas fa-shield-alt"></i> ' + humanizeRole(user.role) + '</span>';
        } else {
            var select = document.createElement('select');
            select.className = 'admin-role-select';
            ['student', 'teacher', 'admin'].forEach(function (r) {
                var opt = document.createElement('option');
                opt.value = r;
                opt.textContent = humanizeRole(r);
                if (r === user.role) opt.selected = true;
                select.appendChild(opt);
            });
            select.addEventListener('change', async function () {
                var newRole = this.value;
                try {
                    await NeqAuth.updateUserRole(user.id, newRole);
                    await loadOverview();
                } catch (err) {
                    alert(err.message || 'Nu s-a putut schimba rolul.');
                    this.value = user.role;
                }
            });
            roleCell.appendChild(select);
        }

        // Actions column
        var actionsCell = row.querySelector('.admin-actions-cell');
        if (!isMe) {
            var delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-compact admin-del-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i> Șterge';
            delBtn.addEventListener('click', async function () {
                if (!confirm('Ștergi utilizatorul "' + user.name + '"?')) return;
                try {
                    await NeqAuth.deleteUser(user.id);
                    await loadOverview();
                } catch (err) {
                    alert(err.message || 'Ștergerea nu a reușit.');
                }
            });
            actionsCell.appendChild(delBtn);
        } else {
            actionsCell.innerHTML = '<span class="admin-you-tag"><i class="fas fa-user-shield"></i></span>';
        }

        return row;
    }

    function renderCoursesTable(courses) {
        var tbody = document.getElementById('admin-courses-tbody');
        if (!tbody) return;

        tbody.replaceChildren();
        if (courses.length === 0) {
            var emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="5" style="text-align:center;opacity:.6">Niciun curs încă. Apasă "Adaugă curs" pentru a crea primul.</td>';
            tbody.appendChild(emptyRow);
            return;
        }

        courses.forEach(function (course) {
            var row = document.createElement('tr');
            row.innerHTML = '' +
                '<td><a href="course.html?slug=' + encodeURIComponent(course.slug) + '">' + escapeHtml(course.title) + '</a></td>' +
                '<td><span class="badge ' + escapeHtml(levelBadge(course.level)) + '">' + escapeHtml(humanizeLevel(course.level)) + '</span></td>' +
                '<td>' + (course.priceAmount ? ('$' + Number(course.priceAmount).toFixed(2)) : 'Gratuit') + '</td>' +
                '<td><span class="admin-status-active">' + escapeHtml(humanizeCourseStatus(course.status)) + '</span></td>' +
                '<td class="admin-course-actions"></td>';

            var actionsCell = row.querySelector('.admin-course-actions');
            var delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-compact admin-del-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = 'Șterge cursul';
            delBtn.addEventListener('click', async function () {
                if (!confirm('Ștergi cursul "' + course.title + '"?')) return;
                try {
                    await NeqAuth.deleteCourse(course.id);
                    await loadOverview();
                } catch (err) {
                    alert(err.message || 'Ștergerea nu a reușit.');
                }
            });
            actionsCell.appendChild(delBtn);
            tbody.appendChild(row);
        });
    }

    // ─── Modal helpers ───
    function setupModal(buttonId, modalId) {
        var btn = document.getElementById(buttonId);
        var modal = document.getElementById(modalId);
        if (!btn || !modal) return;

        btn.addEventListener('click', function () { modal.classList.add('is-open'); });
        modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
            el.addEventListener('click', function () { modal.classList.remove('is-open'); });
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.classList.remove('is-open');
        });
    }

    function closeModal(modalId) {
        var modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('is-open');
    }

    // ─── Utility helpers ───
    function updateNotice(isLive, errorText) {
        var notice = document.getElementById('admin-data-notice');
        if (!notice) return;

        if (isLive) {
            notice.innerHTML = '<i class="fas fa-database"></i><div><strong>Date live.</strong> Statistica și utilizatorii sunt încărcați din PostgreSQL.</div>';
            return;
        }

        notice.innerHTML = '<i class="fas fa-exclamation-triangle"></i><div><strong>Eroare backend.</strong> ' + escapeHtml(errorText || 'Nu am putut încărca datele.') + '</div>';
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = String(value);
    }

    function formatDate(value) {
        return new Date(value).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function humanizeUserStatus(s) {
        if (s === 'active') return 'Activ';
        if (s === 'suspended') return 'Suspendat';
        if (s === 'invited') return 'Invitat';
        return s;
    }

    function humanizeRole(r) {
        if (r === 'admin') return 'Admin';
        if (r === 'manager') return 'Manager';
        if (r === 'teacher') return 'Profesor';
        return 'Student';
    }

    function humanizeLevel(l) {
        if (l === 'beginner') return 'Începător';
        if (l === 'intermediate') return 'Intermediar';
        if (l === 'advanced') return 'Avansat';
        return 'Toate nivelurile';
    }

    function levelBadge(l) {
        if (l === 'beginner') return 'badge-beginner';
        if (l === 'advanced') return 'badge-advanced';
        return 'badge-intermediate';
    }

    function humanizeCourseStatus(s) {
        if (s === 'published') return 'Publicat';
        if (s === 'draft') return 'Draft';
        if (s === 'review') return 'In review';
        if (s === 'archived') return 'Arhivat';
        return s;
    }

    function escapeHtml(v) {
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
