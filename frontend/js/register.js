// frontend/js/register.js
const API = "https://plinko-app.onrender.com";

// Save user locally
function saveUser(user){
  try { 
    localStorage.setItem('plinkoUser', JSON.stringify(user));
  } catch(e){
    console.warn('saveUser failed', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  if(!form){
    console.error('registerForm not found');
    return;
  }

  // Handle referral
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  const hiddenRef = document.querySelector('input[name="referralCode"]');
  const visibleRef = document.getElementById('referralCodeVisible');

  if(ref && hiddenRef) hiddenRef.value = ref;
  if(ref && visibleRef) visibleRef.value = ref;

  // Password confirm
  const pw = document.getElementById("password");
  const cpw = document.getElementById("confirmPassword");

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Check passwords match
    if(pw && cpw && pw.value !== cpw.value){
      alert("Passwords do not match");
      return;
    }

    // Collect data in JSON format (backend expects JSON)
    const userData = {
      email: document.getElementById("email").value.trim(),
      password: pw.value.trim(),
      referralCode: visibleRef ? visibleRef.value.trim() : ""
    };

    try {
      const res = await fetch(`${API}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
      });

      const data = await res.json();
      console.log("[REGISTER RESPONSE]", data);

      if(!res.ok || !data.ok){
        alert(data.error || "Registration failed");
        return;
      }

      saveUser(data.user);
      alert("Registration successful — $150 credited!");

      window.location.href = "plinko.html";

    } catch (err) {
      console.error("Register error:", err);
      alert("Network error — please try again.");
    }
  });
});
