const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const portrait = document.querySelector('.portrait');
const drivePanel = document.querySelector('.download-box');

// Replace this with an OAuth 2.0 Web application Client ID from Google Cloud.
const GOOGLE_CLIENT_ID = '674912689892-qbsuo8r9hri5psg9aceh6bnef9iq1uok.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
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
  if (!drivePanel || !drivePanel.querySelector('.google-login')) return;

  const loginButton = drivePanel.querySelector('.google-login');
  const logoutButton = drivePanel.querySelector('.drive-logout');
  const refreshButton = drivePanel.querySelector('.drive-refresh');
  const account = drivePanel.querySelector('.drive-account');
  const uploadPanel = drivePanel.querySelector('.drive-upload');
  const fileInput = drivePanel.querySelector('#drive-file-input');
  const uploadButton = drivePanel.querySelector('.drive-upload-button');
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
    uploadPanel.hidden = false;
    status.textContent = 'Carregando arquivos...';
    await loadDriveFiles();
  }

  async function loadDriveFiles() {
    fileList.replaceChildren();
    const files = [];
    let pageToken = '';
    try {
      do {
        const params = new URLSearchParams({
          q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
          orderBy: 'modifiedTime desc',
          pageSize: '100',
          fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canDownload))'
        });
        if (pageToken) params.set('pageToken', pageToken);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { Authorization: `Bearer ${driveAccessToken}` }
        });
        if (!response.ok) {
          if (response.status === 403) throw new Error('Drive access denied');
          throw new Error('Drive request failed');
        }
        const data = await response.json();
        files.push(...(data.files || []));
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      renderDriveFiles(files);
    } catch (error) {
      status.textContent = error.message === 'Drive access denied'
        ? 'Acesso negado. Verifique a Google Drive API e as permissões OAuth.'
        : 'Não foi possível carregar seus arquivos. Atualize e tente novamente.';
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
      action.href = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.textContent = 'Abrir ↗';
      const actions = document.createElement('div');
      actions.className = 'drive-file-actions';
      actions.append(action);
      if (file.capabilities?.canDownload !== false) {
        const downloadButton = document.createElement('button');
        downloadButton.className = 'drive-file-action';
        downloadButton.type = 'button';
        downloadButton.textContent = 'Baixar ↓';
        downloadButton.addEventListener('click', () => downloadDriveFile(file, downloadButton));
        actions.append(downloadButton);
      }
      item.append(info, actions);
      fileList.append(item);
    });
  }

  async function downloadDriveFile(file, button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Baixando...';
    const googleExportTypes = {
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.presentation': 'application/pdf'
    };
    const exportType = googleExportTypes[file.mimeType];
    const endpoint = exportType
      ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportType)}`
      : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${driveAccessToken}` } });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = exportType ? `${file.name}.pdf` : file.name;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      status.textContent = `Não foi possível baixar ${file.name}.`;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function uploadDriveFiles() {
    const files = [...fileInput.files];
    if (!files.length) return;
    uploadButton.disabled = true;
    status.textContent = `Enviando ${files.length} arquivo${files.length === 1 ? '' : 's'}...`;
    try {
      for (const file of files) {
        const boundary = `drive-upload-${Date.now()}`;
        const metadata = JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream' });
        const body = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
          `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
          file,
          `\r\n--${boundary}--`
        ], { type: `multipart/related; boundary=${boundary}` });
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${driveAccessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body
        });
        if (!response.ok) throw new Error('Upload failed');
      }
      fileInput.value = '';
      status.textContent = 'Upload concluído. Lista atualizada.';
      await loadDriveFiles();
    } catch (error) {
      status.textContent = 'Não foi possível enviar os arquivos selecionados.';
    } finally {
      uploadButton.disabled = true;
    }
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
    if (driveTokenClient) driveTokenClient.requestAccessToken({ prompt: 'consent' });
    else status.textContent = 'O login do Google ainda está carregando. Tente novamente em instantes.';
  });
  refreshButton.addEventListener('click', loadDriveFiles);
  fileInput.addEventListener('change', () => {
    uploadButton.disabled = fileInput.files.length === 0;
  });
  uploadButton.addEventListener('click', uploadDriveFiles);
  logoutButton.addEventListener('click', () => {
    if (driveAccessToken) window.google.accounts.oauth2.revoke(driveAccessToken);
    driveAccessToken = '';
    loginButton.hidden = false;
    account.hidden = true;
    refreshButton.hidden = true;
    uploadPanel.hidden = true;
    fileInput.value = '';
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

