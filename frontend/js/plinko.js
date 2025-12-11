// plinko.js
// expects auth.js to define getUser() and logout() helpers
// and the backend to have POST /api/play { userId, bet } -> { ok, balance, win, isJackpot, jackpotAward, message }

const API_BASE = (window.location.origin.indexOf('localhost') !== -1) ? 'http://localhost:3000' : window.location.origin;

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

let user = getUser(); // from auth.js
if(!user){
  // if not logged in, send to login
  location.href = 'login.html';
}

let canWithdraw = false; // unlocked after jackpot
let isAnimating = false;

// set header
usernameDisplay.innerText = user.username || 'Player';
userIdSmall.innerText = user.id ? `ID: ${user.id.slice(0,8)}` : '';
if(user.profileUrl){
  // profileUrl path might be relative to backend; make absolute if needed
  const maybe = user.profileUrl.startsWith('/') ? API_BASE + user.profileUrl : user.profileUrl;
  profilePic.src = maybe;
}

// referral link
const refLink = `${window.location.origin}/register.html?ref=${user.referralCode || ''}`;
referralInput.value = refLink;

// copy referral
copyRefBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(referralInput.value);
    copyRefBtn.innerText = 'Copied ✓';
    setTimeout(()=> copyRefBtn.innerText = 'Copy', 1400);
  } catch(e){
    alert('Copy failed: ' + (e.message || e));
  }
});

// logout
logoutBtn.addEventListener('click', () => {
  logout(); // from auth.js
});

// load sounds
const sndLose = document.getElementById('sndLose');
const sndWin = document.getElementById('sndWin');
const sndJackpot = document.getElementById('sndJackpot');
const sndTap = document.getElementById('sndTap');
const sndClap = document.getElementById('sndClap');

function playSound(s){
  try {
    s.currentTime = 0;
    s.play();
  } catch(e){}
}

// fetch fresh user info (balance)
async function refreshUser(){
  try {
    const res = await fetch(`${API_BASE}/api/user/${user.id}`);
    const data = await res.json();
    if(data && data.ok && data.user){
      user = data.user;
      saveUser(user);
      balanceDisplay.innerText = `$${(user.balance || 0).toFixed(0)}`;
      // withdraw unlocked if user has jackpot flag (assuming server sets hasWonBigBonus or allowWithdraw)
      // for safety we let server send flag at /api/user; check user.allowWithdraw or user.hasJackpot
      canWithdraw = !!user.allowWithdraw || !!user.hasJackpot || !!user.jackpotWon;
      withdrawBtn.disabled = !canWithdraw;
      withdrawBtn.innerText = canWithdraw ? 'Withdraw' : 'Withdraw (locked)';
    } else {
      console.warn('Failed to refresh user', data);
    }
  } catch(e){
    console.error('refreshUser err', e);
  }
}

// initial load
refreshUser();

// ---------- Plinko board drawing + animation (canvas) -----------
const canvas = document.getElementById('plinkoCanvas');
const ctx = canvas.getContext('2d');

// scale for crispness on high-DPI
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
  cols: 9,
  rows: 6,
  pegRadius: 6,
  pegSpacingX: 62,
  pegSpacingY: 60,
  leftPadding: 36,
  topPadding: 36,
};

function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // background
  ctx.fillStyle = '#f7fff7';
  roundRect(ctx, 0, 0, canvas.width/ (window.devicePixelRatio||1), canvas.height/(window.devicePixelRatio||1), 12, true, false);

  // draw pegs
  const w = canvas.width/(window.devicePixelRatio||1);
  const h = canvas.height/(window.devicePixelRatio||1);
  ctx.fillStyle = '#00c853';
  for(let r=0;r<board.rows;r++){
    const y = board.topPadding + r * board.pegSpacingY;
    for(let c=0;c<board.cols;c++){
      const offset = (r % 2 === 0) ? 0 : board.pegSpacingX/2;
      const x = board.leftPadding + offset + c * board.pegSpacingX;
      ctx.beginPath();
      ctx.ellipse(x, y, board.pegRadius, board.pegRadius*0.85, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // draw slots bottom
  const slotCount = board.cols + 1; // one more than columns
  const slotWidth = (w - (board.leftPadding*2)) / slotCount;
  const bottomY = board.topPadding + board.rows * board.pegSpacingY + 48;
  for(let i=0;i<slotCount;i++){
    const x = board.leftPadding + i*slotWidth;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, bottomY, slotWidth-6, 64);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.strokeRect(x, bottomY, slotWidth-6, 64);
  }

  // inject labels
  const labelsEl = document.getElementById('slotLabels');
  labelsEl.innerHTML = '';
  const amounts = ['LOSE', 10, 20, 50, 100, 200, 500, 1000, 'JACKPOT'];
  amounts.forEach(a => {
    const div = document.createElement('div');
    div.className = 'slot';
    div.innerText = typeof a === 'number' ? `$${a}` : a;
    labelsEl.appendChild(div);
  });
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

// simple confetti (small)
function showConfetti(){
  // lightweight confetti: create a few colored rectangles flying up
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
    el.style.borderRadius = '2px';
    overlay.appendChild(el);
    (function(e){
      setTimeout(()=>{ e.style.transition='transform 1s ease, top 1s ease, opacity 1s'; e.style.top = '110%'; e.style.opacity='0'; }, 40 + Math.random()*800);
      setTimeout(()=> e.remove(), 1600 + Math.random()*800);
    })(el);
  }
  setTimeout(()=> overlay.remove(), 2200);
}

// ---------- Play logic ----------
dropBtn.addEventListener('click', async () => {
  if(isAnimating) return;
  const bet = Number(betInput.value);
  if(!bet || bet <= 0){
    alert('Enter a valid bet amount (positive)');
    return;
  }

  dropBtn.disabled = true;
  isAnimating = true;
  resultBox.innerText = 'Playing…';
  playSound(sndTap);

  // request server to play
  try {
    const res = await fetch(`${API_BASE}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, bet: bet })
    });

    const data = await res.json();
    if(!data || !data.ok){
      // gracefully show server error
      resultBox.innerText = data && data.error ? `Error: ${data.error}` : 'Server error during play.';
      isAnimating = false;
      dropBtn.disabled = false;
      return;
    }

    // play animation and show result
    const winAmount = Number(data.win || 0);
    const isJackpot = !!data.isJackpot;
    await animateDrop(winAmount, isJackpot);

    // play sound and confetti
    if(isJackpot){
      playSound(sndJackpot);
      setTimeout(()=> playSound(sndClap), 600);
      showConfetti();
    } else if(winAmount > 0){
      playSound(sndWin);
    } else {
      playSound(sndLose);
    }

    // update local UI from server-returned balance
    if(typeof data.balance !== 'undefined'){
      balanceDisplay.innerText = `$${Number(data.balance).toFixed(0)}`;
      // update our stored user
      user.balance = data.balance;
      saveUser(user);
    } else {
      // fallback refresh
      await refreshUser();
    }

    // show nicely formatted result
    if(isJackpot){
      resultBox.innerHTML = `<b>JACKPOT!</b> You were awarded $${data.jackpotAward || 4000}. Congratulations!`;
      canWithdraw = true;
      withdrawBtn.disabled = false;
    } else if(winAmount > 0){
      resultBox.innerHTML = `You won $${winAmount}! ${data.message || ''}`;
    } else {
      resultBox.innerText = `No win this time. ${data.message || ''}`;
    }

  } catch(err){
    console.error('play err', err);
    resultBox.innerText = 'Network/server error — try again.';
  } finally {
    isAnimating = false;
    setTimeout(()=> { dropBtn.disabled = false; }, 700);
  }
});

// animate ball drop — we keep it deterministic for a given win amount when known
// If server returned winAmount, we align final slot to match winning (best-effort)
function animateDrop(winAmount, isJackpot){
  return new Promise((resolve) => {
    const w = canvas.width/(window.devicePixelRatio||1);
    const h = canvas.height/(window.devicePixelRatio||1);

    // pick a target slot index based on result:
    // amounts array must match labels: ['LOSE', 10,20,50,100,200,500,1000,'JACKPOT']
    const amounts = ['LOSE', 10, 20, 50, 100, 200, 500, 1000, 'JACKPOT'];
    let slotIndex = 0;
    if(isJackpot) slotIndex = amounts.length - 1;
    else if(winAmount && winAmount > 0){
      // find slot with that numeric amount
      const idx = amounts.findIndex(a => Number(a) === Number(winAmount));
      slotIndex = idx >= 0 ? idx : Math.floor(Math.random() * (amounts.length - 1));
    } else {
      // lost -> random leftmost or rightmost lose (index 0)
      slotIndex = 0;
    }

    // compute slot geometry
    const slotCount = amounts.length;
    const slotWidth = (w - (board.leftPadding*2)) / slotCount;
    const startX = w/2;
    const startY = 12;
    const endX = board.leftPadding + slotIndex * slotWidth + slotWidth/2;
    const endY = board.topPadding + board.rows * board.pegSpacingY + 40;

    // ball
    let ball = { x: startX, y: startY, vx: 0, vy: 0, r: 10 };
    const gravity = 0.5;

    // simple "random walk" then target snap
    let ticks = 0;
    const maxTicks = 120;
    const id = setInterval(() => {
      ticks++;
      // before snapping, do a jitter path
      if(ticks < maxTicks - 20){
        // small random walk and gravity
        ball.vy += gravity;
        // sideways pseudo-random
        ball.vx += (Math.random() - 0.5) * 1.8;
        ball.x += ball.vx;
        ball.y += ball.vy;

        // keep inside
        if(ball.x < board.leftPadding) ball.x = board.leftPadding;
        if(ball.x > w - board.leftPadding) ball.x = w - board.leftPadding;
        if(ball.y > endY - 10) ball.y = endY - 10;
      } else {
        // move toward final slot
        const dx = endX - ball.x;
        const dy = endY - ball.y;
        ball.x += dx * 0.18;
        ball.y += dy * 0.18;
      }

      // draw
      drawBoard();
      // draw ball
      ctx.beginPath();
      ctx.fillStyle = '#ffdf5c';
      ctx.ellipse(ball.x, ball.y, ball.r, ball.r, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffb400';
      ctx.stroke();

      if(ticks > maxTicks + 30){
        clearInterval(id);
        resolve();
      }
    }, 16);
  });
}

// withdraw button click
withdrawBtn.addEventListener('click', ()=>{
  if(!canWithdraw){
    alert('Withdrawals are locked until JACKPOT is unlocked. Please play until jackpot awarded.');
    return;
  }
  // if we allowed withdraw, open withdraw page or call withdraw popup; to avoid accidental actions we'll link to withdraw page
  location.href = 'withdraw.html';
});

// small helper to format money
function fmtMoney(n){ return `$${Number(n||0).toFixed(0)}`; }
