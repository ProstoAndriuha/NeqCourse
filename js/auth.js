/**
 * NeqCourse — Authentication Module
 *
 * SECURITY NOTE: This is a purely client-side demo.
 * Passwords are obfuscated with btoa() — NOT cryptographically secure.
 * In production, use a real backend with bcrypt/argon2 password hashing.
 */
'use strict';

var NeqAuth = (function () {

    var USERS_KEY   = 'neq_users';
    var SESSION_KEY = 'neq_session';
    var SALT        = 'neq_2026_salt_x9';

    /* ---- Internal helpers ---- */

    /** Basic obfuscation only — not a real hash */
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

    /* ---- Seed default admin on first run ---- */
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

    /* ---- Public API ---- */

    /**
     * Register a new student account.
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
     * Authenticate user — creates a sessionStorage session on success.
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
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { ok: true, session: session };
    }

    /** Destroy the current session. */
    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    /** @returns {object|null} Current session or null */
    function getSession() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; }
        catch (_) { return null; }
    }

    function isLoggedIn() { return getSession() !== null; }
    function isAdmin()    { var s = getSession(); return s !== null && s.role === 'admin'; }

    /** Return all users (passwords excluded) — admin only. */
    function getAllUsers() {
        return _loadUsers().map(function (u) {
            return {
                id: u.id, name: u.name, email: u.email,
                role: u.role, createdAt: u.createdAt,
                enrolledCourses: u.enrolledCourses || []
            };
        });
    }

    /** Delete a user by id. Only admins can do this; can't delete self or another admin. */
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

    /** Enroll the currently logged-in user in a course. */
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

    /** Return enrolled courses for the currently logged-in user. */
    function getEnrolledCourses() {
        var session = getSession();
        if (!session) return [];
        var user = _loadUsers().find(function (u) { return u.id === session.id; });
        return user ? (user.enrolledCourses || []) : [];
    }

    /**
     * Redirect to login if not logged in.
     * @param {string} redirectPath  Default: 'login.html'
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
     * Redirect to index if not admin.
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
