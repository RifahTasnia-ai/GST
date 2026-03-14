// Quick test: can we get a response from OpenClaw at all?
const http = require('http');

const TOKEN = 'af5706d7693ad611e6f9b31648624713c44a856709b8548c';

function testEndpoint(port, path, method, bodyObj) {
  return new Promise((resolve) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      let firstChunk = '';
      
      res.on('data', (chunk) => {
        data += chunk;
        if (!firstChunk) firstChunk = chunk.toString();
        // If it looks like streaming SSE, capture first few events
        if (data.includes('data:') && data.split('\n').filter(l => l.startsWith('data:')).length >= 2) {
          res.destroy(); // Got enough streaming data
        }
      });
      
      res.on('close', () => {
        resolve({ status: res.statusCode, headers: res.headers, data: data.substring(0, 500) });
      });
      
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, data: data.substring(0, 500) });
      });
      
      res.on('error', e => {
        resolve({ error: 'response error: ' + e.message, data: data.substring(0, 200) });
      });
    });

    req.on('error', (e) => resolve({ error: 'request error: ' + e.message }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ error: 'timeout after 8s' });
    });
    
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== OpenClaw API Discovery ===\n');

  // Test 1: GET /v1/models
  console.log('1. GET /v1/models...');
  const r1 = await testEndpoint(18789, '/v1/models', 'GET', null);
  console.log('   Status:', r1.status, '| Error:', r1.error || 'none');
  console.log('   Data:', (r1.data || '').substring(0, 150));
  console.log();

  // Test 2: POST /v1/chat/completions (non-streaming)
  console.log('2. POST /v1/chat/completions (stream:false)...');
  const r2 = await testEndpoint(18789, '/v1/chat/completions', 'POST', {
    model: 'openai-codex/gpt-5.3-codex',
    messages: [{ role: 'user', content: 'Reply only: OK' }],
    max_tokens: 10,
    stream: false
  });
  console.log('   Status:', r2.status, '| Error:', r2.error || 'none');
  console.log('   Headers transfer-encoding:', r2.headers?.['transfer-encoding']);
  console.log('   Headers content-type:', r2.headers?.['content-type']);
  console.log('   Data:', (r2.data || '').substring(0, 300));
  console.log();

  // Test 3: POST with stream:true
  console.log('3. POST /v1/chat/completions (stream:true)...');
  const r3 = await testEndpoint(18789, '/v1/chat/completions', 'POST', {
    model: 'openai-codex/gpt-5.3-codex',
    messages: [{ role: 'user', content: 'Reply only: OK' }],
    max_tokens: 10,
    stream: true
  });
  console.log('   Status:', r3.status, '| Error:', r3.error || 'none');
  console.log('   Data:', (r3.data || '').substring(0, 300));
}

main().catch(console.error);
