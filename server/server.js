/*
  Servidor do dashboard de umidade do solo.

  - Recebe leituras do ESP32 em POST /api/readings (header x-api-key)
  - Serve o site em /
  - Expoe GET /api/status para o site

  Variaveis de ambiente (todas opcionais):
    PORT              porta HTTP (o Render injeta automaticamente)
    API_KEY           chave que o ESP32 manda no header x-api-key
    UMIDADE_MIN       abaixo disso = "atencao" (padrao 35)
    UMIDADE_CRITICA   abaixo disso = "precisa molhar" (padrao 20)
    CAL_SECO          ADC com o sensor seco (padrao 2500)
    CAL_UMIDO         ADC com o sensor na agua (padrao 1250)
    OFFLINE_MS        tempo sem leitura para considerar offline (padrao 3600000)
    DATA_DIR          pasta para salvar o historico (padrao ./data)
    SUPABASE_URL      URL publica do projeto Supabase
    SUPABASE_ANON_KEY chave publishable/anon do Supabase (pode ser exibida no browser)
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const CONFIG = {
  apiKey: process.env.API_KEY || 'troque-esta-chave',
  min: Number(process.env.UMIDADE_MIN ?? 35),
  critical: Number(process.env.UMIDADE_CRITICA ?? 20),
  calSeco: Number(process.env.CAL_SECO ?? 2500),
  calUmido: Number(process.env.CAL_UMIDO ?? 1250),
  offlineMs: Number(process.env.OFFLINE_MS ?? 60 * 60 * 1000),
  maxHistory: 1000,
};

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'readings.json');

app.use(express.json({ limit: '8kb' }));
app.get('/config.js', (_req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store').send(
    `window.PLANTSPACE_CONFIG = ${JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    })};`
  );
});
app.use(express.static(path.join(__dirname, 'public')));

function supabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function hashDeviceKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function authenticatedUser(req) {
  const admin = supabaseAdmin();
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!admin || !token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

app.post('/api/sensors', async (req, res) => {
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Sessao invalida.' });
  const admin = supabaseAdmin();
  const plantId = String(req.body?.plant_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(plantId)) return res.status(400).json({ error: 'Vaso invalido.' });

  try {
    const { data: plant, error: plantError } = await admin.from('plants').select('id,sensor_id').eq('id', plantId).eq('user_id', user.id).maybeSingle();
    if (plantError) throw plantError;
    if (!plant) return res.status(404).json({ error: 'Vaso nao encontrado.' });
    if (plant.sensor_id) return res.status(409).json({ error: 'Este vaso ja tem um sensor associado.' });

    const deviceKey = crypto.randomBytes(32).toString('base64url');
    const { data: sensor, error: sensorError } = await admin.from('sensors').insert({
      user_id: user.id,
      plant_id: plant.id,
      device_key_hash: hashDeviceKey(deviceKey),
      name: `Sensor ${plant.id.slice(0, 8)}`,
    }).select('id').single();
    if (sensorError) throw sensorError;

    const { error: linkError } = await admin.from('plants').update({ sensor_id: sensor.id }).eq('id', plant.id).eq('user_id', user.id);
    if (linkError) {
      await admin.from('sensors').delete().eq('id', sensor.id).eq('user_id', user.id);
      throw linkError;
    }
    res.status(201).json({ sensor_id: sensor.id, device_key: deviceKey });
  } catch (error) {
    console.error('Sensor registration failed:', error.message);
    res.status(500).json({ error: 'Nao foi possivel associar o sensor.' });
  }
});

app.post('/api/device/readings', async (req, res) => {
  const deviceKey = req.get('x-device-key') || '';
  if (deviceKey.length < 32) return res.status(401).json({ error: 'Chave de dispositivo invalida.' });
  const adc = Number(req.body?.adc);
  if (!Number.isInteger(adc) || adc < 0 || adc > 4095) return res.status(400).json({ error: 'ADC deve estar entre 0 e 4095.' });

  const admin = supabaseAdmin();
  if (!admin) return res.status(503).json({ error: 'Ingestao de sensores ainda nao configurada.' });
  try {
    const { data: sensor, error: sensorError } = await admin.from('sensors').select('id,user_id,plant_id').eq('device_key_hash', hashDeviceKey(deviceKey)).maybeSingle();
    if (sensorError) throw sensorError;
    if (!sensor) return res.status(401).json({ error: 'Chave de dispositivo invalida.' });

    const percent = adcParaPorcentagem(adc);
    const { data: reading, error: readingError } = await admin.from('readings').insert({ sensor_id: sensor.id, adc, moisture_percent: percent }).select('id,recorded_at').single();
    if (readingError) throw readingError;
    await admin.from('sensors').update({ last_seen_at: reading.recorded_at }).eq('id', sensor.id);

    const { data: plant } = await admin.from('plants').select('id,threshold_percent,last_low_alert_at,alert_repeat_hours').eq('id', sensor.plant_id).maybeSingle();
    let alert = null;
    if (plant && percent < plant.threshold_percent) {
      const due = !plant.last_low_alert_at || Date.now() - new Date(plant.last_low_alert_at).getTime() >= plant.alert_repeat_hours * 3600000;
      if (due) {
        alert = { type: 'low_moisture', plant_id: plant.id, moisture_percent: percent, created_at: reading.recorded_at };
        await admin.from('plants').update({ last_low_alert_at: reading.recorded_at }).eq('id', plant.id);
        await admin.from('alerts').insert({
          user_id: sensor.user_id,
          plant_id: plant.id,
          type: alert.type,
          moisture_percent: percent,
          message: `Hora de regar: umidade em ${percent}%, abaixo do limite da planta.`,
        });
      }
    } else if (plant?.last_low_alert_at) {
      alert = { type: 'normal_again', plant_id: plant.id, moisture_percent: percent, created_at: reading.recorded_at };
      await admin.from('plants').update({ last_low_alert_at: null }).eq('id', plant.id);
      await admin.from('alerts').insert({
        user_id: sensor.user_id,
        plant_id: plant.id,
        type: alert.type,
        moisture_percent: percent,
        message: `Umidade normalizada: ${percent}%.`,
      });
    }

    res.status(201).json({ ok: true, reading, alert });
  } catch (error) {
    console.error('Device reading insert failed:', error.message);
    res.status(500).json({ error: 'Nao foi possivel registrar a leitura.' });
  }
});

let readings = carregar();

// Mediana das 3 ultimas leituras brutas: corta pico de contato sem segurar a
// resposta (a media exponencial anterior levava ~5 leituras para chegar no valor).
const recentes = readings.slice(-3).map((r) => (r.percentRaw ?? r.percent));

function suavizar(porcentagemBruta) {
  recentes.push(porcentagemBruta);
  if (recentes.length > 3) recentes.shift();

  // Mediana sempre: um pico isolado (ex.: encostar no sensor) nao aparece.
  const ordenado = [...recentes].sort((a, b) => a - b);
  return Math.round(ordenado[Math.floor((ordenado.length - 1) / 2)]);
}

function carregar() {
  try {
    const bruto = fs.readFileSync(DATA_FILE, 'utf8');
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function salvar() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(readings.slice(-500)));
  } catch (erro) {
    console.error('Nao consegui salvar o historico:', erro.message);
  }
}

// Converte a leitura do ADC (0..4095) em % de umidade.
// Sensor resistivo: seco = valor alto, molhado = valor baixo.
function adcParaPorcentagem(adc) {
  const { calSeco, calUmido } = CONFIG;
  if (calSeco === calUmido) return 0;
  const pct = ((adc - calSeco) / (calUmido - calSeco)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function classificar(porcentagem, idadeMs) {
  if (idadeMs > CONFIG.offlineMs) {
    return {
      level: 'offline',
      label: 'Sem sinal',
      advice: 'O ESP32 parou de enviar. Confira a alimentacao e o WiFi.',
    };
  }
  if (porcentagem < CONFIG.critical) {
    return {
      level: 'critical',
      label: 'Precisa molhar',
      advice: 'Solo muito seco. Regue agora.',
    };
  }
  if (porcentagem < CONFIG.min) {
    return {
      level: 'warning',
      label: 'Atencao',
      advice: 'O solo esta secando. Regue em breve.',
    };
  }
  return {
    level: 'ok',
    label: 'Solo umido',
    advice: 'Nao precisa molhar agora.',
  };
}

// ---------------------------------------------------------------
// ESP32 envia leituras aqui
// ---------------------------------------------------------------
app.post('/api/readings', (req, res) => {
  if (req.get('x-api-key') !== CONFIG.apiKey) {
    return res.status(401).json({ erro: 'chave de API invalida' });
  }

  const corpo = req.body || {};
  const adc = Number(corpo.adc);
  if (!Number.isFinite(adc) || adc < 0 || adc > 4095) {
    return res.status(400).json({ erro: 'adc deve ser um numero entre 0 e 4095' });
  }

  const porcentagemBruta = adcParaPorcentagem(adc);
  const porcentagem = suavizar(porcentagemBruta);
  const leitura = {
    ts: Date.now(),
    adc: Math.round(adc),
    percent: porcentagem,
    percentRaw: porcentagemBruta,
    device: String(corpo.device || 'esp32').slice(0, 40),
    rssi: Number.isFinite(Number(corpo.rssi)) ? Number(corpo.rssi) : null,
  };

  readings.push(leitura);
  if (readings.length > CONFIG.maxHistory) {
    readings = readings.slice(-CONFIG.maxHistory);
  }
  salvar();

  console.log(
    `[${new Date(leitura.ts).toLocaleTimeString('pt-BR')}] ${leitura.device} ` +
    `adc=${leitura.adc} -> bruto ${leitura.percentRaw}% / suave ${leitura.percent}% (${classificar(leitura.percent, 0).label})`
  );

  res.json({ ok: true, leitura, status: classificar(leitura.percent, 0) });
});

// ---------------------------------------------------------------
// O site consulta aqui
// ---------------------------------------------------------------
app.get('/api/status', (req, res) => {
  const limite = Math.min(Number(req.query.limit) || 120, 500);
  const ultima = readings[readings.length - 1] || null;
  const idade = ultima ? Date.now() - ultima.ts : Infinity;

  res.json({
    latest: ultima,
    online: idade < CONFIG.offlineMs,
    status: ultima
      ? classificar(ultima.percent, idade)
      : { level: 'offline', label: 'Sem dados', advice: 'Ligue o ESP32 para comecar.' },
    thresholds: { min: CONFIG.min, critical: CONFIG.critical },
    calibration: { seco: CONFIG.calSeco, umido: CONFIG.calUmido },
    history: readings.slice(-limite).map((r) => ({ ts: r.ts, percent: r.percent, adc: r.adc })),
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, leituras: readings.length, uptime: process.uptime() });
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'rota nao encontrada' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`API key configurada: ${CONFIG.apiKey === 'troque-esta-chave' ? 'PADRAO (troque!)' : 'ok'}`);
  console.log(`Calibracao: seco=${CONFIG.calSeco} umido=${CONFIG.calUmido}`);
});
