import blessed from 'blessed';
import contrib from 'blessed-contrib';

export class TerminalUi {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'Nostr-over-BT Command Center',
            mouse: true // Enable mouse support
        });
        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        // 1. Live Feed
        this.timeline = this.grid.set(0, 0, 8, 6, blessed.log, {
            label: ' 📜 Global Feed ',
            tags: true,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } },
            scrollable: true,
            alwaysScroll: true,
            wrap: true,
            scrollbar: { ch: ' ', inverse: true }
        });

        // Mouse wheel support for the timeline
        this.timeline.on('wheeldown', () => {
            this.timeline.scroll(2);
            this.screen.render();
        });
        this.timeline.on('wheelup', () => {
            this.timeline.scroll(-2);
            this.screen.render();
        });

        // 2. Swarm Map
        this.map = this.grid.set(0, 6, 4, 6, contrib.map, {
            label: ' 🌍 Global Swarm '
        });

        // 3. Search & Trends (Moved to bottom horizontal)
        this.searchPanel = this.grid.set(8, 0, 2, 9, blessed.log, {
            label: ' 🔍 Discovery & Search ', tags: true, border: { type: 'line' },
            style: { border: { fg: 'magenta' } }
        });

        // 4. Download Speed Sparkline (Moved to right middle)
        this.sparkline = this.grid.set(4, 6, 4, 6, contrib.sparkline, {
            label: ' ⚡ Network Throughput (KB/s) ',
            tags: true, border: { type: 'line' },
            lineColor: 'green'
        });

        // 5. Swarm Table
        this.swarmStats = this.grid.set(8, 9, 2, 3, contrib.table, {
            label: ' 🛰 Stats ', columnWidth: [10, 8],
            border: { type: 'line' }, style: { border: { fg: 'green' } }
        });

        // 6. Command Input
        this.input = this.grid.set(10, 0, 2, 12, blessed.textbox, {
            label: ' ⌨️ COMMANDS: /new <msg> | /follow <pk> | /help ',
            border: { type: 'line' }, style: { border: { fg: 'white' } },
            inputOnFocus: true
        });

        this.commands = ['/new', '/search', '/follow', '/clear', '/help', '/quit', '/relay add', '/relay list', '/tracker add'];
        this.speedHistory = new Array(60).fill(0);
        this.setupKeys();
    }

    setupKeys() {
        this.screen.key(['escape', 'C-c'], () => process.exit(0));

        this.screen.on('keypress', (ch, key) => {
            // Tab for Auto-completion
            if (key.name === 'tab' && this.input.focused) {
                const val = this.input.getValue();
                if (val.startsWith('/')) {
                    const matches = this.commands.filter(c => c.startsWith(val.trim()));
                    if (matches.length > 0) {
                        const currentMatchIndex = matches.indexOf(val.trim());
                        const nextMatch = matches[(currentMatchIndex + 1) % matches.length];
                        this.input.setValue(nextMatch + ' ');
                        this.screen.render();
                    }
                }
                return false;
            }

            // PageUp / PageDown for scrolling the feed
            if (key.name === 'pageup' || key.full === 'pageup' || key.name === 'prior') {
                this.timeline.scroll(-5);
                this.screen.render();
                return false;
            }
            if (key.name === 'pagedown' || key.full === 'pagedown' || key.name === 'next') {
                this.timeline.scroll(5);
                this.screen.render();
                return false;
            }
        });

        this.input.on('submit', (val) => {
            if (val && val.trim().length > 0) {
                this.onInput(val);
            }
            this.input.clearValue();
            this.input.focus();
            this.screen.render();
        });
    }

    logMessage(author, content, source = 'Relay') {
        const color = source === 'P2P' ? 'green' : 'blue';
        const time = new Date().toLocaleTimeString();
        
        // Header line
        this.timeline.log(`{bold}{yellow-fg}${author.substring(0,8)}{/} {grey-fg}${time}{/} {${color}-fg}[${source}]{/}`);
        
        // Escape content to prevent {tags} in Nostr posts from breaking the UI
        const escapedContent = blessed.escape(content).replace(/\n/g, '\n ');
        this.timeline.log(` ${escapedContent}`);
        
        // Dynamic separator width - use a safe fixed percentage or floor
        const width = Math.max(10, Math.floor(this.timeline.width - 6));
        const separator = width > 0 ? '─'.repeat(width) : '───';
        this.timeline.log(`{grey-fg}${separator}{/}`);
        
        this.screen.render();
    }

    logDiscovery(msg) {
        this.searchPanel.log(`{yellow-fg}•{/} ${msg}`);
    }

    updateNetwork(speedKB = 0, peers = 0, dhtNodes = 0) {
        this.speedHistory.shift();
        this.speedHistory.push(speedKB || 0);
        this.sparkline.setData(['Download'], [this.speedHistory]);

        this.swarmStats.setData({
            headers: ['Metric', 'Val'],
            data: [['Peers', (peers || 0).toString()], ['DHT', (dhtNodes || 0).toString()], ['KB/s', (speedKB || 0).toString()]]
        });

        if (peers > 0 && Math.random() > 0.7) {
            const lon = Math.floor(Math.random() * 360) - 180;
            const lat = Math.floor(Math.random() * 180) - 90;
            this.map.addMarker({ "lon": lon, "lat": lat, color: "red", char: "X" });
        }

        this.screen.render();
    }

    render() {
        this.input.focus();
        this.screen.render();
    }
}
