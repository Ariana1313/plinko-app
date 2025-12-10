// auth.js
const API_BASE_URL = "https://plinko-app.onrender.com";

// Save token
function saveToken(token) {
    localStorage.setItem("authToken", token);
}

// Get token
function getToken() {
    return localStorage.getItem("authToken");
}

// Logout user
function logout() {
    localStorage.removeItem("authToken");
    window.location.href = "login.html";
}

// Verify user is logged in
async function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = "login.html";
        return;
    }
}
