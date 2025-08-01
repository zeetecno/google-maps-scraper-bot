const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { saveToGoogleSheets } = require('./config/google-sheets');
const { exportToCSV } = require('./utils/csvExporter');

module.exports = async function scrape(job, bot) {
  const { chatId, query, lang } = job.data;
  const locales = {
    ru: require('./locales/ru.json'),
    es: require('./locales/es.json')
  };
  const t = locales[lang] || locales.ru;

  try {
    await bot.telegram.sendMessage(chatId, t.status_processing);

    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath,
      args: chromium.args.concat([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const urls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="/maps/place"]'))
        .map(a => 'https://www.google.com' + a.getAttribute('href'))
        .filter((url, i, arr) => arr.indexOf(url) === i)
    );

    if (urls.length === 0) {
      await bot.telegram.sendMessage(chatId, t.no_results);
      await browser.close();
      return;
    }

    let emails = new Set();

    for (const url of urls.slice(0, 8)) {
      const tab = await browser.newPage();
      try {
        await tab.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const website = await tab.evaluate(() => {
          const el = document.querySelector('button[data-item-id^="authority"]');
          return el?.innerText.trim();
        });

        if (!website || !website.startsWith('http')) {
          await tab.close();
          continue;
        }

        await tab.goto(website, { waitUntil: 'networkidle2', timeout: 30000 });
        const content = await tab.content();
        const matches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?!\.(png|jpg|gif|svg))/g) || [];

        matches
          .filter(email => !/(google|gstatic|ggpht|schema|example|sentry|imli)/i.test(email))
          .forEach(email => emails.add(email));

        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        console.warn(`Ошибка на сайте ${website}:`, err.message);
      } finally {
        await tab.close();
      }
    }

    await browser.close();

    const emailList = [...emails];
    const filePath = path.join(__dirname, `emails_${chatId}_${Date.now()}.csv`);
    await exportToCSV(emailList, filePath, query);

    const message = emailList.length > 0
      ? t.result_found.replace('{count}', emailList.length).replace('{emails}', emailList.join('\n'))
      : t.result_none;

    await bot.telegram.sendMessage(chatId, message);
    await bot.telegram.sendDocument({ source: filePath, filename: 'emails.csv' });

    await saveToGoogleSheets(emailList, query);
    fs.unlinkSync(filePath);

  } catch (err) {
    await bot.telegram.sendMessage(chatId, t.error.replace('{error}', err.message));
  }
};
