// scraper.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { saveToGoogleSheets } = require('./config/google-sheets');
const { exportToCSV } = require('./utils/csvExporter');

// Локализация
const locales = {
  ru: require('./locales/ru.json'),
  es: require('./locales/es.json')
};

module.exports = async function scrape(job, bot) {
  const { chatId, query, lang = 'ru' } = job.data;
  const t = locales[lang] || locales.ru;

  let browser;
  const allData = [];
  const processedWebsites = new Set();

  try {
    await bot.telegram.sendMessage(chatId, t.status_processing);

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      locale: 'es-ES',
    });

    const page = await context.newPage();
    
    // ==================================================================
    // ИСПРАВЛЕННАЯ СТРОКА URL
    // ==================================================================
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    console.log(`🔍 Поиск: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
      const acceptButton = page.getByRole('button', { name: /Aceptar todo|Accept all|Принять все/i });
      await acceptButton.waitFor({ state: 'visible', timeout: 7000 });
      console.log('✅ Кнопка согласия нажата.');
      await acceptButton.click();
      await page.waitForTimeout(3000);
    } catch (error) {
      console.log('✅ Окно согласия с cookie не появилось.');
    }
    
    let placeUrls = [];
    const feedLocator = page.locator('div[role="feed"]');
      
    try {
        console.log('⏳ Ожидание появления контейнера с результатами...');
        await feedLocator.waitFor({ state: 'visible', timeout: 25000 });
        
        console.log('✅ Контейнер найден. Ожидание загрузки первого результата...');
        await feedLocator.locator('a[href*="/maps/place/"]').first().waitFor({ timeout: 20000 });
        
        console.log('✅ Первый результат загружен. Начинаю "умную" прокрутку до конца списка...');

        await page.evaluate(async () => {
            const feedElement = document.querySelector('div[role="feed"]');
            if (!feedElement) return;
            let lastHeight = 0;
            let attempts = 0;
            const maxAttempts = 5;
            while (attempts < maxAttempts) {
                const currentHeight = feedElement.scrollHeight;
                feedElement.scrollTop = currentHeight;
                await new Promise(resolve => setTimeout(resolve, 2500));
                const newHeight = feedElement.scrollHeight;
                if (newHeight === lastHeight) {
                    attempts++;
                } else {
                    attempts = 0;
                }
                lastHeight = newHeight;
            }
        });
        
        console.log('✅ Прокрутка завершена. Собираю все найденные ссылки...');
        
        const links = await feedLocator.locator('a[href*="/maps/place/"]').all();
        const uniqueUrls = new Set();
        for (const link of links) {
            const href = await link.getAttribute('href');
            if (href) {
                uniqueUrls.add(href.startsWith('http') ? href : `https://www.google.com${href}`);
            }
        }
        placeUrls = [...uniqueUrls];

    } catch (err) {
        console.error('❌ Не удалось найти или обработать результаты на странице.', err.message);
        fs.writeFileSync(`page_dump_error_${Date.now()}.html`, await page.content());
    }

    if (placeUrls.length === 0) {
      await bot.telegram.sendMessage(chatId, t.no_results);
      await browser.close();
      return;
    }
    
    placeUrls = placeUrls.slice(0, 200);

    await bot.telegram.sendMessage(chatId, `🔍 Найдено ${placeUrls.length} карточек. Начинаю парсинг сайтов...`);

    for (const placeUrl of placeUrls) {
      const tab = await context.newPage();
      try {
        await tab.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const companyInfo = await tab.evaluate(() => {
            const websiteButton = document.querySelector('a[data-item-id="authority"]');
            const phoneButton = document.querySelector('button[data-item-id*="phone"]');
            const website = websiteButton ? websiteButton.href : null;
            const phoneRaw = phoneButton ? phoneButton.getAttribute('aria-label') : null;
            const phone = phoneRaw ? phoneRaw.replace(/[^0-9+]/g, '') : null; // Очищаем от лишних символов
            return { website, phone };
        });

        const { website, phone } = companyInfo;

        if (!website || processedWebsites.has(website)) {
          continue;
        }
        processedWebsites.add(website);

        console.log(`🌐 Перехожу на сайт: ${website} | 📞 Телефон: ${phone || 'не найден'}`);
        await tab.goto(website, { waitUntil: 'networkidle', timeout: 45000 });
        const content = await tab.content();

        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const matches = [...new Set(content.match(emailRegex) || [])];

        const foundEmails = matches
          .map(email => email.toLowerCase().trim())
          .filter(email => !email.endsWith('.png') && !email.endsWith('.jpg') && !email.endsWith('.gif') && !email.endsWith('.svg'))
          .filter(email => !/^(abuse|noreply|no-reply|contact|info|support|admin|hello|mail|help|sales|billing)@/i.test(email));
        
        if (foundEmails.length > 0) {
            for (const email of foundEmails) {
                allData.push({ email, website, phone: phone || '' });
            }
        } else {
            allData.push({ email: '', website, phone: phone || '' });
        }
        
        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        console.warn(`❌ Ошибка при обработке ${placeUrl}:`, err.message);
      } finally {
        if (!tab.isClosed()) await tab.close();
      }
    }

    await browser.close();

    // ... (остальной код для отправки результатов)

  } catch (err) {
    console.error('Глобальная ошибка в scrape:', err);
    await bot.telegram.sendMessage(chatId, t.error.replace('{error}', err.message));
  } finally {
    if (browser?.isConnected()) {
        await browser.close();
    }
  }
};