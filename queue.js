// queue.js
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

// Подключение с исправленной опцией
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null
});

const scrapingQueue = new Queue('scraping', { connection });

async function addScrapingJob(chatId, query, lang) {
  return await scrapingQueue.add('scrape', { chatId, query, lang }, {
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

function startWorker(bot, scraper) {
  new Worker('scraping', async (job) => {
    await scraper(job, bot);
  }, { connection });
}

module.exports = { scrapingQueue, addScrapingJob, startWorker };