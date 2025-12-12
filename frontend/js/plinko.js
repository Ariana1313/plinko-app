/***************************************************
 *  Plinko N.U — FINAL GAME ENGINE
 *  - Real physics
 *  - Slower ball
 *  - Bet deduct, winnings add
 *  - Jackpot logic
 *  - Certificate modal triggers
 ***************************************************/

const API = "https://plinko-app.onrender.com";

// Sounds
const sLose = new Audio("assets/sounds/lose.mp3");
const sWin = new Audio("assets/sounds/win.mp3");
const sJackpot = new Audio("assets/sounds/jackpot.mp3");
const sTap = new Audio("assets/sounds/tap.mp3");
const sClap = new Audio("assets/sounds/clap.mp3");

// DOM
const board = document.getElementById("plinkoBoard");
const dropBtn = document.getElementById("dropBallBtn");
const betInput = document.getElementById("betAmount");
const balanceBox = document.getElementById("userBalance");
const msgPopup = document.getElementById("msgPopup");

const certModal = document.getElementById("certModal");
const certCanvas = document.getElementById("certCanvas");
const closeCert = document.getElementById("closeCert");
const downloadCert = document.getElementById("downloadCert");

// User info
let user = JSON.parse(localStorage.getItem("plinkoUser") || "null");
if (!user) location.href = "login.html";

/* =====================================================
   LOAD USER BALANCE + REFERRAL
===================================================== */
async function loadUserData() {
  try {
    const res = await fetch(`${API}/api/user/${user.id}`);
    const data = await res.json();
    if (data.ok) {
      user = data.user;
      localStorage.setItem("plinkoUser", JSON.stringify(user));
      balanceBox.innerText = "$" + user.balance;
    }
  } catch (err) {
    console.error(err);
  }

  loadReferral();
}
loadUserData();

async function loadReferral() {
  try {
    const res = await fetch(`${API}/api/referrals/${user.id}`);
    const data = await res.json();
    if (data.ok) {
      const link = data.data.referralLink;
      document.getElementById("refText").innerText = link;
      document.getElementById("copyRef").onclick = () => {
        navigator.clipboard.writeText(link);
        showPopup("Referral link copied!");
      };
    }
  } catch (e) { console.log(e); }
}


/* =====================================================
   PLINKO BOARD - PEGS + STYLE
===================================================== */
function createBoard() {
  board.innerHTML = "";

  const pegRows = 8;
  const pegSpacing = 42;

  for (let r = 0; r < pegRows; r++) {
    for (let c = 0; c <= r; c++) {
      const peg = document.createElement("div");
      peg.className = "peg";
      peg.style.left = `${(board.clientWidth / 2) - (pegSpacing * r / 2) + (c * pegSpacing)}px`;
      peg.style.top = `${40 + r * 50}px`;
      board.appendChild(peg);
    }
  }
}
createBoard();


/* =====================================================
   DROP BALL
===================================================== */
let isDropping = false;

dropBtn.onclick = () => startDrop();

async function startDrop() {
  if (isDropping) return;
  const bet = Number(betInput.value);

  if (bet < 10) return showPopup("Minimum bet is $10");
  if (bet > user.balance) return showPopup("Insufficient balance");

  isDropping = true;
  sTap.play();

  // Deduct bet first
  user.balance -= bet;
  balanceBox.innerText = "$" + user.balance;

  await dropBallPhysics(bet);
  isDropping = false;
}


/* =====================================================
   REAL BALL PHYSICS
===================================================== */
async function dropBallPhysics(bet) {
  const ball = document.createElement("div");
  ball.className = "ball";
  board.appendChild(ball);

  let x = board.clientWidth / 2;
  let y = 0;
  let speedY = 0;
  let speedX = 0;

  const gravity = 0.25;        // slow & smooth fall
  const bounce = 0.35;

  const pegs = Array.from(document.getElementsByClassName("peg"));
  const pegRadius = 10;

  return new Promise(resolve => {
    const loop = setInterval(() => {
      speedY += gravity;
      y += speedY;
      x += speedX;

      // Wall limits
      if (x < 10) { x = 10; speedX *= -bounce; }
      if (x > board.clientWidth - 10) { x = board.clientWidth - 10; speedX *= -bounce; }

      // Check peg collisions
      pegs.forEach(peg => {
        const rect = peg.getBoundingClientRect();
        const pegX = rect.left + rect.width / 2 - board.getBoundingClientRect().left;
        const pegY = rect.top + rect.height / 2 - board.getBoundingClientRect().top;

        const dx = x - pegX;
        const dy = y - pegY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < pegRadius + 12) {
          speedY *= -bounce;
          speedX += (Math.random() - 0.5) * 3;
        }
      });

      ball.style.left = x + "px";
      ball.style.top = y + "px";

      // Reached bottom
      if (y > board.clientHeight - 20) {
        clearInterval(loop);
        board.removeChild(ball);

        const outcome = determineSlot(x);
        handleOutcome(outcome, bet);

        resolve();
      }
    }, 16); // 60 FPS
  });
}


/* =====================================================
   DETERMINE SLOT (LOSE / 100 / 150 / 200 / JACKPOT)
===================================================== */
function determineSlot(x) {
  const width = board.clientWidth;
  const slotSize = width / 5;

  if (x < slotSize) return "lose";
  if (x < slotSize * 2) return 100;
  if (x < slotSize * 3) return 150;
  if (x < slotSize * 4) return 200;
  return "jackpot";
}


/* =====================================================
   HANDLE SLOT RESULT
===================================================== */
async function handleOutcome(outcome, bet) {
  let win = 0;

  if (outcome === "lose") {
    sLose.play();
    showPopup(`You lost $${bet}`);
  }
  else if (outcome === "jackpot") {
    win = 4000;
    sJackpot.play();
    sClap.play();
    showPopup("🎉 JACKPOT WON! +$4000");

    await sendPlayToServer(win, true);
    user.balance += win;
    balanceBox.innerText = "$" + user.balance;

    generateCertificate();
    openCert();
    return;
  }
  else {
    win = outcome;
    sWin.play();
    showPopup(`You won $${win}`);
  }

  user.balance += win;
  balanceBox.innerText = "$" + user.balance;

  await sendPlayToServer(win, false);
}


/* =====================================================
   SERVER UPDATE
===================================================== */
async function sendPlayToServer(win, jackpot) {
  try {
    await fetch(`${API}/api/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        winAmount: win,
        triggeredBigBonus: jackpot
      })
    });
  } catch (e) { console.log(e); }
}


/* =====================================================
   POPUP MESSAGE
===================================================== */
function showPopup(msg) {
  msgPopup.innerText = msg;
  msgPopup.style.display = "block";
  setTimeout(() => msgPopup.style.display = "none", 2000);
}


/* =====================================================
   JACKPOT CERTIFICATE
===================================================== */
function generateCertificate() {
  const ctx = certCanvas.getContext("2d");

  // Background
  const bg = new Image();
  bg.src = "assets/certificate-bg.png";
  bg.onload = () => {
    ctx.drawImage(bg, 0, 0, certCanvas.width, certCanvas.height);

    ctx.fillStyle = "#222";
    ctx.font = "62px Arial Black";
    ctx.fillText(user.username.toUpperCase(), 200, 350);
    ctx.font = "40px Arial";
    ctx.fillText("Awarded Jackpot: $4000", 200, 430);
    ctx.fillText("Plinko N.U Rewards Authority", 200, 500);
  };
}

function openCert() {
  certModal.style.display = "flex";
}
closeCert.onclick = () => certModal.style.display = "none";
downloadCert.onclick = () => {
  const a = document.createElement("a");
  a.href = certCanvas.toDataURL("image/png");
  a.download = "plinko-jackpot-certificate.png";
  a.click();
};
