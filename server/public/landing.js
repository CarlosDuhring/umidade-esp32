const $ = (id) => document.getElementById(id);
let chart = null;

function relative(ts) {
  if (!ts) return '--';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  return `há ${Math.floor(seconds / 3600)} h`;
}

function setStatus(status) {
  const pill = $('demoStatus');
  pill.className = `demo-status is-${status.level}`;
  pill.textContent = status.label;
  $('demoAdvice').textContent = status.advice;
}

function renderChart(history) {
  const empty = $('demoChartEmpty');
  if (!history.length) {
    empty.hidden = false;
    if (chart) {
      chart.destroy();
      chart = null;
    }
    return;
  }
  empty.hidden = true;
  if (typeof Chart === 'undefined') return;
  const labels = history.map((item) => new Date(item.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const data = history.map((item) => item.percent);
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('none');
    return;
  }
  chart = new Chart($('demoChart'), {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: '#58715a', backgroundColor: 'rgba(88,113,90,.12)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => ` ${item.parsed.y}%` } } },
      scales: {
        y: { min: 0, max: 100, ticks: { maxTicksLimit: 6, callback: (value) => `${value}%` }, grid: { color: 'rgba(27,6,36,.08)' } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 5, maxRotation: 0, color: '#766a7c', font: { size: 10 } } },
      },
    },
  });
}

async function updateDemo() {
  try {
    const response = await fetch('/api/status?limit=120', { cache: 'no-store' });
    if (!response.ok) throw new Error('Falha ao ler o protótipo');
    const data = await response.json();
    $('demoDot').style.background = data.online ? '#58715a' : '#a24a36';
    $('demoUpdated').textContent = data.latest ? `Atualizado ${relative(data.latest.ts)}` : 'Aguardando o ESP32';
    $('demoPercent').textContent = data.latest?.percent ?? '--';
    $('demoMeter').style.width = `${data.latest?.percent ?? 0}%`;
    $('demoAdc').textContent = data.latest?.adc ?? '--';
    $('demoRssi').textContent = data.latest?.rssi == null ? '--' : `${data.latest.rssi} dBm`;
    $('demoAge').textContent = data.latest ? relative(data.latest.ts) : '--';
    $('demoDevice').textContent = data.latest?.device || 'Sensor do protótipo';
    setStatus(data.status);
    renderChart(data.history || []);
  } catch {
    $('demoUpdated').textContent = 'Demonstração temporariamente indisponível';
    setStatus({ level: 'offline', label: 'Sem conexão', advice: 'A leitura reaparecerá quando o serviço voltar.' });
  }
}

$('refreshDemo').addEventListener('click', updateDemo);
updateDemo();
setInterval(updateDemo, 5000);
