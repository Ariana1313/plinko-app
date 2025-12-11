// frontend/js/register.js

const API_BASE = "https://plinko-app.onrender.com";

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);

  try {
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      body: formData
    });

    const j = await res.json();
    if (!j.ok) return alert(j.error || "Registration failed");

    // SAVE USER TO LOCAL STORAGE
    localStorage.setItem("plinkoUser", JSON.stringify(j.user));

    alert("Registration successful! $150 bonus added.");
    location.href = "plinko.html";
    
  } catch (err) {
    alert("Network error.");
    console.log(err);
  }
});
