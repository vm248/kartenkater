import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function submitErrorReport(params: {
  message: string;
  playerId: string;
  gameType?: string;
  roomId?: string;
}): Promise<void> {
  await addDoc(collection(db, 'errors'), {
    ...params,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  });
}
