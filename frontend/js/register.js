// frontend/js/register.js
// Registers the user, saves returned user to localStorage, redirects to plinko.html

const API = "https://plinko-app.onrender.com";

// Minimal robust localStorage helpers (safe if auth.js exists too)
function saveUser(user){
  try { localStorage.setItem('plinkoUser', JSON.stringify(user)); }
  catch(e){ console.warn('saveUser failed', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  if(!form){
    console.error('registerForm not found');
    return;
  }

  // If a referral code exists in URL, fill hidden or visible input if present
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  const hiddenRef = document.querySelector('input[name="referralCode"]');
  const visibleRef = document.getElementById('referralCodeVisible');
  if(ref && hiddenRef) hiddenRef.value = ref;
  if(ref && visibleRef) visibleRef.value = ref;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);

    // If there is a visible referral field, copy it into the formData name "referralCode"
    if(visibleRef){
      formData.set('referralCode', visibleRef.value || '');
    }

    try {
      const res = await fetch(`${API}/api/register`, { method: 'POST', body: formData });
      const data = await res.json();

      if(!res.ok || !data.ok){
        alert(data.error || 'Registration failed. Please check details.');
        console.error('register error', data);
        return;
      }

      // Save user locally (server returns public user object)
      saveUser(data.user);

      alert('Registration successful — $150 bonus credited!');
      // Redirect to plinko page
      window.location.href = 'plinko.html';
    } catch (err) {
      console.error('Network/register error', err);
      alert('Network error — please try again.');
    }
  });
});
