
// frontend/js/register.js
const API_BASE = "https://plinko-app.onrender.com";
const form = document.getElementById("registerForm");

if (!form) {
  console.error("Register form not found");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = form.querySelector("button[type='submit']");
  if (btn) btn.disabled = true;

  try {
    const formData = new FormData(form);

    // referral from URL
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) formData.set("referralCode", ref);

    const res = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      alert(data.error || "Registration failed");
      if (btn) btn.disabled = false;
      return;
    }

    alert("Account created successfully. Please login.");
    window.location.href = "login.html";

  } catch (err) {
    console.error(err);
    alert("Network error — please try again.");
    if (btn) btn.disabled = false;
  }
});
