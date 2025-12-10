// auth.js - handles login/logout + helpers
const API_BASE = "https://plinko-app.onrender.com";

function saveUser(user){
  localStorage.setItem('plinkoUser', JSON.stringify(user));
}
function getUser(){
  return JSON.parse(localStorage.getItem('plinkoUser') || 'null');
}
function logout(){
  localStorage.removeItem('plinkoUser');
  location.href = 'index.html';
}
