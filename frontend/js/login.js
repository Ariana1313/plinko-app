const API_BASE = "https://plinko-app.onrender.com";
const form = document.getElementById("loginForm");

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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ identifier, password })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      alert(data.error || "Login failed");
      return;
    }

    // Save token if you use one
    if (data.token) {
      localStorage.setItem("token", data.token);
    }

    window.location.href = "plinko.html";

  } catch (err) {
    console.error(err);
    alert("Network error — please try again");
  }
});
