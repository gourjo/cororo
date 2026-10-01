import { applyGenome, createWorld, decodeGenome, encodeGenome, hashSeed, step } from './simulation.mjs';

const $ = id => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d');
const portrait = $('portrait').getContext('2d');
const input = { x: 0, y: 0, target: null, boost: false };
const stages = [
  ['ЗАРОЖДЕНИЕ', '01'],
  ['АДАПТАЦИЯ', '02'],
  ['СООБЩЕСТВО', '03'],
  ['РАЗУМ', '04'],
];
const goals = [
  { title: 'СОЗДАЙТЕ ПОТОМСТВО', description: 'Соберите энергию и вырастите популяцию.', progress: w => Math.min(w.creatures.length, 2), target: 2, unit: 'существа' },
  { title: 'ЗАКРЕПИТЕ МУТАЦИЮ', description: 'Измените тело в редакторе и примените геном.', progress: w => Math.min(w.mutations, 1), target: 1, unit: 'мутация' },
  { title: 'ИЗУЧИТЕ БИОМ', description: 'Найдите и поглотите шесть питательных спор.', progress: w => Math.min(w.foodsEaten, 6), target: 6, unit: 'спор' },
  { title: 'СОЗДАЙТЕ СТАЮ', description: 'Вырастите устойчивую группу из четырёх клеток.', progress: w => Math.min(w.creatures.length, 4), target: 4, unit: 'существа' },
];

let world;
let paused = false;
let last = performance.now();
let lastEvent = 0;
let goalIndex = 0;
let toastTimer;

function log(title, text = '') {
  const item = document.createElement('li');
  item.innerHTML = `<b>${title}</b>${text}`;
  $('log').prepend(item);
  while ($('log').children.length > 6) $('log').lastChild.remove();
}

function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1800);
}

function applyInterfaceColor(color, save = true) {
  document.documentElement.style.setProperty('--lime', color);
  $('ui-color').value = color;
  if (save) localStorage.setItem('cororo-ui-color', color);
}

function reset(seed) {
  world = createWorld(seed, canvas.width, canvas.height);
  input.target = null;
  lastEvent = 0;
  goalIndex = 0;
  $('seed-label').textContent = hashSeed(seed).toString(16).toUpperCase().padStart(8, '0');
  $('creature-color').value = world.genome.bodyColor;
  for (const key of ['speed', 'sense', 'armor']) {
    $(key).value = world.genome[key];
    $(`${key}-value`).textContent = world.genome[key];
  }
  $('log').innerHTML = '';
  log('МИР ПРОБУДИЛСЯ', `Seed ${seed}`);
  toast('Новая жизнь начинается');
}

function drawCreature(creature, genome, context = ctx, scale = 1) {
  const bodyColor = genome.bodyColor || '#c9ed62';
  const bodyLength = 7 + genome.speed * 1.2;
  const bodyHeight = 5 + genome.armor * .7;
  context.save();
  context.translate(creature.x, creature.y);
  context.rotate(creature.angle || 0);
  context.shadowColor = bodyColor;
  context.shadowBlur = 12 * scale;

  // Speed grows a longer forked tail.
  context.strokeStyle = bodyColor;
  context.lineWidth = (1.2 + genome.speed * .25) * scale;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(-bodyLength * scale, side * 2 * scale);
    context.quadraticCurveTo(-(11 + genome.speed * 2.5) * scale, side * (4 + genome.speed) * scale, -(14 + genome.speed * 3) * scale, side * 5 * scale);
    context.stroke();
  }

  context.fillStyle = bodyColor;
  context.beginPath();
  context.ellipse(0, 0, bodyLength * scale, bodyHeight * scale, 0, 0, Math.PI * 2);
  context.fill();

  // Armor adds visible plates around the body.
  context.shadowBlur = 0;
  context.strokeStyle = '#f4ffd0';
  context.globalAlpha = .28 + genome.armor * .08;
  context.lineWidth = Math.max(1, genome.armor * .6) * scale;
  for (let plate = 0; plate < genome.armor; plate++) {
    const x = (-bodyLength * .55 + plate * bodyLength * 1.1 / Math.max(1, genome.armor - 1)) * scale;
    context.beginPath();
    context.moveTo(x, -bodyHeight * .75 * scale);
    context.lineTo(x, bodyHeight * .75 * scale);
    context.stroke();
  }

  // Sense grows a pair of antennae and one glowing tip per level.
  context.globalAlpha = 1;
  context.strokeStyle = bodyColor;
  context.lineWidth = 1.2 * scale;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(bodyLength * .65 * scale, side * bodyHeight * .45 * scale);
    context.lineTo((bodyLength + 3 + genome.sense * 1.8) * scale, side * (bodyHeight + genome.sense) * scale);
    context.stroke();
  }
  context.fillStyle = '#173c34';
  for (let eye = 0; eye < genome.sense; eye++) {
    context.beginPath();
    context.arc((bodyLength * .45 + eye * .75) * scale, (-2 + eye * 1.1) * scale, 1.05 * scale, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function draw() {
  const { width, height } = canvas;
  const gradient = ctx.createRadialGradient(width * .5, height * .45, 20, width * .5, height * .45, width * .75);
  gradient.addColorStop(0, '#174c40');
  gradient.addColorStop(1, '#071d1c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;
  for (let x = -40; x < width; x += 48) for (let y = -40; y < height; y += 42) {
    ctx.strokeStyle = `rgba(94,160,128,${.035 + ((x + y) % 3) * .01})`;
    ctx.beginPath();
    ctx.arc(x + (y % 84 ? 24 : 0), y, 28, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const mote of world.motes) {
    ctx.fillStyle = `rgba(183,233,154,${mote.a})`;
    ctx.beginPath();
    ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const hazard of world.hazards) {
    const danger = ctx.createRadialGradient(hazard.x, hazard.y, 0, hazard.x, hazard.y, hazard.r);
    danger.addColorStop(0, '#8e403055');
    danger.addColorStop(1, '#251c1900');
    ctx.fillStyle = danger;
    ctx.beginPath();
    ctx.arc(hazard.x, hazard.y, hazard.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const food of world.food) {
    const visible = Math.hypot(food.x - world.creatures[0].x, food.y - world.creatures[0].y) < world.genome.sense * 48;
    ctx.fillStyle = visible ? '#d8ff6a' : '#68a778';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = visible ? 10 : 2;
    ctx.beginPath();
    ctx.arc(food.x, food.y, food.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  world.creatures.slice(1).forEach(creature => drawCreature(creature, world.genome));
  drawCreature(world.creatures[0], world.genome, ctx, 1.35);
  if (input.target) {
    ctx.strokeStyle = `${world.genome.bodyColor}88`;
    ctx.beginPath();
    ctx.arc(input.target.x, input.target.y, 10 + Math.sin(world.time * 5) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawPortrait();
}

function drawPortrait() {
  portrait.clearRect(0, 0, 240, 150);
  const gradient = portrait.createRadialGradient(120, 75, 2, 120, 75, 100);
  gradient.addColorStop(0, '#286151');
  gradient.addColorStop(1, '#0b2623');
  portrait.fillStyle = gradient;
  portrait.fillRect(0, 0, 240, 150);
  drawCreature({ x: 120, y: 72, angle: -.12 }, world.genome, portrait, 4);
}

function updateGoal() {
  while (goalIndex < goals.length && goals[goalIndex].progress(world) >= goals[goalIndex].target) {
    log('ЦЕЛЬ ВЫПОЛНЕНА', goals[goalIndex].title);
    toast(`Выполнено: ${goals[goalIndex].title.toLowerCase()}`);
    goalIndex++;
  }
  const goal = goals[goalIndex];
  if (!goal) {
    $('goal-title').textContent = 'ЦИКЛ ОСВОЕН';
    $('goal-description').textContent = 'Ваша стая готова к следующей главе эволюции.';
    $('goal-state').textContent = 'Все цели выполнены';
    return;
  }
  $('goal-title').textContent = goal.title;
  $('goal-description').textContent = goal.description;
  $('goal-state').textContent = `${goal.progress(world)} / ${goal.target} ${goal.unit}`;
}

function updateUI() {
  const player = world.creatures[0];
  const level = Math.min(3, goalIndex);
  $('energy').value = player.energy;
  $('energy-label').textContent = `${Math.round(player.energy)} / 100`;
  $('dna').value = world.dna % 4;
  $('dna-label').textContent = `${world.dna % 4} / 4`;
  $('generation').textContent = world.generation;
  $('population').textContent = world.creatures.length;
  $('food-count').textContent = world.food.length;
  $('age').textContent = `${Math.floor(world.time / 60)}:${String(Math.floor(world.time % 60)).padStart(2, '0')}`;
  $('fitness').textContent = Math.round((player.energy + world.creatures.length * 12) / 2);
  $('mutate').disabled = player.energy < 25;
  $('stage-name').textContent = stages[level][0];
  $('stage-number').textContent = stages[level][1];
  updateGoal();
}

function frame(now) {
  const delta = Math.min(.033, (now - last) / 1000);
  last = now;
  if (!paused) {
    step(world, input, delta);
    while (lastEvent < world.events.length) {
      const event = world.events[lastEvent++];
      log(event, event.includes('новое') ? 'Популяция растёт' : 'Энергия восстановлена');
      toast(event);
    }
    updateUI();
  }
  draw();
  requestAnimationFrame(frame);
}

for (const id of ['speed', 'sense', 'armor']) {
  $(id).addEventListener('input', event => {
    $(`${id}-value`).textContent = event.target.value;
  });
}

$('creature-color').addEventListener('input', event => {
  world.genome.bodyColor = event.target.value;
});
$('ui-color').addEventListener('input', event => applyInterfaceColor(event.target.value));
$('mutate').onclick = () => {
  const genome = Object.fromEntries(['speed', 'sense', 'armor'].map(key => [key, Number($(key).value)]));
  genome.bodyColor = $('creature-color').value;
  if (applyGenome(world, genome)) {
    log('МУТАЦИЯ ЗАКРЕПЛЕНА', `Поколение ${world.generation}`);
    toast('Тело и геном изменены');
  }
};
$('share').onclick = async () => {
  const code = encodeGenome(world.genome);
  try {
    await navigator.clipboard.writeText(code);
    toast('Геном скопирован');
  } catch {
    prompt('Код генома', code);
  }
};
$('new-world').onclick = () => reset($('seed').value.trim() || `CORORO-${Date.now()}`);
$('pause').onclick = () => {
  paused = !paused;
  $('pause').textContent = paused ? '▶' : 'Ⅱ';
  toast(paused ? 'Симуляция остановлена' : 'Жизнь продолжается');
};

addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
  if (event.key === 'w' || event.key === 'ArrowUp') input.y = -1;
  if (event.key === 's' || event.key === 'ArrowDown') input.y = 1;
  if (event.key === 'a' || event.key === 'ArrowLeft') input.x = -1;
  if (event.key === 'd' || event.key === 'ArrowRight') input.x = 1;
  if (event.code === 'Space') input.boost = true;
});
addEventListener('keyup', event => {
  if (['w', 's', 'ArrowUp', 'ArrowDown'].includes(event.key)) input.y = 0;
  if (['a', 'd', 'ArrowLeft', 'ArrowRight'].includes(event.key)) input.x = 0;
  if (event.code === 'Space') input.boost = false;
});
canvas.onclick = event => {
  const rect = canvas.getBoundingClientRect();
  input.target = {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
};

applyInterfaceColor(localStorage.getItem('cororo-ui-color') || '#c9ed62', false);
const shared = new URLSearchParams(location.search).get('genome');
reset('CORORO-42');
if (shared) {
  try {
    world.genome = decodeGenome(shared);
    $('creature-color').value = world.genome.bodyColor;
  } catch {
    toast('Код генома повреждён');
  }
}
requestAnimationFrame(frame);
