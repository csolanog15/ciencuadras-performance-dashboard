const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.PAGESPEED_API_KEY;
if (!API_KEY) { console.error('ERROR: PAGESPEED_API_KEY not set'); process.exit(1); }

const URLS = [
  { url: 'https://www.ciencuadras.com/', page: 'Home' },
  { url: 'https://www.ciencuadras.com/arriendo', page: 'Arriendo' },
  { url: 'https://www.ciencuadras.com/venta', page: 'Venta' }
];
const STRATEGIES = ['mobile', 'desktop'];

function analyzeUrl(targetUrl, strategy) {
  return new Promise((resolve, reject) => {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=${strategy}&category=performance&key=${API_KEY}`;
    https.get(apiUrl, { timeout: 120000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          const audits = json.lighthouseResult.audits;
          resolve({
            score: Math.round(json.lighthouseResult.categories.performance.score * 100),
            lcp: audits['largest-contentful-paint'].displayValue,
            lcpMs: audits['largest-contentful-paint'].numericValue,
            cls: audits['cumulative-layout-shift'].displayValue,
            clsNum: audits['cumulative-layout-shift'].numericValue,
            tbt: audits['total-blocking-time'].displayValue,
            tbtMs: audits['total-blocking-time'].numericValue,
            fcp: audits['first-contentful-paint'].displayValue,
            fcpMs: audits['first-contentful-paint'].numericValue
          });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const results = [];
  for (const { url, page } of URLS) {
    for (const strategy of STRATEGIES) {
      console.log(`Analyzing: ${url} (${strategy})...`);
      try {
        const metrics = await analyzeUrl(url, strategy);
        results.push({ url, page, strategy, ...metrics });
        console.log(`  Score: ${metrics.score} | LCP: ${metrics.lcp} | CLS: ${metrics.cls}`);
      } catch (err) {
        console.error(`  ERROR: ${err.message}`);
        results.push({ url, page, strategy, score: null, error: err.message });
      }
      await sleep(3000);
    }
  }
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const hour = now.getUTCHours();
  const session = hour < 17 ? 'morning' : 'afternoon';
  const output = { date: dateStr, time: now.toISOString().split('T')[1].substring(0, 5), session, results };
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const filename = `${dateStr}${session === 'afternoon' ? '_pm' : ''}.json`;
  const filepath = path.join(dataDir, filename);
  if (fs.existsSync(filepath)) {
    const existing = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (Array.isArray(existing)) { existing.push(output); fs.writeFileSync(filepath, JSON.stringify(existing, null, 2)); }
    else { fs.writeFileSync(filepath, JSON.stringify([existing, output], null, 2)); }
  } else { fs.writeFileSync(filepath, JSON.stringify(output, null, 2)); }
  console.log(`\nResults saved to: ${filepath}`);
  generateDashboard(dataDir);
}

function generateDashboard(dataDir) {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).sort();
  const allData = [];
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    if (Array.isArray(content)) allData.push(...content);
    else allData.push(content);
  }
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'data.json'), JSON.stringify(allData, null, 2));
  console.log('Dashboard data updated: docs/data.json');
}

main().catch(err => { console.error(err); process.exit(1); });
