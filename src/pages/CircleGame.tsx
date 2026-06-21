import { useState, useRef, useEffect } from 'react';
import { Circle } from 'lucide-react';
import type { CircleRoom } from '../circleTypes';
import {
  drawCard, confirmAction, useDaumen, restartCircleGame,
} from '../circleActions';
import { cardAngle, polar } from '../circleLogic';
import { playerColor } from '../playerColors';

interface Props {
  room: CircleRoom;
  playerId: string;
  isLocalMode?: boolean;
}

const CARD_W = 22;
const CARD_H = 36;
const SIZE = 280;
const R = 88; // smaller radius → more natural card overlap
const CENTER = SIZE / 2;

function suitColor(suit: string): string {
  return suit === '♥' || suit === '♦' ? '#e53e3e' : 'var(--text)';
}

export default function CircleGame({ room, playerId, isLocalMode }: Props) {
  const isMyTurn = room.playerOrder[room.currentPlayerIndex] === playerId;
  const currentPlayerName = room.players[room.playerOrder[room.currentPlayerIndex]]?.name ?? '';
  const isDaumenKing = room.daumenKingId === playerId;
  // In local mode everyone shares one device, so any player can press the DK button
  const canUseDaumen = isLocalMode
    ? !!room.daumenKingId && room.daumenKingUses > 0
    : isDaumenKing && room.daumenKingUses > 0;

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { setSelectedIdx(null); }, [room.currentPlayerIndex, room.pendingAction]);

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!isMyTurn || room.pendingAction) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = SIZE / rect.width;
    const scaleY = SIZE / rect.height;
    const mx = (e.clientX - rect.left) * scaleX - CENTER;
    const my = (e.clientY - rect.top) * scaleY - CENTER;
    const dist = Math.sqrt(mx * mx + my * my);
    if (dist < 40 || dist > R + CARD_H / 2 + 8) return;

    let angle = Math.atan2(mx, -my) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    let best = -1;
    let bestDiff = 360;
    for (let i = 0; i < room.cards.length; i++) {
      if (room.cards[i].drawn) continue;
      const a = ((cardAngle(i, room.cardAngles) % 360) + 360) % 360;
      let diff = Math.abs(a - angle);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    if (best !== -1 && bestDiff < 12) {
      setSelectedIdx(prev => prev === best ? null : best);
    }
  }

  async function handleDraw() {
    if (selectedIdx === null) return;
    await drawCard(room, selectedIdx, playerId);
  }

  // ---- Pending action overlay ----
  if (room.pendingAction) {
    const pa = room.pendingAction;
    const isActor = pa.playerId === playerId;
    const card = pa.card;

    return (
      <div className="game-area" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '70vh', gap: 12,
      }}>
        {/* Persistent Daumenking bar in overlay too */}
        {room.daumenKingId && (
          <DaumenBar room={room} playerId={playerId} canUseDaumen={canUseDaumen} />
        )}
        {room.lastQueenName && (
          <RuleBar queenName={room.lastQueenName} />
        )}

        {/* Card display – flies up on mount */}
        <div style={{
          width: 90, height: 130, borderRadius: 14,
          background: 'var(--card)', border: '2.5px solid var(--border)',
          boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 2,
          animation: 'cardFlyUp 0.42s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: suitColor(card.suit), lineHeight: 1 }}>
            {String(card.value)}
          </div>
          <div style={{ fontSize: 22, color: suitColor(card.suit) }}>{card.suit}</div>
        </div>

        <p style={{ fontWeight: 700, fontSize: 16, margin: '4px 0 0', color: 'var(--text-muted)' }}>
          {pa.playerName} hat gezogen
        </p>

        {/* Gap notice – just shown, no pre-warning */}
        {pa.createdGap && (
          <div style={{
            background: '#e53e3e', color: '#fff', borderRadius: 12,
            padding: '8px 18px', fontWeight: 800, fontSize: 15, textAlign: 'center',
          }}>
            Lücke gerissen – Exen!
          </div>
        )}

        {/* Effect */}
        <div style={{
          background: 'var(--card-inner)', borderRadius: 14,
          padding: '14px 20px', textAlign: 'center', maxWidth: 300, width: '100%',
        }}>
          {pa.type === 'number' && !pa.distribute && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Trink {pa.sips} Schlücke!</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Schwarze Karte – selbst trinken</p>
            </>
          )}
          {pa.type === 'number' && pa.distribute && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{pa.sips} Schlücke verteilen!</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Rote Karte – gib {pa.sips} Schlücke an andere</p>
            </>
          )}
          {pa.type === 'jack' && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Daumenking!</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                {pa.playerName} ist jetzt Daumenking (3×)
              </p>
            </>
          )}
          {pa.type === 'queen' && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Regelkarte!</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                {pa.playerName} denkt sich eine Regel aus – gilt bis zur nächsten Dame.
              </p>
            </>
          )}
          {pa.type === 'king' && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Kategorie!</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                {pa.playerName} wählt eine Kategorie – reihum antworten, wer nicht kann trinkt.
              </p>
            </>
          )}
          {pa.type === 'ace_normal' && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Ass #{room.acesDrawn}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Noch {4 - room.acesDrawn} Ass{4 - room.acesDrawn !== 1 ? 'e' : ''} bis zum Exen
              </p>
            </>
          )}
          {pa.type === 'ace_ex' && (
            <>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>4. Ass – Exen!</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                {pa.playerName} muss das Glas leeren!
              </p>
            </>
          )}
        </div>

        {isActor && (
          <button style={{ maxWidth: 280 }} onClick={() => confirmAction(room)}>
            {pa.type === 'number' && pa.distribute ? 'Alles verteilt – weiter' : 'Verstanden – weiter'}
          </button>
        )}
        {!isActor && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            Warte auf {pa.playerName}…
          </p>
        )}
      </div>
    );
  }

  // ---- Finished ----
  if (room.status === 'finished') {
    return (
      <div className="game-area" style={{ textAlign: 'center' }}>
        <Circle size={32} strokeWidth={1.5} style={{ color: 'var(--primary)', marginBottom: 8 }} />
        <h2 style={{ margin: '0 0 8px' }}>Alle Karten gezogen!</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 24px' }}>Das Spiel ist vorbei.</p>
        {room.hostId === playerId ? (
          <button onClick={() => restartCircleGame(room)}>Neue Runde</button>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Warte auf den Host…</p>
        )}
      </div>
    );
  }

  // ---- Main game board ----
  const drawnCount = room.cards.filter(c => c.drawn).length;
  const remaining = room.cards.length - drawnCount;

  return (
    <div className="game-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

      {/* Persistent Daumenking button – always visible when active */}
      {room.daumenKingId && (
        <DaumenBar room={room} playerId={playerId} canUseDaumen={canUseDaumen} />
      )}

      {/* Status bar */}
      <div style={{
        width: '100%', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8, fontSize: 13,
      }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{remaining} Karten übrig</span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{room.acesDrawn}/4 Asse</span>
      </div>

      {/* Persistent rule bar */}
      {room.lastQueenName && (
        <RuleBar queenName={room.lastQueenName} />
      )}

      {/* Turn indicator */}
      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
        {isMyTurn ? 'Du bist dran!' : `${currentPlayerName} ist dran`}
      </div>

      {/* Circle SVG */}
      <div style={{
        width: '100%', maxWidth: 360, aspectRatio: '1',
        overflow: 'hidden', borderRadius: 20,
        background: 'var(--card-inner)', border: '1.5px solid var(--border)',
        cursor: isMyTurn && !room.pendingAction ? 'pointer' : 'default',
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          height="100%"
          onClick={handleSvgClick}
          style={{ display: 'block' }}
        >
          {/* Center */}
          <circle cx={CENTER} cy={CENTER} r={38} fill="var(--card)" stroke="var(--border)" strokeWidth="1" />
          <text x={CENTER} y={CENTER + 5} textAnchor="middle" fontSize="11" fontWeight="700"
            fill="var(--text-muted)" fontFamily="inherit">
            Circle
          </text>

          {/* Cards */}
          {room.cards.map((card, i) => {
            if (!room.cardAngles?.length) return null;
            const angle = cardAngle(i, room.cardAngles);
            const pos = polar(angle, R);
            const cx = CENTER + pos.x;
            const cy = CENTER + pos.y;
            const isDrawn = card.drawn;
            const isSelected = selectedIdx === i;

            return (
              <g
                key={i}
                transform={`translate(${cx},${cy}) rotate(${angle})`}
                style={{ cursor: isMyTurn && !isDrawn ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (!isMyTurn || room.pendingAction) return;
                  e.stopPropagation();
                  setSelectedIdx(prev => prev === i ? null : i);
                }}
              >
                {isDrawn ? (
                  <rect
                    x={-CARD_W / 2} y={-CARD_H / 2}
                    width={CARD_W} height={CARD_H} rx={3}
                    fill="none" stroke="var(--border)"
                    strokeWidth="0.8" strokeDasharray="3,3" opacity={0.3}
                  />
                ) : (
                  <>
                    <rect
                      x={-CARD_W / 2} y={-CARD_H / 2}
                      width={CARD_W} height={CARD_H} rx={3}
                      fill={isSelected ? 'var(--primary)' : 'var(--card)'}
                      stroke={isSelected ? 'var(--primary)' : 'var(--border)'}
                      strokeWidth={isSelected ? 1.5 : 0.8}
                    />
                    {!isSelected && (
                      <text x={0} y={2} textAnchor="middle" fontSize="7"
                        fill="var(--border)" fontWeight="600" fontFamily="inherit">
                        ✦
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected card confirm */}
      {isMyTurn && selectedIdx !== null && !room.pendingAction && (
        <div style={{ marginTop: 12, textAlign: 'center', width: '100%', maxWidth: 360 }}>
          <button onClick={handleDraw} style={{ maxWidth: 280 }}>Karte ziehen</button>
          <button className="secondary" style={{ maxWidth: 280, marginTop: 6 }}
            onClick={() => setSelectedIdx(null)}>
            Abbrechen
          </button>
        </div>
      )}

      {!isMyTurn && !room.pendingAction && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 12, textAlign: 'center' }}>
          Warte auf {currentPlayerName}…
        </p>
      )}

      {/* Player list */}
      <div style={{ marginTop: 16, width: '100%' }}>
        <ul className="player-list" style={{ margin: 0 }}>
          {room.playerOrder.map((id, idx) => {
            const color = playerColor(room.playerOrder, id);
            const isActive = idx === room.currentPlayerIndex;
            return (
              <li key={id} style={{ opacity: isActive ? 1 : 0.6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="player-dot" style={{ background: color }} />
                  <span style={{ fontWeight: isActive ? 700 : 500 }}>{room.players[id]?.name}</span>
                  {isActive && <span style={{ fontSize: 14 }}>←</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// Persistent queen-rule bar
function RuleBar({ queenName }: { queenName: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', background: 'var(--card-inner)', borderRadius: 12,
      padding: '8px 14px', marginBottom: 10, border: '1.5px solid var(--border)',
      gap: 8,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
        👑 Aktuelle Regel: von <strong style={{ color: 'var(--text)' }}>{queenName}</strong>
      </span>
    </div>
  );
}

// Daumenking bar – persistent, shown in all game states
function DaumenBar({ room, playerId, canUseDaumen }: {
  room: CircleRoom;
  playerId: string;
  canUseDaumen: boolean;
}) {
  const kingId = room.daumenKingId ?? '';
  const kingName = room.players[kingId]?.name ?? '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', background: 'var(--card-inner)', borderRadius: 12,
      padding: '8px 14px', marginBottom: 10, border: '1.5px solid var(--border)',
      gap: 10,
    }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
        👍 Daumenking: <strong style={{ color: 'var(--text)' }}>{kingName}</strong>
        <span style={{ marginLeft: 6, opacity: 0.6 }}>({room.daumenKingUses}×)</span>
      </span>
      <button
        onClick={() => canUseDaumen ? useDaumen(room, kingId) : undefined}
        disabled={!canUseDaumen}
        style={{ flex: 1, margin: 0, fontSize: 13 }}
      >
        Daumen benutzt
      </button>
    </div>
  );
}
