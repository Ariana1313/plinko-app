
// frontend/js/login.js

const API_BASE = "https://plinko-app.onrender.com";

const form = document.getElementById("loginForm");

if (!form) {
  console.error("Login form not found");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const identifier = document.getElementById("identifier").value.trim();
  const password = document.getElementById("password").value;

  if (!identifier || !password) {
    alert("Enter username/email and password");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await res.json();
    console.log("LOGIN RESPONSE:", data);

    if (!res.ok) {
      alert(data.error || "Login failed");
      return;
    }

    // ✅ Save token if backend sends one
    if (data.token) {
      localStorage.setItem("token", data.token);
    }

    // ✅ Redirect AFTER successful login
    window.location.href = "plinko.html";

  } catch (err) {
    console.error(err);
    alert("Network error — please try again.");
  }
});
