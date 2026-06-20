interface Props {
  onSelect: (game: string) => void;
}

const GAMES = [
  {
    id: 'busfahren',
    emoji: '🚌',
    name: 'Busfahren',
    desc: 'Kartenspiel für 2–8 Spieler',
    available: true,
  },
  {
    id: 'ringoffire',
    emoji: '🃏',
    name: 'Ring of Fire',
    desc: 'Das Klassiker-Trinkspiel',
    available: false,
  },
  {
    id: 'arschloch',
    emoji: '♠️',
    name: 'Arschloch',
    desc: 'Kartenrangspiel mit Trinken',
    available: false,
  },
  {
    id: 'ichhnocnie',
    emoji: '🍺',
    name: 'Ich hab noch nie',
    desc: 'Geständnisse & Trinken',
    available: false,
  },
];

export default function GameSelection({ onSelect }: Props) {
  return (
    <div className="game-area">
      <h1 style={{ textAlign: 'center', marginBottom: 4 }}>🍻 Trinkspiele</h1>
      <p style={{ textAlign: 'center', opacity: 0.5, fontSize: 14, marginBottom: 24 }}>
        Wähle ein Spiel aus
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {GAMES.map(game => (
          <button
            key={game.id}
            onClick={() => game.available && onSelect(game.id)}
            disabled={!game.available}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px 20px',
              borderRadius: 14,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              textAlign: 'left',
              cursor: game.available ? 'pointer' : 'default',
              opacity: game.available ? 1 : 0.5,
              width: '100%',
            }}
          >
            <span style={{ fontSize: 36, lineHeight: 1 }}>{game.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>
                {game.name}
              </div>
              <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2, color: 'var(--text)' }}>
                {game.desc}
              </div>
            </div>
            {!game.available && (
              <span style={{
                fontSize: 11,
                background: 'var(--border)',
                color: 'var(--text)',
                padding: '3px 8px',
                borderRadius: 20,
                whiteSpace: 'nowrap',
                opacity: 0.7,
              }}>
                Bald verfügbar
              </span>
            )}
            {game.available && (
              <span style={{ fontSize: 18, opacity: 0.4 }}>›</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
