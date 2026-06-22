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
| `src/App.tsx` | Firestore-Subscriptions, Dark Mode, Farbthema, Routing, Push-Notifications, Lokal-Modus-Handoff, Info-Modal, Welcome-Popup |
| `src/pages/Game.tsx` | Busfahren (phase1 → phase2start → phase2 → results → phase3 → finished) |
| `src/pages/CircleGame.tsx` | Circle-Spiel: SVG-Kreis, DaumenBar, RuleBar, Overlay (inkl. eigene Kartenregeln) |
| `src/pages/CircleLobby.tsx` | Circle-Lobby: Kurzregeln, CardRulesSection (pro Kartenwert) |
| `src/playerColors.ts` | Funktion `playerColor(order, id)` → stabile Farbe pro Spieler |
| `scripts/generate-icons.js` | Generiert `public/icon-192.png` + `public/icon-512.png` via sharp |

### Spielphasen Busfahren (`room.status`)

```
lobby → phase1 → phase2start → phase2 → results → phase3 → finished → (lobby)
```

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
- **Lücke**: Nur die erste Lücke zählt (`gapBroken`); `checkGap()` prüft ob gezogene Karte einen Winkelabstand > 20° zu Nachbarn hat

### Spielphasen Das Fenster (`quadratRoom.status`)

```
lobby → playing → distributing → finished → (lobby)
```

### Lokal-Modus

Alle Spiele unterstützen einen Lokal-Modus (Gerät wird herumgegeben). `App.tsx` verwaltet `localPlayerIds` + `localActiveId`. Bei Zugwechsel erscheint ein Handoff-Screen ("Jetzt dran: [Name]"). Im Circle-Lokal-Modus: `isLocalMode` prop → `canUseDaumen = !!room.daumenKingId && room.daumenKingUses > 0` (kein Spieler-Check nötig).

**Busfahren Phase 1 Lokal-Fix**: `makeGuess()` schreibt `currentPlayerIndex` und `lastAction` gleichzeitig in Firestore. Ohne Fix: Handoff-Screen überblendet sofort das Kartenergebnis. Fix: `phase1HandoffReady`-State in `App.tsx` blockiert den Handoff-Screen in Phase 1 bis der Spieler explizit "Gesehen – Gerät weitergeben" klickt. `Game.tsx` bekommt `onLocalTurnDone?: () => void` als Prop und zeigt diesen Button wenn `!isMyTurn && lastAction !== null`.

### Top Bar (App.tsx)

- `position: fixed`, `top: 10`, zentriert mit `left: 50%; transform: translateX(-50%)`
- Breite: `calc(100% - 24px)`, max `480px`, Höhe `52px`
- Flex `space-between`: Links = Farbthema-Picker, Mitte = Info-Button **oder** Home-Button, Rechts = Dark/Light-Mode
- **Mitte-Logik**: `!selectedGame && !inRoom` → Info-Button (öffnet PWA-Installationsanleitung); sonst Home-Button (wenn in Spiel/Raum)
- Icons `ghost`-Style: `.icon-btn.icon-btn-ghost` (transparent, kein Border, kein Shadow)
- Icons: `size={20}`, Touch-Target auf Mobile: `.icon-btn { width: 44px; height: 44px }` via `@media (max-width: 480px)`
- Farbthemen: mono, lila, ocean, forest, fire (gespeichert in `localStorage.busfahren_theme`)
- `.game-area` hat auf Mobile `padding-top: 76px`, auf Desktop läuft über `#root { padding: 70px 0 4rem }`

### Info-Modal & Welcome-Popup (App.tsx)

- **Info-Modal**: Öffnet sich beim Klick auf den Info-Button in der Top-Bar. Zeigt Schritt-für-Schritt-Anleitung für PWA-Installation auf Android (Chrome) und iOS (Safari). Schließt per Backdrop-Klick oder X-Button.
- **Welcome-Popup**: Erscheint genau einmal beim ersten Besuch. Gespeichert in `localStorage.busfahren_welcomed`. Zeigt App-Beschreibung + Hinweis auf den Info-Button mit inline-SVG-Logo (zwei Spielkarten). `localStorage.removeItem('busfahren_welcomed')` → Popup erscheint wieder (zum Testen).

### Push-Notifications

Client-seitig via Browser Notification API. Wird ausgelöst wenn Firestore-Update zeigt, dass der eigene Spieler dran ist und `document.hidden || !document.hasFocus()`. Nur im Multiplayer (nicht Lokal-Modus).

### Karten-Animation (Circle)

`@keyframes cardFlyUp` in `index.css`: Die Karte im Pending-Overlay fliegt von unten herein (`translateY(40px) scale(0.72) → translateY(0) scale(1)`), `animation: cardFlyUp 0.42s cubic-bezier(0.34,1.56,0.64,1) both`

### Spieler-Identität

`playerId` wird beim ersten Besuch per `crypto.randomUUID()` generiert und in `localStorage` (`busfahren_pid`) gespeichert. `sessionStorage` merkt sich die aktuelle `roomId`. Kein Auth-System.

### Firebase

`src/firebase.ts` enthält die Firestore-Konfiguration. Collections: `rooms` (Busfahren), `quadrat` (Das Fenster), `circle` (Circle).

Security Rules liegen in `firestore.rules`. **Muss manuell in der Firebase Console unter Firestore → Regeln eingespielt werden** (nicht automatisch deployed). Alle drei Collections (`rooms`, `quadrat`, `circle`) sind abgedeckt mit Struktur-Validierung auf create/update.

### PWA / Icons

- `public/icon-192.png` + `public/icon-512.png`: Zwei überlappende Spielkarten (Ass Herz outline + Ass Pik filled) auf schwarzem Hintergrund (#111111, rx=88)
- Generiert via `npm run generate-icons` → führt `scripts/generate-icons.js` aus (benötigt `sharp` als devDependency)
- `vite.config.ts`: `theme_color: '#111111'`, `background_color: '#111111'` (Mono-Theme)
- Nach `npm run build` ist die App als PWA installierbar

### Styling

Kein CSS-Framework. Globale CSS Custom Properties in `src/index.css` für Light/Dark Mode (`--bg`, `--card`, `--primary`, `--accent`, …). Dark Mode per `body.dark`. Farbthemen per `body.theme-ocean` etc.
- `.icon-btn`: `width: 40px; height: 40px; padding: 0` → auf Mobile `44px` (Touch-Target-Richtlinie)
- `.icon-btn.icon-btn-ghost`: transparenter Stil für Top-Bar-Buttons
- `button` global: `touch-action: manipulation; -webkit-tap-highlight-color: transparent` (kein iOS-Tap-Blink, kein 300ms-Delay)
- `@keyframes cardFlyUp` für Circle-Karten-Animation

## Offene Punkte / Ideen (Stand 2026-06-22)

- [x] **Circle: Eigene Kartenregeln im Spiel anzeigen** – erledigt: `cardRules` in Firestore, `CardRulesSection` in Lobby, Overlay in `CircleGame.tsx` zeigt "Eigene Regel!" wenn vorhanden
- [ ] **Circle: Regelanzeige für Kategorie (König)**: Kategorie wird verbal genannt – könnte analog zur Damen-Regel gespeichert und angezeigt werden
- [ ] **Firestore Security Rules deployen**: Rules in `firestore.rules` sind korrekt, müssen aber manuell in die Firebase Console eingespielt werden (Firebase Console → Firestore → Regeln → einfügen → Veröffentlichen)
- [ ] **Offline-Modus** (explizit zurückgestellt): Service Worker cacht nur Assets, keine Offline-Spiellogik
