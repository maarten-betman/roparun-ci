# Screenshots voor de handleiding

Deze map wordt door vite als statische content geserveerd: een bestand
`foo.png` hier is bereikbaar op `https://<host>/hulp/img/foo.png`. De
markdown in `docs/gebruik/*.md` gebruikt relatieve paden `./img/...`; de
ReactMarkdown-renderer herschrijft die automatisch naar `/hulp/img/...`
zodat een **enkele** opslagplek (deze map) voldoende is.

Zie `docs/gebruik/img/README.md` in de repo voor de lijst met
bestandsnamen, framing-tips en welke dataset geladen moet zijn.
