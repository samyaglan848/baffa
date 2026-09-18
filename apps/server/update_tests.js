const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), 'src/tests');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

files.forEach(f => {
  const p = path.join(dir, f);
  let content = fs.readFileSync(p, 'utf8');

  // Insert PersistenceService import if not exists
  if (!content.includes('PersistenceService')) {
    content = `import { PersistenceService } from '../modules/persistence/persistence.service';\n` + content;
  }

  content = content.replace(/new AuthService\(mockPrisma, verificationService\)/g, 'new AuthService(mockPrisma, verificationService, new PersistenceService())');
  content = content.replace(/new ProfileService\(mockPrisma, mockStorage\)/g, 'new ProfileService(mockPrisma, mockStorage, new PersistenceService())');
  content = content.replace(/new MatchService\(mockPrisma\)/g, 'new MatchService(mockPrisma, new PersistenceService())');

  fs.writeFileSync(p, content);
});
console.log('Done');
