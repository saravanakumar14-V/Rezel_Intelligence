import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Inject mock for Tauri's IPC before the page loads
  await page.evaluateOnNewDocument(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        if (cmd === 'read_app_file') {
          return JSON.stringify({
            version: 1,
            conversations: [],
            entries: [
              { key: 'onboarding_interrupted', value: 'true', category: 'preference' },
              { key: 'onboarding_completed', value: 'false', category: 'preference' },
              { key: 'onboarding_stage', value: 'environment', category: 'preference' }
            ]
          });
        }
        if (cmd === 'write_app_file') {
          return null;
        }
        return null;
      }
    };
  });

  await page.goto('http://localhost:5173');

  console.log('Waiting for Resume Prompt...');
  await page.waitForFunction(() => {
    return document.body.innerText.includes('Previous Setup Detected');
  }, { timeout: 10000 });
  console.log('Resume Prompt found.');

  const preClickText = await page.evaluate(() => document.body.innerText);

  console.log('Clicking CONTINUE SETUP...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.innerText.includes('CONTINUE SETUP'));
    if (btn) btn.click();
  });

  console.log('Waiting 1 second...');
  await new Promise(r => setTimeout(r, 1000));

  const postClickText = await page.evaluate(() => document.body.innerText);

  if (postClickText.includes('Previous Setup Detected')) {
    console.log('FAIL: UI did not advance. It still shows Previous Setup Detected.');
  } else if (postClickText.includes('ENVIRONMENT DISCOVERY') || postClickText.includes('Your System Environment')) {
    console.log('SUCCESS: UI advanced to Environment Stage!');
  } else {
    console.log('UNKNOWN STATE. Current text:');
    console.log(postClickText.slice(0, 500));
  }

  await browser.close();
})();
