/* Una tarjeta que lleva a otra página: a dónde y qué es, como en el panel de
   la Academia. La usan las pestañas de admin.html y de supervisor.html para
   las páginas de su tema (js/paginas-admin.js, js/paginas-supervisor.js).
   El texto es nuestro, pero igual va por textContent.

     lista.appendChild(TarjetaPagina({ emoji, label, desc, href }))   // un <li> */
(function () {
    "use strict";
    if (window.TarjetaPagina) return;
    window.TarjetaPagina = function (t) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = t.href;
        a.dataset.pagina = t.href;
        a.className = "flex h-full items-start gap-3 rounded-xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-4 hover:border-accent-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        const icono = document.createElement("span");
        icono.className = "text-2xl leading-none shrink-0";
        icono.setAttribute("aria-hidden", "true");
        icono.textContent = t.emoji;
        const texto = document.createElement("span");
        texto.className = "min-w-0";
        const titulo = document.createElement("span");
        titulo.className = "block font-semibold text-brand-800 dark:text-white";
        titulo.textContent = t.label;
        const desc = document.createElement("span");
        desc.className = "block text-sm text-brand-500 dark:text-brand-300 mt-0.5";
        desc.textContent = t.desc;
        texto.append(titulo, desc);
        a.append(icono, texto);
        li.appendChild(a);
        return li;
    };
})();
