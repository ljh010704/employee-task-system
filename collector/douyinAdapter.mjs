export class ReauthRequiredError extends Error {
  constructor(message = 'Douyin session requires login') {
    super(message);
    this.code = 'reauth_required';
  }
}

// Selectors and URLs are deliberately not guessed. Fill them only after a
// human has verified the test store pages and platform permissions.
export class DouyinAdapter {
  constructor(page) { this.page = page; }

  async openHome() {
    await this.page.goto(process.env.DOUTIAN_HOME_URL || 'https://fxg.jinritemai.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  async assertLoggedIn() {
    // Verified from the test store: the authenticated home page is this route.
    if (this.page.url().includes('/ffa/mshop/homepage')) return;
    if (!process.env.DOUTIAN_LOGIN_CHECK_SELECTOR) throw new Error('DOUTIAN_LOGIN_CHECK_SELECTOR is not configured for a verified test-store page');
    const visible = await this.page.locator(process.env.DOUTIAN_LOGIN_CHECK_SELECTOR).isVisible().catch(() => false);
    if (!visible) throw new ReauthRequiredError();
  }

  async collect() {
    throw new Error('Douyin selectors are not configured. Verify a test store before enabling collection.');
  }
}
