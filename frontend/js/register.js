// Toggle show/hide password
function toggleVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);

    btn.addEventListener("click", () => {
        if (input.type === "password") {
            input.type = "text";
            btn.innerHTML = "🙈"; // hide icon
        } else {
            input.type = "password";
            btn.innerHTML = "👁️"; // show icon
        }
    });
}

// Hook both password fields
toggleVisibility("password", "togglePass");
toggleVisibility("confirmPassword", "toggleConfirm");
