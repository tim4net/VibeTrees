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
      console.log('   ℹ️  This requires administrator privileges (sudo)\n');

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

      console.log('\n   ✅ Firewall configured successfully!\n');
      return true;
    } catch (error) {
      // Check if this is a managed Mac
      const errorMessage = error.stderr?.toString() || error.message || '';
      if (errorMessage.includes('managed') || errorMessage.includes('cannot be modified from command line')) {
        console.log('\n   ⚠️  This Mac is managed by your organization');
        console.log('   ℹ️  Firewall settings must be configured manually:\n');

        const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
        console.log('   1. Open System Preferences → Security & Privacy');
        console.log('   2. Click the "Firewall" tab');
        console.log('   3. Click the lock icon 🔒 and authenticate');
        console.log('   4. Click "Firewall Options..."');
        console.log('   5. Click the "+" button to add an application');
        console.log(`   6. Navigate to: ${nodePath}`);
        console.log('   7. Select "Allow incoming connections"');
        console.log('   8. Click "OK"\n');
        console.log('   💡 If you cannot modify firewall settings, contact your IT department\n');
      } else {
        console.log('\n   ⚠️  Could not configure firewall automatically');
        console.log('   ℹ️  You may need to allow connections manually in System Preferences\n');
      }
      return false;
    }
  }

  /**
   * Suggest manual firewall configuration
   * @param {number} port - Port number
   */
  suggestManualConfig(port) {
    if (this.platform === 'darwin') {
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
      console.log('\n   📝 Manual Firewall Configuration (macOS):');
      console.log('   1. Open System Preferences → Security & Privacy');
      console.log('   2. Click the "Firewall" tab');
      console.log('   3. Click the lock icon 🔒 and authenticate');
      console.log('   4. Click "Firewall Options..."');
      console.log('   5. Click the "+" button to add an application');
      console.log(`   6. Navigate to: ${nodePath}`);
      console.log('   7. Select "Allow incoming connections"');
      console.log('   8. Click "OK"\n');
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
