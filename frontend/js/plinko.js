// frontend/js/plinko.js
// Plinko behavior: loads user, refreshes user from server, sends POST /api/play { userId, bet }

const API = "https://plinko-app.onrender.com";

// small localStorage helpers
function getUser(){
  try { return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); }
  catch(e){ return null; }
}
function saveUser(u){ try { localStorage.setItem('plinkoUser', JSON.stringify(u)); } catch(e){} }
function logout(){ localStorage.removeItem('plinkoUser'); location.href = 'login.html'; }

// DOM
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

function playSound(el){
  try { el.currentTime = 0; el.play(); } catch(e){}
}

// load user
let user = getUser();
if(!user){
  location.href = 'login.html';
} else {
  populateHeader();
  refreshUser(); // get latest from server
}

function populateHeader(){
  usernameDisplay.innerText = user.username || 'Player';
  userIdSmall.innerText = user.id ? `ID: ${user.id.slice(0,8)}` : '';
  if(user.profileUrl){
    profilePic.src = user.profileUrl.startsWith('/') ? (API + user.profileUrl) : user.profileUrl;
  } else {
    profilePic.src = 'assets/default-avatar.png';
  }
  balanceDisplay.innerText = `$${Number(user.balance || 0).toFixed(0)}`;
  referralInput.value = `${location.origin}/register.html?ref=${user.referralCode || ''}`;
  withdrawBtn.disabled = !(user.jackpotUnlocked || user.jackpotAwarded || user.hasWonBigBonus);
  withdrawBtn.innerText = withdrawBtn.disabled ? 'Withdraw (locked)' : 'Withdraw';
}

// copy referral
copyRefBtn?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(referralInput.value);
    copyRefBtn.innerText = 'Copied ✓';
    setTimeout(()=> copyRefBtn.innerText = 'Copy', 1400);
  } catch(e){
    alert('Copy failed');
  }
});

// logout
logoutBtn?.addEventListener('click', logout);

// refresh user from server
async function refreshUser(){
  try {
    const r = await fetch(`${API}/api/user/${user.id}`);
    const j = await r.json();
    if(j && j.ok && j.user){
      user = j.user;
      saveUser(user);
      populateHeader();
    }
  } catch(e){ console.warn('refreshUser err', e); }
}

// -- Canvas & board drawing (keeps visuals) --
const canvas = document.getElementById('plinkoCanvas');
const ctx = canvas.getContext('2d');

function setCanvasSize(){
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
setCanvasSize();
window.addEventListener('resize', () => { setCanvasSize(); drawBoard(); });

const board = {
  cols: 8,
  rows: 6,
  pegRadius: 6,
  pegSpacingX: 62,
  pegSpacingY: 60,
  leftPadding: 36,
  topPadding: 36
};

function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width/(window.devicePixelRatio||1);
  const h = canvas.height/(window.devicePixelRatio||1);
  ctx.fillStyle = '#f7fff7';
  roundRect(ctx, 0, 0, w, h, 12, true, false);

  ctx.fillStyle = '#00c853';
  for(let r=0;r<board.rows;r++){
    const y = board.topPadding + r * board.pegSpacingY;
    for(let c=0;c<=board.cols;c++){
      const offset = (r % 2) ? board.pegSpacingX/2 : 0;
      const x = board.leftPadding + offset + c * board.pegSpacingX;
      ctx.beginPath();
      ctx.ellipse(x, y, board.pegRadius, board.pegRadius*0.85, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  const slotCount = board.cols + 1;
  const slotWidth = (w - (board.leftPadding*2)) / slotCount;
  const bottomY = board.topPadding + board.rows * board.pegSpacingY + 48;
  for(let i=0;i<slotCount;i++){
    const x = board.leftPadding + i*slotWidth;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, bottomY, slotWidth-6, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.strokeRect(x, bottomY, slotWidth-6, 64);
  }

  // inject labels (client)
  const labelsEl = document.getElementById('slotLabels');
  if(labelsEl){
    labelsEl.innerHTML = '';
    const amounts = ['LOSE', 10, 20, 50, 100, 200, 500, 1000, 'JACKPOT'];
    amounts.forEach(a => {
      const div = document.createElement('div');
      div.className = 'slot';
      div.innerText = typeof a === 'number' ? `$${a}` : a;
      labelsEl.appendChild(div);
    });
  }
}
drawBoard();

function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if (typeof stroke === 'undefined') stroke = true;
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// result / play logic
let isPlaying = false;
dropBtn.addEventListener('click', async () => {
  if(isPlaying) return;
  const bet = Number(betInput.value);
  if(!bet || bet <= 0){
    alert('Enter a valid bet amount');
    return;
  }

  isPlaying = true;
  dropBtn.disabled = true;
  resultBox.innerText = 'Playing…';
  playSound(sndTap);

  try {
    const res = await fetch(`${API}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, bet })
    });
    const j = await res.json();

    if(!res.ok || !j.ok){
      resultBox.innerText = j && j.error ? `Error: ${j.error}` : 'Play failed';
      await refreshUser();
      return;
    }

    // animate and show result
    const win = Number(j.win || 0);
    const isJack = !!j.isJackpot;
    await animateDrop(win, isJack);

    if(isJack){
      playSound(sndJackpot);
      setTimeout(()=> playSound(sndClap), 450);
      showConfetti();
    } else if(win > 0){
      playSound(sndWin);
    } else {
      playSound(sndLose);
    }

    // update user & UI from server-authoritative response
    user.balance = Number(j.balance || 0);
    if(j.jackpotAward && j.jackpotAward > 0){
      user.jackpotAwarded = true;
      user.jackpotUnlocked = true;
    }
    saveUser(user);
    populateHeader();

    if(isJack){
      resultBox.innerHTML = `<b>JACKPOT!</b> You were awarded $${j.jackpotAward || 4000}.`;
      withdrawBtn.disabled = false;
    } else if(win > 0){
      resultBox.innerText = `You won $${win}!`;
    } else {
      resultBox.innerText = 'No win this time.';
    }
  } catch(e){
    console.error('play error', e);
    resultBox.innerText = 'Network error — try again.';
    await refreshUser();
  } finally {
    isPlaying = false;
    setTimeout(()=> dropBtn.disabled = false, 800);
  }
});

function animateDrop(winAmount, isJackpot){
  return new Promise((resolve) => {
    const w = canvas.width/(window.devicePixelRatio||1);
    const slotDefs = ['LOSE',10,20,50,100,200,500,1000,'JACKPOT'];
    let slotIndex = 0;
    if(isJackpot) slotIndex = slotDefs.length - 1;
    else if(winAmount && winAmount > 0){
      const idx = slotDefs.findIndex(s => Number(s) === Number(winAmount));
      slotIndex = idx >= 0 ? idx : Math.floor(Math.random()*(slotDefs.length-1));
    } else {
      slotIndex = 0;
    }

    const slotCount = slotDefs.length;
    const slotWidth = (w - board.leftPadding*2) / slotCount;
    const endX = board.leftPadding + slotIndex * slotWidth + slotWidth/2;
    const endY = board.topPadding + board.rows * board.pegSpacingY + 40;

    let ball = { x: w/2, y: 12, vx: 0, vy: 0, r: 10 };
    let frame = 0;
    const maxFrames = 140;
    const id = setInterval(() => {
      frame++;
      if(frame < maxFrames - 18){
        ball.vy += 0.45;
        ball.vx += (Math.random() - 0.5) * 1.5;
        ball.x += ball.vx;
        ball.y += ball.vy;
        if(ball.x < board.leftPadding) ball.x = board.leftPadding;
        if(ball.x > w - board.leftPadding) ball.x = w - board.leftPadding;
      } else {
        ball.x += (endX - ball.x) * 0.18;
        ball.y += (endY - ball.y) * 0.18;
      }

      drawBoard();
      ctx.beginPath();
      ctx.fillStyle = '#ffdf5c';
      ctx.ellipse(ball.x, ball.y, ball.r, ball.r, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffb400';
      ctx.stroke();

      if(frame >= maxFrames + 10){
        clearInterval(id);
        resolve();
      }
    }, 16);
  });
}

function showConfetti(){
  const overlay = document.createElement('div');
  overlay.style.position='fixed';
  overlay.style.left='0';
  overlay.style.top='0';
  overlay.style.width='100%';
  overlay.style.height='100%';
  overlay.style.pointerEvents='none';
  document.body.appendChild(overlay);
  const colors = ['#ffd700','#ff4d4f','#00e676','#00b0ff','#ff6ec7'];
  for(let i=0;i<60;i++){
    const el = document.createElement('div');
    el.style.position='absolute';
    el.style.left = (50 + (Math.random()-0.5)*60) + '%';
    el.style.top = (Math.random()*20) + '%';
    el.style.width = '8px';
    el.style.height = '14px';
    el.style.transform = `rotate(${Math.random()*360}deg)`;
    el.style.background = colors[Math.floor(Math.random()*colors.length)];
    el.style.opacity = '0.95';
    overlay.appendChild(el);
    (function(e){ setTimeout(()=>{ e.style.transition='transform 1s ease, top 1s ease, opacity 1s'; e.style.top = '110%'; e.style.opacity='0'; }, 40 + Math.random()*800); setTimeout(()=> e.remove(), 1600 + Math.random()*800); })(el);
  }
  setTimeout(()=> overlay.remove(), 2200);
}

// withdraw behavior (simple)
withdrawBtn?.addEventListener('click', async () => {
  if(!(user.jackpotUnlocked || user.jackpotAwarded || user.hasWonBigBonus)){
    alert('Withdrawals locked — win the jackpot to enable withdrawals.');
    return;
  }
  const amt = Number(prompt('Amount to withdraw'));
  if(!amt || amt <= 0) return;
  if(amt > (user.balance || 0)) return alert('Insufficient balance');
  try {
    const r = await fetch(`${API}/api/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, amount: amt })
    });
    const j = await r.json();
    if(!j.ok) return alert('Withdraw request failed: ' + (j.error || ''));
    alert('Withdraw request submitted. Admin will process it.');
    await refreshUser();
  } catch(e){
    alert('Network error during withdraw.');
  }
});

// periodic refresh
setInterval(()=>{ if(user) refreshUser(); }, 45000);
