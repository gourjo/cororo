export function hashSeed(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function encodeGenome(g) { return btoa(JSON.stringify(g)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export function decodeGenome(value) { const raw = value.replaceAll('-','+').replaceAll('_','/'); const g = JSON.parse(atob(raw)); for (const key of ['speed','sense','armor']) if (!Number.isInteger(g[key]) || g[key] < 1 || g[key] > 5) throw Error('Некорректный геном'); return g; }
export function createWorld(seed='CORORO-42', width=960, height=640) {
  const random=rng(hashSeed(seed)), food=[], hazards=[], motes=[];
  for(let i=0;i<34;i++) food.push({x:40+random()*(width-80),y:50+random()*(height-100),size:4+random()*4});
  for(let i=0;i<11;i++) hazards.push({x:random()*width,y:random()*height,r:22+random()*42});
  for(let i=0;i<90;i++) motes.push({x:random()*width,y:random()*height,r:random()*2,a:.1+random()*.25});
  return {seed,width,height,food,hazards,motes,time:0,generation:1,dna:0,genome:{speed:3,sense:3,armor:2},creatures:[{x:width/2,y:height/2,energy:72,player:true,angle:0}],events:[]};
}
export function applyGenome(world, genome) { if(world.creatures[0].energy<25)return false; world.genome={...genome}; world.creatures[0].energy-=25; world.generation++; world.dna++; return true; }
export function step(world,input,dt) {
  world.time+=dt; const p=world.creatures[0], g=world.genome;
  const speed=(36+g.speed*15-g.armor*4)*(input.boost?1.8:1); let dx=input.x||0,dy=input.y||0;
  if(input.target){dx=input.target.x-p.x;dy=input.target.y-p.y;if(Math.hypot(dx,dy)<6){input.target=null;dx=dy=0}}
  const len=Math.hypot(dx,dy)||1;p.x=Math.max(8,Math.min(world.width-8,p.x+dx/len*speed*dt));p.y=Math.max(8,Math.min(world.height-8,p.y+dy/len*speed*dt));if(dx||dy)p.angle=Math.atan2(dy,dx);
  p.energy-=dt*(.42+g.speed*.07+g.armor*.04)*(input.boost?2.2:1);
  for(let i=world.food.length-1;i>=0;i--)if(Math.hypot(p.x-world.food[i].x,p.y-world.food[i].y)<15){world.food.splice(i,1);p.energy=Math.min(100,p.energy+18);world.dna++;world.events.push('Поглощена питательная спора');}
  for(const h of world.hazards)if(Math.hypot(p.x-h.x,p.y-h.y)<h.r)p.energy-=dt*Math.max(.2,1.3-g.armor*.2);
  if(p.energy>=88&&world.creatures.length<8){p.energy-=35;world.creatures.push({x:p.x+12,y:p.y+12,energy:55,angle:0});world.generation++;world.events.push('Появилось новое существо');}
  const random=rng(hashSeed(world.seed)+Math.floor(world.time));
  for(let i=1;i<world.creatures.length;i++){const c=world.creatures[i];c.angle+=(random()-.5)*.7;c.x=Math.max(5,Math.min(world.width-5,c.x+Math.cos(c.angle)*18*dt));c.y=Math.max(5,Math.min(world.height-5,c.y+Math.sin(c.angle)*18*dt));}
  p.energy=Math.max(0,p.energy);return p;
}
