// backend/server.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');

if(!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended:true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'devsecret', resave:false, saveUninitialized:false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadDir = path.join(__dirname,'uploads'); if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

// helpers
function readUsers(){ return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function writeUsers(u){ fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }
function makeReferralCode(){

  // add after existing helpers in server.js
const WITHDRAW_FILE = path.join(__dirname, 'withdrawals.json');
const ADMIN_LOGS = path.join(__dirname, 'admin_logs.json');
if(!fs.existsSync(WITHDRAW_FILE)) fs.writeFileSync(WITHDRAW_FILE, '[]', 'utf8');
if(!fs.existsSync(ADMIN_LOGS)) fs.writeFileSync(ADMIN_LOGS, '[]', 'utf8');

function readWithdrawals(){ return JSON.parse(fs.readFileSync(WITHDRAW_FILE, 'utf8')); }
function writeWithdrawals(w){ fs.writeFileSync(WITHDRAW_FILE, JSON.stringify(w, null, 2)); }

function logAdmin(action, details){
  const logs = JSON.parse(fs.readFileSync(ADMIN_LOGS, 'utf8'));
  logs.unshift({ at: new Date().toISOString(), action, details });
  fs.writeFileSync(ADMIN_LOGS, JSON.stringify(logs, null, 2));
}
  // REF- + 6 uppercase alphanum
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for(let i=0;i<6;i++) s += chars.charAt(Math.floor(Math.random()*chars.length));
  return 'REF-' + s;
}

async function telegramNotify(text, photoPath){
  const token = process.env.7636367334:AAE6d7AShLfccWJWMkyffSVrvpkURjfqtPY;
  const chatId = process.env.874563737;
  if(!token || !chatId) return;
  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    if(photoPath && fs.existsSync(photoPath)){
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', fs.createReadStream(photoPath));
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method:'POST', body: form });
    }
  }catch(e){ console.error('Telegram error', e.message); }
}


// Register (multipart) - accepts referralCode
app.post('/api/register', upload.single('profilePic'), async (req, res) => {
  try{
    const body = req.body;
    const { firstName,lastName,username,email,password,secretPin,phone,sex,birthday,address, referralCode } = body;
    if(!username || !email || !password || !secretPin) return res.status(400).json({ error: 'Missing fields' });

    const users = readUsers();
    if(users.find(u => u.username === username || u.email === email)) return res.status(400).json({ error: 'User exists' });

    const hashed = await bcrypt.hash(password, 10);
    let profileUrl = null;
    if(req.file) profileUrl = `/uploads/${path.basename(req.file.path)}`;

    // create unique referralCode for this new user
    let myReferral = makeReferralCode();
    // ensure uniqueness
    while(users.find(u => u.referralCode === myReferral)) myReferral = makeReferralCode();

    const user = {
      id: uuidv4(),
      firstName,
      lastName,
      username,
      email,
      password: hashed,
      secretPin,
      phone,
      sex,
      birthday,
      address,
      profileUrl,
      balance: 0,
      hasWonBigBonus: false,
      createdAt: new Date().toISOString(),

      // referral fields
      referralCode: myReferral,       // this user's code to share
      referredBy: referralCode || null, // the code used when registering (may be null)
      referrals: [],                  // list of referred user objects { id, username, date }
      referralEarned: 0               // total earned from referrals
    };

    users.push(user);
    const anti = checkAntiMulti(req, email, username, phone);
if(anti.blocked){
  return res.status(403).json({ error: 'Registration blocked: ' + anti.reason });
}

    // handle referral crediting (only if referralCode provided)
    if(referralCode){
      const referrer = users.find(u => u.referralCode === referralCode);
      if(referrer && referrer.id !== user.id && referrer.email !== user.email){
        // ensure we don't credit twice for same referred email/username
        const already = referrer.referrals && referrer.referrals.find(r => r.email === user.email || r.username === user.username);
        if(!already){
          // credit $30
          referrer.balance = (referrer.balance || 0) + 30;
          referrer.referralEarned = (referrer.referralEarned || 0) + 30;
          referrer.referrals = referrer.referrals || [];
          referrer.referrals.push({ id: user.id, username: user.username, email: user.email, date: new Date().toISOString() });
        }
      }
    }

    writeUsers(users);
    telegramNotify(`<b>New registration</b>\nUser: ${username}\nEmail: ${email}\nReferral used: ${referralCode || 'none'}`, req.file ? req.file.path : null);

    const { password:pw, secretPin:pin, ...publicUser } = user;
    res.json({ ok:true, user: publicUser });

  }catch(e){ console.error(e); res.status(500).json({ error: 'Server error' }); }
});

user.lastIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
user.lastUa = req.headers['user-agent'] || '';
function checkAntiMulti(req, email, username, phone){
  // Simple heuristics:
  // 1) same phone used
  // 2) same email domain + same IP (best-effort)
  // 3) same userAgent fingerprint (basic)
  const users = readUsers();
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';

  // flag if same phone already exists
  if(phone && users.find(u=>u.phone && u.phone === phone)) return { blocked: true, reason: 'phone matched existing account' };

  // flag if same email exact exists (duplicate email handled earlier)
  // detect same UA + same IP pattern
  const sameIpCount = users.filter(u => (u.lastIp||'') === ip).length;
  if(sameIpCount >= 3) return { blocked: true, reason: 'multiple accounts from same IP' };

  const sameUaCount = users.filter(u => (u.lastUa||'') === ua).length;
  if(sameUaCount >= 4) return { blocked: true, reason: 'multiple accounts from same device UA' };

  // otherwise not blocked
  return { blocked:false };
}


// ADMIN login route
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if(!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  req.session.isAdmin = true;
  res.json({ ok:true });
});

// middleware to protect admin endpoints
function requireAdmin(req, res, next){
  if(req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'admin required' });
}

// list users (admin)
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readUsers().map(u => {
    const { password, secretPin, ...pub } = u;
    return pub;
  });
  res.json({ ok:true, users });
});

// block / suspend a user
app.post('/api/admin/user/:id/block', requireAdmin, (req, res) => {
  const { reason, block=true } = req.body;
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if(!user) return res.status(404).json({ error: 'not found' });
  user.blocked = !!block;
  user.blockReason = block ? (reason||'Blocked by admin') : null;
  writeUsers(users);
  logAdmin('block', { userId:user.id, username:user.username, block:user.blocked, reason });
  res.json({ ok:true, user:{ id:user.id, blocked:user.blocked } });
});

// quick search
app.get('/api/admin/search', requireAdmin, (req, res) => {
  const q = (req.query.q||'').toLowerCase();
  const users = readUsers().filter(u => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q));
  res.json({ ok:true, users });
});

// admin: withdrawals list
app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
  const w = readWithdrawals();
  res.json({ ok:true, withdrawals: w });
});

// admin approve/decline withdrawal
app.post('/api/admin/withdraw/:id', requireAdmin, (req, res) => {
  const { id } = req.params; const { action, note } = req.body; // action = 'approve'|'decline'
  const w = readWithdrawals();
  const item = w.find(x => x.id === id);
  if(!item) return res.status(404).json({ error:'not found' });
  if(item.status !== 'pending') return res.status(400).json({ error:'already handled' });

  const users = readUsers();
  const user = users.find(u => u.id === item.userId);
  if(!user) return res.status(404).json({ error:'user not found' });

  if(action === 'approve'){
    // mark as paid (we don't do real payments)
    item.status = 'approved';
    item.adminNote = note || '';
    // subtract balance
    user.balance = Math.max(0, (user.balance||0) - item.amount);
    // optional: record in user.history
    user.lastWithdrawal = { id:item.id, amount:item.amount, at: new Date().toISOString() };
    telegramNotify(`<b>Withdrawal Approved</b>\nUser: ${user.username}\nAmount: $${item.amount}`);
  } else {
    item.status = 'declined';
    item.adminNote = note || '';
    telegramNotify(`<b>Withdrawal Declined</b>\nUser: ${user.username}\nAmount: $${item.amount}\nReason: ${note||'none'}`);
  }
  writeUsers(users); writeWithdrawals(w);
  logAdmin('withdraw', { id, action, note, admin: req.sessionID });
  res.json({ ok:true, withdrawal: item });
});

// Login
app.post('/api/login', async (req, res) => {
  try{
    const { username, password } = req.body;
    const users = readUsers();
    const user = users.find(u => u.username === username || u.email === username);
    if(!user) return res.status(400).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if(!match) return res.status(400).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    const { password:pw, secretPin, ...publicUser } = user;
    res.json({ ok:true, user: publicUser });
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});

// Forgot/reset (unchanged)
app.post('/api/forgot', async (req, res) => {
  try{
    const { email, secretPin, newPassword } = req.body;
    if(!email || !secretPin || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    const users = readUsers();
    const user = users.find(u => u.email === email);
    if(!user) return res.status(400).json({ error: 'No such email' });
    if(user.secretPin !== secretPin) return res.status(400).json({ error: 'Wrong secret pin' });
    user.password = await bcrypt.hash(newPassword, 10);
    writeUsers(users);
    telegramNotify(`<b>Password reset</b>\nUser: ${user.username}\nEmail: ${email}`);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});

// Add bonus (unchanged)
app.post('/api/add-bonus', (req, res) => {
  try{
    const { userId, amount } = req.body;
    const users = readUsers(); const user = users.find(u => u.id === userId);
    if(!user) return res.status(400).json({ error: 'No user' });
    user.balance = (user.balance||0) + Number(amount||0);
    writeUsers(users);
    res.json({ ok:true, balance: user.balance });
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});

// Play (unchanged, respects hasWonBigBonus)
app.post('/api/play', (req, res) => {
  try{
    const { userId, winAmount, triggeredBigBonus } = req.body;
    const users = readUsers(); const user = users.find(u => u.id === userId);
    if(!user) return res.status(400).json({ error: 'No user' });
    if(triggeredBigBonus){
      if(user.hasWonBigBonus) return res.status(400).json({ error: 'Already won big bonus' });
      user.hasWonBigBonus = true;
      user.balance += Number(winAmount||0);
      writeUsers(users);
      telegramNotify(`<b>BIG WIN 🎉</b>\nUser: ${user.username}\nWin: $${winAmount}`);
      return res.json({ ok:true, balance: user.balance });
    }
    user.balance += Number(winAmount||0);
    writeUsers(users);
    res.json({ ok:true, balance: user.balance });
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});

// Winner submit (unchanged)
app.post('/api/winner-submit', upload.fields([{ name:'picture' }, { name:'laugh' }]), (req, res) => {
  try{
    const { fullname, userId } = req.body;
    const pic = req.files && req.files.picture ? req.files.picture[0].path : null;
    const laugh = req.files && req.files.laugh ? req.files.laugh[0].path : null;
    telegramNotify(`<b>Winner Submission</b>\nName: ${fullname}\nUserId: ${userId}`, pic);
    if(laugh) telegramNotify('Laugh pic', laugh);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});

// Get user (unchanged)
app.get('/api/user/:id', (req, res) => {
  try{
    const users = readUsers(); const user = users.find(u => u.id === req.params.id);
    if(!user) return res.status(404).json({ error: 'Not found' });
    const { password, secretPin, ...pub } = user;
    res.json(pub);
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});


// request withdrawal (user)
app.post('/api/withdraw', (req, res) => {
  try{
    const { userId, amount, method, details } = req.body;
    if(!userId || !amount) return res.status(400).json({ error:'missing fields' });
    const users = readUsers(); const user = users.find(u => u.id === userId);
    if(!user) return res.status(400).json({ error: 'user not found' });
    if(user.blocked) return res.status(403).json({ error: 'user blocked' });
    if((user.balance||0) < Number(amount)) return res.status(400).json({ error:'insufficient balance' });

    const w = readWithdrawals();
    const id = uuidv4();
    const reqItem = { id, userId, amount: Number(amount), method: method||'local', details: details||'', status:'pending', createdAt: new Date().toISOString() };
    w.unshift(reqItem);
    writeWithdrawals(w);
    telegramNotify(`<b>Withdrawal Requested</b>\nUser: ${user.username}\nAmount: $${amount}\nMethod: ${method||'local'}`);
    res.json({ ok:true, withdrawal: reqItem });
  }catch(e){ res.status(500).json({ error:'server error' }); }
});

// leaderboard (top balances)
app.get('/api/leaderboard', (req, res) => {
  const users = readUsers().sort((a,b)=> (b.balance||0) - (a.balance||0)).slice(0,20)
    .map(u => ({ id:u.id, username:u.username, balance:u.balance||0 }));
  res.json({ ok:true, top: users });
});

// --- NEW: referrals endpoint (returns user's referral data)
app.get('/api/referrals/:id', (req, res) => {
  try{
    const users = readUsers();
    const user = users.find(u => u.id === req.params.id);
    if(!user) return res.status(404).json({ error: 'User not found' });
    const data = {
      referralCode: user.referralCode || null,
      referralLink: user.referralCode ? `${process.env.FRONTEND_ORIGIN || 'https://your-vercel-app.vercel.app'}/register.html?ref=${user.referralCode}` : null,
      referralEarned: user.referralEarned || 0,
      referrals: user.referrals || []
    };
    res.json({ ok:true, data });
  }catch(e){ res.status(500).json({ error: 'Server error' }); }
});

app.listen(PORT, ()=> console.log('Plinko backend listening on', PORT));
