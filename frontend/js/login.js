
const API = "https://plinko-app.onrender.com";

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value.trim();

  try {
    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include"
    });

    const data = await res.json();

    if (!data.ok) {
      alert(data.error || "Login failed");
      return;
    }

    localStorage.setItem("plinkoUser", JSON.stringify(data.user));
    location.href = "plinko.html";

  } catch (err) {
    alert("Network error — please try again");
  }
});
