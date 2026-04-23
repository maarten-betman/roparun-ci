# Screenshots voor de handleiding

Deze map wordt door vite als statische content geserveerd: een bestand
`foo.png` hier is bereikbaar op `https://<host>/hulp-img/foo.png`. De
markdown in `docs/gebruik/*.md` gebruikt relatieve paden `./img/...`; de
ReactMarkdown-renderer herschrijft die automatisch naar `/hulp-img/...`
zodat een **enkele** opslagplek (deze map) voldoende is.

> **Waarom `/hulp-img/` en niet `/hulp/img/`?** De handleiding draait op
> de route `/hulp` via de SPA-fallback. Als statische assets onder
> `/hulp/` zouden staan, zou nginx een echte directory zien, geen
> `index.html` vinden, en 403 teruggeven voor de route zelf. Aparte
> paden voorkomen die collision.

Zie `docs/gebruik/img/README.md` in de repo voor de lijst met
bestandsnamen, framing-tips en welke dataset geladen moet zijn.
