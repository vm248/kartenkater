import { ChevronRight, Bus, Grid3x3, Circle, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  onSelect: (game: string) => void;
}

interface Game {
  id: string;
  Icon: LucideIcon;
  name: string;
  desc: string;
  available: boolean;
}

const GAMES: Game[] = [
  { id: 'busfahren', Icon: Bus,      name: 'Busfahren',      desc: '2+ Spieler · Kartenraten & Bus fahren', available: true  },
  { id: 'quadrat',   Icon: Grid3x3,  name: 'Das Fenster',    desc: '2+ Spieler · 5×5 Kartenpuzzle',        available: true  },
  { id: 'circle',    Icon: Circle,   name: 'Circle',         desc: '2+ Spieler · Kartenkreis & Aktionen',  available: true  },
  { id: 'soon1',     Icon: Layers,   name: 'Bald verfügbar', desc: '',                                      available: false },
];

export default function GameSelection({ onSelect }: Props) {
  return (
    <div className="game-area">
      <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 8 }}>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.04em' }}>Kartenkater</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, margin: '6px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Multiplayer Trinkspiele
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {GAMES.map(game => {
          const { Icon } = game;
          return (
            <button
              key={game.id}
              onClick={() => game.available && onSelect(game.id)}
              disabled={!game.available}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 14px',
                borderRadius: 18,
                background: 'var(--card-inner)',
                border: '1.5px solid var(--border)',
                textAlign: 'left',
                opacity: game.available ? 1 : 0.35,
                width: '100%',
                boxShadow: 'none',
                cursor: game.available ? 'pointer' : 'default',
                transform: 'none',
                justifyContent: 'flex-start',
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: game.available ? 'var(--primary)' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: game.available ? 'var(--btn-color)' : '#fff',
              }}>
                <Icon size={22} strokeWidth={1.5} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                  {game.name}
                </div>
                {game.desc && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 }}>
                    {game.desc}
                  </div>
                )}
              </div>

              {game.available && (
                <ChevronRight size={18} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, marginTop: 28, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Kartenkater · Multiplayer
      </p>
    </div>
  );
}
