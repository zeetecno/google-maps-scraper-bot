const { Telegraf } = require('telegraf');
const { addScrapingJob, startWorker } = require('./queue');
const scraper = require('./scraper');
const { isAllowed } = require('./utils/rateLimiter');
const locales = require('./locales'); // ✅ Теперь работает
const express = require('express');

// === Настройки ===
const ADMINS = [123456789]; // ← Замените на ваш Telegram ID
const userLang = new Map(); // Хранение языка пользователя

// === Инициализация бота ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// === Админ-панель ===
bot.command('admin', (ctx) => {
  if (ADMINS.includes(ctx.from.id)) {
    ctx.reply('🛡 Админ-панель:\n/status — очередь\n(рассылка — в будущем)');
  }
});

bot.command('status', async (ctx) => {
  const { scrapingQueue } = require('./queue');
  const [waiting, active, completed] = await Promise.all([
    scrapingQueue.getWaitingCount(),
    scrapingQueue.getActiveCount(),
    scrapingQueue.getCompletedCount()
  ]);
  ctx.reply(`📊 Статус очереди:\nОжидают: ${waiting}\nВ процессе: ${active}\nВыполнено: ${completed}`);
});

// === Старт: выбор языка ===
bot.start((ctx) => {
  ctx.reply('👋 Привет! Выберите язык:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
        [{ text: '🇪🇸 Español', callback_data: 'lang_es' }]
      ]
    }
  });
});

// === Обработка выбора языка ===
bot.action(/^lang_(ru|es)$/, async (ctx) => {
  const lang = ctx.match[1];
  userLang.set(ctx.from.id, lang);
  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Язык установлен: ${lang === 'ru' ? 'Русский' : 'Español'}`);
  await ctx.reply('📌 Главное меню', {
    reply_markup: {
      keyboard: [
        [{ text: '🔍 Новый запрос' }],
        [{ text: 'ℹ️ Помощь' }]
      ],
      resize_keyboard: true
    }
  });
});

// === Кнопка: "Новый запрос" ===
bot.hears('🔍 Новый запрос', async (ctx) => {
  const lang = userLang.get(ctx.from.id) || 'ru';
  console.log('Попытка загрузить ./queue.js');
  console.log(require.resolve('./queue.js')); // выбросит ошибку, если не найдёт
  const t = require('./locales')[lang];
  if (!isAllowed(ctx.from.id)) {
    return ctx.reply(t.rate_limited);
  }
  await ctx.reply(t.enter_query, { parse_mode: 'HTML' });
});

// === Кнопка: "Помощь" ===
bot.hears('ℹ️ Помощь', (ctx) => {
  const lang = userLang.get(ctx.from.id) || 'ru';
  const t = require('./locales')[lang];
  ctx.reply(
    '📩 Отправьте запрос в формате:\n<code>dentist in Berlin</code>',
    { parse_mode: 'HTML' }
  );
});

// === Приём текстового запроса от пользователя ===
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;
  const lang = userLang.get(userId) || 'ru';
  const t = require(`./locales/${lang === 'es' ? 'es' : 'ru'}.json`);

  // Если это команда — пропускаем (уже обработаны)
  if (text.startsWith('/')) return;

  // Проверка на лимит запросов
  if (!isAllowed(userId)) {
    return ctx.reply(t.rate_limited);
  }

  // Отправляем статус
  await ctx.reply(t.status_queue);

  // Добавляем в очередь
  try {
    await addScrapingJob(userId, text, lang);
    await ctx.reply(t.added_to_queue.replace('{query}', `<code>${text}</code>`), { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Ошибка добавления в очередь:', err);
    await ctx.reply(t.error.replace('{error}', 'Не удалось добавить задачу'));
  }
});

// === Запуск воркера для обработки очереди ===
startWorker(bot, scraper);

// === Запуск бота 
//bot.launch()
 // .then(() => {
//    console.log('🚀 Google Maps Scraper Bot успешно запущен!');
//  })
//  .catch(err => {
//    console.error('❌ Ошибка запуска бота:', err);
//  }); 

// Корректное завершение
//process.on('SIGINT', () => bot.stop('SIGINT'));
//process.on('SIGTERM', () => bot.stop('SIGTERM'));

// === Простой Express-сервер, чтобы Render видел активный порт
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('🤖 Telegram Bot is running!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`✅ Веб-сервер запущен на порту ${PORT}`);
});

// === Запуск бота
bot.launch().then(() => {
  console.log('🚀 Telegram-бот запущен через long polling');
});

// Корректное завершение
process.on('SIGINT', () => {
  bot.stop('SIGINT');
  process.exit(0);
});