/* ---------------------------------------------------------
   Plinko N.U — FINAL GAME LOGIC
   Includes:
   - Bet deduction
   - Win calculation
   - Jackpot logic ($4000)
   - Sounds (lose / win / jackpot / tap / clap)
   - Real balance update
-----------------------------------------------------------*/

const API = "https://plinko-app.onrender.com";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

let user = JSON.parse(localStorage.getItem("plinkoUser") || "null");
if (!user) {
  alert("Please login first");
  location.href = "login.html";
}

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// --- SOUND EFFECTS ---
const sLose = new Audio("assets/sounds/lose.mp3");
const sWin = new Audio("assets/sounds/win.mp3");
const sJackpot = new Audio("assets/sounds/jackpot.mp3");
const sTap = new Audio("assets/sounds/tap.mp3");
const sClap = new Audio("assets/sounds/clap.mp3");

[sLose, sWin, sJackpot, sTap, sClap].forEach(a => (a.volume = 1));

// --- SLOTS ---
const SLOTS = [
  { label: "LOSE", amount: 0 },
  { label: "10", amount: 10 },
  { label: "20", amount: 20 },
  { label: "50", amount: 50 },
  { label: "100", amount: 100 },
  { label: "200", amount: 200 },
  { label: "500", amount: 500 },
  { label: "JACKPOT", amount: 4000 }, // NEW 🔥
  { label: "LOSE", amount: 0 }
];

// --- PHYSICS ---
const ROWS = 8;
const COLS = 9;
const PEG_RADIUS = 6;
const SLOT_HEIGHT = 80;

const GRAVITY = 0.45;
const FRICTION = 0.995;

// Draw board
function drawBoard() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#f2fff7";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // pegs
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const offset = r % 2 === 0 ? 40 : 20;
      const x = c * (WIDTH / COLS) + offset;
      const y = 60 + r * 50;

      ctx.beginPath();
      ctx.fillStyle = "#0b6";
      ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // slots
  const slotW = WIDTH / SLOTS.length;
  for (let i = 0; i < SLOTS.length; i++) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(i * slotW, HEIGHT - SLOT_HEIGHT, slotW - 2, SLOT_HEIGHT);

    ctx.font = "bold 16px Inter";
    ctx.fillStyle = "#0b6";
    ctx.fillText(SLOTS[i].label, i * slotW + 12, HEIGHT - 40);
  }
}

// Ball class
class Ball {
  constructor(x) {
    this.x = x;
    this.y = 20;
    this.vx = (Math.random() * 2 - 1) * 0.6;
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

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const offset = r % 2 === 0 ? 40 : 20;
        const px = c * (WIDTH / COLS) + offset;
        const py = 60 + r * 50;

        const dx = this.x - px;
        const dy = this.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PEG_RADIUS + this.radius) {
          const nx = dx / dist,
            ny = dy / dist;
          this.vx = (this.vx - 2 * (this.vx * nx + this.vy * ny) * nx) * 0.9;
          this.vy = (this.vy - 2 * (this.vx * nx + this.vy * ny) * ny) * 0.9;

          this.vx += (Math.random() - 0.5) * 0.6;
          this.vy -= 2;
        }
      }
    }

    if (this.x < this.radius) this.vx *= -1;
    if (this.x > WIDTH - this.radius) this.vx *= -1;

    if (this.y > HEIGHT - SLOT_HEIGHT) this.alive = false;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#0b6";
    ctx.lineWidth = 3;
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

let ball = null;
let loop;

// Animation loop
function animate() {
  drawBoard();

  if (ball) {
    ball.step();
    ball.draw();

    if (!ball.alive) {
      const index = Math.floor(ball.x / (WIDTH / SLOTS.length));
      const slot = SLOTS[index];
      processResult(slot.amount, slot.label);
      ball = null;
    }
  }

  loop = requestAnimationFrame(animate);
}

// Game logic when ball lands
async function processResult(amount, label) {
  const msg = document.getElementById("message");

  // --- SOUND HANDLING ---
  if (label === "LOSE") {
    msg.innerText = "❌ Lose";
    sLose.play();
  } else if (label === "JACKPOT") {
    msg.innerText = "🎉 JACKPOT — $4000!";
    sJackpot.play();
    setTimeout(() => sClap.play(), 1000);
  } else {
    msg.innerText = `You won $${amount}`;
    sWin.play();
  }

  // --- Send to backend ---
  const bet = Number(document.getElementById("betInput").value) || 0;

  const res = await fetch(`${API}/api/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: user.id,
      betAmount: bet,
      winAmount: amount
    })
  });

  const data = await res.json();

  if (!data.ok) {
    msg.innerText = data.error || "Play error";
    return;
  }

  // update balance in UI
  user.balance = data.balance;
  localStorage.setItem("plinkoUser", JSON.stringify(user));

  document.getElementById("balanceDisplay").innerText =
    "$" + Number(user.balance).toLocaleString();

  if (data.big) {
    setTimeout(() => {
      alert("🎉 YOU WON THE GRAND JACKPOT — $4000 🎉");
    }, 500);
  }
}

// Initialize game
function init() {
  drawBoard();
  document.getElementById("balanceDisplay").innerText =
    "$" + Number(user.balance).toLocaleString();

  // referral
  const link = `${location.origin}/register.html?ref=${user.referralCode}`;
  document.getElementById("refLink").value = link;

  document.getElementById("copyRef").onclick = () => {
    navigator.clipboard.writeText(link);
    document.getElementById("copyRef").innerText = "Copied ✓";
    setTimeout(() => {
      document.getElementById("copyRef").innerText = "Copy";
    }, 1600);
  };

  document.getElementById("playBtn").onclick = () => {
    const bet = Number(document.getElementById("betInput").value);

    if (bet <= 0) return alert("Enter a valid bet amount!");
    if (bet > user.balance) return alert("Insufficient balance!");

    sTap.play();

    ball = new Ball(WIDTH / 2 + (Math.random() * 80 - 40));
  };

  if (!loop) animate();
}

init();
