(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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

  const currentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  /* Header, menu and scroll progress */
  let scrollTicking = false;
  const updateScroll = () => {
    scrollTicking = false;
    const top = window.scrollY || document.documentElement.scrollTop;
    header?.classList.toggle("is-scrolled", top > 18);
    if (scrollProgress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress.style.width = `${max > 0 ? Math.min(100, (top / max) * 100) : 0}%`;
    }
  };
  window.addEventListener("scroll", () => {
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
      window.scrollTo({ top, behavior: reduceMotion.matches ? "auto" : "smooth" });
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
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" })
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
    if (reduceMotion.matches) {
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
  if (heroStage && !reduceMotion.matches && window.matchMedia("(pointer: fine)").matches) {
    heroStage.addEventListener("pointermove", (event) => {
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
  const simButtons = $$(".sim-button");
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
    }, reduceMotion.matches ? 300 : 1250);
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
