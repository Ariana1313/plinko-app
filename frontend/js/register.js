const API_BASE = "https://plinko-app.onrender.com";  

document.getElementById("registerForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    // Read visible referral input
    const visibleRef = document.getElementById("referralCodeVisible").value;
    if (visibleRef.trim() !== "") {
        formData.set("referralCode", visibleRef.trim());
    }

    try {
        const res = await fetch(`${API_BASE}/api/register`, {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            let msg = errorData.message || "Registration failed.";
            alert(msg);
            return;
        }

        const data = await res.json();

        // SUCCESS
        alert("Registration successful!");
        window.location.href = "plinko.html";

    } catch (err) {
        alert("Network error – please try again");
    }
});
