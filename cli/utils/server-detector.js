/**
 * ═══════════════════════════════════════════════════════════
 * NovaStream — Server Process Detector
 * ═══════════════════════════════════════════════════════════
 *
 * Detects NovaStream server processes by scanning ports (netstat)
 * rather than relying solely on PM2. This handles the case where
 * the server was started manually with `node src/app.js`.
 *
 * Methods:
 *   detectByPort(ports)  — Scan specific ports, return process info
 *   detectAll()          — Scan default ports (5000-5010 range)
 *   killByPid(pid)       — Kill a process by PID
 *   killByPort(port)     — Kill process on a specific port
 *
 * Cross-platform support: Windows, Linux, macOS
 * ═══════════════════════════════════════════════════════════
 */

const { execSync } = require('child_process');
const os = require('os');

const isWindows = os.platform() === 'win32';

/**
 * Parse a string of bytes into a human-readable format
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return 'N/A';
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Format uptime seconds into human-readable string
 */
function formatUptime(seconds) {
  if (!seconds || isNaN(seconds)) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

/**
 * Run a command and return stdout, or null on failure
 */
function run(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', timeout: 5000 });
  } catch {
    return null;
  }
}

/**
 * Detects processes listening on the given ports.
 *
 * @param {number[]} ports - Array of port numbers to scan
 * @returns {object[]} Array of detected process objects:
 *   { port, pid, processName, memoryMB, cpuPercent, uptime, cmdline }
 */
function detectByPort(ports) {
  const results = [];

  if (isWindows) {
    // Windows: netstat -ano | findstr :PORT | findstr LISTEN
    for (const port of ports) {
      const netstatOut = run(`netstat -ano | findstr :${port} | findstr LISTEN`);
      if (!netstatOut) continue;

      const lines = netstatOut.trim().split('\n');
      const seenPids = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (!pid || seenPids.has(pid)) continue;
        seenPids.add(pid);

        // Get process details via wmic
        const wmiOut = run(
          `wmic process where processid=${pid} get name,processid,executablepath,workingsetsize,kernelmodetime,creationdate /format:csv`
        );

        let processName = `PID ${pid}`;
        let exePath = '';
        let memoryMB = null;
        let cpuTime = null;
        let startTime = null;

        if (wmiOut) {
          const wmiLines = wmiOut.trim().split('\n');
          // WMIC CSV format: Node,Name,ProcessId,... 
          // Skip header line, take data line
          for (const wline of wmiLines) {
            const cols = wline.trim().split(',');
            if (cols.length >= 3 && cols[2] === String(pid)) {
              processName = cols[1] || processName;
              exePath = cols[3] || '';
              if (cols[4]) {
                memoryMB = Math.round(parseInt(cols[4], 10) / (1024 * 1024));
              }
              if (cols[5]) {
                // CPU time in kernel mode (can't easily convert to %)
                cpuTime = parseInt(cols[5], 10);
              }
              if (cols[6] && cols[6].length >= 14) {
                // WMIC creationdate format: YYYYMMDDHHMMSS.mmmmmmsUTC
                const year = cols[6].slice(0, 4);
                const month = cols[6].slice(4, 6);
                const day = cols[6].slice(6, 8);
                const hour = cols[6].slice(8, 10);
                const min = cols[6].slice(10, 12);
                const sec = cols[6].slice(12, 14);
                startTime = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
              }
              break;
            }
          }
        }

        // Try to get the script path from command line
        let cmdline = '';
        if (exePath) {
          const cliOut = run(`wmic process where processid=${pid} get commandline /format:csv`);
          if (cliOut) {
            const cliLines = cliOut.trim().split('\n');
            for (const cline of cliLines) {
              // Format: Node,CommandLine 
              const commaIdx = cline.indexOf(',');
              if (commaIdx >= 0) {
                const cmdPart = cline.slice(commaIdx + 1).trim();
                if (cmdPart) {
                  cmdline = cmdPart;
                  // Truncate if too long
                  if (cmdline.length > 200) cmdline = cmdline.slice(0, 200) + '...';
                  break;
                }
              }
            }
          }
        }

        let uptime = null;
        if (startTime) {
          uptime = (Date.now() - startTime.getTime()) / 1000;
        }

        const result = {
          port,
          pid: parseInt(pid, 10),
          processName,
          exePath,
          cmdline,
          memoryMB,
          uptime,
          uptimeFormatted: formatUptime(uptime),
        };

        results.push(result);
      }
    }
  } else {
    // Linux/macOS: use ss or lsof
    for (const port of ports) {
      let out;

      // Try ss first (modern Linux), then lsof (macOS/older Linux)
      if (os.platform() === 'darwin') {
        out = run(`lsof -i :${port} -sTCP:LISTEN -P -n 2>/dev/null`);
      } else {
        out = run(`ss -tlnp 'sport = :${port}' 2>/dev/null`);
        if (!out) {
          out = run(`lsof -i :${port} -sTCP:LISTEN -P -n 2>/dev/null`);
        }
      }

      if (!out) continue;

      const lines = out.trim().split('\n');
      const seenPids = new Set();

      for (const line of lines) {
        // Skip header lines
        if (line.startsWith('Netid') || line.startsWith('State') || line.startsWith('COMMAND')) continue;

        let pid = null;

        if (os.platform() === 'darwin') {
          // lsof format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
            pid = parts[1];
          }
        } else {
          // ss format: Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
          const match = line.match(/pid=(\d+)/);
          if (match) pid = match[1];
        }

        if (!pid || seenPids.has(pid)) continue;
        seenPids.add(pid);

        // Get process info via ps
        const psOut = run(`ps -p ${pid} -o pid,%cpu,%mem,rss,etime,comm --no-headers 2>/dev/null`);
        let processName = `PID ${pid}`;
        let cpuPercent = null;
        let memoryMB = null;
        let uptime = null;

        if (psOut) {
          const psParts = psOut.trim().split(/\s+/);
          if (psParts.length >= 6) {
            processName = psParts[5] || processName;
            cpuPercent = psParts[1];
            if (psParts[3]) {
              memoryMB = Math.round(parseInt(psParts[3], 10) / 1024);
            }
            // etime format: [[DD-]hh:]mm:ss
            uptime = psParts[4];
          }
        }

        // Get command line
        let cmdline = '';
        const cliOut = run(`ps -p ${pid} -o args= 2>/dev/null`);
        if (cliOut) {
          cmdline = cliOut.trim();
          if (cmdline.length > 200) cmdline = cmdline.slice(0, 200) + '...';
        }

        results.push({
          port,
          pid: parseInt(pid, 10),
          processName,
          cmdline,
          memoryMB,
          cpuPercent: cpuPercent ? `${cpuPercent}%` : null,
          uptime,
          uptimeFormatted: uptime || 'N/A',
        });
      }
    }
  }

  return results;
}

/**
 * Detect NovaStream servers by scanning the default port range (5000-5010).
 * Also looks for any additional node processes with 'app.js' or 'novastream' in the cmdline.
 *
 * @returns {object[]} Array of detected server processes
 */
function detectAll() {
  const defaultPorts = [];
  for (let p = 5000; p <= 5010; p++) {
    defaultPorts.push(p);
  }
  return detectByPort(defaultPorts);
}

/**
 * Get the server port from environment or .env file.
 * Falls back to 5000 if not configured.
 */
function getConfiguredPort() {
  // If .env is already loaded into process.env
  if (process.env.PORT) return parseInt(process.env.PORT, 10);

  // Try to read .env file directly
  try {
    const fs = require('fs');
    const path = require('path');
    const { findProjectRoot } = require('./helpers');
    const root = findProjectRoot();
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/^PORT\s*=\s*(\d+)/m);
      if (match) return parseInt(match[1], 10);
    }
  } catch {
    // Ignore errors reading .env
  }

  return 5000;
}

/**
 * Detect NovaStream servers, focusing on the configured port(s).
 * Smart scan: checks the configured PORT + PORT+1 (common duplicate) + detects all in range.
 *
 * @returns {{ servers: object[], primaryPort: number, summary: string }}
 */
function detectServers() {
  const primaryPort = getConfiguredPort();
  // Scan the configured port, the fallback port 5000, and range around them
  const scanPorts = [
    primaryPort,
    primaryPort + 1,
    5000,
    5001,
    ...Array.from({ length: 9 }, (_, i) => primaryPort - 5 + i).filter(
      (p) => p >= 5000 && p <= 5010 && p !== primaryPort && p !== primaryPort + 1 && p !== 5000 && p !== 5001
    ),
  ];
  // Deduplicate
  const uniquePorts = [...new Set(scanPorts)];

  const servers = detectByPort(uniquePorts);

  const serverCount = servers.length;
  const portsList = servers.map((s) => s.port).sort((a, b) => a - b);

  let summary;
  if (serverCount === 0) {
    summary = 'No NovaStream servers detected';
  } else if (serverCount === 1) {
    summary = `1 server running on port ${portsList[0]}`;
  } else {
    summary = `${serverCount} servers running on ports ${portsList.join(', ')}`;
  }

  return { servers, primaryPort, summary };
}

/**
 * Kill a process by PID.
 *
 * @param {number} pid - Process ID to kill
 * @returns {{ success: boolean, message: string }}
 */
function killByPid(pid) {
  try {
    if (isWindows) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe', timeout: 5000 });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'pipe', timeout: 5000 });
    }
    return { success: true, message: `Process ${pid} terminated` };
  } catch (err) {
    return { success: false, message: `Failed to kill PID ${pid}: ${err.message}` };
  }
}

/**
 * Kill all processes on the given ports.
 *
 * @param {number[]} ports - Ports to kill processes on
 * @returns {{ killed: number, results: object[] }}
 */
function killByPorts(ports) {
  const servers = detectByPort(ports);
  const results = [];

  for (const server of servers) {
    const result = killByPid(server.pid);
    results.push({
      port: server.port,
      pid: server.pid,
      ...result,
    });
  }

  return { killed: results.filter((r) => r.success).length, results };
}

module.exports = {
  detectByPort,
  detectAll,
  detectServers,
  getConfiguredPort,
  killByPid,
  killByPorts,
  formatBytes,
  formatUptime,
};
