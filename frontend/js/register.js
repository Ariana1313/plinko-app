// frontend/js/register.js
const API = "https://plinko-app.onrender.com";

// detect referral in URL and prefill
(function(){
  try{
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if(ref){
      // fill hidden input
      const hid = document.getElementById('referralCode');
      if(hid) hid.value = ref;
      const vis = document.getElementById('referralCodeVisible');
      if(vis) vis.value = ref;
    }
  }catch(e){}
})();

async function doRegister(e){
  e.preventDefault();
  const form = document.getElementById('registerForm');
  const fd = new FormData(form);

  // if user typed a visible referral, prefer it
  const vis = document.getElementById('referralCodeVisible');
  if(vis && vis.value.trim()){
    fd.set('referralCode', vis.value.trim());
  }

  try{
    const res = await fetch(`${API}/api/register`, { method:'POST', body: fd });
    const j = await res.json();
    if(!res.ok){ alert(j.error || 'Register failed'); return; }
    // optionally inform user who referred them
    if(j.user && j.user.referredBy) {
      alert('Registered! Referred by: ' + j.user.referredBy);
    } else {
      alert('Registered! Please login.');
    }
    window.location.href = 'login.html';
  }catch(err){ alert('Network error'); console.error(err); }
}

document.getElementById && document.getElementById('registerForm')?.addEventListener('submit', doRegister);
