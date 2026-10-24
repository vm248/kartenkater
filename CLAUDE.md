# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev             # Dev-Server starten (http://localhost:5173)
npm run build           # Produktions-Build (Output: dist/)
npm run preview         # Build lokal vorschauen
npm run generate-icons  # PWA-Icons neu generieren (braucht sharp)
```

Kein Test-Runner vorhanden. Kein Linter konfiguriert.

## Architektur

React + TypeScript SPA mit Vite. Echtzeit-Multiplayer über Firebase Firestore. Kein clientseitiges Routing – die angezeigte Seite ergibt sich aus dem Firestore-Spielzustand (`room.status`).

### Datenfluss

```
Firestore (rooms/{code} | quadrat/{code} | circle/{code})
       ↕  onSnapshot
   App.tsx              ← hält roomId + Player-ID (localStorage)
       ↓
   Lobby.tsx / Game.tsx             ← Busfahren
   QuadratLobby / QuadratGame      ← Das Fenster
   CircleLobby  / CircleGame       ← Circle
```

`App.tsx` abonniert mit `onSnapshot` das jeweilige Raum-Dokument und reicht `room` + `playerId` nach unten. Jede Benutzeraktion ruft eine Funktion aus `*Actions.ts` auf, die direkt Firestore schreibt. Es gibt keinen lokalen State für Spiellogik – Firestore ist die einzige Source of Truth.

**Schreibzugriffe laufen über Transaktionen** (`updateRoomTx` / `joinRoomTx` / `createRoomDoc` in `src/roomUtils.ts`): Die Action liest den frischen Stand, prüft Guards (Status, wer am Zug ist, erwarteter Schritt) und gibt das Update zurück – `null` = abbrechen (Doppel-Tap, veralteter Screen), `'delete'` = Raum löschen. Spieler entfernen immer per `deleteField()` statt die ganze `players`-Map zu überschreiben.

### Wichtige Dateien

| Datei | Zweck |
|---|---|
| `src/types.ts` | TypeScript-Interfaces für Busfahren (`GameRoom`, `Player`, `Card`, …) |
| `src/gameLogic.ts` | Reine Funktionen für Busfahren (Deck, Pyramide, Tipp) |
| `src/gameActions.ts` | Firestore-Schreiboperationen für Busfahren |
| `src/quadratTypes.ts` | TypeScript-Interfaces für Das Fenster (`QuadratRoom`, …) |
| `src/quadratLogic.ts` | Spiellogik für Das Fenster |
| `src/quadratActions.ts` | Firestore-Schreiboperationen für Das Fenster |
| `src/circleTypes.ts` | TypeScript-Interfaces für Circle (`CircleRoom`, `PendingCircleAction`, …) |
| `src/circleLogic.ts` | Spiellogik für Circle (Deck, Kartenwinkel, Lückencheck, Effekte) |
| `src/circleActions.ts` | Firestore-Schreiboperationen für Circle |
| `src/App.tsx` | Firestore-Subscriptions, Dark Mode, Farbthema, Routing, Push-Notifications, Lokal-Modus-Handoff, Info-Modal, Welcome-Popup, Bottom-Bar (Fehler melden), `?dashboard`-Routing |
| `src/errorActions.ts` | `submitErrorReport()` → schreibt in Firestore `errors`-Collection |
| `src/pages/DevDashboard.tsx` | Developer-Dashboard: GitHub-Login, Stats, Räume-Liste, Fehlerberichte, Cleanup |
| `src/pages/Game.tsx` | Busfahren (phase1 → phase2start → phase2 → results → phase3 → finished) |
| `src/pages/CircleGame.tsx` | Circle-Spiel: SVG-Kreis, DaumenBar, RuleBar, Overlay (inkl. eigene Kartenregeln) |
| `src/pages/CircleLobby.tsx` | Circle-Lobby: Kurzregeln, CardRulesSection (pro Kartenwert) |
| `src/playerColors.ts` | Funktion `playerColor(order, id)` → stabile Farbe pro Spieler |
| `src/roomUtils.ts` | Transaktions-Helfer, Raumcode-Erzeugung (kollisionsfrei), `MAX_PLAYERS = 15`, `roomExpiry()` (TTL-Feld `expireAt`) |
| `src/registerSW.ts` | Service-Worker-Registrierung mit stündlichem + Sichtbarkeits-Update-Check |
| `scripts/generate-icons.js` | Generiert `public/icon-192.png` + `public/icon-512.png` via sharp |

### Spielphasen Busfahren (`room.status`)

```
lobby → phase1 → phase2start → phase2 → results → phase3 → finished → (lobby)
```

- **Gleichstand-Buttons**: Höher/Tiefer hat zusätzlich „Gleich", Innerhalb/Außerhalb zusätzlich „Auf der Grenze" (`GUESS_EQUAL` / `GUESS_BORDER` in `gameLogic.ts`, Auswertung in `evaluateHigherLower` / `evaluateInsideOutside` – gilt auch für Das Fenster). Unmögliche Optionen (z. B. „Höher" als Ass) werden ausgegraut (`impossibleHigherLower` / `impossibleInsideOutside`, Skat-Deck beginnt bei 7).
- Einstellungen werden per `clampSettings()` auf gültige Bereiche begrenzt.
- Busfahrer verlässt in `results` → neuer Busfahrer/Stechen; verlässt in `phase3` → `finished` mit `busfahrerLeft: true`.

### Spielphasen Circle (`circleRoom.status`)

```
lobby → playing → finished → (lobby)
```

- 52 Karten im Kreis, SVG-Render, Kartenwinkel werden einmalig beim Spielstart generiert
- **Kreis immer geschlossen**: `generateCardAngles()` in `circleLogic.ts` cappt max. Abstand auf 13,5° (< Kartenbreite 14,3°) und verteilt Defizit auf kleinste Abstände um
- Karte ziehen → `pendingAction` in Firestore → Overlay erscheint bei allen → Bestätigen → `confirmAction` → nächster Spieler
- **Daumen-König**: Bube ziehen setzt `daumenKingId` + `daumenKingUses=3`. `DaumenBar` ist sichtbar solange DK aktiv. Im Lokal-Modus kann jeder auf dem Gerät "Daumen benutzt" klicken (der DK wechselt ja mit dem Gerät durch alle Spieler)
- **Dame**: Setzt `lastQueenId` + `lastQueenName`; `RuleBar` zeigt Name dauerhaft im Spielbereich an
- **Eigene Kartenregeln** (Lobby): Host kann pro Kartenwert eine Freitext-Regel eintragen via `CardRulesSection` in `CircleLobby.tsx`. Gespeichert in `room.cardRules: Record<string, string>`. Keys müssen exakt zu `CardValue` passen: Zahlen als String `'2'`–`'10'`, Bildkarten als `'B'` (Bube), `'D'` (Dame), `'K'` (König), `'A'` (Ass) – **nicht** `'J'`/`'Q'`. Schreiben mit 500ms Debounce + lokalem State für sofortiges UI-Feedback.
- **Eigene Regel im Overlay**: `CircleGame.tsx` zeigt im Pending-Overlay `(room.cardRules ?? {})[String(card.value)]`. Wenn vorhanden → "Eigene Regel!"-Heading + Regeltext statt der Standard-Effekttexte.
- **Lücke**: Nur die erste Lücke zählt (`gapBroken`); `checkGap()` prüft den Winkelabstand zu den nächsten **noch liegenden** Nachbarn (> 20°)
- **Eigene Regeln**: werden roh gespeichert (pro Karte einzeln via `FieldPath('cardRules', wert)`), nur-Leerzeichen = keine Regel; immer über `customRuleFor()` lesen. Eine eigene Regel ersetzt den Standard-Effekt komplett (auch Ass-Zähler, Daumenking, Dame).
- **Host-Fallback**: Bestätigt der ziehende Spieler 20 s nicht, kann der Host „Für X weiter" tippen (`pendingAction.at`).
- Startspieler rotiert pro Runde (`startIndex`).

### Spielphasen Das Fenster (`quadratRoom.status`)

```
lobby → playing → distributing → finished → (lobby)
```

### Lokal-Modus

Alle Spiele unterstützen einen Lokal-Modus (Gerät wird herumgegeben). `App.tsx` verwaltet `localPlayerIds` + `localActiveId`, persistiert in `localStorage.kartenkater_local` (überlebt Reload / iOS-Tab-Eviction). Lokale Räume haben `isLocal: true` (kein Raumcode/Teilen, kein Beitritt von außen, beim Verlassen wird der Raum gelöscht). Spieler 1 = Geräte-ID ist Pflicht. Bei Zugwechsel erscheint ein Handoff-Screen ("Jetzt dran: [Name]") – auch fürs Stechen (jeder Kandidat) und für den Busfahrer in Phase 3. Im Lokal-Modus gelten alle als Host (`isLocalMode` prop an Game/QuadratGame/CircleGame). Im Circle-Lokal-Modus: `canUseDaumen = !!room.daumenKingId && room.daumenKingUses > 0` (kein Spieler-Check nötig).

**Busfahren Phase 1 Lokal-Fix**: `makeGuess()` schreibt `currentPlayerIndex` und `lastAction` gleichzeitig in Firestore. Ohne Fix: Handoff-Screen überblendet sofort das Kartenergebnis. Fix: `phase1HandoffReady`-State in `App.tsx` blockiert den Handoff-Screen in Phase 1 bis der Spieler explizit "Gesehen – Gerät weitergeben" klickt. `Game.tsx` bekommt `onLocalTurnDone?: () => void` als Prop und zeigt diesen Button wenn `!isMyTurn && lastAction !== null`. Zu Rundenbeginn (`lastAction == null`, z. B. nach „Nochmal spielen") greift der Handoff ohne diesen Schritt.

### Top Bar & Bottom Bar (App.tsx)

- **Top Bar**: `position: fixed`, `top: 10`, zentriert mit `left: 50%; transform: translateX(-50%)`, Breite `calc(100% - 24px)`, max `480px`, Höhe `52px`
- Flex `space-between`: Links = Farbthema-Picker, Mitte = Info-Button **oder** Home-Button, Rechts = Dark/Light-Mode
- **Mitte-Logik**: `!selectedGame && !inRoom` → Info-Button (öffnet Hilfe-Modal); sonst Home-Button (bei laufendem Spiel mit Bestätigungsdialog)
- Icons `ghost`-Style: `.icon-btn.icon-btn-ghost` (transparent, kein Border, kein Shadow)
- Farbthemen: mono, lila, ocean, forest, fire (gespeichert in `localStorage.busfahren_theme`)
- **Bottom Bar**: `position: fixed`, `bottom: 10`, gleiche Breite/Style wie Top Bar — enthält "Fehler melden"-Button; im `?dashboard`-Modus ausgeblendet
- `.game-area` hat auf Mobile `padding-top: 76px` und `padding-bottom: 80px` (für Bottom Bar)

### Info-Modal / Hilfe (App.tsx)

- Öffnet sich beim Klick auf den Info-Button. Zwei Tabs: **App installieren** (PWA-Anleitung Android/iOS) und **Multiplayer** (Schritt-für-Schritt Raumerstellen).
- Schließt per Backdrop-Klick oder X-Button.
- **Welcome-Popup**: Erscheint einmal beim ersten Besuch. `localStorage.busfahren_welcomed`. `localStorage.removeItem('busfahren_welcomed')` → wieder anzeigen.

### Fehler melden (App.tsx + errorActions.ts)

- Bottom Bar enthält "Fehler melden"-Button → öffnet Modal mit Textarea
- `submitErrorReport()` in `src/errorActions.ts` schreibt in Firestore `errors/{id}`: `{ message, playerId, gameType?, roomId?, timestamp, userAgent }`
- Firestore Rules: `errors` erlaubt create ohne Auth, read/delete nur für `isAdmin()` (UID-Check in `firestore.rules`)

### Developer Dashboard (DevDashboard.tsx)

- Erreichbar unter `/?dashboard` — App rendert dann nur das Dashboard (lazy geladen inkl. `firebase/auth`, keine Raum-Subscriptions)
- **Login**: GitHub OAuth via Firebase Auth (`signInWithPopup`). Nur `vooke.meyer@t-online.de` kommt durch, andere werden sofort ausgeloggt mit Redirect-Button zum Hauptmenü
- **Inhalt**: Stats-Grid (Räume pro Spieltyp, Spieler gesamt), Fehlerberichte-Liste (löschen einzeln/alle), Räume-Liste aller 3 Collections (löschen einzeln), Cleanup-Button (löscht finished + ≤1 Spieler)
- Firebase Auth muss in Firebase Console aktiviert sein (GitHub-Provider). Die E-Mail-Prüfung ist nur clientseitig; echte Absicherung = `isAdmin()` in `firestore.rules` (vergleicht `request.auth.uid`, UID steht im Dashboard-Header)
- Cleanup löscht nur Räume älter als 1 h (finished oder ≤ 1 Spieler)

### Firebase

`src/firebase.ts` enthält die Firestore-Konfiguration (Projekt: `kartenkater`). Collections: `rooms` (Busfahren), `quadrat` (Das Fenster), `circle` (Circle), `errors` (Fehlerberichte).

`firebase/auth` wird nur im DevDashboard (`getAuth(app)`) geladen.

**Verbindung**: `onSnapshot` mit `includeMetadataChanges` – Daten aus dem Cache zeigen nach 3 s ein Banner „Synchronisiere…“, Listener-Fehler lösen ein Resubscribe aus (`syncNonce`). Kommt die App nach > 5 s Hintergrund zurück (`visibilitychange`), wird per `disableNetwork`/`enableNetwork` neu verbunden (iOS-Safari-Fix). „Nicht mehr im Raum" wird nur aus Server-Daten abgeleitet, nie aus dem Cache.

Security Rules liegen in `firestore.rules`. **Muss manuell in der Firebase Console unter Firestore → Regeln eingespielt werden.**

### Push-Notifications

Client-seitig via Browser Notification API (`notifyTurn()` in `App.tsx`, bevorzugt über `serviceWorker.showNotification`, da Android Chrome `new Notification()` verbietet; komplett in try/catch, da iOS-Safari ohne PWA keine `Notification` kennt). Wird ausgelöst, wenn der eigene Spieler handeln muss (dran, Stechen, Busfahrer, Host-Pyramidenwahl, Fenster-Verteilen) und `document.hidden || !document.hasFocus()`. Nur im Multiplayer (nicht Lokal-Modus).

### Karten-Animation (Circle)

`@keyframes cardFlyUp` in `index.css`: Die Karte im Pending-Overlay fliegt von unten herein (`translateY(40px) scale(0.72) → translateY(0) scale(1)`), `animation: cardFlyUp 0.42s cubic-bezier(0.34,1.56,0.64,1) both`

### Spieler-Identität

`playerId` wird beim ersten Besuch per `crypto.randomUUID()` generiert und in `localStorage` (`busfahren_pid`) gespeichert. `localStorage` merkt sich auch die aktuelle Raum-ID (`busfahren_room` / `quadrat_room` / `circle_room`). Kein Auth-System. Lokal testen mit zwei Spielern: zweiter Tab auf `http://p2.localhost:5173` (eigener localStorage).


### PWA / Icons

- `public/icon-192.png` + `public/icon-512.png`: Zwei überlappende Spielkarten (Ass Herz outline + Ass Pik filled) auf schwarzem Hintergrund (#111111, rx=88)
- Generiert via `npm run generate-icons` → führt `scripts/generate-icons.js` aus (benötigt `sharp` als devDependency)
- `vite.config.ts`: `theme_color: '#111111'`, `background_color: '#111111'` (Mono-Theme)
- Nach `npm run build` ist die App als PWA installierbar
- Schrift Space Grotesk ist selbst gehostet (`@fontsource/space-grotesk`, nur latin-Subset) – kein Google-Fonts-Request

### Styling

Kein CSS-Framework. Globale CSS Custom Properties in `src/index.css` für Light/Dark Mode (`--bg`, `--card`, `--primary`, `--accent`, …). Dark Mode per `body.dark`. Farbthemen per `body.theme-ocean` etc. Das Theme-Script in `index.html` steht im `<body>` (im `<head>` ist `document.body` null), Default-Theme `mono`.
- `.turn-banner`: großes „Du bist dran"-Banner (Busfahren, Circle)
- `.icon-btn`: `width: 40px; height: 40px; padding: 0` → auf Mobile `44px` (Touch-Target-Richtlinie)
- `.icon-btn.icon-btn-ghost`: transparenter Stil für Top-Bar-Buttons
- `button` global: `touch-action: manipulation; -webkit-tap-highlight-color: transparent` (kein iOS-Tap-Blink, kein 300ms-Delay)
- `@keyframes cardFlyUp` für Circle-Karten-Animation

## Offene Punkte / Ideen (Stand 2026-06-24)

- [x] **Circle: Eigene Kartenregeln im Spiel anzeigen** – erledigt
- [x] **Fehler melden** – erledigt: Bottom Bar + Modal + Firestore `errors`-Collection
- [x] **Hilfe-Modal Multiplayer-Tab** – erledigt
- [x] **Developer Dashboard** – erledigt: `/?dashboard`, GitHub Auth, Stats, Räume, Fehlerberichte, Cleanup
- [ ] **Firestore Security Rules deployen**: nach jeder Änderung manuell in Firebase Console einspielen (Firestore → Regeln → Veröffentlichen)
- [ ] **Offline-Modus** (explizit zurückgestellt): Service Worker cacht nur Assets, keine Offline-Spiellogik
- [ ] **Raum-Sicherheit** (bewusst zurückgestellt, Stand 2026-10-03): Rules erlauben jedem, alle Räume aufzulisten (inkl. Deck) und zu überschreiben; `errors` ohne Feld-/Größenlimits. Optionen: Rules härten oder Anonymous Auth
- [ ] **Firestore TTL-Policy** auf Feld `expireAt` für `rooms`, `quadrat`, `circle` anlegen – danach kann das Client-Cleanup (`cleanupOld*Rooms`) entfallen
