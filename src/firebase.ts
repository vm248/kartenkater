import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCc5KFU20MgewXKbKFPwO7nyk1Rxmh146Y",
  authDomain: "kartenkater.firebaseapp.com",
  projectId: "kartenkater",
  storageBucket: "kartenkater.firebasestorage.app",
  messagingSenderId: "360765069928",
  appId: "1:360765069928:web:2051ced4aeb02adea1f9dd",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// firebase/auth is only needed by the dev dashboard and is loaded there (keeps the main bundle small)
