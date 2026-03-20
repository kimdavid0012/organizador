import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDAjBmZyA35X3jr28Opb1QLRjXS-uRwEh4",
    authDomain: "organizador-de678.firebaseapp.com",
    projectId: "organizador-de678",
    storageBucket: "organizador-de678.firebasestorage.app",
    messagingSenderId: "569479563166",
    appId: "1:569479563166:web:7f94ebc00319d63f51b88f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
