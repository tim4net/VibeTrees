/**
 * Firewall Helper
 * Automatically configures firewall rules for network access
 */

import { execSync } from 'child_process';
import { platform } from 'os';

export class FirewallHelper {
  constructor() {
    this.platform = platform();
  }

  /**
   * Check if firewall is blocking node
   * @param {number} port - Port number to check
   * @returns {boolean} - True if node is blocked
   */
  async isPortBlocked(port) {
    if (this.platform !== 'darwin') {
      return false; // Only check on macOS for now
    }

    try {
      // Check if firewall is enabled
      const globalState = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      if (!globalState.includes('enabled')) {
        return false; // Firewall is disabled
      }

      // Get the path to node
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();

      // Check if node is blocked
      const blockStatus = execSync(
        `/usr/libexec/ApplicationFirewall/socketfilterfw --getappblocked "${nodePath}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      return blockStatus.includes('blocked');
    } catch (error) {
      return false;
    }
  }

  /**
   * Add firewall rule for the application
   * @param {number} port - Port number
   * @returns {boolean} - True if successful
   */
  async addFirewallRule(port) {
    if (this.platform !== 'darwin') {
      console.log('   ℹ️  Firewall configuration only needed on macOS');
      return true;
    }

    try {
      console.log('\n   🔓 Configuring macOS firewall for network access...');
      console.log('   ℹ️  This requires administrator privileges (sudo)');

      // Get the path to node
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();

      // Add the application to firewall allowed list
      execSync(
        `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "${nodePath}"`,
        { stdio: 'inherit' }
      );

      // Unblock the application
      execSync(
        `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "${nodePath}"`,
        { stdio: 'inherit' }
      );

      console.log('   ✅ Firewall configured successfully!\n');
      return true;
    } catch (error) {
      console.log('   ⚠️  Could not configure firewall automatically');
      console.log('   ℹ️  You may need to allow connections manually in System Preferences');
      return false;
    }
  }

  /**
   * Suggest manual firewall configuration
   * @param {number} port - Port number
   */
  suggestManualConfig(port) {
    if (this.platform === 'darwin') {
      console.log('\n   📝 Manual Firewall Configuration:');
      console.log('   1. Open System Preferences → Security & Privacy → Firewall');
      console.log('   2. Click "Firewall Options"');
      console.log('   3. Click "+" and add "node" from /usr/local/bin/node');
      console.log('   4. Set to "Allow incoming connections"\n');
    } else if (this.platform === 'linux') {
      console.log('\n   📝 Manual Firewall Configuration (Linux):');
      console.log(`   sudo ufw allow ${port}/tcp`);
      console.log(`   # or for firewalld: sudo firewall-cmd --add-port=${port}/tcp --permanent\n`);
    } else if (this.platform === 'win32') {
      console.log('\n   📝 Manual Firewall Configuration (Windows):');
      console.log('   1. Open Windows Defender Firewall');
      console.log('   2. Click "Advanced settings"');
      console.log('   3. Click "Inbound Rules" → "New Rule"');
      console.log(`   4. Select "Port" → TCP → ${port}\n`);
    }
  }

  /**
   * Setup firewall for network mode
   * @param {number} port - Port number
   */
  async setupForNetworkMode(port) {
    console.log('   🔍 Checking firewall configuration...');

    const isBlocked = await this.isPortBlocked(port);

    if (!isBlocked) {
      console.log('   ✅ Firewall is not blocking connections\n');
      return true;
    }

    console.log('   ⚠️  macOS Firewall is enabled and may block network connections');
    console.log('   ℹ️  VibeTrees needs to accept incoming connections\n');

    // Try to add firewall rule with sudo
    const success = await this.addFirewallRule(port);

    if (!success) {
      this.suggestManualConfig(port);
    }

    return success;
  }
}
