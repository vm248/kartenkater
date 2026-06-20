import type { Card } from '../types';
import { isRed } from '../gameLogic';

interface Props {
  card: Card | null;
  faceDown?: boolean;
  small?: boolean;
}

export default function CardComponent({ card, faceDown = false, small = false }: Props) {
  const size = small
    ? { width: 40, height: 55, fontSize: 15 }
    : { width: 52, height: 72, fontSize: 20 };

  if (faceDown || !card) {
    return (
      <div
        className="card-back"
        style={{ width: size.width, height: size.height }}
      />
    );
  }

  return (
    <div
      className={`card-style ${isRed(card) ? 'red' : 'black'}`}
      style={{ width: size.width, height: size.height, fontSize: size.fontSize }}
    >
      <span>{card.suit}</span>
      <span style={{ fontSize: size.fontSize * 0.75 }}>{card.value}</span>
    </div>
  );
}
