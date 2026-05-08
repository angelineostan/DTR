import { auth } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// Utility function to send the ID token to our Flask backend to create a session cookie
async function createSession(idToken) {
    try {
        const response = await fetch('/sessionLogin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ idToken: idToken }),
        });

        const data = await response.json();
        if (response.ok) {
            window.location.assign('/dashboard');
        } else {
            console.error('Session creation failed:', data.error || data.message);
            alert('Failed to establish session. Please try again.');
        }
    } catch (error) {
        console.error('Error establishing session:', error);
        alert('Server error while establishing session.');
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // LOGIN FORM LOGIC
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                // Determine if button should show loading state (optional UI enhancement)
                const submitBtn = loginForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerText;
                submitBtn.innerText = 'Signing in...';
                submitBtn.disabled = true;

                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const idToken = await userCredential.user.getIdToken();
                await createSession(idToken);
            } catch (error) {
                console.error("Error signing in:", error);
                alert("Login failed: " + error.message);
                const submitBtn = loginForm.querySelector('button[type="submit"]');
                submitBtn.innerText = 'Sign in to account';
                submitBtn.disabled = false;
            }
        });
    }

    // SIGNUP FORM LOGIC
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const firstName = document.getElementById('first-name').value;
            const lastName = document.getElementById('last-name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const submitBtn = signupForm.querySelector('button[type="submit"]');
                submitBtn.innerText = 'Creating account...';
                submitBtn.disabled = true;

                // Create user in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const idToken = await userCredential.user.getIdToken();
                const uid = userCredential.user.uid;

                // Save extended profile to Firestore via Backend API
                try {
                    const profileRes = await fetch('/api/users/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            uid: uid,
                            first_name: firstName,
                            last_name: lastName,
                            email: email
                        })
                    });

                    if (!profileRes.ok) {
                        console.error('Failed to save profile on backend');
                    }
                } catch (profileErr) {
                    console.error('Error saving profile:', profileErr);
                }

                // Establish session
                await createSession(idToken);
            } catch (error) {
                console.error("Error signing up:", error);
                alert("Signup failed: " + error.message);
                const submitBtn = signupForm.querySelector('button[type="submit"]');
                submitBtn.innerText = 'Sign up for free';
                submitBtn.disabled = false;
            }
        });
    }

    // GOOGLE OAUTH LOGIC
    const googleBtns = document.querySelectorAll('.google-btn');
    const provider = new GoogleAuthProvider();

    googleBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevent accidental form submission if it's inside a form
            try {
                const result = await signInWithPopup(auth, provider);
                const idToken = await result.user.getIdToken();
                const user = result.user;

                // For Google Auth, derive first and last name from displayName
                let firstName = "User";
                let lastName = "";
                if (user.displayName) {
                    const nameParts = user.displayName.split(" ");
                    firstName = nameParts[0];
                    if (nameParts.length > 1) {
                        lastName = nameParts.slice(1).join(" ");
                    }
                }

                // Call backend backend profile route to ensure the user Firestore doc exists 
                // and has the appropriate profile and created_at timestamps
                try {
                    await fetch('/api/users/profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            uid: user.uid,
                            first_name: firstName,
                            last_name: lastName,
                            email: user.email
                        })
                    });
                } catch (profileErr) {
                    console.error("Error saving google profile:", profileErr);
                }

                await createSession(idToken);
            } catch (error) {
                console.error("Error with Google Sign-in:", error);
                alert("Google Sign-in failed: " + error.message);
            }
        });
    });
});
