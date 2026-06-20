import type { PyramidCell } from '../types';
import CardComponent from './CardComponent';

interface Props {
  pyramid: PyramidCell[];
  rows: number;
}

export default function PyramidGrid({ pyramid, rows }: Props) {
  let idx = 0;
  const rowArrays: number[][] = [];
  for (let r = 1; r <= rows; r++) {
    const row: number[] = [];
    for (let i = 0; i < r; i++) row.push(idx++);
    rowArrays.push(row);
  }

  return (
    <div className="pyramid-grid">
      {rowArrays.map((row, ri) => (
        <div key={ri} className="pyramid-row">
          {row.map(cellIdx => {
            const cell = pyramid[cellIdx];
            return (
              <div key={cellIdx} className="pyramid-cell">
                {cell ? (
                  <CardComponent card={cell.revealed ? cell.card : null} faceDown={!cell.revealed} />
                ) : (
                  <CardComponent card={null} faceDown />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
