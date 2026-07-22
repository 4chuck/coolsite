import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// Utility for updating nav based on auth state
export function initAuthGuard(requireAuth = false, redirectUrl = '../login/fire-login.html') {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is signed in
                if (document.getElementById('nav-user-name')) {
                    document.getElementById('nav-user-name').textContent = user.displayName?.split(' ')[0] || 'Dashboard';
                }
                document.body.classList.add('logged-in');
                resolve(user);
            } else {
                // User is signed out
                if (requireAuth) {
                    window.location.href = redirectUrl;
                }
                document.body.classList.remove('logged-in');
                resolve(null);
            }
        });
    });
}

export function handleLogout() {
    signOut(auth).then(() => {
        window.location.href = '../index.html';
    }).catch((error) => {
        console.error("Sign out error", error);
    });
}

// Bind global buttons if they exist
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }
});
