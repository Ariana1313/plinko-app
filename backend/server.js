// backend/server.js
// Plinko backend (JSON storage, small-scale).
// Required env vars (recommended):
// FRONTEND_ORIGIN, ADMIN_PASSWORD, SESSION_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Storage files ---
const BASE = __dirname;
const USERS_FILE = path.join(BASE, 'users.json');
const WITHDRAW_FILE = path.join(BASE, 'withdrawals.json');
const ADMIN_LOGS = path.join(BASE, 'admin_logs.json');
const JACKPOT_FILE = path.join(BASE, 'jackpot.json');

// Ensure files exist
function ensureFile(filePath, initialData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), 'utf8');
  }
}
ensureFile(USERS_FILE, []);
ensureFile(WITHDRAW_FILE, []);
ensureFile(ADMIN_LOGS, []);
ensureFile(JACKPOT_FILE, { amount: 0 });

// Safe read/write helpers
function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8') || '[]';
    return JSON.parse(raw);
  } catch (e) {
    console.error('JSON read error', file, e && e.message);
    return Array.isArray([]) ? [] : {};
  }
}
function writeJSON(file, obj) {
  try {
    // write temp then rename to avoid partial write
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('JSON write error', file, e && e.message);
  }
}

// --- File upload setup (profile pics) ---
const uploadDir = path.join(BASE, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// --- Security middleware ---
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://plinko-app.onrender.com';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", FRONTEND_ORIGIN, "https:"],
      frameAncestors: ["'none'"],
    }
  }
}));

// CORS - allow your frontend origin and allow no-origin (curl)
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin === FRONTEND_ORIGIN) return callback(null, true);
    return callback(new Error('CORS not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

// Parsers & sessions
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true }
}));

// Static uploads
app.use('/uploads', express.static(uploadDir));

// Root
app.get('/', (req, res) => res.status(200).send('Plinko API — running'));

// --- Utils ---
function makeReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'REF-' + s;
}

// Telegram notifications (optional)
async function telegramNotify(text, photoPath) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    // send text
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    if (photoPath && fs.existsSync(photoPath)) {
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', fs.createReadStream(photoPath));
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
    }
  } catch (e) {
    console.error('Telegram error', e && e.message);
  }
}

// Anti-multi heuristics (simple)
function checkAntiMulti(req, email, username, phone) {
  const users = readJSON(USERS_FILE);
  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';

  if (phone && users.find(u => u.phone && u.phone === phone)) return { blocked: true, reason: 'phone matched existing account' };

  const sameIpCount = users.filter(u => (u.lastIp || '') === ip).length;
  if (sameIpCount >= 20) return { blocked: true, reason: 'multiple accounts from same IP' };

  const sameUaCount = users.filter(u => (u.lastUa || '') === ua).length;
  if (sameUaCount >= 50) return { blocked: true, reason: 'multiple accounts from same device' };

  return { blocked: false };
}

// Admin middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, error: 'admin required' });
}

// --- Game configuration ---
// Slot definitions and relative weights (adjust probabilities here)
const SLOTS = [
  { label: 'LOSE', value: 0, weight: 30 },
  { label: '$10', value: 10, weight: 18 },
  { label: '$20', value: 20, weight: 15 },
  { label: '$50', value: 50, weight: 12 },
  { label: '$100', value: 100, weight: 10 },
  { label: '$200', value: 200, weight: 8 },
  { label: '$500', value: 500, weight: 5 },
  { label: '$1000', value: 1000, weight: 1 },
  // JACKPOT slot (rare)
  { label: 'JACKPOT', value: 'JACKPOT', weight: 1 }
];

// helper: pick slot by weight
function pickSlot() {
  const total = SLOTS.reduce((s, x) => s + (x.weight || 1), 0);
  let r = Math.random() * total;
  for (const s of SLOTS) {
    r -= (s.weight || 1);
    if (r <= 0) return s;
  }
  return SLOTS[0];
}

// --- Storage read/write helpers (wrappers) ---
function readUsers() { return readJSON(USERS_FILE); }
function writeUsers(u) { return writeJSON(USERS_FILE, u); }

function readWithdrawals() { return readJSON(WITHDRAW_FILE); }
function writeWithdrawals(w) { return writeJSON(WITHDRAW_FILE, w); }

function logAdmin(action, details) {
  const logs = readJSON(ADMIN_LOGS);
  logs.unshift({ at: new Date().toISOString(), action, details });
  writeJSON(ADMIN_LOGS, logs);
}

function readJackpot() { return readJSON(JACKPOT_FILE); }
function writeJackpot(j) { return writeJSON(JACKPOT_FILE, j); }

// --- API ROUTES ---

// REGISTER (multipart/form-data)
app.post('/api/register', upload.single('profilePic'), async (req, res) => {
  try {
    const body = req.body || {};
    const { firstName, lastName, username, email, password, secretPin, phone, sex, birthday, address } = body;
    let referralCode = body.referralCode || null;
    if (!username || !email || !password || !secretPin) return res.status(400).json({ ok: false, error: 'Missing required fields' });

    const anti = checkAntiMulti(req, email, username, phone);
    if (anti.blocked) return res.status(403).json({ ok: false, error: 'Registration blocked: ' + anti.reason });

    const users = readUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ ok: false, error: 'Username taken' });
    if (users.find(u => u.email === email)) return res.status(400).json({ ok: false, error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    let profileUrl = null;
    if (req.file) profileUrl = `/uploads/${path.basename(req.file.path)}`;

    // create unique referral for new user
    let myReferral = makeReferralCode();
    while (users.find(u => u.referralCode === myReferral)) myReferral = makeReferralCode();

    const user = {
      id: uuidv4(),
      firstName: firstName || '',
      lastName: lastName || '',
      username,
      email,
      password: hashed,
      secretPin,
      phone: phone || '',
      sex: sex || '',
      birthday: birthday || '',
      address: address || '',
      profileUrl,
      balance: 150,               // GIVE $150 on registration
      cumulativeWins: 0,         // track cumulative wins (for jackpot)
      jackpotAwarded: false,     // whether jackpot has been awarded to this user
      referralCode: myReferral,
      referredBy: referralCode || null,
      referrals: [],
      referralEarned: 0,
      createdAt: new Date().toISOString(),
      lastIp: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      lastUa: req.headers['user-agent'] || ''
    };

    // store
    users.push(user);

    // if referral used, credit referrer (idempotent)
    if (referralCode) {
      const referrer = users.find(u => u.referralCode === referralCode);
      if (referrer && referrer.id !== user.id) {
        const already = (referrer.referrals || []).find(r => r.email === user.email || r.username === user.username);
        if (!already) {
          referrer.balance = (referrer.balance || 0) + 30;
          referrer.referralEarned = (referrer.referralEarned || 0) + 30;
          referrer.referrals = referrer.referrals || [];
          referrer.referrals.push({ id: user.id, username: user.username, email: user.email, date: new Date().toISOString() });
          telegramNotify(`<b>Referral credited</b>\nReferrer: ${referrer.username}\nNew user: ${user.username}\n+ $30 credited`);
        }
      }
    }

    writeUsers(users);
    telegramNotify(`<b>New registration</b>\nUser: ${user.username}\nEmail: ${user.email}\nReferral used: ${referralCode || 'none'}`, req.file ? req.file.path : null);

    const { password: pw, secretPin: pin, ...publicUser } = user;
    return res.status(200).json({ ok: true, user: publicUser });
  } catch (e) {
    console.error('register err', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing credentials' });

    const users = readUsers();
    const user = users.find(u => u.username === username || u.email === username);
    if (!user) return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ ok: false, error: 'Invalid credentials' });

    req.session.userId = user.id;
    const { password: pw, secretPin, ...publicUser } = user;
    return res.status(200).json({ ok: true, user: publicUser });
  } catch (e) {
    console.error('login err', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// PLAY - handle one play: deduct bet, pick slot, add winnings, update cumulative wins, handle jackpot
app.post('/api/play', (req, res) => {
  try {
    const { userId, betAmount } = req.body || {};
    const bet = Number(betAmount || 0);
    if (!userId || !bet || bet <= 0) return res.status(400).json({ ok: false, error: 'Missing user or bet' });

    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    // Check balance
    if ((user.balance || 0) < bet) return res.status(400).json({ ok: false, error: 'Insufficient balance' });

    // Deduct bet immediately
    user.balance = Math.max(0, (user.balance || 0) - bet);

    // Determine outcome
    const slot = pickSlot();

    let won = 0;
    let jackpotWon = false;
    if (slot.value === 'JACKPOT') {
      // jackpot slot landed
      jackpotWon = true;
      won = 4000; // jackpot amount
    } else {
      won = Number(slot.value || 0);
    }

    // Add winnings to balance (if any)
    if (won > 0) {
      user.balance = (user.balance || 0) + won;
      user.cumulativeWins = (user.cumulativeWins || 0) + won;
    }

    // If cumulative wins reached >= 2000, award jackpot (one-time)
    if (!user.jackpotAwarded && (user.cumulativeWins >= 2000 || jackpotWon)) {
      // award the jackpot once
      user.jackpotAwarded = true;
      // award jackpot only if not already awarded via jackpot slot (won may already include 4000 if jackpot landed)
      if (!jackpotWon) {
        user.balance = (user.balance || 0) + 4000;
      }
      // Notify & set flag
      telegramNotify(`<b>JACKPOT AWARDED</b>\nUser: ${user.username}\nUserId: ${user.id}\nBalance: $${user.balance}`);
    }

    writeUsers(users);

    return res.status(200).json({
      ok: true,
      outcome: {
        slot: slot.label,
        won: won,
        jackpotUnlocked: !!user.jackpotAwarded,
        balance: user.balance,
        cumulativeWins: user.cumulativeWins || 0
      }
    });
  } catch (e) {
    console.error('play err', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// WITHDRAW - request withdraw (disabled until jackpot is awarded)
app.post('/api/withdraw', (req, res) => {
  try {
    const { userId, amount, method, details } = req.body || {};
    if (!userId || !amount) return res.status(400).json({ ok: false, error: 'missing fields' });
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(400).json({ ok: false, error: 'user not found' });

    // Can't withdraw until jackpot awarded
    if (!user.jackpotAwarded) {
      return res.status(403).json({ ok: false, error: 'Withdrawals locked until JACKPOT is awarded' });
    }

    if ((user.balance || 0) < Number(amount)) return res.status(400).json({ ok: false, error: 'insufficient balance' });

    const w = readWithdrawals();
    const id = uuidv4();
    const item = { id, userId, amount: Number(amount), method: method || 'local', details: details || '', status: 'pending', createdAt: new Date().toISOString() };
    w.unshift(item);
    writeWithdrawals(w);

    // optionally notify
    telegramNotify(`<b>Withdrawal Requested</b>\nUser: ${user.username}\nAmount: $${amount}\nMethod: ${method || 'local'}`);

    return res.status(200).json({ ok: true, withdrawal: item });
  } catch (e) {
    console.error('withdraw req', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// LEADERBOARD
app.get('/api/leaderboard', (req, res) => {
  try {
    const top = readUsers().sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 20).map(u => ({ id: u.id, username: u.username, balance: u.balance || 0 }));
    return res.status(200).json({ ok: true, top });
  } catch (e) {
    console.error('leaderboard', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET USER
app.get('/api/user/:id', (req, res) => {
  try {
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'Not found' });
    const { password, secretPin, ...pub } = user;
    return res.status(200).json({ ok: true, user: pub });
  } catch (e) {
    console.error('get user', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// HEALTH CHECK (Render)
app.get('/api/health', (req, res) => {
  return res.status(200).json({ ok: true, status: 'UP' });
});

// ADMIN example: list users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const users = readUsers().map(u => { const { password, secretPin, ...pub } = u; return pub; });
    return res.status(200).json({ ok: true, users });
  } catch (e) {
    console.error('admin users', e && e.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// catch-all /api
app.use('/api/*', (req, res) => {
  return res.status(404).json({ ok: false, error: 'Not found' });
});

// generic error handler
app.use(function (err, req, res, next) {
  console.error('Server error', err && err.message);
  res.status(500).json({ ok: false, error: 'Server error' });
});

// Start
app.listen(PORT, () => console.log(`Plinko backend listening on ${PORT}`));
