const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.resolve(__dirname, '..', '.next', 'standalone', 'server.js');
const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env, NODE_ENV: 'production', PORT: process.env.PORT || '3003' },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
