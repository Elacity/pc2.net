import { spawn, exec } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

const HOME = os.homedir();
const PC2_DIR = path.join(HOME, 'pc2.net');
const PC2_NODE_DIR = path.join(PC2_DIR, 'pc2-node');
const PC2_URL = 'http://localhost:4200';

export type PC2Status = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'not-installed';

let statusListeners: ((status: PC2Status) => void)[] = [];
let logListeners: ((log: string) => void)[] = [];

export function onStatusChange(callback: (status: PC2Status) => void): void {
  statusListeners.push(callback);
}

export function onLog(callback: (log: string) => void): void {
  logListeners.push(callback);
}

function emitStatus(status: PC2Status): void {
  statusListeners.forEach(cb => cb(status));
}

function emitLog(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const logMessage = `[${timestamp}] ${message}`;
  log.info(logMessage);
  logListeners.forEach(cb => cb(logMessage));
}

export async function isInstalled(): Promise<boolean> {
  return fs.existsSync(PC2_NODE_DIR) && fs.existsSync(path.join(PC2_NODE_DIR, 'dist', 'index.js'));
}

export async function getStatus(): Promise<PC2Status> {
  // First check if installed
  if (!(await isInstalled())) {
    return 'not-installed';
  }

  // Try to hit the health endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`${PC2_URL}/health`, { 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return 'running';
    }
  } catch (err) {
    // Server not responding, check PM2
  }

  // Check PM2 process
  return new Promise((resolve) => {
    exec('pm2 jlist', (error, stdout) => {
      if (error) {
        resolve('stopped');
        return;
      }
      
      try {
        const processes = JSON.parse(stdout || '[]');
        const pc2 = processes.find((p: any) => p.name === 'pc2');
        
        if (pc2?.pm2_env?.status === 'online') {
          resolve('starting'); // PM2 says online but health check failed = still starting
        } else {
          resolve('stopped');
        }
      } catch (e) {
        resolve('stopped');
      }
    });
  });
}

export async function startPC2(): Promise<void> {
  const installed = await isInstalled();
  
  if (!installed) {
    emitStatus('not-installed');
    emitLog('PC2 is not installed. Please install first.');
    return;
  }

  emitStatus('starting');
  emitLog('Starting PC2...');

  return new Promise((resolve, reject) => {
    const pm2Start = spawn('pm2', ['start', 'npm', '--name', 'pc2', '--', 'start'], {
      cwd: PC2_NODE_DIR,
      shell: true
    });

    pm2Start.stdout.on('data', (data) => {
      emitLog(data.toString().trim());
    });

    pm2Start.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) emitLog(msg);
    });

    pm2Start.on('close', (code) => {
      if (code === 0) {
        emitLog('PM2 process started, waiting for server...');
        waitForServer().then(() => {
          emitStatus('running');
          emitLog('PC2 is now running!');
          resolve();
        }).catch((err) => {
          emitStatus('error');
          emitLog('Failed to start: ' + err.message);
          reject(err);
        });
      } else {
        emitStatus('error');
        emitLog(`Failed to start PC2 (exit code: ${code})`);
        reject(new Error(`PM2 start failed with code ${code}`));
      }
    });
  });
}

export async function stopPC2(): Promise<void> {
  emitStatus('stopping');
  emitLog('Stopping PC2...');

  return new Promise((resolve) => {
    const pm2Stop = spawn('pm2', ['stop', 'pc2'], { shell: true });

    pm2Stop.stdout.on('data', (data) => {
      emitLog(data.toString().trim());
    });

    pm2Stop.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) emitLog(msg);
    });

    pm2Stop.on('close', () => {
      emitStatus('stopped');
      emitLog('PC2 stopped');
      resolve();
    });
  });
}

export async function restartPC2(): Promise<void> {
  emitStatus('starting');
  emitLog('Restarting PC2...');

  return new Promise((resolve, reject) => {
    const pm2Restart = spawn('pm2', ['restart', 'pc2'], { shell: true });

    pm2Restart.on('close', (code) => {
      if (code === 0) {
        waitForServer().then(() => {
          emitStatus('running');
          emitLog('PC2 restarted successfully');
          resolve();
        }).catch(reject);
      } else {
        emitStatus('error');
        reject(new Error(`Restart failed with code ${code}`));
      }
    });
  });
}

export async function getLogs(lines: number = 100): Promise<string> {
  return new Promise((resolve) => {
    exec(`pm2 logs pc2 --nostream --lines ${lines}`, (error, stdout, stderr) => {
      resolve(stdout + stderr);
    });
  });
}

export async function installPC2(onProgress: (message: string) => void): Promise<void> {
  emitLog('Installing PC2...');
  onProgress('Cloning repository...');

  const steps = [
    { cmd: `git clone https://github.com/Elacity/pc2.net "${PC2_DIR}"`, msg: 'Cloning repository...' },
    { cmd: `cd "${PC2_DIR}" && npm install --legacy-peer-deps --ignore-scripts`, msg: 'Installing dependencies...' },
    { cmd: `cd "${PC2_NODE_DIR}" && npm install --legacy-peer-deps`, msg: 'Installing node dependencies...' },
    { cmd: `cd "${PC2_NODE_DIR}" && npm run build`, msg: 'Building PC2...' },
  ];

  for (const step of steps) {
    onProgress(step.msg);
    emitLog(step.msg);
    
    await new Promise<void>((resolve, reject) => {
      exec(step.cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          emitLog(`Error: ${error.message}`);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  emitLog('Installation complete!');
  onProgress('Installation complete!');
}

async function waitForServer(timeout: number = 30000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${PC2_URL}/health`, { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return;
      }
    } catch (err) {
      // Keep trying
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Timeout waiting for server to start');
}

export function openInBrowser(): void {
  const { shell } = require('electron');
  shell.openExternal(PC2_URL);
}

export const PC2_URL_EXPORT = PC2_URL;
