const API_BASE = "https://plinko-app.onrender.com";

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!data.ok) {
      alert(data.error || "Invalid login.");
      return;
    }

    // Save user to local storage
    localStorage.setItem("plinkoUser", JSON.stringify(data.user));

    alert("Login successful!");
    window.location.href = "plinko.html"; // Or index.html

  } catch (err) {
    alert("Network error — try again.");
  }
});
