// plinko.js
const API = "https://plinko-app.onrender.com";

function getUser(){ return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); }

async function refreshBalance(){
  const u = getUser();
  if(!u) return;
  try{
    const r = await fetch(`${API}/api/user/${u.id}`);
    if(!r.ok) return;
    const j = await r.json();
    document.getElementById('balance') && (document.getElementById('balance').innerText = (j.balance||0).toFixed(2));
  }catch(e){}
}

async function addBonus(){
  const u = getUser();
  if(!u){ alert('Please login'); return; }
  try{
    const r = await fetch(`${API}/api/add-bonus`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: u.id, amount:150 })});
    const j = await r.json();
    if(!r.ok){ alert(j.error || 'Add bonus failed'); return; }
    await refreshBalance();
    alert('+$150 added!');
  }catch(e){ alert('Network error'); }
}

// simple plinko sim
function simulateDrop(){
  const steps = 10; let pos = 5;
  for(let i=0;i<steps;i++) pos += (Math.random() > 0.5 ? 1 : -1);
  pos = Math.max(0,Math.min(10,Math.floor(pos)));
  return pos;
}
function prizeForBin(i){
  if(i===5) return 4000;
  const arr = [0,5,10,25,50,0,50,100,250,1000,0];
  return arr[i]||0;
}

async function dropBall(){
  const u = getUser();
  const uid = u ? u.id : null;
  const bin = simulateDrop();
  const prize = prizeForBin(bin);
  try{
    const res = await fetch(`${API}/api/play`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: uid, winAmount: prize, triggeredBigBonus: prize===4000 })});
    const j = await res.json();
    if(!res.ok){ alert(j.error || 'Play failed'); return; }
    document.getElementById('result').innerHTML = `<strong>You won $${prize}</strong>`;
    await refreshBalance();
    if(prize===4000){
      // winner flow
      setTimeout(()=> location.href = `winner.html?userId=${uid}&amount=4000`, 900);
    }
  }catch(e){ alert('Network error'); console.error(e); }
}

window.addEventListener('load', ()=>{ refreshBalance(); document.getElementById('dropBtn')?.addEventListener('click', dropBall); document.getElementById('bonusBtn')?.addEventListener('click', addBonus); });
