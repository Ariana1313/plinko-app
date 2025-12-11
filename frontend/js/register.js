const API = "https://plinko-app-1qv9.onrender.com";

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = document.getElementById("registerForm");
  const formData = new FormData(form);

  try {
    const res = await fetch(`${API}/api/register`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      alert(data.error || "Registration failed");
      return;
    }

    alert("Account created! $150 Bonus added.");

    window.location.href = "login.html";
  } catch (err) {
    alert("Network error");
  }
});
