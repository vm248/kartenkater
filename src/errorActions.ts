import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function submitErrorReport(params: {
  message: string;
  playerId: string;
  gameType?: string;
  roomId?: string;
}): Promise<void> {
  const data: Record<string, unknown> = {
    message: params.message,
    playerId: params.playerId,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  };
  if (params.gameType !== undefined) data.gameType = params.gameType;
  if (params.roomId !== undefined) data.roomId = params.roomId;
  await addDoc(collection(db, 'errors'), data);
}
