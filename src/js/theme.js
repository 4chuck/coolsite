/**
 * Tetron Global Theme Engine
 * Manages Dark/Light modes across all platform pages.
 * Supports cross-tab synchronization via storage events.
 */

export function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (!themeToggleBtn) return;
    
    // Check for saved user preference, else use system preference
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    setTheme(savedTheme || (systemDark ? 'dark' : 'light'));

    // Prevent multiple listeners if initTheme is called multiple times
    if (themeToggleBtn.getAttribute('data-has-listener')) return;
    themeToggleBtn.setAttribute('data-has-listener', 'true');

    themeToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    });

    // Listen for theme changes in other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme' && e.newValue) {
            setTheme(e.newValue);
        }
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update icon to reflect the CURRENT state (Sun for Dark Mode, Moon for Light Mode)
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        if (theme === 'dark') {
            icon.className = 'bi bi-sun';
        } else {
            icon.className = 'bi bi-moon';
        }
    }
}

// Auto-init for non-module environments or legacy calls
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}
