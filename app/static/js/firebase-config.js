import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDuegB4wcr6f_ww2t_zRVmBB035o6RTZbY",
    authDomain: "timeme-2bc72.firebaseapp.com",
    projectId: "timeme-2bc72",
    storageBucket: "timeme-2bc72.firebasestorage.app",
    messagingSenderId: "613804606949",
    appId: "1:613804606949:web:9e8a19e7b4bb7914a15b0c",
    measurementId: "G-F5D9JCP8VH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);