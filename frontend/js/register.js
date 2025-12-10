// register.js
const API = "https://plinko-app.onrender.com";

async function doRegister(e){
  e.preventDefault();
  const form = document.getElementById('registerForm');
  const fd = new FormData(form);

  try{
    const res = await fetch(`${API}/api/register`, { method:'POST', body: fd });
    const j = await res.json();
    if(!res.ok){ alert(j.error || 'Register failed'); return; }
    alert('Registered! Please login.');
    location.href = 'login.html';
  }catch(err){ alert('Network error'); console.error(err); }
}

document.getElementById && document.getElementById('registerForm')?.addEventListener('submit', doRegister);
