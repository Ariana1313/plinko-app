const API = 'PLINKO_BACKEND_URL'; // e.g. http://localhost:3000 or https://my-backend.onrender.com

async function doRegister(formElement){
  // formElement is the <form> DOM node
  const fd = new FormData(formElement);
  try{
    const res = await fetch(API + '/api/register', { method:'POST', body: fd });
    const j = await res.json();
    if(!res.ok){ alert(j.error || 'Register failed'); return false; }
    alert('Registered! Please login.');
    return true;
  }catch(e){ alert('Network error'); return false; }
}

async function doLogin(username, password){
  try{
    const res = await fetch(API + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const j = await res.json();
    if(!res.ok){ throw new Error(j.error || 'Invalid login'); }
    // store public user
    localStorage.setItem('plinkoUser', JSON.stringify(j.user));
    return j.user;
  }catch(e){ throw e; }
}

async function doReset(email, secretPin, newPassword){
  try{
    const res = await fetch(API + '/api/forgot', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, secretPin, newPassword }) });
    const j = await res.json();
    if(!res.ok) throw new Error(j.error || 'Reset failed');
    return true;
  }catch(e){ throw e; }
}