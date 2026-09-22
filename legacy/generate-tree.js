const fs = require('fs');
const path = require('path');

const IGNORE = ['node_modules', '.git', '.next', '.vscode', ',github'];

function generateTree(dir, prefix = '', isLast = true) {
  const name = path.basename(dir);
  const stat = fs.statSync(dir);
  let output = '';

  if (prefix === '') {
    output += `${name}/\n`;
  } else {
    output += `${prefix}${isLast ? '└── ' : '├── '}${name}${stat.isDirectory() ? '/' : ''}\n`;
  }

  if (stat.isDirectory()) {
    const items = fs.readdirSync(dir).filter(item => !IGNORE.includes(item));
    const entries = items.map((item, index) => {
      const fullPath = path.join(dir, item);
      const isLastChild = index === items.length - 1;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      return generateTree(fullPath, newPrefix, isLastChild);
    });
    output += entries.join('');
  }

  return output;
}

const targetDir = path.resolve(__dirname); // Modifique aqui se quiser outro ponto de partida
const dirName = path.basename(targetDir);

const tree = generateTree(targetDir);

const fileName = `${dirName}_tree.txt`;


fs.writeFileSync(fileName, tree);
console.log(`Arquivo ${fileName} gerado com sucesso.`);