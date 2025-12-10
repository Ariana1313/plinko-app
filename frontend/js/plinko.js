/****************************
 *  FINAL PLINKO GAME ENGINE
 *  Connected With Backend API
 ****************************/

const API_BASE_URL = "https://plinko-app.onrender.com";

// Load bonus when page opens
window.onload = async () => {
    await checkAuth();
    await loadUserBonus();
};

// Fetch user bonus from backend
async function loadUserBonus() {
    const token = getToken();

    const res = await fetch(`${API_BASE_URL}/api/bonus`, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    const data = await res.json();
    document.getElementById("bonusAmount").innerText = data.bonus || 0;
}

// Add or remove bonus in backend
async function updateBonus(amount) {
    const token = getToken();

    await fetch(`${API_BASE_URL}/api/bonus/update`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount })
    });

    await loadUserBonus();
}

/********************************************************
 *                P L I N K O   E N G I N E
 ********************************************************/

function playPlinko() {
    const board = document.getElementById("plinkoBoard");
    const ball = document.createElement("div");
    ball.classList.add("ball");
    board.appendChild(ball);

    let left = 140; // start center
    let top = 0;

    const interval = setInterval(() => {
        top += 5;
        left += (Math.random() > 0.5 ? 7 : -7);

        ball.style.top = top + "px";
        ball.style.left = left + "px";

        // When ball reaches bottom
        if (top >= 430) {
            clearInterval(interval);

            let winAmount = calculateWin(left);
            handleWin(winAmount);

            setTimeout(() => ball.remove(), 1500);
        }
    }, 40);
}

// Determine reward based on where the ball lands
function calculateWin(position) {
    if (position < 60) return 50;
    if (position < 120) return 100;
    if (position < 180) return 200;
    if (position < 240) return 500;
    return 1500; // big bonus zone
}

async function handleWin(amount) {
    if (amount === 1500) {
        // Trigger BIG BONUS
        playBigBonus();
        return;
    }

    await updateBonus(amount);
    showPopup(`You won $${amount}!`);
}

// BIG BONUS DROP → win $4000
async function playBigBonus() {
    // Disable repeating big wins forever
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}/api/user/bigbonus`, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    const data = await res.json();
    if (data.alreadyWon) {
        showPopup("You already won the big bonus!");
        return;
    }

    // Award $4000
    await updateBonus(4000);

    // Sound
    const audio = new Audio("sounds/win.mp3");
    audio.play();

    // Popup
    showPopup("🎉 Congratulations! You won the BIG BONUS: $4000!");

    // Redirect to certificate page
    setTimeout(() => {
        window.location.href = "certificate.html";
    }, 3000);
}

// Popup UI
function showPopup(message) {
    const popup = document.getElementById("popup");
    popup.innerText = message;
    popup.style.display = "block";

    setTimeout(() => {
        popup.style.display = "none";
    }, 4000);
          }
