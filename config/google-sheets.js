const { GoogleSpreadsheet } = require('google-spreadsheet');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

exports.saveToGoogleSheets = async (emails, query) => {
  try {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    await doc.useServiceAccountAuth(serviceAccountKey);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    for (const email of emails) {
      await sheet.addRow({ Email: email, Query: query, Timestamp: new Date().toISOString() });
    }
  } catch (err) {
    console.error('Google Sheets error:', err.message);
  }
};
