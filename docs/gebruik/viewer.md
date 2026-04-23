# Viewer — de kaart bekijken

De Viewer is de openbare kaart. Iedereen met de link kan 'm openen: crew,
thuisblijvers, sponsors, supporters. Hij laat de geplande route zien én
— zodra het evenement loopt — de live-posities van alle gekoppelde
apparaten.

> Standaard-URL: `https://jouw-domein/t/conclusion/2026`. Die `conclusion`
> en `2026` zijn respectievelijk de team-slug en het jaar.

![Viewer op desktop — topbalk, route, zijbalk met lagen en live-apparaten](./img/viewer-desktop.png)

## De topbalk

De topbalk is altijd zichtbaar en bevat:

- **Logo-chip** met het Conclusion Intelligence logo (links).
- **Titel + jaar** (`Route viewer · 2026`).
- **Navigatie** — drie tabs: Viewer, Planner, Tracker. De actieve pagina
  staat met een lichtere pil-achtergrond gemarkeerd.
- **Concept-pill** — een gele badge "V3 concept" verschijnt wanneer de
  geladen route nog niet de definitieve V4 is. V4 wordt door Roparun op de
  vrijdag vóór het evenement gepubliceerd.
- **Acties** — *Share* (URL kopiëren) en *Download GPX* (de route als GPX
  downloaden, zodat je 'm op Garmin of OsmAnd kunt laden).

### Topbalk op mobiel

Op telefoons (≤ 720 px breed) is er geen plek voor alles. Logo, meta-tekst
en concept-pill verdwijnen, en de navigatie wordt een **hamburger-menu**
linksboven. Tik erop om de drie links (Viewer / Planner / Tracker) als
grote knoppen in een paneel onder de topbalk te tonen.

![Viewer op een telefoon — topbalk met hamburger, titel en Download-knop](./img/viewer-mobile.png)

![Geopend hamburger-menu op mobiel — Viewer, Planner, Tracker als grote links](./img/viewer-mobile-menu.png)

## De zijbalk — lagen en categorieën

Rechts van de kaart (of onderaan op mobiel) staat de zijbalk. Die bestaat
uit drie delen: *View as*, *Lagen & categorieën*, en *Live*.

### View as — rol-presets

Bovenaan vind je vier presets: **Lopers**, **A-voertuig**, **B-voertuig** en
**C-voertuig**. Eén klik en de kaart toont precies de lagen die voor die
rol relevant zijn:

- **Lopers** — gele loperslijn + checkpoints + wissels + waterposten +
  gevaarlijke plaatsen + onverharde passages.
- **A-voertuig** — blauwe A-route + bijhorende POI's.
- **B-voertuig** — blauwe B-route + verboden/omleiding + niet-stoppen +
  slaapplekken.
- **C-voertuig** — cyaan C-route + verboden + toiletten + milieuplaatsen.

![View-as-rij met de vier knoppen (Lopers / A / B / C)](./img/viewer-role-preset.png)

### Lagen & categorieën

Daaronder kun je handmatig lagen aan- en uitzetten. Een laag is ofwel een
**lijn-overlay** (de loperstrack of een voertuigroute) ofwel een
**categorie waypoints** (checkpoints, wissels, km-markers, …).

Standaard staan de zware puntwolken (km-markers, 24 000+ routepunten,
toegestaan/verboden voor voertuigen) **uit** omdat ze op kleine zoom-niveaus
de kaart onleesbaar maken. Schakel ze alleen aan als je ze écht nodig hebt.

![Zijbalk met lagen-lijst en toggles, één laag uitgeklapt](./img/viewer-layers.png)

### Mobiel: bottom-drawer

Op smalle schermen is de zijbalk verborgen. Tik op de **Layers**-knop om
'm als een bottom-sheet vanaf de onderkant te laten opkomen. Veeg naar
beneden of tik op de knop nogmaals om 'm weer in te klappen.

![Mobile viewer met geopende bottom-drawer](./img/viewer-mobile-drawer.png)

## Hover-popups

Beweeg met de muis over een waypoint en je ziet een popup met:

- **Naam** van het punt (bijvoorbeeld "CP12 — Arras").
- **Categorie** als ondertitel ("Checkpoint", "Waterpost bij hitteprotocol",
  "Slaapplek organisatie", …).

Op mobiel is er geen "hover" — tik kort op een punt voor dezelfde popup.

## Delen en downloaden

- **Share** kopieert de huidige URL. Eventuele query-parameters voor
  layer-toggles en zoom-niveau worden meegenomen, zodat de ontvanger
  dezelfde weergave ziet.
- **Download GPX** downloadt de volledige route als GPX-bestand. Laad
  'm in je eigen navigatie-tool (Garmin, OsmAnd, Komoot).

## Live tracking

Zodra het evenement loopt verschijnt onderin de zijbalk een sectie
**Live**. Elk gekoppeld apparaat wordt als een gekleurde stip op de kaart
getekend, met een spoor (breadcrumb) van de laatste 60 posities.

![Viewer in live-modus — posities, sporen en live-lijst in de zijbalk](./img/viewer-live.png)

### Wat staat er bij elk apparaat?

- **Naam + rol** ("Joris · Chauffeur B").
- **Batterij-percentage** zoals doorgegeven door de browser.
- **Leeftijd van de laatste positie** — staat er een oranje/rood "stale"
  streepje, dan is de laatste ping meer dan een minuut oud. Meestal betekent
  dat: telefoon offline of geen GPS-fix.
- **Fly-to**-knop — klik erop om direct naar dat apparaat op de kaart te
  vliegen.

### Hoe werkt het onder de motorkap?

De tracker-telefoon stuurt elke seconde een batchje posities naar
`/ingest`. Die worden opgeslagen in de database én direct via een
WebSocket-kanaal naar alle openstaande Viewers uitgestuurd. Zie je dus
een marker niet bewegen: dan zit het probleem aan de kant van de
tracker-telefoon (netwerk of GPS), niet in de Viewer.

## Vaakgestelde zoom-vragen

- **De kaart is wit / leeg.** Je hebt geen `VITE_MAPTILER_KEY` ingesteld
  en de demo-tiles zijn niet beschikbaar. Vraag een key aan bij de
  systeembeheerder.
- **De route is er wel, maar de gemeente-namen niet.** Dat is de
  MapLibre-demo-stijl zonder key. Zie punt hierboven.
- **Ik zie mezelf als loper niet tussen de apparaten.** Check of je wel
  echt gekoppeld bent en of de tracker-pagina op je telefoon open staat
  — de tracker stopt met verzenden zodra je hem sluit.
