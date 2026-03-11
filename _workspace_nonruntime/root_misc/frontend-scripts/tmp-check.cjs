const { chromium } = require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto('https://trial.youtestme.com/251003113025uvu/login.xhtml');
  await page.fill('input[name="loginForm:username"]','admin');
  await page.fill('input[name="loginForm:password"]','ZednyAdmin12#');
  await page.click('#loginForm\\:signInBtn');
  await page.waitForLoadState('networkidle');
  await page.goto('https://trial.youtestme.com/251003113025uvu/pages/quizzes.xhtml');
  await page.waitForLoadState('networkidle');
  const ids=['#allTestsFullForm\\:allTests\\:0\\:j_idt411','#allTestsFullForm\\:allTests\\:0\\:j_idt412','#allTestsFullForm\\:allTests\\:0\\:j_idt413'];
  for (const sel of ids){
    const cnt=await page.locator(sel).count();
    console.log(sel, cnt);
  }
  await browser.close();
})();
