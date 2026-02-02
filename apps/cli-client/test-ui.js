import blessed from 'blessed';

console.log("Starting UI test...");
try {
    const screen = blessed.screen({
        smartCSR: true,
        title: 'Test'
    });

    const box = blessed.box({
        top: 'center',
        left: 'center',
        width: '50%',
        height: '50%',
        content: 'UI works! Press q to exit.',
        border: { type: 'line' },
        style: { border: { fg: 'green' } }
    });

    screen.append(box);
    screen.key(['q', 'C-c', 'escape'], () => {
        screen.destroy();
        console.log("UI test exited normally.");
        process.exit(0);
    });

    screen.render();
    
    // Auto exit after 2 seconds for non-interactive test
    setTimeout(() => {
        screen.destroy();
        console.log("UI test timed out (Success).");
        process.exit(0);
    }, 2000);

} catch (err) {
    console.error("UI Test Failed:", err);
    process.exit(1);
}
