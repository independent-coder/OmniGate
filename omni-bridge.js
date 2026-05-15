const { chromium } = require('playwright');

(async () => {
    const targetUrl = process.argv[2];
    if (!targetUrl) process.exit(1);

    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
        ] 
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
        viewport: { width: 10, height: 10 },
        deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    page.on('request', request => {
        const url = request.url();
        if (url.includes('workers.dev') && url.includes('.m3u8')) {
            console.log(JSON.stringify({
                streamUrl: url,
                originalUrl: targetUrl,
                success: true
            }));
            process.exit(0);
        }
    });

    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.mouse.wheel(0, 100); 
        await page.waitForTimeout(2000);
        
        const playButton = page.locator('div[class*="play"], .vjs-big-play-button, #player').first();
        if (await playButton.isVisible()) {
            await playButton.click();
        }

        await page.waitForTimeout(15000);
    } catch (e) {}

    await browser.close();
    console.log(JSON.stringify({ success: false, originalUrl: targetUrl }));
    process.exit(1);
})();