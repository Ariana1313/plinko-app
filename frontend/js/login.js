// login.js
const API = "https://plinko-app.onrender.com";

async function doLogin(e){
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if(!username || !password){ alert('Enter credentials'); return; }
  try{
    const res = await fetch(`${API}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password })});
    const j = await res.json();
    if(!res.ok){ alert(j.error || 'Login failed'); return; }
    // j.user is public user object from backend
    saveUser(j.user);
    location.href = 'plinko.html';
  }catch(err){ alert('Network error'); console.error(err); }
}

document.getElementById && document.getElementById('loginForm')?.addEventListener('submit', doLogin);
