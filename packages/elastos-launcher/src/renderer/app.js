// UI Elements
const statusLed = document.getElementById('status-led');
const statusText = document.getElementById('status-text');
const powerBtn = document.getElementById('power-btn');
const openBtn = document.getElementById('open-btn');
const logsBtn = document.getElementById('logs-btn');
const logsPanel = document.getElementById('logs-panel');
const logsContent = document.getElementById('logs-content');
const closeLogsBtn = document.getElementById('close-logs');
const infoPanel = document.getElementById('info-panel');
const installPanel = document.getElementById('install-panel');
const installBtn = document.getElementById('install-btn');
const installProgress = document.getElementById('install-progress');
const installMessage = document.querySelector('.install-message');
const installStatus = document.getElementById('install-status');

let currentStatus = 'stopped';
let logs = [];
const MAX_LOGS = 200;

// Status labels
const statusLabels = {
  'running': 'Running',
  'stopped': 'Stopped',
  'starting': 'Starting...',
  'stopping': 'Stopping...',
  'error': 'Error',
  'not-installed': 'Not Installed'
};

// Update UI based on status
function updateStatus(status) {
  currentStatus = status;
  
  // Update LED
  statusLed.className = 'led ' + status;
  
  // Update text
  statusText.textContent = statusLabels[status] || status;
  
  // Update power button
  powerBtn.className = 'power-button' + (status === 'running' ? ' running' : '');
  powerBtn.disabled = status === 'starting' || status === 'stopping' || status === 'not-installed';
  
  // Update open button
  openBtn.disabled = status !== 'running';
  
  // Show/hide install panel
  if (status === 'not-installed') {
    installPanel.classList.remove('hidden');
    infoPanel.classList.add('hidden');
  } else {
    installPanel.classList.add('hidden');
    infoPanel.classList.remove('hidden');
  }
}

// Add log message
function addLog(message) {
  logs.push(message);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  
  logsContent.textContent = logs.join('\n');
  logsContent.scrollTop = logsContent.scrollHeight;
}

// Power button click
powerBtn.addEventListener('click', async () => {
  if (currentStatus === 'running') {
    await window.pc2.stop();
  } else if (currentStatus === 'stopped' || currentStatus === 'error') {
    await window.pc2.start();
  }
});

// Open browser button
openBtn.addEventListener('click', () => {
  window.pc2.openBrowser();
});

// Toggle logs panel
logsBtn.addEventListener('click', async () => {
  if (logsPanel.classList.contains('hidden')) {
    // Load logs
    const logText = await window.pc2.getLogs(100);
    logs = logText.split('\n').filter(l => l.trim());
    logsContent.textContent = logs.join('\n');
    logsContent.scrollTop = logsContent.scrollHeight;
    logsPanel.classList.remove('hidden');
  } else {
    logsPanel.classList.add('hidden');
  }
});

// Close logs
closeLogsBtn.addEventListener('click', () => {
  logsPanel.classList.add('hidden');
});

// Install button
installBtn.addEventListener('click', async () => {
  installMessage.classList.add('hidden');
  installProgress.classList.remove('hidden');
  
  try {
    await window.pc2.install();
    // After install, start PC2
    await window.pc2.start();
  } catch (err) {
    installStatus.textContent = 'Installation failed: ' + err.message;
  }
});

// Listen for status changes
window.pc2.onStatus((status) => {
  updateStatus(status);
});

// Listen for log messages
window.pc2.onLog((log) => {
  addLog(log);
});

// Listen for install progress
window.pc2.onInstallProgress((message) => {
  installStatus.textContent = message;
});

// Initial status check
async function init() {
  const installed = await window.pc2.isInstalled();
  
  if (!installed) {
    updateStatus('not-installed');
  } else {
    const status = await window.pc2.getStatus();
    updateStatus(status);
  }
}

init();
