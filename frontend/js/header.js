// header.js - run on each page (include <script src="js/header.js"></script> before </body>)
(() => {
  try{
    const user = JSON.parse(localStorage.getItem('plinkoUser') || 'null');
    const imgEl = document.querySelector('.profile-circle img');
    const nameEl = document.querySelector('.username');
    if(user){
      if(imgEl) imgEl.src = user.profileUrl || ('https://i.pravatar.cc/48?u=' + encodeURIComponent(user.username));
      if(nameEl) nameEl.textContent = user.username || user.firstName || 'Player';
    } else {
      if(imgEl) imgEl.src = 'https://i.pravatar.cc/48';
      if(nameEl) nameEl.textContent = 'Guest';
    }
  }catch(e){ console.warn('header init error', e); }
})();