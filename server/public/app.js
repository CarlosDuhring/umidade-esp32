const $ = (id) => document.getElementById(id);

const INTERVALO_MS = 5000;
let grafico = null;

const CORES = {
  ok: '#16a34a',
  warning: '#d97706',
  critical: '#dc2626',
  offline: '#94a3b8',
};

function tempoRelativo(ts) {
  if (!ts) return '--';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return `há ${h} h`;
}

function horaCurta(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pintarBarra(percentual, nivel) {
  const barra = $('bar');
  barra.style.width = `${percentual}%`;
  barra.style.background = CORES[nivel] || CORES.offline;
}

function pintarPill(nivel, texto) {
  const pill = $('pill');
  pill.className = `pill is-${nivel}`;
  pill.textContent = texto;
}

function desenharGrafico(historico) {
  const canvas = $('chart');
  const vazio = $('empty');

  if (!historico.length) {
    vazio.hidden = false;
    canvas.hidden = true;
    return;
  }

  vazio.hidden = true;
  canvas.hidden = false;

  if (typeof Chart === 'undefined') {
    vazio.hidden = false;
    vazio.textContent = 'Gráfico indisponível (sem internet para carregar o Chart.js).';
    return;
  }

  const labels = historico.map((p) => horaCurta(p.ts));
  const dados = historico.map((p) => p.percent);

  if (grafico) {
    grafico.data.labels = labels;
    grafico.data.datasets[0].data = dados;
    grafico.update('none');
    return;
  }

  grafico = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Umidade (%)',
          data: dados,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.parsed.y}%`,
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { callback: (v) => `${v}%` },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8, color: '#5f7369' },
        },
      },
    },
  });
}

async function atualizar() {
  try {
    const resposta = await fetch('/api/status?limit=120', { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = await resposta.json();

    const { latest, status, thresholds, calibration, history } = dados;

    pintarPill(status.level, status.label);
    $('statusLabel').textContent = status.label;
    $('statusLabel').style.color = CORES[status.level] || CORES.offline;
    $('advice').textContent = status.advice;

    if (latest) {
      $('percent').textContent = latest.percent;
      $('adc').textContent = latest.adc;
      $('rssi').textContent = latest.rssi == null ? '--' : `${latest.rssi} dBm`;
      $('lastUpdate').textContent = tempoRelativo(latest.ts);
      window.__ultimoTs = latest.ts;
      $('device').textContent = latest.device ? `· ${latest.device}` : '';
      document.title = `${latest.percent}% · Umidade do Solo`;
    } else {
      $('percent').textContent = '--';
      $('adc').textContent = '--';
      $('rssi').textContent = '--';
      $('lastUpdate').textContent = '--';
    }

    $('cal').textContent = `${calibration.seco} → ${calibration.umido}`;
    pintarBarra(latest ? latest.percent : 0, status.level);
    desenharGrafico(history);

    $('updated').textContent = `Atualizado ${new Date().toLocaleTimeString('pt-BR')}`;
    $('empty').hidden = history.length > 0;
  } catch (erro) {
    console.error('Falha ao buscar dados:', erro);
    pintarPill('offline', 'Servidor fora');
    $('advice').textContent = 'Não consegui falar com o servidor. Tentando de novo…';
  }
}

$('refresh').addEventListener('click', atualizar);

atualizar();
setInterval(atualizar, INTERVALO_MS);

// Atualiza os textos "há X s" sem bater no servidor
setInterval(() => {
  const texto = $('lastUpdate').textContent;
  if (texto && texto !== '--') {
    // re-render leve: pega o timestamp guardado no último fetch
    if (window.__ultimoTs) $('lastUpdate').textContent = tempoRelativo(window.__ultimoTs);
  }
}, 1000);
