# Planner — route bewerken en teamwissels plaatsen

De Planner is de werkplek voor de route-captain en de coördinatoren. Alles
wat je aanpast gaat via de Planner — de Viewer is alleen-lezen. Je bereikt
'm op `/planner`; als er meerdere routes geladen zijn kun je er één kiezen
in de zijbalk.

![Planner-overzicht — kaart, tools-kolom links, route-info en team-wissels rechts](./img/planner-desktop.png)

> De planner is bedoeld voor **desktop**. Op mobiel werkt-ie wel, maar
> teamwissels slepen en etappes snippen zijn veel nauwkeuriger met een muis
> of trackpad.

## De workflow in vogelvlucht

1. **Laad** een route (meestal de laatst geïmporteerde V3-GPX-set).
2. **Controleer** of de loperstrack correct is. Zo niet: [snip](#snip-tool)
   de foute stukken eruit.
3. **Plaats teamwissels** op de route op elk punt waar een nieuw loperteam
   instapt (ongeveer elke 4 uur).
4. **Sla op** — "Save route". De wijzigingen worden pas na opslaan bewaard.
5. **Koppel telefoons** via de [Pairing-panel](#pairing-panel-telefoons-koppelen)
   en deel de QR-code met de crew.

## Route-informatie

Bovenaan de zijbalk:

- **Routenaam** — wordt getoond in de Viewer-titel en in exports.
- **Status** — `draft` (alleen zichtbaar voor planners) of `published`
  (zichtbaar op `/t/{slug}/{year}`). Schakel pas naar `published` als de
  route definitief is.
- **Totale afstand** — berekend door de database (PostGIS) aan de hand
  van de etappe-geometrieën, niet afgeleid uit de GPX-metadata.

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

![Teamwissel-marker op de lopersroute met popover: afstand, ETA-tijd, verwijderen](./img/planner-team-changes.png)

**Zo werk je ermee:**

1. Open **Team changes** in de zijbalk. Je ziet een lijst van alle huidige
   wissels (naam + afstand + geschatte tijd).
2. Klik **+ Add team change**. Er verschijnt een oranje 👥-marker ergens op
   de loperstrack.
3. **Versleep** de marker naar de gewenste plek. Tijdens het slepen blijft
   'ie op de loperstrack geprojecteerd — je kunt niet per ongeluk naast de
   route uitkomen.
4. Geef 'm een **naam** in het naamveld ("Wissel 3 — Thoré-la-Rochette").
5. De **afstand vanaf de start** en de **geschatte aankomsttijd** worden
   automatisch berekend op basis van de loopsnelheid-instelling (zie
   hieronder).
6. Klik **Save route**.

### Loopsnelheid-instelling

In het **Settings**-paneel zet je een gemiddelde loopsnelheid in (standaard
11 km/u — het tempo dat Roparun-organisatoren rekenen). Die snelheid wordt
gebruikt om de ETA (geschatte aankomsttijd) per teamwissel te berekenen.
Pas 'm aan als jouw team traditioneel sneller of langzamer loopt, en de
ETA's worden direct bijgewerkt.

### Een teamwissel verwijderen

Klik op een bestaande 👥-marker. In de popover staat een **Remove**-knop.
Na verwijdering moet je net als bij andere wijzigingen **Save route**
aanklikken.

## Pairing-panel — telefoons koppelen

Onderin de zijbalk zit de **Pair a device**-sectie. Dit is de snelste
manier om een telefoon te koppelen: crew hoeft alleen zijn eigen naam in
te tikken; rol en team zitten al in de QR-code.

![Pairing-panel met rol-selectie, Generate-knop, QR-code en kopieerbare URL](./img/planner-pairing-panel.png)

Zie het volledige stappenplan in [Telefoon koppelen via QR](./koppelen.md).

## Opslaan en publiceren

- **Save route** slaat alle wijzigingen (snips, teamwissels, naam,
  status) in één transactie op. Alle etappes en waypoints worden volledig
  vervangen door de nieuwe lijst — er is geen delta-update. Dat is
  bewust: zo is er altijd één consistente bron van waarheid.
- Wil je iets uitproberen zonder dat de Viewer het ziet? Zet de status
  op **draft** en werk daarin. De publieke `/t/{slug}/{year}`-pagina
  toont alleen **published** routes.

## Navigatie naar de andere pagina's

De topbalk bevat links naar Viewer en Tracker. De actieve tab (Planner)
wordt met een pil gemarkeerd. Op mobiel zit de navigatie in het
hamburger-menu linksboven — zie [Viewer](./viewer.md#topbalk-op-mobiel).
