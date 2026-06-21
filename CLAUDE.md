# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Dev-Server starten (http://localhost:5173)
npm run build    # Produktions-Build (Output: dist/)
npm run preview  # Build lokal vorschauen
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
| `src/App.tsx` | Firestore-Subscriptions, Dark Mode, Farbthema, Routing, Push-Notifications, Lokal-Modus-Handoff |
| `src/pages/Game.tsx` | Busfahren (phase1 → phase2start → phase2 → results → phase3 → finished) |
| `src/pages/CircleGame.tsx` | Circle-Spiel: SVG-Kreis, DaumenBar, RuleBar, Overlay |
| `src/pages/CircleLobby.tsx` | Circle-Lobby: Kurzregeln, CustomRulesSection |
| `src/playerColors.ts` | Funktion `playerColor(order, id)` → stabile Farbe pro Spieler |

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
- **Eigene Regeln** (Lobby): Host kann Custom Rules via `CustomRulesSection` hinzufügen/entfernen; gespeichert in `room.customRules: string[]`
- **Lücke**: Nur die erste Lücke zählt (`gapBroken`); `checkGap()` prüft ob gezogene Karte einen Winkelabstand > 20° zu Nachbarn hat

### Spielphasen Das Fenster (`quadratRoom.status`)

```
lobby → playing → distributing → finished → (lobby)
```

### Lokal-Modus

Alle Spiele unterstützen einen Lokal-Modus (Gerät wird herumgegeben). `App.tsx` verwaltet `localPlayerIds` + `localActiveId`. Bei Zugwechsel erscheint ein Handoff-Screen ("Jetzt dran: [Name]"). Im Circle-Lokal-Modus: `isLocalMode` prop → `canUseDaumen = !!room.daumenKingId && room.daumenKingUses > 0` (kein Spieler-Check nötig)

### Top Bar (App.tsx)

- `position: fixed`, `top: 10`, zentriert mit `left: 50%; transform: translateX(-50%)`
- Breite: `calc(100% - 24px)`, max `480px`
- Grid `1fr 1fr 1fr`: Links = Farbthema-Picker, Mitte = Home-Button (nur wenn in Raum), Rechts = Dark/Light-Mode
- Icons sind `ghost`-Style: `background: transparent; border: none; boxShadow: none`
- Farbthemen: mono, lila, ocean, forest, fire (gespeichert in `localStorage.busfahren_theme`)
- Da die Bar `position: fixed` ist und der Inhalt darunter anfängt, hat `.game-area` ein `padding-top: 70px` (oder via `#root { padding-top: ... }`)

### Push-Notifications

Client-seitig via Browser Notification API. Wird ausgelöst wenn Firestore-Update zeigt, dass der eigene Spieler dran ist und `document.hidden || !document.hasFocus()`. Nur im Multiplayer (nicht Lokal-Modus).

### Karten-Animation (Circle)

`@keyframes cardFlyUp` in `index.css`: Die Karte im Pending-Overlay fliegt von unten herein (`translateY(40px) scale(0.72) → translateY(0) scale(1)`), `animation: cardFlyUp 0.42s cubic-bezier(0.34,1.56,0.64,1) both`

### Spieler-Identität

`playerId` wird beim ersten Besuch per `crypto.randomUUID()` generiert und in `localStorage` (`busfahren_pid`) gespeichert. `sessionStorage` merkt sich die aktuelle `roomId`. Kein Auth-System.

### Firebase

`src/firebase.ts` enthält die Firestore-Konfiguration. Collections: `rooms` (Busfahren), `quadrat` (Das Fenster), `circle` (Circle).

Security Rules liegen in `firestore.rules`. In der Firebase Console unter Firestore → Rules eintragen.

### PWA / Icons

`public/icon-192.png` und `public/icon-512.png` sind vorhanden. `vite.config.ts` hat VitePWA konfiguriert. Nach `npm run build` ist die App installierbar.

### Styling

Kein CSS-Framework. Globale CSS Custom Properties in `src/index.css` für Light/Dark Mode (`--bg`, `--card`, `--primary`, `--accent`, …). Dark Mode per `body.dark`. Farbthemen per `body.theme-ocean` etc. `.icon-btn`: `width: 40px; height: 40px; padding: 0`. `@keyframes cardFlyUp` für Circle-Karten-Animation.

## Offene Punkte / Ideen (Stand 2026-06-22)

- [ ] **Circle Custom Rules im Spiel anzeigen**: `room.customRules` ist schon in Firestore, aber `CircleGame.tsx` zeigt die Regeln noch nicht an (nur in der Lobby). Könnte z.B. als aufklappbarer Bereich oder Tab eingebaut werden.
- [ ] **Circle: Regelanzeige für Kategorie (König)**: Kategorie wird verbal genannt – könnte analog zur Damen-Regel gespeichert und angezeigt werden
- [ ] **Firestore Security Rules absichern** vor echtem Produktiveinsatz (aktuell `allow read, write: if true`)
- [ ] **Offline-Modus** (explizit zurückgestellt): Service Worker cacht nur Assets, keine Offline-Spiellogik
- [ ] **Netlify Deploy**: `npm run build` → `dist/` auf Netlify drag & drop
