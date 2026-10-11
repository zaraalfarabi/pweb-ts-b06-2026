"use strict";
/*
 * session.ts — FUNGSI BERSAMA (fondasi proyek, dikerjakan Orang 1)
 *
 * File ini dikompilasi sebagai script biasa (bukan ES module), sehingga semua
 * fungsi & konstanta di bawah menjadi GLOBAL dan bisa langsung dipanggil dari
 * login.ts, dashboard.ts, operator.ts, dst.
 *
 * Cara pakai di HTML (urutan penting, session.js harus paling atas):
 *   <script src="dist/session.js" defer></script>
 *   <script src="dist/dashboard.js" defer></script>
 *
 * Fungsi yang tersedia:
 *   getSession()          -> QueueSession | null
 *   isAuthenticated()     -> boolean
 *   hasAdminAccess(role)  -> boolean (admin & moderator = true)
 *   getHomePageForRole()  -> "index.html" | "operator.html"
 *   saveSession(session)  -> simpan ke Local Storage
 *   clearSession()        -> hapus sesi dari Local Storage
 *   logout()              -> hapus sesi lalu kembali ke login.html
 */
/* Nama key Local Storage untuk sesi — dipakai seluruh anggota kelompok. */
const SESSION_KEYS = {
    token: "queueToken",
    role: "queueRole",
    firstName: "queueFirstName"
};
const DUMMYJSON_BASE_URL = "https://dummyjson.com";
const LOGIN_PAGE = "login.html";
function normalizeRole(role) {
    if (typeof role !== "string")
        return null;
    const value = role.trim().toLowerCase();
    if (value === "admin" || value === "moderator" || value === "user") {
        return value;
    }
    return null;
}
/* Moderator diperlakukan sama dengan admin. */
function hasAdminAccess(role) {
    return role === "admin" || role === "moderator";
}
/* Halaman tujuan setelah login: admin/moderator -> Dashboard, user -> Operator. */
function getHomePageForRole(role) {
    return hasAdminAccess(role) ? "index.html" : "operator.html";
}
function saveSession(session) {
    localStorage.setItem(SESSION_KEYS.token, session.token);
    localStorage.setItem(SESSION_KEYS.role, session.role);
    localStorage.setItem(SESSION_KEYS.firstName, session.firstName);
}
/* Mengembalikan sesi yang valid, atau null jika belum login / data rusak. */
function getSession() {
    const token = localStorage.getItem(SESSION_KEYS.token);
    const role = normalizeRole(localStorage.getItem(SESSION_KEYS.role));
    const firstName = localStorage.getItem(SESSION_KEYS.firstName);
    if (!token || !role || !firstName)
        return null;
    return { token, role, firstName };
}
function isAuthenticated() {
    return getSession() !== null;
}
function clearSession() {
    localStorage.removeItem(SESSION_KEYS.token);
    localStorage.removeItem(SESSION_KEYS.role);
    localStorage.removeItem(SESSION_KEYS.firstName);
}
function logout() {
    clearSession();
    window.location.replace(LOGIN_PAGE);
}
