// config/google-sheets.js
const { GoogleSpreadsheet } = require('google-spreadsheet');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

exports.saveToGoogleSheets = async (emails, query) => {
  if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn('Google Sheets не настроен: отсутствует ID или ключ');
    return;
  }

  try {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

    await doc.useServiceAccountAuth(serviceAccountKey);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0]; // первая таблица

    for (const email of emails) {
      await sheet.addRow({
        Email: email,
        Query: query,
        Timestamp: new Date().toISOString(),
      });
    }

    console.log(`✅ ${emails.length} email-адресов сохранено в Google Sheets`);
  } catch (err) {
    console.error('❌ Ошибка сохранения в Google Sheets:', err.message);
  }
};