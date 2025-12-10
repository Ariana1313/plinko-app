// ===== PLINKO APP FRONTEND AUTH SYSTEM =====
const API_URL = "https://plinko-app.onrender.com";

// REGISTER
async function registerUser(e) {
    e.preventDefault();

    const formData = {
        firstName: document.getElementById("firstName").value,
        lastName: document.getElementById("lastName").value,
        username: document.getElementById("username").value,
        secretPin: document.getElementById("secretPin").value,
        email: document.getElementById("email").value,
        phone: document.getElementById("phone").value,
        sex: document.getElementById("sex").value,
        birthday: document.getElementById("birthday").value,
        address: document.getElementById("address").value,
        password: document.getElementById("password").value
    };

    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Registration failed");
            return;
        }

        alert("Registration success! Redirecting...");
        window.location.href = "login.html";
    } catch (err) {
        alert("Network Error. Check your connection.");
    }
}

// LOGIN
async function loginUser(e) {
    e.preventDefault();

    const formData = {
        username: document.getElementById("loginUsername").value,
        password: document.getElementById("loginPassword").value
    };

    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Login failed");
            return;
        }

        // Save token + username
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);

        window.location.href = "plinko.html";

    } catch (err) {
        alert("Network error.");
    }
}

// RESET PASSWORD
async function resetPassword(e) {
    e.preventDefault();

    const formData = {
        email: document.getElementById("resetEmail").value,
        secretPin: document.getElementById("resetPin").value,
        newPassword: document.getElementById("resetNewPassword").value
    };

    try {
        const res = await fetch(`${API_URL}/api/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Reset failed");
            return;
        }

        alert("Password reset success!");
        window.location.href = "login.html";
    } catch (err) {
        alert("Network error.");
    }
}
