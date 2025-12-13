
const API_BASE = "https://plinko-app.onrender.com";

const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(form);

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      alert(data.error || "Login failed");
      return;
    }

    window.location.href = "plinko.html";

  } catch (err) {
    alert("Network error. Please try again.");
  }
});

const loginToggle = document.getElementById("loginToggle");
const loginPassword = document.getElementById("loginPassword");

if (loginToggle && loginPassword) {
  loginToggle.addEventListener("click", () => {
    loginPassword.type =
      loginPassword.type === "password" ? "text" : "password";
  });
}
