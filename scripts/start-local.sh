#!/bin/bash
#
# PC2 Local Quick Start
# 
# One command to run PC2 on your computer:
#   curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh | bash
#
# Or if you already cloned the repo:
#   ./scripts/start-local.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Print banner
echo ""
echo -e "${PURPLE}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║                                                                   ║${NC}"
echo -e "${PURPLE}║   ${CYAN}███████╗██╗      █████╗ ███████╗████████╗ ██████╗ ███████╗${PURPLE}    ║${NC}"
echo -e "${PURPLE}║   ${CYAN}██╔════╝██║     ██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝${PURPLE}    ║${NC}"
echo -e "${PURPLE}║   ${CYAN}█████╗  ██║     ███████║███████╗   ██║   ██║   ██║███████╗${PURPLE}    ║${NC}"
echo -e "${PURPLE}║   ${CYAN}██╔══╝  ██║     ██╔══██║╚════██║   ██║   ██║   ██║╚════██║${PURPLE}    ║${NC}"
echo -e "${PURPLE}║   ${CYAN}███████╗███████╗██║  ██║███████║   ██║   ╚██████╔╝███████║${PURPLE}    ║${NC}"
echo -e "${PURPLE}║   ${CYAN}╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚══════╝${PURPLE}    ║${NC}"
echo -e "${PURPLE}║                                                                   ║${NC}"
echo -e "${PURPLE}║            ${NC}🌐  T H E   W O R L D   C O M P U T E R  🌐${PURPLE}            ║${NC}"
echo -e "${PURPLE}║                                                                   ║${NC}"
echo -e "${PURPLE}║                  ${YELLOW}Presented by Elacity Labs${PURPLE}                      ║${NC}"
echo -e "${PURPLE}║                                                                   ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
fi

if grep -qi "microsoft\|wsl" /proc/version 2>/dev/null; then
    echo -e "${YELLOW}WSL detected!${NC} For best results on Windows, use the dedicated WSL installer:"
    echo -e "  ${CYAN}curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/install-wsl.sh | bash${NC}"
    echo ""
    echo -e "${NC}Continuing with generic install in 5 seconds (Ctrl+C to cancel)...${NC}"
    sleep 5
fi

echo -e "${CYAN}Detected: ${OS}${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────
# Pipe-to-bash detection.
#
# When a user runs `curl ... | bash`, this script's stdin is the curl
# pipe, NOT their terminal. Any later `sudo` prompt, `xcode-select
# --install` GUI prompt, or `apt-get` interactive question has nowhere
# to read the user's input from and silently bails. Earlier installs
# hit exactly this — Homebrew's installer would print "Need sudo
# access on macOS!" and exit, but later steps wouldn't notice and
# would carry on printing fake success checkmarks.
#
# We refuse to run pipe-to-bash on macOS because every other step
# (Xcode CLT, Homebrew, brew install) requires a real TTY. On Linux
# we tolerate it because most distros let `sudo apt-get install -y`
# work fine without a TTY when the user has cached sudo creds.
# ─────────────────────────────────────────────────────────────────────
if [[ "$OS" == "macos" ]] && [ ! -t 0 ]; then
    echo -e "${RED}❌ This script needs an interactive terminal on macOS.${NC}"
    echo ""
    echo -e "${YELLOW}You ran it via \`curl ... | bash\`, which detaches stdin and${NC}"
    echo -e "${YELLOW}breaks every step that prompts for your password (Xcode${NC}"
    echo -e "${YELLOW}Command Line Tools, Homebrew, sudo).${NC}"
    echo ""
    echo -e "${CYAN}Re-run it like this so it can use your terminal:${NC}"
    echo ""
    echo -e "  ${GREEN}bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh)\"${NC}"
    echo ""
    echo -e "  ${YELLOW}or${NC}"
    echo ""
    echo -e "  ${GREEN}curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh -o /tmp/pc2.sh && bash /tmp/pc2.sh${NC}"
    echo ""
    exit 1
fi

# Load nvm if available
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
}

# Check for Node.js
check_node() {
    # Try to load nvm first (in case it's installed but not in PATH)
    load_nvm
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Node.js $(node -v) is too old (need v18+)${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠ Node.js not found${NC}"
        return 1
    fi
}

# Install Node.js via nvm (no admin required)
install_node() {
    echo -e "${CYAN}Installing Node.js...${NC}"
    echo ""
    
    # Use nvm - works on both macOS and Linux without admin rights
    echo -e "${CYAN}Installing nvm (Node Version Manager)...${NC}"
    
    # Install nvm
    export NVM_DIR="$HOME/.nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Load nvm immediately
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node.js 24
    echo -e "${CYAN}Installing Node.js 24...${NC}"
    nvm install 24
    nvm use 24
    nvm alias default 24
    
    echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"
    echo ""
    echo -e "${YELLOW}Note: Node.js installed via nvm. To use in new terminals, run: source ~/.nvm/nvm.sh${NC}"
}

# Check for git.
#
# IMPORTANT: on macOS, `command -v git` returns true even on a fresh box
# because /usr/bin/git is a stub installed by macOS that exists *only* to
# trigger the Xcode Command Line Tools installer when actually invoked.
# The earlier check passed silently on this stub, every later compile step
# (nvm install -> Node compile, brew install) would hit the missing-CLT
# error, and the user would see a cascade of mysterious failures. The
# honest test is `xcode-select -p`, which only succeeds once CLT is
# actually present. (v1.2.7 dropped the better-sqlite3 source-compile
# step, but other native deps may still need CLT for source builds.)
check_git() {
    if [[ "$OS" == "macos" ]]; then
        if xcode-select -p &> /dev/null; then
            # CLT installed — git stub will work for real
            echo -e "${GREEN}✓ Xcode Command Line Tools installed${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ Xcode Command Line Tools not installed${NC}"
            return 1
        fi
    fi

    if command -v git &> /dev/null; then
        echo -e "${GREEN}✓ Git installed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Git not found${NC}"
        return 1
    fi
}

# Install git.
#
# On macOS, the only sensible way to get git on a fresh box is the
# Xcode Command Line Tools. We trigger the GUI installer and exit;
# the user has to wait for the install to finish (5-10 minutes on
# slow connections) and re-run the script. We can't `wait` for the
# CLT install programmatically because it hands off to a separate
# system process.
install_git() {
    echo -e "${CYAN}Installing Git...${NC}"
    
    if [[ "$OS" == "macos" ]]; then
        echo -e "${YELLOW}Git on macOS requires Xcode Command Line Tools.${NC}"
        echo -e "${YELLOW}Triggering the installer now — a system dialog will appear.${NC}"
        echo ""
        # Best-effort fire-and-forget; the GUI installer takes over.
        xcode-select --install 2>/dev/null || true
        echo -e "${YELLOW}A macOS dialog should be open or about to open. Click 'Install',${NC}"
        echo -e "${YELLOW}wait for it to finish (typically 5-10 minutes), then re-run:${NC}"
        echo ""
        echo -e "  ${GREEN}bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Elacity/pc2.net/main/scripts/start-local.sh)\"${NC}"
        echo ""
        exit 1
    elif [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git
        elif command -v yum &> /dev/null; then
            sudo yum install -y git
        else
            echo -e "${RED}Please install git manually and re-run this script.${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✓ Git installed${NC}"
}

# ─────────────────────────────────────────────────────────────────────
# macOS Homebrew bootstrap.
#
# Homebrew is the canonical package manager on macOS and we need it for
# ffmpeg + every native-module system library (cairo, pango, libpng,
# pkg-config, …). Without it, `npm rebuild canvas` fails with
# `pkg-config: command not found` and the script previously printed a
# fake success message.
#
# The Homebrew installer prompts for sudo to create /opt/homebrew, so
# this step REQUIRES a real TTY. We've already early-exited above if
# we're in pipe-to-bash mode, so by here we know stdin is a terminal.
# ─────────────────────────────────────────────────────────────────────
ensure_brew_macos() {
    if [[ "$OS" != "macos" ]]; then return 0; fi

    # Make sure brew is on PATH if already installed (Apple Silicon
    # vs Intel default install locations).
    if ! command -v brew &> /dev/null; then
        if [[ -x /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [[ -x /usr/local/bin/brew ]]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
    fi

    if command -v brew &> /dev/null; then
        echo -e "${GREEN}✓ Homebrew installed ($(brew --prefix))${NC}"
        return 0
    fi

    echo -e "${CYAN}Installing Homebrew (macOS package manager)...${NC}"
    echo -e "${YELLOW}You'll be prompted for your Mac password — that's normal,${NC}"
    echo -e "${YELLOW}Homebrew needs it to create /opt/homebrew.${NC}"
    echo ""

    # Run the installer with a real TTY (no </dev/null this time —
    # that was the original bug that made it fail silently).
    if /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; then
        # Add brew to PATH for the rest of this script
        if [[ -x /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [[ -x /usr/local/bin/brew ]]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        # Persist for future shells (zsh is macOS default since Catalina)
        if [[ -x /opt/homebrew/bin/brew ]] && ! grep -q "brew shellenv" "$HOME/.zprofile" 2>/dev/null; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
        fi
        echo -e "${GREEN}✓ Homebrew installed${NC}"
        return 0
    fi

    echo -e "${RED}❌ Homebrew install failed.${NC}"
    echo -e "${YELLOW}Install it manually following the prompts at https://brew.sh${NC}"
    echo -e "${YELLOW}then re-run this script.${NC}"
    exit 1
}

# Check for pm2
check_pm2() {
    if command -v pm2 &> /dev/null; then
        echo -e "${GREEN}✓ PM2 process manager installed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ PM2 not found${NC}"
        return 1
    fi
}

# Install pm2
install_pm2() {
    echo -e "${CYAN}Installing PM2 process manager...${NC}"
    npm install -g pm2
    echo -e "${GREEN}✓ PM2 installed${NC}"
}

# Install build dependencies for native modules (Debian/Ubuntu only)
install_build_deps() {
    # Only run on Debian/Ubuntu systems
    if [[ ! -f /etc/debian_version ]]; then
        return 0
    fi
    
    echo -e "${CYAN}Installing build dependencies for native modules (Debian/Ubuntu)...${NC}"
    
    # Check if we need sudo
    if [[ $EUID -ne 0 ]]; then
        SUDO="sudo"
    else
        SUDO=""
    fi
    
    # Install build-essential, python3, cmake, ffmpeg, and native module deps.
    # cmake is required by node-datachannel's source-build fallback when
    # prebuild-install can't find a binary for the running Node ABI.
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq \
        build-essential \
        python3 \
        cmake \
        ffmpeg \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        2>&1 | grep -v "is already the newest version" || true
    
    echo -e "${GREEN}✓ Build dependencies installed${NC}"
}

# Install native-module system libraries on macOS via Homebrew.
#
# @photostructure/sqlite (v1.2.7+) ships per-platform prebuilds, so no
#   system libs are needed for it.
# canvas needs cairo + pango + libpng + jpeg + giflib + librsvg + pkg-config —
#   without these, `npm rebuild canvas` dies with `pkg-config: command not
#   found` and PDF/text thumbnail generation is silently disabled.
# ffmpeg is needed by the media encoding pipeline (AV1/H.264 transcode).
# wireguard-tools is needed for the optional fast-remote-access overlay.
#
# We install ALL of these in one `brew install` so brew can dedup and cache
# the dependency graph properly. Errors are surfaced (no `|| true`) because
# silent failures here corrupt the whole rest of the install.
install_macos_brew_libs() {
    if [[ "$OS" != "macos" ]]; then return 0; fi

    echo -e "${CYAN}Installing macOS native-module system libraries via Homebrew...${NC}"
    echo -e "${YELLOW}First run can take a few minutes (brew is downloading bottles)...${NC}"

    # Suppress brew's default "auto-update everything when you `brew install`
    # anything" behaviour. Without this, a fresh-Mac install can stall for
    # 5-10 minutes auto-upgrading completely unrelated packages (tesseract,
    # imagemagick, jpeg-xl, …). We only need the bottles for OUR deps; the
    # user can `brew upgrade` on their own schedule. Verified during 1.2.4
    # smoke test where this was the dominant install-time cost.
    export HOMEBREW_NO_AUTO_UPDATE=1
    export HOMEBREW_NO_INSTALL_UPGRADE=1
    export HOMEBREW_NO_ENV_HINTS=1

    # `brew install` exits 0 when packages are already installed, so the
    # idempotent re-run case is fine. Any genuine failure (e.g. brew not
    # on PATH, network down) we want to see immediately.
    #
    # cmake is required by node-datachannel's source-build fallback when
    # prebuild-install can't find a binary for the running Node ABI
    # (e.g. Node 22 napi 8 darwin-arm64). v1.2.4 missed this and crashed
    # fresh installs at the rebuild step with "OMG CMake executable is
    # not found". v1.2.5 belt-and-braces it.
    if ! brew install \
        cmake \
        ffmpeg \
        pkg-config \
        cairo \
        pango \
        libpng \
        jpeg \
        giflib \
        librsvg \
        wireguard-tools; then
        echo -e "${RED}❌ Homebrew install failed for one or more required libraries.${NC}"
        echo -e "${YELLOW}Inspect the output above and re-run this script after fixing.${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ macOS system libraries installed${NC}"
}

# Main installation
main() {
    echo -e "${CYAN}Checking requirements...${NC}"
    echo ""
    
    # Check and install Git (on macOS this means Xcode CLT — see check_git
    # comment for why the obvious `command -v git` test gives a false
    # positive on a fresh Mac).
    if ! check_git; then
        install_git
    fi

    # On macOS, ensure Homebrew + system libraries are present BEFORE
    # touching Node/npm. Without this, npm rebuild canvas later silently
    # fails (no pkg-config / no cairo) and PDF/text thumbnails never work.
    if [[ "$OS" == "macos" ]]; then
        ensure_brew_macos
        install_macos_brew_libs
    fi

    # Install build dependencies for native modules (Debian/Ubuntu only)
    # This must happen BEFORE npm install to ensure native modules compile correctly
    install_build_deps

    # FFmpeg sanity check (we install it via brew on macOS and apt on Linux above)
    if command -v ffmpeg &> /dev/null; then
        echo -e "${GREEN}✓ FFmpeg available$(ffmpeg -encoders 2>&1 | grep -q libsvtav1 && echo ' (AV1 + H.264)' || echo ' (H.264)')${NC}"
    else
        echo -e "${YELLOW}⚠ FFmpeg not found — media encoding will be unavailable${NC}"
    fi
    
    # Check and install Node.js
    if ! check_node; then
        install_node
        # Refresh PATH
        export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
        hash -r 2>/dev/null || true
    fi
    
    # Check and install PM2
    if ! check_pm2; then
        install_pm2
    fi
    
    echo ""
    
    # Determine if we're in the repo or need to clone
    PC2_DIR=""
    
    if [[ -d "pc2-node" ]]; then
        # In repo root (has pc2-node subdirectory)
        PC2_DIR="$(pwd)/pc2-node"
        echo -e "${GREEN}✓ Found PC2 in current directory${NC}"
    elif [[ -f "package.json" ]] && grep -q '"@elastos/pc2-node"' package.json 2>/dev/null; then
        # Actually inside the pc2-node directory
        PC2_DIR="$(pwd)"
        echo -e "${GREEN}✓ Already in PC2 directory${NC}"
    elif [[ -d "$HOME/pc2.net/pc2-node" ]]; then
        # Already cloned
        PC2_DIR="$HOME/pc2.net/pc2-node"
        echo -e "${GREEN}✓ Found existing PC2 installation${NC}"
    else
        # Need to clone
        echo -e "${CYAN}Downloading PC2...${NC}"
        cd "$HOME"

        # Configure git for large repos over unreliable connections (e.g. China/GFW)
        git config --global http.version HTTP/1.1
        git config --global http.postBuffer 524288000

        CLONE_BRANCH="${PC2_BRANCH:-main}"
        CLONE_OK=false

        # Attempt 1: shallow clone (fast, small download)
        if git clone --depth 1 -b "$CLONE_BRANCH" https://github.com/Elacity/pc2.net.git 2>&1; then
            CLONE_OK=true
        else
            echo -e "${YELLOW}⚠ Shallow clone failed, retrying with full clone...${NC}"
            rm -rf pc2.net 2>/dev/null
            # Attempt 2: full clone (slower but sometimes more reliable)
            if git clone -b "$CLONE_BRANCH" https://github.com/Elacity/pc2.net.git 2>&1; then
                CLONE_OK=true
            fi
        fi

        # Restore default git http version
        git config --global --unset http.version 2>/dev/null || true

        if $CLONE_OK; then
            echo -e "${GREEN}✓ Downloaded PC2 (branch: ${CLONE_BRANCH})${NC}"
        else
            echo -e "${RED}❌ Failed to download PC2. If you are in China, try:${NC}"
            echo -e "${YELLOW}   1. Use a stable VPN connection${NC}"
            echo -e "${YELLOW}   2. Try a GitHub mirror: git clone https://ghproxy.com/https://github.com/Elacity/pc2.net.git${NC}"
            echo -e "${YELLOW}   3. Download the ZIP from https://github.com/Elacity/pc2.net/archive/refs/heads/main.zip${NC}"
            exit 1
        fi
        PC2_DIR="$HOME/pc2.net/pc2-node"
    fi
    
    echo ""
    echo -e "${CYAN}Setting up PC2...${NC}"
    cd "$PC2_DIR"
    
    # Install all dependencies from root (sets up workspace links)
    echo -e "${CYAN}Installing all dependencies (this takes a few minutes)...${NC}"
    ROOT_DIR="$(dirname "$PC2_DIR")"
    cd "$ROOT_DIR"
    
    # Create particle-auth .env if it doesn't exist (required for build)
    PARTICLE_ENV="$ROOT_DIR/packages/particle-auth/.env"
    if [[ ! -f "$PARTICLE_ENV" ]]; then
        echo -e "${CYAN}Setting up Particle Network configuration...${NC}"
        cat > "$PARTICLE_ENV" << 'PARTICLE_EOF'
VITE_PARTICLE_PROJECT_ID=01cdbdd6-b07e-45b5-81ca-7036e45dff0d
VITE_PARTICLE_CLIENT_KEY=cMSSRMUCgciyuStuvPg2FSLKSovXDmrbvknJJnLU
VITE_PARTICLE_APP_ID=1567a90d-9ff3-459a-bca8-d264685482cb
VITE_WALLETCONNECT_PROJECT_ID=0d1ac2ba93587a74b54f92189bdc341e
VITE_PUTER_API_URL=http://localhost:4200
PARTICLE_EOF
        echo -e "${GREEN}✓ Particle Network configured${NC}"
    fi
    # Use --ignore-scripts to skip husky prepare hook, --legacy-peer-deps for conflicts
    if ! npm install --legacy-peer-deps --ignore-scripts 2>&1; then
        echo -e "${YELLOW}⚠ Root install had issues, trying individual installs...${NC}"
        # Fallback: install in gui and pc2-node separately
        cd "$ROOT_DIR/src/gui"
        npm install --legacy-peer-deps --ignore-scripts 2>&1 || true
    fi
    
    # Also ensure pc2-node has its dependencies
    cd "$PC2_DIR"
    if ! npm install --legacy-peer-deps --ignore-scripts 2>&1; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    
    # Rebuild native modules (skipped by --ignore-scripts above).
    # This refreshes node-pty, canvas, etc. against the current Node ABI.
    # @photostructure/sqlite (v1.2.7+) ships prebuilds and doesn't need a
    # rebuild step, but it IS REQUIRED — if it fails to load, the database
    # won't initialise and the server crashes at boot with ERR_DLOPEN_FAILED.
    # The verification gauntlet below covers it. canvas is optional (PDF/text
    # thumbnails); a failure there is a warning, not fatal.
    #
    # The previous version swallowed every error with `|| true` and printed
    # "✓ Native modules built" regardless. That's how we ended up with
    # "Timeout waiting for server to start" on fresh installs — npm rebuild
    # silently failed, the script reported success, then the server crashed
    # at boot.
    echo -e "${CYAN}Building native modules (this can take a few minutes)...${NC}"
    cd "$ROOT_DIR"
    npm rebuild 2>&1 || echo -e "${YELLOW}⚠ Root npm rebuild had errors (often optional deps — see above)${NC}"

    cd "$PC2_DIR"
    # v1.2.7: dropped the explicit --build-from-source for `better-sqlite3`
    # because it was migrated to `@photostructure/sqlite` — a Node-API
    # library whose prebuilds are bundled inside the npm tarball and work
    # across all Node 20+ majors. No per-Node-version compile needed; no
    # Xcode CLT requirement on Mac.
    #
    # We still run `npm rebuild` (plain) so other native modules get a
    # chance to use a fresh prebuild matching the current Node ABI.
    # node-datachannel specifically needs prebuilds (its source-build path
    # requires cmake, which most users don't have).
    echo -e "${CYAN}Refreshing all native modules against current Node ABI...${NC}"

    # Refresh the rest using prebuilds when available — fast, and
    # tolerant of any module that doesn't have a prebuild for this Node
    # version (it'll fall back to source build, which is why we install
    # cmake/cairo/etc above).
    echo -e "${CYAN}Refreshing other native modules...${NC}"
    npm rebuild 2>&1 || echo -e "${YELLOW}⚠ Some optional natives didn't rebuild (non-fatal — see above)${NC}"

    echo -e "${GREEN}✓ Native modules built${NC}"

    # ──────────────────────────────────────────────────────────────────
    # Native module verification gauntlet.
    #
    # Each critical native module gets THREE attempts:
    #   1. Plain load — most common, works when prebuild-install resolved
    #      cleanly at npm-install time.
    #   2. Rebuild — covers ABI drift since last install (e.g. user
    #      upgraded their Node binary after a prior install).
    #   3. Clean reinstall — the nuclear option. Wipes node_modules/MOD
    #      entirely and runs `npm install MOD` which forces a fresh
    #      prebuild-install query against the CURRENT Node ABI. This
    #      is what Ahmed had to do manually after v1.2.4 silent-shipped
    #      a broken node-datachannel — `npm rebuild` reuses stale
    #      install metadata, only a clean reinstall queries fresh.
    #
    # If all three fail, exit with a fix-it-yourself hint that's
    # SPECIFIC to the module (cmake for node-datachannel; clean reinstall
    # for @photostructure/sqlite, which ships prebuilds and shouldn't
    # normally fail).
    # ──────────────────────────────────────────────────────────────────

    # Helper: load-test an ESM module via dynamic import.
    verify_esm_loads() {
        local mod="$1"
        node -e "import('${mod}').then(m => { if (!m) throw new Error('null'); }).catch(e => { console.error(e.message); process.exit(1); })" 2>&1
    }

    # Helper: load-test the CJS sqlite module by requiring + smoke-running it.
    verify_sqlite_loads() {
        node -e "const { DatabaseSync } = require('@photostructure/sqlite'); new DatabaseSync(':memory:').prepare('SELECT 1').get()" 2>&1
    }

    # ─── @photostructure/sqlite (v1.2.7+) ─────────────────────────────
    # Migrated from better-sqlite3 in v1.2.7. Bundled prebuilds + Node-API
    # mean the historical "needs Xcode CLT to recompile" failure mode is
    # gone. This gauntlet now mostly catches genuine node_modules corruption.
    echo -e "${CYAN}Verifying @photostructure/sqlite against Node $(node -v)...${NC}"
    if ! verify_sqlite_loads >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠ @photostructure/sqlite doesn't load — clean reinstalling...${NC}"
        rm -rf node_modules/@photostructure/sqlite
        npm install @photostructure/sqlite --legacy-peer-deps 2>&1 || true
        if ! verify_sqlite_loads >/dev/null 2>&1; then
            echo -e "${RED}❌ @photostructure/sqlite cannot be made to load — server cannot start.${NC}"
            echo -e "${YELLOW}This is unusual — the library ships prebuilds for all platforms.${NC}"
            echo -e "${YELLOW}Try a clean reinstall:${NC}"
            echo -e "${YELLOW}  cd $PC2_DIR && rm -rf node_modules package-lock.json && npm install${NC}"
            verify_sqlite_loads
            exit 1
        fi
        echo -e "${GREEN}✓ @photostructure/sqlite recovered via clean reinstall${NC}"
    else
        echo -e "${GREEN}✓ @photostructure/sqlite verified${NC}"
    fi

    # ─── node-datachannel ─────────────────────────────────────────────
    echo -e "${CYAN}Verifying node-datachannel against Node $(node -v)...${NC}"
    if ! verify_esm_loads node-datachannel >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠ node-datachannel doesn't load — clean reinstalling...${NC}"
        # The clean reinstall trick from Ahmed (v1.2.4 hotfix discovery,
        # Apr 30 2026): `npm rebuild` reuses stale install metadata, but
        # `rm -rf node_modules/MOD && npm install MOD` forces prebuild-
        # install to fetch fresh for the current Node ABI. With cmake
        # now installed up front, even the source-build fallback works
        # if prebuild-install can't find a binary.
        rm -rf node_modules/node-datachannel
        npm install node-datachannel --legacy-peer-deps 2>&1 || true
        if ! verify_esm_loads node-datachannel >/dev/null 2>&1; then
            echo -e "${RED}❌ node-datachannel cannot be made to load — server will crash-loop on boot.${NC}"
            echo -e "${YELLOW}Manual fix:${NC}"
            if [[ "$OS" == "macos" ]]; then
                echo -e "${YELLOW}  brew install cmake${NC}"
            else
                echo -e "${YELLOW}  sudo apt install cmake  (or your distro's equivalent)${NC}"
            fi
            echo -e "${YELLOW}  cd $PC2_DIR && rm -rf node_modules/node-datachannel && npm install node-datachannel${NC}"
            echo -e "${YELLOW}If that still fails, paste output to https://github.com/Elacity/pc2.net/issues${NC}"
            verify_esm_loads node-datachannel
            exit 1
        fi
        echo -e "${GREEN}✓ node-datachannel recovered via clean reinstall${NC}"
    else
        echo -e "${GREEN}✓ node-datachannel verified${NC}"
    fi
    
    # Build
    echo -e "${CYAN}Building PC2...${NC}"
    if ! npm run build 2>&1; then
        echo -e "${RED}❌ Build failed. Check errors above.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Build complete${NC}"
    
    # Install WireGuard for fast remote access.
    # On macOS this is already covered by install_macos_brew_libs() above —
    # we only need to do extra work on Linux here. The previous version had
    # a buggy `bash ... </dev/null` Homebrew bootstrap inside this branch
    # that would silently fail because `</dev/null` detached stdin from the
    # sudo prompt; we removed it because Homebrew is now installed up-front
    # in ensure_brew_macos() with a real TTY.
    if ! command -v wg &> /dev/null; then
        echo -e "${CYAN}Installing WireGuard for fast remote access...${NC}"
        if [[ "$OS" == "linux" ]]; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get install -y -qq wireguard-tools 2>&1 || true
            elif command -v yum &> /dev/null; then
                sudo yum install -y wireguard-tools 2>&1 || true
            fi
        fi
        if command -v wg &> /dev/null; then
            echo -e "${GREEN}✓ WireGuard installed${NC}"
        else
            echo -e "${YELLOW}⚠ WireGuard not installed — fast remote access unavailable${NC}"
        fi
    else
        echo -e "${GREEN}✓ WireGuard tools detected${NC}"
    fi

    # Configure passwordless sudo for wg-quick (required for background PM2 process)
    if command -v wg &> /dev/null; then
        WG_QUICK_PATH=$(which wg-quick 2>/dev/null)
        if [[ -n "$WG_QUICK_PATH" ]] && [[ ! -f /etc/sudoers.d/wireguard ]]; then
            echo -e "${CYAN}Configuring WireGuard permissions...${NC}"
            sudo sh -c "echo '$(whoami) ALL=(ALL) NOPASSWD: ${WG_QUICK_PATH}' > /etc/sudoers.d/wireguard && chmod 440 /etc/sudoers.d/wireguard"
            echo -e "${GREEN}✓ WireGuard permissions configured${NC}"
        fi
    fi

    # Install AmneziaWG stealth transport (DPI-resistant fallback)
    # On macOS, install to Homebrew prefix (no sudo needed).
    # On Linux, install to /usr/local/bin (sudo only on Linux where user expects it).
    if ! command -v amneziawg-go &> /dev/null; then
        echo -e "${CYAN}Installing AmneziaWG stealth transport (DPI-resistant fallback)...${NC}"

        if [[ "$OS" == "macos" ]]; then
            AWG_BIN_DIR="$(brew --prefix 2>/dev/null)/bin"
            [[ -z "$AWG_BIN_DIR" || "$AWG_BIN_DIR" == "/bin" ]] && AWG_BIN_DIR="/usr/local/bin"
        else
            AWG_BIN_DIR="/usr/local/bin"
        fi

        if ! command -v go &> /dev/null; then
            echo -e "${YELLOW}Go compiler not found -- installing Go to build AmneziaWG...${NC}"
            if [[ "$OS" == "macos" ]]; then
                brew install go 2>&1 || true
            elif command -v apt-get &> /dev/null; then
                sudo apt-get install -y -qq golang-go 2>&1 || true
            elif command -v yum &> /dev/null; then
                sudo yum install -y golang 2>&1 || true
            fi
        fi

        if command -v go &> /dev/null; then
            echo -e "${CYAN}Building amneziawg-go from source...${NC}"
            AWG_BUILD_DIR=$(mktemp -d)
            (cd "$AWG_BUILD_DIR" && git clone --depth 1 https://github.com/amnezia-vpn/amneziawg-go.git 2>&1 && cd amneziawg-go && make 2>&1 && cp amneziawg-go "$AWG_BIN_DIR/amneziawg-go" && chmod 755 "$AWG_BIN_DIR/amneziawg-go") || true
            rm -rf "$AWG_BUILD_DIR"
        fi

        if command -v amneziawg-go &> /dev/null; then
            echo -e "${GREEN}✓ AmneziaWG binary installed${NC}"
        else
            echo -e "${YELLOW}⚠ AmneziaWG build failed -- stealth transport will not be available${NC}"
        fi
    else
        echo -e "${GREEN}✓ AmneziaWG binary detected${NC}"
    fi

    # Install awg-quick (AmneziaWG interface manager)
    if ! command -v awg-quick &> /dev/null; then
        echo -e "${CYAN}Installing AmneziaWG tools (awg-quick)...${NC}"

        if [[ "$OS" == "macos" ]]; then
            AWG_BIN_DIR="$(brew --prefix 2>/dev/null)/bin"
            [[ -z "$AWG_BIN_DIR" || "$AWG_BIN_DIR" == "/bin" ]] && AWG_BIN_DIR="/usr/local/bin"
            AWG_QUICK_SCRIPT="darwin.bash"
        else
            AWG_BIN_DIR="/usr/local/bin"
            AWG_QUICK_SCRIPT="linux.bash"
        fi

        AWG_TOOLS_TMP=$(mktemp -d)
        git clone --depth 1 https://github.com/amnezia-vpn/amnezia-wg-tools.git "$AWG_TOOLS_TMP" 2>&1 || true
        if [[ -d "$AWG_TOOLS_TMP/src" ]]; then
            (cd "$AWG_TOOLS_TMP/src" && make 2>&1 && cp wg "$AWG_BIN_DIR/awg" && cp "wg-quick/$AWG_QUICK_SCRIPT" "$AWG_BIN_DIR/awg-quick" && chmod 755 "$AWG_BIN_DIR/awg" "$AWG_BIN_DIR/awg-quick") || true
        fi
        rm -rf "$AWG_TOOLS_TMP"

        if command -v awg-quick &> /dev/null; then
            echo -e "${GREEN}✓ AmneziaWG tools installed${NC}"
        else
            echo -e "${YELLOW}⚠ AmneziaWG tools build failed -- stealth transport will not be available${NC}"
        fi
    else
        echo -e "${GREEN}✓ AmneziaWG tools detected${NC}"
    fi

    # Patch awg-quick: upstream bugs:
    # 1. References /var/run/wireguard/ instead of /var/run/amneziawg/ for name/sock files
    # 2. Calls 'wg' (standard WireGuard CLI) instead of 'awg' (AmneziaWG CLI),
    #    which can't parse obfuscation parameters (Jc, Jmin, S1, H1, etc.)
    if command -v awg-quick &> /dev/null; then
        AWG_QUICK_PATH=$(which awg-quick 2>/dev/null)
        if grep -q '/var/run/wireguard/\$INTERFACE.name' "$AWG_QUICK_PATH" 2>/dev/null || grep -q 'cmd wg ' "$AWG_QUICK_PATH" 2>/dev/null; then
            echo -e "${CYAN}Patching awg-quick (fixing upstream bugs)...${NC}"
            sudo sed -i.bak \
                -e 's|/var/run/wireguard/\$INTERFACE\.name|/var/run/amneziawg/\$INTERFACE.name|g' \
                -e 's|/var/run/wireguard/\$REAL_INTERFACE\.sock|/var/run/amneziawg/\$REAL_INTERFACE.sock|g' \
                -e 's|cmd wg setconf|cmd awg setconf|g' \
                -e 's|cmd wg showconf|cmd awg showconf|g' \
                -e 's|wg show interfaces|awg show interfaces|g' \
                -e 's|wg show "\$REAL_INTERFACE"|awg show "\$REAL_INTERFACE"|g' \
                "$AWG_QUICK_PATH"
            sudo rm -f "${AWG_QUICK_PATH}.bak"
            echo -e "${GREEN}✓ awg-quick patched${NC}"
        fi
    fi

    # Configure passwordless sudo for AmneziaWG operations:
    # - awg-quick for interface management
    # - killall amneziawg-go for cleaning stale processes
    # - rm for cleaning stale runtime files
    if command -v awg-quick &> /dev/null; then
        AWG_QUICK_PATH=$(which awg-quick 2>/dev/null)
        KILLALL_PATH=$(which killall 2>/dev/null || echo "/usr/bin/killall")
        if [[ -x "$AWG_QUICK_PATH" ]]; then
            echo -e "${CYAN}Configuring AmneziaWG permissions...${NC}"
            sudo sh -c "cat > /etc/sudoers.d/amneziawg << 'SUDOEOF'
$(whoami) ALL=(ALL) NOPASSWD:SETENV: ${AWG_QUICK_PATH}
$(whoami) ALL=(ALL) NOPASSWD: ${KILLALL_PATH} amneziawg-go
$(whoami) ALL=(ALL) NOPASSWD: /bin/rm -rf /var/run/amneziawg/
SUDOEOF
chmod 440 /etc/sudoers.d/amneziawg"
            echo -e "${GREEN}✓ AmneziaWG permissions configured${NC}"
        fi
    fi

    # ============================================================
    # Install sing-box (VLESS Reality TCP stealth transport)
    # ============================================================
    if command -v sing-box &> /dev/null || test -x /usr/local/bin/sing-box; then
        echo -e "${GREEN}✓ sing-box already installed${NC}"
    else
        echo -e "${CYAN}Installing sing-box (VLESS Reality transport)...${NC}"
        SINGBOX_VERSION="1.13.0"
        if [[ "$OS" == "macos" ]]; then
            if command -v brew &> /dev/null; then
                brew install sing-box 2>&1 || true
            fi
            if ! command -v sing-box &> /dev/null; then
                ARCH=$(uname -m)
                [[ "$ARCH" == "arm64" ]] && SB_ARCH="arm64" || SB_ARCH="amd64"
                SB_TMP=$(mktemp -d)
                curl -sL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-darwin-${SB_ARCH}.tar.gz" -o "$SB_TMP/sing-box.tar.gz"
                (cd "$SB_TMP" && tar -xzf sing-box.tar.gz && cp sing-box-*/sing-box /usr/local/bin/sing-box && chmod 755 /usr/local/bin/sing-box) 2>/dev/null || true
                rm -rf "$SB_TMP"
            fi
        else
            ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
            SB_TMP=$(mktemp -d)
            wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -O "$SB_TMP/sing-box.tar.gz" 2>/dev/null || curl -sL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -o "$SB_TMP/sing-box.tar.gz"
            (cd "$SB_TMP" && tar -xzf sing-box.tar.gz && cp sing-box-*/sing-box /usr/local/bin/sing-box && chmod 755 /usr/local/bin/sing-box) 2>/dev/null || true
            rm -rf "$SB_TMP"
        fi
        if command -v sing-box &> /dev/null || test -x /usr/local/bin/sing-box; then
            echo -e "${GREEN}✓ sing-box installed${NC}"
        else
            echo -e "${YELLOW}⚠ sing-box installation failed (VLESS Reality will be unavailable)${NC}"
        fi
    fi

    # Detect if running on VPS (no DISPLAY) or local machine
    # Also get public IP for VPS users
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
    PUBLIC_IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || curl -s --max-time 3 icanhazip.com 2>/dev/null || echo "")
    
    # Determine the best URL to show
    if [[ -z "$DISPLAY" ]] && [[ -n "$SSH_CONNECTION" ]]; then
        # Running on VPS via SSH - show public IP
        ACCESS_URL="http://${PUBLIC_IP}:4200"
        ACCESS_NOTE="(your VPS public IP)"
    elif [[ -n "$LOCAL_IP" ]] && [[ "$LOCAL_IP" != "127."* ]]; then
        # Has a local network IP - show both localhost and LAN
        ACCESS_URL="http://localhost:4200"
        ACCESS_NOTE="or http://${LOCAL_IP}:4200 (LAN)"
    else
        # Default to localhost
        ACCESS_URL="http://localhost:4200"
        ACCESS_NOTE=""
    fi
    
    # Stop any existing pc2 process
    pm2 delete pc2 2>/dev/null || true

    # Start with pm2.
    #
    # v1.2.7+: prefer ecosystem.config.cjs (at PC2 repo root, one level
    # above pc2-node) over `pm2 start npm`. This:
    #   - registers the process with env defaults from the file
    #     (cluster pinning, log paths, restart_delay, kill_timeout, …)
    #   - runs `node dist/index.js` directly instead of via an npm
    #     wrapper — pm2 then kills the actual node on restart instead
    #     of orphaning the child process behind a dead npm shell
    #   - matches what update.sh / install-arm.sh do, so the in-app
    #     `pm2 startOrRestart ecosystem.config.cjs --only pc2 --update-env`
    #     used by UpdateService finds a matching app and refreshes env
    # Falls back to the old `pm2 start npm` form on the rare clone where
    # the ecosystem file is missing (e.g. very old branch checkout).
    echo -e "${CYAN}Starting PC2 with PM2 process manager...${NC}"
    PC2_ROOT_DIR="$(dirname "$PC2_DIR")"
    if [[ -f "$PC2_ROOT_DIR/ecosystem.config.cjs" ]]; then
        cd "$PC2_ROOT_DIR"
        pm2 start "$PC2_ROOT_DIR/ecosystem.config.cjs"
        cd "$PC2_DIR"
    else
        pm2 start npm --name "pc2" -- start
    fi
    
    # Wait a moment for server to start
    sleep 3
    
    echo ""
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║         ${CYAN}🌟 🌟 🌟   S U C C E S S !   🌟 🌟 🌟${GREEN}                   ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║     ${NC}Welcome to ${CYAN}ElastOS${NC}: The World Computer${GREEN}                     ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║                  ${YELLOW}Presented by Elacity Labs${GREEN}                      ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}📋 NEXT STEP:${GREEN}                                                 ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}1. Open your web browser (Chrome, Safari, Firefox)${GREEN}             ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}2. Go to this address:${GREEN}                                         ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║      ${YELLOW}➜  ${ACCESS_URL}${GREEN}                                  ║${NC}"
    if [[ -n "$ACCESS_NOTE" ]]; then
    echo -e "${GREEN}║         ${NC}${ACCESS_NOTE}${GREEN}                                    ║${NC}"
    fi
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}3. Connect your wallet to claim your personal cloud${GREEN}            ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${NC}Your data. Your AI. Your sovereignty.${GREEN}                         ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}║   ${YELLOW}USEFUL COMMANDS:${GREEN}                                              ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 logs pc2${GREEN}      - View server logs                         ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 restart pc2${GREEN}   - Restart the server                       ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 stop pc2${GREEN}      - Stop the server                          ║${NC}"
    echo -e "${GREEN}║     ${NC}pm2 status${GREEN}        - Check server status                      ║${NC}"
    echo -e "${GREEN}║                                                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}   ⬆️  SCROLL UP if you don't see the instructions above ⬆️${NC}"
    echo ""
    
    # Show logs (follow mode)
    echo -e "${CYAN}Showing server logs (Ctrl+C to exit logs, server keeps running):${NC}"
    echo ""
    pm2 logs pc2
}

# Run
main
