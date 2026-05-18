#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_URL="$(git -C "$SCRIPT_DIR/.." config --get remote.origin.url 2>/dev/null || true)"

STATE_DIR="/etc/nostr-over-bt-terminal"
STATE_FILE="$STATE_DIR/deploy.env"
SITE_NAME="nostr-over-bt-terminal"
INSTALL_DIR="/opt/nostr-over-bt-terminal"
WWW_DIR="/var/www/nostr-over-bt-terminal"
APP_DIR="apps/terminal-client"
BRANCH="master"
REPO_URL="${DEFAULT_REPO_URL:-}"
DOMAIN=""
PROXY_TYPE=""
FORCE_RECONFIGURE=0

log() {
  printf '[deploy-terminal] %s\n' "$*" >&2
}

warn() {
  printf '[deploy-terminal] warning: %s\n' "$*" >&2
}

die() {
  printf '[deploy-terminal] error: %s\n' "$*" >&2
  exit 1
}

ensure_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    exec sudo -E bash "$SCRIPT_PATH" "$@"
  fi
}

prompt_default() {
  local var_name="$1"
  local prompt="$2"
  local default_value="$3"
  local answer=""
  read -r -p "$prompt [$default_value]: " answer || true
  answer="${answer:-$default_value}"
  printf -v "$var_name" '%s' "$answer"
}

confirm() {
  local prompt="$1"
  local default_answer="${2:-N}"
  local answer=""
  read -r -p "$prompt [$default_answer]: " answer || true
  answer="${answer:-$default_answer}"
  case "${answer,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

shell_quote() {
  printf '%q' "$1"
}

expand_path() {
  local input="$1"

  if [[ -z "$input" ]]; then
    printf '%s' "$input"
    return 0
  fi

  if [[ "$input" == "~" ]]; then
    printf '%s' "${HOME:-$input}"
    return 0
  fi

  if [[ "$input" == "~/"* ]]; then
    printf '%s' "${HOME:-}${input:1}"
    return 0
  fi

  if [[ "$input" == /* ]]; then
    printf '%s' "$input"
    return 0
  fi

  printf '%s/%s' "$PWD" "$input"
}

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    [[ "${DEPLOY_REPO_URL:-}" ]] && REPO_URL="$DEPLOY_REPO_URL"
    [[ "${DEPLOY_BRANCH:-}" ]] && BRANCH="$DEPLOY_BRANCH"
    [[ "${DEPLOY_INSTALL_DIR:-}" ]] && INSTALL_DIR="$DEPLOY_INSTALL_DIR"
    [[ "${DEPLOY_WWW_DIR:-}" ]] && WWW_DIR="$DEPLOY_WWW_DIR"
    [[ "${DEPLOY_DOMAIN:-}" ]] && DOMAIN="$DEPLOY_DOMAIN"
    [[ "${DEPLOY_PROXY_TYPE:-}" ]] && PROXY_TYPE="$DEPLOY_PROXY_TYPE"
  fi

  INSTALL_DIR="$(expand_path "$INSTALL_DIR")"
  WWW_DIR="$(expand_path "$WWW_DIR")"
}

save_state() {
  install -d -m 0755 "$STATE_DIR"
  cat > "$STATE_FILE" <<EOF
DEPLOY_REPO_URL=$(shell_quote "$REPO_URL")
DEPLOY_BRANCH=$(shell_quote "$BRANCH")
DEPLOY_INSTALL_DIR=$(shell_quote "$INSTALL_DIR")
DEPLOY_WWW_DIR=$(shell_quote "$WWW_DIR")
DEPLOY_DOMAIN=$(shell_quote "$DOMAIN")
DEPLOY_PROXY_TYPE=$(shell_quote "$PROXY_TYPE")
EOF
}

sanitize_domain() {
  local input="$1"
  input="${input#http://}"
  input="${input#https://}"
  input="${input%%/*}"
  input="${input%%:*}"
  printf '%s' "$input"
}

detect_proxies() {
  local options=()

  if command -v caddy >/dev/null 2>&1; then
    options+=("caddy")
  fi
  if command -v nginx >/dev/null 2>&1; then
    options+=("nginx")
  fi
  if command -v apache2 >/dev/null 2>&1 || command -v httpd >/dev/null 2>&1; then
    options+=("apache")
  fi

  printf '%s\n' "${options[@]}"
}

choose_proxy() {
  local detected=()
  mapfile -t detected < <(detect_proxies)

  if [[ ${#detected[@]} -eq 0 ]]; then
    die "No supported reverse proxy detected. Install caddy, nginx, or apache2/httpd first."
  fi

  if [[ ${#detected[@]} -eq 1 ]]; then
    PROXY_TYPE="${detected[0]}"
    log "Detected reverse proxy: $PROXY_TYPE"
    return
  fi

  log "Multiple reverse proxies detected:"
  local i
  for i in "${!detected[@]}"; do
    printf '  %d) %s\n' "$((i + 1))" "${detected[$i]}"
  done

  local selection=""
  while true; do
    read -r -p "Choose proxy [1-${#detected[@]}]: " selection || true
    [[ -n "$selection" ]] || selection="1"
    if [[ "$selection" =~ ^[0-9]+$ ]] && (( selection >= 1 && selection <= ${#detected[@]} )); then
      PROXY_TYPE="${detected[$((selection - 1))]}"
      break
    fi
    warn "Invalid selection."
  done
}

ensure_git_repo() {
  if git -C "$INSTALL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "Using existing git checkout in $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --all --prune
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
    return
  fi

  if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
    die "$INSTALL_DIR exists but is not a git checkout. Move it aside before deploying."
  fi

  install -d -m 0755 "$(dirname "$INSTALL_DIR")"
  log "Cloning $REPO_URL into $INSTALL_DIR"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
}

install_dependencies_and_build() {
  log "Installing repository dependencies"
  (cd "$INSTALL_DIR" && npm ci)

  log "Installing terminal client dependencies"
  (cd "$INSTALL_DIR/$APP_DIR" && npm ci)

  log "Building terminal client"
  (cd "$INSTALL_DIR/$APP_DIR" && npm run build)
}

sync_dist_to_www() {
  if [[ -z "$WWW_DIR" || "$WWW_DIR" == "/" ]]; then
    die "Refusing to deploy into an unsafe web directory: '$WWW_DIR'"
  fi

  install -d -m 0755 "$WWW_DIR"
  log "Publishing dist/ to $WWW_DIR"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$INSTALL_DIR/$APP_DIR/dist/" "$WWW_DIR/"
    return
  fi

  shopt -s dotglob nullglob
  local existing=("$WWW_DIR"/*)
  if [[ ${#existing[@]} -gt 0 ]]; then
    rm -rf "${existing[@]}"
  fi
  cp -a "$INSTALL_DIR/$APP_DIR/dist/." "$WWW_DIR/"
}

write_nginx_config() {
  local config_dir=""
  local sites_enabled=""
  local config_file=""

  if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
    config_dir="/etc/nginx/sites-available"
    sites_enabled="/etc/nginx/sites-enabled"
  else
    config_dir="/etc/nginx/conf.d"
  fi

  install -d -m 0755 "$config_dir"
  config_file="$config_dir/$SITE_NAME.conf"

  cat > "$config_file" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    root $WWW_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(?:css|js|json|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
}
EOF

  if [[ -n "$sites_enabled" ]]; then
    ln -sfn "$config_file" "$sites_enabled/$SITE_NAME.conf"
  fi
}

write_apache_config() {
  local config_dir=""
  local enabled_dir=""
  local config_file=""
  local apache_service="apache2"

  if command -v httpd >/dev/null 2>&1; then
    apache_service="httpd"
  fi

  if [[ -d /etc/apache2/sites-available && -d /etc/apache2/sites-enabled ]]; then
    config_dir="/etc/apache2/sites-available"
    enabled_dir="/etc/apache2/sites-enabled"
  else
    config_dir="/etc/httpd/conf.d"
  fi

  install -d -m 0755 "$config_dir"
  config_file="$config_dir/$SITE_NAME.conf"

  cat > "$config_file" <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot "$WWW_DIR"

    <Directory "$WWW_DIR">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    FallbackResource /index.html
    DirectoryIndex index.html

    ErrorLog \${APACHE_LOG_DIR}/$SITE_NAME-error.log
    CustomLog \${APACHE_LOG_DIR}/$SITE_NAME-access.log combined
</VirtualHost>
EOF

  if [[ -n "$enabled_dir" ]]; then
    ln -sfn "$config_file" "$enabled_dir/$SITE_NAME.conf"
  fi

  echo "$apache_service"
}

find_caddyfile() {
  local candidates=(
    /etc/caddy/Caddyfile
    /etc/caddy/caddyfile
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

find_caddy_dropin_dir() {
  local candidates=(
    /etc/caddy/conf.d
    /etc/caddy/sites.d
    /etc/caddy/Caddyfile.d
    /etc/caddy.d
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

write_caddy_inline_config() {
  local caddyfile="$1"
  local tmp_file
  tmp_file="$(mktemp)"

  awk '
    /# BEGIN nostr-over-bt-terminal/ {skip=1; next}
    /# END nostr-over-bt-terminal/ {skip=0; next}
    skip != 1 { print }
  ' "$caddyfile" > "$tmp_file"

  cat >> "$tmp_file" <<EOF

# BEGIN nostr-over-bt-terminal
$DOMAIN {
    root * $WWW_DIR
    encode zstd gzip
    try_files {path} /index.html
    file_server
}
# END nostr-over-bt-terminal
EOF

  mv "$tmp_file" "$caddyfile"
  echo "$caddyfile"
}

ensure_caddy_dropin_import() {
  local caddyfile="$1"
  local dropin_glob="$2"

  if grep -qF "$dropin_glob" "$caddyfile"; then
    return 0
  fi

  local tmp_file
  tmp_file="$(mktemp)"
  cp "$caddyfile" "$tmp_file"

  cat >> "$tmp_file" <<EOF

# BEGIN nostr-over-bt-terminal
import $dropin_glob
# END nostr-over-bt-terminal
EOF

  mv "$tmp_file" "$caddyfile"
}

write_caddy_dropin_config() {
  local dropin_dir
  dropin_dir="$(find_caddy_dropin_dir)" || die "No supported Caddy drop-in directory found."
  local caddyfile
  caddyfile="$(find_caddyfile)" || die "Could not locate a Caddyfile under /etc/caddy."

  install -d -m 0755 "$dropin_dir"
  ensure_caddy_dropin_import "$caddyfile" "$dropin_dir/*.caddy"

  cat > "$dropin_dir/$SITE_NAME.caddy" <<EOF
$DOMAIN {
    root * $WWW_DIR
    encode zstd gzip
    try_files {path} /index.html
    file_server
}
EOF

  echo "$caddyfile"
}

write_caddy_config() {
  local dropin_dir=""
  if dropin_dir="$(find_caddy_dropin_dir)"; then
    log "Using Caddy drop-in directory: $dropin_dir"
    write_caddy_dropin_config
    return
  fi

  local caddyfile
  caddyfile="$(find_caddyfile)" || die "Could not locate a Caddyfile under /etc/caddy."
  log "Using inline Caddyfile: $caddyfile"
  write_caddy_inline_config "$caddyfile"
}

validate_and_reload() {
  local service_name="$1"
  case "$service_name" in
    caddy)
      local caddyfile
      caddyfile="$(write_caddy_config)"
      log "Validating Caddy configuration at $caddyfile"
      caddy validate --config "$caddyfile" --adapter caddyfile
      systemctl reload caddy 2>/dev/null || systemctl restart caddy
      ;;
    nginx)
      write_nginx_config
      log "Validating nginx configuration"
      nginx -t
      systemctl reload nginx 2>/dev/null || systemctl restart nginx
      ;;
    apache)
      local apache_service
      apache_service="$(write_apache_config)"
      log "Validating Apache configuration"
      if command -v apache2ctl >/dev/null 2>&1; then
        apache2ctl configtest
      else
        apachectl configtest
      fi
      systemctl reload "$apache_service" 2>/dev/null || systemctl restart "$apache_service"
      ;;
    *)
      die "Unknown proxy type: $service_name"
      ;;
  esac
}

show_summary() {
  cat <<EOF

Deployment complete.

  Repo:   $REPO_URL ($BRANCH)
  App:    $INSTALL_DIR/$APP_DIR
  Web:    $WWW_DIR
  Domain: $DOMAIN
  Proxy:  $PROXY_TYPE

EOF
}

main() {
  if [[ "${1:-}" == "--reconfigure" ]]; then
    FORCE_RECONFIGURE=1
  fi

  ensure_root "$@"
  load_state

  if [[ "$FORCE_RECONFIGURE" -eq 0 && -f "$STATE_FILE" ]]; then
    log "Loaded previous deployment settings from $STATE_FILE"
    if ! confirm "Reuse these settings and deploy now?" "Y"; then
      FORCE_RECONFIGURE=1
    fi
  fi

  if [[ "$FORCE_RECONFIGURE" -eq 1 || ! -f "$STATE_FILE" ]]; then
    prompt_default REPO_URL "Git repository URL" "$REPO_URL"
    prompt_default BRANCH "Git branch" "$BRANCH"
    prompt_default INSTALL_DIR "Install directory" "$INSTALL_DIR"
    prompt_default WWW_DIR "Web root directory" "$WWW_DIR"
    local domain_input=""
    prompt_default domain_input "Public web address (host only)" "${DOMAIN:-terminal.example.com}"
    DOMAIN="$(sanitize_domain "$domain_input")"
    choose_proxy
  fi

  INSTALL_DIR="$(expand_path "$INSTALL_DIR")"
  WWW_DIR="$(expand_path "$WWW_DIR")"
  save_state

  if [[ -z "$REPO_URL" ]]; then
    die "Repository URL is required. Re-run with --reconfigure and provide a git URL."
  fi

  [[ -n "$DOMAIN" ]] || die "Domain is required."

  ensure_git_repo
  install_dependencies_and_build
  sync_dist_to_www
  validate_and_reload "$PROXY_TYPE"
  show_summary
}

main "$@"
