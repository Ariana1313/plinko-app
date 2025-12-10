const API_URL = "https://plinko-app.onrender.com";

async function sendToTelegram(details) {
    try {
        const res = await fetch(`${API_URL}/api/send-telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(details)
        });
    } catch (err) {
        console.log("Telegram send failed.");
    }
}
