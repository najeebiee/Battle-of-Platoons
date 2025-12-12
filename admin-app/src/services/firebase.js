// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Added this
import { getAuth } from "firebase/auth";           // Added this

const firebaseConfig = {
  apiKey: "AIzaSyAgd1QvALdCE8S1xwzvHl5SBqjq76_WXGs",
  authDomain: "grinders-guild-battle-series.firebaseapp.com",
  projectId: "grinders-guild-battle-series",
  storageBucket: "grinders-guild-battle-series.firebasestorage.app",
  messagingSenderId: "29200971780",
  appId: "1:29200971780:web:aaf87c02e64c0750bb9d51",
  measurementId: "G-8EBR6Q27H8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the services so our App.jsx can use them
export const db = getFirestore(app);
export const auth = getAuth(app);