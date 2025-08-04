// utils/csvExporter.js

const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');

async function exportToCSV(data, filePath) {
  // Убеждаемся, что директория для файла существует
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Создаем writer с указанием заголовков и соответсвующих им ключей из объектов
  const csvWriter = createCsvWriter({
    path: filePath,
    header: [
      { id: 'email', title: 'EMAIL' },
      { id: 'website', title: 'WEBSITE' },
      { id: 'phone', title: 'PHONE' },
    ],
  });

  try {
    // Фильтруем данные, чтобы убедиться, что это массив с объектами
    const records = Array.isArray(data) ? data : [];
    if (records.length > 0) {
      await csvWriter.writeRecords(records);
      console.log(`✅ CSV файл успешно сохранен: ${filePath}`);
    } else {
      console.log('⚠️ Нет данных для записи в CSV.');
    }
  } catch (error) {
    console.error('❌ Ошибка при записи в CSV:', error);
  }
}

module.exports = { exportToCSV };