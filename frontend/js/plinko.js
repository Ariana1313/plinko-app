// frontend/js/plinko.js
// Plinko frontend logic matched to backend response:
// POST /api/play  -> { ok, balance, win, isJackpot, jackpotAward, message }

// Helpers from your auth.js (should exist)
function getUserSafe(){
  try { return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); }
  catch(e){ return null; }
}
function saveUserSafe(u){ localStorage.setItem('plinkoUser', JSON.stringify(u)); }
function logoutSafe(){ localStorage.removeItem('plinkoUser'); location.href = 'login.html'; }

// DOM references
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

function safePlaySound(audioEl){
  try{ audioEl.currentTime = 0; audioEl.play(); } catch(e){}
}

// load user
let user = getUserSafe();
if(!user){
  // not logged in -> redirect to login
  location.href = 'login.html';
} else {
  populateHeader();
  refreshUser(); // get the freshest data from server
}

function populateHeader(){
  usernameDisplay.innerText = user.username || 'Player';
  userIdSmall.innerText = user.id ? `ID: ${user.id.slice(0,8)}` : '';
  if(user.profileUrl){
    // profileUrl might be a relative path; make absolute if it starts with /
    profilePic.src = user.profileUrl.startsWith('/') ? (API_BASE + user.profileUrl) : user.profileUrl;
  } else {
    profilePic.src = 'assets/default-avatar.png';
  }
  balanceDisplay.innerText = `$${Number(user.balance || 0).toLocaleString()}`;
  referralInput.value = `${location.origin}/register.html?ref=${user.referralCode || ''}`;
  withdrawBtn.disabled = !(user.jackpotUnlocked || user.jackpotAwarded || user.hasWonBigBonus);
  withdrawBtn.innerText = withdrawBtn.disabled ? 'Withdraw (locked)' : 'Withdraw';
}

// copy referral
copyRefBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(referralInput.value);
    copyRefBtn.innerText = 'Copied ✓';
    setTimeout(()=> copyRefBtn.innerText = 'Copy', 1600);
  } catch(e){
    alert('Copy failed: ' + (e.message || e));
  }
});

// logout
logoutBtn?.addEventListener('click', () => logoutSafe());

// refresh latest user from server
async function refreshUser(){
  try{
    const resp = await fetch(`${API_BASE}/api/user/${user.id}`);
    const j = await resp.json();
    if(j && j.ok && j.user){
      user = j.user;
      saveUserSafe(user);
      populateHeader();
    } else {
      console.warn('refreshUser no data', j);
    }
  }catch(e){
    console.warn('refreshUser err', e);
  }
}

// Canvas board + animation utilities
const canvas = document.getElementById('plinkoCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', () => { resizeCanvas(); drawBoard(); });

const boardConfig = {
  rows: 6,
  cols: 8,
  pegRadius: 6,
  leftPadding: 36,
  topPadding: 36,
  pegSpacingX: 62,
  pegSpacingY: 60
};

function drawBoard(){
  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // un-high DPI adjusted width/height
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  // background
  ctx.fillStyle = '#f7fff7';
  roundRect(ctx, 0, 0, w, h, 12, true, false);

  // pegs
  ctx.fillStyle = '#00c853';
  for(let r=0;r<boardConfig.rows;r++){
    const y = boardConfig.topPadding + r * boardConfig.pegSpacingY;
    for(let c=0;c<=boardConfig.cols;c++){
      const offsetX = (r % 2) ? boardConfig.pegSpacingX/2 : 0;
      const x = boardConfig.leftPadding + offsetX + c * boardConfig.pegSpacingX;
      ctx.beginPath();
      ctx.ellipse(x, y, boardConfig.pegRadius, boardConfig.pegRadius*0.9, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // bottom slots
  const slotCount = boardConfig.cols + 1;
  const slotW = (w - boardConfig.leftPadding*2) / slotCount;
  const bottomY = boardConfig.topPadding + boardConfig.rows * boardConfig.pegSpacingY + 36;
  ctx.fillStyle = '#fff';
  for(let i=0;i<slotCount;i++){
    const x = boardConfig.leftPadding + i*slotW;
    ctx.fillRect(x, bottomY, slotW - 6, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.strokeRect(x, bottomY, slotW - 6, 64);
  }
  // labels (client side label element already created in html)
}
resizeCanvas();
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

// Play flow
let playing = false;
dropBtn.addEventListener('click', async () => {
  if(playing) return;
  const bet = Number(betInput.value);
  if(!bet || bet <= 0){
    alert('Enter a valid bet (>0).');
    return;
  }

  // Show a little UI feedback and disable button
  playing = true;
  dropBtn.disabled = true;
  resultBox.innerText = 'Playing…';
  safePlaySound(sndTap);

  try{
    // Call server: server enforces balance and returns final result
    const r = await fetch(`${API_BASE}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, bet })
    });
    const j = await r.json();
    if(!j || !j.ok){
      // server-side error (e.g., insufficient funds) — show message, refresh user
      const msg = j && j.error ? j.error : 'Server error during play';
      resultBox.innerText = `Error: ${msg}`;
      await refreshUser();
      return;
    }

    // j: { ok, balance, win, isJackpot, jackpotAward, message }
    // animate ball to slot that corresponds to win
    const win = Number(j.win || 0);
    const isJackpot = !!j.isJackpot;
    await animateBallToResult(win, isJackpot);

    // play sounds & show confetti on jackpot
    if(isJackpot){
      safePlaySound(sndJackpot);
      setTimeout(()=> safePlaySound(sndClap), 450);
      showConfetti();
    } else if(win > 0){
      safePlaySound(sndWin);
    } else {
      safePlaySound(sndLose);
    }

    // update UI with server-authoritative balance
    user.balance = Number(j.balance || 0);
    saveUserSafe(user);
    populateHeader();

    // result display
    if(isJackpot){
      resultBox.innerHTML = `<strong>JACKPOT!</strong> You were awarded $${j.jackpotAward || 4000}. Congratulations!`;
      // enable withdraw
      withdrawBtn.disabled = false;
      withdrawBtn.innerText = 'Withdraw';
    } else if(win > 0){
      resultBox.innerText = `You won $${win}. ${j.message || ''}`;
    } else {
      resultBox.innerText = `No win this time. ${j.message || ''}`;
    }

  } catch(err){
    console.error('play error', err);
    resultBox.innerText = 'Network error. Try again.';
    await refreshUser();
  } finally {
    playing = false;
    setTimeout(()=> { dropBtn.disabled = false; }, 600);
  }
});

// animate ball to server result (best-effort)
function animateBallToResult(winAmount, isJackpot){
  return new Promise((resolve) => {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    // slot mapping consistent with server slots:
    // ['LOSE',10,20,50,100,200,500,1000,'JACKPOT']
    const slots = ['LOSE',10,20,50,100,200,500,1000,'JACKPOT'];
    let targetIndex = 0;
    if(isJackpot) targetIndex = slots.length - 1;
    else if(winAmount > 0){
      const idx = slots.findIndex(s => Number(s) === Number(winAmount));
      targetIndex = idx >= 0 ? idx : Math.floor((Math.random() * (slots.length-1)));
    } else {
      // if lose, bias to left-most (0) or near left
      targetIndex = 0;
    }

    const slotCount = slots.length;
    const slotWidth = (w - boardConfig.leftPadding * 2) / slotCount;
    const endX = boardConfig.leftPadding + targetIndex * slotWidth + slotWidth/2;
    const endY = boardConfig.topPadding + boardConfig.rows * boardConfig.pegSpacingY + 40;
    let ball = { x: w/2, y: 12, vx: 0, vy: 0, r: 10 };

    let frame = 0;
    const maxFrames = 140;
    const id = setInterval(() => {
      frame++;
      // simple physics-ish random walk then snap to target
      if(frame < maxFrames - 20){
        ball.vy += 0.45;
        ball.vx += (Math.random() - 0.5) * 1.6;
        ball.x += ball.vx;
        ball.y += ball.vy;
        // keep inside bounds
        if(ball.x < boardConfig.leftPadding) ball.x = boardConfig.leftPadding;
        if(ball.x > w - boardConfig.leftPadding) ball.x = w - boardConfig.leftPadding;
        if(ball.y > endY - 10) ball.y = endY - 10;
      } else {
        // ease toward endX/endY
        ball.x += (endX - ball.x) * 0.18;
        ball.y += (endY - ball.y) * 0.18;
      }

      // render
      drawBoard();
      // ball
      ctx.beginPath();
      ctx.fillStyle = '#fff7c2';
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

// small confetti visual (DOM based)
function showConfetti(){
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none';
  fragment.appendChild(container);
  const colors = ['#ffd700','#ff4d4f','#00e676','#00b0ff','#ff6ec7'];
  for(let i=0;i<60;i++){
    const p = document.createElement('div');
    p.style.position = 'absolute';
    p.style.left = (50 + (Math.random()-0.5)*60) + '%';
    p.style.top = (Math.random()*20) + '%';
    p.style.width = '8px';
    p.style.height = '14px';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.transform = `rotate(${Math.random()*360}deg)`;
    p.style.borderRadius = '2px';
    container.appendChild(p);
    (function(el){
      setTimeout(()=>{ el.style.transition = 'transform 1s ease, top 1s ease, opacity 1s'; el.style.top = '110%'; el.style.opacity = '0'; }, 40 + Math.random()*800);
      setTimeout(()=> el.remove(), 1700 + Math.random()*800);
    })(p);
  }
  document.body.appendChild(container);
  setTimeout(()=> container.remove(), 2200);
}

// withdraw button behavior (locked until server allows)
withdrawBtn.addEventListener('click', async () => {
  // If locked, show info
  if(!user.jackpotUnlocked && !user.jackpotAwarded && !user.hasWonBigBonus){
    alert('Withdrawals are locked until you unlock the JACKPOT. Keep playing!');
    return;
  }
  // open withdraw page (or implement a quick prompt)
  const amt = Number(prompt('Enter withdrawal amount'));
  if(!amt || amt <= 0) return;
  if(amt > (user.balance || 0)) return alert('Insufficient balance');
  // send withdraw request
  try{
    const res = await fetch(`${API_BASE}/api/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, amount: amt })
    });
    const j = await res.json();
    if(!j.ok) return alert('Withdraw failed: ' + (j.error || ''));
    alert('Withdraw request submitted. Admin will process it.');
    await refreshUser();
  } catch(e){
    alert('Withdraw network error.');
    console.error(e);
  }
});

// safe refresh interval (keep user balance current)
setInterval(() => { if(user) refreshUser(); }, 45000);
