const GOOGLE_CLIENT_ID = '674912689892-qbsuo8r9hri5psg9aceh6bnef9iq1uok.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

const loginButton = document.querySelector('.google-login');
const logoutButton = document.querySelector('.drive-logout');
const refreshButton = document.querySelector('.drive-refresh');
const searchInput = document.querySelector('#drive-search');
const fileInput = document.querySelector('#drive-file-input');
const uploadButton = document.querySelector('.drive-upload-button');
const status = document.querySelector('.drive-status');
const fileGrid = document.querySelector('.drive-file-grid');
const setupNote = document.querySelector('.drive-setup-note');
const previewDialog = document.querySelector('.drive-preview-dialog');
const previewTitle = document.querySelector('.preview-title');
const previewContent = document.querySelector('.preview-content');
const uploadZone = document.querySelector('.drive-upload-zone');
let driveAccessToken = '';
let driveTokenClient;
let allFiles = [];

function setControls(enabled) {
  searchInput.disabled = !enabled;
  refreshButton.disabled = !enabled;
  fileInput.disabled = !enabled;
}

function showError(message) {
  status.textContent = message;
}

function setupDrive() {
  if (!GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    loginButton.hidden = true;
    setupNote.hidden = false;
    showError('O painel precisa de um Client ID do Google Cloud para funcionar.');
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

  loginButton.addEventListener('click', () => {
    if (driveTokenClient) {
      driveTokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      showError('O login do Google ainda está carregando. Tente novamente em instantes.');
    }
  });
}

async function handleDriveToken(response) {
  if (response.error) {
    showError('Não foi possível conectar ao Google. Verifique os usuários de teste e tente novamente.');
    return;
  }
  driveAccessToken = response.access_token;
  loginButton.hidden = true;
  logoutButton.hidden = false;
  setControls(true);
  await loadDriveFiles();
}

async function driveRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${driveAccessToken}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error('Acesso negado. Confirme a Google Drive API e o escopo drive no OAuth.');
    if (response.status === 401) throw new Error('Sua sessão expirou. Entre novamente com o Google.');
    throw new Error(`Drive request failed: ${response.status}`);
  }
  return response;
}

async function loadDriveFiles() {
  fileGrid.replaceChildren();
  status.textContent = 'Carregando arquivos...';
  allFiles = [];
  let pageToken = '';
  try {
    do {
      const params = new URLSearchParams({
        q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
        orderBy: 'modifiedTime desc',
        pageSize: '100',
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canDownload,canEdit,canTrash))'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`)).json();
      allFiles.push(...(data.files || []));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    renderFiles();
  } catch (error) {
    showError(error.message.includes('Drive request failed')
      ? 'Não foi possível carregar seus arquivos. Verifique a configuração do Google Cloud.'
      : error.message);
  }
}

function renderFiles() {
  const query = searchInput.value.trim().toLowerCase();
  const files = allFiles.filter((file) => file.name.toLowerCase().includes(query));
  fileGrid.replaceChildren();
  status.textContent = files.length
    ? `${files.length} arquivo${files.length === 1 ? '' : 's'} encontrado${files.length === 1 ? '' : 's'}.`
    : (query ? 'Nenhum arquivo corresponde à busca.' : 'Nenhum arquivo disponível nesta conta.');
  files.forEach((file) => fileGrid.append(createFileCard(file)));
}

function createFileCard(file) {
  const card = document.createElement('article');
  card.className = 'drive-file-card';
  const icon = document.createElement('span');
  icon.className = 'drive-file-icon';
  icon.textContent = fileIcon(file.mimeType);
  icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('strong');
  name.textContent = file.name;
  name.title = file.name;
  const metadata = document.createElement('span');
  metadata.textContent = `${formatFileType(file)} · ${new Date(file.modifiedTime).toLocaleDateString('pt-BR')}`;
  const info = document.createElement('div');
  info.className = 'drive-file-info';
  info.append(name, metadata);
  const actions = document.createElement('div');
  actions.className = 'drive-card-actions';
  const previewButton = actionButton('Visualizar', () => previewFile(file));
  const downloadButton = actionButton('Baixar', () => downloadFile(file, downloadButton));
  actions.append(previewButton);
  if (file.capabilities?.canDownload !== false) actions.append(downloadButton);
  if (file.capabilities?.canEdit) actions.append(actionButton('Renomear', () => renameFile(file)));
  if (file.capabilities?.canTrash) actions.append(actionButton('Excluir', () => deleteFile(file), 'danger'));
  card.append(icon, info, actions);
  return card;
}

function actionButton(label, handler, extraClass = '') {
  const button = document.createElement('button');
  button.className = `drive-card-action ${extraClass}`;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function fileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.startsWith('video/')) return 'VID';
  if (mimeType.startsWith('audio/')) return 'AUD';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('document')) return 'DOC';
  if (mimeType.includes('spreadsheet')) return 'XLS';
  if (mimeType.includes('presentation')) return 'PPT';
  return 'FILE';
}

function formatFileType(file) {
  if (file.size) return formatBytes(Number(file.size));
  return fileIcon(file.mimeType);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function downloadFile(file, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '...';
  const exports = {
    'application/vnd.google-apps.document': ['application/pdf', '.pdf'],
    'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
    'application/vnd.google-apps.presentation': ['application/pdf', '.pdf']
  };
  const exportData = exports[file.mimeType];
  const endpoint = exportData
    ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportData[0])}`
    : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  try {
    const blob = await (await driveRequest(endpoint)).blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = exportData ? `${file.name}${exportData[1]}` : file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    showError(`Não foi possível baixar ${file.name}.`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function uploadFiles() {
  const files = [...fileInput.files];
  if (!files.length) return;
  uploadButton.disabled = true;
  status.textContent = `Enviando ${files.length} arquivo${files.length === 1 ? '' : 's'}...`;
  try {
    for (const file of files) {
      const boundary = `drive-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const mimeType = file.type || 'application/octet-stream';
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: file.name, mimeType })}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, file,
        `\r\n--${boundary}--`
      ], { type: `multipart/related; boundary=${boundary}` });
      await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      });
    }
    fileInput.value = '';
    status.textContent = 'Upload concluído. Atualizando a lista...';
    await loadDriveFiles();
  } catch (error) {
    showError(`Não foi possível enviar os arquivos. ${error.message}`);
  } finally {
    uploadButton.disabled = true;
  }
}

async function renameFile(file) {
  const newName = window.prompt('Novo nome do arquivo:', file.name);
  if (!newName || newName === file.name) return;
  try {
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    await loadDriveFiles();
  } catch (error) {
    showError(`Não foi possível renomear ${file.name}.`);
  }
}

async function deleteFile(file) {
  if (!window.confirm(`Excluir "${file.name}" do Google Drive?`)) return;
  try {
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}`, { method: 'DELETE' });
    await loadDriveFiles();
  } catch (error) {
    showError(`Não foi possível excluir ${file.name}.`);
  }
}

async function previewFile(file) {
  previewTitle.textContent = file.name;
  previewContent.replaceChildren();
  previewDialog.showModal();
  const googleTypes = file.mimeType.startsWith('application/vnd.google-apps.');
  if (googleTypes) {
    const link = document.createElement('a');
    link.href = file.webViewLink || `https://drive.google.com/open?id=${file.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'button primary';
    link.textContent = 'Abrir no Google Drive';
    previewContent.append(link);
    return;
  }
  try {
    const blob = await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)).blob();
    const url = URL.createObjectURL(blob);
    if (file.mimeType.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = file.name;
      previewContent.append(image);
    } else if (file.mimeType === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = file.name;
      previewContent.append(frame);
    } else if (file.mimeType.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      previewContent.append(video);
    } else if (file.mimeType.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      previewContent.append(audio);
    } else if (file.mimeType.startsWith('text/')) {
      const text = document.createElement('pre');
      text.textContent = await blob.text();
      previewContent.append(text);
    } else {
      previewContent.textContent = 'A visualização não está disponível para este formato.';
    }
  } catch (error) {
    previewContent.textContent = 'Não foi possível visualizar este arquivo.';
  }
}

logoutButton.addEventListener('click', () => {
  if (driveAccessToken) window.google.accounts.oauth2.revoke(driveAccessToken);
  driveAccessToken = '';
  allFiles = [];
  fileGrid.replaceChildren();
  loginButton.hidden = false;
  logoutButton.hidden = true;
  setControls(false);
  uploadButton.disabled = true;
  status.textContent = 'Entre com sua conta Google para carregar seus arquivos.';
});
refreshButton.addEventListener('click', loadDriveFiles);
searchInput.addEventListener('input', renderFiles);
fileInput.addEventListener('change', () => { uploadButton.disabled = fileInput.files.length === 0; });
uploadButton.addEventListener('click', uploadFiles);
['dragenter', 'dragover'].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add('is-dragging');
  });
});
['dragleave', 'drop'].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove('is-dragging');
  });
});
uploadZone.addEventListener('drop', (event) => {
  if (!fileInput.disabled && event.dataTransfer.files.length) {
    fileInput.files = event.dataTransfer.files;
    uploadButton.disabled = false;
  }
});
document.querySelector('.preview-close').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('click', (event) => {
  if (event.target === previewDialog) previewDialog.close();
});

setControls(false);
setupDrive();
