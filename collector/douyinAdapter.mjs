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

  async discoverStores() {
    await this.assertLoggedIn();
    const payloads = [];
    const onResponse = async (response) => {
      const url = response.url();
      if (!/store|shop|mshop|subject|login/i.test(url)) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;
      try { payloads.push(await response.json()); } catch {}
    };
    this.page.on('response', onResponse);
    try {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(Number(process.env.DOUTIAN_DISCOVERY_WAIT_MS || 3000));
    } finally {
      this.page.off('response', onResponse);
    }

    const records = extractStoreRecords(payloads);
    if (records.length > 0) return records;

    const visibleText = await this.page.locator('body').innerText().catch(() => '');
    throw new Error(`No stores detected after login. Verify the account store switcher page and selectors. Page text: ${visibleText.slice(0, 300)}`);
  }

  async collect() {
    throw new Error('Douyin selectors are not configured. Verify a test store before enabling collection.');
  }
}

function extractStoreRecords(values) {
  const records = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const id = firstText(value, ['store_id', 'shop_id', 'storeId', 'shopId', 'id']);
    const name = firstText(value, ['store_name', 'shop_name', 'storeName', 'shopName', 'name']);
    if (id && name && id.length <= 128 && name.length <= 200 && !/^\d{1,2}$/.test(name)) {
      records.push({ store_code: id, store_name: name, category: '未分组' });
    }
    Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return Array.from(new Map(records.map((record) => [record.store_code, record])).values());
}

function firstText(value, keys) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const text = String(candidate).trim();
      if (text) return text;
    }
  }
  return null;
}
