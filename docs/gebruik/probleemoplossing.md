# Probleemoplossing

Snel-referentie voor problemen die we onderweg tegenkomen. Voor
uitgebreidere uitleg: kijk bij de relevante pagina per onderdeel.

## Viewer

### "De kaart blijft wit / leeg"

Meest waarschijnlijk heeft de Viewer geen geldige MapTiler-key. Zonder key
valt 'ie terug op de MapLibre-demo-tiles; als die ook niet beschikbaar zijn
zie je helemaal niets.

→ Systeembeheerder vragen om `VITE_MAPTILER_KEY` in de productie-`.env` te
zetten en het frontend-image opnieuw te deployen.

### "Ik zie een apparaat wel in de live-lijst, maar geen marker op de kaart"

De laatste positie van dat apparaat is waarschijnlijk ouder dan de
breadcrumb-window (60 punten). Klik op de **fly-to**-knop bij dat apparaat;
de kaart springt naar de laatst bekende positie.

### "De route heeft een rare uitstulping die niet klopt"

Dat is V3-GPX-data van Roparun — niet alle ribbels zijn correctie-lussen.
Vraag aan de route-captain of het stuk gesnipt moet worden (zie
[Planner — snip-tool](./planner.md#snip-tool)).

### "Ik zie geen concept-pill"

De route heet niet `V1/V2/V3`, of de status staat op `V4` (definitief).
Beide zijn correct gedrag.

## Planner

### "De snip-tool pakt mijn klikpunt niet"

De snip-tool snapt naar de **dichtstbijzijnde plek op de loperstrack**. Als
je klik ver van de track af zit kies je per ongeluk een andere etappe, of
zie je een onverwachte knip. Zoom iets verder in en probeer opnieuw.

### "Ik sleep een teamwissel-marker maar hij springt terug naar de route"

Dat is bedoeld gedrag. Teamwissels *moeten* op de loperstrack liggen,
anders kloppen de afstand- en ETA-berekeningen niet.

### "Mijn wijzigingen zijn weg na refresh"

Je hebt waarschijnlijk niet op **Save route** geklikt. De Planner slaat
niks automatisch op — zo kun je vrij experimenteren zonder risico.

### "De ETA van een teamwissel staat 3 uur te vroeg / laat"

Controleer in **Settings** de loopsnelheid. Als die op 15 km/u staat
terwijl je team gemiddeld 11 loopt, klopt de hele ETA-reeks niet.

## Koppelen

### "Foutmelding: Pairing token expired (410)"

De QR was ouder dan 30 minuten. Planner genereert een nieuwe.

### "Foutmelding: Pairing token already used (409)"

Iemand heeft dezelfde QR al ingewisseld (per ongeluk een oude screenshot
gescand, bijvoorbeeld). Planner genereert een nieuwe — er is altijd één QR
per apparaat.

### "Foutmelding: Unknown pairing token (404)"

Het token bestaat niet. Meestal een typefout als je de URL handmatig hebt
ingetikt — gebruik liever de QR. Als de QR deze fout geeft is er iets raar
aan de hand; contacteer de beheerder.

### "Camera scant de QR, maar niks gebeurt"

Op iOS moet je de URL-banner die bovenaan verschijnt zelf aantikken.
Android opent 'm meestal direct, maar niet altijd — dan scan opnieuw of
tik handmatig op de banner.

## Tracker

### "De marker beweegt niet op de kaart"

Negen van de tien keer is de tracker-tab in slaap. Check:

1. Staat de tracker-app nog geopend en op de voorgrond?
2. Is het scherm aan (of ligt de telefoon in zijn klemmer)?
3. Zit er een laadkabel in? (Sommige Android-toestellen pauzeren GPS bij
   laag batterijpercentage.)
4. Staat mobiele data aan, inclusief roaming voor Frankrijk/België?

Check ook de status-regel op de tracker zelf. Staat er een grote wachtrij
("Wachtrij: 140 posities"), dan is de laatste ping pas bij een nieuwe
online-moment verstuurd.

### "Batterij-percentage blijft 0% in de Viewer"

Niet alle browsers leveren dat data. Chrome Android wel, Safari iOS niet.
Dit is dus geen bug maar een beperking; de Viewer toont het dan simpelweg
niet.

### "De tracker stopt steeds met tracken"

Controleer in de browser-instellingen dat:

- Locatie-toegang voor de site op **Bij gebruik van de app** staat (niet
  **Elke keer vragen**).
- Energiebesparing voor de browser uit staat (Android).
- "Background App Refresh" aan staat voor Safari/Chrome (iOS).

### "Ik zie 'Geolocation permission denied'"

Safari / Chrome heeft geen toestemming. Op iOS: *Instellingen → Privacy
& Beveiliging → Locatievoorzieningen → Safari-websites → Bij gebruik*.
Op Android: open Chrome → drie-puntjes → *Instellingen → Site-instellingen
→ Locatie → Toestaan voor onze site*.

## Live fan-out

### "Alle markers stopten tegelijk"

Dat is meestal een herstart van de API-container, of een hick-up in het
WebSocket-kanaal. De Viewer herverbindt automatisch (exponentiële
back-off). Meestal zie je binnen 30 seconden weer bewegen.

### "Ik zie een oude positie van gisteren"

Bij het openen van de Viewer komt eerst een REST-snapshot binnen
(`GET /public/{slug}/{year}/live`). Als daar nog oude records in staan
kan een marker kort op gisteren-coördinaten verschijnen. De eerstvolgende
WebSocket-ping overschrijft 'm; duurt zelden langer dan 2 seconden.

## Waar kan ik dit ergens rapporteren?

Neem contact op via het team-kanaal op Slack/Discord, of open een issue
in de GitHub-repo (als je developer-toegang hebt). Voeg bij tracker-bugs
altijd toe: **welk model telefoon**, **welke browser + versie**, **welke
rol** en zo mogelijk een **screenshot van de tracker-status-regel**.
