import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { chromium } from 'playwright-core';
import { DouyinAdapter, ReauthRequiredError } from './douyinAdapter.mjs';

const VERSION = '0.1.0';
const collectorDir = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(collectorDir, 'agent.env');

async function loadEnvFile() {
  try {
    const text = await fs.readFile(envFile, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

await loadEnvFile();

const serverUrl = (process.env.COLLECTOR_SERVER_URL || '').replace(/\/$/, '');
const token = process.env.COLLECTOR_INGEST_TOKEN || '';
const agentId = process.env.COLLECTOR_AGENT_ID || os.hostname();
const agentName = process.env.COLLECTOR_AGENT_NAME || os.hostname();
const profileRoot = process.env.COLLECTOR_PROFILE_ROOT || path.join(process.env.LOCALAPPDATA || os.homedir(), 'EmployeeTaskCollector', 'profiles');
const chromePath = process.env.DOUTIAN_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function requireServer() {
  if (!serverUrl || !token) throw new Error('COLLECTOR_SERVER_URL and COLLECTOR_INGEST_TOKEN are required');
}

function headers(extra = {}) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-collector-agent-id': agentId, ...extra };
}

async function api(route, options = {}) {
  requireServer();
  const response = await fetch(`${serverUrl}${route}`, { ...options, headers: headers(options.headers) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || response.statusText}`);
  return body;
}

function safeProfileId(value) {
  if (!value || value !== path.basename(value) || /[\\/]/.test(value)) throw new Error(`Invalid browser_profile_id: ${value}`);
  return value;
}

async function openStore(store) {
  const profileDir = path.join(profileRoot, safeProfileId(store.browser_profile_id));
  await fs.mkdir(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, { headless: false, executablePath: chromePath, viewport: { width: 1440, height: 900 } });
  const page = context.pages()[0] || await context.newPage();
  return { context, page, adapter: new DouyinAdapter(page) };
}

async function finish(commandId, status, result = {}, error = null) {
  return api(`/api/collector/commands/${commandId}/finish`, { method: 'POST', body: JSON.stringify({ status, result, error }) });
}

async function runCommand(command) {
  await api(`/api/collector/commands/${command.id}/start`, { method: 'POST' });
  const store = command.store_configs;
  if (!store?.store_code || !store.browser_profile_id) throw new Error('Command did not include store browser profile metadata');
  let context;
  try {
    const opened = await openStore(store);
    context = opened.context;
    if (command.command_type === 'login' || command.command_type === 'reauth') {
      await opened.adapter.openHome();
      console.log(`[${store.store_code}] browser opened; complete login manually.`);
      const deadline = Date.now() + Number(process.env.COLLECTOR_LOGIN_WAIT_MS || 300000);
      while (Date.now() < deadline && !opened.page.url().includes('/ffa/mshop/homepage')) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await opened.adapter.assertLoggedIn();
      await finish(command.id, 'success', { store_code: store.store_code, action: command.command_type });
    } else if (command.command_type === 'collect') {
      await opened.adapter.assertLoggedIn();
      const result = await opened.adapter.collect();
      await api('/api/collector/ingest', { method: 'POST', body: JSON.stringify({ ...result, store_code: store.store_code, source: `agent:${agentId}` }) });
      await finish(command.id, 'success', { store_code: store.store_code, counts: result.counts || {} });
    }
  } catch (error) {
    const reauth = error instanceof ReauthRequiredError || error?.code === 'reauth_required';
    await finish(command.id, reauth ? 'reauth_required' : 'failed', {}, error instanceof Error ? error.message : String(error));
  } finally {
    await context?.close().catch(() => {});
  }
}

async function heartbeat(status = 'online', lastError = null) {
  await api('/api/collector/heartbeat', { method: 'POST', body: JSON.stringify({ agent_id: agentId, agent_name: agentName, version: VERSION, status, last_error: lastError }) });
}

async function runAgent() {
  requireServer();
  await heartbeat();
  setInterval(() => heartbeat().catch((error) => console.error('heartbeat failed:', error.message)), 30000);
  for (;;) {
    try {
      const commands = await api(`/api/collector/commands?agent_id=${encodeURIComponent(agentId)}`);
      if (commands[0]) await runCommand(commands[0]);
    } catch (error) {
      console.error('collector loop failed:', error.message);
      await heartbeat('online', error.message).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.COLLECTOR_POLL_MS || 5000)));
  }
}

async function directLogin() {
  const args = process.argv.slice(3);
  const profileId = args[args.indexOf('--profile-id') + 1];
  const opened = await openStore({ browser_profile_id: profileId });
  try {
    await opened.adapter.openHome();
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    await input.question('完成人工登录后按回车关闭浏览器…');
    input.close();
  } finally { await opened.context.close(); }
}

const command = process.argv[2] || 'run';
if (command === 'login' || command === 'reauth') await directLogin();
else if (command === 'health') { await heartbeat(); console.log('collector agent online'); }
else if (command === 'collect') throw new Error('Use the server command queue for collect; this keeps one-store-at-a-time scheduling.');
else await runAgent();
