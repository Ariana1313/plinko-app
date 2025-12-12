// ==========================
//   PLINKO N.U Backend
// ==========================
// Supports:
// - Registration (+$150 bonus)
// - Login
// - Bet system (loss removes bet, win adds winnings)
// - Jackpot if cumulativeWins >= 2000 ($4000 prize)
// - Leaderboard
// - Referral system (+$30)
// - Withdraw lock until jackpot
// ==========================

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const session = require("express-session");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------
// Storage Paths
// ------------------------------
const BASE = __dirname;
const USERS_FILE = path.join(BASE, "users.json");
const WITHDRAW_FILE = path.join(BASE, "withdrawals.json");
const ADMIN_LOGS = path.join(BASE, "admin_logs.json");
const JACKPOT_FILE = path.join(BASE, "jackpot.json");

// Ensure exists
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(WITHDRAW_FILE)) fs.writeFileSync(WITHDRAW_FILE, "[]");
if (!fs.existsSync(ADMIN_LOGS)) fs.writeFileSync(ADMIN_LOGS, "[]");
if (!fs.existsSync(JACKPOT_FILE)) fs.writeFileSync(JACKPOT_FILE, JSON.stringify({ amount: 0 }));

function read(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ------------------------------
// CORS FIX (IMPORTANT)
// ------------------------------
const FRONTEND = "https://plinko-app-nu.vercel.app";

app.use(cors({
  origin: FRONTEND,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev123",
    resave: false,
    saveUninitialized: false,
  })
);

const upload = multer({ dest: path.join(BASE, "uploads") });

// ------------------------------
// HEALTH CHECK
// ------------------------------
app.get("/api/health", (req, res) => {
  res.status(200).json({ ok: true, status: "UP" });
});

// ------------------------------
// REGISTER
// ------------------------------
app.post("/api/register", upload.single("profilePic"), async (req, res) => {
  try {
    const { username, email, password, secretPin, referralCode } = req.body;

    if (!username || !email || !password) {
      return res.json({ ok: false, error: "Missing fields" });
    }

    let users = read(USERS_FILE);

    if (users.find(u => u.email === email))
      return res.json({ ok: false, error: "Email already exists" });

    if (users.find(u => u.username === username))
      return res.json({ ok: false, error: "Username already exists" });

    const hash = await bcrypt.hash(password, 10);

    const newUser = {
      id: uuidv4(),
      username,
      email,
      password: hash,
      secretPin,
      balance: 150,         // 🔥 $150 welcome bonus
      cumulativeWins: 0,
      hasWonJackpot: false,
      referralCode: "REF-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      referredBy: referralCode || null,
      referrals: [],
      createdAt: new Date().toISOString()
    };

    // REFERRAL BONUS
    if (referralCode) {
      const refUser = users.find(u => u.referralCode === referralCode);
      if (refUser) {
        refUser.balance += 30;
        refUser.referrals.push({
          id: newUser.id,
          username: newUser.username,
          date: new Date().toISOString(),
        });
      }
    }

    users.push(newUser);
    write(USERS_FILE, users);

    res.json({ ok: true, user: { id: newUser.id, username } });
  } catch (e) {
    console.log(e);
    res.json({ ok: false, error: "Server error" });
  }
});

// ------------------------------
// LOGIN
// ------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    let users = read(USERS_FILE);
    const u = users.find(
      x => x.username === username || x.email === username
    );

    if (!u) return res.json({ ok: false, error: "Invalid login" });

    const match = await bcrypt.compare(password, u.password);
    if (!match) return res.json({ ok: false, error: "Wrong password" });

    req.session.userId = u.id;

    res.json({ ok: true, user: { id: u.id, username: u.username, balance: u.balance } });
  } catch (e) {
    res.json({ ok: false, error: "Server error" });
  }
});

// ------------------------------
// GET USER
// ------------------------------
app.get("/api/user/:id", (req, res) => {
  const users = read(USERS_FILE);
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.json({ ok: false, error: "Not found" });

  const { password, ...safeUser } = u;
  res.json({ ok: true, user: safeUser });
});

// ------------------------------
// PLAY
// ------------------------------
app.post("/api/play", (req, res) => {
  try {
    const { userId, bet } = req.body;
    let users = read(USERS_FILE);

    const u = users.find(x => x.id === userId);
    if (!u) return res.json({ ok: false, error: "User not found" });

    bet = Number(bet);
    if (bet <= 0) return res.json({ ok: false, error: "Invalid bet" });

    if (u.balance < bet)
      return res.json({ ok: false, error: "Insufficient balance" });

    // Deduct bet
    u.balance -= bet;

    // Random Plinko outcome
    const slots = [
      -bet,            // lose
      bet * 0.5,
      bet * 1,
      bet * 2,
      bet * 5,
      bet * 10,
      0,               // neutral
      4000             // JACKPOT slot
    ];

    const outcome = slots[Math.floor(Math.random() * slots.length)];

    let jackpotWon = false;
    let winAmount = 0;

    if (outcome === 4000 && !u.hasWonJackpot) {
      jackpotWon = true;
      winAmount = 4000;
      u.balance += winAmount;
      u.hasWonJackpot = true;
    } else if (outcome > 0) {
      winAmount = outcome;
      u.balance += winAmount;
      u.cumulativeWins += winAmount;
    }

    write(USERS_FILE, users);

    res.json({
      ok: true,
      winAmount,
      jackpot: jackpotWon,
      balance: u.balance,
    });

  } catch (e) {
    res.json({ ok: false, error: "Server error" });
  }
});

// ------------------------------
// WITHDRAW — Block until jackpot
// ------------------------------
app.post("/api/withdraw", (req, res) => {
  const { userId, amount } = req.body;
  amount = Number(amount);

  const users = read(USERS_FILE);
  const u = users.find(x => x.id === userId);

  if (!u) return res.json({ ok: false, error: "User not found" });

  if (!u.hasWonJackpot) {
    return res.json({
      ok: false,
      error: "You must win JACKPOT before withdrawal.",
    });
  }

  if (amount > u.balance)
    return res.json({ ok: false, error: "Insufficient balance" });

  u.balance -= amount;

  write(USERS_FILE, users);

  res.json({ ok: true, message: "Withdrawal request submitted" });
});

// ------------------------------
app.listen(PORT, () =>
  console.log(`Plinko backend running on ${PORT}`)
);

// === LEADERBOARD (Top 20 users by balance) ===
app.get("/api/leaderboard", (req, res) => {
  try {
    const users = read(USERS_FILE); // correct function

    const top = [...users]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 20)
      .map(u => ({
        username: u.username,
        balance: u.balance,
        wonBigBonus: u.wonBigBonus || false
      }));

    res.json({ ok: true, top });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});
