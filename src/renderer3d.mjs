const vertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uViewProjection;
out vec3 vNormal;
out vec3 vWorld;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=mat3(uModel)*aNormal;
  gl_Position=uViewProjection*world;
}`;

const fragmentShader = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec4 uColor;
uniform vec3 uCamera;
out vec4 outColor;
void main(){
  vec3 normal=normalize(vNormal);
  float light=.32+max(dot(normalize(vec3(.35,.85,.25)),normal),0.0)*.72;
  float rim=pow(1.0-max(dot(normalize(uCamera-vWorld),normal),0.0),2.0)*.28;
  vec3 color=uColor.rgb*(light+rim);
  float fog=smoothstep(12.0,42.0,distance(uCamera,vWorld));
  color=mix(color,vec3(.025,.12,.13),fog*.72);
  outColor=vec4(color,uColor.a);
}`;

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
  return result;
}

function program(gl) {
  const result = gl.createProgram();
  gl.attachShader(result, shader(gl, gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(result, shader(gl, gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(result));
  return result;
}

function sphere(rows = 12, columns = 18) {
  const vertices = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const latitude = row * Math.PI / rows;
    for (let column = 0; column <= columns; column++) {
      const longitude = column * Math.PI * 2 / columns;
      const x = Math.sin(latitude) * Math.cos(longitude);
      const y = Math.cos(latitude);
      const z = Math.sin(latitude) * Math.sin(longitude);
      vertices.push(x, y, z, x, y, z);
    }
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const first = row * (columns + 1) + column;
    const second = first + columns + 1;
    indices.push(first, second, first + 1, second, second + 1, first + 1);
  }
  return { vertices, indices };
}

function cylinder(segments = 10) {
  const vertices = [], indices = [];
  for (let end = 0; end < 2; end++) for (let index = 0; index <= segments; index++) {
    const angle = index / segments * Math.PI * 2;
    const x = Math.cos(angle), z = Math.sin(angle);
    vertices.push(x, end - .5, z, x, 0, z);
  }
  for (let index = 0; index < segments; index++) {
    const next = index + segments + 1;
    indices.push(index, next, index + 1, next, next + 1, index + 1);
  }
  return { vertices, indices };
}

function disc(segments = 32) {
  const vertices = [0, 0, 0, 0, 1, 0], indices = [];
  for (let index = 0; index <= segments; index++) {
    const angle = index / segments * Math.PI * 2;
    vertices.push(Math.cos(angle), 0, Math.sin(angle), 0, 1, 0);
    if (index) indices.push(0, index, index + 1);
  }
  return { vertices, indices };
}

function terrain(size = 54, divisions = 30) {
  const vertices = [], indices = [];
  for (let z = 0; z <= divisions; z++) for (let x = 0; x <= divisions; x++) {
    const px = (x / divisions - .5) * size;
    const pz = (z / divisions - .5) * size;
    const y = Math.sin(px * .23) * .22 + Math.cos(pz * .29) * .18;
    vertices.push(px, y, pz, 0, 1, 0);
  }
  for (let z = 0; z < divisions; z++) for (let x = 0; x < divisions; x++) {
    const first = z * (divisions + 1) + x, second = first + divisions + 1;
    indices.push(first, second, first + 1, second, second + 1, first + 1);
  }
  return { vertices, indices };
}

function makeMesh(gl, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: data.indices.length };
}

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
  }
  return out;
}
function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2), range = 1 / (near - far), out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f; out[10] = (near + far) * range; out[11] = -1; out[14] = 2 * near * far * range;
  return out;
}
function lookAt(eye, target) {
  const normalize = vector => { const length = Math.hypot(...vector) || 1; return vector.map(value => value / length); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = normalize(eye.map((value, index) => value - target[index]));
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x), out = identity();
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -x.reduce((sum, value, index) => sum + value * eye[index], 0);
  out[13] = -y.reduce((sum, value, index) => sum + value * eye[index], 0);
  out[14] = -z.reduce((sum, value, index) => sum + value * eye[index], 0);
  return out;
}
function model(position, scale, rotation = 0) {
  const cosine = Math.cos(rotation), sine = Math.sin(rotation), out = identity();
  out[0] = cosine * scale[0]; out[2] = -sine * scale[0];
  out[5] = scale[1]; out[8] = sine * scale[2]; out[10] = cosine * scale[2];
  out[12] = position[0]; out[13] = position[1]; out[14] = position[2];
  return out;
}
function hex(value, alpha = 1) {
  const normalized = value.replace('#', '');
  return [0, 2, 4].map(offset => parseInt(normalized.slice(offset, offset + 2), 16) / 255).concat(alpha);
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!this.gl) throw Error('WebGL 2 не поддерживается этим браузером');
    const gl = this.gl;
    this.program = program(gl);
    this.meshes = { sphere: makeMesh(gl, sphere()), cylinder: makeMesh(gl, cylinder()), disc: makeMesh(gl, disc()), terrain: makeMesh(gl, terrain()) };
    this.uniforms = {
      model: gl.getUniformLocation(this.program, 'uModel'),
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      camera: gl.getUniformLocation(this.program, 'uCamera'),
    };
    this.camera = [0, 13, 18];
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  coordinates(world, point) {
    return [(point.x / world.width - .5) * 48, (point.y / world.height - .5) * 32];
  }

  draw(meshName, position, scale, rotation, color) {
    const gl = this.gl, mesh = this.meshes[meshName];
    gl.uniformMatrix4fv(this.uniforms.model, false, model(position, scale, rotation));
    gl.uniform4fv(this.uniforms.color, color);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  render(world) {
    const gl = this.gl, player = this.coordinates(world, world.creatures[0]);
    const displayWidth = this.canvas.clientWidth * devicePixelRatio;
    const displayHeight = this.canvas.clientHeight * devicePixelRatio;
    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth; this.canvas.height = displayHeight;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(.018, .075, .08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.camera[0] += (player[0] - this.camera[0]) * .06;
    this.camera[2] += (player[1] + 15 - this.camera[2]) * .06;
    const viewProjection = multiply(perspective(Math.PI / 3.2, this.canvas.width / this.canvas.height, .1, 90), lookAt(this.camera, [player[0], 0, player[1] - 2]));
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, viewProjection);
    gl.uniform3fv(this.uniforms.camera, this.camera);
    this.draw('terrain', [0, -.8, 0], [1, 1, 1], 0, [.055, .26, .23, 1]);

    gl.depthMask(false);
    for (const hazard of world.hazards) {
      const [x, z] = this.coordinates(world, hazard);
      this.draw('disc', [x, -.5, z], [hazard.r * .05, 1, hazard.r * .05], 0, [.72, .18, .12, .22]);
    }
    gl.depthMask(true);
    for (const food of world.food) {
      const [x, z] = this.coordinates(world, food);
      const pulse = .16 + food.size * .025 + Math.sin(world.time * 3 + x) * .025;
      this.draw('sphere', [x, .12 + Math.sin(world.time * 2 + z) * .12, z], [pulse, pulse, pulse], 0, [.76, 1, .35, 1]);
    }
    world.creatures.forEach((creature, index) => this.drawCreature(world, creature, index === 0));
  }

  drawCreature(world, creature, player) {
    const [x, z] = this.coordinates(world, creature), genome = world.genome;
    const y = .45 + Math.sin(world.time * 2.2 + creature.wanderPhase) * .12;
    const direction = -creature.angle + Math.PI / 2;
    const size = player ? 1 : .78;
    this.draw('sphere', [x, y, z], [(1 + genome.speed * .08) * size, (.55 + genome.armor * .08) * size, .72 * size], direction, hex(genome.bodyColor));
    for (let plate = 0; plate < genome.armor; plate++) {
      const offset = (plate - (genome.armor - 1) / 2) * .23;
      this.draw('sphere', [x + Math.cos(direction) * offset, y + .42 * size, z - Math.sin(direction) * offset], [.2, .12, .48], direction, [.85, 1, .7, .68]);
    }
    for (const side of [-1, 1]) {
      const tailX = x - Math.sin(creature.angle) * (1.05 + genome.speed * .12) + Math.cos(creature.angle) * side * .22;
      const tailZ = z - Math.cos(creature.angle) * (1.05 + genome.speed * .12) - Math.sin(creature.angle) * side * .22;
      this.draw('sphere', [tailX, y, tailZ], [.16, .16, (.55 + genome.speed * .12) * size], direction, hex(genome.bodyColor, .9));
    }
    for (let sense = 0; sense < genome.sense; sense++) {
      const side = sense % 2 ? -1 : 1, forward = .62 + Math.floor(sense / 2) * .13;
      const eyeX = x + Math.sin(creature.angle) * forward + Math.cos(creature.angle) * side * .3;
      const eyeZ = z + Math.cos(creature.angle) * forward - Math.sin(creature.angle) * side * .3;
      this.draw('sphere', [eyeX, y + .2, eyeZ], [.11, .11, .11], 0, [.035, .12, .11, 1]);
    }
  }

  screenToWorld(world, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width - .5;
    const ny = (clientY - rect.top) / rect.height - .48;
    const player = world.creatures[0];
    return {
      x: Math.max(0, Math.min(world.width, player.x + nx * 460)),
      y: Math.max(0, Math.min(world.height, player.y + ny * 360)),
    };
  }
}
