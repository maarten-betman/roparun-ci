# Tracker PWA — live positie sturen

De Tracker is de app die je telefoon (of tablet) in de bus laat draaien.
Hij leest je GPS uit en stuurt batchjes posities naar de server, die ze
direct doorzet naar alle openstaande Viewers.

## Installeren als web-app (PWA)

De Tracker is een **Progressive Web App**: geen App Store nodig, maar je
kunt 'm wel als app met eigen icoon op je home-screen zetten.

### iPhone / iPad (Safari)

1. Open de Tracker-URL in Safari (**niet** Chrome — PWA-installatie
   werkt alleen via Safari op iOS).
2. Tik op het deel-icoon onderaan (vierkantje met pijl).
3. Scroll en kies **Zet op beginscherm** (*Add to Home Screen*).
4. Geef 'm een naam ("Roparun Tracker") en tik **Voeg toe**.

### Android (Chrome)

1. Open de Tracker-URL in Chrome.
2. Tik op het drie-puntjes-menu rechtsboven.
3. Kies **App installeren** (*Install app*). Soms heet 't *Toevoegen aan
   beginscherm*.
4. Bevestig.

Vanaf nu start de Tracker als een gewone app zonder adresbalk en
browser-UI. Dat geeft je telefoon iets meer beeldruimte en het voelt
minder als "een tab die zomaar kan dichtvallen".

## Het tracker-scherm

Na koppeling (zie [Telefoon koppelen via QR](./koppelen.md)) land je op
een scherm dat afhangt van je rol.

![Tracker in track-modus op een crew-telefoon — naam, laatste positie, accu, verzenden-status](./img/tracker-watching.png)

Wat je ziet:

- **Naam + rol** — ter bevestiging dat je op de juiste koppeling zit.
- **Track-knop** — groot, centraal. Tik 'm om te starten / stoppen.
- **Status-regel** — "Laatst verstuurd: 3 s geleden" of "Wachtrij: 14
  posities (geen verbinding)".
- **Laatste coördinaat + nauwkeurigheid** — in meters. Onder de 15 m is
  een normale outdoor-fix. Boven de 50 m zit je waarschijnlijk in een
  tunnel of tussen hoogbouw; de Viewer springt dan wat rond.
- **Batterij-percentage** — wordt meegestuurd zodat de Viewer-zijbalk
  het toont.

## Chauffeur-weergave (Driver view)

Als je bij de koppeling rol **Driver** hebt gekozen, krijg je een
uitgebreidere weergave met een kaart, een *Handover*-knop en een
**volgende-wissel-marker** die laat zien waar het eerstvolgende grote
wisselpunt ligt.

![Driver view — kaart met voertuigroute, loperspositie, volgende-wissel-marker en Handover-knop](./img/tracker-driver-view.png)

- **Next change** markeert automatisch de volgende teamwissel vóór je
  huidige positie. Handig om te checken of je op tijd bent.
- **Handover**-knop registreert dat je bij een wissel bent — dat verschijnt
  als *change-event* in de Viewer en de planner-zijbalk, zodat iedereen
  weet dat de wissel daadwerkelijk is uitgevoerd.

## Tijdens rijden / lopen

- **Scherm aan**. Veel browsers pauzeren de GPS zodra je het scherm
  vergrendelt. Plak de telefoon met een houder ergens in zicht en zet 'm
  op maximum scherm-time-out. iPad in de bus? Standaard in een dockje,
  lader erbij.
- **Laadkabel erin**. Continu GPS eet een telefoon in 6–8 uur leeg.
- **Mobiele data aan** en roaming in FR/BE niet uitgeschakeld. De
  Tracker werkt pas weer zodra je online komt (zie hieronder).

## Geen verbinding? Geen probleem

Ben je tussen twee 4G-masten in het Franse platteland en heb je geen
data? De Tracker blijft posities verzamelen en bewaart ze lokaal in je
browser (*localStorage*). Zodra je weer online bent, stuurt hij
automatisch alles door.

**Zichtbaar op het scherm:**

- "Wachtrij: 34 posities" betekent dat er nog 34 ongeaccepteerde metingen
  klaarstaan.
- De wachtrij wordt ook geflushed wanneer je de app weer **naar voren**
  haalt (visibilitychange-event).

**Beperkingen** (Phase 3 v1):

- De wachtrij overleeft het sluiten van de Tracker-tab alleen als je
  'm niet wipet (anders is localStorage leeg).
- Pure achtergrondverzending (Background Sync) zit nog niet in de PWA.
  Dat betekent: de app moet open staan om te verzenden. Sluit 'm dus
  niet tussendoor. Deze beperking komt te vervallen in een volgende
  fase (3.5 achtergrond-queue).

## Privacy

- Je positie is **alleen** zichtbaar op de Viewer van het evenement,
  niet publiek indexeerbaar.
- Als je pauzeert of de rol afgeeft, tik op **Stop tracking**. Dat stopt
  de GPS-loop direct. Sluit de tab pas daarna.
- Wil je de koppeling permanent ongedaan maken? Vraag de beheerder om
  de device-entry te verwijderen (of wacht tot na het evenement — dan
  worden alle apparaten opgeschoond).

## Problemen?

Zie [Probleemoplossing](./probleemoplossing.md). De meest voorkomende
is "marker beweegt niet in de Viewer" — 9 van de 10 keer is de
tracker-tab dichtgevallen of is het scherm in slaap.
