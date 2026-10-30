let authMode = 'login';

const authClient = window.PLANTSPACE_CONFIG?.supabaseUrl && window.PLANTSPACE_CONFIG?.supabaseAnonKey
  ? window.supabase.createClient(window.PLANTSPACE_CONFIG.supabaseUrl, window.PLANTSPACE_CONFIG.supabaseAnonKey)
  : null;

const authMessage = document.getElementById('authMessage');
const submitButton = document.getElementById('submitAuth');
let signupStep = 1;

function showMessage(message, kind = '') {
  authMessage.textContent = message;
  authMessage.className = `form-message ${kind}`.trim();
}

function setMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  if (signup) signupStep = 1;
  document.getElementById('authProgress').hidden = !signup;
  document.getElementById('authModeLink').innerHTML = signup
    ? 'Já tem uma conta? <strong>Entrar <span aria-hidden="true">→</span></strong>'
    : 'Novo por aqui? <strong>Criar conta <span aria-hidden="true">→</span></strong>';
  document.getElementById('authModeLink').href = signup ? '/login.html?mode=login' : '/login.html?mode=signup';
  document.getElementById('authEyebrow').textContent = signup ? 'PLANTSPACE · CUIDADO CONECTADO' : 'PLANTSPACE · SEU ESPAÇO DE CULTIVO';
  document.getElementById('authTitle').textContent = signup
    ? (signupStep === 1 ? 'Vamos começar pelo seu nome.' : 'Como podemos falar com você?')
    : 'Entre no seu jardim.';
  document.getElementById('authSubtitle').textContent = signup
    ? (signupStep === 1 ? 'Seu nome e WhatsApp ajudam a preparar seu espaço de cultivo.' : 'Crie seus dados de acesso para acompanhar suas plantas em qualquer dispositivo.')
    : 'Acesse suas plantas, leituras e avisos em um só lugar.';
  document.getElementById('loginFields').hidden = signup;
  document.getElementById('signupStepLabel').hidden = !signup;
  document.getElementById('signupNavigation').hidden = !signup;
  document.getElementById('signupStepOne').hidden = !signup || signupStep !== 1;
  document.getElementById('signupStepTwo').hidden = !signup || signupStep !== 2;
  document.getElementById('phoneNote').hidden = !signup || signupStep !== 1;
  document.getElementById('email').required = !signup;
  document.getElementById('password').required = !signup;
  document.getElementById('fullName').required = false;
  document.getElementById('phone').required = false;
  document.getElementById('signupEmail').required = false;
  document.getElementById('signupPassword').required = false;
  submitButton.hidden = signup;
  updateSignupProgress();
  submitButton.textContent = 'Entrar';
  showMessage('');
}

function updateSignupProgress() {
  const signup = authMode === 'signup';
  if (signup) {
    document.getElementById('authEyebrow').textContent = 'PLANTSPACE · CUIDADO CONECTADO';
    document.getElementById('authTitle').textContent = signupStep === 1 ? 'Vamos começar pelo seu nome.' : 'Como podemos falar com você?';
    document.getElementById('authSubtitle').textContent = signupStep === 1
      ? 'Seu nome e WhatsApp ajudam a preparar seu espaço de cultivo.'
      : 'Crie seus dados de acesso para acompanhar suas plantas em qualquer dispositivo.';
  }
  document.getElementById('signupStepOne').hidden = !signup || signupStep !== 1;
  document.getElementById('signupStepTwo').hidden = !signup || signupStep !== 2;
  document.getElementById('signupStepLabel').textContent = `ETAPA ${signupStep} DE 2`;
  document.getElementById('signupProgressFill').style.width = signupStep === 1 ? '50%' : '100%';
  document.getElementById('signupNext').innerHTML = signupStep === 1
    ? 'Continuar <span aria-hidden="true">→</span>'
    : 'Criar minha conta <span aria-hidden="true">→</span>';
  document.getElementById('signupBack').hidden = signupStep === 1;
  document.getElementById('fullName').required = signup && signupStep === 1;
  document.getElementById('phone').required = signup && signupStep === 1;
  document.getElementById('signupEmail').required = signup && signupStep === 2;
  document.getElementById('signupPassword').required = signup && signupStep === 2;
  document.getElementById('phoneNote').hidden = !signup || signupStep !== 1;
  document.getElementById('email').required = !signup;
  document.getElementById('password').required = !signup;
}

function nextSignupStep() {
  if (signupStep === 1) {
    const name = document.getElementById('fullName');
    const phone = document.getElementById('phone');
    if (!name.reportValidity() || !phone.reportValidity()) return;
    if (!/^\+[1-9]\d{7,14}$/.test(phone.value.trim())) {
      showMessage('Informe o WhatsApp com código do país, por exemplo +5511999999999.', 'is-error');
      phone.focus();
      return;
    }
    signupStep = 2;
    updateSignupProgress();
    showMessage('');
    document.getElementById('signupEmail').focus();
    return;
  }
  document.getElementById('authForm').requestSubmit();
}

document.getElementById('signupNext').addEventListener('click', nextSignupStep);
document.getElementById('signupBack').addEventListener('click', () => {
  signupStep = 1;
  updateSignupProgress();
  showMessage('');
});

for (const [buttonId, inputId] of [['toggleSignupPassword', 'signupPassword'], ['toggleLoginPassword', 'password']]) {
  document.getElementById(buttonId).addEventListener('click', () => {
    const input = document.getElementById(inputId);
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    document.getElementById(buttonId).textContent = reveal ? 'Ocultar' : 'Mostrar';
    document.getElementById(buttonId).setAttribute('aria-label', reveal ? 'Ocultar senha' : 'Mostrar senha');
  });
}

document.getElementById('signupPassword').addEventListener('input', (event) => {
  const valid = event.target.value.length >= 8;
  document.getElementById('passwordHint').textContent = valid ? 'Senha com tamanho válido.' : 'Use no mínimo 8 caracteres.';
  document.getElementById('passwordHint').classList.toggle('is-valid', valid);
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

document.getElementById('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authMode === 'signup' && signupStep === 1) {
    nextSignupStep();
    return;
  }
  if (!authClient) {
    showMessage('O acesso ainda está sendo configurado. Tente novamente mais tarde.', 'is-error');
    return;
  }

  submitButton.disabled = true;
  showMessage(authMode === 'signup' ? 'Criando sua conta…' : 'Entrando…');
  const email = (authMode === 'signup' ? document.getElementById('signupEmail') : document.getElementById('email')).value.trim();
  const password = (authMode === 'signup' ? document.getElementById('signupPassword') : document.getElementById('password')).value;

  try {
    if (authMode === 'signup') {
      const name = document.getElementById('fullName').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const { data, error } = await authClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, whatsapp_phone: phone } },
      });
      if (error) throw error;
      if (data.session) {
        window.location.assign('/dashboard.html');
      } else {
        showMessage('A conta foi criada, mas a confirmação por e-mail ainda está ativa no Supabase.', 'is-info');
      }
    } else {
      const { error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.assign('/dashboard.html');
    }
  } catch (error) {
    showMessage(error.message || 'Não foi possível concluir o acesso.', 'is-error');
  } finally {
    submitButton.disabled = false;
  }
});

const requestedMode = new URLSearchParams(window.location.search).get('mode');
if (requestedMode === 'signup') setMode('signup');
if (!authClient) showMessage('Cadastro e login serão ativados após conectar o projeto Supabase.', 'is-info');
