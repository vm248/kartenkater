import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCc5KFU20MgewXKbKFPwO7nyk1Rxmh146Y",
  authDomain: "kartenkater.firebaseapp.com",
  projectId: "kartenkater",
  storageBucket: "kartenkater.firebasestorage.app",
  messagingSenderId: "360765069928",
  appId: "1:360765069928:web:2051ced4aeb02adea1f9dd",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
