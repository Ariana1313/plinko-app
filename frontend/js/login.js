// login.js

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if(!username || !password) return alert('Missing credentials');

  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if(!res.ok || !data.ok) {
      alert(data.error || 'Login failed');
      return;
    }
    localStorage.setItem('plinkoUser', JSON.stringify(data.user));
    window.location.href = 'plinko.html';
  } catch(err) {
    console.error(err);
    alert('Network error');
  }
});
