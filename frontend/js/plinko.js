// frontend/js/plinko.js
// Replace entire file with this. Uses API at your deployed backend.
const API = "https://plinko-app.onrender.com";

// --- Helpers for user local storage ---
function getUser(){ try { return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); } catch(e){ return null; } }
function saveUser(u){ try { localStorage.setItem('plinkoUser', JSON.stringify(u)); } catch(e){} }
function logout(){ localStorage.removeItem('plinkoUser'); location.href = 'login.html'; }

// --- Elements (make sure your HTML contains these ids/classes) ---
const canvas = document.getElementById('plinkoCanvas');
const profilePic = document.getElementById('profilePic');
const usernameDisplay = document.getElementById('usernameDisplay');
const balanceDisplay = document.getElementById('balanceDisplay');
const betInput = document.getElementById('betAmount');
const dropBtn = document.getElementById('dropBtn');
const resultBox = document.getElementById('resultBox');
const referralInput = document.getElementById('referralInput');
const copyRefBtn = document.getElementById('copyRef');
const withdrawBtn = document.getElementById('withdrawBtn');
const logoutBtn = document.getElementById('logoutBtn');
const slotLabels = document.getElementById('slotLabels'); // optional container to render slot labels

// Sound elements (make sure you have audio tags with these ids or change the selectors)
const sndLose = document.getElementById('sndLose');
const sndWin = document.getElementById('sndWin');
const sndJackpot = document.getElementById('sndJackpot');
const sndTap = document.getElementById('sndTap');
const sndClap = document.getElementById('sndClap');

// Play audio safely
function playSound(el){
  try { if(!el) return; el.currentTime = 0; el.play(); } catch(e){}
}

// --- Basic UI population & user load ---
let user = getUser();
if(!user){ location.href = 'login.html'; }
else { populateHeader(); refreshUserFromServer(); }

function populateHeader(){
  usernameDisplay && (usernameDisplay.innerText = user.username || 'Player');
  balanceDisplay && (balanceDisplay.innerText = `$${Number(user.balance || 0).toFixed(0)}`);
  profilePic && (profilePic.src = user.profileUrl ? (user.profileUrl.startsWith('/') ? API + user.profileUrl : user.profileUrl) : 'assets/default-avatar.png');
  if(referralInput) referralInput.value = `${location.origin}/register.html?ref=${user.referralCode || ''}`;
  if(withdrawBtn) withdrawBtn.disabled = !user.hasWonJackpot;
}

// refresh user from backend (updates local copy)
async function refreshUserFromServer(){
  try{
    const r = await fetch(`${API}/api/user/${user.id}`);
    const j = await r.json();
    if(j.ok && j.user){
      user = j.user;
      saveUser(user);
      populateHeader();
    }
  }catch(e){ console.warn('refresh error', e); }
}

// Copy referral
copyRefBtn?.addEventListener('click', async ()=>{
  try{ await navigator.clipboard.writeText(referralInput.value); copyRefBtn.innerText = 'Copied ✓'; setTimeout(()=>copyRefBtn.innerText='Copy',1600); }catch(e){ alert('Copy failed'); }
});
logoutBtn?.addEventListener('click', logout);

// --- Canvas & board drawing ---
if(!canvas) console.warn('plinkoCanvas not found in html');
const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

function setCanvasSize(){
  if(!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
}
window.addEventListener('resize', () => { setCanvasSize(); drawBoard(); });
setCanvasSize();

// board config (tweak for look)
const board = {
  cols: 8,
  rows: 6,
  pegRadius: 6,
  pegSpacingX: 62,
  pegSpacingY: 60,
  leftPadding: 36,
  topPadding: 36
};

// slot definitions (must match server values; used only for UI mapping)
const SLOT_ORDER = ['LOSE', 10,20,50,100,200,500,1000,'JACKPOT'];

function drawBoard(){
  if(!ctx) return;
  const w = canvas.width/(window.devicePixelRatio||1);
  const h = canvas.height/(window.devicePixelRatio||1);
  ctx.clearRect(0,0,w,h);

  // background
  ctx.fillStyle = '#f8fff8';
  roundRect(ctx,0,0,w,h,12,true,false);

  // pegs
  ctx.fillStyle = '#00c853';
  for(let r=0;r<board.rows;r++){
    const y = board.topPadding + r * board.pegSpacingY;
    for(let c=0;c<=board.cols;c++){
      const offset = (r % 2) ? board.pegSpacingX/2 : 0;
      const x = board.leftPadding + offset + c * board.pegSpacingX;
      ctx.beginPath();
      ctx.ellipse(x,y,board.pegRadius,board.pegRadius*0.9,0,0,Math.PI*2);
      ctx.fill();
    }
  }

  // slots (bottom)
  const slotCount = SLOT_ORDER.length;
  const slotWidth = (w - (board.leftPadding*2)) / slotCount;
  const bottomY = board.topPadding + board.rows * board.pegSpacingY + 36;
  for(let i=0;i<slotCount;i++){
    const x = board.leftPadding + i*slotWidth;
    ctx.fillStyle = '#fff';
    roundRect(ctx, x+3, bottomY, slotWidth-8, 64,8,true,true);
  }

  // render slot labels into DOM if available (mobile-friendly)
  if(slotLabels){
    slotLabels.innerHTML = '';
    SLOT_ORDER.forEach(a=>{
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerText = (typeof a === 'number') ? `$${a}` : a;
      slotLabels.appendChild(el);
    });
  }
}
function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(typeof r==='undefined') r=6;
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill) ctx.fill();
  if(stroke){ ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.stroke(); }
}
drawBoard();

// --- Play flow (debounced, safe) ---
let isPlaying = false;
dropBtn?.addEventListener('click', onDropClick);

async function onDropClick(){
  if(isPlaying) return;
  const bet = Number(betInput?.value || 0);
  if(!bet || bet <= 0){ alert('Enter a valid bet amount'); return; }
  if((user.balance||0) < bet){ alert('Insufficient balance'); return; }

  isPlaying = true;
  dropBtn.disabled = true;
  resultBox && (resultBox.innerText = 'Playing…');
  playSound(sndTap);

  // optimistic UI: show temporary deducted balance (server is authoritative)
  const oldBalance = Number(user.balance || 0);
  user.balance = Math.max(0, oldBalance - bet);
  balanceDisplay.innerText = `$${user.balance.toFixed(0)}`;

  try{
    const resp = await fetch(`${API}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ userId: user.id, bet })
    });

    const data = await resp.json();
    if(!resp.ok || !data.ok){
      // show server message
      resultBox && (resultBox.innerText = data && data.error ? data.error : 'Play failed');
      // refresh from server (in case server didn't accept bet)
      await refreshUserFromServer();
      return;
    }

    // backend response expected structure:
    // { ok:true, outcome: { slot: '...', won: number, jackpotUnlocked: bool, balance: number, cumulativeWins: number } }
    const outcome = data.outcome || { won: 0, slot: 'LOSE', jackpotUnlocked: false, balance: oldBalance };
    const won = Number(outcome.won || 0);
    const jackpot = !!outcome.jackpotUnlocked;
    const resultingBalance = Number(outcome.balance || oldBalance);

    // Animate the ball to the server outcome
    await animateDropToOutcome(won, jackpot);

    // Play correct sound
    if(jackpot){ playSound(sndJackpot); setTimeout(()=>playSound(sndClap), 600); }
    else if(won > 0) playSound(sndWin);
    else playSound(sndLose);

    // Update local user state with authoritative server values
    user.balance = resultingBalance;
    user.cumulativeWins = outcome.cumulativeWins || user.cumulativeWins || 0;
    user.hasWonJackpot = jackpot || user.hasWonJackpot;
    saveUser(user);
    populateHeader();

    // Result box text
    if(jackpot) resultBox.innerHTML = `<strong>JACKPOT!</strong> You were awarded $${won || 4000}`;
    else if(won > 0) resultBox.innerText = `You won $${won}!`;
    else resultBox.innerText = 'No win this round.';

  }catch(err){
    console.error('play error', err);
    resultBox && (resultBox.innerText = 'Network error — please try again.');
    // on error, refresh authoritative user data
    await refreshUserFromServer();
  } finally {
    isPlaying = false;
    setTimeout(()=>{ dropBtn.disabled = false; }, 700);
  }
}

// --- Animation: ball falling gracefully to a slot ---
function animateDropToOutcome(winAmount, isJackpot){
  return new Promise((resolve) => {
    if(!canvas || !ctx) return resolve();

    const w = canvas.width/(window.devicePixelRatio||1);
    const slotCount = SLOT_ORDER.length;
    const slotWidth = (w - board.leftPadding*2) / slotCount;

    // Map winAmount -> target slot index
    let targetIndex = 0; // default LOSE index
    if(isJackpot) targetIndex = SLOT_ORDER.length - 1;
    else if(winAmount > 0){
      const idx = SLOT_ORDER.findIndex(s => Number(s) === Number(winAmount));
      if(idx >= 0) targetIndex = idx;
      else targetIndex = Math.min(slotCount-2, Math.floor(Math.random()*(slotCount-1)));
    } else targetIndex = 0;

    const endX = board.leftPadding + targetIndex * slotWidth + slotWidth/2;
    const endY = board.topPadding + board.rows * board.pegSpacingY + 36 + 32;

    // ball starting pos
    let ball = { x: w/2, y: 12, vx: 0, vy: 0, r: 12 };
    let frame = 0;
    const totalFrames = 220; // slower, smoother drop (approx 3.5s)
    const id = setInterval(()=>{
      frame++;
      // early: physics + randomness
      if(frame < totalFrames - 40){
        ball.vy += 0.34;
        ball.vx += (Math.random() - 0.5) * 0.8;
        ball.x += ball.vx;
        ball.y += ball.vy;

        // collision with side walls
        const leftBound = board.leftPadding;
        const rightBound = w - board.leftPadding;
        if(ball.x < leftBound) { ball.x = leftBound; ball.vx *= -0.3; }
        if(ball.x > rightBound) { ball.x = rightBound; ball.vx *= -0.3; }
      } else {
        // move toward target slot smoothly
        ball.x += (endX - ball.x) * 0.14;
        ball.y += (endY - ball.y) * 0.14;
      }

      // redraw
      drawBoard();
      // ball
      ctx.beginPath();
      const g = ctx.createLinearGradient(ball.x - 10, ball.y - 10, ball.x + 10, ball.y + 10);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#bafda7');
      ctx.fillStyle = g;
      ctx.ellipse(ball.x, ball.y, ball.r, ball.r, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#00c853'; ctx.stroke();

      if(frame >= totalFrames + 12){ clearInterval(id); resolve(); }
    }, 16);
  });
}

// --- Withdrawal (client)
withdrawBtn?.addEventListener('click', async ()=>{
  if(!user.hasWonJackpot){ alert('Withdrawals are locked until you win the JACKPOT.'); return; }
  const amt = Number(prompt('Enter withdrawal amount'));
  if(!amt || amt <= 0) return;
  if(amt > (user.balance || 0)) return alert('Insufficient balance');
  try{
    const r = await fetch(`${API}/api/withdraw`, { method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ userId: user.id, amount: amt }) });
    const j = await r.json();
    if(!j.ok) return alert('Withdraw failed: ' + (j.error||''));
    alert('Withdraw request submitted.');
    await refreshUserFromServer();
  }catch(e){ alert('Network error'); }
});

// keep user updated
setInterval(()=> refreshUserFromServer(), 45000);
