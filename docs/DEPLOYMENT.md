# Deployment

The repository includes an interactive deployment script for the terminal web app:

```bash
npm run deploy:terminal-web
```

What it does:

- Clones or updates the repository from git
- Installs the repository root dependencies before building the terminal client
- Installs and builds `apps/terminal-client`
- Publishes the built `dist/` directory into a web root such as `/var/www/nostr-over-bt-terminal`
- Detects an installed reverse proxy and writes the matching site config
- Validates the proxy config before reloading the service
- Stores the deployment choices in `/etc/nostr-over-bt-terminal/deploy.env` for later runs
- Reuses an existing git checkout at the install directory instead of cloning again

First-run prompts:

- Git repository URL
- Git branch
- Install directory
- Web root directory
- Public web address / host name
- Reverse proxy choice when multiple supported proxies are installed

Supported proxy types:

- Caddy
- Nginx
- Apache 2 / httpd

Notes:

- The script is intended to run on the target server with root access or via `sudo`.
- `~` and relative install/web-root paths are expanded before use.
- Caddy uses the first supported drop-in directory it finds, such as `/etc/caddy/conf.d`, `/etc/caddy/sites.d`, `/etc/caddy/Caddyfile.d`, or `/etc/caddy.d`, and adds an import line to the main Caddyfile if needed.
- If no Caddy drop-in directory exists, the script writes the site block directly into the main Caddyfile.
- The Caddy preflight checks exact hosts and wildcard overlaps, so subdomains like `app.example.com` are rejected if `*.example.com` is already defined.
- After reloading the proxy, the script smoke-tests the site locally over HTTP, and for Caddy also over HTTPS with SNI so certificate issuance is exercised.
- If the proxy reload or restart fails, the script prints the service status and recent journal lines before exiting.
- Nginx and Apache get static SPA site configs that fall back to `index.html`.
- If you want to re-run the prompts, pass `--reconfigure`:

```bash
bash scripts/deploy-terminal-web.sh --reconfigure
```
