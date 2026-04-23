# Telefoon koppelen via QR

De snelste manier om een telefoon aan een crew-lid te koppelen is de
**QR-koppelflow**. De planner maakt een eenmalige link; de crew scant
'm, tikt zijn naam in, klaar. Rol, team en event zitten al in de code.

> Hand-invoer (naam + rol + team + jaar) blijft als noodoplossing bestaan,
> maar probeer eerst altijd de QR-flow — die is sneller en foutloos.

## Planner-kant: QR maken

1. Open de **Planner** (`/planner`). Je hebt geen inlog nodig (in de
   huidige Phase 3.5 is auth nog niet ingebouwd).
2. Scroll in de rechterzijbalk naar **Pair a device**.
3. Kies de **rol** van de telefoon (Runner, Cyclist, Driver).
4. Klik **Generate link**. Er verschijnt:
   - een **QR-code** van ongeveer 2×2 cm,
   - een **kopieerbare URL** met formaat `/tracker.html?pair=<token>`,
   - een **aftel-timer** die laat zien hoeveel tijd het token nog geldig
     is (standaard 30 minuten).

![Planner met geopend Pairing-panel — QR-code, URL, aftel-timer, Regenerate-knop](./img/planner-pairing-panel.png)

5. **Hand de QR aan de crew**. Opties:
   - Laat 'm je planner-scherm scannen. Dat is verreweg het snelst.
   - Stuur de URL via WhatsApp / SMS / mail als de persoon niet bij je is.
   - Druk de QR af (of maak een screenshot) en leg 'm op de bus-bar.

6. Klik **Regenerate** om een nieuwe QR te maken. De oude blijft technisch
   gezien geldig tot de TTL verloopt, maar hij is uit je scherm verdwenen;
   handel dus op basis van de QR die je crew daadwerkelijk ziet.

### Belangrijk over geldigheid

- **Eén gebruik.** Zodra een telefoon het token inwisselt, kan niemand
  anders dezelfde link nog gebruiken. Nieuwe telefoon? Nieuwe QR.
- **30 minuten.** Na 30 minuten werkt de link niet meer. Genereer 'm
  opnieuw als de crew later arriveert.
- **Geen auth.** De QR geeft direct toegang tot een apparaat-token met
  rechten om posities te sturen. Behandel 'm dus als een éénmalig
  wachtwoord — niet op sociale media plaatsen.

## Telefoon-kant: QR scannen

### Stap 1 — Open de link

Scan de QR met de camera-app van je telefoon (iOS Camera of Google Lens).
Er verschijnt een banner met de URL; tik erop om Safari of Chrome te
openen. Je komt op `https://.../tracker.html?pair=<token>`.

De Tracker ziet het token in de URL, haalt 'm uit de adresbalk (zodat je
'm niet per ongeluk deelt), en wisselt 'm op de achtergrond in voor een
permanent apparaat-token.

### Stap 2 — Typ je naam

Je krijgt een minimalistisch formulier met precies één veld: **Naam**.
Dit is wat op de Viewer-kaart komt te staan. Gebruik je roepnaam.

![Tracker op telefoon, direct na scan — alleen het naam-veld zichtbaar](./img/tracker-pair-form.png)

Tik **Koppelen**. Het apparaat wordt in de database aangemaakt; je wordt
doorgestuurd naar het tracker-scherm voor jouw rol.

### Stap 3 — GPS-toestemming

De browser vraagt of de pagina je locatie mag gebruiken. Tik **Toestaan**.
Zonder die toestemming kan de Tracker niks versturen.

> **iPad / iOS**: zet daarbij op systeemniveau de locatie-toegang voor
> Safari op *Bij gebruik van de app* (niet *Alleen vragen*). Anders wordt
> je positie niet gedeeld zodra je naar een andere tab of app switcht.

### Stap 4 — Tracken

Vanaf nu stuurt je telefoon elke seconde een positie-update zolang het
Tracker-scherm open staat. Zie [Tracker PWA](./tracker.md) voor hoe je
het installeert als app, wat het tijdens rijden op het scherm toont, en
hoe je omgaat met slechte dekking.

## Foutmeldingen

| Melding op de telefoon       | Betekenis                                    | Wat te doen                            |
| ---------------------------- | -------------------------------------------- | -------------------------------------- |
| *Pairing token expired* 410  | Token was ouder dan 30 minuten               | Vraag de planner om **Regenerate**     |
| *Pairing token already used* | De link is al door iemand anders ingewisseld | Nieuwe QR laten maken                  |
| *Unknown pairing token* 404  | Token bestaat niet (typefout of vervalst)    | Nieuwe QR scannen, niet typen          |
| *Device registration failed* | Server niet bereikbaar                       | Controleer je dataverbinding           |

## Verliest je telefoon het token?

Het apparaat-token zit in de *localStorage* van je browser. Als iemand
zijn browsergeschiedenis wist of incognito-modus gebruikt, is het token
weg. In dat geval:

1. Ga naar de planner.
2. Maak een nieuwe koppel-link voor dezelfde rol.
3. Scan 'm opnieuw.

De oude apparaat-entry blijft in de database bestaan — dat geeft geen
problemen, alleen een extra regel in de Live-lijst tot de sessie is
afgelopen.
