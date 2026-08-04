const fs = require('fs');
const path = require('path');

const SEED_DIR = path.join(__dirname, '../data/seed-policies');
const files = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'));

const companyMap = new Map();

for (const file of files) {
    const filePath = path.join(SEED_DIR, file);
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const companyName = data.name || data.policy?.company?.name || 'Unknown';
        // Normalize name
        const normName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (!companyMap.has(normName)) {
            companyMap.set(normName, []);
        }
        companyMap.get(normName).push({ file, data, size: fs.statSync(filePath).size, time: fs.statSync(filePath).mtimeMs });
    } catch (e) {
        console.error(`Invalid JSON in ${file}`);
    }
}

// Find duplicates
console.log("=== Duplicates ===");
for (const [normName, entries] of companyMap.entries()) {
    if (entries.length > 1) {
        console.log(`\nCompany: ${entries[0].data.name || normName}`);
        entries.forEach(e => console.log(`  - ${e.file} (Size: ${e.size}, Time: ${new Date(e.time).toISOString()})`));
    }
}
