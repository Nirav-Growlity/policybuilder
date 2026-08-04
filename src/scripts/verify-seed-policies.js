const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '../data/seed-policies');
const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'));

let allValid = true;

for (const file of files) {
    const filePath = path.join(SEED_DIR, file);
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
