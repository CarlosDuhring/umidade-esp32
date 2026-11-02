(function () {
  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

  function nationalDigits(value) {
    let digits = onlyDigits(value);
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
    return digits.slice(0, 11);
  }

  function formatBR(value) {
    const digits = nationalDigits(value);
    if (!digits) return '';
    if (digits.length < 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function toE164(value) {
    const digits = nationalDigits(value);
    return digits.length === 10 || digits.length === 11 ? `+55${digits}` : '';
  }

  function attach(input) {
    if (!input) return;
    input.dataset.phoneBrReady = 'true';
    input.addEventListener('input', () => {
      input.value = formatBR(input.value);
    });
    input.addEventListener('blur', () => {
      input.value = formatBR(input.value);
    });
    if (input.value) input.value = formatBR(input.value);
  }

  window.PlantSpacePhone = { formatBR, toE164, attach };

  const init = () => {
    document.querySelectorAll('[data-phone-br]').forEach(attach);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
