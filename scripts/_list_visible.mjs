const r = await fetch('http://localhost:3000/api/restaurants?limit=10');
console.log('code:', r.status);
const j = await r.json();
console.log(JSON.stringify(j).slice(0, 1500));