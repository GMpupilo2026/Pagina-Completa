/* Lo que se escribe en un buscador que filtra en la base con `.or()`.

   PostgREST arma el filtro `or=(...)` con comas y paréntesis, así que un
   texto que los traiga rompe la consulta entera en vez de buscar; `%`, `*` y
   `\` son comodines o escapes del `ilike`, y las comillas delimitan valores.
   Se cambian por espacios (y se corta el largo) antes de mandarlo: lo que se
   busca es un nombre o un título, no una expresión.

   Había tres copias (el registro de clases, cobros y la tienda), cada una con
   su propia lista de caracteres: cobros dejaba pasar las comillas y la tienda
   también. Una sola copia, para que no se vuelvan a separar. */
window.BusquedaBase = {
    limpiar(texto) {
        return String(texto == null ? "" : texto).replace(/[,()%*\\"']/g, " ").trim().slice(0, 60);
    },
};
