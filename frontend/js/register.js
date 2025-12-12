// register.js - replace your existing file with this exact content

const API_BASE = 'https://plinko-app.onrender.com'; // <- your real backend

// toggle show/hide for password fields
function makeToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const inp = document.getElementById(inputId);
  if (!btn || !inp) return;
  btn.addEventListener('click', () => {
    if (inp.type === 'password') {
      inp.type = 'text';
      btn.innerText = 'Hide';
    } else {
      inp.type = 'password';
      btn.innerText = 'Show';
    }
  });
}
makeToggle('togglePass', 'password');
makeToggle('toggleConfirm', 'confirmPassword');

// form submission
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // read values
    const fd = new FormData(form);
    const firstName = (fd.get('firstName') || '').toString().trim();
    const username = (fd.get('username') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const password = (fd.get('password') || '').toString();
    const confirmPassword = (fd.get('confirmPassword') || '').toString();
    const referral = (fd.get('referral') || '').toString().trim();

    // client validation
    if (!firstName || !username || !email || !password || !confirmPassword) {
      alert('Please fill all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match — please retype.');
      return;
    }

    // optional: disable button while submitting
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Creating…'; }

    try {
      // send JSON (no image upload used in this example)
      const payload = {
        firstName,
        lastName: (fd.get('lastName') || '').toString().trim(),
        username,
        email,
        password,
        secretPin: (fd.get('pin') || '').toString().trim(),
        phone: (fd.get('phone') || '').toString().trim(),
        birthday: (fd.get('date') || '').toString().trim(),
        address: (fd.get('address') || '').toString().trim(),
        referralCode: referral
      };

      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(()=>null);
        throw new Error(text || `Server returned ${res.status}`);
      }

      const data = await res.json().catch(()=>null);
      // success
      alert('Account created. You will be redirected to the game page.');
      // optionally store token / auto-login flow (if backend returns token)
      // redirect:
      location.href = 'plinko.html';
    } catch (err) {
      console.error('Register error', err);
      alert('Registration failed: ' + (err.message || 'Server error'));
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Create Account'; }
    }
  });
});
