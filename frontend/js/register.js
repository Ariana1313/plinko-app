// frontend/js/register.js
const API = "https://plinko-app.onrender.com";

function saveUser(user){
  try { localStorage.setItem('plinkoUser', JSON.stringify(user)); }
  catch(e){ console.warn('saveUser failed', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  if(!form){ console.error('registerForm not found'); return; }

  // autofill referral if ?ref= exists
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  const hiddenRef = document.querySelector('input[name="referralCode"]');
  const visibleRef = document.getElementById('referralCodeVisible');
  if(ref && hiddenRef) hiddenRef.value = ref;
  if(ref && visibleRef) visibleRef.value = ref;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // check password match if confirm exists
    const pwField = document.getElementById('password');
    const cpwField = document.getElementById('confirmPassword');
    if(pwField && cpwField && pwField.value !== cpwField.value){
      alert('Passwords do not match');
      return;
    }

    const formData = new FormData(form);
    if(visibleRef) formData.set('referralCode', visibleRef.value || '');

    try {
      const res = await fetch(`${API}/api/register`, { method: 'POST', body: formData });
      const data = await res.json();
      console.log('[register] response', data);
      if(!res.ok || !data.ok){
        alert(data.error || 'Registration failed');
        return;
      }

      saveUser(data.user);
      alert('Registration successful — $150 credited!');
      // redirect directly to plinko page
      window.location.href = 'plinko.html';
    } catch (err) {
      console.error('register network err', err);
      alert('Network error — please try again.');
    }
  });
});
