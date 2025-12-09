async function addBonusToUser(userId, amount=150){
  try{
    const res = await fetch((API || '') + '/api/add-bonus', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, amount }) });
    const j = await res.json();
    if(!res.ok) throw new Error(j.error || 'Add bonus failed');
    return j.balance;
  }catch(e){ throw e; }
}