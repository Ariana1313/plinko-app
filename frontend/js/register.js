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
    const payload = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      username: form.username.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      confirmPassword: form.confirmPassword.value,
      pin: form.pin.value,
      phone: form.phone.value,
      address: form.address.value,
      referral: form.referral?.value || ""
    };

    const res = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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
