// header.js - populate header with local user profile
(function(){
  const u = JSON.parse(localStorage.getItem('plinkoUser') || 'null');
  const img = document.querySelector('.profile-circle img');
  const name = document.querySelector('.username');
  if(u){
    if(img) img.src = u.profileUrl || ('https://i.pravatar.cc/48?u=' + encodeURIComponent(u.username));
    if(name) name.textContent = u.username || (u.firstName ? u.firstName : 'Player');
  } else {
    if(img) img.src = 'https://i.pravatar.cc/48';
    if(name) name.textContent = 'Guest';
  }
})();
