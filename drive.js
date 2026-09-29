const GOOGLE_CLIENT_ID = '674912689892-qbsuo8r9hri5psg9aceh6bnef9iq1uok.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const REMEMBER_LOGIN_KEY = 'drive-login-expiration';
const REMEMBER_LOGIN_DURATION = 30 * 24 * 60 * 60 * 1000;
const DRIVE_SESSION_EXPIRED = 'drive-session-expired';

const loginButton = document.querySelector('.google-login');
const logoutButton = document.querySelector('.drive-logout');
const refreshButton = document.querySelector('.drive-refresh');
const searchInput = document.querySelector('#drive-search');
const fileInput = document.querySelector('#drive-file-input');
const filePickerButton = document.querySelector('.drive-file-picker');
const uploadButton = document.querySelector('.drive-upload-button');
const storageUsageLabel = document.querySelector('.drive-storage-usage');
const storageDetail = document.querySelector('.drive-storage-detail');
const storageBar = document.querySelector('.storage-bar');
const storageFill = document.querySelector('.drive-storage-fill');
const rememberLoginCheckbox = document.querySelector('.drive-remember-checkbox');
const rememberLoginLabel = document.querySelector('.drive-remember-login');
const status = document.querySelector('.drive-status');
const fileGrid = document.querySelector('.drive-file-grid');
const folderGrid = document.querySelector('.drive-folder-grid');
const folderBreadcrumb = document.querySelector('.drive-breadcrumb');
const createFolderButton = document.querySelector('.drive-create-folder');
const setupNote = document.querySelector('.drive-setup-note');
const previewDialog = document.querySelector('.drive-preview-dialog');
const previewTitle = document.querySelector('.preview-title');
const previewContent = document.querySelector('.preview-content');
const previewTools = document.querySelector('.preview-tools');
const previewZoomLevel = document.querySelector('.preview-zoom-level');
const uploadZone = document.querySelector('.drive-upload-zone');
let driveAccessToken = '';
let driveTokenClient;
let restoringLogin = false;
let allFiles = [];
let allFolders = [];
let currentFolderId = 'root';
let folderPath = [];
let previewObjectUrl = '';
let previewImageZoom = 1;

function setControls(enabled) {
  searchInput.disabled = !enabled;
  refreshButton.disabled = !enabled;
  fileInput.disabled = !enabled;
  filePickerButton.disabled = !enabled;
  createFolderButton.disabled = !enabled;
}

function getRememberedLoginExpiry() {
  try {
    return Number(localStorage.getItem(REMEMBER_LOGIN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function clearRememberedLogin() {
  try {
    localStorage.removeItem(REMEMBER_LOGIN_KEY);
  } catch {
    return;
  }
}

function rememberLoginForDevice() {
  if (!rememberLoginCheckbox.checked) {
    clearRememberedLogin();
    return;
  }
  try {
    localStorage.setItem(REMEMBER_LOGIN_KEY, String(Date.now() + REMEMBER_LOGIN_DURATION));
  } catch {
    showError('Não foi possível salvar a preferência de acesso neste dispositivo.');
  }
}

function restoreRememberedLogin() {
  const expiresAt = getRememberedLoginExpiry();
  if (!expiresAt) return;
  if (expiresAt <= Date.now() || !rememberLoginCheckbox.checked) {
    clearRememberedLogin();
    return;
  }
  requestSilentDriveToken();
}

function resetStorageUsage(message = 'Conecte-se para consultar') {
  storageUsageLabel.textContent = message;
  storageDetail.textContent = 'Cota da conta Google';
  storageFill.style.width = '0%';
  storageBar.setAttribute('aria-valuenow', '0');
  storageBar.setAttribute('aria-valuetext', message);
}

function resetDriveSession(message = 'Entre com sua conta Google para carregar seus arquivos.') {
  driveAccessToken = '';
  allFiles = [];
  allFolders = [];
  currentFolderId = 'root';
  folderPath = [];
  searchInput.value = '';
  fileInput.value = '';
  fileGrid.replaceChildren();
  folderGrid.replaceChildren();
  folderBreadcrumb.replaceChildren();
  loginButton.hidden = false;
  loginButton.disabled = false;
  rememberLoginLabel.hidden = false;
  logoutButton.hidden = true;
  setControls(false);
  uploadButton.disabled = true;
  status.textContent = message;
  resetStorageUsage();
}

function requestSilentDriveToken() {
  if (!driveTokenClient) return;
  restoringLogin = true;
  loginButton.disabled = true;
  status.textContent = 'Reconectando ao Google...';
  try {
    driveTokenClient.requestAccessToken({ prompt: '' });
  } catch {
    restoringLogin = false;
    clearRememberedLogin();
    resetDriveSession('Não foi possível restaurar o acesso automaticamente. Entre novamente com o Google.');
  }
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

  let googleLoadAttempts = 0;
  const waitForGoogle = window.setInterval(() => {
    if (!window.google?.accounts?.oauth2) {
      googleLoadAttempts += 1;
      if (googleLoadAttempts >= 50) {
        window.clearInterval(waitForGoogle);
        loginButton.disabled = true;
        showError('Não foi possível carregar o login do Google. Verifique sua conexão e recarregue a página.');
      }
      return;
    }
    window.clearInterval(waitForGoogle);
    driveTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: handleDriveToken
    });
    restoreRememberedLogin();
  }, 100);

  loginButton.addEventListener('click', () => {
    if (driveTokenClient) {
      restoringLogin = false;
      driveTokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      showError('O login do Google ainda está carregando. Tente novamente em instantes.');
    }
  });
}

async function handleDriveToken(response) {
  if (response.error) {
    if (restoringLogin) {
      restoringLogin = false;
      clearRememberedLogin();
      resetDriveSession('Não foi possível restaurar o acesso automaticamente. Entre novamente com o Google.');
      return;
    }
    showError(response.error === 'access_denied'
      ? 'Acesso recusado pelo Google. Confirme se sua conta está nos usuários de teste do OAuth.'
      : `Não foi possível conectar ao Google${response.error_description ? `: ${response.error_description}` : '.'}`);
    return;
  }
  restoringLogin = false;
  loginButton.disabled = false;
  driveAccessToken = response.access_token;
  rememberLoginForDevice();
  loginButton.hidden = true;
  rememberLoginLabel.hidden = true;
  logoutButton.hidden = false;
  setControls(true);
  await Promise.all([loadDriveFiles(), loadStorageUsage()]);
}

async function loadStorageUsage() {
  storageUsageLabel.textContent = 'Consultando...';
  try {
    const params = new URLSearchParams({ fields: 'storageQuota(limit,usage,usageInDrive)' });
    const response = await driveRequest(`https://www.googleapis.com/drive/v3/about?${params}`);
    const quota = (await response.json()).storageQuota;
    if (!quota) throw new Error('Cota indisponível');

    const totalUsed = Number(quota.usage ?? quota.usageInDrive ?? 0);
    const driveUsed = Number(quota.usageInDrive ?? totalUsed);
    const limit = Number(quota.limit);
    const hasLimit = Number.isFinite(limit) && limit > 0;
    const percentage = hasLimit ? Math.min(100, (totalUsed / limit) * 100) : 0;
    storageUsageLabel.textContent = hasLimit
      ? `${formatBytes(totalUsed)} / ${formatBytes(limit)}`
      : `${formatBytes(totalUsed)} usados`;
    storageDetail.textContent = `No Drive: ${formatBytes(driveUsed)}`;
    storageFill.style.width = `${percentage}%`;
    storageFill.style.background = percentage >= 90 ? '#db6d63' : percentage >= 75 ? '#e8b15e' : 'var(--orange)';
    storageBar.setAttribute('aria-valuenow', String(Math.round(percentage)));
    storageBar.setAttribute('aria-valuetext', hasLimit
      ? `${formatBytes(totalUsed)} usados de ${formatBytes(limit)}`
      : `${formatBytes(totalUsed)} usados`);
  } catch (error) {
    if (error.code === DRIVE_SESSION_EXPIRED) return;
    storageUsageLabel.textContent = 'Indisponível';
    storageDetail.textContent = 'Não foi possível consultar a cota da conta.';
    storageFill.style.width = '0%';
    storageBar.setAttribute('aria-valuenow', '0');
    storageBar.setAttribute('aria-valuetext', 'Cota indisponível');
  }
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
    let errorData = null;
    try {
      errorData = await response.clone().json();
    } catch {
      errorData = null;
    }
    if (response.status === 403) throw new Error(formatDrivePermissionError(errorData));
    if (response.status === 401) {
      const error = new Error('Sua sessão expirou. Entre novamente com o Google.');
      error.code = DRIVE_SESSION_EXPIRED;
      resetDriveSession(error.message);
      throw error;
    }
    throw new Error(`Drive request failed: ${response.status}`);
  }
  return response;
}

function formatDrivePermissionError(errorData) {
  const reason = errorData?.error?.errors?.[0]?.reason;
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') {
    return 'A Google Drive API está desativada neste projeto. Ative-a no Google Cloud e tente novamente.';
  }
  if (reason === 'insufficientPermissions') {
    return 'O token não recebeu o escopo drive. Saia, entre novamente e aceite a permissão para acessar o Google Drive.';
  }
  if (reason === 'dailyLimitExceeded' || reason === 'quotaExceeded') {
    return 'A cota da Google Drive API foi excedida. Verifique as cotas do projeto no Google Cloud.';
  }
  return 'Acesso negado pela Google Drive API. Confirme se a API está ativa e se o escopo drive foi autorizado no OAuth.';
}

async function loadDriveFiles() {
  fileGrid.replaceChildren();
  folderGrid.replaceChildren();
  status.textContent = 'Carregando esta pasta...';
  renderFolderBreadcrumb();
  const folderId = currentFolderId;
  const files = [];
  const folders = [];
  let pageToken = '';
  try {
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        orderBy: 'folder,name',
        pageSize: '100',
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canDownload,canEdit,canTrash))'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await (await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`)).json();
      (data.files || []).forEach((file) => {
        if (file.mimeType === 'application/vnd.google-apps.folder') folders.push(file);
        else files.push(file);
      });
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    if (folderId !== currentFolderId) return;
    allFiles = files;
    allFolders = folders;
    renderFolders();
    renderFiles();
  } catch (error) {
    if (error.code === DRIVE_SESSION_EXPIRED) return;
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

function renderFolderBreadcrumb() {
  folderBreadcrumb.replaceChildren();
  const rootButton = document.createElement('button');
  rootButton.type = 'button';
  rootButton.textContent = 'Meu Drive';
  rootButton.setAttribute('aria-current', folderPath.length ? 'false' : 'page');
  rootButton.addEventListener('click', () => navigateToFolder(-1));
  folderBreadcrumb.append(rootButton);

  folderPath.forEach((folder, index) => {
    const separator = document.createElement('span');
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '/';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = folder.name;
    if (index === folderPath.length - 1) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => navigateToFolder(index));
    folderBreadcrumb.append(separator, button);
  });
}

function navigateToFolder(pathIndex) {
  folderPath = folderPath.slice(0, pathIndex + 1);
  currentFolderId = folderPath.length ? folderPath[folderPath.length - 1].id : 'root';
  searchInput.value = '';
  loadDriveFiles();
}

function openFolder(folder) {
  folderPath.push({ id: folder.id, name: folder.name });
  currentFolderId = folder.id;
  searchInput.value = '';
  loadDriveFiles();
}

function createFolderCard(folder) {
  const card = document.createElement('article');
  card.className = 'drive-folder-card';
  const openButton = document.createElement('button');
  openButton.className = 'drive-folder-open';
  openButton.type = 'button';
  openButton.setAttribute('aria-label', `Abrir pasta ${folder.name}`);
  openButton.addEventListener('click', () => openFolder(folder));
  const icon = document.createElement('span');
  icon.className = 'folder-tab';
  icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('strong');
  name.textContent = folder.name;
  name.title = folder.name;
  const hint = document.createElement('small');
  hint.textContent = 'Abrir pasta';
  openButton.append(icon, name, hint);
  card.append(openButton);

  const actions = document.createElement('div');
  actions.className = 'drive-folder-actions';
  if (folder.capabilities?.canEdit) {
    actions.append(actionButton('Renomear', () => renameFolder(folder)));
  }
  if (folder.capabilities?.canTrash) {
    actions.append(actionButton('Lixeira', () => trashFolder(folder), 'danger'));
  }
  if (actions.childElementCount) card.append(actions);
  return card;
}

function renderFolders() {
  folderGrid.replaceChildren();
  if (!allFolders.length) {
    const empty = document.createElement('p');
    empty.className = 'drive-folder-empty';
    empty.textContent = 'Nenhuma pasta nesta localização.';
    folderGrid.append(empty);
    return;
  }
  allFolders.forEach((folder) => folderGrid.append(createFolderCard(folder)));
}

async function createFolder() {
  const name = window.prompt('Nome da nova pasta:')?.trim();
  if (!name) return;
  createFolderButton.disabled = true;
  try {
    await driveRequest('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [currentFolderId]
      })
    });
    await loadDriveFiles();
  } catch (error) {
    showError(`Não foi possível criar a pasta. ${error.message}`);
  } finally {
    createFolderButton.disabled = false;
  }
}

async function renameFolder(folder) {
  const name = window.prompt('Novo nome da pasta:', folder.name)?.trim();
  if (!name || name === folder.name) return;
  try {
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folder.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await loadDriveFiles();
  } catch (error) {
    showError(`Não foi possível renomear a pasta. ${error.message}`);
  }
}

async function trashFolder(folder) {
  if (!window.confirm(`Mover a pasta "${folder.name}" para a lixeira?`)) return;
  try {
    await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folder.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    await loadDriveFiles();
  } catch (error) {
    showError(`Não foi possível mover a pasta para a lixeira. ${error.message}`);
  }
}

function createFileCard(file) {
  const card = document.createElement('article');
  card.className = 'drive-file-card';
  const icon = document.createElement('span');
  icon.className = 'drive-file-icon';
  icon.classList.add(`drive-file-icon--${fileIconType(file)}`);
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
  const normalizedMimeType = (mimeType || '').toLowerCase();
  if (normalizedMimeType.startsWith('video/')) return 'VID';
  if (normalizedMimeType.startsWith('audio/')) return 'AUD';
  const labels = {
    document: 'DOC',
    image: 'IMG',
    pdf: 'PDF',
    presentation: 'PPT',
    spreadsheet: 'XLS',
    generic: 'FILE'
  };
  return labels[fileIconType({ mimeType: normalizedMimeType })];
}

function fileIconType(file) {
  const mimeType = (file.mimeType || '').toLowerCase();
  const extension = file.name?.split('.').pop()?.toLowerCase() || '';
  const hasExtension = (...extensions) => extensions.includes(extension);

  if (mimeType === 'application/pdf' || hasExtension('pdf')) return 'pdf';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')
    || hasExtension('ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'pot', 'potx', 'potm', 'odp', 'key')) return 'presentation';
  if (mimeType.includes('spreadsheet') || mimeType.includes('ms-excel')
    || mimeType.includes('opendocument.spreadsheet')
    || hasExtension('xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'xltm', 'csv', 'tsv', 'ods')) return 'spreadsheet';
  if (mimeType.includes('document') || mimeType.includes('msword')
    || mimeType.includes('opendocument.text')
    || hasExtension('doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'odt', 'rtf')) return 'document';
  if (mimeType.startsWith('image/')
    || hasExtension('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'avif', 'ico')) return 'image';
  return 'generic';
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
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: file.name, mimeType, parents: [currentFolderId] })}\r\n`,
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
    await loadStorageUsage();
  } catch (error) {
    showError(`Não foi possível enviar os arquivos. ${error.message}`);
  } finally {
    uploadButton.disabled = fileInput.files.length === 0;
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
    await loadStorageUsage();
  } catch (error) {
    showError(`Não foi possível excluir ${file.name}.`);
  }
}

function getPreviewKind(file) {
  const mimeType = (file.mimeType || '').toLowerCase();
  const extension = file.name?.split('.').pop()?.toLowerCase() || '';
  const hasExtension = (...extensions) => extensions.includes(extension);

  if (mimeType.startsWith('application/vnd.google-apps.')) return 'google';
  if (mimeType.startsWith('image/') || hasExtension('jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'avif')) return 'image';
  if (mimeType === 'application/pdf' || hasExtension('pdf')) return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('csv') || hasExtension('csv', 'tsv')) return 'table';
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.includes('spreadsheet') || mimeType.includes('ms-excel') || mimeType.includes('wordprocessingml')
    || mimeType.includes('msword') || mimeType.includes('presentation') || mimeType.includes('powerpoint')
    || mimeType.includes('opendocument')) return 'office';
  if (hasExtension('xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'xltm', 'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'pot', 'potx', 'potm', 'ods', 'odt', 'odp')) return 'office';
  return 'drive';
}

function setImageZoom(zoom) {
  previewImageZoom = Math.min(3, Math.max(.25, zoom));
  previewZoomLevel.textContent = `${Math.round(previewImageZoom * 100)}%`;
  const image = previewContent.querySelector('img');
  if (!image) return;
  if (previewImageZoom === 1) {
    image.style.width = '';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '70vh';
  } else {
    image.style.width = `${previewImageZoom * 100}%`;
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
  }
}

function clearPreview() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = '';
  previewContent.replaceChildren();
  previewTools.hidden = true;
  setImageZoom(1);
}

function createDriveOpenLink(file) {
  const link = document.createElement('a');
  link.href = file.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'preview-open-link';
  link.textContent = 'Abrir no Google Drive';
  return link;
}

function appendDrivePreview(file, message = '') {
  if (message) {
    const note = document.createElement('p');
    note.className = 'preview-message';
    note.textContent = message;
    previewContent.append(note);
  }
  const frame = document.createElement('iframe');
  frame.src = `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/preview`;
  frame.title = `Prévia de ${file.name}`;
  previewContent.append(frame, createDriveOpenLink(file));
}

function renderDelimitedTable(text, delimiter) {
  const rows = [[]];
  let value = '';
  let insideQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && insideQuotes && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      insideQuotes = !insideQuotes;
    } else if (character === delimiter && !insideQuotes) {
      rows[rows.length - 1].push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      rows[rows.length - 1].push(value);
      value = '';
      rows.push([]);
    } else {
      value += character;
    }
  }
  rows[rows.length - 1].push(value);
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.length));
  const visibleRows = nonEmptyRows.slice(0, 201);
  if (!visibleRows.length) {
    previewContent.textContent = 'Esta planilha não contém dados.';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'preview-table-wrap';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  visibleRows[0].forEach((cell) => {
    const header = document.createElement('th');
    header.textContent = cell;
    headerRow.append(header);
  });
  head.append(headerRow);
  const body = document.createElement('tbody');
  visibleRows.slice(1).forEach((row) => {
    const tableRow = document.createElement('tr');
    row.forEach((cell) => {
      const tableCell = document.createElement('td');
      tableCell.textContent = cell;
      tableRow.append(tableCell);
    });
    body.append(tableRow);
  });
  table.append(head, body);
  wrapper.append(table);
  if (nonEmptyRows.length > 201) {
    const note = document.createElement('p');
    note.className = 'preview-message';
    note.textContent = 'Mostrando as primeiras 200 linhas.';
    wrapper.append(note);
  }
  previewContent.append(wrapper);
}

async function previewFile(file) {
  clearPreview();
  previewTitle.textContent = file.name;
  previewDialog.showModal();
  const kind = getPreviewKind(file);
  previewTools.hidden = kind !== 'image';

  if (kind === 'google') {
    const exportable = /document|spreadsheet|presentation|drawing/.test(file.mimeType);
    if (!exportable) {
      appendDrivePreview(file);
      return;
    }
    try {
      const params = new URLSearchParams({ mimeType: 'application/pdf' });
      const response = await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?${params}`);
      previewObjectUrl = URL.createObjectURL(await response.blob());
      const frame = document.createElement('iframe');
      frame.src = previewObjectUrl;
      frame.title = `Prévia de ${file.name}`;
      previewContent.append(frame, createDriveOpenLink(file));
    } catch {
      appendDrivePreview(file, 'Não foi possível gerar a prévia PDF. Você ainda pode abrir o arquivo no Drive.');
    }
    return;
  }

  if (kind === 'office' || kind === 'drive') {
    appendDrivePreview(file);
    return;
  }

  try {
    const blob = await (await driveRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`)).blob();
    if (kind === 'table') {
      const delimiter = file.name.toLowerCase().endsWith('.tsv') ? '\t' : ',';
      renderDelimitedTable(await blob.text(), delimiter);
    } else if (kind === 'text') {
      const text = document.createElement('pre');
      text.textContent = await blob.text();
      previewContent.append(text);
    } else {
      previewObjectUrl = URL.createObjectURL(blob);
      if (kind === 'image') {
        const image = document.createElement('img');
        image.src = previewObjectUrl;
        image.alt = file.name;
        previewContent.append(image);
      } else if (kind === 'pdf') {
        const frame = document.createElement('iframe');
        frame.src = previewObjectUrl;
        frame.title = file.name;
        previewContent.append(frame);
      } else if (kind === 'video') {
        const video = document.createElement('video');
        video.src = previewObjectUrl;
        video.controls = true;
        previewContent.append(video);
      } else if (kind === 'audio') {
        const audio = document.createElement('audio');
        audio.src = previewObjectUrl;
        audio.controls = true;
        previewContent.append(audio);
      }
    }
  } catch {
    previewContent.textContent = 'Não foi possível visualizar este arquivo.';
  }
}

logoutButton.addEventListener('click', () => {
  if (driveAccessToken) window.google.accounts.oauth2.revoke(driveAccessToken);
  clearRememberedLogin();
  resetDriveSession();
});
rememberLoginCheckbox.addEventListener('change', () => {
  if (!rememberLoginCheckbox.checked) clearRememberedLogin();
});
refreshButton.addEventListener('click', () => {
  loadDriveFiles();
  loadStorageUsage();
});
document.querySelectorAll('.drive-nav a[href^="#"]').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.drive-nav a').forEach((item) => {
      item.classList.toggle('active', item === link);
    });
  });
});
createFolderButton.addEventListener('click', createFolder);
filePickerButton.addEventListener('click', () => fileInput.click());
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
previewDialog.addEventListener('close', clearPreview);
document.querySelector('.preview-zoom-out').addEventListener('click', () => setImageZoom(previewImageZoom - .25));
document.querySelector('.preview-zoom-in').addEventListener('click', () => setImageZoom(previewImageZoom + .25));
document.querySelector('.preview-zoom-reset').addEventListener('click', () => setImageZoom(1));
previewDialog.addEventListener('click', (event) => {
  if (event.target === previewDialog) previewDialog.close();
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && driveAccessToken && driveTokenClient) requestSilentDriveToken();
});

setControls(false);
setupDrive();
