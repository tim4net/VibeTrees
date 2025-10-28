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
      // Output can be either "enabled" or "blocking" depending on macOS version
      const globalState = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      });

      if (!globalState.includes('enabled') && !globalState.includes('blocking')) {
        return false; // Firewall is disabled
      }

      // Get the path to node
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim();

      // Check if node is blocked (output goes to stderr, so we need to capture it)
      try {
        const blockStatus = execSync(
          `/usr/libexec/ApplicationFirewall/socketfilterfw --getappblocked "${nodePath}" 2>&1`,
          { encoding: 'utf-8' }
        );
        return blockStatus.includes('blocked');
      } catch (err) {
        // Command failed, assume not blocked
        return false;
      }
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

      // Try to add and unblock - capture output to check for managed Mac error
      const addOutput = execSync(
        `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "${nodePath}" 2>&1`,
        { encoding: 'utf-8' }
      );

      const unblockOutput = execSync(
        `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "${nodePath}" 2>&1`,
        { encoding: 'utf-8' }
      );

      // Check if managed Mac (commands succeeded but printed error message)
      const combinedOutput = addOutput + unblockOutput;
      if (combinedOutput.includes('managed') || combinedOutput.includes('cannot be modified from command line')) {
        console.log('   ⚠️  This Mac is managed by your organization');
        console.log('   ℹ️  Firewall settings must be configured manually:\n');

        console.log('   1. Open System Preferences → Security & Privacy');
        console.log('   2. Click the "Firewall" tab');
        console.log('   3. Click the lock icon 🔒 and authenticate');
        console.log('   4. Click "Firewall Options..."');
        console.log('   5. Click the "+" button to add an application');
        console.log(`   6. Navigate to: ${nodePath}`);
        console.log('   7. Select "Allow incoming connections"');
        console.log('   8. Click "OK"\n');
        console.log('   💡 If you cannot modify firewall settings, contact your IT department\n');
        return false;
      }

      console.log('\n   ✅ Firewall configured successfully!\n');
      return true;
    } catch (error) {
      // Command failed (user cancelled sudo, permissions issue, etc)
      console.log('\n   ⚠️  Could not configure firewall automatically');
      console.log('   ℹ️  You may need to allow connections manually in System Preferences\n');
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
    // Note: addFirewallRule already shows manual instructions if it fails
    const success = await this.addFirewallRule(port);

    return success;
  }
}
