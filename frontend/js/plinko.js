/* frontend/js/plinko.js
   Server-side outcomes. Animates based on server slotLabel.
*/

const API = "https://plinko-app.onrender.com";

const getUser = () => {
  try { return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); }
  catch(e){ return null; }
};
const saveUser = (u) => localStorage.setItem('plinkoUser', JSON.stringify(u));

let user = getUser();
if(!user){ alert('Please login'); location.href='login.html'; }

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const sLose = new Audio("assets/sounds/lose.mp3");
const sWin = new Audio("assets/sounds/win.mp3");
const sJackpot = new Audio("assets/sounds/jackpot.mp3");
const sTap = new Audio("assets/sounds/tap.mp3");
const sClap = new Audio("assets/sounds/clap.mp3");
[sLose,sWin,sJackpot,sTap,sClap].forEach(a=>a.volume=1);

// UI refs
const profilePic = document.getElementById('profilePic');
const profileName = document.getElementById('profileName');
const balanceDisplay = document.getElementById('balanceDisplay');
const refInput = document.getElementById('referralInput');
const copyBtn = document.getElementById('copyReferral');
const betInput = document.getElementById('betInput');
const playBtn = document.getElementById('playBtn');
const popup = document.getElementById('popup');
const withdrawBtn = document.getElementById('withdrawBtn');
const messageEl = document.getElementById('message');
document.getElementById('userIdShort').innerText = user.id ? user.id.slice(0,8) : '—';

// fill UI
function refreshUI(){
  profileName.innerText = user.username || 'Player';
  profilePic.src = user.profileUrl || 'assets/default-avatar.png';
  balanceDisplay.innerText = '$' + Number(user.balance || 0).toLocaleString();
  refInput.value = `${location.origin}/register.html?ref=${user.referralCode || ''}`;
}
refreshUI();

// copy referral
copyBtn.addEventListener('click', async ()=>{
  try{
    await navigator.clipboard.writeText(refInput.value);
    copyBtn.innerText = 'Copied ✓';
    setTimeout(()=>copyBtn.innerText = 'Copy Referral', 1800);
  }catch(e){
    alert('Copy failed');
  }
});

// create visual pegs and slots
const ROWS = 8, COLS = 9;
function drawBoard(){
  // background
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle = '#f2fff7';
  ctx.fillRect(0,0,WIDTH,HEIGHT);

  // pegs
  ctx.fillStyle = '#0b6';
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const offset = (r%2===0)? 40 : 20;
      const x = c * (WIDTH / COLS) + offset;
      const y = 60 + r*50;
      ctx.beginPath();
      ctx.arc(x,y,6,0,Math.PI*2);
      ctx.fill();
    }
  }

  // slots row visual
  const slots = ['LOSE','10','20','50','100','200','500','1000','JACKPOT'];
  const slotW = WIDTH / slots.length;
  for(let i=0;i<slots.length;i++){
    ctx.fillStyle = '#fff';
    ctx.fillRect(i*slotW, HEIGHT - 80, slotW-2, 80);
    ctx.fillStyle = '#0b6';
    ctx.font = 'bold 16px Inter, Arial';
    ctx.fillText(slots[i], i*slotW + 12, HEIGHT - 40);
  }
}
drawBoard();

// ball for animation (DOM overlay approach easier)
let ball = document.createElement('div');
ball.style.position = 'absolute';
ball.style.width = '22px';
ball.style.height = '22px';
ball.style.borderRadius = '50%';
ball.style.background = 'radial-gradient(circle at 25% 25%, #fff, #90ffa8)';
ball.style.border = '2px solid rgba(0,200,100,0.9)';
ball.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
ball.style.transition = 'top 1.6s cubic-bezier(.2,.9,.3,1), left 1.6s linear';
ball.style.zIndex = 999;
document.body.appendChild(ball);
ball.style.display = 'none';

function showPopup(text){
  popup.innerText = text;
  popup.style.display = 'block';
  setTimeout(()=>{ popup.style.display = 'none'; }, 2800);
}

// animate ball to slot label (slotLabel from server)
function slotToLeftPercent(slotLabel){
  const map = { 'LOSE':0.05, '10':0.14, '20':0.26, '50':0.38, '100':0.50, '200':0.62, '500':0.74, '1000':0.86, 'JACKPOT':0.95 };
  return (map[slotLabel] || 0.5);
}
function animateBallToSlot(slotLabel){
  return new Promise(resolve=>{
    // position ball at top center of canvas
    const rect = canvas.getBoundingClientRect();
    const leftPct = slotToLeftPercent(slotLabel);
    const targetLeft = rect.left + leftPct * rect.width;
    const startLeft = rect.left + rect.width/2;
    ball.style.left = (startLeft - 11) + 'px';
    ball.style.top = (rect.top + 12) + 'px';
    ball.style.display = 'block';
    // play tap sound a few times to mimic peg hits
    sTap.play();

    // move to target
    setTimeout(()=> {
      ball.style.left = (targetLeft - 11) + 'px';
      ball.style.top = (rect.top + rect.height - 110) + 'px';
    }, 80);

    // finish
    setTimeout(()=> {
      // tiny bounce
      ball.style.top = (rect.top + rect.height - 130) + 'px';
      setTimeout(()=> {
        ball.style.display = 'none';
        resolve();
      }, 300);
    }, 1800);
  });
}

// play action: call server, animate, update balance
playBtn.addEventListener('click', async ()=>{
  const bet = Number(betInput.value || 0);
  if(!bet || bet <= 0) return alert('Enter bet > 0');
  if((user.balance || 0) < bet) return alert('Insufficient balance');

  // immediate local deduction (optimistic)
  user.balance = Number(user.balance || 0) - bet;
  balanceDisplay.innerText = '$' + Number(user.balance).toLocaleString();

  // call backend: server decides slot
  try{
    const r = await fetch(`${API}/api/play`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ userId: user.id, betAmount: bet })
    });
    const j = await r.json();
    if(!j.ok){
      showPopup(j.error || 'Error');
      // refresh user data
      await refreshUser();
      return;
    }

    // animate to server slot
    const slotLabel = j.result.slotLabel;
    await animateBallToSlot(slotLabel);

    // play appropriate sounds
    if(slotLabel === 'LOSE'){
      sLose.play();
      showPopup('You lost');
    } else if(slotLabel === 'JACKPOT'){
      sJackpot.play();
      setTimeout(()=> sClap.play(), 900);
      showPopup('🎉 JACKPOT! +$4,000');
      // confetti (cdn)
      try {
        // load confetti via CDN then fire
        if(!window.confetti){
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
          document.head.appendChild(s);
          s.onload = ()=> window.confetti({ particleCount: 200, spread: 70, origin: { y: 0.4 }});
        } else {
          window.confetti({ particleCount: 200, spread: 70, origin: { y: 0.4 }});
        }
      } catch(e){ /* ignore */ }
    } else {
      sWin.play();
      showPopup(`You won $${j.result.winAmount}`);
    }

    // update local user from server truth
    user.balance = j.result.balance;
    saveUser(user);
    refreshUI();

  } catch(err){
    console.error(err);
    showPopup('Network error');
    await refreshUser();
  }
});

// refresh user from API
async function refreshUser(){
  try{
    const r = await fetch(`${API}/api/user/${user.id}`);
    const j = await r.json();
    if(j.ok && j.user){
      user = j.user;
      saveUser(user);
      refreshUI();
    }
  }catch(e){ console.warn('refresh fail', e); }
}

// withdraw button: show lock message if not jackpot
withdrawBtn.addEventListener('click', async ()=>{
  if(!user.hasWonBigBonus) {
    alert('Withdrawals are locked until you win the JACKPOT. Keep playing!');
    return;
  }
  // open withdraw flow (simple prompt for demo)
  const amount = Number(prompt('Enter withdraw amount'));
  if(!amount || amount <= 0) return;
  if(amount > user.balance) return alert('Insufficient balance');
  // call withdraw endpoint
  const r = await fetch(`${API}/api/withdraw`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ userId: user.id, amount: amount, method: 'local', details: '' })
  });
  const j = await r.json();
  if(!j.ok) return alert('Withdraw failed: ' + (j.error || ''));
  alert('Withdraw request submitted. Admin will process it.');
  await refreshUser();
});

// initial UI
refreshUI();
