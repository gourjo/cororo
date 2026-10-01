import { applyGenome, createWorld, decodeGenome, encodeGenome, hashSeed, step } from './simulation.mjs';
import { Renderer3D } from './renderer3d.mjs';

const $ = id => document.getElementById(id);
const canvas = $('world');
const renderer = new Renderer3D(canvas);
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
  // Simulation coordinates stay independent from screen resolution and devicePixelRatio.
  world = createWorld(seed, 960, 640);
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

function drawPortrait() {
  const genome = world.genome;
  const color = genome.bodyColor || '#c9ed62';
  portrait.clearRect(0, 0, 240, 150);
  const gradient = portrait.createRadialGradient(120, 75, 2, 120, 75, 110);
  gradient.addColorStop(0, '#286151');
  gradient.addColorStop(1, '#0b2623');
  portrait.fillStyle = gradient;
  portrait.fillRect(0, 0, 240, 150);
  portrait.save();
  portrait.translate(120, 72);
  portrait.shadowColor = color;
  portrait.shadowBlur = 18;
  portrait.fillStyle = color;
  portrait.beginPath();
  portrait.ellipse(0, 0, 25 + genome.speed * 3, 17 + genome.armor * 2, 0, 0, Math.PI * 2);
  portrait.fill();
  portrait.shadowBlur = 0;
  portrait.strokeStyle = '#f4ffd099';
  portrait.lineWidth = 1 + genome.armor;
  for (let plate = 0; plate < genome.armor; plate++) {
    const x = (plate - (genome.armor - 1) / 2) * 10;
    portrait.beginPath();
    portrait.moveTo(x, -13);
    portrait.lineTo(x, 13);
    portrait.stroke();
  }
  portrait.strokeStyle = color;
  portrait.lineWidth = 3;
  for (const side of [-1, 1]) {
    portrait.beginPath();
    portrait.moveTo(-25, side * 6);
    portrait.quadraticCurveTo(-42 - genome.speed * 4, side * 16, -58 - genome.speed * 4, side * 12);
    portrait.stroke();
  }
  portrait.fillStyle = '#173c34';
  for (let eye = 0; eye < genome.sense; eye++) {
    portrait.beginPath();
    portrait.arc(18 + eye * 2, -7 + eye * 4, 3, 0, Math.PI * 2);
    portrait.fill();
  }
  portrait.restore();
}

function draw() {
  renderer.render(world);
  drawPortrait();
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
  input.target = renderer.screenToWorld(world, event.clientX, event.clientY);
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
