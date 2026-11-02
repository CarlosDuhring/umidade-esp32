const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let chart = null;
let demoBusy = false;

function relative(ts) {
  if (!ts) return '--';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  return `há ${Math.floor(seconds / 3600)} h`;
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setStatus(status) {
  const pill = $('demoStatus');
  if (pill) {
    pill.className = `demo-status is-${status.level}`;
    pill.textContent = status.label;
  }
  setText('demoAdvice', status.advice);
  const heroStatus = $('heroStatus');
  if (heroStatus) {
    heroStatus.className = `demo-status is-${status.level}`;
    heroStatus.textContent = status.label;
  }
}

function renderChart(history) {
  const empty = $('demoChartEmpty');
  const canvas = $('demoChart');
  if (!empty || !canvas) return;
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
  chart = new Chart(canvas, {
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
  if (demoBusy) return;
  demoBusy = true;
  const refresh = $('refreshDemo');
  if (refresh) refresh.disabled = true;
  try {
    const response = await fetch('/api/status?limit=120', { cache: 'no-store' });
    if (!response.ok) throw new Error('Falha ao ler o protótipo');
    const data = await response.json();
    const percent = data.latest?.percent ?? null;
    const online = Boolean(data.online);

    const demoDot = $('demoDot');
    if (demoDot) demoDot.style.background = online ? '#58715a' : '#a24a36';
    setText('demoUpdated', data.latest ? `Atualizado ${relative(data.latest.ts)}` : 'Aguardando o ESP32');
    setText('demoPercent', percent ?? '--');
    setText('heroPercent', percent ?? '--');
    setText('demoAdc', data.latest?.adc ?? '--');
    setText('heroAdc', data.latest?.adc ?? '--');
    setText('demoRssi', data.latest?.rssi == null ? '--' : `${data.latest.rssi} dBm`);
    setText('demoAge', data.latest ? relative(data.latest.ts) : '--');
    setText('demoDevice', data.latest?.device || 'Sensor do protótipo');
    setText('heroUpdated', data.latest ? `Atualizado ${relative(data.latest.ts)}` : 'Aguardando o ESP32');

    const meterWidth = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    const demoMeter = $('demoMeter');
    if (demoMeter) demoMeter.style.width = meterWidth;
    const heroMeter = $('heroMeter');
    if (heroMeter) heroMeter.style.width = meterWidth;

    const heroDot = $('heroDot');
    if (heroDot) heroDot.className = `live-dot ${online ? '' : 'is-offline'}`.trim();

    if (data.latest) {
      const heroCard = document.querySelector('.hero-live-card');
      if (heroCard) heroCard.classList.toggle('is-offline', !online);
    }

    setStatus(data.status);
    renderChart(data.history || []);
  } catch {
    setText('demoUpdated', 'Demonstração temporariamente indisponível');
    setText('heroUpdated', 'Demonstração indisponível');
    setText('heroPercent', '--');
    setText('heroAdc', '--');
    const heroDot = $('heroDot');
    if (heroDot) heroDot.className = 'live-dot is-offline';
    setStatus({ level: 'offline', label: 'Sem conexão', advice: 'A leitura reaparecerá quando o serviço voltar.' });
  } finally {
    demoBusy = false;
    if (refresh) refresh.disabled = false;
  }
}

const refreshDemo = $('refreshDemo');
if (refreshDemo) refreshDemo.addEventListener('click', updateDemo);
updateDemo();
setInterval(() => {
  if (!document.hidden) updateDemo();
}, 5000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateDemo();
});

// ---------------------------------------------------------------
// Modelo 3D: inclinação, rotação e aproximação guiadas pelo scroll
// ---------------------------------------------------------------
function setupHeroModel() {
  const stage = $('modelStage');
  const viewer = $('heroModel');
  if (!stage || !viewer) return;

  const markReady = () => {
    stage.classList.add('is-model-ready');
    stage.classList.remove('is-model-error');
  };
  const markError = () => {
    stage.classList.remove('is-model-ready');
    stage.classList.add('is-model-error');
  };

  viewer.addEventListener('load', markReady);
  viewer.addEventListener('error', markError);

  let readyPoll = 0;
  const stopReadyPoll = () => {
    if (readyPoll) window.clearInterval(readyPoll);
    readyPoll = 0;
  };
  readyPoll = window.setInterval(() => {
    if (viewer.loaded) {
      markReady();
      stopReadyPoll();
    }
  }, 500);
  window.setTimeout(() => {
    stopReadyPoll();
    if (!viewer.loaded) markError();
  }, 12000);

  let yaw = 31;
  let pitch = 73;
  let zoom = 112;
  let autoYaw = 0;
  let pointerYaw = 0;
  let pointerPitch = 0;
  let stageVisible = true;
  let lastPaint = 0;
  let lastTick = 0;

  const paint = () => {
    viewer.setAttribute('camera-orbit', `${yaw.toFixed(2)}deg ${pitch.toFixed(2)}deg ${zoom.toFixed(2)}%`);
  };

  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const rect = stage.getBoundingClientRect();
    pointerYaw = ((event.clientX - rect.left) / rect.width - .5) * 2;
    pointerPitch = ((event.clientY - rect.top) / rect.height - .5) * 2;
  });
  stage.addEventListener('pointerleave', () => {
    pointerYaw = 0;
    pointerPitch = 0;
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => {
      stageVisible = entry.isIntersecting;
    }, { rootMargin: '180px' });
    observer.observe(stage);
  }

  function frame(now) {
    const delta = lastTick ? Math.min(64, now - lastTick) : 16;
    lastTick = now;
    if (!document.hidden && stageVisible) {
      const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(520, window.innerHeight * .58)));
      const motionScale = reduceMotion.matches ? .35 : 1;
      autoYaw += delta * .022 * motionScale;
      stage.style.setProperty('--model-progress', progress.toFixed(3));
      const idle = Math.sin(now / 2700) * 3.4 * (1 - progress) * motionScale;
      const targetYaw = 31 + progress * 152 * motionScale + autoYaw + pointerYaw * 6 + idle;
      const targetPitch = 73 - progress * 14 * motionScale - pointerPitch * 3.5;
      const targetZoom = 112 + progress * 3 * motionScale;
      yaw += (targetYaw - yaw) * .12;
      pitch += (targetPitch - pitch) * .12;
      zoom += (targetZoom - zoom) * .12;
      if (now - lastPaint > 20) {
        paint();
        lastPaint = now;
      }
    }
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}
setupHeroModel();

// Parallax do hero no padrão Maison: a imagem desce e some conforme a seção sai.
function setupHeroParallax() {
  const hero = document.querySelector('.product-hero');
  const visual = document.querySelector('.product-hero-visual');
  if (!hero || !visual || reduceMotion.matches) return;
  let queued = false;
  const update = () => {
    queued = false;
    const progress = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight)));
    const shift = progress * Math.min(88, visual.offsetHeight * .14);
    const fade = Math.min(1, Math.max(0, (progress - .35) / .45));
    visual.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    visual.style.opacity = String((1 - fade).toFixed(3));
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  update();
}
setupHeroParallax();

// ---------------------------------------------------------------
// Animações de entrada guiadas pelo scroll
// ---------------------------------------------------------------
const scrollAnimated = new Set();
if ('IntersectionObserver' in window) {
  const animObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-inview');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.05, rootMargin: '0px 0px -100px 0px' });

  const addScrollAnim = (element, delay, variant = '') => {
    if (!element || scrollAnimated.has(element) || element.classList.contains('closing-art')) return;
    scrollAnimated.add(element);
    element.classList.add('scroll-anim');
    if (variant) element.classList.add(variant);
    if (delay) element.style.setProperty('--scroll-delay', `${delay}ms`);
    animObserver.observe(element);
  };

  const staggerGroups = [
    ['.section-heading', 100, 'is-title'],
    ['.demo-grid', 100, ''],
    ['.story-intro', 120, 'is-title'],
    ['.story-points', 90, 'is-right'],
    ['.steps-grid', 100, ''],
    ['.feature-bento', 100, ''],
    ['.pricing-grid', 100, ''],
    ['.faq-intro', 100, 'is-title'],
    ['.faq-list', 50, ''],
    ['.evolution-copy', 100, ''],
    ['.closing-cta', 90, ''],
  ];
  for (const [selector, step, variant] of staggerGroups) {
    document.querySelectorAll(selector).forEach((group) => {
      [...group.children].forEach((child, index) => addScrollAnim(child, Math.min(index * step, 400), variant));
    });
  }
  document.querySelectorAll('.story-showcase').forEach((element) => addScrollAnim(element, 0, 'is-left'));
  document.querySelectorAll('.evolution-feature').forEach((element) => addScrollAnim(element, 0, 'is-right'));

  const parallaxItems = [
    { element: document.querySelector('.story-image img'), strength: 38, scale: 1.06 },
    { element: document.querySelector('.closing-art'), strength: 54, rotate: -14 },
  ].filter((item) => item.element);

  let parallaxQueued = false;
  const updateParallax = () => {
    parallaxQueued = false;
    const viewport = window.innerHeight;
    for (const item of parallaxItems) {
      const rect = item.element.getBoundingClientRect();
      if (rect.bottom < -120 || rect.top > viewport + 120) continue;
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport + rect.height)));
      const shift = (progress - .5) * item.strength;
      const rotation = item.rotate ? ` rotate(${item.rotate}deg)` : '';
      const scale = item.scale ? ` scale(${item.scale})` : '';
      item.element.style.transition = 'none';
      item.element.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)${rotation}${scale}`;
    }
  };
  const queueParallax = () => {
    if (parallaxQueued) return;
    parallaxQueued = true;
    window.requestAnimationFrame(updateParallax);
  };
  window.addEventListener('scroll', queueParallax, { passive: true });
  window.addEventListener('resize', queueParallax);
  queueParallax();
}

// ---------------------------------------------------------------
// Navegação interna suave + cabeçalho ao rolar
// ---------------------------------------------------------------
const landingHeader = document.querySelector('.landing-header');
const mobileReserveBar = document.querySelector('.mobile-reserve-bar');
const updateHeader = () => {
  if (landingHeader) landingHeader.classList.toggle('is-scrolled', window.scrollY > 10);
  if (mobileReserveBar) {
    const showBar = window.scrollY > window.innerHeight * .8;
    mobileReserveBar.classList.toggle('is-visible', showBar);
  }
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const scrollRatio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
  document.documentElement.style.setProperty('--scroll-progress', scrollRatio.toFixed(4));
};
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const id = link.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', id);
  });
});

// ---------------------------------------------------------------
// Reserva do primeiro lote (sem pagamento)
// ---------------------------------------------------------------
const planLabels = {
  one: 'PlantSpace One · 1 sensor',
  casa: 'PlantSpace Casa · 3 sensores',
  horta: 'PlantSpace Horta · 5 sensores',
};

function setupReservations() {
  const dialog = $('reserveDialog');
  const form = $('reserveForm');
  if (!dialog || !form) return;

  const nameInput = $('reserveName');
  const emailInput = $('reserveEmail');
  const whatsappInput = $('reserveWhatsapp');
  const planLabel = $('reservePlanLabel');
  const message = $('reserveMessage');
  const submit = $('reserveSubmit');
  const cancel = $('cancelReserve');
  const close = $('closeReserve');
  let activePlan = 'casa';

  const setMessage = (text, type = '') => {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message${type ? ` is-${type}` : ''}`;
  };

  const resetForm = () => {
    form.reset();
    activePlan = 'casa';
    if (planLabel) planLabel.textContent = planLabels.casa;
    [nameInput, emailInput, whatsappInput, submit].forEach((element) => {
      if (!element) return;
      element.disabled = false;
    });
    if (submit) submit.textContent = 'Entrar na lista';
    if (cancel) cancel.textContent = 'Agora não';
    setMessage('');
  };

  const lockScroll = () => {
    const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.classList.add('is-dialog-open');
    document.body.style.paddingRight = gap ? `${gap}px` : '';
  };

  const unlockScroll = () => {
    document.documentElement.classList.remove('is-dialog-open');
    document.body.style.paddingRight = '';
  };

  const openDialog = (plan) => {
    resetForm();
    activePlan = planLabels[plan] ? plan : 'casa';
    if (planLabel) planLabel.textContent = planLabels[activePlan];
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    lockScroll();
    window.setTimeout(() => nameInput && nameInput.focus(), 80);
  };

  const closeDialog = () => {
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    unlockScroll();
  };

  document.querySelectorAll('.js-reserve').forEach((button) => {
    button.addEventListener('click', () => openDialog(button.dataset.plan || 'casa'));
  });
  close?.addEventListener('click', closeDialog);
  cancel?.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', unlockScroll);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim().toLowerCase() || '';
    const rawWhatsapp = whatsappInput?.value.trim() || '';

    if (name.length < 2) {
      setMessage('Escreva seu nome para continuar.', 'error');
      nameInput?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setMessage('Confira o e-mail antes de enviar.', 'error');
      emailInput?.focus();
      return;
    }

    let whatsapp = null;
    if (rawWhatsapp) {
      const digits = rawWhatsapp.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) {
        setMessage('Confira o WhatsApp ou deixe o campo em branco.', 'error');
        whatsappInput?.focus();
        return;
      }
      whatsapp = `+${digits}`;
    }

    [nameInput, emailInput, whatsappInput, submit].forEach((element) => {
      if (element) element.disabled = true;
    });
    if (submit) submit.textContent = 'Reservando…';
    setMessage('Registrando sua reserva…', 'info');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, whatsapp, plan: activePlan }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar a reserva.');
      setMessage('Reserva registrada. Vamos avisar você quando o primeiro lote abrir.', 'success');
      if (submit) submit.textContent = 'Reserva registrada';
      if (cancel) cancel.textContent = 'Fechar';
    } catch (error) {
      setMessage(error.name === 'AbortError' ? 'A conexão demorou demais. Tente de novo.' : (error.message || 'Não foi possível registrar a reserva.'), 'error');
      [nameInput, emailInput, whatsappInput, submit].forEach((element) => {
        if (element) element.disabled = false;
      });
      if (submit) submit.textContent = 'Tentar novamente';
    } finally {
      window.clearTimeout(timeout);
    }
  });
}
setupReservations();
