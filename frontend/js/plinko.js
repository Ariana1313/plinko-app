const API_BASE = "https://plinko-app.onrender.com";
const balanceDisplay = document.getElementById("balanceDisplay");
const betInput = document.getElementById("betAmount");
const playBtn = document.getElementById("playBtn");

// Load user balance on page load
async function loadBalance() {
    const user = JSON.parse(localStorage.getItem("userData"));
    if (!user) return window.location.href = "login.html";

    const res = await fetch(`${API_BASE}/api/balance/${user.id}`);
    const data = await res.json();

    balanceDisplay.innerText = `$${data.balance.toFixed(2)}`;
}

loadBalance();

// Handle play
playBtn.addEventListener("click", async () => {
    const amount = Number(betInput.value);

    if (amount <= 0) return alert("Enter a valid amount");

    showSpinner("Dropping ball…");

    const user = JSON.parse(localStorage.getItem("userData"));

    const res = await fetch(`${API_BASE}/api/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, bet: amount })
    });

    const data = await res.json();
    hideSpinner();

    if (!data.success) {
        return alert(data.message);
    }

    balanceDisplay.innerText = `$${data.newBalance.toFixed(2)}`;

    if (data.jackpot) {
        showCertificate(user.email, data.winAmount);
    }
});

// Certificate Popup Function
function showCertificate(email, amount) {
    const modal = document.getElementById("certModal");
    modal.style.display = "flex";

    const canvas = document.getElementById("certCanvas");
    const ctx = canvas.getContext("2d");

    const img = new Image();
    img.src = "assets/gold-seal.svg";
    img.onload = () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(img, 520, 50, 160, 160);

        ctx.fillStyle = "#000";
        ctx.font = "40px Poppins";
        ctx.textAlign = "center";
        ctx.fillText("JACKPOT WINNER CERTIFICATE", 600, 300);
        ctx.fillText(`Winner: ${email}`, 600, 380);
        ctx.fillText(`Reward: $${amount}`, 600, 460);
    };

    document.getElementById("closeCert").onclick = () => {
        modal.style.display = "none";
    };

    document.getElementById("downloadCert").onclick = () => {
        const link = document.createElement("a");
        link.download = "Jackpot-Certificate.png";
        link.href = canvas.toDataURL();
        link.click();
    };
}
