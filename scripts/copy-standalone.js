const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const staticSource = path.join(root, '.next', 'static');
const staticTarget = path.join(root, '.next', 'standalone', '.next', 'static');
const publicSource = path.join(root, 'public');
const publicTarget = path.join(root, '.next', 'standalone', 'public');

fs.cpSync(staticSource, staticTarget, { recursive: true });
fs.cpSync(publicSource, publicTarget, { recursive: true });

console.log('Copied static and public assets into .next/standalone');
