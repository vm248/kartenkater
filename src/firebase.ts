import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// TODO: Ersetze diese Werte mit deiner Firebase-Konfiguration
// Firebase Console → Projekteinstellungen → Web-App → Konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyCZfow2SmzQEy1B5LvltkmtEMotc4dhFVI",
  authDomain: "testprojekt-b99b0.firebaseapp.com",
  projectId: "testprojekt-b99b0",
  storageBucket: "testprojekt-b99b0.firebasestorage.app",
  messagingSenderId: "170923489079",
  appId: "1:170923489079:web:bceab6ad1c72eb362fccb2",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
