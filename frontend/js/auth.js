// Backend URL
const API_BASE = "https://plinko-app.onrender.com";

// GLOBAL SPINNER
function showSpinner(msg = "Please wait…") {
    document.getElementById("spinnerMsg").innerText = msg;
    document.getElementById("globalSpinner").style.display = "flex";
}

function hideSpinner() {
    document.getElementById("globalSpinner").style.display = "none";
}

// AUTO LOGIN CHECK
(function autoLogin() {
    const user = localStorage.getItem("userData");
    if (!user) return;

    const path = window.location.pathname;

    if (path.includes("login") || path.includes("register")) {
        window.location.href = "plinko.html";
    }
})();

// VPN BLOCKER
(async function vpnBlocker() {
    try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();

        if (data.security && data.security.vpn === true) {
            alert("VPN detected. Please disable VPN to use PLINKO N.U.");
            document.body.innerHTML = "<h1 style='padding:20px;color:red;'>VPN Not Allowed</h1>";
        }
    } catch (err) {
        console.log("VPN check failed.");
    }
})();
