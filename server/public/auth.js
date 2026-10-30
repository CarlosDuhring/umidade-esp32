let authMode = 'login';

const authClient = window.PLANTSPACE_CONFIG?.supabaseUrl && window.PLANTSPACE_CONFIG?.supabaseAnonKey
  ? window.supabase.createClient(window.PLANTSPACE_CONFIG.supabaseUrl, window.PLANTSPACE_CONFIG.supabaseAnonKey)
  : null;

const authMessage = document.getElementById('authMessage');
const submitButton = document.getElementById('submitAuth');

function showMessage(message, kind = '') {
  authMessage.textContent = message;
  authMessage.className = `form-message ${kind}`.trim();
}

function setMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.getElementById('loginTab').classList.toggle('is-active', !signup);
  document.getElementById('signupTab').classList.toggle('is-active', signup);
  document.getElementById('loginTab').setAttribute('aria-selected', String(!signup));
  document.getElementById('signupTab').setAttribute('aria-selected', String(signup));
  document.getElementById('nameField').hidden = !signup;
  document.getElementById('phoneField').hidden = !signup;
  document.getElementById('phoneNote').hidden = !signup;
  document.getElementById('fullName').required = signup;
  document.getElementById('phone').required = signup;
  document.getElementById('password').autocomplete = signup ? 'new-password' : 'current-password';
  submitButton.textContent = signup ? 'Criar conta' : 'Entrar';
  showMessage('');
}

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

document.getElementById('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authClient) {
    showMessage('O acesso ainda está sendo configurado. Tente novamente mais tarde.', 'is-error');
    return;
  }

  submitButton.disabled = true;
  showMessage(authMode === 'signup' ? 'Criando sua conta…' : 'Entrando…');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    if (authMode === 'signup') {
      const name = document.getElementById('fullName').value.trim();
      const phone = document.getElementById('phone').value.trim();
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        showMessage('Informe o WhatsApp com código do país, por exemplo +5511999999999.', 'is-error');
        return;
      }
      const { data, error } = await authClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, whatsapp_phone: phone } },
      });
      if (error) throw error;
      if (data.session) {
        window.location.assign('/dashboard.html');
      } else {
        showMessage('Conta criada. Verifique seu e-mail para confirmar o acesso.', 'is-success');
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
