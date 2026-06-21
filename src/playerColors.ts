export const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];

export function playerColor(playerOrder: string[], id: string): string {
  const idx = playerOrder.indexOf(id);
  return PLAYER_COLORS[idx >= 0 ? idx % PLAYER_COLORS.length : 0];
}
