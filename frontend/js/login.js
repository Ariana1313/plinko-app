// login.js
const API_BASE_URL = "https://plinko-app.onrender.com";

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
    };

    const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
        saveToken(result.token);
        alert("Login successful!");
        window.location.href = "plinko.html";
    } else {
        alert("Login failed.");
    }
});