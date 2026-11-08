(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const motionRoot = document.documentElement;
  const motionToggleButtons = $$("[data-motion-toggle]");
  const motionEnabled = () => !motionRoot.classList.contains("motion-off");
  const syncMotionControls = () => {
    const on = motionEnabled();
    motionToggleButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(on));
      button.setAttribute("aria-label", on ? "Desativar animações" : "Ativar animações");
      button.title = on ? "Animações ativadas — clique para desativar" : "Animações desativadas — clique para ativar";
      const state = button.querySelector("[data-motion-state]");
      if (state) state.textContent = on ? "Ativado" : "Reduzido";
    });
  };
  const header = $(".site-header");
  const nav = $("#siteNav");
  const menuToggle = $("#menuToggle");
  const scrollProgress = $(".scroll-progress");
  const toast = $("#toast");
  let toastTimer = 0;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
  };

  const setMotion = (enabled, persist = true) => {
    motionRoot.classList.toggle("motion-off", !enabled);
    if (persist) {
      try { localStorage.setItem("faceclass:motion", enabled ? "on" : "off"); }
      catch (error) { /* storage blocked: the choice lasts for this tab */ }
    }
    syncMotionControls();
    if (enabled) {
      motionRoot.classList.add("motion-replay");
      void motionRoot.offsetWidth;
      motionRoot.classList.remove("motion-replay");
    }
    updateScroll();
  };
  motionToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = !motionEnabled();
      setMotion(next);
      showToast(next ? "Animações ativadas." : "Modo de movimento reduzido ativado.");
    });
  });
  syncMotionControls();

  const currentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  /* Header, menu and scroll progress */
  const hero = $(".hero");
  const heroStageNode = $("#heroStage");
  const narrowHero = window.matchMedia("(max-width: 980px)");
  const parallaxItems = $$("[data-parallax]");
  let scrollTicking = false;
  const updateScroll = () => {
    scrollTicking = false;
    const top = window.scrollY || document.documentElement.scrollTop;
    header?.classList.toggle("is-scrolled", top > 18);
    if (scrollProgress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress.style.width = `${max > 0 ? Math.min(100, (top / max) * 100) : 0}%`;
    }
    if (hero) {
      const rect = hero.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
      hero.style.setProperty("--hero-scroll", progress.toFixed(3));
      if (!motionEnabled()) {
        hero.style.setProperty("--hero-y", "0px");
        hero.style.setProperty("--hero-fade", "1");
      } else if (narrowHero.matches && heroStageNode) {
        /* On mobile the visual sits below the copy: fade it only as it leaves the top. */
        const stageHeight = heroStageNode.offsetHeight || 385;
        const stageTop = heroStageNode.getBoundingClientRect().top;
        const headerOffset = 70;
        const leaveDistance = Math.max(1, headerOffset + stageHeight * .45);
        const stageProgress = Math.min(1, Math.max(0, (headerOffset - stageTop) / leaveDistance));
        hero.style.setProperty("--hero-y", `${(stageProgress * stageHeight * .2).toFixed(1)}px`);
        hero.style.setProperty("--hero-fade", (1 - stageProgress).toFixed(3));
      } else {
        const stageHeight = heroStageNode?.offsetHeight || 560;
        hero.style.setProperty("--hero-y", `${(progress * stageHeight * .2).toFixed(1)}px`);
        hero.style.setProperty("--hero-fade", Math.max(0, 1 - progress / .8).toFixed(3));
      }
    }
    if (motionEnabled()) {
      parallaxItems.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < -160 || rect.top > window.innerHeight + 160) return;
        const relative = (rect.top + rect.height / 2 - window.innerHeight / 2) / Math.max(1, window.innerHeight);
        const speed = Number.parseFloat(element.dataset.parallax) || .08;
        element.style.setProperty("--parallax-y", `${(-relative * speed * 150).toFixed(1)}px`);
      });
    }
  };
  window.addEventListener("scroll", () => {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(updateScroll);
    }
  }, { passive: true });
  window.addEventListener("resize", () => {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(updateScroll);
    }
  }, { passive: true });
  updateScroll();

  let menuScrollY = 0;
  const setMenu = (open) => {
    if (!header || !menuToggle) return;
    header.classList.toggle("is-menu-open", open);
    document.body.classList.toggle("is-menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    if (open) menuScrollY = window.scrollY;
  };
  menuToggle?.addEventListener("click", () => setMenu(!header.classList.contains("is-menu-open")));
  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (header?.classList.contains("is-menu-open") && !header.contains(event.target)) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });
  const desktopQuery = window.matchMedia("(min-width: 981px)");
  const closeOnDesktop = (event) => { if (event.matches) setMenu(false); };
  if (desktopQuery.addEventListener) desktopQuery.addEventListener("change", closeOnDesktop);
  else if (desktopQuery.addListener) desktopQuery.addListener(closeOnDesktop);
  window.addEventListener("scroll", () => {
    if (header?.classList.contains("is-menu-open") && Math.abs(window.scrollY - menuScrollY) > 30) setMenu(false);
  }, { passive: true });

  /* Smooth anchors with the fixed header offset */
  $$('a[href^="#"]').forEach((link) => {
    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;
    link.addEventListener("click", (event) => {
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      setMenu(false);
      const headerHeight = header?.getBoundingClientRect().height || 78;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
      window.scrollTo({ top, behavior: motionEnabled() ? "smooth" : "auto" });
      if (history.replaceState) history.replaceState(null, "", hash);
    });
  });

  /* Reveal and counter animations */
  const revealElements = $$(".reveal");
  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.01, rootMargin: "0px 0px -100px 0px" })
    : null;
  revealElements.forEach((element) => {
    if (revealObserver) revealObserver.observe(element);
    else element.classList.add("is-visible");
  });

  const animateNumber = (element) => {
    if (!element || element.dataset.counted === "true") return;
    const target = Number(element.dataset.count);
    const suffix = element.dataset.suffix || "";
    if (!Number.isFinite(target)) return;
    element.dataset.counted = "true";
    if (!motionEnabled()) {
      element.textContent = `${target}${suffix}`;
      return;
    }
    const duration = 1200;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = `${Math.round(target * eased)}${suffix}`;
      if (progress < 1) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  };
  const counters = $$("[data-count]");
  const counterObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateNumber(entry.target);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.5 })
    : null;
  counters.forEach((element) => {
    if (counterObserver) counterObserver.observe(element);
    else animateNumber(element);
  });

  /* Active section in the main nav */
  const navLinks = $$(".site-nav a");
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
        });
      });
    }, { rootMargin: "-38% 0px -52% 0px", threshold: 0 });
    sections.forEach((section) => sectionObserver.observe(section));
  }

  /* Subtle 3D tilt on the hero product */
  const heroStage = $("#heroStage");
  if (heroStage && window.matchMedia("(pointer: fine)").matches) {
    heroStage.addEventListener("pointermove", (event) => {
      if (!motionEnabled()) return;
      const rect = heroStage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      heroStage.style.setProperty("--ry", `${(x - 0.5) * 7}deg`);
      heroStage.style.setProperty("--rx", `${(0.5 - y) * 6}deg`);
    }, { passive: true });
    heroStage.addEventListener("pointerleave", () => {
      heroStage.style.setProperty("--ry", "0deg");
      heroStage.style.setProperty("--rx", "0deg");
    });
  }

  /* Notification filter tabs */
  const notifTabs = $$("[data-filter]");
  const notifList = $("#notifList");
  let notifFilter = "all";
  const applyNotifFilter = () => {
    if (!notifList) return;
    $$(".notif-item", notifList).forEach((item) => {
      item.classList.toggle("is-hidden", notifFilter !== "all" && item.dataset.type !== notifFilter);
    });
  };
  notifTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      notifFilter = tab.dataset.filter || "all";
      notifTabs.forEach((other) => {
        const active = other === tab;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
      });
      applyNotifFilter();
    });
  });

  const addNotification = (type, title, body, time) => {
    if (!notifList) return;
    const icons = {
      entry: { className: "notif-green", icon: "i-check" },
      exit: { className: "notif-blue", icon: "i-logout" },
      alert: { className: "notif-red", icon: "i-alert" },
    };
    const meta = icons[type] || icons.entry;
    const item = document.createElement("article");
    item.className = "notif-item";
    item.dataset.type = type;
    item.innerHTML = `
      <span class="notif-icon ${meta.className}"><svg class="icon"><use href="#${meta.icon}"></use></svg></span>
      <div><strong>${title}</strong><p>${body}</p><small>${time}</small></div>
    `;
    notifList.prepend(item);
    while (notifList.children.length > 7) notifList.lastElementChild.remove();
    const badge = $("#notifBadge");
    if (badge) badge.textContent = String(notifList.children.length);
    applyNotifFilter();
  };

  /* Interactive entrance simulator */
  const simLed = $("#simLed");
  const simStatus = $("#simStatus");
  const simSubstatus = $("#simSubstatus");
  const simStatusDot = $("#simStatusDot");
  const faceScan = $("#faceScan");
  const demoFace = $("#demoFace");
  const simLogList = $("#simLogList");
  const simLogCount = $("#simLogCount");
  const simClock = $("#simClock");
  const simButtons = $$(".sim-button[data-action]");
  let simulatorBusy = false;

  const setSimStatus = (label, sub, tone) => {
    if (simStatus) simStatus.textContent = label;
    if (simSubstatus) simSubstatus.textContent = sub;
    if (simStatusDot) simStatusDot.className = `sim-status-dot ${tone ? `is-${tone}` : ""}`.trim();
    if (simLed) {
      simLed.classList.remove("is-green", "is-red");
      if (tone === "green") simLed.classList.add("is-green");
      if (tone === "red") simLed.classList.add("is-red");
    }
  };

  const addLog = (type, content) => {
    if (!simLogList) return;
    const dotClass = type === "alert" ? "log-red" : type === "exit" ? "log-blue" : "log-green";
    const row = document.createElement("div");
    row.className = "sim-log-item";
    row.innerHTML = `<span class="log-dot ${dotClass}"></span><span>${content}</span><time>${currentTime()}</time>`;
    simLogList.prepend(row);
    while (simLogList.children.length > 5) simLogList.lastElementChild.remove();
    if (simLogCount) simLogCount.textContent = `${simLogList.children.length} eventos`;
  };

  const runScenario = (type) => {
    if (simulatorBusy || !faceScan) return;
    simulatorBusy = true;
    simButtons.forEach((button) => { button.disabled = true; });
    faceScan.classList.add("is-scanning");
    if (demoFace) demoFace.classList.remove("is-alert", "is-exit");

    if (type === "entry") {
      demoFace.textContent = "AC";
      setSimStatus("Identificando aluno…", "Mantenha o rosto na área de leitura.", "blue");
    } else if (type === "exit") {
      demoFace.textContent = "LG";
      demoFace.classList.add("is-exit");
      setSimStatus("Identificando aluno…", "Mantenha o rosto na área de leitura.", "blue");
    } else {
      demoFace.textContent = "?";
      demoFace.classList.add("is-alert");
      setSimStatus("Verificando acesso…", "A câmera está analisando a aproximação.", "blue");
    }

    window.setTimeout(() => {
      faceScan.classList.remove("is-scanning");
      const time = currentTime();
      if (simClock) simClock.textContent = time;

      if (type === "entry") {
        setSimStatus("Acesso liberado", "Ana Clara identificada · entrada registrada.", "green");
        addLog("entry", "<b>Ana Clara</b> entrou na sala 01");
        addNotification("entry", "Entrada confirmada", "Ana Clara entrou na sala 01.", time);
        showToast("Entrada de Ana Clara registrada.");
      } else if (type === "exit") {
        setSimStatus("Saída registrada", "Lucas Gabriel identificado · até logo.", "blue");
        addLog("exit", "<b>Lucas Gabriel</b> saiu da sala 01");
        addNotification("exit", "Saída confirmada", "Lucas Gabriel saiu da sala 01.", time);
        showToast("Saída de Lucas Gabriel registrada.");
      } else {
        setSimStatus("Acesso negado", "Aluno não identificado · verifique a entrada.", "red");
        addLog("alert", "<b>Alerta:</b> aluno não identificado na entrada");
        addNotification("alert", "Alerta de presença", "Aluno não identificado na entrada da sala 01.", time);
        showToast("Alerta enviado ao painel do professor.");
      }

      simulatorBusy = false;
      simButtons.forEach((button) => { button.disabled = false; });
    }, !motionEnabled() ? 300 : 1250);
  };

  simButtons.forEach((button) => {
    button.addEventListener("click", () => runScenario(button.dataset.action || "entry"));
  });
  if (simClock) simClock.textContent = currentTime();
  window.setInterval(() => { if (simClock) simClock.textContent = currentTime(); }, 30000);

  /* Dashboard tabs */
  const appTabs = $$("[data-app-tab]");
  const dashPanels = $$(".dash-panel");
  const setAppTab = (name) => {
    appTabs.forEach((tab) => {
      const active = tab.dataset.appTab === name;
      tab.classList.toggle("is-active", active);
      if (tab.classList.contains("dash-nav-item")) tab.setAttribute("aria-selected", String(active));
    });
    dashPanels.forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle("is-active", active);
      if (active) {
        $$("[data-count]", panel).forEach((element) => {
          element.dataset.counted = "false";
          animateNumber(element);
        });
      }
    });
  };
  appTabs.forEach((tab) => {
    tab.addEventListener("click", () => setAppTab(tab.dataset.appTab));
  });

  /* App screens tour: clicking a step or scrolling the section changes the phone */
  const appTourSteps = $$("[data-app-step]");
  const appTourViews = $$("[data-app-view]");
  const appTourLabel = $("#appTourLabel");
  const appTourCount = $("#appTourCount");
  const appTourDots = $$("[data-app-dot]");
  const appTourNames = {
    home: "Visão geral",
    alunos: "Alunos",
    notificacoes: "Notificações",
    relatorios: "Relatórios",
  };
  const appTourNumbers = { home: "01", alunos: "02", notificacoes: "03", relatorios: "04" };
  let appTourObserver = null;
  let appTourResizeTimer = 0;

  const setAppTourView = (name) => {
    if (!appTourViews.length || !appTourNames[name]) return;
    appTourSteps.forEach((step) => {
      const active = step.dataset.appStep === name;
      step.classList.toggle("is-active", active);
      step.setAttribute("aria-pressed", String(active));
    });
    appTourViews.forEach((view) => {
      const active = view.dataset.appView === name;
      view.classList.toggle("is-active", active);
      view.setAttribute("aria-hidden", String(!active));
      if ("inert" in view) view.inert = !active;
    });
    if (appTourLabel) appTourLabel.textContent = appTourNames[name];
    if (appTourCount) appTourCount.textContent = appTourNumbers[name];
    appTourDots.forEach((dot) => dot.classList.toggle("is-active", dot.dataset.appDot === name));
  };

  const observeAppTour = () => {
    if (appTourObserver) appTourObserver.disconnect();
    appTourObserver = null;
    if (!("IntersectionObserver" in window) || !window.matchMedia("(min-width: 981px)").matches) return;
    appTourObserver = new IntersectionObserver((entries) => {
      if (!motionEnabled()) return;
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setAppTourView(visible.target.dataset.appStep);
    }, { rootMargin: "-40% 0px -50% 0px", threshold: [0, .15, .5] });
    appTourSteps.forEach((step) => appTourObserver.observe(step));
  };

  appTourSteps.forEach((step) => {
    step.addEventListener("click", () => {
      setAppTourView(step.dataset.appStep);
      if (window.matchMedia("(max-width: 980px)").matches) {
        const scroller = step.closest(".app-steps");
        if (scroller) {
          const stepLeft = step.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
          scroller.scrollTo({
            left: stepLeft - (scroller.clientWidth - step.offsetWidth) / 2,
            behavior: motionEnabled() ? "smooth" : "auto",
          });
        }
      }
    });
  });
  setAppTourView("home");
  observeAppTour();
  window.addEventListener("resize", () => {
    window.clearTimeout(appTourResizeTimer);
    appTourResizeTimer = window.setTimeout(observeAppTour, 160);
  }, { passive: true });

  /* Real camera + local MediaPipe face detection */
  const cameraDialog = $("#cameraDialog");
  const cameraOpeners = $$("[data-camera-open]");
  const cameraCloseButton = $("#cameraClose");
  const cameraStartButton = $("#cameraStart");
  const cameraRetryButton = $("#cameraRetry");
  const cameraAgainButton = $("#cameraAgain");
  const cameraStopButton = $("#cameraStop");
  const cameraVideo = $("#cameraVideo");
  const cameraCanvas = $("#cameraCanvas");
  const cameraFeed = $("#cameraFeed");
  const cameraPlaceholder = $("#cameraPlaceholder");
  const cameraLoading = $("#cameraLoading");
  const cameraStatusTitle = $("#cameraStatusTitle");
  const cameraStatusText = $("#cameraStatusText");
  const cameraProgress = $("#cameraProgress");
  const cameraProgressBar = $("#cameraProgressBar");
  const cameraProgressLabel = $("#cameraProgressLabel");
  const cameraFeedStatus = $("#cameraFeedStatus");
  const cameraFeedLabel = $("#cameraFeedLabel");
  const cameraConfidence = $("#cameraConfidence");
  const cameraCheckDevice = $("#cameraCheckDevice");
  const cameraCheckFace = $("#cameraCheckFace");
  const cameraCheckRead = $("#cameraCheckRead");
  const cameraPlaceholderTitle = cameraPlaceholder?.querySelector("strong");
  const cameraPlaceholderText = cameraPlaceholder?.querySelector("span:last-child");
  const cameraVisionUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
  const cameraWasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  const cameraModelUrl = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
  const cameraSupported = Boolean(navigator.mediaDevices?.getUserMedia);
  const cameraHoldMs = 1050;
  let cameraStream = null;
  let cameraDetector = null;
  let cameraDetectorPromise = null;
  let cameraRaf = 0;
  let cameraSession = 0;
  let cameraActive = false;
  let cameraSuccess = false;
  let cameraFaceSince = 0;
  let cameraLastVideoTime = -1;
  let cameraLastDetectAt = 0;
  let cameraLastDetection = null;
  let cameraNoFaceHint = false;
  let cameraScanStartedAt = 0;
  let cameraDetectErrors = 0;

  const setCameraProgress = (value) => {
    const progress = Math.max(0, Math.min(100, Math.round(value)));
    if (cameraProgressBar) cameraProgressBar.style.width = `${progress}%`;
    if (cameraProgress) cameraProgress.setAttribute("aria-valuenow", String(progress));
    if (cameraProgressLabel) cameraProgressLabel.textContent = `${progress}%`;
  };

  const setCameraStatus = (title, text) => {
    if (cameraStatusTitle) cameraStatusTitle.textContent = title;
    if (cameraStatusText) cameraStatusText.textContent = text;
  };

  const setCameraFeedStatus = (label, feedLabel = label) => {
    if (cameraFeedStatus) cameraFeedStatus.innerHTML = `<i class="camera-meta-dot"></i> ${label}`;
    if (cameraFeedLabel) cameraFeedLabel.textContent = feedLabel;
  };

  const setCameraCheck = (element, state, detail) => {
    if (!element) return;
    element.classList.toggle("is-active", state === "active");
    element.classList.toggle("is-done", state === "done");
    const small = element.querySelector("small");
    if (small && detail) small.textContent = detail;
  };

  const setCameraActions = (start, retry, again) => {
    if (cameraStartButton) cameraStartButton.hidden = !start;
    if (cameraRetryButton) cameraRetryButton.hidden = !retry;
    if (cameraAgainButton) cameraAgainButton.hidden = !again;
    if (cameraStopButton) cameraStopButton.hidden = false;
  };

  const setCameraPlaceholder = (title, text) => {
    if (cameraPlaceholderTitle) cameraPlaceholderTitle.textContent = title;
    if (cameraPlaceholderText) cameraPlaceholderText.textContent = text;
  };

  const clearCameraCanvas = () => {
    if (!cameraCanvas) return;
    const context = cameraCanvas.getContext("2d");
    if (context) context.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
  };

  const stopCameraStream = () => {
    if (cameraVideo) {
      try { cameraVideo.pause(); } catch (error) { /* no-op */ }
      cameraVideo.srcObject = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
  };

  const resetCameraUi = () => {
    cameraFeed?.classList.remove("is-ready", "is-loading", "is-success", "is-error");
    if (cameraLoading) cameraLoading.hidden = true;
    if (cameraVideo) cameraVideo.srcObject = null;
    clearCameraCanvas();
    setCameraPlaceholder("A câmera ainda não está ativa", "Clique em “Abrir câmera” para começar.");
    setCameraProgress(0);
    setCameraStatus("Pronto para começar", "Permita o acesso à câmera e mantenha o rosto dentro do quadro.");
    setCameraFeedStatus("Aguardando câmera", "Aguardando");
    if (cameraConfidence) cameraConfidence.textContent = "Confiança —";
    setCameraCheck(cameraCheckDevice, "pending", "Aguardando permissão");
    setCameraCheck(cameraCheckFace, "pending", "Centralize o rosto");
    setCameraCheck(cameraCheckRead, "pending", "Pronta para validar");
    cameraLastDetection = null;
    cameraNoFaceHint = false;
  };

  const cameraErrorDetails = (error) => {
    if (error?.cameraStage === "model") {
      return {
        title: "Leitura facial indisponível",
        message: "Não foi possível carregar o modelo de detecção. Verifique a conexão e tente novamente.",
      };
    }
    switch (error?.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return {
          title: "Permissão da câmera negada",
          message: "Libere o acesso à câmera no ícone de cadeado do navegador e tente novamente.",
        };
      case "NotFoundError":
      case "DevicesNotFoundError":
        return {
          title: "Nenhuma câmera encontrada",
          message: "Este dispositivo não tem uma câmera disponível para o teste ao vivo.",
        };
      case "NotReadableError":
      case "TrackStartError":
        return {
          title: "Câmera em uso",
          message: "Outro aplicativo está usando a câmera. Feche-o e tente novamente.",
        };
      case "SecurityError":
        return {
          title: "Conexão não segura",
          message: "A câmera só funciona em uma conexão HTTPS ou em localhost.",
        };
      case "NotSupportedError":
        return {
          title: "Câmera indisponível",
          message: "Seu navegador não oferece acesso à câmera. Tente Chrome, Edge ou Safari atualizado.",
        };
      default:
        return {
          title: "Não foi possível abrir a câmera",
          message: "Confira a permissão do navegador e tente novamente.",
        };
    }
  };

  const showCameraError = (error) => {
    cameraActive = false;
    cameraSession += 1;
    window.cancelAnimationFrame(cameraRaf);
    cameraRaf = 0;
    stopCameraStream();
    const details = cameraErrorDetails(error);
    cameraFeed?.classList.remove("is-ready", "is-loading", "is-success");
    cameraFeed?.classList.add("is-error");
    if (cameraLoading) cameraLoading.hidden = true;
    setCameraPlaceholder(details.title, details.message);
    setCameraStatus(details.title, details.message);
    setCameraFeedStatus("Câmera indisponível", "Erro");
    if (cameraConfidence) cameraConfidence.textContent = "Confiança —";
    setCameraProgress(0);
    setCameraCheck(cameraCheckDevice, "pending", "Não conectada");
    setCameraCheck(cameraCheckFace, "pending", "Aguardando câmera");
    setCameraCheck(cameraCheckRead, "pending", "Aguardando câmera");
    setCameraActions(false, true, false);
    clearCameraCanvas();
  };

  const loadFaceDetector = () => {
    if (cameraDetector) return Promise.resolve(cameraDetector);
    if (!cameraDetectorPromise) {
      cameraDetectorPromise = import(cameraVisionUrl)
        .then(async (vision) => {
          const fileset = await vision.FilesetResolver.forVisionTasks(cameraWasmUrl);
          const detector = await vision.FaceDetector.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: cameraModelUrl,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            minDetectionConfidence: .55,
            minSuppressionThreshold: .3,
          });
          cameraDetector = detector;
          return detector;
        })
        .catch((error) => {
          cameraDetectorPromise = null;
          error.cameraStage = "model";
          throw error;
        });
    }
    return cameraDetectorPromise;
  };

  const waitForVideo = (video, session) => new Promise((resolve) => {
    if (video.videoWidth) {
      resolve();
      return;
    }
    let timer = 0;
    const finish = () => {
      video.removeEventListener("loadedmetadata", finish);
      video.removeEventListener("loadeddata", finish);
      window.clearTimeout(timer);
      resolve();
    };
    video.addEventListener("loadedmetadata", finish);
    video.addEventListener("loadeddata", finish);
    timer = window.setTimeout(finish, 3000);
    if (session !== cameraSession) finish();
  });

  const finishCameraReading = (score) => {
    if (cameraSuccess) return;
    cameraSuccess = true;
    cameraFaceSince = 0;
    cameraNoFaceHint = false;
    const confidence = Math.round((score || 0) * 100);
    setCameraProgress(100);
    setCameraStatus(
      "Leitura concluída",
      `Rosto detectado com ${confidence}% de confiança. Acesso liberado nesta demonstração.`
    );
    setCameraFeedStatus("Acesso liberado", "Leitura concluída");
    if (cameraConfidence) cameraConfidence.textContent = `Confiança ${confidence}%`;
    cameraFeed?.classList.remove("is-loading", "is-error");
    cameraFeed?.classList.add("is-success");
    if (cameraLoading) cameraLoading.hidden = true;
    setCameraCheck(cameraCheckDevice, "done", "Câmera conectada");
    setCameraCheck(cameraCheckFace, "done", "Rosto centralizado");
    setCameraCheck(cameraCheckRead, "done", "Acesso liberado");
    setCameraActions(false, false, true);
    if (simClock) simClock.textContent = currentTime();
    setSimStatus("Acesso liberado", "Rosto detectado na leitura ao vivo · demonstração.", "green");
    if (demoFace) {
      demoFace.textContent = "OK";
      demoFace.classList.remove("is-alert", "is-exit");
    }
    addLog("entry", "<b>Rosto detectado</b> na leitura facial ao vivo");
    addNotification("entry", "Leitura facial concluída", "Rosto detectado na entrada da sala 01 (teste ao vivo).", currentTime());
    showToast("Rosto detectado. Acesso liberado nesta demonstração.");
  };

  const drawCameraOverlay = (detections) => {
    if (!cameraCanvas || !cameraVideo || !cameraFeed) return;
    const rect = cameraFeed.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (cameraCanvas.width !== width || cameraCanvas.height !== height) {
      cameraCanvas.width = width;
      cameraCanvas.height = height;
    }
    const context = cameraCanvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!detections || !detections.length) return;

    const videoWidth = cameraVideo.videoWidth || 640;
    const videoHeight = cameraVideo.videoHeight || 480;
    const scale = Math.max(width / videoWidth, height / videoHeight);
    const displayedWidth = videoWidth * scale;
    const displayedHeight = videoHeight * scale;
    const offsetX = (width - displayedWidth) / 2;
    const offsetY = (height - displayedHeight) / 2;

    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    detections.forEach((detection) => {
      const box = detection.boundingBox;
      if (!box) return;
      const x = offsetX + box.originX * scale;
      const y = offsetY + box.originY * scale;
      const boxWidth = box.width * scale;
      const boxHeight = box.height * scale;
      const radius = Math.min(boxWidth, boxHeight) * .1;
      context.strokeStyle = cameraSuccess ? "rgba(66,224,156,.96)" : "rgba(83,216,255,.96)";
      context.lineWidth = Math.max(2, dpr * 1.6);
      context.shadowColor = cameraSuccess ? "rgba(66,224,156,.8)" : "rgba(53,184,255,.8)";
      context.shadowBlur = 9 * dpr;
      if (typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(x, y, boxWidth, boxHeight, radius);
        context.stroke();
      } else {
        context.strokeRect(x, y, boxWidth, boxHeight);
      }
    });
    context.restore();
  };

  const updateCameraDetection = (detections, now) => {
    cameraLastDetection = detections;
    const face = detections.length === 1 ? detections[0] : null;
    const score = face?.categories?.[0]?.score || 0;

    if (detections.length > 1) {
      cameraFaceSince = 0;
      setCameraProgress(10);
      setCameraStatus("Mais de um rosto no quadro", "Deixe apenas um rosto visível para concluir a leitura.");
      setCameraFeedStatus("Vários rostos detectados", "Ajuste o quadro");
      if (cameraConfidence) cameraConfidence.textContent = "Confiança —";
      setCameraCheck(cameraCheckFace, "active", "Apenas um rosto");
      setCameraCheck(cameraCheckRead, "pending", "Aguardando leitura");
      return;
    }

    if (!face) {
      cameraFaceSince = 0;
      setCameraProgress(0);
      setCameraCheck(cameraCheckFace, "active", "Centralize o rosto");
      setCameraCheck(cameraCheckRead, "pending", "Aguardando leitura");
      if (cameraConfidence) cameraConfidence.textContent = "Confiança —";
      if (!cameraNoFaceHint) {
        setCameraFeedStatus("Procurando um rosto", "Procurando");
        if (now - cameraScanStartedAt > 9000) {
          cameraNoFaceHint = true;
          setCameraStatus("Ainda não encontramos um rosto", "Aproxime-se da câmera e verifique a iluminação do ambiente.");
        } else {
          setCameraStatus("Procurando um rosto…", "Centralize o rosto no quadro e mantenha uma boa iluminação.");
        }
      }
      return;
    }

    cameraNoFaceHint = false;
    if (!cameraFaceSince) cameraFaceSince = now;
    const held = now - cameraFaceSince;
    const confidence = Math.round(score * 100);
    const progress = Math.min(99, 24 + (held / cameraHoldMs) * 76);
    setCameraProgress(progress);
    if (cameraConfidence) cameraConfidence.textContent = `Confiança ${confidence}%`;
    setCameraFeedStatus("Rosto detectado", "Rosto detectado");
    setCameraCheck(cameraCheckFace, held > 350 ? "done" : "active", held > 350 ? "Rosto centralizado" : "Mantenha o rosto");
    setCameraCheck(cameraCheckRead, "active", "Validando leitura");
    if (held >= cameraHoldMs) {
      finishCameraReading(score);
    } else {
      setCameraStatus("Rosto detectado", "Mantenha-se assim por um instante para concluir a leitura.");
    }
  };

  const startCameraLoop = (session) => {
    window.cancelAnimationFrame(cameraRaf);
    cameraDetectErrors = 0;
    const loop = () => {
      if (!cameraActive || session !== cameraSession) return;
      if (cameraVideo && cameraVideo.readyState >= 2) {
        if (!cameraSuccess && cameraDetector) {
          const now = performance.now();
          if (now - cameraLastDetectAt >= 95 && cameraVideo.currentTime !== cameraLastVideoTime) {
            cameraLastVideoTime = cameraVideo.currentTime;
            cameraLastDetectAt = now;
            try {
              const result = cameraDetector.detectForVideo(cameraVideo, now);
              cameraDetectErrors = 0;
              updateCameraDetection(result.detections || [], now);
            } catch (error) {
              cameraDetectErrors += 1;
              if (cameraDetectErrors > 8) {
                showCameraError(error);
                return;
              }
            }
          }
        }
        drawCameraOverlay(cameraLastDetection);
      }
      cameraRaf = window.requestAnimationFrame(loop);
    };
    cameraRaf = window.requestAnimationFrame(loop);
  };

  const startCamera = async () => {
    if (!cameraDialog?.open) return;
    const session = ++cameraSession;
    cameraActive = true;
    cameraSuccess = false;
    cameraFaceSince = 0;
    cameraNoFaceHint = false;
    cameraLastDetection = null;
    cameraLastVideoTime = -1;
    cameraLastDetectAt = 0;
    window.cancelAnimationFrame(cameraRaf);
    cameraRaf = 0;
    cameraFeed?.classList.remove("is-success", "is-loading", "is-error");
    setCameraPlaceholder("Abrindo câmera…", "Permita o acesso quando o navegador perguntar.");
    setCameraProgress(4);
    setCameraStatus("Abrindo câmera…", "Permita o acesso quando o navegador perguntar. A leitura acontece localmente.");
    setCameraFeedStatus("Solicitando permissão", "Abrindo");
    setCameraCheck(cameraCheckDevice, "active", "Solicitando permissão");
    setCameraCheck(cameraCheckFace, "pending", "Aguardando câmera");
    setCameraCheck(cameraCheckRead, "pending", "Aguardando câmera");
    if (cameraConfidence) cameraConfidence.textContent = "Confiança —";
    setCameraActions(false, false, false);

    try {
      if (!cameraSupported) {
        const error = new Error("getUserMedia indisponível");
        error.name = "NotSupportedError";
        throw error;
      }
      if (!window.isSecureContext) {
        const error = new Error("Conexão não segura");
        error.name = "SecurityError";
        throw error;
      }

      if (cameraStream && cameraStream.getVideoTracks().every((track) => track.readyState === "ended")) {
        stopCameraStream();
      }

      if (!cameraStream) {
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "user" },
              width: { ideal: 960 },
              height: { ideal: 720 },
            },
          });
        } catch (error) {
          if (error.name !== "OverconstrainedError" && error.name !== "ConstraintNotSatisfiedError") throw error;
          cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
        if (session !== cameraSession) {
          stopCameraStream();
          return;
        }
      }

      if (!cameraVideo) throw new Error("Elemento de vídeo ausente.");
      cameraVideo.srcObject = cameraStream;
      try { await cameraVideo.play(); } catch (error) { /* o navegador ainda pode exibir o quadro */ }
      await waitForVideo(cameraVideo, session);
      if (session !== cameraSession) return;
      if (!cameraVideo.videoWidth) {
        const error = new Error("Vídeo não iniciou");
        error.name = "NotReadableError";
        throw error;
      }

      cameraFeed?.classList.add("is-ready");
      setCameraCheck(cameraCheckDevice, "done", "Câmera conectada");
      setCameraProgress(12);
      setCameraStatus("Carregando leitura facial…", "Preparando o modelo de detecção no navegador.");
      setCameraFeedStatus("Câmera ativa · carregando modelo", "Câmera ativa");
      if (cameraLoading) cameraLoading.hidden = false;
      cameraFeed?.classList.add("is-loading");
      const detector = await loadFaceDetector();
      if (session !== cameraSession) return;
      if (!detector) throw new Error("Modelo indisponível.");
      cameraDetector = detector;
      if (cameraLoading) cameraLoading.hidden = true;
      cameraFeed?.classList.remove("is-loading");
      setCameraProgress(18);
      setCameraStatus("Procurando um rosto…", "Centralize o rosto no quadro e mantenha uma boa iluminação.");
      setCameraFeedStatus("Procurando um rosto", "Procurando");
      setCameraCheck(cameraCheckFace, "active", "Centralize o rosto");
      setCameraCheck(cameraCheckRead, "pending", "Aguardando leitura");
      cameraScanStartedAt = performance.now();
      startCameraLoop(session);
    } catch (error) {
      if (session !== cameraSession) return;
      if (cameraLoading) cameraLoading.hidden = true;
      cameraFeed?.classList.remove("is-loading");
      showCameraError(error);
    }
  };

  const closeCameraDialog = () => {
    if (!cameraDialog) return;
    if (cameraDialog.open && typeof cameraDialog.close === "function") {
      cameraDialog.close();
    } else {
      cameraDialog.removeAttribute("open");
      document.body.classList.remove("camera-open");
      cameraSession += 1;
      cameraActive = false;
      window.cancelAnimationFrame(cameraRaf);
      stopCameraStream();
    }
  };

  const openCameraDialog = () => {
    if (!cameraDialog) return;
    document.body.classList.add("camera-open");
    if (!cameraDialog.open) {
      if (typeof cameraDialog.showModal === "function") {
        try { cameraDialog.showModal(); } catch (error) { cameraDialog.setAttribute("open", ""); }
      } else {
        cameraDialog.setAttribute("open", "");
      }
    }
    resetCameraUi();
    cameraStartButton.hidden = true;
    cameraRetryButton.hidden = true;
    cameraAgainButton.hidden = true;
    cameraStopButton.hidden = false;
    window.setTimeout(() => {
      if (cameraDialog.open) startCamera();
    }, 90);
    window.setTimeout(() => cameraCloseButton?.focus(), 140);
  };

  cameraOpeners.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openCameraDialog();
    });
  });
  cameraCloseButton?.addEventListener("click", closeCameraDialog);
  cameraStopButton?.addEventListener("click", closeCameraDialog);
  cameraStartButton?.addEventListener("click", startCamera);
  cameraRetryButton?.addEventListener("click", startCamera);
  cameraAgainButton?.addEventListener("click", startCamera);
  cameraDialog?.addEventListener("click", (event) => {
    if (event.target === cameraDialog) closeCameraDialog();
  });
  cameraDialog?.addEventListener("close", () => {
    document.body.classList.remove("camera-open");
    cameraSession += 1;
    cameraActive = false;
    window.cancelAnimationFrame(cameraRaf);
    cameraRaf = 0;
    stopCameraStream();
  });
  cameraDialog?.addEventListener("cancel", () => {
    document.body.classList.remove("camera-open");
  });

  /* Product colour picker */
  const specDevice = $("#specDevice");
  const colorName = $("#colorName");
  $$(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      $$(".swatch").forEach((other) => {
        const active = other === swatch;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      });
      if (specDevice) {
        specDevice.classList.remove("shell-black", "shell-white", "shell-gray");
        specDevice.classList.add(swatch.dataset.shell || "shell-black");
      }
      if (colorName) colorName.textContent = swatch.dataset.colorName || "Preto";
    });
  });

  /* Lead form: front-end demo with local persistence */
  const form = $("#contactForm");
  const phoneInput = $("#leadWhatsapp");
  const formSuccess = $("#formSuccess");
  const successName = $("#successName");
  const formNote = $("#formNote");

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length ? `(${digits}` : "";
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };
  phoneInput?.addEventListener("input", (event) => {
    event.target.value = formatPhone(event.target.value);
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const phoneDigits = (phoneInput?.value || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      showToast("Informe um WhatsApp com DDD.");
      phoneInput?.focus();
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const key = "faceclass:leads";
      const previous = JSON.parse(window.localStorage.getItem(key) || "[]");
      previous.push({ ...data, createdAt: new Date().toISOString() });
      window.localStorage.setItem(key, JSON.stringify(previous.slice(-50)));
    } catch (error) {
      // The demo still confirms the request if storage is unavailable.
    }
    if (successName) successName.textContent = String(data.nome || "").trim().split(/\s+/)[0] || "professor(a)";
    if (formSuccess) formSuccess.hidden = false;
    if (formNote) formNote.hidden = true;
    const submit = $(".form-submit", form);
    if (submit) {
      submit.disabled = true;
      submit.innerHTML = 'Solicitação registrada <svg class="icon icon-sm"><use href="#i-check"></use></svg>';
    }
    showToast("Solicitação registrada nesta demonstração.");
  });
})();
