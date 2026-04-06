const canvas = document.getElementById('glCanvas');
const statusEl = document.getElementById('status');
const bassValueEl = document.getElementById('bassValue');
const midsValueEl = document.getElementById('midsValue');
const trebleValueEl = document.getElementById('trebleValue');
const energyValueEl = document.getElementById('energyValue');

const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const micBtn = document.getElementById('micBtn');
const fileInput = document.getElementById('audioFile');
const player = document.getElementById('player');

const sensitivity = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');
const colorShift = document.getElementById('colorShift');
const colorShiftValue = document.getElementById('colorShiftValue');

const gl = canvas.getContext('webgl');
if (!gl) {
  throw new Error('WebGL is required but unavailable in this browser.');
}

const vertexSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentSource = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bass;
uniform float u_mids;
uniform float u_treble;
uniform float u_energy;
uniform float u_sensitivity;
uniform float u_colorShift;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(in vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) +
         (c - a) * u.y * (1.0 - u.x) +
         (d - b) * u.x * u.y;
}

mat2 rot(float a){
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * (0.35 + 0.35 * u_energy * u_sensitivity);

  float bass = pow(u_bass * u_sensitivity, 1.15);
  float mids = pow(u_mids * u_sensitivity, 1.1);
  float treble = pow(u_treble * u_sensitivity, 1.2);

  vec2 warped = uv * rot(0.28 * sin(t + bass * 5.0));
  float radial = length(warped);
  float angle = atan(warped.y, warped.x);

  float wave = sin(8.0 * radial - t * 4.0 - bass * 9.0 + sin(angle * 6.0 + mids * 10.0));
  float filament = sin(angle * (6.0 + 18.0 * treble) + t * 2.0 + radial * 22.0);
  float n = noise(warped * (2.4 + 3.8 * mids) + vec2(t * 0.7, -t * 0.22));

  float field = 0.5 + 0.35 * wave + 0.25 * filament + 0.45 * (n - 0.5);

  vec3 base = vec3(0.08, 0.12, 0.21);
  vec3 c1 = vec3(0.25 + 0.65 * bass, 0.45 + 0.5 * mids, 1.0);
  vec3 c2 = vec3(1.0, 0.33 + 0.55 * treble, 0.65 + u_colorShift);
  vec3 c3 = vec3(0.18 + u_colorShift, 1.0, 0.72);

  float pulse = exp(-3.2 * radial) * (0.5 + 2.8 * bass);
  float sparkle = smoothstep(0.65, 1.0, field + 0.5 * treble);

  vec3 color = base;
  color += mix(c1, c2, smoothstep(-0.35, 0.95, field));
  color = mix(color, c3, sparkle * (0.25 + 0.75 * treble));
  color += pulse * vec3(0.7 + 0.6 * bass, 0.3 + 0.8 * mids, 1.0);

  color *= 0.75 + 0.45 * u_energy;
  color = pow(max(color, 0.0), vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${msg}`);
  }

  return shader;
}

function createProgram(vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${msg}`);
  }

  return program;
}

const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
const program = createProgram(vertexShader, fragmentShader);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
  gl.STATIC_DRAW
);

const aPosition = gl.getAttribLocation(program, 'a_position');
const uResolution = gl.getUniformLocation(program, 'u_resolution');
const uTime = gl.getUniformLocation(program, 'u_time');
const uBass = gl.getUniformLocation(program, 'u_bass');
const uMids = gl.getUniformLocation(program, 'u_mids');
const uTreble = gl.getUniformLocation(program, 'u_treble');
const uEnergy = gl.getUniformLocation(program, 'u_energy');
const uSensitivity = gl.getUniformLocation(program, 'u_sensitivity');
const uColorShift = gl.getUniformLocation(program, 'u_colorShift');

let audioContext;
let analyser;
let frequencyData;
let sourceNode;
let mediaStream;

const levels = {
  bass: 0,
  mids: 0,
  treble: 0,
  energy: 0,
};

function updateStatus(message) {
  statusEl.textContent = message;
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.88;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }

  if (audioContext.state === 'suspended') {
    return audioContext.resume();
  }

  return Promise.resolve();
}

function disconnectSource() {
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

async function connectPlayer() {
  await ensureAudioContext();
  disconnectSource();

  sourceNode = audioContext.createMediaElementSource(player);
  sourceNode.connect(analyser);
  analyser.connect(audioContext.destination);

  playBtn.disabled = false;
  pauseBtn.disabled = false;
}

async function connectMicrophone() {
  await ensureAudioContext();
  disconnectSource();

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  sourceNode.connect(analyser);

  playBtn.disabled = true;
  pauseBtn.disabled = true;
  updateStatus('Microphone connected. Speak or play music nearby.');
}

function avgRange(data, fromHz, toHz, sampleRate) {
  const nyquist = sampleRate / 2;
  const start = Math.max(0, Math.floor((fromHz / nyquist) * data.length));
  const end = Math.min(data.length - 1, Math.floor((toHz / nyquist) * data.length));

  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    sum += data[i];
    count += 1;
  }

  return count ? sum / count / 255 : 0;
}

function updateAudioLevels() {
  if (!analyser || !frequencyData) return;

  analyser.getByteFrequencyData(frequencyData);
  const sampleRate = audioContext.sampleRate;

  const nextBass = avgRange(frequencyData, 20, 180, sampleRate);
  const nextMids = avgRange(frequencyData, 180, 2000, sampleRate);
  const nextTreble = avgRange(frequencyData, 2000, 12000, sampleRate);
  const nextEnergy = Math.min(1, 0.45 * nextBass + 0.35 * nextMids + 0.2 * nextTreble);

  levels.bass = levels.bass * 0.78 + nextBass * 0.22;
  levels.mids = levels.mids * 0.78 + nextMids * 0.22;
  levels.treble = levels.treble * 0.78 + nextTreble * 0.22;
  levels.energy = levels.energy * 0.83 + nextEnergy * 0.17;

  bassValueEl.textContent = levels.bass.toFixed(2);
  midsValueEl.textContent = levels.mids.toFixed(2);
  trebleValueEl.textContent = levels.treble.toFixed(2);
  energyValueEl.textContent = levels.energy.toFixed(2);
}

function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

const startTime = performance.now();
function render() {
  resizeCanvas();
  updateAudioLevels();

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(uResolution, canvas.width, canvas.height);
  gl.uniform1f(uTime, (performance.now() - startTime) * 0.001);
  gl.uniform1f(uBass, levels.bass);
  gl.uniform1f(uMids, levels.mids);
  gl.uniform1f(uTreble, levels.treble);
  gl.uniform1f(uEnergy, levels.energy);
  gl.uniform1f(uSensitivity, Number(sensitivity.value));
  gl.uniform1f(uColorShift, Number(colorShift.value));

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  requestAnimationFrame(render);
}

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  if (player.src.startsWith('blob:')) {
    URL.revokeObjectURL(player.src);
  }

  player.src = URL.createObjectURL(file);
  await connectPlayer();
  updateStatus(`Loaded: ${file.name}`);
});

playBtn.addEventListener('click', async () => {
  try {
    await ensureAudioContext();
    await player.play();
    updateStatus('Playing uploaded track.');
  } catch (error) {
    updateStatus(`Unable to play audio: ${error.message}`);
  }
});

pauseBtn.addEventListener('click', () => {
  player.pause();
  updateStatus('Playback paused.');
});

micBtn.addEventListener('click', async () => {
  try {
    await connectMicrophone();
  } catch (error) {
    updateStatus(`Microphone access failed: ${error.message}`);
  }
});

sensitivity.addEventListener('input', () => {
  sensitivityValue.textContent = Number(sensitivity.value).toFixed(2);
});

colorShift.addEventListener('input', () => {
  colorShiftValue.textContent = Number(colorShift.value).toFixed(2);
});

window.addEventListener('beforeunload', () => {
  if (player.src.startsWith('blob:')) {
    URL.revokeObjectURL(player.src);
  }
  disconnectSource();
});

render();
