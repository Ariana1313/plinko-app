const API_URL = "https://sturdy-waffle-pj4pq7x5gvpwc6645-3000.app.github.dev";

// Send form submission to backend → backend sends to Telegram
async function sendToTelegram(formData) {
    try {
        const response = await fetch(`${API_URL}/send-telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        return await response.json();
    } catch (err) {
        console.log("Telegram error:", err);
        return { success: false };
    }
}
