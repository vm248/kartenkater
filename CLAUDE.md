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
Firestore (rooms/{code})
       ↕  onSnapshot
   App.tsx              ← hält roomId + Player-ID (localStorage)
       ↓
   Lobby.tsx            ← status === 'lobby'
   Game.tsx             ← alle anderen Status
```

`App.tsx` abonniert mit `onSnapshot` das Raum-Dokument und reicht `room` + `playerId` nach unten. Jede Benutzeraktion ruft eine Funktion aus `gameActions.ts` auf, die direkt Firestore schreibt. Es gibt keinen lokalen State für Spiellogik – Firestore ist die einzige Source of Truth.

### Wichtige Dateien

| Datei | Zweck |
|---|---|
| `src/types.ts` | Alle TypeScript-Interfaces (`GameRoom`, `Player`, `Card`, `GameStatus`, …) |
| `src/gameLogic.ts` | Reine Funktionen ohne Side-Effects: Deck erstellen/mischen, Pyramide bauen, Tipp auswerten |
| `src/gameActions.ts` | Alle Firestore-Schreiboperationen; führt Spiellogik aus und committed das Ergebnis |
| `src/App.tsx` | Firestore-Subscription, Dark Mode, Routing zwischen Home/Lobby/Game |
| `src/pages/Game.tsx` | Rendert alle Spielphasen (phase1 → phase2start → phase2 → results → phase3 → finished) anhand `room.status` |

### Spielphasen (`room.status`)

```
lobby → phase1 → phase2start → phase2 → results → phase3 → finished → (lobby)
```

- **phase1**: Reihum Kartenraten. Aktiver Spieler wird über `room.currentPlayerIndex` + `room.playerOrder` bestimmt. Nur der aktive Spieler sieht Antwort-Buttons; alle anderen sehen eine Warteanzeige.
- **phase2**: Pyramide. Nur der Host kann die nächste Karte aufdecken (`revealNextPyramidCard`). Bei der letzten Karte wird automatisch der Busfahrer ermittelt und `status` auf `results` gesetzt.
- **phase3**: Busfahren. Nur `room.busfahrerId === playerId` sieht Spieler-Buttons; alle anderen sehen Zuschaueransicht.

### Spieler-Identität

`playerId` wird beim ersten Besuch per `crypto.randomUUID()` generiert und in `localStorage` (`busfahren_pid`) gespeichert. `sessionStorage` merkt sich die aktuelle `roomId`. Kein Auth-System.

### Karten-Sichtbarkeit

In Phase 1 sieht jeder Spieler **nur seine eigenen Karten** als aufgedeckt; die Karten anderer Spieler werden als Kartenrücken (`faceDown`) gerendert. In Results und Phase 2 sind alle Karten sichtbar.

### Firebase

`src/firebase.ts` enthält die Firestore-Konfiguration mit Platzhaltern – vor dem ersten Start müssen die `DEIN_*`-Werte durch echte Firebase-Projektdaten ersetzt werden.

Security Rules liegen in `firestore.rules` (Test-Modus: `allow read, write: if true` reicht für den Start). In der Firebase Console unter Firestore → Rules eintragen.

### PWA / Icons

`public/icon-192.png` und `public/icon-512.png` sind vorhanden (generiert 2026-06-20). `vite.config.ts` hat VitePWA bereits konfiguriert. Nach `npm run build` ist die App installierbar.

### Styling

Kein CSS-Framework. Globale CSS Custom Properties in `src/index.css` für Light/Dark Mode (`--bg`, `--card`, `--primary`, `--accent`, …). Dark Mode wird per `body.dark`-Klasse aktiviert.

## Offene Punkte (Stand 2026-06-20)

- [ ] Firebase-Credentials in `src/firebase.ts` eintragen (DEIN_* ersetzen)
- [ ] App lokal testen: `npm run dev`, zwei Tabs, Raum erstellen + beitreten
- [ ] Deployen: `npm run build` → `dist/` auf Netlify (drag & drop auf netlify.com/drop)
- [ ] Firestore Security Rules vor echtem Einsatz absichern
