// backend/server.js
// Plinko backend (file-based storage). Copy-paste entire file (do not edit small parts on phone).
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
let fetcher = undefined;
try { fetcher = require('node-fetch'); } catch(e){ fetcher = global.fetch; }
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Storage files (robust) ---
const BASE = __dirname || process.cwd();
const USERS_FILE = path.join(BASE, 'users.json');
const WITHDRAW_FILE = path.join(BASE, 'withdrawals.json');
const ADMIN_LOGS = path.join(BASE, 'admin_logs.json');
const JACKPOT_FILE = path.join(BASE, 'jackpot.json');

function ensureFile(filePath, defaultContent = '[]') {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, defaultContent, 'utf8');
      console.log('[storage] created', filePath);
    } else {
      try {
        const raw = fs.readFileSync(filePath, 'utf8') || '';
        if (raw.trim() === '') {
          fs.writeFileSync(filePath, defaultContent, 'utf8');
          console.log('[storage] init empty ->', filePath);
        } else {
          JSON.parse(raw);
        }
      } catch (err) {
        console.error('[storage] invalid JSON, resetting', filePath, err && err.message);
        fs.writeFileSync(filePath, defaultContent, 'utf8');
      }
    }
    return true;
  } catch (err) {
    console.error('[storage] failed ensureFile', filePath, err && err.message);
    return false;
  }
}

ensureFile(USERS_FILE, '[]');
ensureFile(WITHDRAW_FILE, '[]');
ensureFile(ADMIN_LOGS, '[]');
ensureFile(JACKPOT_FILE, JSON.stringify({ amount: 0 }, null, 2));

function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('[storage] readJSON failed for', file, e && e.message);
    return [];
  }
}
function writeJSON(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
    console.log('[storage] wrote', path.basename(file), 'entries:', Array.isArray(obj) ? obj.length : typeof obj);
    return true;
  } catch (e) {
    console.error('[storage] writeJSON failed for', file, e && e.message);
    return false;
  }
}
function readUsers(){ return readJSON(USERS_FILE); }
function writeUsers(u){ return writeJSON(USERS_FILE, u); }
function readWithdrawals(){ return readJSON(WITHDRAW_FILE); }
function writeWithdrawals(w){ return writeJSON(WITHDRAW_FILE, w); }
function readAdminLogs(){ return readJSON(ADMIN_LOGS); }
function writeAdminLogs(x){ return writeJSON(ADMIN_LOGS, x); }
function readJackpot(){ return readJSON(JACKPOT_FILE); }
function writeJackpot(j){ return writeJSON(JACKPOT_FILE, j); }

// --- File upload setup (profile pics) ---
const uploadDir = path.join(BASE,'uploads'); if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// --- Security / CORS / middleware ---
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
    if(!origin) return callback(null, true);
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
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for(let i=0;i<6;i++) s += chars.charAt(Math.floor(Math.random()*chars.length));
  return 'REF-' + s;
}

async function telegramNotify(text, photoPath){
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if(!token || !chatId) return;
  try{
    await fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    if(photoPath && fs.existsSync(photoPath)){
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', fs.createReadStream(photoPath));
      await fetcher(`https://api.telegram.org/bot${token}/sendPhoto`, { method:'POST', body: form });
    }
  }catch(e){ console.error('Telegram error', e && e.message); }
}

// Anti-multi (basic)
function checkAntiMulti(req, email, username, phone){
  const users = readUsers();
  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  if(phone && users.find(u => u.phone && u.phone === phone)) return { blocked:true, reason:'phone matched existing account' };
  const sameIpCount = users.filter(u => (u.lastIp||'') === ip).length;
  if(sameIpCount >= 20) return { blocked:true, reason:'multiple accounts from same IP' };
  const sameUaCount = users.filter(u => (u.lastUa||'') === ua).length;
  if(sameUaCount >= 50) return { blocked:true, reason:'multiple accounts from same device' };
  return { blocked:false };
}

// Admin middleware
function requireAdmin(req, res, next){
  if(req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok:false, error: 'admin required' });
}

// --- Game configuration ---
const SLOTS = [
  { label: 'LOSE', value: 0, weight: 30 },
  { label: '$10', value: 10, weight: 18 },
  { label: '$20', value: 20, weight: 15 },
  { label: '$50', value: 50, weight: 12 },
  { label: '$100', value: 100, weight: 10 },
  { label: '$200', value: 200, weight: 8 },
  { label: '$500', value: 500, weight: 5 },
  { label: '$1000', value: 1000, weight: 1 },
  { label: 'JACKPOT', value: 'JACKPOT', weight: 1 }
];
function pickSlot(){
  const total = SLOTS.reduce((s,x)=>s+(x.weight||1),0);
  let r = Math.random()*total;
  for(const s of SLOTS){
    r -= (s.weight||1);
    if(r <= 0) return s;
  }
  return SLOTS[0];
}

// --- API ROUTES ---

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
      balance: 150,
      cumulativeWins: 0,
      jackpotAwarded: false,
      referralCode: myReferral,
      referredBy: referralCode || null,
      referrals: [],
      referralEarned: 0,
      createdAt: new Date().toISOString(),
      lastIp: req.headers['x-forwarded-for'] || req.connection.remoteAddress || '',
      lastUa: req.headers['user-agent'] || ''
    };

    users.push(user);

    if(referralCode){
      const referrer = users.find(u => u.referralCode === referralCode);
      if(referrer && referrer.id !== user.id){
        const already = (referrer.referrals || []).find(r => r.email === user.email || r.username === user.username);
        if(!already){
          referrer.balance = (referrer.balance || 0) + 30;
          referrer.referralEarned = (referrer.referralEarned || 0) + 30;
          referrer.referrals = referrer.referrals || [];
          referrer.referrals.push({ id: user.id, username: user.username, email: user.email, date: new Date().toISOString() });
          telegramNotify(`<b>Referral credited</b>\nReferrer: ${referrer.username}\nNew user: ${user.username}\n+ $30 credited`);
        }
      }
    }

    writeUsers(users);
    console.log('[register] new user saved:', user.username, user.id);
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

// PLAY
app.post('/api/play', (req, res) => {
  try{
    const body = req.body || {};
    // support both keys: bet or betAmount
    const bet = Number(body.bet || body.betAmount || 0);
    const userId = body.userId;
    if(!userId || !bet || bet <= 0) return res.status(400).json({ ok:false, error: 'Missing user or bet' });

    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if(!user) return res.status(404).json({ ok:false, error: 'User not found' });

    if((user.balance || 0) < bet) return res.status(400).json({ ok:false, error: 'Insufficient balance' });

    // Deduct bet immediately
    user.balance = Math.max(0, (user.balance || 0) - bet);

    // pick slot
    const slot = pickSlot();
    let won = 0;
    let jackpotWon = false;
    if(slot.value === 'JACKPOT'){
      jackpotWon = true;
      won = 4000;
    } else {
      won = Number(slot.value || 0);
    }

    if(won > 0){
      user.balance = (user.balance || 0) + won;
      user.cumulativeWins = (user.cumulativeWins || 0) + won;
    }

    // award jackpot once when cumulative wins >= 2000
    if(!user.jackpotAwarded && (user.cumulativeWins >= 2000 || jackpotWon)){
      user.jackpotAwarded = true;
      if(!jackpotWon){
        user.balance = (user.balance || 0) + 4000;
      }
      telegramNotify(`<b>JACKPOT AWARDED</b>\nUser: ${user.username}\nUserId: ${user.id}\nBalance: $${user.balance}`);
    }

    writeUsers(users);

    return res.status(200).json({
      ok:true,
      outcome: {
        slot: slot.label,
        won: won,
        jackpotUnlocked: !!user.jackpotAwarded,
        balance: user.balance,
        cumulativeWins: user.cumulativeWins || 0
      }
    });
  }catch(e){
    console.error('play err', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// WITHDRAW
app.post('/api/withdraw', (req, res) => {
  try{
    const { userId, amount, method, details } = req.body || {};
    if(!userId || !amount) return res.status(400).json({ ok:false, error:'missing fields' });
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if(!user) return res.status(400).json({ ok:false, error: 'user not found' });

    if(!user.jackpotAwarded) return res.status(403).json({ ok:false, error: 'Withdrawals locked until JACKPOT is awarded' });
    if((user.balance || 0) < Number(amount)) return res.status(400).json({ ok:false, error:'insufficient balance' });

    const w = readWithdrawals();
    const id = uuidv4();
    const item = { id, userId, amount: Number(amount), method: method||'local', details: details||'', status:'pending', createdAt: new Date().toISOString() };
    w.unshift(item);
    writeWithdrawals(w);

    telegramNotify(`<b>Withdrawal Requested</b>\nUser: ${user.username}\nAmount: $${amount}\nMethod: ${method || 'local'}`);
    return res.status(200).json({ ok:true, withdrawal: item });
  }catch(e){
    console.error('withdraw req', e && e.message);
    return res.status(500).json({ ok:false, error: 'Server error' });
  }
});

// GET USER
app.get('/api/user/:id', (req, res) => {
  try{
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if(!user) return res.status(404).json({ ok:false, error: 'Not found' });
    const { password, secretPin, ...pub } = user;
    return res.status(200).json({ ok:true, user: pub });
  }catch(e){
    console.error('get user', e && e.message);
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

// HEALTH
app.get('/api/health', (req, res) => res.json({ ok:true, status:'UP' }));

// ADMIN: simple login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if(!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ ok:false, error:'Unauthorized' });
  req.session.isAdmin = true;
  res.json({ ok:true });
});

// ADMIN: list users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try{
    const users = readUsers().map(u => { const { password, secretPin, ...pub } = u; return pub; });
    return res.json({ ok:true, users });
  }catch(e){ console.error(e && e.message); return res.status(500).json({ ok:false, error:'Server error' }); }
});

// catch-all
app.use('/api/*', (req, res) => res.status(404).json({ ok:false, error: 'Not found' }));

// error handler
app.use((err, req, res, next) => {
  console.error('server error', err && err.message);
  res.status(500).json({ ok:false, error: 'Server error' });
});

// start
app.listen(PORT, () => console.log(`Plinko backend listening on ${PORT}`));
