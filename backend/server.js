// backend/server.js
// Final Plinko backend — server-authoritative play + jackpot + referral + withdraw lock
// Env vars to set: FRONTEND_ORIGIN, SESSION_SECRET, ADMIN_PASSWORD (opt), TELEGRAM_BOT_TOKEN (opt), TELEGRAM_CHAT_ID (opt)

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

// --- Files & storage ---
const BASE = __dirname;
const USERS_FILE = path.join(BASE, 'users.json');
const WITHDRAW_FILE = path.join(BASE, 'withdrawals.json');
const ADMIN_LOGS = path.join(BASE, 'admin_logs.json');
const JACKPOT_FILE = path.join(BASE, 'jackpot.json');

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
if (!fs.existsSync(WITHDRAW_FILE)) fs.writeFileSync(WITHDRAW_FILE, '[]', 'utf8');
if (!fs.existsSync(ADMIN_LOGS)) fs.writeFileSync(ADMIN_LOGS, '[]', 'utf8');
if (!fs.existsSync(JACKPOT_FILE)) fs.writeFileSync(JACKPOT_FILE, JSON.stringify({ amount: 4000, awarded: [] }, null, 2), 'utf8');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); }
  catch (e) { return []; }
}
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }

function readUsers(){ return readJSON(USERS_FILE); }
function writeUsers(u){ writeJSON(USERS_FILE, u); }
function readWithdrawals(){ return readJSON(WITHDRAW_FILE); }
function writeWithdrawals(w){ writeJSON(WITHDRAW_FILE, w); }
function readJackpot(){ return readJSON(JACKPOT_FILE); }
function writeJackpot(j){ writeJSON(JACKPOT_FILE, j); }
function logAdmin(action, details){
  const logs = readJSON(ADMIN_LOGS);
  logs.unshift({ at: new Date().toISOString(), action, details });
  writeJSON(ADMIN_LOGS, logs);
}

// --- Uploads ---
const uploadDir = path.join(BASE, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// --- Security & CORS ---
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://plinko-app-nu.vercel.app';

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

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true); // allow non-browser (curl)
    if(origin === FRONTEND_ORIGIN) return callback(null, true);
    return callback(new Error('CORS not allowed'));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

const limiter = rateLimit({
  windowMs: 60*1000,
  max: 120,
  message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'devsecret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true }
}));

app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => res.status(200).send('Plinko API — running'));

// --- Utilities ---
function makeReferralCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<6;i++) s += chars.charAt(Math.floor(Math.random()*chars.length));
  return 'REF-' + s;
}

// Telegram notifications (reads token & chat id from env vars)
async function telegramNotify(text, photoPath){
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if(!token || !chatId) return;
  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    if(photoPath && fs.existsSync(photoPath)){
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', fs.createReadStream(photoPath));
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method:'POST', body: form });
    }
  }catch(e){ console.error('Telegram error', e && e.message); }
}

// simple anti-multi check (phone/ip/ua)
function checkAntiMulti(req, email, username, phone){
  const users = readUsers();
  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';

  if(phone && users.find(u => u.phone && u.phone === phone)) return { blocked:true, reason:'phone matched existing account' };

  const sameIpCount = users.filter(u => (u.lastIp||'') === ip).length;
  if(sameIpCount >= 10) return { blocked:true, reason:'multiple accounts from same IP' };

  const sameUaCount = users.filter(u => (u.lastUa||'') === ua).length;
  if(sameUaCount >= 20) return { blocked:true, reason:'multiple accounts from same device' };

  return { blocked:false };
}

// admin check
function requireAdmin(req, res, next){
  if(req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'admin required' });
}

// -------------------- API --------------------

// REGISTER
app.post('/api/register', upload.single('profilePic'), async (req, res) => {
  try{
    const body = req.body || {};
    const { firstName, lastName, username, email, password, secretPin, phone, sex, birthday, address } = body;
    let referralCode = body.referralCode || null;

    if(!username || !email || !password || !secretPin) return res.status(400).json({ ok:false, error: 'Missing required fields' });

    const anti = checkAntiMulti(req, email, username, phone);
    if(anti.blocked) return res.status(403).json({ ok:false, error: 'Registration blocked: ' + anti.reason });

    const users = readUsers();
    if(users.find(u => u.username === username)) return res.status(400).json({ ok:false, error: 'Username taken' });
    if(users.find(u => u.email === email)) return res.status(400).json({ ok:false, error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    let profileUrl = null;
    if(req.file) profileUrl = `/uploads/${path.basename(req.file.path)}`;

    let myReferral = makeReferralCode();
    while(users.find(u => u.referralCode === myReferral)) myReferral = makeReferralCode();

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
      balance: 150,               // welcome bonus
      cumulativeWins: 0,         // sum of wins only
      jackpotAwarded: false,     // whether big 4k awarded
      jackpotUnlocked: false,    // allow withdrawals after big award
      hasWonBigBonus: false,
      createdAt: new Date().toISOString(),

      referralCode: myReferral,
      referredBy: referralCode || null,
      referrals: [],
      referralEarned: 0,

      lastIp: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      lastUa: req.headers['user-agent'] || ''
    };

    users.push(user);

    if(referralCode){
      const referrer = users.find(u => u.referralCode === referralCode);
      if(referrer && referrer.id !== user.id){
        const already = (referrer.referrals || []).find(r => r.email === user.email || r.username === user.username);
        if(!already){
          referrer.balance = (referrer.balance || 0) + 30; // referral bonus
          referrer.referralEarned = (referrer.referralEarned || 0) + 30;
          referrer.referrals = referrer.referrals || [];
          referrer.referrals.push({ id: user.id, username: user.username, email: user.email, date: new Date().toISOString() });
          telegramNotify(`<b>Referral credited</b>\nReferrer: ${referrer.username}\nNew user: ${user.username}\n+ $30 credited`);
        }
      }
    }

    writeUsers(users);
    telegramNotify(`<b>New registration</b>\nUser: ${user.username}\nEmail: ${user.email}\nReferral used: ${referralCode || 'none'}`, req.file ? req.file.path : null);

    const { password:pw, secretPin:pin, ...publicUser } = user;
    return res.status(200).json({ ok:true, user: publicUser });
  }catch(e){
    console.error('register err', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try{
    const { username, password } = req.body || {};
    if(!username || !password) return res.status(400).json({ ok:false, error: 'Missing credentials' });

    const users = readUsers();
    const user = users.find(u => u.username === username || u.email === username);
    if(!user) return res.status(400).json({ ok:false, error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if(!match) return res.status(400).json({ ok:false, error: 'Invalid credentials' });

    req.session.userId = user.id;
    const { password:pw, secretPin, ...publicUser } = user;
    return res.status(200).json({ ok:true, user: publicUser });
  }catch(e){
    console.error('login err', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// RESET PASSWORD
app.post('/api/reset-password', async (req, res) => {
  try{
    const { email, secretPin, newPassword } = req.body || {};
    if(!email || !secretPin || !newPassword) return res.status(400).json({ ok:false, error: 'Missing fields' });
    const users = readUsers();
    const user = users.find(u => u.email === email);
    if(!user) return res.status(400).json({ ok:false, error: 'No such email' });
    if(user.secretPin !== secretPin) return res.status(400).json({ ok:false, error: 'Wrong secret pin' });
    user.password = await bcrypt.hash(newPassword, 10);
    writeUsers(users);
    telegramNotify(`<b>Password reset</b>\nUser: ${user.username}\nEmail: ${email}`);
    return res.status(200).json({ ok:true });
  }catch(e){
    console.error('reset err', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// GET USER
app.get('/api/user/:id', (req, res) => {
  try{
    const users = readUsers(); const user = users.find(u => u.id === req.params.id);
    if(!user) return res.status(404).json({ ok:false, error: 'Not found' });
    const { password, secretPin, ...pub } = user;
    return res.status(200).json({ ok:true, user: pub });
  }catch(e){
    console.error('get user', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

/*
  PLAY endpoint (server authoritative)
  Request body: { userId, bet } 
  Response: { ok, balance, win, isJackpot, jackpotAward, message }
*/
app.post('/api/play', (req, res) => {
  try{
    const { userId, bet } = req.body || {};
    if(!userId || typeof bet === 'undefined') return res.status(400).json({ ok:false, error:'Missing fields' });
    const amount = Number(bet);
    if(isNaN(amount) || amount <= 0) return res.status(400).json({ ok:false, error:'Invalid bet' });

    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if(!user) return res.status(400).json({ ok:false, error:'User not found' });

    if(user.blocked) return res.status(403).json({ ok:false, error:'User blocked' });
    if((user.balance || 0) < amount) return res.status(400).json({ ok:false, error:'Insufficient balance' });

    // Deduct bet immediately
    user.balance = Number(user.balance || 0) - amount;

    // Define slots and weights
    // Layout (left->right): LOSE,10,20,50,100,200,500,1000,JACKPOT(4000)
    const slots = [
      { label: 'LOSE', amount: 0 },
      { label: '10', amount: 10 },
      { label: '20', amount: 20 },
      { label: '50', amount: 50 },
      { label: '100', amount: 100 },
      { label: '200', amount: 200 },
      { label: '500', amount: 500 },
      { label: '1000', amount: 1000 },
      { label: 'JACKPOT', amount: 4000 }
    ];
    const weights = [40, 18, 12, 10, 8, 6, 3, 1, 0.2]; // adjust for probabilities

    // Weighted random pick
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random() * total;
    let idx = 0;
    for(let i=0;i<weights.length;i++){
      r -= weights[i];
      if(r <= 0){ idx = i; break; }
    }
    const picked = slots[idx];
    let win = Number(picked.amount || 0);
    let isJackpot = false;
    if(picked.label === 'JACKPOT'){
      // jackpot directly hit
      isJackpot = true;
      win = 4000;
    }

    // Credit win (if any)
    if(win > 0){
      user.balance = Number(user.balance || 0) + win;
      user.cumulativeWins = (user.cumulativeWins || 0) + win;
    }

    // If cumulativeWins >= 2000 and jackpot not yet awarded -> award big 4000
    let jackpotAward = 0;
    if((user.cumulativeWins || 0) >= 2000 && !user.jackpotAwarded){
      user.jackpotAwarded = true;
      user.jackpotUnlocked = true;
      user.balance = Number(user.balance || 0) + 4000;
      jackpotAward = 4000;
      telegramNotify(`<b>BIG JACKPOT AWARDED</b>\nUser: ${user.username}\nAward: $4000`);
      const j = readJackpot();
      j.awarded = j.awarded || [];
      j.awarded.push({ userId: user.id, username: user.username, at: new Date().toISOString(), amount: 4000 });
      writeJackpot(j);
    }

    writeUsers(users);

    const message = win > 0 ? `You won $${win}` : 'No win this time';
    return res.status(200).json({
      ok: true,
      balance: Number(user.balance || 0),
      win,
      isJackpot: isJackpot || false,
      jackpotAward,
      message
    });

  }catch(e){
    console.error('play err', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// WITHDRAW - blocked until jackpot unlocked for that user
app.post('/api/withdraw', (req, res) => {
  try{
    const { userId, amount, method, details } = req.body || {};
    if(!userId || typeof amount === 'undefined') return res.status(400).json({ ok:false, error:'Missing fields' });
    const amt = Number(amount);
    if(isNaN(amt) || amt <= 0) return res.status(400).json({ ok:false, error:'Invalid amount' });

    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if(!user) return res.status(400).json({ ok:false, error:'User not found' });

    // Block until jackpot unlocked/awarded
    if(!user.jackpotUnlocked) return res.status(403).json({ ok:false, error:'Withdrawals locked — win the jackpot to enable withdrawals' });

    if(user.blocked) return res.status(403).json({ ok:false, error:'User blocked' });
    if((user.balance || 0) < amt) return res.status(400).json({ ok:false, error:'Insufficient balance' });

    const w = readWithdrawals();
    const id = uuidv4();
    const item = { id, userId, amount: amt, method: method || 'local', details: details || '', status: 'pending', createdAt: new Date().toISOString() };
    w.unshift(item);
    writeWithdrawals(w);

    // optionally reduce balance now or wait until admin approves. We'll NOT reduce here (admin approves later).
    telegramNotify(`<b>Withdrawal Requested</b>\nUser: ${user.username}\nAmount: $${amt}`);

    return res.status(200).json({ ok:true, withdrawal: item });
  }catch(e){
    console.error('withdraw err', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// LEADERBOARD
app.get('/api/leaderboard', (req, res) => {
  try{
    const top = readUsers().sort((a,b)=>(b.balance||0)-(a.balance||0)).slice(0,20).map(u=>({ id:u.id, username:u.username, balance:u.balance||0 }));
    return res.status(200).json({ ok:true, top });
  }catch(e){
    console.error('leaderboard', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// ADMIN endpoints (login & management)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if(!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ ok:false, error:'Unauthorized' });
  req.session.isAdmin = true;
  return res.status(200).json({ ok:true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  try{
    const users = readUsers().map(u => { const { password, secretPin, ...pub } = u; return pub; });
    return res.status(200).json({ ok:true, users });
  }catch(e){ console.error('admin users', e && e.message); return res.status(500).json({ ok:false, error:'Server error' }); }
});

app.post('/api/admin/user/:id/block', requireAdmin, (req, res) => {
  try{
    const { reason, block } = req.body || {};
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if(!user) return res.status(404).json({ ok:false, error:'not found' });
    user.blocked = !!block;
    user.blockReason = block ? (reason||'Blocked by admin') : null;
    writeUsers(users);
    logAdmin('block', { userId:user.id, username:user.username, block:user.blocked, reason });
    return res.status(200).json({ ok:true, user:{ id:user.id, blocked:user.blocked } });
  }catch(e){ console.error('admin block', e && e.message); return res.status(500).json({ ok:false, error: 'server error' }); }
});

app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
  try{
    const w = readWithdrawals();
    return res.status(200).json({ ok:true, withdrawals: w });
  }catch(e){ console.error('admin withdrawals', e && e.message); return res.status(500).json({ ok:false, error:'server error' }); }
});

app.post('/api/admin/withdraw/:id', requireAdmin, (req, res) => {
  try{
    const { action, note } = req.body || {};
    const w = readWithdrawals();
    const item = w.find(x => x.id === req.params.id);
    if(!item) return res.status(404).json({ ok:false, error:'not found' });
    if(item.status !== 'pending') return res.status(400).json({ ok:false, error:'already handled' });

    const users = readUsers();
    const user = users.find(u => u.id === item.userId);
    if(!user) return res.status(404).json({ ok:false, error:'user not found' });

    if(action === 'approve'){
      item.status = 'approved';
      item.adminNote = note || '';
      // deduct balance (admin approves money out)
      user.balance = Math.max(0, (user.balance || 0) - item.amount);
      user.lastWithdrawal = { id: item.id, amount: item.amount, at: new Date().toISOString() };
      telegramNotify(`<b>Withdrawal Approved</b>\nUser: ${user.username}\nAmount: $${item.amount}`);
    } else {
      item.status = 'declined';
      item.adminNote = note || '';
      telegramNotify(`<b>Withdrawal Declined</b>\nUser: ${user.username}\nAmount: $${item.amount}\nReason: ${note || 'none'}`);
    }

    writeUsers(users); writeWithdrawals(w);
    logAdmin('withdraw', { id: item.id, action, note, admin: req.sessionID });
    return res.status(200).json({ ok:true, withdrawal: item });
  }catch(e){
    console.error('admin withdraw', e && e.message);
    return res.status(500).json({ ok:false, error:'server error' });
  }
});

// HEALTH
app.get('/api/health', (req, res) => {
  return res.status(200).json({ ok: true, status: 'UP' });
});

// Catch-all
app.use('/api/*', (req, res) => {
  return res.status(404).json({ ok:false, error: 'Not found' });
});

// Error handler
app.use(function(err, req, res, next){
  console.error('Server error', err && err.message);
  res.status(500).json({ ok:false, error: 'Server error' });
});

// Start
app.listen(PORT, () => console.log(`Plinko backend listening on ${PORT}`));
