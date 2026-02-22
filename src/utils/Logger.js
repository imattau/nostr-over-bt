/**
 * Lightweight Logger utility to wrap console calls.
 * Provides a prefix and allows for future extensibility (e.g. silencing logs).
 */
class Logger {
    constructor(prefix = 'nostr-bt') {
        this.prefix = `[${prefix}]`;
        this.enabled = true;
    }

    log(...args) {
        if (!this.enabled) return;
        console.log(this.prefix, ...args);
    }

    warn(...args) {
        if (!this.enabled) return;
        console.warn(this.prefix, ...args);
    }

    error(...args) {
        if (!this.enabled) return;
        console.error(this.prefix, ...args);
    }

    info(...args) {
        if (!this.enabled) return;
        console.info(this.prefix, ...args);
    }

    disable() {
        this.enabled = false;
    }

    enable() {
        this.enabled = true;
    }
}

export const logger = new Logger();
export default logger;
