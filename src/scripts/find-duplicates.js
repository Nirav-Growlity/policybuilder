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

const companyMap = new Map();

for (const filePath of files) {
    const file = path.relative(SEED_DIR, filePath);
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
