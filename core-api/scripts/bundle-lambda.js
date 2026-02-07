const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('====================================');
console.log('Lambda Bundle Script');
console.log('====================================\n');

const distDir = path.join(__dirname, '..', 'dist');
const lambdaDir = path.join(distDir, 'lambda');

// 1. Create lambda directory
console.log('Step 1: Creating lambda bundle directory...');
if (fs.existsSync(lambdaDir)) {
  fs.rmSync(lambdaDir, { recursive: true });
}
fs.mkdirSync(lambdaDir, { recursive: true });

// 2. Copy compiled code
console.log('Step 2: Copying compiled code...');
copyRecursiveSync(distDir, lambdaDir, ['lambda', 'node_modules']);

// 3. Copy node_modules (production only)
console.log('Step 3: Installing production dependencies...');
const packageJson = {
  dependencies: require(path.join(__dirname, '..', 'package.json')).dependencies
};
fs.writeFileSync(
  path.join(lambdaDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

execSync('npm install --production --omit=dev', {
  cwd: lambdaDir,
  stdio: 'inherit'
});

// 4. Generate Prisma Client
console.log('Step 4: Generating Prisma Client...');
fs.mkdirSync(path.join(lambdaDir, 'prisma'), { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'prisma', 'schema.prisma'),
  path.join(lambdaDir, 'prisma', 'schema.prisma')
);

execSync('npx prisma generate', {
  cwd: lambdaDir,
  stdio: 'inherit'
});

console.log('\n✅ Lambda bundle created at dist/lambda');
console.log('====================================\n');

// Helper function
function copyRecursiveSync(src, dest, exclude = []) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest);
    }
    fs.readdirSync(src).forEach(childItemName => {
      if (!exclude.includes(childItemName)) {
        copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName),
          exclude
        );
      }
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}
