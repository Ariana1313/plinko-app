const API_URL = "https://sturdy-waffle-pj4pq7x5gvpwc6645-3000.app.github.dev";

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
