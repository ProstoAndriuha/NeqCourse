'use strict';

var NeqAuth = (function () {

    var USERS_KEY   = 'neq_users';
    var SESSION_KEY = 'neq_session';
    var SALT        = 'neq_2026_salt_x9';

    function _hash(pw) {
        return btoa(unescape(encodeURIComponent(SALT + ':' + pw)));
    }

    function _loadUsers() {
        try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
        catch (_) { return []; }
    }

    function _saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    (function _seed() {
        var users = _loadUsers();
        if (!users.some(function (u) { return u.role === 'admin'; })) {
            users.unshift({
                id: 1,
                name: 'Administrator',
                email: 'admin@neqcourse.com',
                password: _hash('Admin@2026'),
                role: 'admin',
                createdAt: '2026-01-01T00:00:00.000Z',
                enrolledCourses: []
            });
            _saveUsers(users);
        }
    }());



    /**
     * @returns {{ ok: boolean, error?: string }}
     */
    function register(email, password, name) {
        var users    = _loadUsers();
        var emailLow = email.toLowerCase().trim();
        if (users.some(function (u) { return u.email === emailLow; })) {
            return { ok: false, error: 'Un cont cu acest email există deja.' };
        }
        var user = {
            id: Date.now(),
            name: (name || emailLow.split('@')[0]).trim(),
            email: emailLow,
            password: _hash(password),
            role: 'student',
            createdAt: new Date().toISOString(),
            enrolledCourses: []
        };
        users.push(user);
        _saveUsers(users);
        return { ok: true };
    }

    /**
     * @returns {{ ok: boolean, error?: string, session?: object }}
     */
    function login(email, password) {
        var users    = _loadUsers();
        var emailLow = email.toLowerCase().trim();
        var user     = users.find(function (u) { return u.email === emailLow; });
        if (!user || user.password !== _hash(password)) {
            return { ok: false, error: 'Email sau parolă incorectă.' };
        }
        var session = { id: user.id, name: user.name, email: user.email, role: user.role };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { ok: true, session: session };
    }


    function logout() {
        localStorage.removeItem(SESSION_KEY);
    }

    /** @returns {object|null} Current session or null */
    function getSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
        catch (_) { return null; }
    }

    function isLoggedIn() { return getSession() !== null; }
    function isAdmin()    { var s = getSession(); return s !== null && s.role === 'admin'; }


    function getAllUsers() {
        return _loadUsers().map(function (u) {
            return {
                id: u.id, name: u.name, email: u.email,
                role: u.role, createdAt: u.createdAt,
                enrolledCourses: u.enrolledCourses || []
            };
        });
    }


    function deleteUser(id) {
        var session = getSession();
        if (!session || session.role !== 'admin') return false;
        if (session.id === id) return false;
        var users = _loadUsers();
        var target = users.find(function (u) { return u.id === id; });
        if (!target || target.role === 'admin') return false;
        _saveUsers(users.filter(function (u) { return u.id !== id; }));
        return true;
    }


    function enrollCourse(courseId, courseName) {
        var session = getSession();
        if (!session) return false;
        var users = _loadUsers();
        var user  = users.find(function (u) { return u.id === session.id; });
        if (!user) return false;
        user.enrolledCourses = user.enrolledCourses || [];
        if (!user.enrolledCourses.some(function (c) { return c.id === courseId; })) {
            user.enrolledCourses.push({
                id: courseId,
                name: courseName,
                enrolledAt: new Date().toISOString()
            });
            _saveUsers(users);
        }
        return true;
    }


    function getEnrolledCourses() {
        var session = getSession();
        if (!session) return [];
        var user = _loadUsers().find(function (u) { return u.id === session.id; });
        return user ? (user.enrolledCourses || []) : [];
    }

    /**
     * @param {string} redirectPath
     * @returns {boolean}
     */
    function requireLogin(redirectPath) {
        if (!isLoggedIn()) {
            window.location.href = redirectPath || 'login.html';
            return false;
        }
        return true;
    }

    /**
     * @param {string} redirectPath  Default: '../index.html'
     * @returns {boolean}
     */
    function requireAdmin(redirectPath) {
        if (!isAdmin()) {
            window.location.href = redirectPath || '../index.html';
            return false;
        }
        return true;
    }

    return {
        register: register,
        login: login,
        logout: logout,
        getSession: getSession,
        isLoggedIn: isLoggedIn,
        isAdmin: isAdmin,
        getAllUsers: getAllUsers,
        deleteUser: deleteUser,
        enrollCourse: enrollCourse,
        getEnrolledCourses: getEnrolledCourses,
        requireLogin: requireLogin,
        requireAdmin: requireAdmin
    };

}());
