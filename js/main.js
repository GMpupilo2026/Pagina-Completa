/* ===== Ajedrez Integral — Main JS (navegación responsive) ===== */
(function () {
    'use strict';
    const menuToggle = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');
    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            if (iconOpen && iconClose) { iconOpen.classList.toggle('hidden'); iconClose.classList.toggle('hidden'); }
        });
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
                if (iconOpen && iconClose) { iconOpen.classList.remove('hidden'); iconClose.classList.add('hidden'); }
            });
        });
    }
    const header = document.getElementById('header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 30) { header.classList.add('scrolled', 'shadow-xl'); }
            else { header.classList.remove('scrolled', 'shadow-xl'); }
        });
    }
})();
