// frontend/js/login.js
// Logs user in, stores the returned user in localStorage, then redirects to plinko.html

const API = "https://plinko-app.onrender.com";

function saveUser(user){
  try { localStorage.setItem('plinkoUser', JSON.stringify(user)); }
  catch(e){ console.warn('saveUser failed', e); }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if(!form){
    console.error('loginForm not found');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername')?.value?.trim() || '';
    const password = document.getElementById('loginPassword')?.value || '';

    if(!username || !password){
      alert('Enter username/email and password');
      return;
    }

    try {
      const res = await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if(!res.ok || !data.ok){
        alert(data.error || 'Login failed');
        return;
      }

      // Save user and go to plinko
      saveUser(data.user);
      window.location.href = 'plinko.html';
    } catch(err){
      console.error('login error', err);
      alert('Network error — please try again.');
    }
  });
});
