const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'win32' && fs.existsSync(edgePath) ? edgePath : undefined);
  const browser = await puppeteer.launch({ 
    headless: 'new',
    ...(executablePath ? { executablePath } : {})
  });
  const page = await browser.newPage();
  
  // Listen for console logs
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  try {
    console.log('Navigating to http://localhost:5174/ ...');
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Simulate a user that has an interrupted onboarding state
    await page.evaluate(() => {
      localStorage.setItem('rezel_onboarding_interrupted', 'true');
      localStorage.setItem('rezel_onboarding_completed', 'false');
      localStorage.setItem('rezel_onboarding_stage', 'providers');
    });

    console.log('Reloading page to apply state...');
    await page.reload({ waitUntil: 'networkidle0' });

    console.log('Waiting for CONTINUE SETUP button to appear...');
    
    // Check what is at the center of the screen
    console.log('Checking center element before clicking...');
    const centerDiagnostic = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (!el) return 'No element found';
      
      let path = [];
      let current = el;
      while (current && current !== document.body) {
        let tag = current.tagName;
        if (current.id) tag += '#' + current.id;
        if (current.className && typeof current.className === 'string') tag += '.' + current.className.split(' ').join('.');
        path.push(tag);
        current = current.parentElement;
      }
      
      const styles = window.getComputedStyle(el);
      return `Center element: ${el.tagName}#${el.id}.${typeof el.className === 'string' ? el.className : ''} (z-index: ${styles.zIndex}, pointer-events: ${styles.pointerEvents})\nPath: ${path.reverse().join(' > ')}`;
    });
    console.log('[DIAGNOSTIC] ' + centerDiagnostic);

    // Wait for the CONTINUE SETUP button
    await page.waitForFunction(() => {
      const buttons = document.querySelectorAll('button');
      return Array.from(buttons).some(b => b.textContent && b.textContent.includes('CONTINUE SETUP'));
    }, { timeout: 10000 }).catch(() => {});

    // Find and click the button
    const buttons = await page.$$('button');
    let fieldButton = null;
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && text.includes('CONTINUE SETUP')) {
        fieldButton = b;
        break;
      }
    }
    
    if (fieldButton) {
      console.log('CONTINUE SETUP button found! Clicking...');
      await fieldButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const afterClickDiagnostic = await page.evaluate(() => {
        const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return el ? `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}` : 'none';
      });
      console.log('Center element after click: ' + afterClickDiagnostic);
    } else {
      console.log('CONTINUE SETUP button NOT found. Current body HTML:');
      const html = await page.evaluate(() => document.body.innerHTML);
      console.log(html.substring(0, 1000) + '...');
    }
    
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
})();
