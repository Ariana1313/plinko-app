// auth.js - small helpers
const API_BASE = "https://plinko-app.onrender.com"; // your render backend URL

function saveUser(user){
  localStorage.setItem('plinkoUser', JSON.stringify(user));
}
function getUser(){
  try { return JSON.parse(localStorage.getItem('plinkoUser') || 'null'); } catch(e){ return null; }
}
function logout(){
  localStorage.removeItem('plinkoUser');
  location.href = 'index.html';
}
