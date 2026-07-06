// cli/services/pm2.service.js
const { execSync, spawn } = require('child_process');
const path = require('path');
const { findProjectRoot, runCommand } = require('../utils/helpers');
const serverDetector = require('../utils/server-detector');

const isWindows = process.platform === 'win32';

class Pm2Service {
  constructor() {
    this.root = findProjectRoot();
    this.appName = 'novastream';
    this.ecosystemPath = path.join(this.root, 'ecosystem.config.js');
  }

  /**
   * Check if PM2 is available globally or via npx
   */
  pm2Cmd() {
    try {
      execSync('pm2 --version', { stdio: 'pipe', encoding: 'utf-8' });
      return 'pm2';
    } catch {
      try {
        execSync('npx pm2 --version', { stdio: 'pipe', encoding: 'utf-8' });
        return 'npx pm2';
      } catch {
        return null;
      }
    }
  }

  // ── PM2-based methods (original) ──

  start() {
    const cmd = this.pm2Cmd();
    if (!cmd) return { success: false, message: 'PM2 is not installed. Run: npm install -g pm2' };

    if (!require('fs').existsSync(this.ecosystemPath)) {
      return { success: false, message: `Ecosystem file not found: ${this.ecosystemPath}` };
    }

    try {
      runCommand(`${cmd} start ${this.ecosystemPath} --env production`);
      return { success: true, message: 'NovaStream server started via PM2' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  stop() {
    const cmd = this.pm2Cmd();
    if (!cmd) return { success: false, message: 'PM2 is not installed' };

    try {
      runCommand(`${cmd} stop ${this.appName}`);
      return { success: true, message: 'NovaStream server stopped via PM2' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  restart() {
    const cmd = this.pm2Cmd();
    if (!cmd) return { success: false, message: 'PM2 is not installed' };

    try {
      runCommand(`${cmd} restart ${this.appName}`);
      return { success: true, message: 'NovaStream server restarted via PM2' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Check PM2 process status
   */
  pm2Status() {
    const cmd = this.pm2Cmd();
    if (!cmd) return { available: false };

    try {
      const output = runCommand(`${cmd} show ${this.appName}`, { silent: true });
      return { available: true, running: true, output: output.toString() };
    } catch {
      return { available: true, running: false };
    }
  }

  getPid() {
    const cmd = this.pm2Cmd();
    if (!cmd) return null;

    try {
      const pid = runCommand(`${cmd} pid ${this.appName}`, { silent: true });
      return pid.toString().trim();
    } catch {
      return null;
    }
  }

  logs(lines = 50) {
    const cmd = this.pm2Cmd();
    if (!cmd) return { success: false, message: 'PM2 is not installed' };

    try {
      const output = runCommand(`${cmd} logs ${this.appName} --lines ${lines} --nostream`, {
        silent: true,
      });
      return { success: true, output: output.toString() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  getResourceUsage() {
    const pid = this.getPid();
    if (!pid) return null;

    try {
      let output;
      if (isWindows) {
        output = runCommand(
          `powershell -Command "Get-Process -Id ${pid} | Select-Object Id, @{N='CPU';E={$_.CPU}}, @{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, StartTime, @{N='Uptime';E={[math]::Round((New-TimeSpan -Start $_.StartTime -End (Get-Date)).TotalHours,1)}} | Format-Table -AutoSize"`,
          { silent: true }
        );
      } else {
        output = runCommand(
          `ps -p ${pid} -o pid,%cpu,%mem,rss,etime --no-headers 2>/dev/null`,
          { silent: true }
        );
      }
      return output.toString();
    } catch {
      return null;
    }
  }

  // ── Smart methods (PM2 + fallback detection) ──

  /**
   * Smart status: checks PM2 first, then falls back to port scanning.
   * Returns a comprehensive status object.
   */
  smartStatus() {
    const pm2Status = this.pm2Status();
    const portScan = serverDetector.detectServers();

    const result = {
      pm2: pm2Status,
      portScan,
      detected: portScan.servers.length > 0,
      managed: pm2Status.available && pm2Status.running,
    };

    return result;
  }

  /**
   * Smart stop: tries PM2 first, falls back to killing processes by PID.
   * Stops ALL detected NovaStream instances.
   */
  smartStop() {
    // Try PM2 first
    const cmd = this.pm2Cmd();
    if (cmd) {
      try {
        runCommand(`${cmd} stop ${this.appName}`);
        // Don't return yet — there might also be non-PM2 instances
      } catch {
        // PM2 doesn't manage it — that's fine
      }
    }

    // Also kill any manually-started processes on the server ports
    const detection = serverDetector.detectServers();
    if (detection.servers.length === 0) {
      return { success: true, message: 'No running NovaStream servers detected', killed: 0 };
    }

    const ports = detection.servers.map((s) => s.port);
    const killResult = serverDetector.killByPorts(ports);

    const messages = [];
    if (killResult.killed > 0) {
      messages.push(`Stopped ${killResult.killed} server instance(s)`);
      for (const r of killResult.results) {
        if (r.success) {
          messages.push(`  ✓ Port ${r.port} (PID ${r.pid}) — terminated`);
        }
      }
    }

    return {
      success: killResult.killed > 0,
      message: messages.join('\n') || 'No servers needed stopping',
      killed: killResult.killed,
      details: killResult.results,
    };
  }

  /**
   * Smart start: tries PM2 first; if PM2 not available, starts directly with node.
   * Checks for existing servers before starting.
   */
  smartStart() {
    // First check if any server is already running
    const existing = serverDetector.detectServers();
    if (existing.servers.length > 0) {
      const ports = existing.servers.map((s) => s.port).join(', ');
      return {
        success: false,
        message: `Server(s) already running on port(s) ${ports}. Use 'novactl restart' to restart or 'novactl stop' first.`,
        alreadyRunning: true,
        servers: existing.servers,
      };
    }

    // Try PM2
    const cmd = this.pm2Cmd();
    if (cmd && require('fs').existsSync(this.ecosystemPath)) {
      try {
        runCommand(`${cmd} start ${this.ecosystemPath} --env production`);
        return { success: true, message: 'NovaStream server started via PM2' };
      } catch (err) {
        return { success: false, message: `PM2 start failed: ${err.message}` };
      }
    }

    // PM2 not available — start directly with node
    const serverEntry = path.join(this.root, 'server', 'src', 'app.js');
    if (!require('fs').existsSync(serverEntry)) {
      return { success: false, message: `Server entry not found: ${serverEntry}` };
    }

    try {
      const child = spawn('node', [serverEntry], {
        cwd: this.root,
        stdio: 'ignore',
        detached: true,
        env: { ...process.env },
      });
      child.unref();

      child.on('error', (err) => {
        console.error('Failed to start server:', err.message);
      });

      return {
        success: true,
        message: `NovaStream server started in background (PID: ${child.pid}).\n  Use "novactl status" to check, "novactl stop" to stop, "novactl logs" for PM2 logs.`,
        pid: child.pid,
        manual: true,
      };
    } catch (err) {
      return { success: false, message: `Failed to start server: ${err.message}` };
    }
  }

  /**
   * Smart restart: stop all instances, then start fresh
   */
  smartRestart() {
    const stopResult = this.smartStop();
    // Brief pause for port release
    return new Promise((resolve) => {
      setTimeout(() => {
        const startResult = this.smartStart();
        resolve({
          success: startResult.success,
          message: startResult.success
            ? `Server restarted. ${stopResult.killed > 0 ? `(Stopped ${stopResult.killed} old instance(s))` : ''}`
            : `Stop succeeded but start failed: ${startResult.message}`,
        });
      }, 1000);
    });
  }
}

module.exports = Pm2Service;
