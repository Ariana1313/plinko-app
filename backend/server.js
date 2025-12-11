// backend/server.js
// Plinko Backend — JSON storage, referrals, jackpot logic, withdrawals lock, security

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const session = require("express-session");
const cors = require("cors");
const multer = require("multer");
const FormData = require("form-data");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- FILE STORAGE --------------------
const BASE = __dirname;
const USERS_FILE = path.join(BASE, "users.json");
const WITHDRAW_FILE = path.join(BASE, "withdrawals.json");
const ADMIN_LOGS = path.join(BASE, "admin_logs.json");
const JACKPOT_FILE = path.join(BASE, "jackpot.json");

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(WITHDRAW_FILE)) fs.writeFileSync(WITHDRAW_FILE, "[]");
if (!fs.existsSync(ADMIN_LOGS)) fs.writeFileSync(ADMIN_LOGS, "[]");
if (!fs.existsSync(JACKPOT_FILE)) fs.writeFileSync(JACKPOT_FILE, JSON.stringify({ amount: 0 }));

function readJSON(f) {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); }
  catch { return []; }
}
function writeJSON(f, data) {
  fs.writeFileSync(f, JSON.stringify(data, null, 2));
}

// -------------------- UPLOAD SETUP --------------------
const uploadDir = path.join(BASE, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// -------------------- SECURITY --------------------
const FRONTEND = process.env.FRONTEND_ORIGIN || "https://plinko-app-nu.vercel.app";

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", FRONTEND, "https:"],
      },
    },
  })
);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (origin === FRONTEND) return cb(null, true);
      return cb(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));

// -------------------- UTILS --------------------
function makeReferralCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return "REF-" + s;
}

async function telegramNotify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
    });
  } catch {}
}

// -------------------- REGISTER --------------------
app.post("/api/register", upload.single("profilePic"), async (req, res) => {
  try {
    const body = req.body;
    const { firstName, lastName, username, email, password, secretPin } = body;

    if (!username || !email || !password || !secretPin)
      return res.status(400).json({ ok: false, error: "Missing fields" });

    const users = readJSON(USERS_FILE);
    if (users.find((u) => u.username === username))
      return res.status(400).json({ ok: false, error: "Username taken" });
    if (users.find((u) => u.email === email))
      return res.status(400).json({ ok: false, error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);

    let profileUrl = null;
    if (req.file) profileUrl = "/uploads/" + req.file.filename;

    let myRef = makeReferralCode();
    while (users.find((u) => u.referralCode === myRef)) myRef = makeReferralCode();

    const newUser = {
      id: uuidv4(),
      firstName,
      lastName,
      username,
      email,
      password: hashed,
      secretPin,
      phone: body.phone || "",
      sex: body.sex || "",
      birthday: body.birthday || "",
      address: body.address || "",
      profileUrl,
      balance: 150,          // ⭐ GIVE $150 BONUS
      referralCode: myRef,
      referredBy: body.referralCode || null,
      referrals: [],
      referralEarned: 0,
      cumulativeWins: 0,
      hasWonBigBonus: false,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);

    if (body.referralCode) {
      const ref = users.find((u) => u.referralCode === body.referralCode);
      if (ref) {
        ref.balance += 30;     // ⭐ REFERRAL BONUS
        ref.referralEarned += 30;
        ref.referrals.push({
          id: newUser.id,
          username: newUser.username,
          date: new Date().toISOString(),
        });
      }
    }

    writeJSON(USERS_FILE, users);

    const { password: pw, secretPin: sp, ...publicUser } = newUser;
    return res.status(200).json({ ok: true, user: publicUser });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// -------------------- LOGIN --------------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);

    const user = users.find(
      (u) => u.username === username || u.email === username
    );
    if (!user) return res.status(400).json({ ok: false, error: "Invalid login" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ ok: false, error: "Wrong password" });

    req.session.userId = user.id;

    const { password: pw, secretPin, ...pub } = user;
    return res.status(200).json({ ok: true, user: pub });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// -------------------- PLAY — BET, WIN, JACKPOT --------------------
app.post("/api/play", (req, res) => {
  try {
    const { userId, betAmount, slotWin } = req.body;
    const users = readJSON(USERS_FILE);

    const user = users.find((u) => u.id === userId);
    if (!user) return res.status(400).json({ ok: false, error: "User not found" });

    const bet = Number(betAmount || 0);
    const win = Number(slotWin || 0);

    if (bet <= 0) return res.status(400).json({ ok: false, error: "Invalid bet" });
    if (user.balance < bet)
      return res.status(400).json({ ok: false, error: "Insufficient funds" });

    // Deduct bet
    user.balance -= bet;

    // Add winnings
    user.balance += win;

    // Track total wins
    user.cumulativeWins += win;

    let jackpot = false;

    // JACKPOT AT 2000+ WINS
    if (!user.hasWonBigBonus && user.cumulativeWins >= 2000) {
      user.hasWonBigBonus = true;
      user.balance += 4000; // ⭐ JACKPOT VALUE
      jackpot = true;

      telegramNotify(
        `<b>🎉 JACKPOT WON 🎉</b>\nUser: ${user.username}\nAward: $4000`
      );
    }

    writeJSON(USERS_FILE, users);

    return res.status(200).json({
      ok: true,
      balance: user.balance,
      jackpot,
      winAmount: win,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

// -------------------- WITHDRAW — BLOCK UNTIL JACKPOT --------------------
app.post("/api/withdraw", (req, res) => {
  try {
    const { userId, amount, method, details } = req.body;

    const users = readJSON(USERS_FILE);
    const user = users.find((u) => u.id === userId);

    if (!user) return res.status(400).json({ ok:false, error:"User not found" });

    // BLOCK WITHDRAWALS UNTIL JACKPOT
    if (!user.hasWonBigBonus) {
      return res.status(403).json({
        ok:false,
        error:"Please continue playing — jackpot not yet won."
      });
    }

    const amt = Number(amount || 0);
    if (amt <= 0) return res.status(400).json({ ok:false, error:"Invalid amount" });
    if (user.balance < amt) return res.status(400).json({ ok:false, error:"Not enough balance" });

    const withdrawals = readJSON(WITHDRAW_FILE);
    const id = uuidv4();

    const item = {
      id,
      userId,
      amount: amt,
      method: method || "local",
      details: details || "",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    withdrawals.unshift(item);
    writeJSON(WITHDRAW_FILE, withdrawals);

    telegramNotify(`<b>Withdraw Request</b>\nUser: ${user.username}\nAmount: $${amt}`);

    return res.status(200).json({ ok: true, withdrawal: item });

  } catch {
    return res.status(500).json({ ok:false, error:"Server error" });
  }
});

// -------------------- USER DATA --------------------
app.get("/api/user/:id", (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: "Not found" });

  const { password, secretPin, ...pub } = user;
  res.json({ ok: true, user: pub });
});

// -------------------- LEADERBOARD --------------------
app.get("/api/leaderboard", (req, res) => {
  const top = readJSON(USERS_FILE)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0))
    .slice(0, 20)
    .map((u) => ({ username: u.username, balance: u.balance }));
  res.json({ ok: true, top });
});

// -------------------- HEALTH CHECK --------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "UP" });
});

// -------------------- 404 --------------------
app.use("/api/*", (req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// -------------------- START --------------------
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
