#!/usr/bin/env bash
# ============================================================================
# InfraMind-SentinelX — WSL/Ubuntu setup script
# ----------------------------------------------------------------------------
# Installs everything needed to run the platform with REAL Docker + Kubernetes
# + SentinelX monitoring on Windows Subsystem for Linux (Ubuntu 22.04+).
#
# Usage:
#   chmod +x scripts/wsl-setup.sh
#   ./scripts/wsl-setup.sh                # full install
#   ./scripts/wsl-setup.sh docker         # only Docker
#   ./scripts/wsl-setup.sh k8s            # only kubectl + minikube
#   ./scripts/wsl-setup.sh deps           # only Node/Bun/Python deps
#   ./scripts/wsl-setup.sh verify         # verify install
#
# After running: start the Next.js dev server with `bun run dev` (port 3000)
# ============================================================================

set -euo pipefail

# Color helpers
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${BLUE}[info]${NC} $*"; }
err()  { echo -e "${RED}[err]${NC} $*" >&2; }

# Detect WSL vs native Linux
detect_wsl() {
  if grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"
  else
    echo "linux"
  fi
}

ENV=$(detect_wsl)
info "Detected environment: $ENV"

# ----------------------------------------------------------------------------
# Step 1: System packages
# ----------------------------------------------------------------------------
install_system_packages() {
  log "Updating apt and installing system packages..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    curl wget gnupg lsb-release ca-certificates apt-transport-https \
    build-essential pkg-config \
    git unzip jq \
    psutils procps \
    net-tools iproute2 \
    python3 python3-pip python3-venv \
    || {
      err "apt-get install failed. Try: sudo apt-get update && sudo apt-get -f install"
      exit 1
    }
  log "System packages installed."
}

# ----------------------------------------------------------------------------
# Step 2: Docker
# ----------------------------------------------------------------------------
install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker already installed: $(docker --version)"
  else
    log "Installing Docker Engine (official upstream repo)..."
    # Add Docker's official GPG key
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
      sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    # Add the repository to Apt sources
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    log "Docker installed."
  fi

  # Start Docker daemon
  if ! sudo systemctl is-active --quiet docker 2>/dev/null; then
    if [ "$ENV" = "wsl" ]; then
      warn "WSL detected — systemd may not be enabled."
      info "Starting docker daemon directly (no systemd)..."
      sudo service docker start 2>/dev/null || sudo dockerd > /tmp/dockerd.log 2>&1 &
      sleep 3
    else
      sudo systemctl enable --now docker
    fi
  fi

  # Verify
  if sudo docker info &>/dev/null; then
    log "Docker daemon is running."
  else
    err "Docker daemon did not start. Check:"
    err "  - WSL: ensure 'systemd=true' in /etc/wsl.conf OR start dockerd manually"
    err "  - Linux: sudo systemctl status docker"
    exit 1
  fi

  # Add user to docker group so we don't need sudo every time
  if ! groups | grep -qw docker; then
    warn "Adding $USER to docker group (run 'newgrp docker' or open a new shell)..."
    sudo usermod -aG docker "$USER" || true
  fi

  # Pull a small test image so docker stats has something to show
  if ! sudo docker images | grep -q alpine; then
    log "Pulling alpine:latest for container monitoring demo..."
    sudo docker pull alpine:latest 2>&1 | tail -3
  fi

  # Run a tiny demo container so the dashboard has something to show
  if ! sudo docker ps -a --format '{{.Names}}' | grep -q '^inframind-demo$'; then
    log "Starting demo container 'inframind-demo' (alpine sleep)..."
    sudo docker run -d --name inframind-demo --restart unless-stopped alpine:latest sh -c 'while true; do sleep 60; done' || true
  fi

  log "Docker setup complete."
}

# ----------------------------------------------------------------------------
# Step 3: Kubernetes (kubectl + minikube)
# ----------------------------------------------------------------------------
install_k8s() {
  # kubectl
  if command -v kubectl &>/dev/null; then
    log "kubectl already installed: $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1)"
  else
    log "Installing kubectl..."
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/$(dpkg --print-architecture)/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    rm -f kubectl
    log "kubectl installed."
  fi

  # minikube (best for WSL — kind also works but minikube has more dashboard-friendly defaults)
  if command -v minikube &>/dev/null; then
    log "minikube already installed."
  else
    log "Installing minikube..."
    curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-$(dpkg --print-architecture)
    sudo install minikube-linux-$(dpkg --print-architecture) /usr/local/bin/minikube
    rm -f minikube-linux-*
    log "minikube installed."
  fi

  # Start a single-node cluster if none is running
  if ! minikube status &>/dev/null 2>&1; then
    log "Starting minikube cluster (this may take 3-5 minutes on first run)..."
    if [ "$ENV" = "wsl" ]; then
      # In WSL we need --driver=none to avoid VirtualBox/Hyper-V conflicts
      # (requires docker, which we just installed). Requires the user to be in
      # the docker group OR run with sudo.
      sudo -E minikube start --driver=docker --kubernetes-version=v1.30.0 --memory=2g --cpus=2 || {
        warn "minikube with docker driver failed. Trying --driver=none..."
        sudo -E minikube start --driver=none --kubernetes-version=v1.30.0 || {
          err "minikube start failed. See: https://minikube.sigs.k8s.io/docs/drivers/"
          return 1
        }
      }
    else
      minikube start --driver=docker --kubernetes-version=v1.30.0 --memory=2g --cpus=2 || {
        err "minikube start failed."
        return 1
      }
    fi
    # Make minikube config accessible to non-root user
    sudo chown -R "$USER":"$USER" "$HOME/.minikube" "$HOME/.kube" 2>/dev/null || true
  else
    log "minikube cluster is already running."
  fi

  # Install metrics-server so `kubectl top pods` works (the dashboard uses this for live CPU/mem)
  if ! kubectl get deployment metrics-server -n kube-system &>/dev/null 2>&1; then
    log "Installing metrics-server so kubectl top works..."
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    # Wait for it to be ready (best-effort)
    info "Waiting 30s for metrics-server to be ready..."
    sleep 30
  fi

  # Deploy a tiny demo app so the K8s tab has something to show
  if ! kubectl get deployment inframind-demo -n default 2>/dev/null | grep -q inframind-demo; then
    log "Deploying inframind-demo (nginx) into the default namespace..."
    kubectl create deployment inframind-demo --image=nginx:alpine --replicas=2
    kubectl expose deployment inframind-demo --port=80 --type=NodePort
  fi

  log "Kubernetes setup complete."
  info "Useful commands:"
  info "  kubectl get pods -A         # list all pods"
  info "  kubectl top pods -A         # live CPU/memory (needs metrics-server)"
  info "  minikube dashboard          # open the k8s dashboard in a browser"
  info "  minikube stop               # stop the cluster"
  info "  minikube delete             # destroy the cluster"
}

# ----------------------------------------------------------------------------
# Step 4: Node/Bun deps + Prisma + db
# ----------------------------------------------------------------------------
install_deps() {
  if ! command -v node &>/dev/null; then
    log "Installing Node.js 20 LTS via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  fi
  log "Node version: $(node --version)"

  if ! command -v bun &>/dev/null; then
    log "Installing Bun (used for fast dev mode + the realtime mini-service)..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    # Persist in shell rc
    if ! grep -q 'BUN_INSTALL' "$HOME/.bashrc"; then
      echo '' >> "$HOME/.bashrc"
      echo '# Bun' >> "$HOME/.bashrc"
      echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
      echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$HOME/.bashrc"
    fi
  fi
  log "Bun version: $(bun --version 2>/dev/null || echo 'not on PATH yet — open a new shell')"

  # Install Python deps for SentinelX agent (if you want to run the agent)
  if [ -f /home/z/my-project/requirements.txt ]; then
    log "Installing Python deps for SentinelX agent..."
    pip3 install --user -r /home/z/my-project/requirements.txt 2>/dev/null || true
  fi

  # Install Node deps for the Next.js project
  if [ -f /home/z/my-project/package.json ]; then
    log "Installing Node.js dependencies (this may take a few minutes)..."
    cd /home/z/my-project
    if command -v bun &>/dev/null; then
      bun install
    else
      npm install
    fi

    # Initialize SQLite database via Prisma
    if [ -f prisma/schema.prisma ]; then
      log "Generating Prisma client + pushing schema to SQLite..."
      bunx prisma generate 2>/dev/null || npx prisma generate
      bunx prisma db push --accept-data-loss 2>/dev/null || npx prisma db push --accept-data-loss
    fi

    log "Dependencies + DB ready."
  fi
}

# ----------------------------------------------------------------------------
# Step 5: Verify
# ----------------------------------------------------------------------------
verify() {
  log "=== Verification ==="

  if command -v docker &>/dev/null; then
    if sudo docker info &>/dev/null; then
      log "Docker: RUNNING ($(sudo docker ps -q | wc -l) containers)"
      sudo docker ps --format '  - {{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null | head -5
    else
      err "Docker: INSTALLED but daemon not running (sudo service docker start)"
    fi
  else
    err "Docker: NOT INSTALLED"
  fi

  if command -v kubectl &>/dev/null; then
    if kubectl cluster-info &>/dev/null 2>&1; then
      log "Kubernetes: REACHABLE"
      log "  Nodes: $(kubectl get nodes --no-headers 2>/dev/null | wc -l)"
      log "  Pods:   $(kubectl get pods -A --no-headers 2>/dev/null | wc -l)"
      log "  Deployments: $(kubectl get deploy -A --no-headers 2>/dev/null | wc -l)"
    else
      warn "Kubernetes: kubectl installed but no cluster reachable (minikube start)"
    fi
  else
    err "Kubernetes: NOT INSTALLED"
  fi

  if command -v node &>/dev/null; then
    log "Node.js: $(node --version)"
  fi
  if command -v bun &>/dev/null; then
    log "Bun: $(bun --version)"
  fi

  if [ -f /home/z/my-project/db/custom.db ]; then
    log "SQLite DB: exists"
  elif [ -f /home/z/my-project/prisma/dev.db ]; then
    log "SQLite DB: exists (prisma/dev.db)"
  else
    warn "SQLite DB: not found (run 'bunx prisma db push' from project root)"
  fi

  # Test live collector (curl localhost:3000/api/v1/live)
  if curl -sf http://localhost:3000/api/v1/live &>/dev/null; then
    log "Next.js dev server: REACHABLE on :3000"
  else
    warn "Next.js dev server: not running (cd /home/z/my-project && bun run dev)"
  fi

  log "=== Verification complete ==="
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
main() {
  local cmd="${1:-all}"
  case "$cmd" in
    all)
      install_system_packages
      install_docker
      install_k8s
      install_deps
      verify
      ;;
    system) install_system_packages ;;
    docker) install_docker ;;
    k8s)    install_k8s ;;
    deps)   install_deps ;;
    verify) verify ;;
    *)
      echo "Usage: $0 [all|system|docker|k8s|deps|verify]"
      exit 1
      ;;
  esac
}

main "$@"
