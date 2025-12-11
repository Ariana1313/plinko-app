// --- AUDIO SETUP ---
const sLose = new Audio("assets/sounds/lose.mp3");
const sWin = new Audio("assets/sounds/win.mp3");
const sJackpot = new Audio("assets/sounds/jackpot.mp3");
const sTap = new Audio("assets/sounds/tap.mp3");
const sClap = new Audio("assets/sounds/clap.mp3");

// To avoid iPhone autoplay issues
[sLose, sWin, sJackpot, sTap, sClap].forEach(a => {
    a.volume = 1.0; 
});
// plinko.js - simple canvas physics plinko
const API = "https://plinko-app.onrender.com";
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let user = JSON.parse(localStorage.getItem('plinkoUser') || 'null');
if(!user) {
  alert('Please login first');
  location.href = 'login.html';
}

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Slots – last row buckets with multipliers / pay amounts
const SLOTS = [
  {label:'0', amount: -1}, // negative amount = lose
  {label:'10', amount: 10},
  {label:'20', amount: 20},
  {label:'50', amount: 50},
  {label:'100', amount: 100},
  {label:'200', amount: 200},
  {label:'500', amount: 500},
  {label:'1000', amount: 1000},
  {label:'0', amount: -1}
];

// Peg grid settings
const ROWS = 8;
const COLS = 9;
const PEG_RADIUS = 6;
const SLOT_HEIGHT = 80;

// simple physics constants
const GRAVITY = 0.45;
const FRICTION = 0.995;

// draw pegs
function drawBoard() {
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle = '#f6fff6';
  ctx.fillRect(0,0,WIDTH,HEIGHT);

  ctx.fillStyle = '#dfffe6';
  // draw pegs
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const offset = (r%2===0)? 40 : 20;
      const x = (c * (WIDTH / COLS)) + offset;
      const y = 60 + (r * 50);
      ctx.beginPath();
      ctx.fillStyle = '#0b6';
      ctx.globalAlpha = 0.95;
      ctx.arc(x, y, PEG_RADIUS, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // draw slots boxes at bottom
  const slotW = WIDTH / SLOTS.length;
  for(let i=0;i<SLOTS.length;i++){
    ctx.fillStyle = '#fff';
    ctx.fillRect(i*slotW, HEIGHT - SLOT_HEIGHT, slotW-2, SLOT_HEIGHT);
    ctx.fillStyle = '#0b6';
    ctx.font = 'bold 16px Inter, Arial';
    ctx.fillText(SLOTS[i].amount>0 ? '$'+SLOTS[i].amount : 'LOSE', i*slotW + 12, HEIGHT - SLOT_HEIGHT/2);
  }
}

// Ball object
class Ball {
  constructor(x) {
    this.x = x;
    this.y = 18;
    this.vx = (Math.random()*2 - 1) * 0.6;
    this.vy = 0;
    this.radius = 12;
    this.alive = true;
  }
  step() {
    this.vy += GRAVITY;
    this.vx *= FRICTION;
    this.vy *= FRICTION;
    this.x += this.vx;
    this.y += this.vy;

    // collide with pegs (simple approximation)
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const offset = (r%2===0)? 40 : 20;
        const px = (c * (WIDTH / COLS)) + offset;
        const py = 60 + (r * 50);
        const dx = this.x - px;
        const dy = this.y - py;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < PEG_RADIUS + this.radius) {
          // bounce
          const nx = dx/dist, ny = dy/dist;
          // simple reflect
          this.vx = (this.vx - 2*(this.vx*nx + this.vy*ny)*nx) * 0.9;
          this.vy = (this.vy - 2*(this.vx*nx + this.vy*ny)*ny) * 0.9;
          // small jitter
          this.vx += (Math.random()-0.5) * 0.6;
          this.vy -= 2;
        }
      }
    }

    // bounds
    if(this.x < this.radius) { this.x = this.radius; this.vx *= -0.6; }
    if(this.x > WIDTH - this.radius) { this.x = WIDTH - this.radius; this.vx *= -0.6; }

    if(this.y > HEIGHT - this.radius - 1) {
      this.alive = false;
    }
  }
  draw(ctx){
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0b6';
    ctx.lineWidth = 3;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();
  }
}

let activeBall = null;
let animHandle = null;

function animate() {
  drawBoard();
  if(activeBall) {
    activeBall.step();
    activeBall.draw(ctx);
    if(!activeBall.alive) {
      // decide which slot
      const slotIndex = Math.floor(activeBall.x / (WIDTH / SLOTS.length));
      const slot = SLOTS[Math.max(0, Math.min(SLOTS.length-1, slotIndex))];
      const winAmount = (slot.amount > 0) ? slot.amount : 0;
      onBallResult(winAmount);
      activeBall = null;
    }
  }
  animHandle = requestAnimationFrame(animate);
}

function startAnimation() {
  if(!animHandle) animHandle = requestAnimationFrame(animate);
}

// called when ball landed
async function onBallResult(winAmount) {
  const msg = document.getElementById('message');
  msg.innerText = `You won $${winAmount}`;
  // Add to UI balance immediately (optimistic)
  const balEl = document.getElementById('balanceDisplay');
  let current = Number((balEl.innerText || '$0').replace('$','')) || 0;
  current += Number(winAmount || 0);
  balEl.innerText = '$' + current.toLocaleString();

  // inform backend
  try {
    const res = await fetch(`${API}/api/play`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ userId: user.id, betAmount: Number(document.getElementById('betInput').value||0), winAmount })
    });
    const data = await res.json();
    if(!data.ok) {
      msg.innerText = `Play error: ${data.error||'server error'}`;
      return;
    }
    // If big bonus flagged, show celebration
    if(data.big) {
      alert('🎉 CONGRATULATIONS! You were awarded the $4,000 Big Bonus!');
    }
    // update localStorage user balance
    user.balance = data.balance;
    localStorage.setItem('plinkoUser', JSON.stringify(user));
    document.getElementById('balanceDisplay').innerText = '$'+Number(data.balance).toLocaleString();
  } catch(err){
    console.error(err);
    msg.innerText = 'Network error while saving play';
  }
}

// start state
function init() {
  drawBoard();
  document.getElementById('balanceDisplay').innerText = '$' + Number(user.balance || 0).toLocaleString();
  // referral link
  const link = `${location.origin}/register.html?ref=${user.referralCode || ''}`;
  document.getElementById('refLink').value = link;
  document.getElementById('copyRef').addEventListener('click', ()=> {
    navigator.clipboard.writeText(document.getElementById('refLink').value);
    alert('Referral copied');
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('plinkoUser');
    location.href = 'login.html';
  });

  document.getElementById('playBtn').addEventListener('click', () => {
    const bet = Number(document.getElementById('betInput').value || 0);
    if(bet <= 0) return alert('Set a bet > 0');
    // start ball from top center with slight random
    activeBall = new Ball(WIDTH/2 + (Math.random()*60-30));
    startAnimation();
  });

  startAnimation();
}

init();
