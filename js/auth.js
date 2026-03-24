'use strict';

var NeqAuth = (function () {
    var ACCESS_TOKEN_KEY = 'neq_access_token';
    var REFRESH_TOKEN_KEY = 'neq_refresh_token';
    var SESSION_KEY = 'neq_session';

    function getAccessToken() {
        return localStorage.getItem(ACCESS_TOKEN_KEY);
    }

    function getRefreshToken() {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    }

    function saveAuth(response) {
        localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);

        var user = response.user || {};
        var session = {
            id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Student'
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }

    function clearAuth() {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(SESSION_KEY);
    }

    function getSession() {
        try {
            return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        } catch (_) {
            return null;
        }
    }

    function isLoggedIn() {
        return Boolean(getSession() && getAccessToken());
    }

    function isAdmin() {
        var session = getSession();
        return Boolean(session && (session.role === 'admin' || session.role === 'manager'));
    }

    function isTeacher() {
        var session = getSession();
        return Boolean(session && (session.role === 'teacher' || session.role === 'admin' || session.role === 'manager'));
    }

    async function parseResponse(response) {
        var contentType = response.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') !== -1) {
            return response.json();
        }

        var text = await response.text();
        return text ? { message: text } : null;
    }

    async function refreshSession() {
        var refreshToken = getRefreshToken();
        if (!refreshToken) {
            clearAuth();
            return false;
        }

        var response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken: refreshToken })
        });

        if (!response.ok) {
            clearAuth();
            return false;
        }

        var payload = await response.json();
        saveAuth(payload);
        return true;
    }

    async function request(path, options) {
        var config = options || {};
        var headers = new Headers(config.headers || {});
        var skipAuth = Boolean(config.skipAuth);
        var retryAuth = config.retryAuth !== false;

        if (config.body !== undefined && !headers.has('Content-Type') && !(config.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        if (!skipAuth) {
            var token = getAccessToken();
            if (token) {
                headers.set('Authorization', 'Bearer ' + token);
            }
        }

        var response = await fetch(path, {
            method: config.method || 'GET',
            headers: headers,
            body: config.body instanceof FormData ? config.body : (config.body !== undefined ? JSON.stringify(config.body) : undefined)
        });

        if (response.status === 401 && !skipAuth && retryAuth) {
            var refreshed = await refreshSession();
            if (refreshed) {
                return request(path, Object.assign({}, config, { retryAuth: false }));
            }
        }

        var payload = await parseResponse(response);
        if (!response.ok) {
            var error = new Error(payload && (payload.message || payload.error) ? (payload.message || payload.error) : 'Request failed');
            error.statusCode = response.status;
            error.payload = payload;
            throw error;
        }

        return payload;
    }

    async function register(email, password, firstName, lastName) {
        try {
            var payload = await request('/api/auth/register', {
                method: 'POST',
                skipAuth: true,
                body: {
                    email: email,
                    password: password,
                    firstName: firstName,
                    lastName: lastName
                }
            });
            return { ok: true, user: payload.user };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async function login(email, password) {
        try {
            var payload = await request('/api/auth/login', {
                method: 'POST',
                skipAuth: true,
                body: {
                    email: email,
                    password: password
                }
            });
            var session = saveAuth(payload);
            return { ok: true, session: session, user: payload.user };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    async function logout() {
        var refreshToken = getRefreshToken();
        try {
            if (refreshToken && getAccessToken()) {
                await request('/api/auth/logout', {
                    method: 'POST',
                    body: { refreshToken: refreshToken },
                    retryAuth: false
                });
            }
        } catch (_) {
            // ignore logout network errors and clear local auth anyway
        }

        clearAuth();
        return true;
    }

    async function getCurrentUser() {
        return request('/api/auth/me');
    }

    async function fetchCourses(filters) {
        var params = new URLSearchParams();
        Object.entries(filters || {}).forEach(function (entry) {
            var key = entry[0];
            var value = entry[1];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                params.set(key, String(value));
            }
        });

        var query = params.toString();
        return request('/api/catalog/courses' + (query ? '?' + query : ''), { skipAuth: true });
    }

    async function fetchCourseBySlug(slug) {
        return request('/api/catalog/courses/' + encodeURIComponent(slug), { skipAuth: true });
    }

    async function fetchMyEnrollments() {
        return request('/api/me/enrollments');
    }

    async function fetchCourseAccess(courseId) {
        return request('/api/enrollments/' + encodeURIComponent(courseId) + '/access');
    }

    async function fetchCourseProgress(courseId) {
        return request('/api/progress/courses/' + encodeURIComponent(courseId));
    }

    async function updateLessonProgress(lessonId, progress) {
        return request('/api/progress/lessons/' + encodeURIComponent(lessonId), {
            method: 'PUT',
            body: progress
        });
    }

    async function createOrder(courseId, promocode) {
        return request('/api/checkout/orders', {
            method: 'POST',
            headers: {
                'Idempotency-Key': 'checkout-' + Date.now() + '-' + Math.random().toString(16).slice(2)
            },
            body: {
                items: [{ type: 'course', courseId: courseId }],
                promocode: promocode || undefined
            }
        });
    }

    async function confirmDemoPayment(orderId) {
        return request('/api/checkout/orders/' + encodeURIComponent(orderId) + '/confirm-demo-payment', {
            method: 'POST'
        });
    }

    async function purchaseCourse(courseId, promocode) {
        var order = await createOrder(courseId, promocode);
        await confirmDemoPayment(order.orderId);
        return order;
    }

    async function fetchAdminOverview() {
        return request('/api/admin/overview');
    }

    async function deleteUser(userId) {
        return request('/api/admin/users/' + encodeURIComponent(userId), {
            method: 'DELETE'
        });
    }

    async function createUser(data) {
        return request('/api/admin/users', {
            method: 'POST',
            body: data
        });
    }

    async function updateUserRole(userId, role) {
        return request('/api/admin/users/' + encodeURIComponent(userId) + '/role', {
            method: 'PATCH',
            body: { role: role }
        });
    }

    async function createCourse(data) {
        return request('/api/admin/courses', {
            method: 'POST',
            body: data
        });
    }

    async function deleteCourse(courseId) {
        return request('/api/admin/courses/' + encodeURIComponent(courseId), {
            method: 'DELETE'
        });
    }

    function getAllUsers() {
        return [];
    }

    function getEnrolledCourses() {
        return [];
    }

    function requireLogin(redirectPath) {
        if (!isLoggedIn()) {
            window.location.href = redirectPath || 'login.html';
            return false;
        }
        return true;
    }

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
        isTeacher: isTeacher,
        getCurrentUser: getCurrentUser,
        fetchCourses: fetchCourses,
        fetchCourseBySlug: fetchCourseBySlug,
        fetchMyEnrollments: fetchMyEnrollments,
        fetchCourseAccess: fetchCourseAccess,
        fetchCourseProgress: fetchCourseProgress,
        updateLessonProgress: updateLessonProgress,
        createOrder: createOrder,
        confirmDemoPayment: confirmDemoPayment,
        purchaseCourse: purchaseCourse,
        fetchAdminOverview: fetchAdminOverview,
        getAllUsers: getAllUsers,
        deleteUser: deleteUser,
        createUser: createUser,
        updateUserRole: updateUserRole,
        createCourse: createCourse,
        deleteCourse: deleteCourse,
        getEnrolledCourses: getEnrolledCourses,
        requireLogin: requireLogin,
        requireAdmin: requireAdmin
    };
}());




