# Screenshots voor de handleiding

De Nederlandstalige handleiding verwijst naar de bestanden hieronder.

> **Waar plaats ik de PNG's?** Zet ze in **`frontend/public/hulp-img/`**,
> niet hier. Die map wordt door de site geserveerd op `/hulp-img/...`,
> en de markdown-renderer herschrijft `./img/<naam>.png` automatisch naar
> `/hulp-img/<naam>.png`. Eén opslagplek; deze README blijft in `docs/`
> voor developers die de checklist bij de hand willen zonder de
> frontend-assets te openen.
>
> (De bestanden staan op `/hulp-img/` in plaats van `/hulp/img/` om te
> voorkomen dat nginx een fysieke `/hulp`-directory detecteert en de
> SPA-route met een 403 beantwoordt.)

Framing-tips:

- Schoon browservenster (geen devtools, geen adresbalk-suggesties).
- Desktop-screenshots: viewportbreedte **1440 px** (16:10 of 16:9), geen
  retina-upsampling groter dan 2×.
- Mobiel-screenshots: gebruik Chrome DevTools *Device Toolbar* op
  **iPhone 14** (390×844) of een echte telefoon. Geen status-bar nodig.
- Gebruik de **V3 2026 Conclusion**-data (`make load-roparun-2026`),
  niet de `make seed`-demo-route — die is leeg en oogt ongeloofwaardig.
- Verberg persoonsnamen/telefoonnummers als je met echte koppelingen
  werkt. Voor koppel-schermen kun je een demo-token gebruiken.

## Lijst

| Bestandsnaam                    | Scherm                              | Framing                                                                 |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `viewer-desktop.png`            | Viewer op desktop                   | Volledig venster; route + zijbalk met View-as + Lagen + Live zichtbaar. |
| `viewer-mobile.png`             | Viewer op mobiel, menu dicht        | Topbar met hamburger links, titel midden, Download-knop rechts.         |
| `viewer-mobile-menu.png`        | Viewer op mobiel, hamburger open    | Drawer met vier links (Viewer / Planner / Tracker / Hulp), Viewer actief. |
| `viewer-role-preset.png`        | Zijbalk zoomed-in                   | De vier "View as"-knoppen (Lopers / A / B / C) bovenin de zijbalk.      |
| `viewer-layers.png`             | Zijbalk zoomed-in                   | Sectie "Lagen" met een uitgeklapte laag en wat toggles.                 |
| `viewer-mobile-drawer.png`      | Viewer op mobiel, bottom-drawer aan | Bottom-sheet met laaglijst, Layers-knop actief.                         |
| `viewer-live.png`               | Viewer tijdens live-test            | Kaart met 2–3 gekleurde markers + spoor; Live-sectie zichtbaar.         |
| `planner-desktop.png`           | Planner op desktop                  | Tools-kolom links, kaart in het midden (alleen loperstrack), tijdlijn onder de kaart. |
| `planner-pace-start.png`        | Pace & start-sectie in de zijbalk   | Pace-veld (`5:00` min/km) + datetime-veld (`2026-05-23 15:00`).         |
| `planner-snip.png`              | Snip-tool actief                    | Eerste+tweede kappunt zichtbaar, het te verwijderen stuk rood.          |
| `planner-team-changes.png`      | Teamwissel-marker met hover-popup   | 👥-marker op de kaart; MapLibre popup met naam, km en ETA.              |
| `planner-team-change-row.png`   | Eén rij in de Team changes-lijst    | Volgnummer, km cumulatief, +km deze etappe, ETA, naam-veld, offset-stepper. |
| `planner-timeline.png`          | Tijdlijn onder de kaart             | As-labels boven, rose-rode pips, blauwe cursor + tooltip onder muis; tegelijk de ghost-marker op de kaart erboven. |
| `planner-mobile-drawer.png`     | Planner op mobiel met drawer open   | ≡ Tools-knop in de topbar; sidebar als overlay met scrim erover.        |
| `planner-pairing-panel.png`     | Pairing-panel                       | Rol-dropdown, Generate-knop, QR, kopieerbare URL, aftel-timer.          |
| `tracker-pair-form.png`         | Tracker direct na QR-scan           | Scherm met alleen het "Naam"-veld en een Koppelen-knop.                 |
| `tracker-watching.png`          | Tracker in verzend-modus            | Naam+rol, grote Track-knop, status-regel, laatste coord, batterij.      |
| `tracker-driver-view.png`       | Driver view                         | Kaart met voertuigroute, loperspositie, next-change-marker, Handover.   |

## Waar nog geen screenshot van nodig is

- Planner-zijbalk zonder geselecteerde route — generiek, beetje leeg.
- Individuele foutmeldingen op de tracker — we beschrijven ze tekstueel.
- Stages-lijst onderin de planner-zijbalk — die is identiek aan eerdere
  versies en blijft alleen voor het invullen van stage-namen.
