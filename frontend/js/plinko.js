// frontend/js/plinko.js
const API = "https://plinko-app.onrender.com";

function getUser(){ try { return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); } catch(e){ return null; } }
function saveUser(u){ try { localStorage.setItem('plinkoUser', JSON.stringify(u)); } catch(e){} }
function logout(){ localStorage.removeItem('plinkoUser'); location.href = 'login.html'; }

const profilePic = document.getElementById('profilePic');
const usernameDisplay = document.getElementById('usernameDisplay');
const userIdSmall = document.getElementById('userIdSmall');
const balanceDisplay = document.getElementById('balanceDisplay');
const betInput = document.getElementById('betAmount');
const dropBtn = document.getElementById('dropBtn');
const resultBox = document.getElementById('resultBox');
const referralInput = document.getElementById('referralInput');
const copyRefBtn = document.getElementById('copyRef');
const withdrawBtn = document.getElementById('withdrawBtn');
const logoutBtn = document.getElementById('logoutBtn');

const sndLose = document.getElementById('sndLose');
const sndWin = document.getElementById('sndWin');
const sndJackpot = document.getElementById('sndJackpot');
const sndTap = document.getElementById('sndTap');
const sndClap = document.getElementById('sndClap');

function playSound(el){ try{ el.currentTime = 0; el.play(); }catch(e){} }

let user = getUser();
if(!user){ location.href = 'login.html'; } else { populateHeader(); refreshUser(); }

function populateHeader(){
  usernameDisplay.innerText = user.username || 'Player';
  userIdSmall && (userIdSmall.innerText = user.id ? `ID: ${user.id.slice(0,8)}` : '');
  if(profilePic){
    profilePic.src = user.profileUrl ? (user.profileUrl.startsWith('/') ? (API + user.profileUrl) : user.profileUrl) : 'assets/default-avatar.png';
  }
  balanceDisplay && (balanceDisplay.innerText = `$${Number(user.balance || 0).toFixed(0)}`);
  referralInput && (referralInput.value = `${location.origin}/register.html?ref=${user.referralCode || ''}`);
  if(withdrawBtn) withdrawBtn.disabled = !(user.jackpotAwarded || user.hasWonBigBonus);
}

copyRefBtn?.addEventListener('click', async ()=>{
  try{ await navigator.clipboard.writeText(referralInput.value); copyRefBtn.innerText = 'Copied ✓'; setTimeout(()=>copyRefBtn.innerText='Copy',1400); }catch(e){ alert('Copy failed'); }
});
logoutBtn?.addEventListener('click', logout);

async function refreshUser(){
  try{
    const r = await fetch(`${API}/api/user/${user.id}`);
    const j = await r.json();
    if(j && j.ok && j.user){ user = j.user; saveUser(user); populateHeader(); }
  }catch(e){ console.warn('refreshUser err', e); }
}

// Canvas
const canvas = document.getElementById('plinkoCanvas');
const ctx = canvas && canvas.getContext && canvas.getContext('2d');

function setCanvasSize(){
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
}
setCanvasSize();
window.addEventListener('resize', ()=>{ setCanvasSize(); drawBoard(); });

const board = { cols:8, rows:6, pegRadius:6, pegSpacingX:62, pegSpacingY:60, leftPadding:36, topPadding:36 };

function drawBoard(){
  if(!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width/(window.devicePixelRatio||1);
  const h = canvas.height/(window.devicePixelRatio||1);
  ctx.fillStyle = '#e8fff0';
  roundRect(ctx,0,0,w,h,12,true,false);
  ctx.fillStyle = '#00c853';
  for(let r=0;r<board.rows;r++){
    const y = board.topPadding + r * board.pegSpacingY;
    for(let c=0;c<=board.cols;c++){
      const offset = (r % 2) ? board.pegSpacingX/2 : 0;
      const x = board.leftPadding + offset + c * board.pegSpacingX;
      ctx.beginPath(); ctx.ellipse(x,y,board.pegRadius,board.pegRadius*0.85,0,0,Math.PI*2); ctx.fill();
    }
  }
  const slotCount = board.cols + 1;
  const slotWidth = (w - (board.leftPadding*2)) / slotCount;
  const bottomY = board.topPadding + board.rows * board.pegSpacingY + 48;
  for(let i=0;i<slotCount;i++){
    const x = board.leftPadding + i*slotWidth;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, bottomY, slotWidth-6, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.strokeRect(x, bottomY, slotWidth-6, 64);
  }
  const labelsEl = document.getElementById('slotLabels');
  if(labelsEl){
    labelsEl.innerHTML = '';
    const amounts = ['LOSE', 10,20,50,100,200,500,1000, 'JACKPOT'];
    amounts.forEach(a=>{
      const div = document.createElement('div'); div.className='slot'; div.innerText = typeof a === 'number' ? `$${a}`: a; labelsEl.appendChild(div);
    });
  }
}
drawBoard();
function roundRect(ctx,x,y,w,h,r,fill,stroke){ if(typeof stroke === 'undefined') stroke=true; if(typeof r === 'undefined') r=5; ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) ctx.stroke(); }

// Play logic
let isPlaying=false;
dropBtn?.addEventListener('click', async ()=>{
  if(isPlaying) return;
  const bet = Number(betInput?.value || 0);
  if(!bet || bet <= 0){ alert('Enter a valid bet amount'); return; }
  if((user.balance||0) < bet){ alert('Insufficient balance'); return; }

  isPlaying = true;
  dropBtn.disabled = true;
  resultBox && (resultBox.innerText = 'Playing…');
  playSound(sndTap);

  try{
    const res = await fetch(`${API}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ userId: user.id, bet: bet })
    });
    const j = await res.json();
    if(!res.ok || !j.ok){
      resultBox && (resultBox.innerText = j && j.error ? `Error: ${j.error}` : 'Play failed');
      await refreshUser();
      return;
    }

    const win = Number(j.outcome.won || 0);
    const isJack = !!j.outcome.jackpotUnlocked && (j.outcome.won >= 4000 || j.outcome.jackpotUnlocked);
    await animateDrop(win, isJack);

    if(isJack){ playSound(sndJackpot); setTimeout(()=> playSound(sndClap), 450); showConfetti(); }
    else if(win > 0){ playSound(sndWin); }
    else { playSound(sndLose); }

    user.balance = Number(j.outcome.balance || 0);
    user.cumulativeWins = j.outcome.cumulativeWins || user.cumulativeWins || 0;
    user.jackpotAwarded = !!j.outcome.jackpotUnlocked;
    saveUser(user);
    populateHeader();

    if(isJack) resultBox.innerHTML = `<strong>JACKPOT!</strong> Awarded $${j.outcome.won || 4000}`;
    else if(win > 0) resultBox.innerText = `You won $${win}!`;
    else resultBox.innerText = 'No win this time.';
  }catch(err){
    console.error('play error', err);
    resultBox && (resultBox.innerText = 'Network error — try again.');
    await refreshUser();
  } finally {
    isPlaying = false;
    setTimeout(()=> dropBtn.disabled = false, 800);
  }
});

function animateDrop(winAmount, isJackpot){
  return new Promise((resolve)=>{
    if(!canvas) return resolve();
    const w = canvas.width/(window.devicePixelRatio||1);
    const slotDefs = ['LOSE',10,20,50,100,200,500,1000,'JACKPOT'];
    let slotIndex = 0;
    if(isJackpot) slotIndex = slotDefs.length - 1;
    else if(winAmount && winAmount > 0){
      const idx = slotDefs.findIndex(s => Number(s) === Number(winAmount));
      slotIndex = idx >= 0 ? idx : Math.floor(Math.random()*(slotDefs.length-1));
    } else slotIndex = 0;

    const slotCount = slotDefs.length;
    const slotWidth = (w - board.leftPadding*2) / slotCount;
    const endX = board.leftPadding + slotIndex * slotWidth + slotWidth/2;
    const endY = board.topPadding + board.rows * board.pegSpacingY + 40;

    let ball = { x: w/2, y: 12, vx: 0, vy: 0, r: 10 };
    let frame = 0;
    const maxFrames = 200; // slower drop
    const id = setInterval(()=>{
      frame++;
      if(frame < maxFrames - 30){
        ball.vy += 0.38;
        ball.vx += (Math.random()-0.5) * 1.1;
        ball.x += ball.vx;
        ball.y += ball.vy;
        if(ball.x < board.leftPadding) ball.x = board.leftPadding;
        if(ball.x > w - board.leftPadding) ball.x = w - board.leftPadding;
      } else {
        ball.x += (endX - ball.x) * 0.16;
        ball.y += (endY - ball.y) * 0.16;
      }
      drawBoard();
      ctx.beginPath();
      ctx.fillStyle = '#ffdf5c';
      ctx.ellipse(ball.x, ball.y, ball.r, ball.r, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffb400';
      ctx.stroke();
      if(frame >= maxFrames + 10){ clearInterval(id); resolve(); }
    }, 16);
  });
}

function showConfetti(){
  const overlay = document.createElement('div');
  overlay.style.position='fixed'; overlay.style.left='0'; overlay.style.top='0'; overlay.style.width='100%'; overlay.style.height='100%'; overlay.style.pointerEvents='none';
  document.body.appendChild(overlay);
  const colors = ['#ffd700','#ff4d4f','#00e676','#00b0ff','#ff6ec7'];
  for(let i=0;i<60;i++){
    const el = document.createElement('div'); el.style.position='absolute'; el.style.left=(50+(Math.random()-0.5)*60)+'%'; el.style.top=(Math.random()*20)+'%';
    el.style.width='8px'; el.style.height='14px'; el.style.transform=`rotate(${Math.random()*360}deg)`; el.style.background=colors[Math.floor(Math.random()*colors.length)];
    el.style.opacity='0.95'; overlay.appendChild(el);
    (function(e){ setTimeout(()=>{ e.style.transition='transform 1s ease, top 1s ease, opacity 1s'; e.style.top='110%'; e.style.opacity='0'; }, 40 + Math.random()*800); setTimeout(()=> e.remove(), 1600 + Math.random()*800); })(el);
  }
  setTimeout(()=> overlay.remove(), 2200);
}

// withdraw
withdrawBtn?.addEventListener('click', async ()=>{
  if(!(user.jackpotAwarded || user.hasWonBigBonus)){ alert('Withdrawals locked until JACKPOT is awarded'); return; }
  const amt = Number(prompt('Enter withdrawal amount'));
  if(!amt || amt <= 0) return;
  if(amt > (user.balance || 0)) return alert('Insufficient balance');
  try{
    const r = await fetch(`${API}/api/withdraw`, { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ userId: user.id, amount: amt }) });
    const j = await r.json();
    if(!j.ok) return alert('Withdraw failed: ' + (j.error||''));
    alert('Withdraw request submitted.');
    await refreshUser();
  }catch(e){ alert('Network error'); }
});

// periodic refresh
setInterval(()=>{ if(user) refreshUser(); }, 45000);
