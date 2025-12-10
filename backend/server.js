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
  // REF- + 6 uppercase alphanum
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
