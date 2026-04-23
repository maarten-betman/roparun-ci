# Gebruikershandleiding

Deze map bevat de Nederlandstalige handleiding voor het Conclusion
Intelligence Roparun-platform. De handleiding is bedoeld voor **crew-leden**
die de applicatie tijdens de voorbereiding en het evenement gebruiken —
lopers, fietsers, chauffeurs, medics, cateraars, road captains en planners.
Developers vinden technische informatie in `/CLAUDE.md` en `/README.md`.

## Wat is het platform?

Het platform bestaat uit drie onderdelen die hetzelfde adres delen:

| Onderdeel | URL-pad            | Wie gebruikt het                    |
| --------- | ------------------ | ----------------------------------- |
| Viewer    | `/` of `/t/...`    | Iedereen — openbare kaart + live    |
| Planner   | `/planner`         | Route-captains en coördinatoren     |
| Tracker   | `/tracker.html`    | Crew-leden op de weg (telefoon)     |

Je schakelt tussen de drie via de navigatie in de topbalk (op mobiel via het
hamburger-menu — zie het drie-streepjes icoon linksboven).

## Inhoud

1. [Viewer — de kaart bekijken](./viewer.md)
2. [Planner — route bewerken en teamwissels plaatsen](./planner.md)
3. [Telefoon koppelen via QR](./koppelen.md)
4. [Tracker PWA — live positie sturen](./tracker.md)
5. [Probleemoplossing](./probleemoplossing.md)

## Een paar begrippen vooraf

- **Route** — de volledige Parijs → Rotterdam route van een editie.
- **Etappe** (stage) — een stuk van de route. Lopersetappes zijn gele lijnen;
  ploegautoetappes A / B / C hebben hun eigen kleur.
- **Waypoint** — een losse punt op of naast de route (checkpoint, wissel,
  waterpost, gevaar, slaapplek, …).
- **Teamwissel** — het moment waarop een nieuw loperteam het stokje
  overneemt. In de planner worden die als oranje 👥-markers op de lopersroute
  weergegeven.
- **Apparaat** (device) — een telefoon of tablet die via een persoonlijk
  token aan een crew-lid gekoppeld is en live posities stuurt.
- **Koppeltoken** (pairing token) — eenmalige link (30 minuten geldig) die
  een planner maakt om een telefoon zonder handmatig typen te koppelen.

## Tips voor crew-leden in de bus

- Installeer de **Tracker** als web-app op je telefoon (zie
  [Tracker PWA](./tracker.md)) — dan heb je 'm als een gewone app terug.
- Laat je telefoon aan de lader hangen zodra je gaat tracken. Continu GPS
  eet een volle accu in 6–8 uur leeg.
- Ga pas tracken **nadat** je gekoppeld bent. Tracken zonder koppeling
  verstuurt niets en vult alleen je batterij-logje.

## Screenshots nog toe te voegen

De handleiding verwijst naar afbeeldingen in `./img/` die nog gemaakt
moeten worden. Zie [img/README.md](./img/README.md) voor de complete
lijst met bestandsnamen, beschrijvingen en waar ze geplaatst worden.
