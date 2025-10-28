# Using VibeTrees with npx

**The absolute easiest way to use VibeTrees!**

---

## Option 1: npx with GitHub (No Installation!)

### Single Command Launch

```bash
# Run directly from GitHub (no install needed!)
npx github:tim4net/VibeTrees
```

This will:
- ✅ Download VibeTrees temporarily
- ✅ Install dependencies automatically
- ✅ Launch the web UI
- ✅ Clean up after you're done (unless you want to keep it)

### Launch in Current Project

```bash
cd ~/your-project
npx github:tim4net/VibeTrees
```

### Custom Port

```bash
npx github:tim4net/VibeTrees -- --port 8080
```

### Network Access

```bash
npx github:tim4net/VibeTrees -- --listen
```

---

## Option 2: npx with npm Registry (After Publishing)

Once VibeTrees is published to npm:

```bash
# Run the latest published version
npx vibetrees

# Or with options
npx vibetrees --port 8080
npx vibetrees --listen
```

**Benefits:**
- ✅ Even faster (cached after first run)
- ✅ Version pinning available
- ✅ Works offline after first download

---

## Option 3: Global Install (Keep It Forever)

```bash
# Install globally from GitHub
npm install -g github:tim4net/VibeTrees

# Now just run 'vibe' from anywhere
cd ~/your-project
vibe
```

**Or after npm publish:**

```bash
npm install -g vibetrees
vibe
```

---

## Comparison: Which Method Should You Use?

| Method | Speed | Disk Space | Updates | Best For |
|--------|-------|------------|---------|----------|
| **`npx github:`** | Slow first time, fast after | Temporary cache | Always latest | Testing, one-time use |
| **`npx vibetrees`** | Fast | Small cache | Specify version | Quick usage, CI/CD |
| **`npm install -g`** | Instant | Permanent | Manual (`./update.sh`) | Daily use |
| **Clone + link** | Instant | Full repo | Manual (`git pull`) | Development, contributors |

---

## Commands Summary

### Try It Out (No Commitment)
```bash
npx github:tim4net/VibeTrees
```

### Use It Regularly
```bash
npm install -g github:tim4net/VibeTrees
vibe
```

### Contribute/Develop
```bash
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees && npm install && npm link
```

---

## Update Methods

### npx (GitHub)
```bash
# Always uses latest from GitHub
npx github:tim4net/VibeTrees
```

### npx (npm)
```bash
# Use latest published version
npx vibetrees@latest

# Or specific version
npx vibetrees@1.2.0
```

### Global Install
```bash
# Update from GitHub
cd ~/VibeTrees && ./update.sh

# Or reinstall
npm install -g github:tim4net/VibeTrees --force
```

---

## Publishing to npm (For Maintainers)

To make `npx vibetrees` work from npm registry:

### Step 1: Prepare package.json

```bash
# Add repository and author info
npm pkg set repository.type=git
npm pkg set repository.url="git+https://github.com/tim4net/VibeTrees.git"
npm pkg set author="Tim <your-email>"
npm pkg set license="MIT"

# Add files to include in package
npm pkg set files[]="bin/"
npm pkg set files[]="scripts/"
npm pkg set files[]="docs/"
npm pkg set files[]="README.md"
```

### Step 2: Test Package Locally

```bash
# Create tarball
npm pack

# Test installation from tarball
npm install -g ./vibetrees-1.0.0.tgz

# Test it works
vibe --version
```

### Step 3: Publish to npm

```bash
# Login to npm (first time only)
npm login

# Publish package
npm publish

# Or for scoped/private package
npm publish --access public
```

### Step 4: Verify

```bash
# Test npx command works
npx vibetrees --version

# Test global install
npm install -g vibetrees
vibe --version
```

---

## Version Management

### Semantic Versioning

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch
git push && git push --tags
npm publish

# Minor release (1.0.0 → 1.1.0)
npm version minor
git push && git push --tags
npm publish

# Major release (1.0.0 → 2.0.0)
npm version major
git push && git push --tags
npm publish
```

---

## Troubleshooting npx

### npx is slow / not working

```bash
# Clear npx cache
rm -rf ~/.npm/_npx

# Or force fresh download
npx --yes github:tim4net/VibeTrees
```

### Permission errors

```bash
# On Linux/Mac, may need sudo for global install
sudo npm install -g vibetrees

# Or fix npm permissions (better approach)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### GitHub rate limiting

```bash
# Authenticate with GitHub for higher rate limits
gh auth login

# Or use npm registry instead (after publishing)
npx vibetrees
```

---

## Recommended: Start with npx, Upgrade to Global

**For first-time users:**
```bash
# Try it out with zero commitment
npx github:tim4net/VibeTrees
```

**If you like it:**
```bash
# Install globally for daily use
npm install -g github:tim4net/VibeTrees
```

**If you love it:**
```bash
# Clone for development and updates
git clone https://github.com/tim4net/VibeTrees.git
cd VibeTrees && npm install && npm link
```

---

## Current Status

🟡 **npx with GitHub**: ✅ Works now! `npx github:tim4net/VibeTrees`
🟡 **npx from npm**: ⏳ Pending publication to npm registry
🟢 **Global install**: ✅ Works now! `npm install -g github:tim4net/VibeTrees`

---

**Bottom line:** Use `npx github:tim4net/VibeTrees` for the easiest possible start! 🚀
