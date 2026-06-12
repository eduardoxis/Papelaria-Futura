// ============================================================
// firebase-config.js
// Configuração centralizada do Firebase SDK v9+ Modular
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA5j_7Ef90CUjkk5FurjwG1amlMzG98PoU",
  authDomain:        "papelaria-futura.firebaseapp.com",
  projectId:         "papelaria-futura",
  storageBucket:     "papelaria-futura.firebasestorage.app",
  messagingSenderId: "643112282801",
  appId:             "1:643112282801:web:9e076c751282fa1988d090"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
