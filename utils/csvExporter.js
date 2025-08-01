const fs = require('fs');

exports.exportToCSV = (emails, filePath, query) => {
  const csv = ['Email,Query'].concat(emails.map(e => `${e},${query}`)).join('\n');
  fs.writeFileSync(filePath, csv);
};
