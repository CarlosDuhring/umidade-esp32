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
let plantStep = 1;

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

async function loadNotificationPreferences() {
  const { data, error } = await client.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) return;
  user.whatsappPhone = data.whatsapp_phone;
  $('notifyLow').checked = data.low_moisture_enabled;
  $('notifyNormal').checked = data.normal_again_enabled;
  $('notifyOffline').checked = data.sensor_offline_enabled;
  $('globalRepeat').value = String(data.alert_repeat_hours ?? plants[0]?.alert_repeat_hours ?? 12);
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
  const { data, error } = await client.from('readings').select('id, moisture_percent, adc, recorded_at')
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
    <p class="plant-last">${reading ? `ADC ${reading.adc ?? '—'} · última leitura ${relativeTime(reading.recorded_at)}` : 'Sem leitura recebida'}</p>
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
  plantStep = 1;
  $('dialogTitle').textContent = plant ? 'Editar vaso' : plants.length ? 'Adicionar vaso' : 'Cadastrar primeiro vaso';
  $('plantName').value = plant?.name || '';
  $('plantSpecies').value = Object.hasOwn(SPECIES, plant?.species) ? plant.species : (plant?.species ? 'custom' : '');
  $('customSpecies').value = $('plantSpecies').value === 'custom' ? plant?.species || '' : '';
  $('customSpeciesField').hidden = $('plantSpecies').value !== 'custom';
  $('plantLocation').value = plant?.location || '';
  $('plantThreshold').value = plant?.threshold_percent ?? SPECIES[plant?.species] ?? 35;
  $('plantAdcDry').value = plant?.adc_dry ?? 2500;
  $('plantAdcWet').value = plant?.adc_wet ?? 1250;
  $('alertRepeat').value = String(plant?.alert_repeat_hours ?? 12);
  $('speciesHint').textContent = plant ? 'O limite foi configurado para este vaso.' : 'Sugestão inicial editável; ajuste conforme sua planta e o sensor.';
  updatePlantStep();
  $('plantDialog').showModal();
}

function updatePlantStep() {
  for (let step = 1; step <= 3; step++) $(`plantStep${step === 1 ? 'One' : step === 2 ? 'Two' : 'Three'}`).hidden = step !== plantStep;
  $('plantStepLabel').textContent = `ETAPA ${plantStep} DE 3`;
  $('plantProgressFill').style.width = `${Math.round(plantStep / 3 * 100)}%`;
  $('plantBack').hidden = plantStep <= 1;
  $('plantNext').hidden = plantStep === 3;
  $('plantSave').hidden = plantStep !== 3;
  $('plantCancel').textContent = editingPlantId ? 'Fechar' : 'Cancelar';
  $('plantFormMessage').textContent = '';
  $('plantName').required = plantStep === 1;
  $('plantSpecies').required = plantStep === 2;
  $('plantLocation').required = plantStep === 2;
  $('customSpecies').required = plantStep === 2 && $('plantSpecies').value === 'custom';
  $('plantThreshold').required = plantStep === 3;
  $('plantAdcDry').required = plantStep === 3;
  $('plantAdcWet').required = plantStep === 3;
  $('alertRepeat').required = plantStep === 3;
}

function advancePlantStep() {
  const fields = plantStep === 1
    ? [$('plantName')]
    : plantStep === 2
      ? [$('plantSpecies'), $('customSpecies'), $('plantLocation')].filter((field) => !field.closest('[hidden]'))
      : [$('plantAdcDry'), $('plantAdcWet'), $('plantThreshold'), $('alertRepeat')];
  for (const field of fields) {
    if (field.disabled) continue;
    if (!field.reportValidity()) return;
  }
  if (plantStep === 2 && $('plantSpecies').value === 'custom' && !$('customSpecies').value.trim()) {
    $('customSpecies').setCustomValidity('Informe o nome da espécie.');
    $('customSpecies').reportValidity();
    $('customSpecies').setCustomValidity('');
    return;
  }
  if (plantStep === 3 && Number($('plantAdcDry').value) === Number($('plantAdcWet').value)) {
    $('plantAdcWet').setCustomValidity('Os valores seco e molhado precisam ser diferentes.');
    $('plantAdcWet').reportValidity();
    $('plantAdcWet').setCustomValidity('');
    return;
  }
  if (plantStep < 3) {
    plantStep += 1;
    updatePlantStep();
  }
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
  $('pairTitle').textContent = `Sensor de ${plant.name}`;
  $('deviceKeyValue').value = result.device_key;
  $('deviceConfig').textContent = `#define SERVIDOR_URL "https://umidade-esp32.onrender.com/api/device/readings"\n#define DEVICE_KEY "${result.device_key}"`;
  $('pairMessage').textContent = 'Chave gerada. Copie e guarde antes de fechar; ela não será mostrada novamente.';
  $('pairDialog').showModal();
  message('Sensor associado. Falta configurar esta chave no firmware do ESP32.', 'is-success');
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
$('plantCancel').addEventListener('click', () => $('plantDialog').close());
$('plantNext').addEventListener('click', advancePlantStep);
$('plantBack').addEventListener('click', () => {
  if (plantStep > 1) {
    plantStep -= 1;
    updatePlantStep();
  }
});
$('closeHistory').addEventListener('click', () => $('historyDialog').close());
$('closePair').addEventListener('click', () => $('pairDialog').close());
$('donePair').addEventListener('click', () => $('pairDialog').close());
$('copyDeviceKey').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('deviceKeyValue').value);
    $('pairMessage').textContent = 'Chave copiada. Guarde-a com segurança; não será exibida novamente.';
    $('pairMessage').className = 'form-message is-success';
  } catch {
    $('deviceKeyValue').select();
    $('pairMessage').textContent = 'Não consegui copiar automaticamente. Selecione e copie a chave manualmente.';
    $('pairMessage').className = 'form-message is-info';
  }
});
$('copyDeviceConfig').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('deviceConfig').textContent);
    $('pairMessage').textContent = 'Configuração copiada. Cole no secrets.h e grave o firmware.';
    $('pairMessage').className = 'form-message is-success';
  } catch {
    $('pairMessage').textContent = 'Selecione o bloco de configuração e copie manualmente.';
    $('pairMessage').className = 'form-message is-info';
  }
});
$('notificationSettings').addEventListener('click', async () => {
  try {
    await loadNotificationPreferences();
    $('notificationDialog').showModal();
  } catch (error) { message(error.message, 'is-error'); }
});
$('closeNotifications').addEventListener('click', () => $('notificationDialog').close());
$('cancelNotifications').addEventListener('click', () => $('notificationDialog').close());
$('notificationForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const repeat = Number($('globalRepeat').value);
  try {
    const { error: preferenceError } = await client.from('notification_preferences').upsert({
      user_id: user.id,
      whatsapp_phone: user.user_metadata?.whatsapp_phone || user.whatsappPhone || '',
      low_moisture_enabled: $('notifyLow').checked,
      normal_again_enabled: $('notifyNormal').checked,
      sensor_offline_enabled: $('notifyOffline').checked,
      alert_repeat_hours: repeat,
      updated_at: new Date().toISOString(),
    });
    if (preferenceError) throw preferenceError;
    const { error: plantsError } = await client.from('plants').update({ alert_repeat_hours: repeat }).eq('user_id', user.id);
    if (plantsError) throw plantsError;
    plants = plants.map((plant) => ({ ...plant, alert_repeat_hours: repeat }));
    $('notificationDialog').close();
    message('Preferências de alerta salvas.', 'is-success');
  } catch (error) {
    $('notificationMessage').textContent = error.message || 'Não consegui salvar as preferências.';
    $('notificationMessage').className = 'form-message is-error';
  }
});
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
  if (plantStep < 3) {
    event.preventDefault();
    advancePlantStep();
    return;
  }
  event.preventDefault();
  const selected = $('plantSpecies').value;
  const plant = {
    user_id: user.id,
    name: $('plantName').value.trim(),
    species: selected === 'custom' ? $('customSpecies').value.trim() : selected,
    location: $('plantLocation').value.trim(),
    threshold_percent: Number($('plantThreshold').value),
    adc_dry: Number($('plantAdcDry').value),
    adc_wet: Number($('plantAdcWet').value),
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
