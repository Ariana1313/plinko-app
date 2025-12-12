function setupEye(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inputId);
    if (!btn || !inp) return;

    btn.addEventListener("click", () => {
        const hidden = inp.type === "password";
        inp.type = hidden ? "text" : "password";
        btn.textContent = hidden ? "🙈" : "👁️";
    });
}

setupEye("togglePass", "password");
setupEye("toggleConfirm", "confirmPassword");
