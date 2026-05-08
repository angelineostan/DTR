// ===================================
// Dark / Light Mode Toggle
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const iconSun = document.getElementById('icon-sun');
    const iconMoon = document.getElementById('icon-moon');

    // Mobile theme toggle elements
    const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
    const mobileIconSun = document.querySelector('.mobile-icon-sun');
    const mobileIconMoon = document.querySelector('.mobile-icon-moon');

    function setTheme(mode) {
        if (mode === 'light') {
            document.body.classList.add('light-mode');
            iconSun.classList.add('hidden');
            iconMoon.classList.remove('hidden');
            if (mobileIconSun && mobileIconMoon) {
                mobileIconSun.classList.add('hidden');
                mobileIconMoon.classList.remove('hidden');
            }
        } else {
            document.body.classList.remove('light-mode');
            iconSun.classList.remove('hidden');
            iconMoon.classList.add('hidden');
            if (mobileIconSun && mobileIconMoon) {
                mobileIconSun.classList.remove('hidden');
                mobileIconMoon.classList.add('hidden');
            }
        }
        localStorage.setItem('dtr-theme', mode);
    }

    // Load saved preference
    const savedTheme = localStorage.getItem('dtr-theme') || 'dark';
    setTheme(savedTheme);

    // Desktop toggle
    themeToggle.addEventListener('click', () => {
        const current = document.body.classList.contains('light-mode') ? 'light' : 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Mobile toggle
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', () => {
            const current = document.body.classList.contains('light-mode') ? 'light' : 'dark';
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
});
