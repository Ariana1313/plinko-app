// frontend/js/register.js
console.log("REGISTER.JS LOADED!");
alert("REGISTER.JS IS RUNNING");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");

  if (!form) {
    console.error("registerForm NOT FOUND");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        body: formData
      });

      const j = await res.json();
      console.log("REG RESULT:", j);

      if (!j.ok) {
        alert(j.error || "Registration failed");
        return;
      }

      // SAVE USER
      localStorage.setItem("plinkoUser", JSON.stringify(j.user));

      alert("Registration success! $150 bonus added.");
      location.href = "plinko.html";

    } catch (err) {
      console.error(err);
      alert("Network error—backend unreachable.");
    }
  });
});
