/* ===== Ajedrez Integral — Main JS (navegación responsive) ===== */
(function () {
    'use strict';
    const menuToggle = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');
    if (menuToggle && mobileMenu) {
        // El botón tiene que DECIR si el menú está abierto: quien usa lector de
        // pantalla no ve el icono, y sin aria-expanded no tiene forma de saber
        // si ya lo abrió. El aria-label cambia con el estado, igual que ya lo
        // hacía el botón del tema.
        const pintarMenu = (abierto) => {
            mobileMenu.classList.toggle('hidden', !abierto);
            menuToggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
            menuToggle.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
            if (iconOpen && iconClose) {
                iconOpen.classList.toggle('hidden', abierto);
                iconClose.classList.toggle('hidden', !abierto);
            }
        };
        pintarMenu(false);
        menuToggle.addEventListener('click', () => {
            pintarMenu(mobileMenu.classList.contains('hidden'));
        });
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => pintarMenu(false));
        });
        // Escape cierra y devuelve el foco al botón: si no, el foco se queda
        // dentro de un menú que ya no está en pantalla.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || mobileMenu.classList.contains('hidden')) return;
            pintarMenu(false);
            menuToggle.focus();
        });
    }
    const header = document.getElementById('header');
    if (header) {
        // passive: el navegador no tiene que esperar a ver si este listener
        // cancela el scroll, así que puede seguir desplazando mientras corre.
        // Dos umbrales y no uno: el encabezado es sticky (está en el flujo) y
        // al encogerse (.scrolled) sube todo lo de abajo unos 24px; el
        // navegador corrige el scroll para que el contenido no se mueva
        // (scroll anchoring) y scrollY baja esos 24px. Con un solo umbral en
        // 30, de 31 a ~54 eso lo devolvía debajo del umbral, se agrandaba,
        // volvía a pasar… y el encabezado temblaba sin parar. El hueco entre
        // los dos (60px) es más grande que lo que cambia la altura, también
        // en modo adaptado. Lo comprueba verificar-encabezado-scroll.js.
        let encogido = false;
        const pintarEncabezado = () => {
            const y = window.scrollY;
            if (!encogido && y > 80) encogido = true;
            else if (encogido && y < 20) encogido = false;
            else return;
            header.classList.toggle('scrolled', encogido);
            header.classList.toggle('shadow-xl', encogido);
        };
        window.addEventListener('scroll', pintarEncabezado, { passive: true });
        pintarEncabezado();
    }

    // ---- Modo oscuro / claro (persistido en localStorage, con detección de preferencia del sistema) ----
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const htmlEl = document.documentElement;
    function updateThemeUI() {
        const isDark = htmlEl.classList.contains('dark');
        if (themeIcon) themeIcon.textContent = isDark ? '🌙' : '☀️';
        if (themeToggle) {
            themeToggle.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
        }
    }
    if (themeToggle) {
        updateThemeUI();
        themeToggle.addEventListener('click', () => {
            const isDark = htmlEl.classList.toggle('dark');
            try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
            updateThemeUI();
        });
    }
})();
