import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-storage.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJs9fp6w30ZpxycPLGy2bntvFeNy2TFxk",
  authDomain: "login-b6382.firebaseapp.com",
  projectId: "login-b6382",
  databaseURL: "https://login-b6382-default-rtdb.firebaseio.com",
  storageBucket: "login-b6382.appspot.com",
  messagingSenderId: "482805184778",
  appId: "1:482805184778:web:0d146b1daf3aa25ad7a2f3"
};

const app = initializeApp(firebaseConfig);

let appCheck;

if (typeof window !== 'undefined') {
  // Use debug token on localhost to fix ReCAPTCHA blocks without disabling Auth AppCheck
  const localHosts = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
  if (localHosts.includes(window.location.hostname)) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LcRQjwsAAAAADdvmJvORK_-hWHEe9dNqe6ZXUFd'),
      isTokenAutoRefreshEnabled: true
    });
  } catch (error) {
    console.warn("App Check initialization failed:", error);
  }
}

const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// Ensure auth state stays synchronized across pages and browser tabs.
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('Unable to set Firebase local auth persistence:', error);
  });
}

export { app, auth, db, storage, appCheck };
