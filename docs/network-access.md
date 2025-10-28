# Network Access Configuration

## Overview

VibeTrees supports two modes:

- **Local Mode** (default): Only accessible from `localhost` - safe and secure
- **Network Mode** (`--listen`): Accessible from any device on your network - great for team collaboration

## Using Network Mode

```bash
# Start with network access
vibe --listen
```

You'll see all available network interfaces:

```
🚀 Worktree Manager is running!

   📡 Network Mode: Listening on ALL interfaces (--listen)

   🔍 Checking firewall configuration...

   Connect from any device on your network:

      🌐 http://192.168.1.100:3335  (en0)
      🌐 http://172.16.0.1:3335     (en1)
```

## macOS Firewall

### Automatic Configuration (Unmanaged Macs)

On unmanaged Macs, VibeTrees will automatically configure the firewall:

1. Detects if node is blocked by macOS Firewall
2. Prompts for `sudo` password
3. Adds node to firewall allowed list
4. Unblocks incoming connections

```
   🔓 Configuring macOS firewall for network access...
   ℹ️  This requires administrator privileges (sudo)

   [sudo password prompt]

   ✅ Firewall configured successfully!
```

### Manual Configuration (Managed Macs)

If your Mac is managed by your organization, you'll see:

```
   ⚠️  This Mac is managed by your organization
   ℹ️  Firewall settings must be configured manually:

   1. Open System Preferences → Security & Privacy
   2. Click the "Firewall" tab
   3. Click the lock icon 🔒 and authenticate
   4. Click "Firewall Options..."
   5. Click the "+" button to add an application
   6. Navigate to: /usr/local/bin/node
   7. Select "Allow incoming connections"
   8. Click "OK"

   💡 If you cannot modify firewall settings, contact your IT department
```

**Why managed Macs are different**: Enterprise-managed Macs have firewall policies enforced by MDM (Mobile Device Management). Command-line tools cannot override these policies.

## Linux Firewall

### UFW (Ubuntu/Debian)

```bash
sudo ufw allow 3335/tcp
```

### Firewalld (Fedora/CentOS/RHEL)

```bash
sudo firewall-cmd --add-port=3335/tcp --permanent
sudo firewall-cmd --reload
```

## Windows Firewall

1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → TCP → 3335
5. Select "Allow the connection"
6. Apply to all profiles (Domain, Private, Public)
7. Name the rule "VibeTrees"

## Security Considerations

### When to Use Network Mode

✅ **Safe scenarios**:
- Home network behind router NAT
- Trusted corporate network
- VPN-only access
- Development environment with team

⚠️ **Risky scenarios**:
- Public WiFi (coffee shops, airports)
- Networks you don't control
- Open/unsecured networks

### Best Practices

1. **Use local mode by default** - Only enable `--listen` when you need network access
2. **Know your network** - Understand who can access your network
3. **Use VPN** - For remote team access, use VPN instead of exposing to internet
4. **Firewall is your friend** - Keep firewall enabled, only allow specific apps
5. **Monitor connections** - Check who's connected: `netstat -an | grep 3335`

### What's Exposed?

When using `--listen`, VibeTrees exposes:
- Web UI for managing worktrees
- Terminal access to your worktrees
- Git operations on your repositories
- Docker service management

**Important**: VibeTrees does NOT:
- Authenticate users (anyone on network can access)
- Encrypt traffic (uses HTTP, not HTTPS)
- Log access attempts
- Rate limit requests

For production team use, consider:
- Setting up a VPN
- Adding authentication proxy (nginx with basic auth)
- Using SSH tunneling instead of `--listen`

## Troubleshooting

### Still can't connect from other devices?

1. **Verify server is listening on all interfaces**:
   ```bash
   netstat -an | grep 3335
   # Should show: *.3335 or 0.0.0.0.3335
   ```

2. **Check firewall status**:
   ```bash
   # macOS
   /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
   /usr/libexec/ApplicationFirewall/socketfilterfw --getappblocked $(which node)
   ```

3. **Test with curl from another device**:
   ```bash
   curl http://192.168.1.100:3335
   # Should return HTML (not connection refused)
   ```

4. **Check router/network**:
   - Some routers block communication between wireless clients (AP isolation)
   - Corporate networks may have additional firewall rules
   - Try connecting from same subnet first

### Common Issues

**"Connection refused"**
- Firewall is blocking connections
- Follow manual configuration steps above

**"No route to host"**
- Device is on different network/subnet
- Check both devices are on same WiFi network

**"Connection timeout"**
- Router has AP isolation enabled
- Corporate firewall is blocking traffic
- Try connecting from wired device

**"Address already in use"**
- Port 3335 is already taken
- Use `--port 3336` to choose different port

## Alternative: SSH Tunneling

For secure remote access without `--listen`:

```bash
# On remote machine
ssh -L 3335:localhost:3335 user@server-ip

# Then open browser to localhost:3335
```

This gives you:
- ✅ Encrypted traffic (SSH)
- ✅ Authentication (SSH keys)
- ✅ No firewall changes needed
- ✅ Works through NAT/firewalls

## Summary

- **Local mode** (default): Secure, localhost-only access
- **Network mode** (`--listen`): Team collaboration on trusted networks
- **Automatic firewall**: Works on unmanaged Macs
- **Manual firewall**: Required for managed Macs
- **Security**: Use VPN or SSH tunneling for remote access
