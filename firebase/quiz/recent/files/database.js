// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBJs9fp6w30ZpxycPLGy2bntvFeNy2TFxk",
  authDomain: "login-b6382.firebaseapp.com",
  databaseURL: "https://login-b6382-default-rtdb.firebaseio.com",
  projectId: "login-b6382",
  storageBucket: "login-b6382.appspot.com",
  messagingSenderId: "482805184778",
  appId: "1:482805184778:web:5dfba2587a438a5ed7a2f3",
  measurementId: "G-S55NBV7G1T"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
console.log("Firebase initialized successfully.");
alert("Firebase initialized successfully.");

// Export Firebase functions
export function saveScoreToDatabase(path, data) {
  const dbRef = ref(db, path);
  set(dbRef, data)
    .then(() => {
      console.log(`Data saved to ${path}:`, data);
      alert(`Data saved successfully to ${path}.`);
    })
    .catch((error) => {
      console.error(`Error saving data to ${path}:`, error.message);
      alert(`Error saving data to ${path}: ${error.message}`);
    });
}

export function getLeaderboardData(path, callback) {
  const dbRef = ref(db, path);
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    console.log(`Real-time update from ${path}:`, data);
    alert(`Real-time update from ${path}: ${JSON.stringify(data)}`);
    callback(data);
  });
}
