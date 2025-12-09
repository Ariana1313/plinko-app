// -------------------------------
// AUTH SYSTEM CONFIG
// -------------------------------
const API_URL = "https://sturdy-waffle-pj4pq7x5gvpwc6645-3000.app.github.dev";

// -------------------------------
// REGISTER FUNCTION
// -------------------------------
async function registerUser(event) {
    event.preventDefault();

    const formData = {
        firstName: document.getElementById("firstName").value,
        lastName: document.getElementById("lastName").value,
        username: document.getElementById("username").value,
        email: document.getElementById("email").value,
        phone: document.getElementById("phone").value,
        sex: document.getElementById("sex").value,
        birthday: document.getElementById("birthday").value,
        address: document.getElementById("address").value,
        pin1: document.getElementById("pin1").value,
        pin2: document.getElementById("pin2").value,
        pin3: document.getElementById("pin3").value,
        pin4: document.getElementById("pin4").value,
        password: document.getElementById("password").value
    };

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            alert("Registration successful!");
            window.location.href = "login.html";
        } else {
            alert(data.message || "Registration failed.");
        }

    } catch (err) {
        alert("Network Error: Cannot reach server");
        console.log(err);
    }
}

// -------------------------------
// LOGIN FUNCTION
// -------------------------------
async function loginUser(event) {
    event.preventDefault();

    const formData = {
        username: document.getElementById("loginUsername").value,
        password: document.getElementById("loginPassword").value
    };

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            alert("Login successful!");
            window.location.href = "plinko.html";
        } else {
            alert(data.message || "Invalid credentials.");
        }

    } catch (err) {
        alert("Network Error: Cannot reach server");
    }
}

// -------------------------------
// RESET PASSWORD
// -------------------------------
async function resetPassword(event) {
    event.preventDefault();

    const formData = {
        email: document.getElementById("resetEmail").value,
        pin1: document.getElementById("resetPin1").value,
        pin2: document.getElementById("resetPin2").value,
        pin3: document.getElementById("resetPin3").value,
        pin4: document.getElementById("resetPin4").value,
        newPassword: document.getElementById("newPassword").value
    };

    try {
        const response = await fetch(`${API_URL}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            alert("Password reset successful!");
            window.location.href = "login.html";
        } else {
            alert(data.message || "Reset failed.");
        }

    } catch (err) {
        alert("Network Error: Cannot reach server");
    }
}
