const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const portrait = document.querySelector('.portrait');
const drivePanel = document.querySelector('.download-box');

// Replace this with an OAuth 2.0 Web application Client ID from Google Cloud.
const GOOGLE_CLIENT_ID = '674912689892-qbsuo8r9hri5psg9aceh6bnef9iq1uok.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
let driveAccessToken = '';
let driveTokenClient;

emailjs.init({ publicKey: 'uqSzhDf6aXpDCp5QP' });

if (portrait) {
  const portraitFrame = document.createElement('div');
  portraitFrame.className = 'portrait-frame';
  portrait.before(portraitFrame);
  portraitFrame.appendChild(portrait);
}

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', isOpen);
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

const contactForm = document.querySelector('#contact-form');

function setupDrive() {
  if (!drivePanel) return;

  const loginButton = drivePanel.querySelector('.google-login');
  const logoutButton = drivePanel.querySelector('.drive-logout');
  const refreshButton = drivePanel.querySelector('.drive-refresh');
  const account = drivePanel.querySelector('.drive-account');
  const status = drivePanel.querySelector('.drive-status');
  const fileList = drivePanel.querySelector('.download-list');
  const setupNote = drivePanel.querySelector('.drive-setup-note');

  if (!GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    loginButton.hidden = true;
    setupNote.hidden = false;
    status.textContent = 'O painel precisa de um Client ID do Google Cloud para funcionar.';
    return;
  }

  const waitForGoogle = window.setInterval(() => {
    if (!window.google?.accounts?.oauth2) return;
    window.clearInterval(waitForGoogle);
    driveTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: handleDriveToken
    });
  }, 100);

  async function handleDriveToken(response) {
    if (response.error) {
      status.textContent = 'Não foi possível conectar ao Google. Tente novamente.';
      return;
    }
    driveAccessToken = response.access_token;
    loginButton.hidden = true;
    account.hidden = false;
    refreshButton.hidden = false;
    status.textContent = 'Carregando arquivos...';
    await loadDriveFiles();
  }

  async function loadDriveFiles() {
    fileList.replaceChildren();
    const params = new URLSearchParams({
      q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
      orderBy: 'modifiedTime desc',
      pageSize: '30',
      fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)'
    });
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${driveAccessToken}` }
      });
      if (!response.ok) throw new Error('Drive request failed');
      const data = await response.json();
      renderDriveFiles(data.files || []);
    } catch (error) {
      status.textContent = 'Não foi possível carregar seus arquivos. Atualize e tente novamente.';
    }
  }

  function renderDriveFiles(files) {
    fileList.replaceChildren();
    if (!files.length) {
      status.textContent = 'Nenhum arquivo disponível nesta conta.';
      return;
    }
    status.textContent = `${files.length} arquivo${files.length === 1 ? '' : 's'} encontrado${files.length === 1 ? '' : 's'}.`;
    files.forEach((file) => {
      const item = document.createElement('div');
      item.className = 'download-item';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = file.name;
      const metadata = document.createElement('span');
      metadata.textContent = formatFileMetadata(file);
      info.append(name, metadata);
      const action = document.createElement('a');
      action.className = 'drive-file-action';
      action.href = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.textContent = 'Abrir ↗';
      item.append(info, action);
      fileList.append(item);
    });
  }

  function formatFileMetadata(file) {
    const date = new Date(file.modifiedTime).toLocaleDateString('pt-BR');
    const size = file.size ? ` · ${formatBytes(Number(file.size))}` : '';
    return `Atualizado em ${date}${size}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  loginButton.addEventListener('click', () => {
    if (driveTokenClient) driveTokenClient.requestAccessToken();
    else status.textContent = 'O login do Google ainda está carregando. Tente novamente em instantes.';
  });
  refreshButton.addEventListener('click', loadDriveFiles);
  logoutButton.addEventListener('click', () => {
    if (driveAccessToken) window.google.accounts.oauth2.revoke(driveAccessToken);
    driveAccessToken = '';
    loginButton.hidden = false;
    account.hidden = true;
    refreshButton.hidden = true;
    fileList.replaceChildren();
    status.textContent = 'Entre com sua conta Google para carregar os arquivos.';
  });
}

setupDrive();

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const status = contactForm.querySelector('.form-status');
  const replyTo = contactForm.querySelector('[name="reply_to"]');
  const email = contactForm.querySelector('[name="email"]');
  const name = contactForm.querySelector('[name="name"]');
  const message = contactForm.querySelector('[name="message"]');

  replyTo.value = email.value;

  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';
  status.textContent = '';

  try {
    await emailjs.send('service_8mokl9i', 'template_2upz7sn', {
      name: name.value,
      email: email.value,
      from_email: email.value,
      reply_to: email.value,
      message: message.value
    });
    contactForm.reset();
    status.textContent = 'Mensagem enviada com sucesso.';
  } catch (error) {
    status.textContent = 'Não foi possível enviar agora. Tente novamente.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar mensagem ao Matheus';
  }
});

