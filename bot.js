const { Telegraf } = require('telegraf');
const { addScrapingJob, startWorker } = require('./queue');
const scraper = require('./scraper');
const { isAllowed } = require('./utils/rateLimiter');

const ADMINS = [123456789]; // ← Замените на ваш Telegram ID
const userLang = new Map();

const bot = new Telegraf(process.env.BOT_TOKEN);

// === Админ-панель ===
bot.command('admin', (ctx) => {
  if (ADMINS.includes(ctx.from.id)) {
    ctx.reply('🛡 Админ-панель:\n/status — очередь\n/broadcast — рассылка');
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

// === Старт и выбор языка ===
bot.start((ctx) => {
  ctx.reply('👋 Привет! Выберите язык:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇷🇺 Русский', callback_ 'lang_ru' }],
        [{ text: '🇪🇸 Español', callback_ 'lang_es' }]
      ]
    }
  });
});

bot.action(/^lang_(ru|es)$/, async (ctx) => {
  const lang = ctx.match[1];
  userLang.set(ctx.from.id, lang);
  await ctx.answerCbQuery();
  await ctx.editMessageText(`Язык установлен: ${lang === 'ru' ? 'Русский' : 'Español'}`);
  await ctx.reply('📌 Главное меню', {
    reply_markup: {
      keyboard: [[{ text: '🔍 Новый запрос' }], [{ text: 'ℹ️ Помощь' }]],
      resize_keyboard: true
    }
  });
});

// === Кнопки ===
bot.hears('🔍 Новый запрос', async (ctx) => {
  const lang = userLang.get(ctx.from.id) || 'ru';
  const t = require('./locales')[lang];
  if (!isAllowed(ctx.from.id)) {
  const t = require('./locales')[lang];
  ctx.reply('📩 Отправьте запрос, например: <code>dentist in Berlin</code>', { parse_mode: 'HTML' });
});
  const text = ctx.message.text.trim();
  const lang = userLang.get(ctx.from.id) || 'ru';
  const t = require('./locales')[lang];

  if (text.startsWith('/')) return;

  if (!isAllowed(ctx.from.id)) {
    return ctx.reply(t.rate_limited);
  }

  await ctx.reply(t.status_queue);
  await addScrapingJob(ctx.from.id, text, lang);
  await ctx.reply(t.added_to_queue.replace('{query}', `<code>${text}</code>`), { parse_mode: 'HTML' });
});

// === Запуск воркера ===
startWorker(bot, scraper);

// === Запуск бота ===
bot.launch().then(() => {
  console.log('🚀 Google Maps Scraper Bot запущен!');
});

process.on('SIGINT', () => bot.stop('SIGINT'));
process.on('SIGTERM', () => bot.stop('SIGTERM'));
// === Приём запроса ===
bot.on('text', async (ctx) => {

bot.hears('ℹ️ Помощь', (ctx) => {
  const lang = userLang.get(ctx.from.id) || 'ru';
  }
  await ctx.reply(t.enter_query, { parse_mode: 'HTML' });
});

