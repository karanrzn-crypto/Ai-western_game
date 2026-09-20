/* Telegram delivery: send the bug-round screenshots to the user's chats.
 * Usage: node scripts/telegram-send.cjs <chatId1> [chatId2...]
 * Chat IDs come from getUpdates after the user messages the bot once. */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = '8602803645:AAHTNsWc7igB18WY30LeE1mvuBnZeYdlXdw';
const SHOTS = '/home/z/my-project/western_game/shots-bug-round';

const CAPTION = [
  '🤠 غرب وحشی — راند رفع ایرادهای بصری',
  '',
  '✅ درخت‌ها: تنهٔ خمیده + شاخه + تاج طبیعی',
  '✅ بوته‌ها: خوشه‌ای با شاخه‌های توخالی',
  '✅ علف‌ها: تیغه‌های واقعی (دیگر مخروطی نیست)',
  '✅ جعبه‌ها: رفع سوسوی رنگ (مشکل مشترک ۳ جعبه)',
  '✅ ویترین اسلحه‌فروشی: شیشه بدون سوسو',
  '✅ جای بستن اسب: پایه + ریل + مهار آهنی',
  '✅ نیمکت‌ها: ابعاد بزرگسال واقعی',
  '✅ آخور آب: دیواره + لبه + آب + پایه چوبی',
  '✅ آغل دام: بزرگ‌تر شده (۲۶ → ۵۰ متر مربع)',
  '',
  'تایپ‌چک + ۵۳۹ تست + بیلد + ۱۵/۱۵ تأیید مرورگر',
  'کامیت و پوش شد روی گیت‌هاب ✓',
].join('\n');

function api(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendPhoto(chatId, file) {
  return new Promise((resolve, reject) => {
    const boundary = '----west' + Date.now();
    const stats = fs.statSync(file);
    const formHead = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${CAPTION}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${path.basename(file)}"\r\nContent-Type: image/png\r\n\r\n`,
    );
    const formTail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/sendPhoto`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': formHead.length + stats.size + formTail.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(formHead);
    fs.createReadStream(file).pipe(req, { end: false });
    req.on('close', () => {});
    fs.createReadStream(file).on('end', () => { req.write(formTail); req.end(); });
  });
}

(async () => {
  const chatIds = process.argv.slice(2);
  if (chatIds.length === 0) {
    console.log('no chat ids — pass them: node scripts/telegram-send.cjs <id1> <id2>');
    process.exit(1);
  }
  const shots = fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).sort();
  console.log(`sending ${shots.length} shots to ${chatIds.length} chats…`);
  for (const chatId of chatIds) {
    for (const f of shots) {
      const r = await sendPhoto(chatId, path.join(SHOTS, f));
      if (!r.ok) console.log('FAIL', chatId, f, JSON.stringify(r).slice(0, 140));
    }
    console.log(`chat ${chatId}: done (${shots.length} photos)`);
  }
  process.exit(0);
})();
