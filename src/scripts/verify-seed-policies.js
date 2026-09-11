const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '../data/seed-policies');
function collectJsonFiles(directory, files = []) {
    if (!fs.existsSync(directory)) return files;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) collectJsonFiles(file, files);
        else if (entry.name.endsWith('.json')) files.push(file);
    }
    return files;
}
const files = collectJsonFiles(SEED_DIR);

let allValid = true;

for (const filePath of files) {
    const file = path.relative(SEED_DIR, filePath);
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        let valid = true;
        let missing = [];

        if (!data.id) missing.push('id');
        if (!data.name) missing.push('name');
        if (!data.policy) missing.push('policy');
        else {
            if (!data.policy.quantitative) missing.push('policy.quantitative');
            if (!data.policy.qualitative) missing.push('policy.qualitative');
            if (!data.policy.sdgs) missing.push('policy.sdgs');
        }
        
        if (missing.length > 0) {
            console.error(`[INVALID] ${file} is missing: ${missing.join(', ')}`);
            allValid = false;
        } else {
            console.log(`[OK] ${file}`);
        }
    } catch (e) {
        console.error(`[ERROR] ${file} is not valid JSON: ${e.message}`);
        allValid = false;
    }
}

if (allValid) {
    console.log('\nAll files verified successfully!');
}
