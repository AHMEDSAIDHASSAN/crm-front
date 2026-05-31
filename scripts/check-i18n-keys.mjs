import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

function flat(obj, prefix = '', out = {}) {
    for (const k of Object.keys(obj)) {
        const q = prefix ? `${prefix}.${k}` : k;
        const v = obj[k];
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) flat(v, q, out);
        else out[q] = v;
    }
    return out;
}

function walkTs(dir, out = []) {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        if (name.name === 'node_modules') continue;
        const p = path.join(dir, name.name);
        if (name.isDirectory()) walkTs(p, out);
        else if (/\.tsx?$/.test(name.name)) out.push(p);
    }
    return out;
}

const en = flat(JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/translate/en.json'), 'utf8')));
const files = walkTs(path.join(root, 'src'));
const re = /\bt\(\s*['"]([^'"]+)['"]/g;
const missing = new Set();

for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(s))) {
        const key = m[1];
        if (key.startsWith('${')) continue;
        if (!(key in en)) missing.add(key);
    }
}

console.log([...missing].sort().join('\n'));
console.log('\nTOTAL', missing.size);
