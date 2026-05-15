# Planner — route bewerken en teamwissels plaatsen

De Planner is de werkplek voor de route-captain en de coördinatoren. Alles
wat je aanpast gaat via de Planner — de Viewer is alleen-lezen. Je bereikt
'm op `/planner`; als er meerdere routes geladen zijn kun je er één kiezen
in de zijbalk.

![Planner-overzicht — kaart, tools-zijbalk links, tijdlijn onder de kaart](./img/planner-desktop.png)

> De planner is bedoeld voor **desktop**. Op mobiel werkt hij ook (zie
> [Mobiel: het Tools-paneel](#mobiel-het-tools-paneel)), maar teamwissels
> slepen en etappes snippen zijn veel nauwkeuriger met een muis of
> trackpad.

## De workflow in vogelvlucht

1. **Laad** een route (meestal de laatst geïmporteerde V3-GPX-set).
2. **Stel pace en starttijd in** ([Pace & start](#pace--start)). Zonder
   starttijd zie je relatieve tijden ("3h 24m"); met starttijd echte
   klok-tijden ("za 18:24").
3. **Controleer** de loperstrack. Zo niet: [snip](#snip-tool) de foute
   stukken eruit.
4. **Plaats teamwissels** op de plekken waar een nieuw loperteam instapt
   (≈ elke 4 uur), met eventueel een **time-offset** per wissel om
   verwachte vertraging mee te nemen.
5. Bekijk de **[tijdlijn](#tijdlijn-onder-de-kaart)** onder de kaart en
   ga met de muis langs om te zien waar je op welk moment bent.
6. **Sla op** — "Save route".
7. **Koppel telefoons** via de
   [Pairing-panel](#pairing-panel-telefoons-koppelen).

## Wat je op de kaart ziet

De planner toont **alleen de loperstrack** — geen voertuigroutes, geen
POI-puntwolken. Doel: de drag-handvatten van de teamwissels en de
snip-tool blijven goed klikbaar en de kaart blijft overzichtelijk. Wil
je de volledige set lagen zien? Open de Viewer in een ander tabblad
(via het **Hulp/Viewer**-menu rechtsboven).

## Route-informatie

Bovenaan de zijbalk:

- **Routenaam** — wordt getoond in de Viewer-titel en in exports.
- **Status** — `draft` (alleen zichtbaar voor planners) of `published`
  (zichtbaar op `/t/{slug}/{year}`). Schakel pas naar `published` als de
  route definitief is.
- **Totale afstand** — berekend door de database (PostGIS) aan de hand
  van de etappe-geometrieën, niet afgeleid uit de GPX-metadata.

## Pace & start

![Pace-veld (min/km) en datetime-veld voor starttijd in de Planner-zijbalk](./img/planner-pace-start.png)

Twee instellingen die samen de tijden van élke teamwissel én de
tijdlijn aansturen:

- **Pace** — in **min/km** (bijvoorbeeld `5:30`). Je kunt typen als
  `MM:SS` met een dubbele punt, of als decimaal (`5.5` = 5:30). Standaard
  staat-ie op `5:00` (≈ 12 km/u), het tempo dat Roparun voor relay-teams
  hanteert. Onder het veld zie je de omgerekende km/u ter controle.
- **Starttijd** — datum + tijd-veld. Standaard `2026-05-23 15:00` (de
  officiële Roparun 2026-start, Whit-zaterdag). Maak het veld leeg om
  alle tijden als relatieve offset (`3h 24m`) te zien in plaats van als
  klok-tijd.

Beide instellingen worden in je browser (`localStorage`) opgeslagen,
dus ze blijven bewaard tussen sessies.

## Snip-tool

Roparun publiceert de officiële loperstrack soms met kleine afwijkingen
(omrijd-lussen, testsporen die in V3 nog niet gecorrigeerd zijn). Met de
**snip-tool** knip je een stuk loperstrack weg en rijg je de twee uiteinden
automatisch aan elkaar.

![Snip-tool actief — eerste en tweede kappunt zichtbaar, uit te knippen deel rood](./img/planner-snip.png)

**Zo werk je ermee:**

1. Klik in de tools-kolom op **Snip**.
2. Klik op het **eerste punt** waar je wilt knippen — de dichtstbijzijnde
   plek op de loperstrack wordt gevonden (geïnterpoleerd, dus niet per se
   een originele vertex).
3. Klik op het **tweede punt**. Het stuk daartussen wordt rood getoond.
4. Controleer visueel dat je het juiste stuk eruit snijdt.
5. Klik **Apply**. De twee uiteinden worden aan elkaar gerijgd; de
   etappe-lijst in de zijbalk wordt bijgewerkt.
6. Klik **Save route** om de wijziging in de database op te slaan.

**Ongedaan maken**: klik op **Cancel** voordat je **Apply** klikt. Na
**Apply** is ongedaan-maken alleen mogelijk door een nieuwe versie van de
originele GPX te laden.

## Teamwissels plaatsen

Tijdens een Roparun wisselt ongeveer elke 4 uur een nieuw lopersteam in.
Die wissels wil je vooraf vastleggen zodat de chauffeurs en medics weten
waar ze de volgende uitwissel-auto moeten parkeren.

![Teamwissel-rij in de zijbalk met cumulatieve km, leg-km, ETA en offset-stepper](./img/planner-team-change-row.png)

**Zo werk je ermee:**

1. Open **Team changes** in de zijbalk. Bij een verse route worden er
   automatisch wissels geplaatst op interval van ≈ 4 uur loopsnelheid
   (gebaseerd op je pace). Je kunt ze daarna naar smaak verschuiven.
2. Klik **+ Add** om er eentje toe te voegen tussen de bestaande in.
3. **Versleep** de 👥-marker op de kaart naar de gewenste plek. Tijdens
   het slepen blijft 'ie op de loperstrack geprojecteerd — je kunt niet
   per ongeluk naast de route uitkomen.
4. **Hover** over de marker op de kaart: een tooltip toont naam, km
   vanaf start, leg-afstand en ETA. Dezelfde info staat in de zijbalk.
5. Geef 'm een **naam** in het naamveld ("Wissel 3 — Thoré-la-Rochette").
6. Stel eventueel een **offset** in (zie hieronder).
7. Klik **Save route**.

### Wat staat er op elke rij?

```
#3 · km 124.7 (+18.2 km) · za 22:14 (+15m cumulatief)
Naam: Wissel 3 — Thoré-la-Rochette
Offset:  [−]  +15  [+]  min
```

- **#3** — volgnummer langs de route.
- **km 124.7** — afstand vanaf de start.
- **(+18.2 km)** — de leg die het zojuist-eindigende team gelopen heeft
  (afstand sinds de vorige wissel).
- **za 22:14** — verwachte tijd (gebruikt pace + starttijd + cumulatieve
  offset, zie hieronder).
- **(+15m cumulatief)** — totale vertraging die de eerdere etappes hier
  hebben opgebouwd.
- **Naam** — labelt deze wissel in de Viewer en op de QR-koppeling.

### Time-offset per wissel — vertraging laten doortikken

Loopt team #1 vijftien minuten over? Tik **+** drie keer (3 × 5 = 15
min) op de eerste rij. Vanaf dat moment schuift élke wissel daarna
**vijftien minuten op**, plus eventuele eigen offsets daarna. De
slot-etappe-tijd schuift dus ook mee.

- **Klein streepje rechtsonderaan elke rij**: `−`/`+`-stepper met stap
  5 min, of typ een getal direct in het veld (max ±600 min).
- Negatieve waarde = wissel ligt vóór de pace-gebaseerde tijd ("we
  liggen voor op schema").
- **Cumulatief vs deze etappe**: het kleine label naast de tijd op
  elke rij maakt onderscheid:
  - `(+15m deze etappe)` — vertraging die op deze leg is opgelopen.
  - `(+15m cumulatief)` — som van alle eerdere offsets die hier
    binnenkomt.

> Belangrijk: offsets worden in de database opgeslagen (in het
> `notes`-veld van het waypoint), dus ze blijven na opslaan en
> herladen bewaard. Een co-planner ziet jouw offsets ook.

### Slotetappe (final leg)

Onder de lijst staat een gestreepte rij **Slotetappe — finish** die
laat zien hoeveel km het laatste team nog loopt vanaf de laatste
wissel tot de eindstreep, plus de verwachte finish-tijd (met
totaal-offset).

### Een teamwissel verwijderen

Klik op het **×**-knopje rechts in de rij (of de **×** in de popover
op de marker). Na verwijdering moet je net als bij andere wijzigingen
**Save route** aanklikken.

## Tijdlijn onder de kaart

![Tijdlijn — tijd-as bovenaan, rose-rode pips voor wissels, blauwe cursor met tooltip onder muis](./img/planner-timeline.png)

Onder de kaart loopt een **tijdlijn** die de hele loperstrack
representeert. Functies:

- **Tijd-as bovenaan** — labels die meegroeien met de breedte. Op
  desktop zie je elke 2–3 uur een label ("za 18:00"); op mobiel zakt
  het naar bijvoorbeeld elke 12 uur zodat ze niet over elkaar vallen.
- **Rose-rode bolletjes** — élke teamwissel als pip op zijn relatieve
  positie.
- **Hover** ergens op de balk → een blauwe verticale cursor + tooltip
  met km en tijd, en gelijktijdig **een blauwe stip op de kaart** op
  de bijbehorende plek op de loperstrack. Handig om vooraf te zien
  "waar zijn we ergens om 04:00 's nachts?".
- **Cumulatieve offset** wordt in de tooltip getoond als die niet 0
  is, dus je weet meteen of de tijd al opgelopen vertraging in zich
  draagt.

## Mobiel: het Tools-paneel

Op smalle schermen (≤ 720 px) verdwijnt de vaste zijbalk en wordt-ie
een drawer.

![Planner op mobiel — drawer geopend over de kaart, ≡ Tools-knop in de topbalk](./img/planner-mobile-drawer.png)

- Rechtsboven in de topbalk verschijnt een **≡ Tools**-knop. Tik erop
  om de zijbalk als overlay te openen.
- Sluit met **✕ Sluiten** bovenin de drawer, een tik op de
  donkere achtergrond, of de **Escape**-toets op een toetsenbord.
- Bij het draaien naar landscape (boven 720 px) gaat de drawer
  automatisch open zodat-ie niet "vast" zit achter de schermrand.

Verder werkt alles hetzelfde: kaart, tijdlijn, teamwissel-markers en
hun popovers blijven volledig functioneel.

## Pairing-panel — telefoons koppelen

Onderin de zijbalk zit de **Pair a device**-sectie. Dit is de snelste
manier om een telefoon te koppelen: crew hoeft alleen zijn eigen naam in
te tikken; rol en team zitten al in de QR-code.

![Pairing-panel met rol-selectie, Generate-knop, QR-code en kopieerbare URL](./img/planner-pairing-panel.png)

Zie het volledige stappenplan in [Telefoon koppelen via QR](./koppelen.md).

## Opslaan en publiceren

- **Save route** slaat alle wijzigingen (snips, teamwissels,
  offsets, naam, status) in één transactie op. Alle etappes en
  waypoints worden volledig vervangen door de nieuwe lijst — er is
  geen delta-update. Dat is bewust: zo is er altijd één consistente
  bron van waarheid.
- Wil je iets uitproberen zonder dat de Viewer het ziet? Zet de status
  op **draft** en werk daarin. De publieke `/t/{slug}/{year}`-pagina
  toont alleen **published** routes.
- Pace en starttijd zijn **planner-lokaal** (browser `localStorage`)
  en gaan niet naar de server. Offsets per wissel zijn dat wél, via
  het `notes`-veld van het waypoint.

## Navigatie naar de andere pagina's

De topbalk bevat links naar Viewer, Tracker en Hulp. De actieve tab
(Planner) wordt met een pil gemarkeerd. Op mobiel zit de navigatie in
het hamburger-menu linksboven — zie [Viewer](./viewer.md#topbalk-op-mobiel).
