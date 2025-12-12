const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// JSON file paths
const USERS_FILE = path.join(__dirname, "users.json");
const WITHDRAWALS_FILE = path.join(__dirname, "withdrawals.json");
const ADMIN_LOG_FILE = path.join(__dirname, "admin_logs.json");

// Load JSON safely
function load(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const data = fs.readFileSync(file, "utf8");
        return JSON.parse(data || "[]");
    } catch {
        return [];
    }
}

// Save JSON safely
function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Register route
app.post("/api/register", (req, res) => {
    let users = load(USERS_FILE);
    const { email, password } = req.body;

    if (users.find(u => u.email === email)) {
        return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const newUser = {
        id: Date.now(),
        email,
        password: hashed,
        balance: 1000,
        totalBets: 0,
        totalWins: 0,
        createdAt: new Date().toISOString(),
        role: "user"
    };

    users.push(newUser);
    save(USERS_FILE, users);

    res.json({ message: "Registered successfully", user: newUser });
});

// Login route
app.post("/api/login", (req, res) => {
    const users = load(USERS_FILE);
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    res.json({ message: "Login successful", user });
});

// Plinko bet route
app.post("/api/bet", (req, res) => {
    const users = load(USERS_FILE);
    const { userId, amount, multiplier } = req.body;

    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.balance < amount) {
        return res.status(400).json({ message: "Insufficient balance" });
    }

    const winAmount = Math.floor(amount * multiplier);

    user.balance -= amount;
    user.balance += winAmount;

    // Prevent negative balance EVER
    if (user.balance < 0) user.balance = 0;

    user.totalBets += amount;
    if (winAmount > amount) user.totalWins += (winAmount - amount);

    save(USERS_FILE, users);

    res.json({ balance: user.balance, win: winAmount });
});

// Withdraw route
app.post("/api/withdraw", (req, res) => {
    const users = load(USERS_FILE);
    const withdrawals = load(WITHDRAWALS_FILE);

    const { userId, amount } = req.body;
    const user = users.find(u => u.id === userId);

    if (!user) return res.status(404).json({ message: "User not found" });
    if (amount > user.balance) {
        return res.status(400).json({ message: "Not enough balance" });
    }

    user.balance -= amount;
    withdrawals.push({
        id: Date.now(),
        userId,
        amount,
        status: "pending",
        createdAt: new Date().toISOString()
    });

    save(USERS_FILE, users);
    save(WITHDRAWALS_FILE, withdrawals);

    res.json({ message: "Withdrawal request created" });
});

app.get("/", (req, res) => {
    res.send("Plinko backend is running!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Backend running on " + PORT));
