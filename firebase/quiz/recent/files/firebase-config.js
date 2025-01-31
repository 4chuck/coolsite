// Import Firebase modules
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Replace with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyBJs9fp6w30ZpxycPLGy2bntvFeNy2TFxk",
  authDomain: "login-b6382.firebaseapp.com",
  databaseURL: "https://login-b6382-default-rtdb.firebaseio.com",
  projectId: "login-b6382",
  storageBucket: "login-b6382.appspot.com",
  messagingSenderId: "482805184778",
  appId: "1:482805184778:web:0d146b1daf3aa25ad7a2f3",
  measurementId: "G-ZHXBBZHN3W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
const database = getDatabase(app);

export { database };
