// register.js
const API = "https://plinko-app.onrender.com";

// auto-fill referral code from URL
const urlParams = new URLSearchParams(window.location.search);
const ref = urlParams.get("ref");
if (ref) {
  document.getElementById("referralCode").value = ref;
  document.getElementById("referralCodeVisible").value = ref;
}

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = document.getElementById("registerForm");
  const formData = new FormData(form);

  // Copy visible referral into the hidden one
  const visibleRef = document.getElementById("referralCodeVisible").value;
  formData.set("referralCode", visibleRef);

  try {
    const res = await fetch(`${API}/api/register`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!data.ok) {
      alert(data.error || "Registration failed.");
      return;
    }

    alert("Account created successfully!");
    window.location.href = "login.html";

  } catch (err) {
    console.error(err);
    alert("Network error — please try again.");
  }
});
