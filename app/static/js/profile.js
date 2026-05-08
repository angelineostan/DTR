// State
const state = {
    avatarBase64Data: null,
    coverBase64Data: null
};

// Utilities
/**
 * Reads a file, compresses/resizes it using a canvas,
 * and returns a base64 string resolving well under typical 1MB limits.
 */
function processImageFile(file, maxWidth, maxHeight, quality, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            // Convert down to medium JPEG for extreme compression
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Event Handlers
function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (file) {
        processImageFile(file, 400, 400, 0.7, (base64) => {
            state.avatarBase64Data = base64;
            const avatarContainer = document.getElementById('avatar-container');
            if (avatarContainer) {
                avatarContainer.style.backgroundImage = `url('${base64}')`;
                avatarContainer.style.color = "transparent";
            }
            const text = document.getElementById('avatar-text');
            if (text) text.classList.add('hidden');
        });
    }
}

// Handle Cover Upload
function handleCoverUpload(e) {
    const file = e.target.files[0];
    if (file) {
        processImageFile(file, 1200, 600, 0.6, (base64) => {
            state.coverBase64Data = base64;
            const coverContainer = document.getElementById('cover-container');
            if (coverContainer) {
                coverContainer.style.backgroundImage = `url('${base64}')`;
                coverContainer.classList.remove('bg-gradient-to-r', 'from-blue-600', 'to-indigo-600');
            }
            const svg = document.getElementById('cover-backdrop-svg');
            if (svg) svg.style.display = 'none';
        });
    }
}

// Save Profile
async function saveProfile() {
    const btn1 = document.getElementById('save-profile-btn');
    const btn2 = document.getElementById('save-profile-top-btn');

    if (!btn1 || !btn2) return;

    const originalText = btn1.innerHTML;

    btn1.innerHTML = 'Saving...';
    btn2.innerHTML = 'Saving...';
    btn1.disabled = true;
    btn2.disabled = true;

    const payload = {
        display_name: document.getElementById('profile-display-name')?.value || '',
        phone: document.getElementById('profile-phone')?.value || '',
        department: document.getElementById('profile-department')?.value || '',
        bio: document.getElementById('profile-bio')?.value || ''
    };

    if (state.avatarBase64Data) { payload.avatar_base64 = state.avatarBase64Data; }
    if (state.coverBase64Data) { payload.cover_base64 = state.coverBase64Data; }

    try {
        const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Profile successfully updated!");
            window.location.reload();
        } else {
            const resText = await response.json();
            alert(resText.error || "An error occurred.");
        }
    } catch (error) {
        console.error(error);
        alert("Network error.");
    } finally {
        btn1.innerHTML = originalText;
        btn2.innerHTML = 'Save Profile';
        btn1.disabled = false;
        btn2.disabled = false;
    }
}

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
    const avatarUpload = document.getElementById('avatar-upload');
    if (avatarUpload) avatarUpload.addEventListener('change', handleAvatarUpload);

    const coverUpload = document.getElementById('cover-upload');
    if (coverUpload) coverUpload.addEventListener('change', handleCoverUpload);

    const saveBtn = document.getElementById('save-profile-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);

    const saveTopBtn = document.getElementById('save-profile-top-btn');
    if (saveTopBtn) saveTopBtn.addEventListener('click', saveProfile);
});
