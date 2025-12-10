// referral.js
const API = "https://plinko-app.onrender.com";

function getUser(){ return JSON.parse(localStorage.getItem('plinkoUser')||'null'); }

async function loadReferrals(){
  const u = getUser();
  if(!u){ alert('Please login'); location.href = 'login.html'; return; }
  try{
    const r = await fetch(`${API}/api/referrals/${u.id}`);
    const j = await r.json();
    if(!r.ok){ alert(j.error || 'Could not load referrals'); return; }
    const data = j.data;
    document.getElementById('code').innerText = data.referralCode || '—';
    document.getElementById('refLink').value = data.referralLink || '';
    const list = document.getElementById('referredList');
    list.innerHTML = '';
    if((data.referrals||[]).length === 0) list.innerHTML = '<p class="small-note">No referrals yet.</p>';
    else {
      const ul = document.createElement('ul');
      (data.referrals||[]).forEach(rf => {
        const li = document.createElement('li');
        li.innerText = `${rf.username || rf.email} — ${new Date(rf.date).toLocaleString()}`;
        ul.appendChild(li);
      });
      list.appendChild(ul);
    }
  }catch(e){ alert('Network error'); }
}

document.getElementById && document.getElementById('copyBtn')?.addEventListener('click', ()=>{
  const ref = document.getElementById('refLink'); if(!ref) return;
  ref.select(); ref.setSelectionRange(0,99999);
  document.execCommand('copy');
  alert('Link copied');
});

window.addEventListener('load', loadReferrals);
