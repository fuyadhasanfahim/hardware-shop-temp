const puppeteer = require('puppeteer');

// Reuse a single Chromium instance across requests. Launching the browser on
// every request is slow and is itself a frequent source of the intermittent
// "Page.printToPDF: Printing failed" protocol error on Windows.
let browserPromise = null;

const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    // Route Chromium's name resolution through Cloudflare (1.1.1.1) and Google
    // (8.8.8.8) via DNS-over-HTTPS. This makes resolving the Google Fonts CDN
    // used by the report template fast and reliable across networks.
    '--dns-over-https-mode=secure',
    '--dns-over-https-templates=https://cloudflare-dns.com/dns-query https://dns.google/dns-query',
];

const getBrowser = async () => {
    if (browserPromise) {
        try {
            const existing = await browserPromise;
            if (existing.isConnected()) return existing;
        } catch (_) {
            // fall through and relaunch
        }
        browserPromise = null;
    }

    browserPromise = puppeteer.launch({
        headless: true,
        args: LAUNCH_ARGS,
    });

    return browserPromise;
};

const closeBrowser = async () => {
    if (!browserPromise) return;
    const current = browserPromise;
    browserPromise = null;
    try {
        const browser = await current;
        await browser.close();
    } catch (_) {
        // ignore – the browser is being discarded anyway
    }
};

const FOOTER_TEMPLATE = `
    <div style="font-size:8px; width:100%; padding:0 16mm; color:#9ca3af;
                display:flex; justify-content:space-between; align-items:center;
                font-family: Arial, sans-serif;">
        <span>Hardware Shop Management System</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`;

const renderPDF = async (htmlContent) => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        // 'domcontentloaded' returns as soon as the markup is parsed; we then
        // wait (briefly) for web fonts so the layout is final without ever
        // hanging on a slow/blocked CDN.
        await page.setContent(htmlContent, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        await Promise.race([
            page.evaluate(() => document.fonts.ready),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);

        // Emulating the 'screen' media type avoids the "Printing failed" error
        // that Chrome throws for some print-media layouts.
        await page.emulateMediaType('screen');

        const pdfData = await page.pdf({
            format: 'A4',
            printBackground: true,
            timeout: 120000,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: FOOTER_TEMPLATE,
            margin: {
                top: '14mm',
                bottom: '16mm',
                left: '12mm',
                right: '12mm',
            },
        });

        // puppeteer v23+ returns a Uint8Array; Express only streams Buffers
        // correctly, otherwise it JSON-serialises the array and corrupts the file.
        return Buffer.from(pdfData);
    } finally {
        await page.close().catch(() => {});
    }
};

const generatePDF = async (htmlContent) => {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            return await renderPDF(htmlContent);
        } catch (error) {
            lastError = error;
            console.error(
                `Error generating PDF (attempt ${attempt}/2):`,
                error.message,
            );
            // The browser may be in a bad state – discard it so the retry
            // starts from a fresh Chromium instance.
            await closeBrowser();
        }
    }
    throw lastError;
};

// Make sure Chromium is torn down when the server stops.
process.on('exit', closeBrowser);
process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
});

module.exports = {
    generatePDF,
};
