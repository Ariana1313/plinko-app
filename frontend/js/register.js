function setupToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inputId);
    if (!btn || !inp) return;

    btn.addEventListener("click", () => {
        const isHidden = inp.type === "password";
        inp.type = isHidden ? "text" : "password";
        btn.textContent = isHidden ? "Hide" : "Show";
    });
}

setupToggle("togglePass", "password");
setupToggle("toggleConfirm", "confirmPassword");
