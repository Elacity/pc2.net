# Setting Up Particle Auth for ElastOS

## 🔐 SSH Keys Required

To complete the setup, you need SSH access to GitHub for the private submodules.

### Step 1: Set Up SSH Keys (if not already done)

```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Start the ssh-agent
eval "$(ssh-agent -s)"

# Add your SSH key
ssh-add ~/.ssh/id_ed25519

# Copy your public key
cat ~/.ssh/id_ed25519.pub
```

### Step 2: Add SSH Key to GitHub

1. Go to https://github.com/settings/keys
2. Click "New SSH key"
3. Paste your public key
4. Give it a title and save

### Step 3: Pull Submodules

```bash
cd /Users/mtk/Documents/Cursor/pc2.net
git submodule update --init --recursive
```

### Step 4: Build Particle Auth

```bash
npm run build:particle-auth
```

### Step 5: Rebuild GUI and Restart

```bash
cd src/gui
node build.js
cd ../..
npm start
```

## ✅ Configuration Already Done

The `.env` file has been created at:
`./submodules/particle-auth/.env`

With the following configuration:
- VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
- VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
- VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
- VITE_WALLETCONNECT_PROJECT_ID=1bdbe1354abcf233007b7ce4f2b91886
- VITE_PUTER_API_URL=http://api.puter.localhost:4100

## 🎯 How Particle Auth Works in ElastOS

According to your dev:
- Particle auth is implemented as an **iframe**
- The bundle from `particle-auth` submodule is served to an endpoint
- This endpoint is used as the iframe target URL
- This follows how extensions are handled in Puter

## 🧪 Test Wallet Login

Once setup is complete, you can test at:
http://puter.localhost:4100

The wallet login button should appear and connect via Particle Network!
