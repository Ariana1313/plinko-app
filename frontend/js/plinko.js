/* plinko.js - simple plinko simulation */
/* bins 0..10 ; center bin (5) is big bonus $4000 */
function getPrizeForBin(i){
  if(i === 5) return 4000;
  const prizes = [0, 5, 10, 25, 50, 0, 50, 100, 250, 1000, 0];
  return prizes[i] || 0;
}
function simulateDrop(){
  // simple triangular distribution to favour middle
  const steps = 10;
  let pos = 5;
  for(let i=0;i<steps;i++){
    pos += (Math.random() > 0.5) ? 1 : -1;
    if(pos < 0) pos = 0;
    if(pos > 10) pos = 10;
  }
  return Math.max(0, Math.min(10, Math.floor(pos)));
}

async function playOnce(userId){
  const bin = simulateDrop();
  const prize = getPrizeForBin(bin);
  const triggeredBig = prize === 4000;
  try{
    const res = await fetch((API || '') + '/api/play', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, winAmount: prize, triggeredBigBonus: triggeredBig }) });
    if(!res.ok){
      const j = await res.json();
      throw new Error(j.error || 'Play failed');
    }
    const j = await res.json();
    return { prize, balance: j.balance };
  }catch(e){ throw e; }
}