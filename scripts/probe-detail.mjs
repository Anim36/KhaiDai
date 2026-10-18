const r = await fetch("http://localhost:3000/api/restaurants/cmui5a57g0003a4bxbql0hde1");
console.log(r.status);
const j = await r.json();
console.log(JSON.stringify(j, null, 2).slice(0, 2000));
