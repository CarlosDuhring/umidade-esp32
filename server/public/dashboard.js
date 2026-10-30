const $ = (id) => document.getElementById(id);
const client = window.PLANTSPACE_CONFIG?.supabaseUrl && window.PLANTSPACE_CONFIG?.supabaseAnonKey
  ? window.supabase.createClient(window.PLANTSPACE_CONFIG.supabaseUrl, window.PLANTSPACE_CONFIG.supabaseAnonKey)
  : null;

const SPECIES = {
  Manjericão: 35, Hortelã: 40, Alecrim: 25, Alface: 45, Tomate: 40, Pimenta: 35,
  Jiboia: 30, Zamioculca: 20, 'Espada-de-são-jorge': 20, 'Lírio-da-paz': 40, Suculenta: 20,
  Morango: 40, Limoeiro: 35, Tomateiro: 40,
};

let user = null;
let plants = [];
let editingPlantId = null;
let historyChart = null;

function message(text, kind = '') {
  $('dashboardMessage').textContent = text;
  $('dashboardMessage').className = `form-message ${kind}`.trim();
}

function setThresholdHint(species) {
  if (species === 'custom' || !species) {
    $('speciesHint').textContent = species === 'custom' ? 'Defina um limite inicial para esta espécie. Você poderá alterá-lo depois.' : 'Sugestão inicial editável; ajuste conforme sua planta e o sensor.';
    return;
  }
  const suggestion = SPECIES[species];
  if (suggestion) {
    $('plantThreshold').value = suggestion;
    $('speciesHint').textContent = `Sugestão para ${species}: ${suggestion}%. Valor editável, baseado no sensor calibrado.`;
  }
}

async function ensureSession() {
  if (!client) {
    message('Conexão com Supabase pendente. O painel privado será liberado após a configuração do projeto.', 'is-info');
    return false;
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    window.location.replace('/login.html');
    return false;
  }
  user = data.user;
  $('accountName').textContent = user.user_metadata?.full_name || user.email;
  return true;
}

async function loadPlants() {
  const { data, error } = await client.from('plants').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  plants = data || [];
  await Promise.all([renderPlants(), loadAlerts()]);
}

async function loadAlerts() {
  const { data, error } = await client.from('alerts').select('id,plant_id,type,message,created_at,read_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  const container = $('recentAlerts');
  container.replaceChildren();
  if (!data?.length) {
    container.innerHTML = '<p class="muted">Nenhum alerta recente.</p>';
    return;
  }
  for (const alert of data) {
    const row = document.createElement('div');
    row.className = `recent-alert ${alert.type === 'low_moisture' || alert.type === 'sensor_offline' ? 'is-warning' : ''}`;
    const text = document.createElement('span');
    text.textContent = alert.message;
    const time = document.createElement('time');
    time.dateTime = alert.created_at;
    time.textContent = relativeTime(alert.created_at);
    row.append(text, time);
    container.append(row);
  }
}

async function latestReading(plant) {
  if (!plant.sensor_id) return null;
  const { data, error } = await client.from('readings').select('id, moisture_percent, recorded_at')
    .eq('sensor_id', plant.sensor_id).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

function readingState(reading, plant) {
  if (!reading) return { level: 'offline', label: 'Aguardando sensor', advice: 'Associe um sensor para receber leituras.' };
  const age = Date.now() - new Date(reading.recorded_at).getTime();
  if (age > 60 * 60 * 1000) return { level: 'offline', label: 'Sensor sem sinal', advice: 'Nenhuma leitura há mais de 1 hora.' };
  if (reading.moisture_percent < plant.threshold_percent) return { level: 'critical', label: 'Hora de regar', advice: `Abaixo do limite de ${plant.threshold_percent}%.` };
  return { level: 'ok', label: 'Dentro do limite', advice: 'Umidade adequada para o limite definido.' };
}

function renderPlantCard(plant, reading) {
  const state = readingState(reading, plant);
  const percent = reading ? Math.round(reading.moisture_percent) : null;
  const card = document.createElement('article');
  card.className = 'plant-card';
  card.innerHTML = `
    <div class="plant-card-top"><div><p class="eyebrow">${escapeHtml(plant.species)}</p><h2>${escapeHtml(plant.name)}</h2></div><span class="status-tag status-${state.level}">${state.label}</span></div>
    <p class="plant-location">${escapeHtml(plant.location)}</p>
    <div class="plant-reading"><strong>${percent == null ? '—' : `${percent}<small>%</small>`}</strong><span>umidade</span></div>
    <div class="bar"><i style="width:${percent ?? 0}%;background:${state.level === 'critical' ? '#a24a36' : '#58715a'}"></i></div>
    <p class="plant-advice">${state.advice}</p>
    <p class="plant-last">${reading ? `Última leitura ${relativeTime(reading.recorded_at)}` : 'Sem leitura recebida'}</p>
    <div class="plant-actions"><button class="button button-quiet" data-action="history" data-id="${plant.id}">Histórico</button>${plant.sensor_id ? '' : `<button class="button button-quiet" data-action="pair" data-id="${plant.id}">Associar sensor</button>`}<button class="button button-quiet" data-action="edit" data-id="${plant.id}">Editar</button></div>`;
  return card;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  return `há ${Math.floor(seconds / 3600)} h`;
}

async function renderPlants() {
  const grid = $('plantGrid');
  grid.replaceChildren();
  $('alertList').replaceChildren();
  $('emptyState').hidden = plants.length > 0;
  $('addPlant').hidden = plants.length === 0;
  if (!plants.length) return;

  for (const plant of plants) {
    const reading = await latestReading(plant);
    const card = renderPlantCard(plant, reading);
    grid.append(card);
    const state = readingState(reading, plant);
    if (state.level === 'critical' || state.level === 'offline') {
      const alert = document.createElement('div');
      alert.className = `notice notice-${state.level}`;
      alert.textContent = `${plant.name}: ${state.label.toLowerCase()}. ${state.advice}`;
      $('alertList').append(alert);
    }
  }
}

function openPlant(plant = null) {
  editingPlantId = plant?.id || null;
  $('dialogTitle').textContent = plant ? 'Editar vaso' : plants.length ? 'Adicionar vaso' : 'Cadastrar primeiro vaso';
  $('plantName').value = plant?.name || '';
  $('plantSpecies').value = Object.hasOwn(SPECIES, plant?.species) ? plant.species : (plant?.species ? 'custom' : '');
  $('customSpecies').value = $('plantSpecies').value === 'custom' ? plant?.species || '' : '';
  $('customSpeciesField').hidden = $('plantSpecies').value !== 'custom';
  $('plantLocation').value = plant?.location || '';
  $('plantThreshold').value = plant?.threshold_percent ?? SPECIES[plant?.species] ?? 35;
  $('alertRepeat').value = String(plant?.alert_repeat_hours ?? 12);
  $('speciesHint').textContent = plant ? 'O limite foi configurado para este vaso.' : 'Sugestão inicial editável; ajuste conforme sua planta e o sensor.';
  $('plantDialog').showModal();
}

async function showHistory(plant) {
  $('historyTitle').textContent = plant.name;
  const { data, error } = await client.from('readings').select('moisture_percent, recorded_at')
    .eq('sensor_id', plant.sensor_id).gte('recorded_at', new Date(Date.now() - 30 * 86400000).toISOString())
    .order('recorded_at', { ascending: true }).limit(10000);
  if (error) throw error;
  const rows = data || [];
  if (historyChart) historyChart.destroy();
  historyChart = new Chart($('historyChart'), {
    type: 'line',
    data: { labels: rows.map((row) => new Date(row.recorded_at).toLocaleString('pt-BR')), datasets: [{ data: rows.map((row) => row.moisture_percent), borderColor: '#58715a', backgroundColor: 'rgba(88,113,90,.12)', fill: true, pointRadius: 0, tension: 0.25 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { callback: (value) => `${value}%` } }, x: { ticks: { maxTicksLimit: 6, maxRotation: 0 } } } },
  });
  $('historyTable').innerHTML = rows.slice(-12).reverse().map((row) => `<div class="history-row"><time>${new Date(row.recorded_at).toLocaleString('pt-BR')}</time><strong>${Math.round(row.moisture_percent)}%</strong></div>`).join('') || '<p class="muted">Ainda não há leituras neste vaso.</p>';
  $('historyDialog').showModal();
}

async function pairSensor(plant) {
  const { data: sessionData } = await client.auth.getSession();
  const response = await fetch('/api/sensors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
    body: JSON.stringify({ plant_id: plant.id }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível associar o sensor.');
  window.prompt('Guarde esta chave agora. Ela não será exibida novamente:', result.device_key);
  message('Sensor associado. A chave é exibida uma única vez; o firmware precisa ser configurado para enviar a este vaso.', 'is-success');
  await loadPlants();
}

$('plantSpecies').addEventListener('change', (event) => {
  const custom = event.target.value === 'custom';
  $('customSpeciesField').hidden = !custom;
  $('customSpecies').required = custom;
  setThresholdHint(event.target.value);
});
$('addPlant').addEventListener('click', () => openPlant());
$('firstPlant').addEventListener('click', () => openPlant());
$('closeDialog').addEventListener('click', () => $('plantDialog').close());
$('cancelDialog').addEventListener('click', () => $('plantDialog').close());
$('closeHistory').addEventListener('click', () => $('historyDialog').close());
$('plantGrid').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const plant = plants.find((item) => item.id === button.dataset.id);
  if (!plant) return;
  try {
    if (button.dataset.action === 'edit') openPlant(plant);
    if (button.dataset.action === 'history') await showHistory(plant);
    if (button.dataset.action === 'pair') await pairSensor(plant);
  } catch (error) { message(error.message, 'is-error'); }
});

$('plantForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = $('plantSpecies').value;
  const plant = {
    user_id: user.id,
    name: $('plantName').value.trim(),
    species: selected === 'custom' ? $('customSpecies').value.trim() : selected,
    location: $('plantLocation').value.trim(),
    threshold_percent: Number($('plantThreshold').value),
    alert_repeat_hours: Number($('alertRepeat').value),
  };
  try {
    const query = client.from('plants');
    const { error } = editingPlantId
      ? await query.update(plant).eq('id', editingPlantId).eq('user_id', user.id)
      : await query.insert(plant);
    if (error) throw error;
    $('plantDialog').close();
    await loadPlants();
    message('Vaso salvo.', 'is-success');
  } catch (error) { message(error.message, 'is-error'); }
});

$('signOut').addEventListener('click', async () => {
  await client?.auth.signOut();
  window.location.replace('/');
});

async function start() {
  if (!(await ensureSession())) return;
  try {
    await loadPlants();
    setInterval(() => renderPlants().catch((error) => message(error.message, 'is-error')), 30000);
  } catch (error) { message(error.message || 'Não consegui carregar seus vasos.', 'is-error'); }
}

start();
