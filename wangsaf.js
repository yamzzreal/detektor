const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const nodemailer = require('nodemailer');

const BOT_TOKEN = '9152712865:AAGLuxGIWTaalKpwNk6dNZGq03hB2Lcud9k';
const BOT_USERNAME = 'yamzznumber_bot';
const OWNER_IDS = ['8920279824', '8752248620']; // Owner utama: hanya mereka yang boleh mengelola admin
const isSuperOwner = (userId) => OWNER_IDS.includes(String(userId));
const isOwner = (userId) => {
    if (isSuperOwner(userId)) return true;
    try {
        const db = getDB();
        const admins = Array.isArray(db.config && db.config.admin_ids) ? db.config.admin_ids : [];
        return admins.map(String).includes(String(userId));
    } catch (_) { return false; }
};
const GROUP_INVITE_LINK = 'https://t.me/+T8A1W1M8F-sxZDBl';
const DB_FILE = './database.json';
const DATA_FILE = './data.json'; // Penyimpanan permanen antrean NGAMBEK/ERROR/TIMEOUT per pengguna.
const EMAIL_SECRET_KEY_FILE = './email_app_secret.key';
const PENDING_TRX_FILE = './pending_trx.json';
const DETEK_MAX_PERCOBAAN = 3;
const DETEK_JEDA_RETRY = 0.5;
const DETEK_TIMEOUT = 5;
const DETEK_RETRY_NO_ROUTES = 5;
const DETEK_NO_ROUTES_EARLY_STOP = 2;
const VERSI = '2.26.33.73';
const WA_MARK = '0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM';
const API_URL = 'https://v.whatsapp.net/v2/code';
const BOT_DISPLAY_NAME = 'DETEKTOR WHATSAPP';
const refreshCooldownData = {};

const merekJelek = ['Apple-iPhone_13', 'Apple-iPhone_13_Pro', 'Apple-iPhone_14', 'Apple-iPhone_14_Pro', 'Apple-iPhone_15', 'Apple-iPhone_15_Pro', 'Apple-iPhone_12', 'Apple-iPhone_SE_3'];
const iosJelek = ['17.5.1', '17.6.1', '18.0', '18.1.1', '16.7.8'];
const KODE_NEGARA = new Set([1, 7, 20, 27, 30, 31, 32, 33, 34, 36, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 81, 82, 84, 86, 90, 91, 92, 93, 94, 95, 98, 211, 212, 213, 216, 218, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 290, 291, 297, 298, 299, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 370, 371, 372, 373, 374, 375, 376, 377, 378, 380, 381, 382, 383, 385, 386, 387, 389, 420, 421, 423, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 670, 672, 673, 674, 675, 676, 677, 678, 679, 680, 681, 682, 683, 685, 686, 687, 688, 689, 690, 691, 692, 800, 808, 850, 852, 853, 855, 856, 870, 878, 880, 881, 882, 883, 886, 888, 960, 961, 962, 963, 964, 965, 966, 967, 968, 970, 971, 972, 973, 974, 975, 976, 977, 979, 992, 993, 994, 995, 996, 998]);
const RETRY_REASONS = new Set(['dataimpulse_gagal', 'timeout_1detik', 'tai_gagal', 'semua_ampas_gagal', 'semua_tai_gagal']);


const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 90000 });

const normalisasiTeks = (str) => {
    let out = '';
    for (const ch of String(str || '')) {
        const code = ch.codePointAt(0);
        if (code >= 0x1D5D4 && code <= 0x1D5ED) out += String.fromCharCode(65 + code - 0x1D5D4);
        else if (code >= 0x1D5EE && code <= 0x1D607) out += String.fromCharCode(97 + code - 0x1D5EE);
        else if (code >= 0x1D7EC && code <= 0x1D7F5) out += String.fromCharCode(48 + code - 0x1D7EC);
        else out += ch;
    }
    return out;
};

const bersihkanTombol = (tombol) => {
    if (tombol && typeof tombol === 'object' && !tombol.url) {
        return { text: String(tombol.text ?? ''), callback_data: String(tombol.callback_data || 'noop') };
    }
    return tombol;
};

const apiAsli = bot.telegram.callApi.bind(bot.telegram);
bot.telegram.callApi = function(method, data = {}, ...sisanya) {
    const salin = { ...data };
    if (salin.reply_markup && Array.isArray(salin.reply_markup.inline_keyboard)) {
        salin.reply_markup = { ...salin.reply_markup, inline_keyboard: salin.reply_markup.inline_keyboard.map(baris => Array.isArray(baris) ? baris.map(bersihkanTombol) : baris) };
    }
    if (Array.isArray(salin.inline_keyboard)) {
        salin.inline_keyboard = salin.inline_keyboard.map(baris => Array.isArray(baris) ? baris.map(bersihkanTombol) : baris);
    }
    return apiAsli(method, salin, ...sisanya);
};

const modeDetekUser = {};
const lastModeUser = {};
const lastSiapUser = {};
const lastErrorUser = {};
const lastHasilDetekUser = {};
const pendingOwnerReplyMap = {};
const ownerState = {};
const tempProxyData = {};
const monitoringProxy = [];
const busyUsers = new Set();
const activeDetectionRuns = new Set();
let restartTimer = null;
const debounceMap = new Map();
const detekSesiAktif = {};
const bandingEmailState = {}; // alur pengajuan banding satu nomor

const tb = (str) => {
    const chars = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return String(str).split('').map(c => chars[c] || c).join('');
};

const HIJAU_KEYWORDS = ['acc', 'sudah bayar', 'verifikasi', 'setuju', 'siap otp', 'done', 'approve', 'terima', 'aktif'];
const MERAH_KEYWORDS = ['tolak', 'batal', 'belum', 'cancel', 'tutup', 'reject', 'hapus', 'keluar', 'gagal'];

const determineStyle = (text) => {
    const txt = String(text || '').toLowerCase();
    for (const kw of HIJAU_KEYWORDS) { if (txt.includes(kw)) return 'success'; }
    for (const kw of MERAH_KEYWORDS) { if (txt.includes(kw)) return 'danger'; }
    return 'primary';
};

const origInlineKeyboard = Markup.inlineKeyboard;
Markup.inlineKeyboard = function(buttons, options) {
    if (Array.isArray(buttons)) {
        buttons = buttons.map(row => {
            if (Array.isArray(row)) {
                return row.map(btn => {
                    if (btn && typeof btn === 'object' && !btn.url) {
                        if (!btn.style) btn.style = determineStyle(btn.text);
                    }
                    return btn;
                });
            }
            return row;
        });
    }
    return origInlineKeyboard.call(this, buttons, options);
};

const initializeFiles = () => {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            users: {},
            stats: { total_user: 0, total_deteksi: 0, free: 0, premium: 0, super: 0, revenue: 0, trx: 0 },
            config: {
                notification_group_ids: [],
                verification_group_id: null,
                verification_group_ids: [],
                verification_links: [],
                verification_link: null,
                proxies: [],
                default_proxy_id: null,
                welcome_enabled: false,
                email_senders: [],
                email_recipients: [],
                email_app_passwords: [],
                email_sender_last_used: {},
                email_templates: [
                    { name: 'Metode 1', body: 'Yth. Tim Dukungan,\n\nSaya ingin mengajukan peninjauan untuk nomor WhatsApp {nomor}. Mohon informasikan proses resmi yang perlu saya ikuti.\n\nTerima kasih.' },
                    { name: 'Metode 2', body: 'Halo Tim Dukungan WhatsApp,\n\nMohon bantu tinjau status akun dengan nomor {nomor}. Jika diperlukan, saya bersedia memberikan informasi tambahan melalui kanal resmi.\n\nTerima kasih.' }
                ]
            }
        }, null, 2));
    }
    if (!fs.existsSync(PENDING_TRX_FILE)) fs.writeFileSync(PENDING_TRX_FILE, JSON.stringify({}, null, 2));
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
};
initializeFiles();

// data.json khusus untuk antrean hasil yang perlu dicoba ulang.
const normalisasiDataDeteksi = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
    if (!data.users || typeof data.users !== 'object' || Array.isArray(data.users)) data.users = {};
    for (const [id, item] of Object.entries(data.users)) {
        if (!item || typeof item !== 'object') data.users[id] = {};
        const user = data.users[id];
        for (const key of ['ngambek', 'error', 'timeout']) {
            if (!Array.isArray(user[key])) user[key] = [];
            user[key] = [...new Set(user[key].map(v => String(v || '').replace(/[^\d]/g, '')).filter(Boolean))].slice(-5000);
        }
        if (!['proxy', 'server'].includes(user.mode)) user.mode = 'proxy';
    }
    return data;
};
let dataDeteksi;
try { dataDeteksi = normalisasiDataDeteksi(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
catch (err) { console.error('[DATA DETEKSI] Gagal membaca data.json:', err.message); dataDeteksi = normalisasiDataDeteksi({}); }
const simpanDataDeteksi = () => {
    const temp = `${DATA_FILE}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(temp, JSON.stringify(dataDeteksi, null, 2), 'utf8');
        fs.renameSync(temp, DATA_FILE);
        return true;
    } catch (err) {
        try { fs.unlinkSync(temp); } catch (_) {}
        console.error('[DATA DETEKSI] Gagal menyimpan data.json:', err.message);
        return false;
    }
};
const ambilDataDeteksiUser = (userId) => {
    const id = String(userId);
    if (!dataDeteksi.users[id]) dataDeteksi.users[id] = { ngambek: [], error: [], timeout: [], mode: 'proxy' };
    return dataDeteksi.users[id];
};
const simpanHasilAntrean = (userId, nomor, kategori, mode) => {
    const userData = ambilDataDeteksiUser(userId);
    const clean = String(nomor || '')
    .trim()
    .replace(/[^\d+]/g, '')
    .replace(/^00/, '+');

const nomorFinal = clean.startsWith('+')
    ? clean
    : '+' + clean.replace(/^0+/, '');
    if (!clean) return;
    for (const key of ['ngambek', 'error', 'timeout']) userData[key] = userData[key].filter(n => n !== clean);
    if (['ngambek', 'error', 'timeout'].includes(kategori)) {
        userData[kategori].push(clean);
        userData[kategori] = [...new Set(userData[kategori])].slice(-5000);
    }
    if (mode) userData.mode = mode === true || mode === 'proxy' ? 'proxy' : 'server';
    userData.updatedAt = new Date().toISOString();
    simpanDataDeteksi();
};
for (const [id, item] of Object.entries(dataDeteksi.users)) {
    lastErrorUser[id] = [...item.error, ...item.timeout];
}

// Database utama disimpan di cache memori agar handler Telegram tidak perlu
// membaca file secara sinkron pada setiap pesan/callback.
const normalisasiDB = (data) => {
    if (!data || typeof data !== 'object') data = {};
    if (!data.users || typeof data.users !== 'object') data.users = {};
    if (!data.stats || typeof data.stats !== 'object') data.stats = {};
    ['total_user','total_deteksi','free','premium','super','revenue','trx'].forEach(k => {
        data.stats[k] = Number(data.stats[k]) || 0;
    });
    if (!data.config || typeof data.config !== 'object') data.config = {};
    if (!Array.isArray(data.config.notification_group_ids)) data.config.notification_group_ids = [];
    if (!Array.isArray(data.config.verification_group_ids)) data.config.verification_group_ids = [];
    if (!Array.isArray(data.config.verification_links)) data.config.verification_links = [];
    if (!Array.isArray(data.config.proxies)) data.config.proxies = [];
    if (!data.config.tiers || typeof data.config.tiers !== 'object') data.config.tiers = {};
    if (!data.config.tiers.FREE) data.config.tiers.FREE = { maxBatch: 5, cooldownSeconds: 0, prices: {} };
    if (typeof data.config.freeDailyLimitEnabled !== 'boolean') data.config.freeDailyLimitEnabled = true;
    if (!Number.isInteger(Number(data.config.freeDailyLimit)) || Number(data.config.freeDailyLimit) < 0) data.config.freeDailyLimit = 5;
    if (typeof data.config.upgradeEnabled !== 'boolean') data.config.upgradeEnabled = true;
    if (!data.config.tiers.VIP) data.config.tiers.VIP = { maxBatch: 100, cooldownSeconds: 30, prices: { 1: 5000, 3: 10000, 7: 20000, 15: 35000, 30: 50000 } };
    if (!data.config.tiers.VVIP) data.config.tiers.VVIP = { maxBatch: 500, cooldownSeconds: 0, prices: { 1: 8000, 3: 15000, 7: 30000, 30: 80000 } };
    if (!Array.isArray(data.config.payment_methods)) data.config.payment_methods = [];
    if (!Array.isArray(data.config.email_senders)) data.config.email_senders = [];
    if (!Array.isArray(data.config.email_recipients)) data.config.email_recipients = [];
    if (!Array.isArray(data.config.email_app_passwords)) data.config.email_app_passwords = [];
    if (!data.config.email_sender_last_used || typeof data.config.email_sender_last_used !== 'object') data.config.email_sender_last_used = {};
    if (!Array.isArray(data.config.email_templates) || data.config.email_templates.length === 0) data.config.email_templates = [
        { name: 'Metode 1', body: 'Yth. Tim Dukungan,\n\nSaya ingin mengajukan peninjauan untuk nomor WhatsApp {nomor}. Mohon informasikan proses resmi yang perlu saya ikuti.\n\nTerima kasih.' },
        { name: 'Metode 2', body: 'Halo Tim Dukungan WhatsApp,\n\nMohon bantu tinjau status akun dengan nomor {nomor}. Jika diperlukan, saya bersedia memberikan informasi tambahan melalui kanal resmi.\n\nTerima kasih.' }
    ];
    return data;
};

let dbCache;
try {
    dbCache = normalisasiDB(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch (err) {
    console.error('[DATABASE] Gagal membaca database.json saat startup:', err.message);
    dbCache = normalisasiDB({});
}

let dbWriteQueue = Promise.resolve();
let dbWriteVersion = 0;
const getDB = () => dbCache;

// Penulisan dilakukan lewat fs.promises dan file sementara, lalu rename secara
// atomik. Snapshot dibuat saat saveDB dipanggil agar perubahan berikutnya tidak
// mengubah data yang sedang antre ditulis.
const saveDB = (data) => {
    try {
        dbCache = normalisasiDB(data || dbCache);
        const snapshot = JSON.stringify(dbCache, null, 2);
        const version = ++dbWriteVersion;
        dbWriteQueue = dbWriteQueue.then(async () => {
            const tempFile = `${DB_FILE}.${process.pid}.${version}.tmp`;
            try {
                await fs.promises.writeFile(tempFile, snapshot, 'utf8');
                await fs.promises.rename(tempFile, DB_FILE);
            } catch (err) {
                try { await fs.promises.unlink(tempFile); } catch (_) {}
                console.error('[DATABASE] Gagal menyimpan database:', err.message);
            }
        }).catch(err => {
            console.error('[DATABASE] Antrean penyimpanan bermasalah:', err.message);
        });
        return true; // true berarti penyimpanan berhasil masuk antrean.
    } catch (err) {
        console.error('[DATABASE] Gagal menyiapkan penyimpanan:', err.message);
        return false;
    }
};

// Kirim notifikasi aktivitas penting ke semua grup yang terdaftar.
async function kirimNotifGrup(pesan) {
    const db = getDB();
    const grup = [...new Set((db.config.notification_group_ids || []).map(String).filter(Boolean))];
    if (!grup.length) return;
    for (const chatId of grup) {
        try { await bot.telegram.sendMessage(chatId, pesan, { parse_mode: 'HTML', disable_web_page_preview: true }); }
        catch (err) { console.error(`[NOTIF GRUP] Gagal mengirim ke ${chatId}:`, err.message || err); }
    }
}

// App Password dienkripsi AES-256-GCM sebelum disimpan ke database.json.
// Kunci enkripsi disimpan terpisah pada file lokal dengan izin akses terbatas.
function getEmailEncryptionKey() {
    if (!fs.existsSync(EMAIL_SECRET_KEY_FILE)) {
        const key = crypto.randomBytes(32);
        fs.writeFileSync(EMAIL_SECRET_KEY_FILE, key, { mode: 0o600, flag: 'wx' });
        try { fs.chmodSync(EMAIL_SECRET_KEY_FILE, 0o600); } catch (_) {}
    }
    const key = fs.readFileSync(EMAIL_SECRET_KEY_FILE);
    if (key.length !== 32) throw new Error('Kunci enkripsi email tidak valid.');
    return key;
}
function enkripsiAppPassword(password) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEmailEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]);
    return { encrypted: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}
function dekripsiAppPassword(record) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEmailEncryptionKey(), Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(record.encrypted, 'base64')), decipher.final()]).toString('utf8');
}

const getPending = () => { try { return JSON.parse(fs.readFileSync(PENDING_TRX_FILE, 'utf8')); } catch (e) { return {}; } };
const savePending = (data) => { try { fs.writeFileSync(PENDING_TRX_FILE, JSON.stringify(data, null, 2)); } catch (e) {} };

const formatWaktu = () => {
    const d = new Date();
    const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    return `${d.getDate().toString().padStart(2, '0')} ${bln[d.getMonth()]} ${d.getFullYear()} | ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const jeda = ms => new Promise(r => setTimeout(r, ms));

const generateBar = (current, total) => {
    const slots = 14;

    const safeTotal = Math.max(Number(total) || 0, 0);
    const safeCurrent = Math.max(Number(current) || 0, 0);

    const percent = safeTotal > 0
        ? Math.min(Math.round((safeCurrent / safeTotal) * 100), 100)
        : 0;

    const filled = Math.round((percent / 100) * slots);

    const bar = Array.from({ length: slots }, (_, i) =>
        i < filled ? '▰' : '▱'
    ).join('');

    return `<blockquote>⚡ <b>PROGRESS</b>
<code>[${bar}] ${percent}%</code>
Total Nomor ${safeCurrent}/${safeTotal}</blockquote>`;
};

const getRandomProxy = () => {
    const db = getDB(); const proxies = db.config.proxies || [];
    if (proxies.length === 0) return null;
    if (db.config.default_proxy_id) {
        const defProxy = proxies.find(p => p.id === db.config.default_proxy_id);
        if (defProxy) return `http://${defProxy.user}:${defProxy.pass}@${defProxy.host}:${defProxy.port}`;
    }
    const activeProxies = proxies.filter(p => p.status !== 'offline');
    if (activeProxies.length === 0) return null;
    const p = activeProxies[Math.floor(Math.random() * activeProxies.length)];
    return `http://${p.user}:${p.pass}@${p.host}:${p.port}`;
};

function md5hex(s) { return crypto.createHash('md5').update(s, 'utf8').digest('hex'); }
function b64url(b) { return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function buatUA() { return 'WhatsApp/' + VERSI + ' iOS/' + iosJelek[Math.floor(Math.random() * iosJelek.length)] + ' Device/' + merekJelek[Math.floor(Math.random() * merekJelek.length)]; }

function toBytesLE(n, len) {
    const o = Buffer.alloc(len); let v = n;
    for (let i = 0; i < len; i++) { o[i] = Number(v & 255n); v >>= 8n; }
    return o;
}

function fromBytesLE(b) {
    let v = 0n;
    for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
    return v;
}

function modPow(b, e, m) {
    let r = 1n; b %= m;
    while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
    return r;
}

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const D = (-121665n * modPow(121666n, P - 2n, P)) % P;
const BX = 0x216936D3CD6E53FEC0A4E231FDD6DC5C692CC7609525A7B2C9562D608F25D51An;
const BY = (4n * modPow(5n, P - 2n, P)) % P;

function clampSK(sk) { const out = Buffer.from(sk); out[0] &= 248; out[31] &= 127; out[31] |= 64; return out; }

function perkalian(k, u) {
    let kInt = fromBytesLE(k); kInt &= ~7n; kInt &= ~(128n << 248n); kInt |= 64n << 248n;
    let x1 = fromBytesLE(u) & ((1n << 255n) - 1n); x1 %= P;
    let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0;
    for (let t = 254; t >= 0; t--) {
        const kT = Number((kInt >> BigInt(t)) & 1n); swap ^= kT;
        if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
        swap = kT;
        const a = (x2 + z2) % P, aa = a * a % P, b = (x2 - z2 + P) % P, bb = b * b % P;
        const e = (aa - bb + P) % P, c = (x3 + z3) % P, d = (x3 - z3 + P) % P;
        const da = d * a % P, cb = c * b % P;
        x3 = (da + cb) % P; x3 = x3 * x3 % P;
        z3 = (da - cb + P) % P; z3 = z3 * z3 % P * x1 % P;
        x2 = aa * bb % P; z2 = e * ((aa + 121665n * e) % P) % P;
    }
    if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    return toBytesLE(x2 * modPow(z2, P - 2n, P) % P, 32);
}

function mP(v) { return ((v % P) + P) % P; }

function edAdd(p, q) {
    const [x1, y1, z1, t1] = p, [x2, y2, z2, t2] = q;
    const a = mP(mP(y1 - x1) * mP(y2 - x2)), b = mP(mP(x1 + y1) * mP(x2 + y2));
    const c = mP(2n * mP(t1 * t2) * D), d = mP(2n * mP(z1 * z2));
    const e = mP(b - a), f = mP(d - c), g = mP(d + c), h = mP(b + a);
    return [mP(e * f), mP(g * h), mP(f * g), mP(e * h)];
}

const ED_IDENTITAS = [0n, 1n, 1n, 0n], ED_BASE = [BX, BY, 1n, BX * BY % P];

function edScalar(s) {
    let p = ED_IDENTITAS;
    for (let i = 255; i >= 0; i--) { p = edAdd(p, p); if ((s >> BigInt(i)) & 1n) p = edAdd(p, ED_BASE); }
    return p;
}

function edToBytes(p) {
    const [x, y, z] = p, zi = modPow(mP(z), P - 2n, P), xn = mP(x * zi), yn = mP(y * zi);
    const r = Buffer.from(toBytesLE(yn, 32)); r[31] ^= Number(xn & 1n) << 7; return r;
}

function buatKeyPairDari(seed) {
    if (seed.length !== 32) throw new Error('seed length invalid');
    const sk = clampSK(seed), pk = Buffer.from(perkalian(sk, Buffer.concat([Buffer.from([9]), Buffer.alloc(31)])));
    pk[31] &= 127; return { public: pk, private: Buffer.from(sk) };
}

function buatKeyPair() { return buatKeyPairDari(crypto.randomBytes(32)); }

function sigma(privateKey, msg) {
    if (privateKey.length !== 32) throw new Error('pk length invalid');
    const sk = clampSK(privateKey), a = fromBytesLE(sk), aPub = edToBytes(edScalar(a));
    const sigmaBit = aPub[31] & 0x80;
    const rInt = fromBytesLE(crypto.createHash('sha512').update(Buffer.concat([sk, msg])).digest()) % L;
    const rr = edToBytes(edScalar(rInt));
    const hInt = fromBytesLE(crypto.createHash('sha512').update(Buffer.concat([rr, aPub, msg])).digest()) % L;
    const sInt = (rInt + hInt * a) % L, sig = Buffer.concat([rr, toBytesLE(sInt, 32)]);
    sig[63] |= sigmaBit; return sig;
}

function pubKeyDenganPrefix(p) { return p.length === 33 ? p : Buffer.concat([Buffer.from([5]), p]); }
function preKeyIbu(idk) { const preKey = buatKeyPair(); return { key_pair: preKey, signature: sigma(idk.private, pubKeyDenganPrefix(preKey.public)) }; }
function buatToken(nomor) { return md5hex(WA_MARK + md5hex(VERSI) + nomor); }

function pisahNomor(raw) {
    const digits = String(raw).replace(/\D/g, '');
    for (const panjang of [3, 2, 1]) {
        if (digits.length > panjang) {
            const cc = digits.slice(0, panjang);
            if (KODE_NEGARA.has(Number.parseInt(cc, 10))) return { cc, nomor: digits.slice(panjang) };
        }
    }
    return { cc: digits.slice(0, 3), nomor: digits.slice(3) };
}

// Kode negara ISO-2 berdasarkan kode telepon internasional.
const ISO_NEGARA_BY_KODE = {
    '1':'US/CA','7':'RU/KZ','20':'EG','27':'ZA','30':'GR','31':'NL','32':'BE',
    '33':'FR','34':'ES','36':'HU','39':'IT','40':'RO','41':'CH','43':'AT',
    '44':'GB','45':'DK','46':'SE','47':'NO','48':'PL','49':'DE','51':'PE',
    '52':'MX','53':'CU','54':'AR','55':'BR','56':'CL','57':'CO','58':'VE',
    '60':'MY','61':'AU','62':'ID','63':'PH','64':'NZ','65':'SG','66':'TH',
    '81':'JP','82':'KR','84':'VN','86':'CN','90':'TR','91':'IN','92':'PK',
    '93':'AF','94':'LK','95':'MM','98':'IR','211':'SS','212':'MA','213':'DZ',
    '216':'TN','218':'LY','220':'GM','221':'SN','222':'MR','223':'ML','224':'GN',
    '225':'CI','226':'BF','227':'NE','228':'TG','229':'BJ','230':'MU','231':'LR',
    '232':'SL','233':'GH','234':'NG','593':'EC','235':'TD','236':'CF','237':'CM','238':'CV',
    '239':'ST','240':'GQ','241':'GA','242':'CG','243':'CD','244':'AO','248':'SC',
    '249':'SD','250':'RW','595':'PY','591':'BO','251':'ET','252':'SO','253':'DJ','254':'KE','255':'TZ',
    '256':'UG','257':'BI','258':'MZ','260':'ZM','261':'MG','263':'ZW','264':'NA',
    '265':'MW','266':'LS','267':'BW','268':'SZ','351':'PT','352':'LU','353':'IE',
    '354':'IS','355':'AL','356':'MT','357':'CY','358':'FI','359':'BG','370':'LT',
    '371':'LV','372':'EE','373':'MD','374':'AM','375':'BY','376':'AD','380':'UA',
    '381':'RS','385':'HR','386':'SI','420':'CZ','421':'SK','852':'HK','853':'MO',
    '855':'KH','856':'LA','880':'BD','886':'TW','960':'MV','961':'LB','962':'JO',
    '963':'SY','964':'IQ','965':'KW','966':'SA','967':'YE','968':'OM','971':'AE',
    '972':'IL','973':'BH','974':'QA','975':'BT','976':'MN','977':'NP','992':'TJ',
    '993':'TM','994':'AZ','995':'GE','996':'KG','998':'UZ'
};

function kodeNegaraISO(nomor) {
    const { cc } = pisahNomor(nomor);
    return ISO_NEGARA_BY_KODE[cc] || (cc ? `+${cc}` : 'Tidak diketahui');
}

function benderaNegara(kode) {
    const flags = {
        'US/CA': '🇺🇸/🇨🇦',
        'RU/KZ': '🇷🇺/🇰🇿'
    };
    if (flags[kode]) return flags[kode];
    if (typeof kode !== 'string' || !/^[A-Z]{2}$/.test(kode)) return '🏳️';
    return String.fromCodePoint(...[...kode].map(ch => 127397 + ch.charCodeAt(0)));
}

function bacaRespons(raw) {
    const idx = raw.indexOf('\r\n\r\n');
    if (idx === -1) throw new Error('http response format invalid');
    const head = raw.slice(0, idx).toString('utf8'), baris = head.split('\r\n');
    const statusHttp = Number.parseInt((baris[0].match(/HTTP\/[\d.]+ (\d+)/) || [])[1] ?? '0', 10);
    let body = raw.slice(idx + 4);
    if (/transfer-encoding:\s*chunked/i.test(head)) {
        const out = []; let pos = 0;
        while (pos < body.length) {
            const nl = body.indexOf('\r\n', pos);
            if (nl === -1) break;
            const size = Number.parseInt(body.slice(pos, nl).toString('utf8').trim(), 16);
            if (!size) break;
            out.push(body.slice(nl + 2, nl + 2 + size));
            pos = nl + 2 + size + 2;
        }
        body = Buffer.concat(out);
    }
    return { status: statusHttp, body: body.toString('utf8') };
}

function requestDirect(targetUrl, headers, timeoutMs, sesi) {
    return new Promise((resolve, reject) => {
        const mod = targetUrl.startsWith('http:') ? http : https;
        let settled = false;
        const finish = (err, val) => { if (settled) return; settled = true; err ? reject(err) : resolve(val); };
        const req = mod.get(targetUrl, { headers: Object.assign({ Accept: 'text/json', Connection: 'close' }, headers), timeout: timeoutMs, rejectUnauthorized: false }, res => {
            const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => finish(null, { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
            res.on('error', e => finish(e));
        });
        if (sesi) { sesi.abortActive = () => req.destroy(new Error('Deteksi dihentikan')); sesi.activeRequest = req; req.once('close', () => { if (sesi.activeRequest === req) { sesi.activeRequest = null; sesi.abortActive = null; } }); }
        req.on('timeout', () => { req.destroy(); finish(new Error('timeout')); });
        req.on('error', e => finish(e));
    });
}

function connectTunnel(proxyUrl, targetHost, targetPort, timeoutMs) {
    return new Promise((resolve, reject) => {
        let p; try { p = new URL(proxyUrl); } catch (e) { return reject(e); }
        const socket = net.connect({ host: p.hostname, port: Number.parseInt(p.port ?? '80', 10) });
        socket.setTimeout(timeoutMs);
        let settled = false;
        const selesai = (err, sock) => {
            if (settled) return;
            settled = true;
            socket.removeAllListeners();
            if (err) { socket.destroy(); reject(err); } else resolve(sock);
        };
        socket.on('data', d => {
            if (settled) return;
            const str = d.toString('utf8');
            if (str.includes('\r\n\r\n')) {
                if (/^HTTP\/[\d.]+ 200/.test(str)) selesai(null, socket);
                else selesai(new Error('proxy connection failed'));
            }
        });
        socket.on('error', e => selesai(e));
        socket.on('timeout', () => selesai(new Error('timeout')));
        const auth = p.username ? 'Proxy-Authorization: Basic ' + Buffer.from(decodeURIComponent(p.username) + ':' + decodeURIComponent(p.password)).toString('base64') + '\r\n' : '';
        socket.write('CONNECT ' + targetHost + ':' + targetPort + ' HTTP/1.1\r\nHost: ' + targetHost + ':' + targetPort + '\r\n' + auth + '\r\n');
    });
}

async function requestViaProxy(targetUrl, headers, proxy, timeoutMs, sesi) {
    const u = new URL(targetUrl), isHttps = u.protocol === 'https:';
    const proxyUrlObj = new URL(proxy);
    const startTime = Date.now();
    const logMonitoring = () => {
        monitoringProxy.push({ time: new Date().toISOString(), host: proxyUrlObj.hostname, port: proxyUrlObj.port, ms: Date.now() - startTime });
        if (monitoringProxy.length > 50) monitoringProxy.shift();
    };
    if (!isHttps) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (err, val) => { if (settled) return; settled = true; err ? reject(err) : resolve(val); };
            const req = http.get({ host: proxyUrlObj.hostname, port: Number.parseInt(proxyUrlObj.port ?? '80', 10), path: targetUrl, headers: Object.assign({ Host: u.host, Accept: 'text/json', Connection: 'close' }, headers), timeout: timeoutMs }, res => {
                const chunks = []; res.on('data', d => chunks.push(d)); res.on('end', () => { logMonitoring(); finish(null, { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }); });
                res.on('error', e => finish(e));
            });
            if (sesi) { sesi.abortActive = () => req.destroy(new Error('Deteksi dihentikan')); sesi.activeRequest = req; req.once('close', () => { if (sesi.activeRequest === req) { sesi.activeRequest = null; sesi.abortActive = null; } }); }
            req.on('timeout', () => { req.destroy(); finish(new Error('timeout')); });
            req.on('error', e => finish(e));
        });
    }
    const socket = await connectTunnel(proxy, u.hostname, 443, timeoutMs);
    if (sesi) { sesi.activeRequest = socket; sesi.abortActive = () => socket.destroy(new Error('Deteksi dihentikan')); }
    return new Promise((resolve, reject) => {
        const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false });
        if (sesi) { sesi.activeRequest = tlsSock; sesi.abortActive = () => { tlsSock.destroy(new Error('Deteksi dihentikan')); socket.destroy(); }; tlsSock.once('close', () => { if (sesi.activeRequest === tlsSock) { sesi.activeRequest = null; sesi.abortActive = null; } }); }
        tlsSock.setTimeout(timeoutMs); let raw = Buffer.alloc(0);
        let settled = false;
        const selesai = (err, hasil) => { if (settled) return; settled = true; tlsSock.destroy(); socket.destroy(); if (err) reject(err); else resolve(hasil); };
        tlsSock.on('data', d => { raw = Buffer.concat([raw, d]); });
        tlsSock.on('close', () => {
            try { const parsed = bacaRespons(raw); logMonitoring(); selesai(null, parsed); }
            catch (e) { selesai(e); }
        });
        tlsSock.on('timeout', () => selesai(new Error('timeout'))); tlsSock.on('error', e => selesai(e));
        tlsSock.write(['GET ' + u.pathname + u.search + ' HTTP/1.1', 'Host: ' + u.host, 'User-Agent: ' + (headers['User-Agent'] ?? 'AmbaDetect'), 'Accept: text/json', 'Connection: close', '\r\n'].join('\r\n'));
    });
}

function buatDataAnjing(cc, nomor, method) {
    const idk = buatKeyPair(), ibu = preKeyIbu(idk), noise = buatKeyPair();
    return {
        cc, in: nomor, lg: 'en', lc: 'GB', mistyped: '6',
        authkey: b64url(noise.public),
        e_regid: b64url(Buffer.from(toBytesLE(BigInt(crypto.randomBytes(2).readUInt16BE(0) & 16383), 4))),
        e_keytype: 'BQ', e_ident: b64url(idk.public),
        e_skey_id: b64url(Buffer.from([0, 1, 0])),
        e_skey_val: b64url(ibu.key_pair.public),
        e_skey_sig: b64url(ibu.signature),
        fdid: crypto.randomUUID(), expid: b64url(crypto.randomBytes(16)),
        network_radio_type: '1', simnum: '1', hasinrc: '1',
        pid: String(1000 + Math.floor(Math.random() * 9000)), rc: '0',
        id: b64url(crypto.randomBytes(20)), token: buatToken(nomor), method
    };
}

function buatQuery(data) { return Object.entries(data).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }

async function cek(number, method = 'wa_old', opsi = {}) {
    const digits = String(number).replace(/\D/g, '');
    if (digits.length < 8) return { status: 'invalid', reason: 'NOMOR KEPENDEKAN' };
    const hasil = pisahNomor(number), cc = hasil.cc, nomor = hasil.nomor;
    if (!cc || !nomor) return { status: 'invalid', reason: 'GAK BISA PISAH KODE NEGARA' };
    const url = API_URL + '?' + buatQuery(buatDataAnjing(cc, nomor, method)), headers = { 'User-Agent': buatUA(), Accept: 'text/json' };
    let res;
    try {
        if (opsi.proxy) res = await requestViaProxy(url, headers, opsi.proxy, opsi.timeout ?? 15000, opsi.sesi);
        else res = await requestDirect(url, headers, opsi.timeout ?? 15000, opsi.sesi);
    } catch (e) { throw new Error('REQUEST GAGAL: ' + e.message); }
    try {
        const parsed = JSON.parse(res.body);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
        return parsed;
    } catch (e) { throw new Error('HTTP ' + res.status + ': RESPON BUKAN JSON'); }
}

function perluRetry(r, percobaanKe) {
    if (!r || typeof r !== 'object') return true;
    if (r.status === 'invalid') return false;
    if (RETRY_REASONS.has(r.reason ?? '')) return true;
    if (r.status === 'error' && typeof r.sms_wait !== 'number') return true;
    if (r.reason === 'no_routes' && percobaanKe < DETEK_RETRY_NO_ROUTES) return true;
    return false;
}

async function detect(number, method = 'wa_old', useProxy = true, sesi = null) {
    let r = null, percobaanKe = 0, noRoutesKe = 0, totalMaks = DETEK_MAX_PERCOBAAN + DETEK_RETRY_NO_ROUTES;
    const mulai = Date.now();
    for (let i = 0; i < totalMaks; i++) {
        if (sesi && sesi.stop) return { hasil: null, cancelled: true };
        percobaanKe = i + 1;
        const currentProxy = useProxy ? getRandomProxy() : null;
        if (useProxy && !currentProxy) throw new Error('Proxy belum diatur atau semua proxy offline');
        try { r = await cek(number, method, { proxy: currentProxy, timeout: DETEK_TIMEOUT * 1000, sesi }); }
        catch (e) { if (sesi && sesi.stop) return { hasil: null, cancelled: true }; r = { status: 'error', reason: useProxy ? 'dataimpulse_gagal' : 'tai_gagal', detail: e.message }; }
        if (sesi && sesi.stop) return { hasil: null, cancelled: true };
        if (r.reason === 'no_routes') { noRoutesKe++; if (noRoutesKe >= DETEK_NO_ROUTES_EARLY_STOP) break; }
        if (!perluRetry(r, noRoutesKe)) { if (percobaanKe > 1 && r && typeof r === 'object') r._retry = percobaanKe; return { hasil: r, durasi: (Date.now() - mulai) / 1000 }; }
        if (sesi && sesi.stop) return { hasil: null, cancelled: true };
        await jeda(DETEK_JEDA_RETRY * 1000);
    }
    if (r && typeof r === 'object') { r._retry = percobaanKe; r._semua_percobaan_gagal = true; }
    return { hasil: r, durasi: (Date.now() - mulai) / 1000 };
}

function klasifikasi(r) {
    if (!r || typeof r !== 'object') return { kategori: 'error' };
    if (r.status === 'fail' && r.appeal_token) return { kategori: 'banned' };
    if (r.reason && ['temporarily_unavailable', 'too_many_requests', 'rate_limit', 'rate_limited', 'server_busy', 'try_again_later'].includes(String(r.reason).toLowerCase())) return { kategori: 'ngambek' };
    if (r.reason === 'blocked' && !r.appeal_token) return { kategori: 'clone' };
    if (r.status === 'invalid' || r.reason === 'no_routes' || r.reason === 'incorrect') return { kategori: 'tidak_dapat_otp' };
    if (r.reason === 'bad_token' || r.reason === 'old_version') return { kategori: 'error' };
    if (typeof r.sms_wait === 'number' && !Number.isNaN(r.sms_wait)) {
        if (r.sms_wait <= 0) return { kategori: 'siap', cooldown: 0 };
        return { kategori: 'cooldown', cooldown: Number.parseInt(r.sms_wait, 10) };
    }
    return { kategori: 'error' };
}

const detikKeTeks = (d) => {
    let n = Number.parseInt(d, 10);
    if (!n || n <= 0) return 'siap';
    const j = Math.floor(n / 3600), s = n % 3600, m = Math.floor(s / 60), dt = s % 60;
    const p = []; if (j) p.push(j + 'j'); if (m || j) p.push(m + 'm'); p.push(dt + 's'); return p.join(' ');
};

const checkMembership = async (userId) => {
    if (isOwner(userId)) return true;
    const db = getDB();
    const groupIds = Array.isArray(db.config.verification_group_ids) ? db.config.verification_group_ids.filter(Boolean) : [];
    if (groupIds.length === 0) return true;
    for (const groupId of groupIds) {
        try { const member = await bot.telegram.getChatMember(groupId, userId); if (['creator', 'administrator', 'member'].includes(member.status)) return true; } catch (error) {}
    }
    return false;
};

const resolveUserTier = (userId, db) => {
    if (isOwner(userId)) return 'ADMIN';
    const u = db.users[String(userId)];
    const t = String((u && u.tier) || 'FREE').toUpperCase();
    const tierDefs = db.config && db.config.tiers && typeof db.config.tiers === 'object' ? db.config.tiers : {};
    if (t !== 'FREE' && t !== 'ADMIN' && tierDefs[t]) {
        if (u && u.expiredAt && new Date(u.expiredAt) < new Date()) { u.tier = 'FREE'; u.expiredAt = null; saveDB(db); return 'FREE'; }
        return t;
    }
    if (t === 'VIP' || t === 'VVIP') {
        if (u && u.expiredAt && new Date(u.expiredAt) < new Date()) { u.tier = 'FREE'; u.expiredAt = null; saveDB(db); return 'FREE'; }
        return t;
    }
    return 'FREE';
};

const getTierLabel = (tier) => {
    const t = String(tier || 'FREE').toUpperCase();
    if (t === 'ADMIN') return 'ADMIN';
    if (t === 'VVIP') return 'XVIP';
    if (t === 'VIP') return 'VVIP';
    return t;

};

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const generateMenuText = (userId) => {
    const db = getDB();
    const tier = resolveUserTier(userId, db);
    const user = db.users[String(userId)] || { tier: 'FREE', deteksi: 0, name: 'User' };
    const tierLabel = getTierLabel(tier);
    const stats = db.stats || {};

    let statusText = '';
    if (tier === 'ADMIN') {
        statusText = `🟣 <b>${tb('UNLIMITED ACCESS')}</b> · ${tb('Owner/Admin')}`;
    } else if (tier !== 'FREE') {
        const exp = user.expiredAt ? new Date(user.expiredAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Permanen';
        statusText = `🟢 <b>${tb('AKTIF')}</b> · ${tb('Berakhir')}: ${esc(exp)}`;
    } else {
        const today = new Date().toISOString().split('T')[0];
        const todayCount = user.lastDetectDate === today ? (Number(user.detectToday) || 0) : 0;
        statusText = db.config.freeDailyLimitEnabled ? `🔵 <b>${tb('FREE')}</b> · ${tb('Sisa kuota')}: ${Math.max(0, Number(db.config.freeDailyLimit || 0) - todayCount)}/${Number(db.config.freeDailyLimit || 0)} ${tb('hari ini')}` : `🔵 <b>${tb('FREE')}</b> · ${tb('Limit harian')}: Nonaktif`;
    }

    const number = (value) => (Number(value) || 0).toLocaleString('id-ID');
    return `<blockquote>┏━━━━━━━━━━━━━━━━━━━━━━┓
┃  ✦ ${esc(BOT_DISPLAY_NAME)} ✦
┃  ${tb('WHATSAPP DETECTOR SUITE')}
┗━━━━━━━━━━━━━━━━━━━━━━┛</blockquote>

${tb('Selamat datang')}, <b>${esc(user.name || 'User')}</b> 👋
<i>${tb('Kelola deteksi dan akun Anda melalui menu di bawah.')}</i>

<blockquote>┌ 👤 ${tb('INFORMASI AKUN')}
│ ${tb('Tier')}: <b>${tierLabel}</b>
│ ${tb('Status')}: ${statusText}
└────────────────────</blockquote>

<blockquote>┌ 📈 ${tb('STATISTIK BOT')}
│ ${tb('Total pengguna')}: <b>${number(stats.total_user)}</b>
│ ${tb('Total deteksi')}: <b>${number(stats.total_deteksi)}</b>
│ ${tb('FREE')}: <b>${number(stats.free)}</b>
│ ${tb('VIP')}: <b>${number(stats.premium)}</b>
│ ${tb('VVIP')}: <b>${number(stats.super)}</b>
└────────────────────</blockquote>

<blockquote>┌ 🏷️ ${tb('RINGKASAN TRANSAKSI')}
│ ${tb('Pendapatan')}: <b>Rp ${number(stats.revenue)}</b>
│ ${tb('Transaksi')}: <b>${number(stats.trx)} ${tb('kali')}</b>
└────────────────────</blockquote>

<blockquote>🕒 ${formatWaktu()}
<i>${tb('Terima kasih telah menggunakan layanan kami.')}</i></blockquote>`;
};

const MENU_UTAMA = Markup.keyboard([[`🔍 ${tb('DETEKSI')}`, `💎 ${tb('BELI TIER')}`], [`📨 ${tb('BANDING VIA EMAIL')}`], [`🏆 ${tb('TOP DETEKSI')}`, `🔗 ${tb('REFERRAL')}`], [`⚙️ PANEL OWNER`]]).resize();
const MENU_OWNER = Markup.keyboard([[`🔍 ${tb('DETEKSI')}`, `💎 ${tb('BELI TIER')}`], [`📨 ${tb('BANDING VIA EMAIL')}`], [`🏆 ${tb('TOP DETEKSI')}`, `🔗 ${tb('REFERRAL')}`], [`⚙️ PANEL OWNER`]]).resize();
const MENU_CANCEL_ONLY = Markup.keyboard([["❌ Batal"]]).resize();

const safeAnswer = async (ctx, text, opts = {}) => {
    try {
        if (ctx.callbackQuery && !ctx.answerCalled) {
            await Promise.race([
                ctx.answerCbQuery(text, opts),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
            ]);
            ctx.answerCalled = true;
        }
    } catch (e) { ctx.answerCalled = true; }
};

const safeEdit = async (ctx, text, extra) => {
    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            if (ctx.callbackQuery.message.photo || ctx.callbackQuery.message.document) {
                try { await ctx.editMessageCaption(text, extra); return true; } catch (e) {}
            } else {
                try { await ctx.editMessageText(text, extra); return true; } catch (e) {
                    if (String(e.message || '').includes('message is not modified')) return true;
                    try { await ctx.editMessageCaption(text, extra); return true; } catch (e2) {}
                }
            }
        }
    } catch (e) {}
    try { await ctx.reply(text, extra); return true; }
    catch (e) { return false; }
};

async function editPesan(ctx, text, extra) { return safeEdit(ctx, text, extra); }

async function kirimMenuStart(ctx) {
    const userId = ctx.from.id.toString();
    const db = getDB();
    if (!db.users[userId]) {
        const startTier = isOwner(userId) ? 'ADMIN' : 'FREE';
        db.users[userId] = { id: userId, name: ctx.from.first_name, tier: startTier, deteksi: 0, today: 0, joinedAt: new Date() };
        db.stats.total_user += 1; if (startTier === 'FREE') db.stats.free += 1;
        saveDB(db);
        await kirimNotifGrup(`🆕 <b>USER BARU</b>\n\n<blockquote>Nama: ${esc(ctx.from.first_name || 'User')}\nUsername: ${ctx.from.username ? '@' + esc(ctx.from.username) : '-'}\nUser ID: <code>${userId}</code>\nTier: <b>${startTier}</b></blockquote>`);
    }
    if (isOwner(userId) && db.users[userId].tier !== 'ADMIN') {
        db.users[userId].tier = 'ADMIN';
        db.users[userId].expiredAt = null;
        saveDB(db);
    }
    if (!(await checkMembership(userId))) {
        const groupIds = Array.isArray(db.config.verification_group_ids) ? db.config.verification_group_ids.filter(Boolean) : [];
        const links = Array.isArray(db.config.verification_links) ? db.config.verification_links : [];
        const buttons = [];
        groupIds.forEach((gid, idx) => buttons.push([Markup.button.url(`📢 ${tb('Join Grup')} ${idx + 1}`, links[idx] || GROUP_INVITE_LINK)]));
        buttons.push([Markup.button.callback(`🔄 ${tb('Cek Verifikasi')}`, "check_verify")]);
        return ctx.reply(`<b>══════════════════════════
│ ${tb('VERIFIKASI JOIN GRUP')} │
╰══════════════════════════</b>

<b><blockquote>${tb('Bergabunglah ke grup resmi di bawah untuk menggunakan bot.')}

${tb('Setelah bergabung, tekan tombol Verifikasi.')}</blockquote></b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }
    const cap = generateMenuText(userId);
    const dbLatest = getDB();
    const bannerId = dbLatest.config && dbLatest.config.menu_banner_file_id;
    const inlineKeyboard = Markup.inlineKeyboard([[Markup.button.callback(`🔴 ${tb('Tutup Menu')}`, "close_inline")]]);
    if (bannerId) {
        await ctx.replyWithPhoto(bannerId, { caption: cap, parse_mode: 'HTML', ...inlineKeyboard }).catch(async () => {
            await ctx.reply(cap, { parse_mode: 'HTML', ...inlineKeyboard }).catch(() => {});
        });
    } else {
        await ctx.reply(cap, { parse_mode: 'HTML', ...inlineKeyboard }).catch(() => {});
    }
    const menuNavigasi = isOwner(userId) ? MENU_OWNER : MENU_UTAMA;
    await ctx.reply(`<b>▰ ${tb('MENU NAVIGASI')} ▰</b>
<i>${tb('Pilih salah satu fitur untuk melanjutkan.')}</i>`, { parse_mode: 'HTML', ...menuNavigasi }).catch(() => {});
}

bot.use(async (ctx, next) => {
    const uid = ctx.from && String(ctx.from.id);
    if (uid && !isOwner(uid)) {
        const u = getDB().users[uid];
        if (u && u.banned) {
            if (ctx.callbackQuery) return safeAnswer(ctx, '🚫 Akses bot Anda sedang dibanned.', { show_alert: true });
            if (ctx.message) return ctx.reply('🚫 Akses bot Anda sedang dibanned. Hubungi admin jika ini keliru.');
            return;
        }
    }
    return next();
});

bot.start(async (ctx) => { await kirimMenuStart(ctx); });

bot.command('cekid', async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply(`❌ ${tb('Akses Ditolak.')}`);
    if (ctx.chat.type === 'private') return ctx.reply(`⚠️ ${tb('Perintah ini hanya bisa digunakan di dalam Grup atau Channel.')}`);
    const chatId = ctx.chat.id, chatTitle = ctx.chat.title || 'Tanpa Nama';
    let linkInvite = '';
    try {
        const existingLink = ctx.chat.invite_link;
        linkInvite = existingLink || (await bot.telegram.createChatInviteLink(chatId, { member_limit: 0 })).invite_link;
    } catch (e) { linkInvite = ctx.chat.username ? `https://t.me/${ctx.chat.username}` : 'Gagal membuat link invite (pastikan bot admin)'; }
    const db = getDB();
    if (!Array.isArray(db.config.verification_group_ids)) db.config.verification_group_ids = [];
    if (!Array.isArray(db.config.verification_links)) db.config.verification_links = [];
    if (db.config.verification_group_ids.includes(chatId)) {
        const idx = db.config.verification_group_ids.indexOf(chatId);
        db.config.verification_links[idx] = linkInvite;
        if (!db.config.notification_group_ids.includes(chatId)) db.config.notification_group_ids.push(chatId);
        saveDB(db);
        return ctx.reply(`ℹ️ ${tb('Grup ini sudah terdaftar di slot verifikasi')} ${idx + 1}.\n${tb('Link diperbarui')}: ${linkInvite}`);
    }
    if (db.config.verification_group_ids.length >= 2) return ctx.reply(`⚠️ ${tb('Slot verifikasi sudah penuh (2/2). Gunakan /resetverify 1 atau /resetverify 2 untuk mengosongkan slot terlebih dahulu.')}`, { parse_mode: 'HTML' });
    db.config.verification_group_ids.push(chatId); db.config.verification_links.push(linkInvite);
    if (!db.config.notification_group_ids.includes(chatId)) db.config.notification_group_ids.push(chatId);
    saveDB(db);
    ctx.reply(`✅ <b>${tb('BERHASIL DIATUR')} — ${tb('SLOT')} ${db.config.verification_group_ids.length}/2</b>\n\n<blockquote>${tb('Grup')}: ${chatTitle}\n${tb('ID')}: <code>${chatId}</code>\n${tb('Link Verifikasi')}: ${linkInvite}</blockquote>\n\n${tb('Grup ini kini menjadi Pusat Verifikasi dan ditambahkan ke daftar Notifikasi.')}`, { parse_mode: 'HTML' });
});

bot.command('resetverify', async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply(`❌ ${tb('Akses Ditolak.')}`);
    const slot = parseInt(ctx.message.text.split(' ')[1], 10);
    if (!slot || slot < 1 || slot > 2) return ctx.reply(`⚠️ ${tb('Format')}: <code>/resetverify 1</code> ${tb('atau')} <code>/resetverify 2</code>`, { parse_mode: 'HTML' });
    const db = getDB();
    if (!Array.isArray(db.config.verification_group_ids)) db.config.verification_group_ids = [];
    if (!Array.isArray(db.config.verification_links)) db.config.verification_links = [];
    const idx = slot - 1;
    if (!db.config.verification_group_ids[idx]) return ctx.reply(`ℹ️ ${tb('Slot')} ${slot} ${tb('sudah kosong.')}`, { parse_mode: 'HTML' });
    const oldId = db.config.verification_group_ids[idx];
    db.config.verification_group_ids.splice(idx, 1); db.config.verification_links.splice(idx, 1);
    db.config.verification_group_id = db.config.verification_group_ids[0] || null;
    db.config.verification_link = db.config.verification_links[0] || null;
    saveDB(db);
    ctx.reply(`✅ <b>${tb('SLOT')} ${slot} ${tb('DIKOSONGKAN')}</b>\n\n<blockquote>${tb('ID lama')}: <code>${oldId}</code></blockquote>`, { parse_mode: 'HTML' });
});

bot.command('resetallverify', async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply(`❌ ${tb('Akses Ditolak.')}`);
    const db = getDB();
    db.config.verification_group_ids = []; db.config.verification_links = [];
    db.config.verification_group_id = null; db.config.verification_link = null;
    saveDB(db);
    ctx.reply(`✅ <b>${tb('SEMUA SLOT VERIFIKASI DIKOSONGKAN')}</b>\n\n<blockquote>${tb('Verifikasi grup telah dimatikan total.')}</blockquote>`, { parse_mode: 'HTML' });
});

bot.command('removebanner', async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply(`❌ ${tb('Akses Ditolak.')}`);
    const db = getDB();
    if (!db.config) db.config = {};
    delete db.config.menu_banner_file_id;
    if (!saveDB(db)) return ctx.reply('❌ Gagal menghapus banner.');
    return ctx.reply('✅ Banner menu berhasil dihapus. Menu akan kembali ditampilkan sebagai teks biasa.');
});

bot.command('welcomebot', async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply(`❌ ${tb('Akses Ditolak.')}`);
    const db = getDB();
    const status = db.config.welcome_enabled ? `🟢 ON` : `🔴 OFF`;
    await ctx.reply(`<b>👋 ${tb('PENGATURAN WELCOME')}</b>\n\n<blockquote>${tb('Status saat ini')}: <b>${status}</b>\n\n${tb('Jika di-ON-kan, bot akan otomatis mengirim pesan sambutan + foto ke setiap user baru yang join ke grup verifikasi.')}</blockquote>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback("🟢 ON", "welcome_on"), Markup.button.callback("🔴 OFF", "welcome_off")]])
    });
});

bot.command('cancel', async (ctx) => {
    if (!isOwner(ctx.from.id)) return;
    delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
    await ctx.reply(`✅ ${tb('Aksi dibatalkan.')}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali ke Panel')}`, "owner_back")]]) });
});

bot.action('welcome_on', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    const db = getDB(); db.config.welcome_enabled = true; saveDB(db);
    await safeAnswer(ctx, `✅ ${tb('Welcome diaktifkan!')}`);
    await safeEdit(ctx, `<b>👋 ${tb('PENGATURAN WELCOME')}</b>\n\n<blockquote>${tb('Status saat ini')}: <b>🟢 ON</b></blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback("🟢 ON", "welcome_on"), Markup.button.callback("🔴 OFF", "welcome_off")]]) });
});

bot.action('welcome_off', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    const db = getDB(); db.config.welcome_enabled = false; saveDB(db);
    await safeAnswer(ctx, `❌ ${tb('Welcome dimatikan!')}`);
    await safeEdit(ctx, `<b>👋 ${tb('PENGATURAN WELCOME')}</b>\n\n<blockquote>${tb('Status saat ini')}: <b>🔴 OFF</b></blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback("🟢 ON", "welcome_on"), Markup.button.callback("🔴 OFF", "welcome_off")]]) });
});

// Pemilihan metode mengirim satu email berisi daftar nomor yang dikirim user.
bot.action(/^email_method_(\d+)$/, async (ctx) => {
    const selectedTemplateIndex = Number(ctx.match[1]);
    const uid = String(ctx.from.id);
    const flow = bandingEmailState[uid];
    if (!flow || flow.step !== 'method' || !Array.isArray(flow.numbers) || !flow.numbers.length) return safeAnswer(ctx, 'Sesi sudah berakhir.', { show_alert: true });
    if (flow.sending) return safeAnswer(ctx, 'Email sedang diproses.', { show_alert: true });
    flow.sending = true;
    await ctx.deleteMessage().catch(err => {
        console.error('Gagal menghapus pesan metode:', err.message);
    });
    const db = getDB();
    const now = Date.now();
    db.config.email_user_last_sent = db.config.email_user_last_sent || {};
    const cooldown = 2 * 60 * 1000;
    const lastSent = Number(db.config.email_user_last_sent[uid] || 0);
    if (now - lastSent < cooldown) {
        flow.sending = false;
        const left = Math.ceil((cooldown - (now - lastSent)) / 60000);
        return safeAnswer(ctx, `Tunggu ${left} menit sebelum mengirim pengajuan berikutnya.`, { show_alert: true });
    }
    const senders = db.config.email_senders || [];
    const recipients = db.config.email_recipients || [];
    const templates = db.config.email_templates || [];
    if (!senders.length || !recipients.length || !templates.length) {
        flow.sending = false;
        return safeAnswer(ctx, 'Konfigurasi email belum lengkap. Hubungi admin.', { show_alert: true });
    }
    const lastUsed = db.config.email_sender_last_used || {};
    const eligible = senders.filter(email => {
        const sentAt = Number(lastUsed[email] || 0);
        return now - sentAt >= 5 * 60 * 1000;
    });
    if (!eligible.length) {
        flow.sending = false;
        return safeAnswer(ctx, 'Email pengirim sedang dalam jeda. Coba beberapa menit lagi.', { show_alert: true });
    }
    const sender = eligible[Math.floor(Math.random() * eligible.length)];
    const credential = (db.config.email_app_passwords || []).find(x => x.email === sender);
    if (!credential) {
        flow.sending = false;
        return safeAnswer(ctx, 'App Password pengirim belum dikonfigurasi. Hubungi admin.', { show_alert: true });
    }
    const template = templates[selectedTemplateIndex];
    if (!template || typeof template.body !== 'string') {
        flow.sending = false;
        return safeAnswer(ctx, 'Metode tidak valid. Silakan mulai ulang pengajuan.', { show_alert: true });
    }
    const daftarNomor = flow.numbers.map((item, index) => `${index + 1}. ${item.number}`).join('\n');
    const nomorSaja = flow.numbers.map(item => item.number).join('\n');
    const body = String(template.body || '')
        .replace(/\{daftar_nomor\}/gi, daftarNomor)
        .replace(/\{nomor\}/gi, nomorSaja);
    if (!body.trim()) {
        flow.sending = false;
        return safeAnswer(ctx, 'Template email kosong.', { show_alert: true });
    }
    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: sender, pass: dekripsiAppPassword(credential) },
            connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 30000
        });
        await transporter.sendMail({
            from: sender,
            to: recipients.join(', '),
            subject: 'Permohonan Peninjauan Akun WhatsApp',
            text: body
        });
        db.config.email_sender_last_used = db.config.email_sender_last_used || {};
        db.config.email_sender_last_used[sender] = now;
        db.config.email_user_last_sent[uid] = now;
        db.config.email_send_history = Array.isArray(db.config.email_send_history) ? db.config.email_send_history : [];
        db.config.email_send_history.push({ userId: uid, numbers: flow.numbers.map(item => item.number), sender, recipients, sentAt: new Date(now).toISOString(), status: 'sent' });
        if (db.config.email_send_history.length > 500) db.config.email_send_history = db.config.email_send_history.slice(-500);
        saveDB(db);
        delete bandingEmailState[uid];
        await safeAnswer(ctx, 'Email berhasil dikirim.');
        await kirimNotifGrup(`📨 <b>EMAIL BANDING TERKIRIM</b>\n\n<blockquote>User: ${esc(ctx.from.first_name || 'User')}\nUser ID: <code>${uid}</code>\nJumlah nomor: <b>${flow.numbers.length}</b>\nMetode: Email\nStatus: Terkirim</blockquote>`);
        const daftarStatus = flow.numbers.map((item, index) => `${index + 1}. <code>${esc(item.number)}</code>`).join('\n');
        const statusAwal = `📨 <b>EMAIL BANDING TERKIRIM</b>\n\n<blockquote>Daftar nomor:\n${daftarStatus}\n\nJumlah: ${flow.numbers.length}\nStatus: Menunggu balasan\nPengirim: <code>Email Admin</code></blockquote>\n\nSatu email berisi seluruh nomor telah dikirim.`;
        const statusMsg = await ctx.reply(statusAwal, { parse_mode: 'HTML', ...MENU_UTAMA });
        const chatId = ctx.chat.id;
        const messageId = statusMsg.message_id;
        const nomorTerkirim = flow.numbers.map(item => item.number).join(', ');
        const updateStatus = setTimeout(async () => {
    const statusAkhir = `ℹ️ <b>STATUS PENGAJUAN</b>\n\n<blockquote>Nomor: <code>${esc(nomorTerkirim)}</code>\nStatus: Email telah dikirim; balasan WhatsApp belum diverifikasi.</blockquote>\n\nPeriksa kotak masuk email pengirim/tujuan untuk mengetahui balasan resmi. Bot tidak dapat memastikan akun telah dipulihkan hanya berdasarkan waktu.`;

    try {
        // Hapus pesan PENDING
        await ctx.telegram.deleteMessage(chatId, messageId);

        // Kirim pesan SUCCESS baru
        await ctx.telegram.sendMessage(chatId, statusAkhir, {
            parse_mode: 'HTML',
            ...MENU_UTAMA
        });

    } catch (err) {
        console.error('Gagal memperbarui status:', err.message);
    }
}, 60000);
        if (typeof updateStatus.unref === 'function') updateStatus.unref();
    } catch (err) {
        flow.sending = false;
        console.error('Pengiriman banding email gagal:', err.message);
        db.config.email_send_history = Array.isArray(db.config.email_send_history) ? db.config.email_send_history : [];
        db.config.email_send_history.push({ userId: uid, numbers: (flow.numbers || []).map(item => item.number), sender, sentAt: new Date().toISOString(), status: 'failed', error: String(err.message).slice(0, 180) });
        saveDB(db);
        await safeAnswer(ctx, 'Pengiriman gagal.', { show_alert: true });
        await ctx.reply('❌ Email gagal dikirim. Periksa konfigurasi SMTP/App Password atau hubungi admin. Pengajuan belum tercatat sebagai berhasil.', MENU_UTAMA);
    }
});

bot.action('email_draft_cancel', async (ctx) => {
    delete bandingEmailState[ctx.from.id];
    await safeAnswer(ctx, 'Dibatalkan.');
    await ctx.reply(tb('Proses banding email dibatalkan.'), MENU_UTAMA);
});

// Banding via email: menerima beberapa nomor dalam satu pesan dan satu pengajuan email.
bot.action('email_draft_start', async (ctx) => {
    bandingEmailState[ctx.from.id] = { step: 'numbers' };
    await safeAnswer(ctx);
    await ctx.reply(`✉️ <b>${tb('BANDING VIA EMAIL')}</b>\n\n<blockquote>${tb('Kirim daftar nomor, satu nomor per baris. Keterangan tambahan seperti (Low) dan bulan/tahun boleh disertakan.') }\n\n<code>+9647511226005 (Low) · Mar 2019\n+9647504976688 (Low) · Jun 2019</code>\n\n${tb('Maksimal 10 nomor dalam satu pengajuan. Setelah itu pilih metode; semua nomor dikirim dalam satu email.')}</blockquote>`, { parse_mode: 'HTML', ...MENU_CANCEL_ONLY });
});


// Manajemen alamat email untuk metadata/draf. Pengiriman otomatis tidak diaktifkan.
function validasiAlamatEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}
function tampilkanDaftarEmail(items) {
    if (!items.length) return '<blockquote>Belum ada alamat tersimpan.</blockquote>';
    return items.map((v, i) => `<blockquote>${i + 1}. <code>${esc(v)}</code></blockquote>`).join('\n');
}
bot.action('owner_email_management', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB();
    await safeAnswer(ctx);
    await safeEdit(ctx, `<b>📧 ${tb('MANAJEMEN EMAIL')}</b>\n\n<blockquote>${tb('Email pengirim')}: ${db.config.email_senders.length}\n${tb('Email tujuan')}: ${db.config.email_recipients.length}\n${tb('Password App tersimpan')}: ${(db.config.email_app_passwords || []).length} akun</blockquote>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ Tambahkan Email Pengirim', 'owner_email_sender_add')],
            [Markup.button.callback('📋 Daftar Email Pengirim', 'owner_email_sender_list')],
            [Markup.button.callback('➕ Tambahkan Email Tujuan', 'owner_email_recipient_add')],
            [Markup.button.callback('📋 Daftar Email Tujuan', 'owner_email_recipient_list')],
            [Markup.button.callback('➕ Tambahkan App Password', 'owner_email_app_password_add')],
            [Markup.button.callback('🔐 Status App Password', 'owner_email_app_password')],
            [Markup.button.callback('🔙 Kembali', 'owner_back')]
        ])
    });
});
bot.action('owner_email_sender_add', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    ownerState[ctx.from.id] = 'EMAIL_SENDER_ADD';
    await safeAnswer(ctx);
    await ctx.reply('Kirim alamat email pengirim yang ingin disimpan. Ketik batal untuk membatalkan.', MENU_CANCEL_ONLY);
});
bot.action('owner_email_recipient_add', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    ownerState[ctx.from.id] = 'EMAIL_RECIPIENT_ADD';
    await safeAnswer(ctx);
    await ctx.reply('Kirim alamat email tujuan yang ingin disimpan. Ketik batal untuk membatalkan.', MENU_CANCEL_ONLY);
});
bot.action('owner_email_sender_list', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB(); await safeAnswer(ctx);
    await safeEdit(ctx, `<b>📋 DAFTAR EMAIL PENGIRIM (${db.config.email_senders.length})</b>\n\n${tampilkanDaftarEmail(db.config.email_senders)}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'owner_email_management')]]) });
});
bot.action('owner_email_recipient_list', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB(); await safeAnswer(ctx);
    await safeEdit(ctx, `<b>📋 DAFTAR EMAIL TUJUAN (${db.config.email_recipients.length})</b>\n\n${tampilkanDaftarEmail(db.config.email_recipients)}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'owner_email_management')]]) });
});
bot.action('owner_email_app_password_add', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB();
    if (!db.config.email_senders.length) return safeAnswer(ctx, 'Tambahkan email pengirim terlebih dahulu.', { show_alert: true });
    ownerState[ctx.from.id] = 'EMAIL_APP_PASSWORD_EMAIL';
    await safeAnswer(ctx);
    await ctx.reply('Kirim alamat email pengirim yang akan dipasangkan dengan App Password. Email harus sudah terdaftar di daftar pengirim. Ketik batal untuk membatalkan.', MENU_CANCEL_ONLY);
});
bot.action('owner_email_app_password', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB();
    const daftar = (db.config.email_app_passwords || []).map((item, i) => `${i + 1}. <code>${esc(item.email)}</code> — 🟢 tersimpan`).join('\n') || 'Belum ada App Password tersimpan.';
    await safeAnswer(ctx);
    await safeEdit(ctx, `<b>🔐 STATUS APP PASSWORD</b>\n\n<blockquote>${daftar}\n\nPassword disimpan terenkripsi di database.json. Kunci enkripsinya berada di file terpisah <code>email_app_secret.key</code>. Jangan hapus atau bagikan file kunci tersebut. Pesan berisi password akan coba dihapus setelah diterima bot.</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('➕ Tambahkan App Password', 'owner_email_app_password_add')], [Markup.button.callback('🔄 Periksa Status', 'owner_email_app_password')], [Markup.button.callback('🔙 Kembali', 'owner_email_management')]]) });
});

bot.action('owner_email_templates', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB();
    const rows = (db.config.email_templates || []).map((t, i) => [Markup.button.callback(`📄 ${t.name}`, `owner_email_tpl_view_${i}`)]);
    rows.push([Markup.button.callback('➕ Tambah Template', 'owner_email_tpl_add')]);
    rows.push([Markup.button.callback('🔙 Kembali', 'owner_back')]);
    await safeAnswer(ctx);
    await safeEdit(ctx, `<b>✉️ ${tb('MANAJEMEN TEMPLATE EMAIL')}</b>\n\n<blockquote>${tb('Pilih template untuk melihat isi, atau tambahkan template baru.')}</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
});

bot.action(/^owner_email_tpl_view_(\d+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB(); const i = Number(ctx.match[1]); const tpl = (db.config.email_templates || [])[i];
    if (!tpl) return safeAnswer(ctx, 'Template tidak ditemukan.', { show_alert: true });
    await safeAnswer(ctx);
    await safeEdit(ctx, `<b>📄 ${esc(tpl.name)}</b>\n\n<blockquote>${esc(tpl.body).replace(/\n/g, '\n')}</blockquote>\n\n${tb('Placeholder yang tersedia')}: <code>{nomor}</code>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 Daftar Template', 'owner_email_templates')]]) });
});

bot.action('owner_email_tpl_add', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    ownerState[ctx.from.id] = 'EMAIL_TEMPLATE_NAME'; tempProxyData[ctx.from.id] = {};
    await safeAnswer(ctx);
    await ctx.reply(`➕ <b>${tb('TAMBAH TEMPLATE')}</b>\n\n${tb('Kirim nama template, contoh: Metode 3.')}\n${tb('Ketik batal untuk membatalkan.')}`, { parse_mode: 'HTML' });
});

bot.action('owner_admin_management', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, 'Akses ditolak.', { show_alert: true });
    const db = getDB();
    if (!Array.isArray(db.config.admin_ids)) db.config.admin_ids = [];
    const adminList = db.config.admin_ids.map((id, i) =>
        `${i + 1}. <code>${esc(id)}</code>`
    ).join('\\n') || 'Belum ada admin tambahan.';
    const buttons = [];
    if (isSuperOwner(ctx.from.id)) {
        buttons.push([Markup.button.callback('➕ Add Admin', 'owner_admin_add')]);
        db.config.admin_ids.forEach((id) => {
            buttons.push([Markup.button.callback(`🗑 Hapus ${String(id).slice(0, 18)}`, `owner_admin_remove_${id}`)]);
        });
    }
    buttons.push([Markup.button.callback('🔙 Kembali ke Panel', 'owner_back')]);
    await safeAnswer(ctx);
    await safeEdit(ctx,
        `<b>👥 MANAJEMEN ADMIN</b>\\n\\n<blockquote>Owner Utama: <b>${OWNER_IDS.length}</b>\\nAdmin tambahan: <b>${db.config.admin_ids.length}</b>\\n\\n${adminList}</blockquote>` +
        (isSuperOwner(ctx.from.id) ? '\\nHanya Owner Utama yang dapat menambah atau menghapus admin.' : '\\nAnda memiliki akses admin, tetapi tidak dapat mengelola daftar admin.'),
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
});

bot.action('owner_admin_add', async (ctx) => {
    if (!isSuperOwner(ctx.from.id)) return safeAnswer(ctx, 'Hanya Owner Utama yang dapat menambahkan admin.', { show_alert: true });
    ownerState[ctx.from.id] = 'ADMIN_ADD';
    await safeAnswer(ctx);
    await ctx.reply('Kirim User ID Telegram admin yang ingin ditambahkan (angka saja). User dapat mengetahui ID dengan bot /cekid atau bot info ID. Ketik batal untuk membatalkan.', MENU_CANCEL_ONLY);
});

bot.action(/^owner_admin_remove_(\\d+)$/, async (ctx) => {
    if (!isSuperOwner(ctx.from.id)) return safeAnswer(ctx, 'Hanya Owner Utama yang dapat menghapus admin.', { show_alert: true });
    const targetId = String(ctx.match[1]);
    const db = getDB();
    if (!Array.isArray(db.config.admin_ids)) db.config.admin_ids = [];
    const index = db.config.admin_ids.map(String).indexOf(targetId);
    if (index < 0) return safeAnswer(ctx, 'Admin tidak ditemukan.', { show_alert: true });
    db.config.admin_ids.splice(index, 1);
    if (db.users[targetId] && db.users[targetId].tier === 'ADMIN') {
        db.users[targetId].tier = 'FREE';
        db.users[targetId].expiredAt = null;
    }
    if (!saveDB(db)) return safeAnswer(ctx, 'Gagal menyimpan perubahan.', { show_alert: true });
    await safeAnswer(ctx, 'Admin berhasil dihapus.');
    await safeEdit(ctx, '<b>✅ Admin berhasil dihapus.</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('👥 Kembali ke Manajemen Admin', 'owner_admin_management')]])
    });
    bot.telegram.sendMessage(targetId, 'ℹ️ Akses admin bot Anda telah dicabut.').catch(() => {});
});

// ================= MANAJEMEN TIER, USER & PEMBAYARAN MANUAL =================
const renderTierMenu = async (ctx) => {
    const db = getDB();
    const tiers = db.config.tiers || {};
    const tierLines = Object.entries(tiers).map(([name, cfg]) => `${name}: max ${cfg.maxBatch ?? '-'} · jeda ${cfg.cooldownSeconds ?? 0}s`).join('\n');
    const payLines = (db.config.payment_methods || []).map((m, i) => `${i+1}. ${esc(m.name)} — ${esc(m.detail)}`).join('\n') || 'Belum ada metode pembayaran.';
    const freeLimitStatus = db.config.freeDailyLimitEnabled ? `AKTIF (${Number(db.config.freeDailyLimit || 0)} nomor/hari)` : 'NONAKTIF (unlimited)';
    const upgradeStatus = db.config.upgradeEnabled ? 'TERBUKA' : 'DITUTUP';
    await safeEdit(ctx, `<b>💎 MANAJEMEN TIER & USER</b>\n\n<blockquote><b>Limit harian FREE:</b> ${freeLimitStatus}\n<b>Upgrade tier:</b> ${upgradeStatus}\n\n<b>Tier & batas</b>\n${tierLines}\n\n<b>Metode pembayaran</b>\n${payLines}</blockquote>`, { parse_mode:'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback(db.config.freeDailyLimitEnabled ? '🔴 Nonaktifkan Limit FREE' : '🟢 Aktifkan Limit FREE','owner_free_limit_toggle')],
        [Markup.button.callback('🔢 Atur Limit Harian FREE','owner_free_limit_set')],
        [Markup.button.callback(db.config.upgradeEnabled ? '🔒 Tutup Upgrade Tier' : '🔓 Buka Upgrade Tier','owner_upgrade_toggle')],
        [Markup.button.callback('⬆️ Upgrade Tier User','owner_tier_upgrade')],
        [Markup.button.callback('🚫 Ban / Unban User','owner_user_ban')],
        [Markup.button.callback('📋 List User','owner_user_list')],
        [Markup.button.callback('⚙️ Atur Max Batch & Jeda','owner_tier_limits')],
        [Markup.button.callback('💰 Ubah Harga Upgrade','owner_tier_price')],
        [Markup.button.callback('➕ Tambah Tier Baru','owner_tier_add')],
        [Markup.button.callback('💳 Tambah Metode Pembayaran','owner_payment_add')],
        [Markup.button.callback('🗑 Hapus Metode Pembayaran','owner_payment_remove')],
        [Markup.button.callback('🔙 Kembali ke Panel','owner_back')]
    ]) });
};

bot.action('owner_tier_menu', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    await safeAnswer(ctx); await renderTierMenu(ctx);
});

bot.action('owner_free_limit_toggle', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    const db=getDB(); db.config.freeDailyLimitEnabled=!db.config.freeDailyLimitEnabled; saveDB(db);
    await safeAnswer(ctx, db.config.freeDailyLimitEnabled ? 'Limit harian FREE diaktifkan.' : 'Limit harian FREE dinonaktifkan.');
    await renderTierMenu(ctx);
});
bot.action('owner_free_limit_set', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='FREE_LIMIT_SET'; await safeAnswer(ctx);
    await ctx.reply('Kirim jumlah limit harian FREE dalam angka. Contoh: 20. Kirim 0 jika ingin tanpa batas (limit otomatis nonaktif).');
});
bot.action('owner_upgrade_toggle', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    const db=getDB(); db.config.upgradeEnabled=!db.config.upgradeEnabled; saveDB(db);
    await safeAnswer(ctx, db.config.upgradeEnabled ? 'Fitur upgrade tier dibuka.' : 'Fitur upgrade tier ditutup.');
    await renderTierMenu(ctx);
});

bot.action('owner_tier_upgrade', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='TIER_UPGRADE'; await safeAnswer(ctx);
    await ctx.reply('Kirim format: USER_ID, TIER, DURASI_HARI\nContoh: 123456789, VIP, 30\nGunakan 0 untuk masa aktif permanen. Ketik batal untuk membatalkan.');
});
bot.action('owner_user_ban', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='USER_BAN'; await safeAnswer(ctx);
    await ctx.reply('Kirim: USER_ID, ban atau USER_ID, unban\nContoh: 123456789, ban');
});
bot.action('owner_tier_limits', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='TIER_LIMITS'; await safeAnswer(ctx);
    await ctx.reply('Kirim: TIER, MAX_BATCH, JEDA_DETEKSI_DETIK\nContoh: VIP, 100, 30');
});
bot.action('owner_tier_price', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='TIER_PRICE'; await safeAnswer(ctx);
    await ctx.reply('Kirim: TIER, DURASI_HARI, HARGA_RUPIAH\nContoh: VIP, 30, 50000');
});
bot.action('owner_tier_add', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='TIER_ADD'; await safeAnswer(ctx);
    await ctx.reply('Kirim: NAMA_TIER, MAX_BATCH, JEDA_DETIK\nContoh: PREMIUM, 200, 15');
});
bot.action('owner_payment_add', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    ownerState[ctx.from.id]='PAYMENT_ADD'; await safeAnswer(ctx);
    await ctx.reply('Kirim: NAMA_METODE, DETAIL_PEMBAYARAN\nContoh: DANA, 081234567890 a.n. Nama Pemilik\nUntuk QRIS, kirim nama dan keterangan; gambar QR dapat dikirim setelah metode tersimpan.');
});
bot.action('owner_payment_remove', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    const db=getDB(); const methods=db.config.payment_methods||[];
    const rows=methods.map((m,i)=>[Markup.button.callback(`🗑 ${m.name}`,`owner_payment_del_${i}`)]);
    rows.push([Markup.button.callback('🔙 Kembali','owner_tier_menu')]);
    await safeAnswer(ctx); await safeEdit(ctx,'<b>HAPUS METODE PEMBAYARAN</b>',{parse_mode:'HTML',...Markup.inlineKeyboard(rows)});
});
bot.action(/^owner_payment_del_(\d+)$/, async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    const db=getDB(), i=Number(ctx.match[1]);
    if (!db.config.payment_methods[i]) return safeAnswer(ctx,'Metode tidak ditemukan.',{show_alert:true});
    db.config.payment_methods.splice(i,1); saveDB(db); await safeAnswer(ctx,'Metode dihapus.'); await renderTierMenu(ctx);
});
bot.action('owner_user_list', async ctx => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx,'Akses ditolak.',{show_alert:true});
    const db=getDB(); const users=Object.entries(db.users||{});
    const page=0, size=20; const lines=users.slice(page*size,(page+1)*size).map(([id,u],i)=>`${i+1}. <code>${esc(id)}</code> · ${esc(u.name||'User')} · <b>${esc(u.tier||'FREE')}</b>${u.banned?' · 🚫 BAN':''}${u.expiredAt?' · '+esc(new Date(u.expiredAt).toLocaleDateString('id-ID')):''}`).join('\n') || 'Belum ada user.';
    await safeAnswer(ctx); await safeEdit(ctx,`<b>📋 LIST USER (${users.length})</b>\n\n<blockquote>${lines}</blockquote>`,{parse_mode:'HTML',...Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh','owner_user_list')],[Markup.button.callback('🔙 Kembali','owner_tier_menu')]])});
});

bot.action('owner_restart_confirm', async (ctx) => {
    if (!isOwner(ctx.from.id)) {
        return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    }

    if (activeDetectionRuns.size > 0) {
        return safeAnswer(
            ctx,
            `⚠️ ${tb('Tidak bisa restart saat deteksi masih berjalan.')}`,
            { show_alert: true }
        );
    }

    await safeAnswer(ctx);
    await safeEdit(
        ctx,
        `<b>🔄 ${tb('KONFIRMASI RESTART BOT')}</b>\n\n<blockquote>${tb('Bot akan dimatikan dan dijalankan kembali oleh process manager/server. Pastikan tidak ada proses penting yang berjalan.')}</blockquote>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`✅ ${tb('Ya, Restart')}`, 'owner_restart_now')],
                [Markup.button.callback(`❌ ${tb('Batal')}`, 'owner_restart_cancel')]
            ])
        }
    );
});

bot.action('owner_restart_cancel', async (ctx) => {
    if (!isOwner(ctx.from.id)) {
        return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    }
    await safeAnswer(ctx, `✅ ${tb('Restart dibatalkan.')}`);
    await safeEdit(
        ctx,
        `<b>🔄 ${tb('RESTART DIBATALKAN')}</b>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([
            [Markup.button.callback(`🔙 ${tb('Kembali ke Panel')}`, 'owner_back')]
        ]) }
    );
});

bot.action('owner_restart_now', async (ctx) => {
    if (!isOwner(ctx.from.id)) {
        return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    }

    if (activeDetectionRuns.size > 0) {
        return safeAnswer(
            ctx,
            `⚠️ ${tb('Deteksi sedang berjalan. Restart dibatalkan.')}`,
            { show_alert: true }
        );
    }

    await safeAnswer(ctx, `🔄 ${tb('Bot sedang dihentikan...')}`);
    await safeEdit(
        ctx,
        `<b>🔄 ${tb('BOT SEDANG RESTART')}</b>\n\n<blockquote>${tb('Data yang masuk antrean akan disimpan terlebih dahulu.')}</blockquote>`,
        { parse_mode: 'HTML' }
    );

    try {
        if (restartTimer) {
            clearTimeout(restartTimer);
            restartTimer = null;
        }
        await dbWriteQueue;
        await bot.stop('MANUAL_RESTART');
        console.log('[RESTART] Restart manual oleh owner.');
        process.exit(0);
    } catch (err) {
        console.error('[RESTART ERROR]', err);
        process.exit(1);
    }
});

bot.action('owner_back', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
    await safeAnswer(ctx);
    await safeEdit(ctx, `<b>⚙️ ${tb('PANEL OWNER')}</b>\n\n<blockquote>${tb('Silakan pilih menu manajemen di bawah ini:')}</blockquote>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(`🌐 ${tb('Manajemen Proxy')}`, "owner_menu_proxy")],
            [Markup.button.callback(`📢 ${tb('Manajemen Grup')}`, "owner_menu_group")],
            [Markup.button.callback(`👥 ${tb('Manajemen Admin')}`, "owner_admin_management")],
            [Markup.button.callback('💎 Manajemen Tier & User', 'owner_tier_menu')],
            [Markup.button.callback(`🔄 ${tb('Restart Bot')}`, "owner_restart_confirm")],
                [Markup.button.callback(`📢 ${tb('Broadcast Pesan')}`, "owner_broadcast")],
            [Markup.button.callback(`📌 ${tb('Pin Pesan (BCP)')}`, "owner_bcp")],
            [Markup.button.callback(`📧 ${tb('Manajemen Email')}`, 'owner_email_management')],
            [Markup.button.callback(`✉️ ${tb('Manajemen Template Email')}`, 'owner_email_templates')]
        ])
    });
});

bot.action('owner_menu_proxy', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
    await safeAnswer(ctx);
    const db = getDB();
    await safeEdit(ctx, `<b>🌐 ${tb('MANAJEMEN PROXY')}</b>\n\n<blockquote>${tb('Total Proxy Tersimpan')}: <b>${(db.config.proxies || []).length}</b>\n\n${tb('Pilih tindakan yang ingin dilakukan:')}</blockquote>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(`➕ ${tb('Tambah Proxy')}`, "owner_proxy_add")],
            [Markup.button.callback(`📋 ${tb('Lihat Daftar Proxy')}`, "owner_proxy_list")],
            [Markup.button.callback(`📊 ${tb('Monitoring Proxy')}`, "owner_proxy_monitor")],
            [Markup.button.callback(`🧪 ${tb('Tes Semua Proxy')}`, "owner_proxy_test_all")],
            [Markup.button.callback(`🗑️ ${tb('Hapus Semua Proxy')}`, "owner_proxy_del_all")],
            [Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_back")]
        ])
    });
});

bot.action('owner_proxy_add', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx);
    const uid = ctx.from.id;
    ownerState[uid] = 'PROXY_HOST'; tempProxyData[uid] = {};
    await safeEdit(ctx, `<b>➕ ${tb('TAMBAH PROXY (LANGKAH 1/4)')}</b>\n\n<blockquote>${tb('Silakan ketik Host proxy Anda.')}\n\n${tb('Contoh')}: <code>gw.dataimpulse.com</code>\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { 
        parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`❌ ${tb('Batal')}`, "owner_menu_proxy")]])
    });
    await ctx.reply("⬇️ Ketik Host Proxy sekarang ⬇️", { ...MENU_CANCEL_ONLY });
});

bot.action('owner_proxy_list', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx);
    const db = getDB(); const proxies = db.config.proxies || [];
    if (proxies.length === 0) return safeEdit(ctx, `<b>📋 ${tb('DAFTAR PROXY')}</b>\n\n<blockquote>${tb('Belum ada proxy yang tersimpan.')}</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_proxy")]]) });
    let text = `<b>📋 ${tb('DAFTAR PROXY')} (${proxies.length})</b>\n\n`;
    proxies.forEach((p, i) => {
        const isDefault = db.config.default_proxy_id === p.id ? ' ⭐ [DEFAULT]' : '';
        const statusIcon = p.status === 'online' ? '🟢' : p.status === 'offline' ? '🔴' : '⏳';
        text += `<blockquote><b>${i + 1}.</b> ${statusIcon} <code>${p.host}:${p.port}</code>${isDefault}\n${tb('User')}: <code>${p.user}</code></blockquote>\n`;
    });
    await safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_proxy")]]) });
});

bot.action('owner_proxy_monitor', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx);
    if (monitoringProxy.length === 0) {
        return safeEdit(ctx, `<b>📊 ${tb('MONITORING PROXY')}</b>\n\n<blockquote>${tb('Belum ada aktivitas proxy yang berjalan.')}</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔄 ${tb('Refresh')}`, "owner_proxy_monitor"), Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_proxy")]]) });
    }
    let text = `<b>📊 ${tb('MONITORING PROXY')} (50 ${tb('Terakhir')})</b>\n\n`;
    monitoringProxy.slice().reverse().forEach((log) => {
        const t = new Date(log.time).toLocaleTimeString('id-ID', { hour12: false });
        text += `<blockquote><b>[${t}]</b> <code>${log.host}:${log.port}</code>\n⏱️ <b>${log.ms} ms</b></blockquote>\n`;
    });
    await safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔄 ${tb('Refresh')}`, "owner_proxy_monitor"), Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_proxy")]]) });
});

bot.action('owner_proxy_test_all', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx, `⏳ ${tb('Menguji koneksi semua proxy...')}`);
    const db = getDB(); const proxies = db.config.proxies || [];
    if (proxies.length === 0) return safeEdit(ctx, `<b>🧪 ${tb('TES PROXY')}</b>\n\n<blockquote>${tb('Belum ada proxy yang tersimpan.')}</blockquote>`, { parse_mode: 'HTML' });
    const hasilTest = [];
    for (const p of proxies) {
        try {
            const proxyUrl = `http://${p.user}:${p.pass}@${p.host}:${p.port}`;
            const res = await requestViaProxy('https://api.ipify.org', {}, proxyUrl, 10000);
            if (res.status === 200) { p.status = 'online'; hasilTest.push(`✅ <code>${p.host}:${p.port}</code> → <b>Online</b>`); }
            else { p.status = 'offline'; hasilTest.push(`❌ <code>${p.host}:${p.port}</code> → <b>Offline (HTTP ${res.status})</b>`); }
        } catch (e) { p.status = 'offline'; hasilTest.push(`❌ <code>${p.host}:${p.port}</code> → <b>Offline (${e.message})</b>`); }
    }
    saveDB(db);
    await safeEdit(ctx, `<b>🧪 ${tb('HASIL TES SEMUA PROXY')}</b>\n\n<blockquote>${hasilTest.join('\n')}</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_proxy")]]) });
});

bot.action('owner_proxy_del_all', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    const db = getDB(); db.config.proxies = []; db.config.default_proxy_id = null; saveDB(db);
    await safeAnswer(ctx, `✅ ${tb('Semua proxy berhasil dihapus.')}`);
    await safeEdit(ctx, `<b>✅ ${tb('SEMUA PROXY DIHAPUS')}</b>\n\n<blockquote>${tb('Daftar proxy sekarang kosong.')}</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_proxy")]]) });
});

bot.action('owner_menu_group', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    delete ownerState[ctx.from.id];
    await safeAnswer(ctx);
    const db = getDB();
    await safeEdit(ctx, `<b>📢 ${tb('MANAJEMEN GRUP')}</b>\n\n<blockquote>${tb('Grup Notifikasi')}: <b>${(db.config.notification_group_ids || []).length}</b>\n${tb('Grup Verifikasi')}: <b>${(db.config.verification_group_ids || []).length}/2</b>\n\n${tb('Pilih tindakan yang ingin dilakukan:')}</blockquote>`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback(`ℹ️ ${tb('Info Perintah')}`, "owner_group_info")], [Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_back")]])
    });
});

bot.action('owner_group_info', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx);
    await safeEdit(ctx, `<b>ℹ️ ${tb('PERINTAH MANAJEMEN GRUP')}</b>\n\n<blockquote>${tb('Untuk mengatur grup, ketik perintah berikut:')}\n\n<code>/cekid</code> (${tb('Verifikasi & notifikasi')})\n<code>/addnotifall</code> (${tb('Pusat notifikasi')})\n<code>/resetverify 1</code> (${tb('Hapus verifikasi slot 1')})\n<code>/resetverify 2</code> (${tb('Hapus verifikasi slot 2')})\n<code>/resetallverify</code> (${tb('Hapus semua verifikasi')})</blockquote>`, { 
        parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali')}`, "owner_menu_group")]])
    });
});

bot.action('owner_broadcast', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx);
    ownerState[ctx.from.id] = 'AWAITING_BROADCAST';
    await safeEdit(ctx, `<b>📢 ${tb('BROADCAST PESAN')}</b>\n\n<blockquote>${tb('Silakan kirim pesan yang ingin dikirim ke SEMUA USER bot.')}\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
    await ctx.reply("⬇️ Kirim pesan broadcast sekarang ⬇️", { ...MENU_CANCEL_ONLY });
});

bot.action('owner_bcp', async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    await safeAnswer(ctx);
    ownerState[ctx.from.id] = 'AWAITING_BCP';
    await safeEdit(ctx, `<b>📌 ${tb('PIN PESAN (BCP)')}</b>\n\n<blockquote>${tb('Silakan kirim pesan yang ingin dikirim ke SEMUA USER bot. Pesan ini juga akan otomatis di-PIN.')}\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
    await ctx.reply("⬇️ Kirim pesan BCP sekarang ⬇️", { ...MENU_CANCEL_ONLY });
});

bot.action('check_verify', async (ctx) => {
    const isJoined = await checkMembership(ctx.from.id);
    if (isJoined) {
        await safeAnswer(ctx, `✅ ${tb('Verifikasi berhasil!')}`);
        await ctx.deleteMessage().catch(() => {});
        await kirimMenuStart(ctx);
    } else await safeAnswer(ctx, `❌ ${tb('Anda belum bergabung!')}`, { show_alert: true });
});

bot.action('close_inline', async (ctx) => {
    await safeAnswer(ctx, `${tb('Menu ditutup.')}`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
});

bot.action('back_to_menu', async (ctx) => {
    await safeAnswer(ctx);
    await kirimMenuStart(ctx);
});

bot.action('paket_vip', async (ctx) => {
    await safeAnswer(ctx);
    const text = `<b>💎 ${tb('VVIP PAKET')}</b>
<b><blockquote>────────────────────

<b>${tb('KEUNTUNGAN VVIP')}:</b>
✓ ${tb('Unlimited Nomor (Tanpa Batas)')}
✓ ${tb('Jeda deteksi 0.1s')}
✓ ${tb('Cooldown antar batch 0s')}
✓ ${tb('Rotasi Proxy Otomatis')}

<b>${tb('PILIH PAKET')}:</b>

├ VVIP 1 ${tb('Hari')} — Rp5.000
├ VVIP 3 ${tb('Hari')} — Rp10.000
├ VVIP 7 ${tb('Hari')} — Rp20.000
├ VVIP 15 ${tb('Hari')} — Rp35.000
└ VVIP 30 ${tb('Hari')} — Rp50.000

${tb('Klik tombol di bawah untuk melanjutkan.')}</blockquote></b>`;
    await safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback("1 Hari - Rp5.000", "trx_VIP_1_5000")],
        [Markup.button.callback("3 Hari - Rp10.000", "trx_VIP_3_10000")],
        [Markup.button.callback("7 Hari - Rp20.000", "trx_VIP_7_20000")],
        [Markup.button.callback("15 Hari - Rp35.000", "trx_VIP_15_35000")],
        [Markup.button.callback("30 Hari - Rp50.000", "trx_VIP_30_50000")],
        [Markup.button.callback(`🏠 ${tb('HOME')}`, "back_to_menu")]
    ]) });
});

bot.action('paket_vvip', async (ctx) => {
    await safeAnswer(ctx);
    const text = `<b>👑 ${tb('XVIP PAKET')}</b>
<b><blockquote>────────────────────

<b>${tb('KEUNTUNGAN XVIP')}:</b>
✓ ${tb('Unlimited Nomor (Tanpa Batas)')}
✓ ${tb('Jeda super cepat 0.1s')}
✓ ${tb('Cooldown 0s (tanpa cooldown)')}
✓ ${tb('Prioritas Utama & Akses Penuh')}

<b>${tb('PILIH PAKET')}:</b>

├ XVIP 1 ${tb('Hari')} — Rp8.000
├ XVIP 3 ${tb('Hari')} — Rp15.000
├ XVIP 7 ${tb('Hari')} — Rp30.000
└ XVIP 30 ${tb('Hari')} — Rp80.000

${tb('Klik tombol di bawah untuk melanjutkan.')}</blockquote></b>`;
    await safeEdit(ctx, text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([
        [Markup.button.callback("1 Hari - Rp8.000", "trx_VVIP_1_8000")],
        [Markup.button.callback("3 Hari - Rp15.000", "trx_VVIP_3_15000")],
        [Markup.button.callback("7 Hari - Rp30.000", "trx_VVIP_7_30000")],
        [Markup.button.callback("30 Hari - Rp80.000", "trx_VVIP_30_80000")],
        [Markup.button.callback(`💎 ${tb('VVIP')}`, "paket_vip"), Markup.button.callback(`🏠 ${tb('HOME')}`, "back_to_menu")]
    ]) });
});

bot.action(/^trx_(\w+)_(\d+)_(\d+)$/, async (ctx) => {
    try {
        await safeAnswer(ctx);
        const tier = (ctx.match[1] || '').toUpperCase();
        const days = parseInt(ctx.match[2], 10);
        const price = parseInt(ctx.match[3], 10);
        const liveDb = getDB();
        if (!liveDb.config.upgradeEnabled && !isOwner(ctx.from.id)) return await safeEdit(ctx, '🔒 <b>UPGRADE TIER SEDANG DITUTUP ADMIN</b>\n\nSilakan coba lagi nanti.', { parse_mode: 'HTML' });
        const liveTier = liveDb.config.tiers && liveDb.config.tiers[tier];
        if (!liveTier || Number(liveTier.prices && liveTier.prices[days]) !== price) return await safeEdit(ctx, '❌ <b>PAKET TIDAK VALID</b>\n\nSilakan buka menu upgrade dan pilih paket yang tersedia.', { parse_mode: 'HTML' });

        if (!tier || isNaN(days) || isNaN(price) || price <= 0) {
            return await safeEdit(ctx, `❌ <b>GAGAL MEMBUAT INVOICE</b>\n\n<blockquote>Data paket tidak valid. Silakan pilih ulang dari menu VIP.</blockquote>`, { parse_mode: 'HTML' });
        }

        const trxId = `TRX${Date.now()}${Math.floor(Math.random() * 100)}`;
        const pending = getPending();
        pending[trxId] = { userId: ctx.from.id, name: ctx.from.first_name, tier, days, price, status: 'WAITING_QR' };
        savePending(pending);
        await kirimNotifGrup(`🧾 <b>INVOICE BARU</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser: ${esc(ctx.from.first_name || 'User')}\nUser ID: <code>${ctx.from.id}</code>\nPaket: <b>${tier} ${days} hari</b>\nHarga: <b>Rp${price.toLocaleString('id-ID')}</b>\nStatus: Menunggu QRIS</blockquote>`);

        const methodsText = (getDB().config.payment_methods || []).map(m => `\n• <b>${esc(m.name)}</b>: ${esc(m.detail)}`).join('') || '\nBelum ada metode pembayaran yang dikonfigurasi. Admin akan mengirim instruksi pembayaran.';
        await safeEdit(ctx, `🧾 <b>INVOICE ${trxId}</b>\n\n<blockquote>Paket: ${tier} ${days} Hari\nHarga: <b>Rp${price.toLocaleString('id-ID')}</b>\n\n<b>Metode pembayaran:</b>${methodsText}</blockquote>\n\nKirim bukti pembayaran melalui tombol di bawah setelah transfer.`, {
            parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback("📤 Kirim Bukti Bayar", `bukti_${trxId}`)]])
        });

        for (const method of (getDB().config.payment_methods || [])) {
            if (method.fileId) {
                await bot.telegram.sendPhoto(ctx.from.id, method.fileId, { caption: `💳 ${esc(method.name)}\n${esc(method.detail)}`, parse_mode: 'HTML' }).catch(() => {});
            }
        }

        for (const adminId of OWNER_IDS) {
            const ownerMessage = await bot.telegram.sendMessage(adminId, `<b>🚨 PESANAN BARU MASUK 🚨</b>\n\n<blockquote>ID: <code>${trxId}</code>\n👤 Nama: ${ctx.from.first_name}\n🆔 ID User: <code>${ctx.from.id}</code>\n📦 Paket: ${tier} (${days} Hari)\n💵 Harga: <b>Rp${price.toLocaleString('id-ID')}</b></blockquote>\n\n<i>Silakan balas (reply) pesan ini dengan FOTO QRIS untuk dikirim ke user.</i>`, { 
                parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url("🤖 Buka Bot", `https://t.me/${BOT_USERNAME}`)]])
            }).catch(() => null);

            if (ownerMessage) pendingOwnerReplyMap[ownerMessage.message_id] = { trxId, userId: ctx.from.id };
        }
    } catch (err) {}
});

bot.action(/^bukti_(.+)$/, async (ctx) => {
    await safeAnswer(ctx, "Silakan kirim foto bukti pembayaran Anda.");
    const trxId = ctx.match[1];
    const pending = getPending();
    const trx = pending[trxId];
    if (!trx) return ctx.reply("❌ Invoice tidak ditemukan atau sudah diproses.");
    if (String(trx.userId) !== String(ctx.from.id)) return ctx.reply("❌ Invoice ini bukan milik Anda.");
    await ctx.reply(`📤 Silakan kirim <b>foto bukti pembayaran</b> untuk invoice <code>${trxId}</code>.\n\nBot akan meneruskan bukti ke Admin.`, { parse_mode: 'HTML' });
});

bot.action('copy_siap', async (ctx) => {
    const numbers = lastSiapUser[ctx.from.id];
    if (numbers && numbers.length > 0) {
        await safeAnswer(ctx, `${tb('Berhasil disalin!')}`);
        await ctx.reply(`\`${numbers.map(n => `+${n.replace(/\+/g, '')}`).join('\n')}\``, { parse_mode: 'Markdown' });
    } else {
        await safeAnswer(ctx, `❌ ${tb('Tidak ada data.')}`, { show_alert: true });
    }
});

bot.action('export_detek', async (ctx) => {
    const hasilRaw = lastHasilDetekUser[ctx.from.id];
    if (!hasilRaw || hasilRaw.length === 0) {
        return safeAnswer(ctx, `❌ ${tb('Tidak ada data untuk diexport.')}`, { show_alert: true });
    }

    const snapshot = hasilRaw.map(h => ({
        nomor: String(h.nomor || '').replace(/[^\d]/g, ''),
        kategori: String(h.kategori || 'error').toUpperCase(),
        cooldown: Number(h.cooldown) || 0
    }));

    await safeAnswer(ctx, `✅ ${tb('Berhasil diexport!')}`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});

    let txt = `HASIL DETEKSI WHATSAPP\n`;
    txt += `Tanggal: ${new Date().toLocaleString('id-ID')}\n`;
    txt += `Total: ${snapshot.length} nomor\n`;
    txt += `=======================================\n\n`;

    const groups = {};
    snapshot.forEach(h => {
        if (!groups[h.kategori]) groups[h.kategori] = [];
        groups[h.kategori].push(h);
    });

    for (const kat of Object.keys(groups)) {
        txt += `[${kat}] - ${groups[kat].length} nomor\n`;
        groups[kat].forEach(h => {
            txt += `  +${h.nomor}`;
            if (h.cooldown > 0) txt += ` (Cooldown: ${detikKeTeks(h.cooldown)})`;
            txt += `\n`;
        });
        txt += `\n`;
    }

    const batasTeks = 3800;
    const chunks = [];
    for (let i = 0; i < txt.length; i += batasTeks) {
        chunks.push(txt.slice(i, i + batasTeks));
    }

    for (let i = 0; i < chunks.length; i++) {
        const aman = chunks[i].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const judul = chunks.length > 1 ? `<b>EXPORT BAGIAN ${i + 1}/${chunks.length}</b>\n` : `<b>📁 HASIL DETEKSI</b>\n`;
        await ctx.reply(`${judul}<pre>${aman}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        if (i < chunks.length - 1) await jeda(500);
    }
});

bot.action('retry_ngambek', async (ctx) => {
    const stored = ambilDataDeteksiUser(ctx.from.id);
    const ngambekNumbers = stored.ngambek.slice();
    if (ngambekNumbers.length === 0) return safeAnswer(ctx, `❌ ${tb('Tidak ada nomor ngambek untuk dicek ulang.')}`, { show_alert: true });
    await safeAnswer(ctx, `🔄 ${tb('Mengecek ulang')} ${ngambekNumbers.length} ${tb('nomor ngambek...')}`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    const isProxyMode = (stored.mode || lastModeUser[ctx.from.id] || 'proxy') === 'proxy';
    await jalankanDetek(ctx, ngambekNumbers, isProxyMode);
});

bot.action('retry_timeout', async (ctx) => {
    const stored = ambilDataDeteksiUser(ctx.from.id);
    const numbers = [...new Set([...stored.error, ...stored.timeout])];
    if (!numbers || numbers.length === 0) return safeAnswer(ctx, `❌ ${tb('Tidak ada nomor error untuk dicek ulang.')}`, { show_alert: true });
    await safeAnswer(ctx, `🔄 ${tb('Mengecek ulang')} ${numbers.length} ${tb('nomor...')}`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    const isProxyMode = (stored.mode || lastModeUser[ctx.from.id] || 'proxy') === 'proxy';
    await jalankanDetek(ctx, numbers, isProxyMode);
});

bot.action('mode_proxy', async (ctx) => {
    const db = getDB();
    if ((db.config.proxies || []).length === 0) {
        return safeAnswer(ctx, `⚠️ ${tb('Kredensial Proxy belum diatur!')}`, { show_alert: true });
    }
    modeDetekUser[ctx.from.id] = 'proxy';
    await safeAnswer(ctx);
    await safeEdit(ctx, `🌐 <b>${tb('Mode Proxy Dipilih.')}</b>\n\n<blockquote>${tb('Silakan kirim nomor yang ingin dicek (pisahkan dengan enter/spasi).')}\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
    await ctx.reply("⬇️ Kirim nomor sekarang ⬇️", { ...MENU_CANCEL_ONLY });
});

bot.action('mode_server', async (ctx) => {
    modeDetekUser[ctx.from.id] = 'server';
    await safeAnswer(ctx);
    await safeEdit(ctx, `🖥️ <b>${tb('Mode Server (Direct) Dipilih.')}</b>\n\n<blockquote>${tb('Silakan kirim nomor yang ingin dicek (pisahkan dengan enter/spasi).')}\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
    await ctx.reply("⬇️ Kirim nomor sekarang ⬇️", { ...MENU_CANCEL_ONLY });
});

bot.action('cancel_detek', async (ctx) => {
    delete modeDetekUser[ctx.from.id];
    await safeAnswer(ctx, "Dibatalkan.");
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
});

bot.action('stop_detek', async (ctx) => {
    const sesi = detekSesiAktif[ctx.from.id];
    if (!sesi || sesi.stop) return safeAnswer(ctx, `⏹ ${tb('Sedang menghentikan deteksi...')}`);
    sesi.stop = true;
    try { if (typeof sesi.abortActive === 'function') sesi.abortActive(); } catch (e) {}
    await safeAnswer(ctx, `⏹ ${tb('Stop diterima. Permintaan aktif dibatalkan dan deteksi dihentikan...')}`);
});
function tampilkanLog({
    userId,
    total,
    negara,
    proxy,
    status
}) {
    const waktu = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta'
    });

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       LOG AKTIVITAS BOT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 User ID   : ${userId}
📊 Total     : ${total}
🌍 Negara    : ${negara}
🔌 Proxy     : ${proxy}
⏰ Waktu     : ${waktu}
📌 Status    : ${status}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}
async function jalankanDetekInternal(ctx, numbers, isProxyMode, runId) {
    const userIdStr = ctx.from.id.toString();
    const db = getDB();
    let user = db.users[userIdStr];
    if (!user) {
        db.users[userIdStr] = { id: userIdStr, name: ctx.from.first_name, tier: 'FREE', deteksi: 0, today: 0, joinedAt: new Date() };
        user = db.users[userIdStr];
    }
    
    const daftarNegara = [...new Set(
    numbers.map(nomor =>
        benderaNegara(kodeNegaraISO(nomor))
    )
)].join(' ');

    tampilkanLog({
    userId: userIdStr,
    total: numbers.length,
    negara: daftarNegara || '🏳️',
    proxy: isProxyMode ? 'Mode Proxy' : 'Tanpa Proxy',
    status: 'Sedang diproses'
});

    const tier = resolveUserTier(userIdStr, db);
    const isAdmin = tier === 'ADMIN';
    const isVip = tier === 'VIP' || tier === 'VVIP' || (db.config.tiers && !!db.config.tiers[tier] && tier !== 'FREE');
    const tierConfig = (db.config.tiers && db.config.tiers[tier]) || { maxBatch: tier === 'FREE' ? 5 : 100, cooldownSeconds: 0 };
    const maxBatch = Math.max(1, Math.floor(Number(tierConfig.maxBatch) || (tier === 'FREE' ? 5 : 100)));
    const totalDiminta = numbers.length;
    let dilewatiBatasBatch = 0;
    if (!isAdmin && numbers.length > maxBatch) {
        dilewatiBatasBatch = numbers.length - maxBatch;
        numbers = numbers.slice(0, maxBatch);
    }
    if (!isAdmin && Number(user.detectCooldownUntil || 0) > Date.now()) {
        const sisa = Math.ceil((Number(user.detectCooldownUntil)-Date.now())/1000);
        return ctx.reply(`⏳ Tunggu ${sisa} detik sebelum deteksi berikutnya.`, MENU_UTAMA);
    }

    if (!isAdmin) {
        if (isVip) {
            if (user.expiredAt && new Date(user.expiredAt) < new Date()) {
                user.tier = 'FREE'; user.expiredAt = null; saveDB(db);
                return ctx.reply(`⚠️ ${tb('Masa aktif Anda telah habis. Silakan upgrade kembali.')}`, MENU_UTAMA);
            }
        } else {
            if (db.config.freeDailyLimitEnabled) {
                const dailyLimit = Math.max(0, Number(db.config.freeDailyLimit) || 0);
                const today = new Date().toISOString().split('T')[0];
                const todayCount = user.lastDetectDate === today ? (Number(user.detectToday) || 0) : 0;
                if (todayCount >= dailyLimit) return ctx.reply(`❌ Kuota deteksi FREE hari ini sudah habis (${dailyLimit}/${dailyLimit}). Silakan coba lagi besok atau upgrade tier.`, MENU_UTAMA);
                if (numbers.length > (dailyLimit - todayCount)) return ctx.reply(`❌ Sisa kuota FREE hari ini hanya ${dailyLimit - todayCount} nomor. Kurangi jumlah nomor atau upgrade tier.`, MENU_UTAMA);
            }
        }
    }

    if (isProxyMode && (db.config.proxies || []).length === 0) return ctx.reply(`⚠️ ${tb('Mode Proxy tidak dapat digunakan karena kredensial belum diatur oleh Owner. Silakan gunakan Mode Server.')}`, MENU_UTAMA);

    lastModeUser[ctx.from.id] = isProxyMode ? 'proxy' : 'server';

    activeDetectionRuns.add(runId);

if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
}

const sesi = { stop: false, batasLive: 100, activeRequest: null, abortActive: null };
detekSesiAktif[ctx.from.id] = sesi;
    const tombolStop = Markup.inlineKeyboard([[Markup.button.callback(`⏹ ${tb('STOP DETEK')}`, "stop_detek")]]);

    const siap = [], cooldown = [], ngambek = [], error = [], clone = [], tidak_dapat = [];
    const hasilLengkap = [];
    const statistikNegara = Object.create(null);




const escapeHTML = (str) =>
    String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

const buatDaftar = (daftar) =>
    daftar
        .slice(0, sesi.batasLive)
        .map(n => `<code>${escapeHTML(n)}</code>`)
        .join('\n');

const buatCooldown = (daftar) =>
    daftar
        .slice(0, sesi.batasLive)
        .map(item => {
            const sisa = Math.max(
                0,
                Math.ceil((item.berakhirPada - Date.now()) / 1000)
            );

            return `<code>${escapeHTML(item.nomor)}</code> (${detikKeTeks(sisa)})`;
        })
        .join('\n');
        
const buatStatistik = () => {
    return [
        `✔ ${tb('Siap OTP')} : <b>${siap.length}</b>`,
        `◷ ${tb('Cooldown')} : <b>${cooldown.length}</b>`,
        `✖ ${tb('Clone')} : <b>${clone.length}</b>`,
        `⊘ ${tb('Tidak dapat OTP')} : <b>${tidak_dapat.length}</b>`,
        `⚠️ ${tb('Ngambek')} : <b>${ngambek.length}</b>`,
        `⚠️ ${tb('Error / Timeout')} : <b>${error.length}</b>`,
        `🏳️ ${tb('Negara')} : <b>${Object.entries(statistikNegara).sort((a, b) => b[1] - a[1]).map(([kode, jumlah]) => `${benderaNegara(kode)} (${jumlah})`).join(', ') || '-'}</b>`
    ].join('\n');
};

const buatTeksLive = (diproses) => {
    const bagian = [];

    // HASIL DETEKSI
    bagian.push(
        `<pre>🔎 ${tb('STASTIK DETEKSI')}</pre>\n` +
        `<blockquote>${buatStatistik()}</blockquote>`
    );

    // SIAP OTP
    if (siap.length > 0) {
        bagian.push(
            `<pre>✔ ${tb('NOMOR SIAP OTP')} (${siap.length})</pre>\n` +
            `<blockquote>${buatDaftar(
                siap.map(n => `+${n.replace(/\+/g, '')}`)
            )}</blockquote>`
        );
    }

    // COOLDOWN
    if (cooldown.length > 0) {
        bagian.push(
            `<pre>◷ ${tb('NOMOR YANG SEDANG COOLDOWN')} (${cooldown.length})</pre>\n` +
            `<blockquote>${buatCooldown(cooldown)}</blockquote>`
        );
    }

    // SERVER NGAMBEK
    if (ngambek.length > 0) {
        bagian.push(
            `<pre>⚠️ ${tb('LAH SI MARK NGAMBEK JIR')} (${ngambek.length})</pre>\n` +
            `<blockquote>${buatDaftar(ngambek)}</blockquote>`
        );
    }

    // CLONE
    if (clone.length > 0) {
        bagian.push(
            `<pre>🚫 ${tb('TIDAK SUPPORT CLONE')} (${clone.length})</pre>\n` +
            `<blockquote>${buatDaftar(clone)}</blockquote>`
        );
    }

    // TIDAK DAPAT OTP
    if (tidak_dapat.length > 0) {
        bagian.push(
            `<pre>❌ ${tb('VERIF SMS HILANG JIR')} (${tidak_dapat.length})</pre>\n` +
            `<blockquote>${buatDaftar(tidak_dapat)}</blockquote>`
        );
    }

    // ERROR
    if (error.length > 0) {
        bagian.push(
            `<pre>⚠️ ${tb('JIR DI BAN MARK JIR')} (${error.length})</pre>\n` +
            `<blockquote>${buatDaftar(error)}</blockquote>`
        );
    }

    // PROGRESS
    let teks =
        `<pre>⚡ ${tb('PROSES DETEKSI')}</pre>\n` +
        `${tb('Mode')}: ${isProxyMode ? '🌐 Proxy' : '🖥️ Server'}\n\n` +
        bagian.join('\n\n') +
        `\n\n${generateBar(diproses, numbers.length)}`;

    if (sesi.stop) {
        teks += `\n\n⏹ <b>${tb('MENGHENTIKAN DETEKSI...')}</b>`;
    }

    return teks;
};


    let teksAwal = buatTeksLive(0);
    while (teksAwal.length > 3800 && sesi.batasLive > 5) {
        sesi.batasLive = Math.floor(sesi.batasLive / 2);
        teksAwal = buatTeksLive(0);
    }

    const loadingMsg = await ctx.reply(teksAwal, { parse_mode: 'HTML', ...tombolStop });

    let diprosesSekarang = 0;
let sedangUpdate = false;

const refreshTimer = setInterval(async () => {
    if (sedangUpdate || sesi.stop) return;

    sedangUpdate = true;

    try {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            null,
            buatTeksLive(diprosesSekarang),
            {
                parse_mode: 'HTML',
                ...tombolStop
            }
        );
    } catch (err) {
        // Abaikan jika pesan tidak berubah atau gagal diperbarui
    } finally {
        sedangUpdate = false;
    }
}, 5000);

    for (let i = 0; i < numbers.length; i++) {
        if (sesi.stop) break;
        const negaraNomor = kodeNegaraISO(numbers[i]);
        statistikNegara[negaraNomor] = (statistikNegara[negaraNomor] || 0) + 1;
        try {
            const res = await detect(numbers[i], 'wa_old', isProxyMode, sesi);
            if (sesi.stop || (res && res.cancelled)) break;
            const kat = klasifikasi(res.hasil);
            const reasonText = String((res.hasil && res.hasil.reason) || '').toLowerCase();
            const kategoriSimpan = kat.kategori === 'error' && /timeout|timed.?out|etimedout/.test(reasonText) ? 'timeout' : kat.kategori;
            if (kat.kategori === 'siap') siap.push(numbers[i]);
            else if (kat.kategori === 'cooldown') {
    cooldown.push({
        nomor: numbers[i],
        berakhirPada: Date.now() + (Number(kat.cooldown) || 0) * 1000
    });
}
            else if (kat.kategori === 'ngambek') ngambek.push(numbers[i]);
            else if (kat.kategori === 'clone') clone.push(numbers[i]);
            else if (kat.kategori === 'tidak_dapat_otp') tidak_dapat.push(numbers[i]);
            else error.push(numbers[i]);
            hasilLengkap.push({ nomor: numbers[i], kategori: kategoriSimpan, cooldown: kat.cooldown || 0 });
            simpanHasilAntrean(userIdStr, numbers[i], kategoriSimpan, isProxyMode);

            db.stats.total_deteksi = (Number(db.stats.total_deteksi) || 0) + 1;
            user.deteksi = (Number(user.deteksi) || 0) + 1;
            user.today = (Number(user.today) || 0) + 1;

            if (!isAdmin && !isVip) {
                const today = new Date().toISOString().split('T')[0];
                if (user.lastDetectDate !== today) { user.lastDetectDate = today; user.detectToday = 0; }
                user.detectToday = (user.detectToday || 0) + 1;
            }
            saveDB(db);

            diprosesSekarang = i + 1;
            if (numbers.length === 1) break;
            if (i < numbers.length - 1) await jeda(500);
        } catch (err) {
            const kategoriGagal = /timeout|timed.?out|etimedout/i.test(String(err && err.message || err)) ? 'timeout' : 'error';
            error.push(numbers[i]);
            hasilLengkap.push({ nomor: numbers[i], kategori: kategoriGagal, cooldown: 0 });
            simpanHasilAntrean(userIdStr, numbers[i], kategoriGagal, isProxyMode);
            diprosesSekarang = i + 1;
        }
    }

    clearInterval(refreshTimer);
    delete detekSesiAktif[ctx.from.id];
    delete modeDetekUser[ctx.from.id];
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    lastSiapUser[ctx.from.id] = siap;
    const antreanTersimpan = ambilDataDeteksiUser(ctx.from.id);
    lastErrorUser[ctx.from.id] = [...new Set([...antreanTersimpan.error, ...antreanTersimpan.timeout])];
    lastHasilDetekUser[ctx.from.id] = hasilLengkap;

    const totalDiproses = hasilLengkap.length;
    const totalSkip = totalDiminta - totalDiproses;

    // Ringkasan laporan akhir: gunakan variabel yang memang tersedia.
    const totalSelesai = totalDiproses;
    const totalError = error.length;

    const makeSansLocal = (txt) => txt.split('').map(c => {
        const map = {
            'A':'𝗔','B':'𝗕','C':'𝗖','D':'𝗗','E':'𝗘','F':'𝗙','G':'𝗚','H':'𝗛','I':'𝗜','J':'𝗝','K':'𝗞','L':'𝗟','M':'𝗠','N':'𝗡','O':'𝗢','P':'𝗣','Q':'𝗤','R':'𝗥','S':'𝗦','T':'𝗧','U':'𝗨','V':'𝗩','W':'𝗪','X':'𝗫','Y':'𝗬','Z':'𝗭',
            'a':'𝗮','b':'𝗯','c':'𝗰','d':'𝗱','e':'𝗲','f':'𝗳','g':'𝗴','h':'𝗵','i':'𝗶','j':'𝗷','k':'𝗸','l':'𝗹','m':'𝗺','n':'𝗻','o':'𝗼','p':'𝗽','q':'𝗾','r':'𝗿','s':'𝘀','t':'𝘁','u':'𝘂','v':'𝘃','w':'𝘄','x':'𝘅','y':'𝘆','z':'𝘇',
            '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'
        };
        return map[c] || c;
    }).join('');

    
let finalText = sesi.stop ? `⏹ <blockquote>${tb('DETEKSI DIHENTIKAN')}</blockquote>\n\n` : `✅ <blockquote>${tb('HASIL DETEKSI SELESAI')}</blockquote>\n\n`;
finalText += `⚠️ Waktu Login Bisa Berubah Jika Nomor Ada Yang Login ⚠️\n\n`;

// STATISTIK
finalText +=
    `<pre>🔎 ${tb('HASIL DETEKSI')}</pre>\n` +
    `<blockquote>${buatStatistik()}</blockquote>\n\n`;

// NOMOR YANG DILEWATI
if (totalSkip > 0) {
    finalText +=
        `⏭ <b>${tb('NOMOR DILEWATI')}</b>\n` +
        `<blockquote>${tb('Total nomor dilewati (batas batch atau deteksi dihentikan)')}: <b>${totalSkip}</b></blockquote>\n\n`;
}

// SIAP OTP
if (siap.length > 0) {
    finalText +=
        `<pre>${makeSansLocal("NOMOR SIAP OTP")} ✅ (${siap.length})</pre>\n` +
        `<blockquote>${buatDaftar(
            siap.map(n => `+${n.replace(/\+/g, '')}`)
        )}</blockquote>\n\n`;
}

// COOLDOWN
if (cooldown.length > 0) {
    finalText +=
        `<pre>${makeSansLocal("OTP COOLDOWN")} ⏳ (${cooldown.length})</pre>\n` +
        `<blockquote>__COOLDOWN_REFRESH__</blockquote>\n\n`;
}

// SERVER NGAMBEK
if (ngambek.length > 0) {
    finalText +=
        `<pre>${makeSansLocal("SI MARK NGAMBEK COK")} ⚠️ (${ngambek.length})</pre>\n` +
        `<blockquote>${buatDaftar(ngambek)}</blockquote>\n\n`;
}

// TIDAK DAPAT OTP
if (tidak_dapat.length > 0) {
    finalText +=
        `<pre>${makeSansLocal("VERIF SMS HILANG JIR")} ❌ (${tidak_dapat.length})</pre>\n` +
        `<blockquote>${buatDaftar(tidak_dapat)}</blockquote>\n\n`;
}

// CLONE
if (clone.length > 0) {
    finalText +=
        `<pre>${makeSansLocal("TIDAK SUPPORT CLONE")} 🚫 (${clone.length})</pre>\n` +
        `<blockquote>${buatDaftar(clone)}</blockquote>\n\n`;
}

// ERROR
if (error.length > 0) {
    finalText +=
        `<pre>${makeSansLocal("DI BANNED MARK JIR")} ⚠️ (${error.length})</pre>\n` +
        `<blockquote>${buatDaftar(error)}</blockquote>\n\n`;
}

finalText += `✔ <b>${tb('Selesai')}</b>`;

if (finalText.length > 4000) {
    finalText = finalText.substring(0, 3900) +
        '\n<i>(Hasil terlalu banyak, gunakan tombol export)</i>';
}


    const inlineButtons = [];
    if (cooldown.length > 0) {
    inlineButtons.push([
        Markup.button.callback(
            `${tb('Refresh Cooldown')}`,
            'refreshTimer'
        )
    ]);
}
    if (siap.length > 0) inlineButtons.push([Markup.button.callback(`${tb('Salin Nomor Siap OTP')}`, "copy_siap")]);
    if (ngambek.length > 0) inlineButtons.push([Markup.button.callback(`${tb('Deteksi Ulang Nomor Ngambek')}`, "retry_ngambek")]);
    if (error.length > 0) inlineButtons.push([Markup.button.callback(`${tb('Deteksi Ulang Nomor Error')}`, "retry_timeout")]);
    inlineButtons.push([Markup.button.callback(`${tb('Export Hasil')}`, "export_detek")]);
    inlineButtons.push([Markup.button.callback(`${tb('Kembali ke Menu')}`, "back_to_menu")]);

    const keyboard = Markup.inlineKeyboard(inlineButtons);

// Simpan template dan fungsi pembaruan cooldown
const templateFinal = finalText.trim();

const renderFinal = () => {
    return templateFinal.replace(
        '__COOLDOWN_REFRESH__',
        buatCooldown(cooldown)
    );
};

// Kirim hasil deteksi
const pesanFinal = await ctx.reply(renderFinal(), {
    parse_mode: 'HTML',
    ...keyboard
});

try {
    // Proses bot yang sudah ada

    tampilkanLog({
        userId: userIdStr,
        total: numbers.length,
        negara: daftarNegara || '🏳️',
        proxy: isProxyMode ? 'Mode Proxy' : 'Tanpa Proxy',
        status: 'Selesai'
    });
} catch (error) {
    tampilkanLog({
        userId: userIdStr,
        total: numbers.length,
        negara: daftarNegara || '🏳️',
        proxy: isProxyMode ? 'Mode Proxy' : 'Tanpa Proxy',
        status: 'Error'
    });
}

if (!isAdmin && Number(tierConfig.cooldownSeconds) > 0) user.detectCooldownUntil = Date.now() + Number(tierConfig.cooldownSeconds) * 1000;
saveDB(db);

await kirimNotifGrup(
    `🔎 <b>LAPORAN DETEKSI SELESAI</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +

    `👤 <b>INFORMASI PENGGUNA</b>\n` +
    `<blockquote>` +
    `Nama       : ${esc(ctx.from.first_name || 'User')}\n` +
    `User ID    : <code>${esc(userIdStr)}</code>\n` +
    `Status     : <b>SELESAI</b>` +
    `</blockquote>\n\n` +

    `📊 <b>RINGKASAN PROSES</b>\n` +
    `<blockquote>` +
    `Total diminta  : <b>${totalDiminta}</b>\n` +
    `Total diproses : <b>${totalDiproses}/${totalDiminta}</b>\n` +
    `Nomor dilewati : <b>${Math.max(0, totalDiminta - totalDiproses)}</b>\n` +
    `Total hasil    : <b>${totalSelesai}</b>` +
    `</blockquote>\n\n` +

    `📋 <b>HASIL DETEKSI</b>\n` +
    `<blockquote>` +
    `Siap OTP       : <b>${siap.length}</b>\n` +
    `Cooldown       : <b>${cooldown.length}</b>\n` +
    `Clone          : <b>${clone.length}</b>\n` +
    `Tidak dapat OTP: <b>${tidak_dapat.length}</b>\n` +
    `Error          : <b>${totalError}</b>` +
    `</blockquote>\n\n` +

    `🌍 <b>STATISTIK NEGARA</b>\n` +
    `<blockquote>${esc(daftarNegara)}</blockquote>\n\n` +

    `━━━━━━━━━━━━━━━━━━\n` +
    `🤖 <i>Detection System • Automated Report</i>`
);

// Simpan data untuk tombol refresh
if (cooldown.length > 0) {
    refreshCooldownData[userIdStr] = {
        chatId: ctx.chat.id,
        messageId: pesanFinal.message_id,
        render: renderFinal,
        keyboard
    };
}

    let sisaInfo = '';
    if (isAdmin) {
        sisaInfo = `${tb('Status')}: <b>∞ ADMIN ${tb('Unlimited')}</b>`;
    } else if (isVip) {
        const exp = user.expiredAt ? new Date(user.expiredAt).toLocaleString('id-ID') : '-';
        sisaInfo = `${tb('Masa Aktif s/d')}: <b>${exp}</b>`;
    } else {
        const today = new Date().toISOString().split('T')[0];
        const todayCount = user.lastDetectDate === today ? (user.detectToday || 0) : 0;
        sisaInfo = db.config.freeDailyLimitEnabled ? `${tb('Sisa Kuota Gratis')}: <b>${Math.max(0, Number(db.config.freeDailyLimit || 0) - todayCount)}/${Number(db.config.freeDailyLimit || 0)}</b>` : `${tb('Limit harian')}: <b>Nonaktif (Unlimited)</b>`;
    }

    await ctx.reply(`✅ <b>${tb('Selesai memproses')} ${totalDiproses}/${totalDiminta} ${tb('nomor.')}</b>\n\n<blockquote>${sisaInfo}</blockquote>`, { parse_mode: 'HTML', ...MENU_UTAMA });
}
bot.action('refreshTimer', async (ctx) => {
    const userId = ctx.from.id.toString();
    const data = refreshCooldownData[userId];

    if (!data) {
        return ctx.answerCbQuery(
            'Data cooldown tidak ditemukan. Silakan lakukan deteksi ulang.',
            { show_alert: true }
        );
    }

    try {
        await ctx.telegram.editMessageText(
            data.chatId,
            data.messageId,
            undefined,
            data.render(),
            {
                parse_mode: 'HTML',
                ...data.keyboard
            }
        );

        await ctx.answerCbQuery('✅ Cooldown berhasil diperbarui!');
    } catch (err) {
        if (String(err.message).includes('message is not modified')) {
            return ctx.answerCbQuery('Cooldown belum berubah.');
        }

        console.error('Refresh cooldown error:', err);
        await ctx.answerCbQuery('Gagal memperbarui cooldown.');
    }
});

bot.on('text', async (ctx, next) => {
    const userIdStr = ctx.from.id.toString();
    const dbUserCheck = getDB().users[userIdStr];
    if (!isOwner(ctx.from.id) && dbUserCheck && dbUserCheck.banned) return ctx.reply('🚫 Akses bot Anda sedang dibanned. Hubungi admin jika ini keliru.');
    const rawText = (ctx.message && ctx.message.text) ? ctx.message.text : '';
    if (!rawText) return next();

    const owner = isOwner(ctx.from.id);

    if (owner && ownerState[ctx.from.id]) {
        const state = ownerState[ctx.from.id];
        const text = rawText.trim();

        if (text.toLowerCase() === 'batal' || text.toLowerCase() === '/cancel') {
            delete ownerState[ctx.from.id];
            delete tempProxyData[ctx.from.id];
            await ctx.reply(`✅ ${tb('Aksi dibatalkan.')}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali ke Panel')}`, "owner_back")]]) });
            return;
        }

        const temp = tempProxyData[ctx.from.id] || {};

        if (state === 'FREE_LIMIT_SET') {
            const limit=Number(text); const db=getDB();
            if (!Number.isInteger(limit) || limit<0 || limit>1000000) return ctx.reply('Limit tidak valid. Masukkan angka 0 sampai 1.000.000.');
            db.config.freeDailyLimit=limit; db.config.freeDailyLimitEnabled=limit!==0; saveDB(db); delete ownerState[ctx.from.id];
            return ctx.reply(limit===0 ? '✅ Limit harian FREE dinonaktifkan (unlimited).' : `✅ Limit harian FREE diatur menjadi ${limit} nomor per hari.`,{...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }
        if (state === 'TIER_UPGRADE') {
            const [idRaw,tierRaw,daysRaw]=text.split(',').map(x=>x.trim());
            const id=String(idRaw||''), tier=String(tierRaw||'').toUpperCase(), days=Number(daysRaw);
            const db=getDB();
            if (!/^\d{5,20}$/.test(id) || !db.config.tiers[tier] || tier==='FREE' || !Number.isInteger(days) || days<0) return ctx.reply('Format tidak valid atau tier tidak tersedia. Contoh: 123456789, VIP, 30');
            if (!db.users[id]) db.users[id]={id,name:'User',tier:'FREE',deteksi:0,today:0,joinedAt:new Date().toISOString()};
            db.users[id].tier=tier; db.users[id].expiredAt=days===0?null:new Date(Date.now()+days*86400000).toISOString(); db.users[id].banned=false;
            saveDB(db); delete ownerState[ctx.from.id];
            bot.telegram.sendMessage(id,`💎 Tier akun Anda diubah menjadi ${tier}. Masa aktif: ${days===0?'Permanen':days+' hari'}.`).catch(()=>{});
            return ctx.reply(`✅ User ${id} sekarang tier ${tier}. Expired: ${db.users[id].expiredAt||'Permanen'}`,{...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }
        if (state === 'USER_BAN') {
            const [idRaw,actionRaw]=text.split(',').map(x=>x.trim()); const id=String(idRaw||''); const action=String(actionRaw||'').toLowerCase();
            if (!/^\d{5,20}$/.test(id)||!['ban','unban'].includes(action)) return ctx.reply('Format: USER_ID, ban atau USER_ID, unban');
            if (isSuperOwner(id)) return ctx.reply('Owner utama tidak bisa dibanned.');
            const db=getDB(); if (!db.users[id]) db.users[id]={id,name:'User',tier:'FREE',deteksi:0,today:0,joinedAt:new Date().toISOString()};
            db.users[id].banned=action==='ban'; saveDB(db); delete ownerState[ctx.from.id];
            if(action==='ban') bot.telegram.sendMessage(id,'Akses bot Anda telah dinonaktifkan oleh admin.').catch(()=>{});
            return ctx.reply(`✅ User ${id}: ${action.toUpperCase()}.`,{...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }
        if (state === 'TIER_LIMITS') {
            const [tierRaw,maxRaw,delayRaw]=text.split(',').map(x=>x.trim()); const tier=String(tierRaw||'').toUpperCase(); const max=Number(maxRaw), delay=Number(delayRaw);
            const db=getDB(); if(!db.config.tiers[tier]||!Number.isInteger(max)||max<1||max>10000||!Number.isFinite(delay)||delay<0||delay>86400) return ctx.reply('Data tidak valid. Tier harus ada, max batch 1–10000, jeda 0–86400 detik.');
            db.config.tiers[tier].maxBatch=max; db.config.tiers[tier].cooldownSeconds=delay; saveDB(db); delete ownerState[ctx.from.id];
            return ctx.reply(`✅ ${tier}: max batch ${max}, jeda ${delay} detik.`,{...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }
        if (state === 'TIER_PRICE') {
            const [tierRaw,daysRaw,priceRaw]=text.split(',').map(x=>x.trim()); const tier=String(tierRaw||'').toUpperCase(), days=Number(daysRaw), price=Number(priceRaw);
            const db=getDB(); if(!db.config.tiers[tier]||tier==='FREE'||!Number.isInteger(days)||days<1||days>3650||!Number.isSafeInteger(price)||price<1) return ctx.reply('Data tidak valid. Contoh: VIP, 30, 50000');
            db.config.tiers[tier].prices=db.config.tiers[tier].prices||{}; db.config.tiers[tier].prices[days]=price; saveDB(db); delete ownerState[ctx.from.id];
            return ctx.reply(`✅ Harga ${tier} ${days} hari diatur Rp${price.toLocaleString('id-ID')}.`,{...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }
        if (state === 'TIER_ADD') {
            const [nameRaw,maxRaw,delayRaw]=text.split(',').map(x=>x.trim()); const name=String(nameRaw||'').toUpperCase(), max=Number(maxRaw), delay=Number(delayRaw);
            const db=getDB(); if(!/^[A-Z0-9_]{2,16}$/.test(name)||['ADMIN','FREE','VIP','VVIP'].includes(name)||db.config.tiers[name]||!Number.isInteger(max)||max<1||max>10000||!Number.isFinite(delay)||delay<0||delay>86400) return ctx.reply('Tier tidak valid/duplikat. Format: PREMIUM, 200, 15');
            db.config.tiers[name]={maxBatch:max,cooldownSeconds:delay,prices:{}}; saveDB(db); delete ownerState[ctx.from.id];
            return ctx.reply(`✅ Tier ${name} berhasil dibuat. Atur harganya melalui menu Ubah Harga Upgrade.`,{...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }
        if (state === 'PAYMENT_ADD') {
            const [nameRaw,...detailParts]=text.split(','); const name=String(nameRaw||'').trim(), detail=detailParts.join(',').trim();
            if(name.length<2||name.length>30||detail.length<3||detail.length>300) return ctx.reply('Format tidak valid. Contoh: DANA, 081234567890 a.n. Nama Pemilik');
            const db=getDB(); db.config.payment_methods=db.config.payment_methods||[]; db.config.payment_methods.push({name,detail,addedAt:new Date().toISOString()}); saveDB(db); delete ownerState[ctx.from.id];
            return ctx.reply(`✅ Metode ${esc(name)} berhasil ditambahkan. Detail: ${esc(detail)}.`,{parse_mode:'HTML',...Markup.inlineKeyboard([[Markup.button.callback('💎 Kembali','owner_tier_menu')]])});
        }

        if (state === 'ADMIN_ADD') {
            if (!isSuperOwner(ctx.from.id)) {
                delete ownerState[ctx.from.id];
                return ctx.reply('❌ Hanya Owner Utama yang dapat menambahkan admin.');
            }
            const adminId = text.replace(/^@/, '');
            if (!/^\d{5,20}$/.test(adminId)) {
                return ctx.reply('❌ User ID tidak valid. Kirim ID Telegram berupa angka (5–20 digit), atau ketik batal.');
            }
            if (isSuperOwner(adminId)) {
                delete ownerState[ctx.from.id];
                return ctx.reply('ℹ️ ID tersebut sudah terdaftar sebagai Owner Utama.');
            }
            const db = getDB();
            if (!db.config || typeof db.config !== 'object') db.config = {};
            if (!Array.isArray(db.config.admin_ids)) db.config.admin_ids = [];
            if (db.config.admin_ids.map(String).includes(adminId)) {
                delete ownerState[ctx.from.id];
                return ctx.reply('ℹ️ User tersebut sudah menjadi admin.');
            }
            db.config.admin_ids.push(adminId);
            if (!db.users[adminId]) {
                db.users[adminId] = { id: adminId, name: 'Admin', tier: 'ADMIN', deteksi: 0, today: 0, joinedAt: new Date().toISOString() };
                db.stats.total_user = (Number(db.stats.total_user) || 0) + 1;
            } else {
                db.users[adminId].tier = 'ADMIN';
                db.users[adminId].expiredAt = null;
            }
            if (!saveDB(db)) return ctx.reply('❌ Gagal menyimpan database. Coba lagi.');
            delete ownerState[ctx.from.id];
            delete tempProxyData[ctx.from.id];
            bot.telegram.sendMessage(adminId, '✅ Anda telah ditambahkan sebagai admin bot. Ketik /start untuk membuka panel admin.').catch(() => {});
            return ctx.reply(`✅ Admin <code>${adminId}</code> berhasil ditambahkan.`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('👥 Kembali ke Manajemen Admin', 'owner_admin_management')]])
            });
        }

        if (state === 'EMAIL_APP_PASSWORD_EMAIL') {
            const email = text.toLowerCase();
            if (!validasiAlamatEmail(email)) return ctx.reply('Format email tidak valid.');
            const db = getDB();
            if (!db.config.email_senders.includes(email)) return ctx.reply('Email tersebut belum ada di daftar email pengirim. Tambahkan email pengirim terlebih dahulu.');
            tempProxyData[ctx.from.id] = { emailAppPasswordFor: email };
            ownerState[ctx.from.id] = 'EMAIL_APP_PASSWORD_VALUE';
            return ctx.reply('Sekarang kirim App Password untuk akun tersebut. Jangan kirim password akun Google biasa. Pesan ini akan coba dihapus otomatis setelah diterima.', MENU_CANCEL_ONLY);
        }
        if (state === 'EMAIL_APP_PASSWORD_VALUE') {
            const password = text.replace(/\s+/g, '');
            if (password.length < 12 || password.length > 64) return ctx.reply('Format App Password tidak sesuai. Periksa kembali lalu kirim ulang, atau ketik batal.');
            try {
                const tempData = tempProxyData[ctx.from.id] || {};
                const email = tempData.emailAppPasswordFor;
                if (!email) throw new Error('Alamat email tidak ditemukan.');
                const db = getDB();
                if (!Array.isArray(db.config.email_app_passwords)) db.config.email_app_passwords = [];
                const encrypted = enkripsiAppPassword(password);
                const index = db.config.email_app_passwords.findIndex(item => item.email === email);
                const record = { email, ...encrypted, updatedAt: new Date().toISOString() };
                if (index >= 0) db.config.email_app_passwords[index] = record;
                else db.config.email_app_passwords.push(record);
                if (!saveDB(db)) throw new Error('Gagal menyimpan database.');
                delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
                try { await ctx.deleteMessage(); } catch (_) {}
                return ctx.reply(`✅ App Password untuk <code>${esc(email)}</code> berhasil disimpan dalam bentuk terenkripsi.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔐 Lihat Status Password', 'owner_email_app_password')]]) });
            } catch (err) {
                console.error('Simpan App Password gagal:', err.message);
                return ctx.reply('❌ Gagal menyimpan App Password. Pastikan file penyimpanan dapat ditulis.');
            }
        }

        if (state === 'EMAIL_SENDER_ADD' || state === 'EMAIL_RECIPIENT_ADD') {
            const email = text.toLowerCase();
            if (!validasiAlamatEmail(email)) return ctx.reply('Format email tidak valid. Contoh: nama@example.com');
            const db = getDB();
            const key = state === 'EMAIL_SENDER_ADD' ? 'email_senders' : 'email_recipients';
            if (!Array.isArray(db.config[key])) db.config[key] = [];
            if (db.config[key].includes(email)) return ctx.reply('Alamat email tersebut sudah terdaftar.');
            if (db.config[key].length >= 30) return ctx.reply('Maksimal 30 alamat email per daftar.');
            db.config[key].push(email);
            if (!saveDB(db)) return ctx.reply('Gagal menyimpan ke database.json.');
            delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
            const label = key === 'email_senders' ? 'pengirim' : 'tujuan';
            return ctx.reply(`✅ Email ${label} <code>${esc(email)}</code> berhasil ditambahkan.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📧 Kembali ke Manajemen Email', 'owner_email_management')]]) });
        }

        if (state === 'EMAIL_TEMPLATE_NAME') {
            if (text.length < 2 || text.length > 40) return ctx.reply('Nama template harus 2–40 karakter.');
            temp.name = text; tempProxyData[ctx.from.id] = temp; ownerState[ctx.from.id] = 'EMAIL_TEMPLATE_BODY';
            return ctx.reply(`Kirim isi template. Gunakan {nomor} sebagai placeholder nomor.`, { parse_mode: 'HTML' });
        }
        if (state === 'EMAIL_TEMPLATE_BODY') {
            if (text.length < 20 || text.length > 3500) return ctx.reply('Isi template harus 20–3500 karakter.');
            const db = getDB();
            if (!Array.isArray(db.config.email_templates)) db.config.email_templates = [];
            db.config.email_templates.push({ name: temp.name, body: text }); saveDB(db);
            delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
            return ctx.reply(`✅ Template <b>${esc(temp.name)}</b> berhasil ditambahkan.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📄 Daftar Template', 'owner_email_templates')]]) });
        }

        if (state === 'PROXY_HOST') {
            if (text.length < 3 || /\s/.test(text)) {
                return ctx.reply(`⚠️ <b>${tb('Host tidak valid.')}</b>\n\n<blockquote>${tb('Host minimal 3 karakter, tanpa spasi.')}\n\n${tb('Contoh')}: <code>gw.dataimpulse.com</code>\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
            }
            temp.host = text; tempProxyData[ctx.from.id] = temp; ownerState[ctx.from.id] = 'PROXY_PORT';
            return ctx.reply(`➕ <b>${tb('TAMBAH PROXY (LANGKAH 2/4)')}</b>\n\n<blockquote>${tb('Host')}: <code>${temp.host}</code>\n\n${tb('Silakan ketik Port proxy (1-65535).')}\n\n${tb('Contoh')}: <code>823</code>\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
        }

        if (state === 'PROXY_PORT') {
            const portNum = parseInt(text.replace(/[^0-9]/g, ''), 10);
            if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                return ctx.reply(`⚠️ <b>${tb('Port tidak valid.')}</b>\n\n<blockquote>${tb('Port harus angka 1-65535.')}\n\n${tb('Contoh')}: <code>823</code>\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
            }
            temp.port = String(portNum); tempProxyData[ctx.from.id] = temp; ownerState[ctx.from.id] = 'PROXY_USER';
            return ctx.reply(`➕ <b>${tb('TAMBAH PROXY (LANGKAH 3/4)')}</b>\n\n<blockquote>${tb('Host')}: <code>${temp.host}</code>\n${tb('Port')}: <code>${temp.port}</code>\n\n${tb('Silakan ketik Username proxy.')}\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
        }

        if (state === 'PROXY_USER') {
            if (text.length < 1) return ctx.reply(`⚠️ <b>${tb('Username tidak boleh kosong.')}</b>\n\n${tb('Ketik batal untuk membatalkan.')}`, { parse_mode: 'HTML' });
            temp.user = text; tempProxyData[ctx.from.id] = temp; ownerState[ctx.from.id] = 'PROXY_PASS';
            return ctx.reply(`➕ <b>${tb('TAMBAH PROXY (LANGKAH 4/4)')}</b>\n\n<blockquote>${tb('Host')}: <code>${temp.host}</code>\n${tb('Port')}: <code>${temp.port}</code>\n${tb('User')}: <code>${temp.user}</code>\n\n${tb('Silakan ketik Password proxy.')}\n\n${tb('Ketik batal untuk membatalkan.')}</blockquote>`, { parse_mode: 'HTML' });
        }

        if (state === 'PROXY_PASS') {
            if (text.length < 1) return ctx.reply(`⚠️ <b>${tb('Password tidak boleh kosong.')}</b>\n\n${tb('Ketik batal untuk membatalkan.')}`, { parse_mode: 'HTML' });
            temp.pass = text;
            const db = getDB();
            if (!Array.isArray(db.config.proxies)) db.config.proxies = [];
            const newProxy = { id: Date.now().toString(), host: temp.host, port: temp.port, user: temp.user, pass: temp.pass, status: 'unknown', addedAt: new Date().toISOString() };
            db.config.proxies.push(newProxy);
            const ok = saveDB(db);
            if (!ok) return ctx.reply(`❌ <b>${tb('GAGAL MENYIMPAN PROXY')}</b>\n\n<blockquote>${tb('Cek permission database.json.')}</blockquote>`, { parse_mode: 'HTML' });
            delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
            return ctx.reply(`✅ <b>${tb('PROXY BERHASIL DITAMBAHKAN')}</b>\n\n<blockquote>${tb('Host')}: <code>${newProxy.host}</code>\n${tb('Port')}: <code>${newProxy.port}</code>\n${tb('User')}: <code>${newProxy.user}</code>\n${tb('ID')}: <code>${newProxy.id}</code>\n\n${tb('Total Proxy')}: <b>${db.config.proxies.length}</b></blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔙 ${tb('Kembali ke Panel Proxy')}`, "owner_menu_proxy")]]) });
        }

        if (state === 'AWAITING_BROADCAST') {
            delete ownerState[ctx.from.id];
            const db = getDB();
            let success = 0, failed = 0;
            const loading = await ctx.reply(`⏳ ${tb('Mengirim broadcast...')}`);
            for (const uid of Object.keys(db.users)) {
                try { await bot.telegram.copyMessage(uid, ctx.chat.id, ctx.message.message_id); success++; }
                catch (e) { failed++; }
                await jeda(50);
            }
            await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `✅ <b>${tb('Broadcast Selesai')}</b>\n\n<blockquote>${tb('Berhasil')}: ${success}\n${tb('Gagal')}: ${failed}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
            return;
        }

        if (state === 'AWAITING_BCP') {
            delete ownerState[ctx.from.id];
            const db = getDB();
            let success = 0, failed = 0;
            const loading = await ctx.reply(`⏳ ${tb('Mengirim BCP...')}`);
            for (const uid of Object.keys(db.users)) {
                try {
                    const msg = await bot.telegram.copyMessage(uid, ctx.chat.id, ctx.message.message_id);
                    await bot.telegram.pinChatMessage(uid, msg.message_id).catch(() => {});
                    success++;
                } catch (e) { failed++; }
                await jeda(50);
            }
            await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, null, `✅ <b>${tb('BCP Selesai')}</b>\n\n<blockquote>${tb('Berhasil')}: ${success}\n${tb('Gagal')}: ${failed}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
            return;
        }
    }

    const normalized = normalisasiTeks(rawText).trim();
    const upperNorm = normalized.toUpperCase();

    if (upperNorm.startsWith('/')) return next();

    const emailFlow = bandingEmailState[ctx.from.id];
    if (emailFlow && emailFlow.step === 'numbers' && ['batal', '❌ batal', '/cancel'].includes(rawText.trim().toLowerCase())) {
        delete bandingEmailState[ctx.from.id];
        return ctx.reply(tb('Proses banding email dibatalkan.'), MENU_UTAMA);
    }
    if (emailFlow && emailFlow.step === 'numbers') {
        // Ambil nomor dari awal setiap baris agar angka bulan/tahun tidak dianggap nomor baru.
        const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const parsed = [];
        const invalid = [];
        for (const line of lines) {
            const match = line.match(/^(\+?\d{8,15})(?:\s+.*)?$/);
            if (!match) { invalid.push(line); continue; }
            const digits = match[1].replace(/\D/g, '');
            parsed.push({ number: `+${digits}` });
        }
        const unique = [...new Map(parsed.map(item => [item.number, item])).values()];
        if (invalid.length || !unique.length) {
            return ctx.reply(`⚠️ Format daftar belum valid. Pastikan setiap baris diawali nomor telepon 8–15 digit. Contoh: <code>+9647511226005 (Low) · Mar 2019</code>`, { parse_mode: 'HTML' });
        }
        if (unique.length > 10) return ctx.reply('⚠️ Maksimal 10 nomor per pengajuan. Kurangi jumlah baris lalu kirim ulang.');
        const db = getDB();
        const templates = Array.isArray(db.config.email_templates) ? db.config.email_templates : [];
        if (!templates.length) return ctx.reply('⚠️ Metode banding belum tersedia. Hubungi admin.', MENU_UTAMA);
        emailFlow.numbers = unique;
        emailFlow.step = 'method';
        const preview = unique.map((item, index) => `${index + 1}. <code>${esc(item.number)}</code>`).join('\n');
        const rows = templates.map((template, index) => [
            Markup.button.callback(`📧 ${String(template.name || `Metode ${index + 1}`).slice(0, 45)}`, `email_method_${index}`)
        ]);
        rows.push([Markup.button.callback('❌ Batal', 'email_draft_cancel')]);
        return ctx.reply(`📨 <b>PILIH METODE BANDING</b>\n\n<blockquote>Daftar nomor:\n${preview}\n\nJumlah nomor: ${unique.length}\nSatu email akan berisi seluruh nomor di atas.</blockquote>\n\nPastikan semua nomor milikmu atau kamu berwenang mengajukan peninjauan.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) });
    }

    if (/DETEKSI$/.test(upperNorm) || upperNorm === 'DETEKSI' || upperNorm.includes('🔍')) {
        if (!isOwner) {} 
        const db = getDB();
        const userId = userIdStr;
        const tier = resolveUserTier(userId, db);
        const user = db.users[userId] || { tier: 'FREE' };
        const tierLabel = getTierLabel(tier);
        let statusLine = '';
        if (tier === 'ADMIN') {
            statusLine = `> ${tb('Status')}: ADMIN ∞ ${tb('Unlimited')}`;
        } else if (tier !== 'FREE') {
            const exp = user.expiredAt ? new Date(user.expiredAt).toLocaleString('id-ID') : 'Permanen';
            statusLine = `> ${tb('Status')}: ${tierLabel} (${tb('Aktif s/d')} ${exp})`;
        } else {
            const today = new Date().toISOString().split('T')[0];
            const todayCount = user.lastDetectDate === today ? (user.detectToday || 0) : 0;
            statusLine = db.config.freeDailyLimitEnabled ? `> ${tb('Sisa Kuota Gratis')}: ${Math.max(0, Number(db.config.freeDailyLimit || 0) - todayCount)} / ${Number(db.config.freeDailyLimit || 0)} ${tb('hari ini')}` : `> ${tb('Limit harian')}: Nonaktif (Unlimited)`;
        }
        return ctx.reply(`🔍 <b>${tb('DETEKSI OTP')} (${tierLabel})</b>\n\n<blockquote>${statusLine}\n${tb('Pilih mode deteksi:')}</blockquote>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`🌐 ${tb('Mode Proxy (Aman IP)')}`, "mode_proxy")],
                [Markup.button.callback(`🖥️ ${tb('Mode Server (Direct)')}`, "mode_server")],
                [Markup.button.callback(`❌ ${tb('Batal')}`, "cancel_detek")]
            ])
        });
    }

    if (upperNorm.includes('BANDING VIA EMAIL') || upperNorm.includes('✉️')) {
        return ctx.reply(`✉️ <b>${tb('Pilih metode')}</b>\n\n<blockquote>${tb('Kirim satu atau beberapa nomor (satu per baris), lalu pilih metode untuk membuat satu pengajuan email.')}</blockquote>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('✉️ Banding via Email', 'email_draft_start')], [Markup.button.callback('🔍 Kembali ke Deteksi', 'cancel_detek')]]) });
    }

    if (upperNorm.includes('BELI TIER') || upperNorm.includes('💎')) {
        const db = getDB();
        if (!db.config.upgradeEnabled && !isOwner(ctx.from.id)) return ctx.reply('🔒 Fitur upgrade tier sedang ditutup oleh Admin. Silakan coba lagi nanti.', MENU_UTAMA);
        const rows = [];
        for (const [tierName, cfg] of Object.entries(db.config.tiers || {})) {
            if (tierName === 'FREE' || tierName === 'ADMIN') continue;
            for (const [days, price] of Object.entries(cfg.prices || {})) {
                rows.push([Markup.button.callback(`${tierName} ${days} hari · Rp${Number(price).toLocaleString('id-ID')}`, `trx_${tierName}_${days}_${price}`)]);
            }
        }
        rows.push([Markup.button.callback(`🏠 ${tb('Kembali ke Menu')}`, 'back_to_menu')]);
        return ctx.reply(`<b>💎 PILIH PAKET UPGRADE</b>\n\nHarga dan tier dikelola admin. Pembayaran diverifikasi manual oleh admin.`, { parse_mode:'HTML', ...Markup.inlineKeyboard(rows) });
    }

    if (upperNorm.includes('TOP DETEKSI') || upperNorm.includes('🏆')) {
        const db = getDB();
        const lb = Object.entries(db.users).map(([id, d]) => ({ name: d.name || `User_${id.substring(0, 5)}`, id, total: d.deteksi || 0, today: d.today || 0 })).sort((a, b) => b.total - a.total);
        let text = `🏆 <b>${tb('TOP DETEKSI')}</b>\n━━━━━━━━━━━━━━━\n\n`;
        if (lb.length === 0) text += `<blockquote>${tb('Belum ada data deteksi.')}</blockquote>`;
        else lb.slice(0, 10).forEach((u, i) => { text += `<blockquote>${i + 1}. <b>${u.name}</b> (<code>${u.id}</code>)\n${tb('Total')}: ${u.total} | ${tb('Hari ini')}: ${u.today}</blockquote>\n`; });
        return ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🏠 ${tb('Kembali ke Menu')}`, "back_to_menu")]]) });
    }

    if (upperNorm.includes('REFERRAL') || upperNorm.includes('🔗')) {
        return ctx.reply(`🔗 <b>${tb('Link Referral Anda')}</b>\n\n<blockquote>${tb('Setiap 1 user join via link Anda = 150 Poin. Terkumpul 150 Poin bisa ditukar 10x kuota deteksi.')}</blockquote>\n\n<code>https://t.me/${BOT_USERNAME}?start=ref_${ctx.from.id}</code>`, { parse_mode: 'HTML' });
    }

    if (upperNorm === 'PANEL OWNER' || upperNorm.includes('⚙️ PANEL OWNER')) {
        if (!isOwner) return;
        delete ownerState[ctx.from.id]; delete tempProxyData[ctx.from.id];
        return ctx.reply(`<b>⚙️ ${tb('PANEL OWNER')}</b>\n\n<blockquote>${tb('Silakan pilih menu manajemen di bawah ini:')}</blockquote>`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(`🌐 ${tb('Manajemen Proxy')}`, "owner_menu_proxy")],
                [Markup.button.callback(`📢 ${tb('Manajemen Grup')}`, "owner_menu_group")],
                [Markup.button.callback(`👥 ${tb('Manajemen Admin')}`, "owner_admin_management")],
            [Markup.button.callback('💎 Manajemen Tier & User', 'owner_tier_menu')],
            [Markup.button.callback(`🔄 ${tb('Restart Bot')}`, "owner_restart_confirm")],
                [Markup.button.callback(`📢 ${tb('Broadcast Pesan')}`, "owner_broadcast")],
                [Markup.button.callback(`📌 ${tb('Pin Pesan (BCP)')}`, "owner_bcp")],
            [Markup.button.callback(`✉️ ${tb('Manajemen Template Email')}`, 'owner_email_templates')]
            ])
        });
    }

    if (normalized === '❌ Batal' || normalized === 'Batal' || normalized === 'batal') {
        if (modeDetekUser[ctx.from.id]) {
            delete modeDetekUser[ctx.from.id];
            return ctx.reply(tb('Dibatalkan.'), MENU_UTAMA);
        }
        return next();
    }

    const numbers = rawText.match(/\+?\d{8,15}/g);
    if (!numbers || numbers.length === 0) return next();

    if (busyUsers.has(userIdStr)) return ctx.reply(`⏳ ${tb('Proses deteksi sebelumnya masih berjalan. Mohon tunggu.')}`);

    // Jalankan deteksi di background agar handler update Telegram segera selesai.
    // busyUsers tetap aktif sampai proses deteksi benar-benar selesai.
    busyUsers.add(userIdStr);
    const isProxyMode = modeDetekUser[ctx.from.id] !== 'server';

    void jalankanDetek(ctx, numbers, isProxyMode)
        .catch(async (err) => {
            console.error(`[DETEKSI] Gagal untuk user ${userIdStr}:`, err);
            try {
                await ctx.telegram.sendMessage(
                    ctx.chat.id,
                    '❌ Terjadi kesalahan saat menjalankan deteksi. Silakan coba lagi.'
                );
            } catch (sendErr) {
                console.error('[DETEKSI] Gagal mengirim notifikasi error:', sendErr);
            }
        })
        .finally(() => {
            busyUsers.delete(userIdStr);
            console.log(`[DETEKSI] Lock user ${userIdStr} dilepas.`);
        });

    // Jangan await jalankanDetek di handler ini.
    return;
});

bot.on('new_chat_members', async (ctx) => {
    const db = getDB();
    if (!db.config.welcome_enabled) return;
    const isVerificationGroup = Array.isArray(db.config.verification_group_ids) && db.config.verification_group_ids.includes(ctx.chat.id);
    if (!isVerificationGroup) return;
    for (const member of ctx.message.new_chat_members) {
        if (member.is_bot) continue;
        const displayName = member.first_name || member.username || 'User';
        const chatTitle = ctx.chat.title || 'Grup';
        const textWelcome = `<b>${tb('WELCOME TO THE GROUP')}</b>\n\n<blockquote>${tb('Halo')} <b>${esc(displayName)}</b>! 👋\n\n${tb('Selamat datang di')} <b>${esc(chatTitle)}</b>.\n\n${tb('Jangan lupa baca rules grup ya!')}</blockquote>`;
        const inlineButtons = Markup.inlineKeyboard([[Markup.button.url("🤖 Buka Bot", `https://t.me/${BOT_USERNAME}`)]]);
        await ctx.reply(textWelcome, { parse_mode: 'HTML', ...inlineButtons }).catch(() => {});
    }
});

bot.on(['photo', 'document'], async (ctx) => {
    const owner = isOwner(ctx.from.id);
    const replyTo = ctx.message.reply_to_message;

    // Owner dapat menautkan gambar QRIS ke metode pembayaran dengan caption /setpayment NAMA.
    if (owner && ctx.message.photo && /^\/setpayment\s+(.+)$/i.test((ctx.message.caption || '').trim())) {
        const methodName = ctx.message.caption.trim().replace(/^\/setpayment\s+/i, '').trim().toLowerCase();
        const db = getDB(); const method = (db.config.payment_methods || []).find(m => String(m.name).toLowerCase() === methodName);
        if (!method) return ctx.reply('❌ Metode tidak ditemukan. Tambahkan dulu melalui Manajemen Tier.');
        method.fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; saveDB(db);
        return ctx.reply(`✅ Gambar pembayaran untuk ${esc(method.name)} berhasil disimpan.`, { parse_mode:'HTML' });
    }

    // Owner dapat mengatur banner menu dengan mengirim foto ber-caption /setbanner.
    if (owner && ctx.message.photo && /^\/setbanner(?:@\w+)?$/i.test((ctx.message.caption || '').trim())) {
        const db = getDB();
        if (!db.config || typeof db.config !== 'object') db.config = {};
        db.config.menu_banner_file_id = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        if (!saveDB(db)) return ctx.reply('❌ Gagal menyimpan banner. Silakan coba lagi.');
        return ctx.reply('✅ <b>BANNER MENU BERHASIL DIPERBARUI</b>\n\nBanner akan tampil di atas teks menu setiap user membuka /start.', { parse_mode: 'HTML' });
    }

    if (owner && replyTo && pendingOwnerReplyMap[replyTo.message_id]) {
        const { trxId, userId } = pendingOwnerReplyMap[replyTo.message_id];
        try {
            if (ctx.message.photo) {
                const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                await bot.telegram.sendPhoto(userId, fileId, { caption: `📸 <b>QRIS UNTUK INVOICE ${trxId}</b>\n\n<blockquote>Silakan lakukan pembayaran, lalu kirim foto bukti transfer.</blockquote>`, parse_mode: 'HTML' }).catch(() => {});
            } else if (ctx.message.document) {
                const fileId = ctx.message.document.file_id;
                await bot.telegram.sendDocument(userId, fileId, { caption: `📸 <b>QRIS UNTUK INVOICE ${trxId}</b>\n\n<blockquote>Silakan lakukan pembayaran, lalu kirim foto bukti transfer.</blockquote>`, parse_mode: 'HTML' }).catch(() => {});
            }
            const pending = getPending();
            if (pending[trxId]) { pending[trxId].status = 'WAITING_PAYMENT'; savePending(pending); }
            await ctx.reply(`✅ QRIS untuk invoice <code>${trxId}</code> berhasil dikirim ke user.`, { parse_mode: 'HTML' });
            await kirimNotifGrup(`📤 <b>QRIS DIKIRIM</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser ID: <code>${userId}</code>\nStatus: Menunggu pembayaran</blockquote>`);
        } catch (err) {}
        delete pendingOwnerReplyMap[replyTo.message_id];
        return;
    }

    if (owner) return;

    const pending = getPending();
    const activeTrx = Object.entries(pending).find(([_, t]) => String(t.userId) === String(ctx.from.id) && (t.status === 'WAITING_QR' || t.status === 'WAITING_PAYMENT'));
    if (!activeTrx) return;

    const [trxId, trx] = activeTrx;
    let fileId = null, fileType = null;
    if (ctx.message.photo) { fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; fileType = 'photo'; }
    else if (ctx.message.document && ctx.message.document.mime_type && ctx.message.document.mime_type.startsWith('image/')) { fileId = ctx.message.document.file_id; fileType = 'document'; }
    if (!fileId) return;

    const captionOwner = `<b>🧾 BUKTI PEMBAYARAN MASUK</b>\n\n<blockquote>ID: <code>${trxId}</code>\n👤 Nama: ${ctx.from.first_name}\n🆔 User ID: <code>${ctx.from.id}</code>\n📦 Paket: ${trx.tier} (${trx.days} Hari)\n💵 Harga: <b>Rp${Number(trx.price).toLocaleString('id-ID')}</b></blockquote>`;
    const ownerButtons = Markup.inlineKeyboard([
        [Markup.button.callback("✅ SETUJUI", `owner_acc_${trxId}`), Markup.button.callback("❌ TOLAK", `owner_rej_${trxId}`)],
        [Markup.button.url("🤖 Buka Bot", `https://t.me/${BOT_USERNAME}`)]
    ]);
    try {
        for (const adminId of OWNER_IDS) {
            if (fileType === 'photo') await bot.telegram.sendPhoto(adminId, fileId, { caption: captionOwner, parse_mode: 'HTML', ...ownerButtons });
            else await bot.telegram.sendDocument(adminId, fileId, { caption: captionOwner, parse_mode: 'HTML', ...ownerButtons });
        }
    } catch (err) {}

    trx.status = 'PAYMENT_PROOF_RECEIVED';
    pending[trxId] = trx;
    savePending(pending);
    await kirimNotifGrup(`💳 <b>BUKTI PEMBAYARAN MASUK</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser: ${esc(ctx.from.first_name || 'User')}\nUser ID: <code>${ctx.from.id}</code>\nPaket: ${trx.tier} (${trx.days} hari)\nHarga: Rp${Number(trx.price).toLocaleString('id-ID')}\nStatus: Menunggu verifikasi</blockquote>`);
    await ctx.reply(`✅ <b>BUKTI PEMBAYARAN DITERIMA</b>\n\n<blockquote>Untuk invoice <code>${trxId}</code>. Admin akan memverifikasi segera.</blockquote>`, { parse_mode: 'HTML' });
});

bot.action(/^owner_acc_(.+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    const trxId = ctx.match[1];
    const pending = getPending(); const trx = pending[trxId];
    if (!trx) return safeAnswer(ctx, "❌ Invoice tidak ditemukan.", { show_alert: true });
    if (trx.status === 'APPROVED') return safeAnswer(ctx, "⚠️ Sudah disetujui.", { show_alert: true });

    const db = getDB();
    const userId = String(trx.userId);
    if (!db.users[userId]) db.users[userId] = { name: trx.name || 'User', tier: 'FREE', deteksi: 0, today: 0, joinedAt: new Date() };
    const tierTarget = (db.config.tiers && db.config.tiers[trx.tier] && trx.tier !== 'FREE') ? trx.tier : (trx.tier === 'VVIP' ? 'VVIP' : 'VIP');
    const expiredAt = new Date(Date.now() + (Number(trx.days) || 1) * 24 * 60 * 60 * 1000);
    db.users[userId].tier = tierTarget;
    db.users[userId].expiredAt = expiredAt.toISOString();
    if (tierTarget === 'VVIP') db.stats.super = (Number(db.stats.super) || 0) + 1;
    else if (tierTarget === 'VIP') db.stats.premium = (Number(db.stats.premium) || 0) + 1;
    db.stats.revenue = (Number(db.stats.revenue) || 0) + Number(trx.price || 0);
    db.stats.trx = (Number(db.stats.trx) || 0) + 1;
    saveDB(db);

    trx.status = 'APPROVED'; pending[trxId] = trx; savePending(pending);
    await kirimNotifGrup(`✅ <b>TRANSAKSI DISETUJUI</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser: ${esc(trx.name || 'User')}\nUser ID: <code>${userId}</code>\nTier: <b>${tierTarget}</b> (${trx.days} hari)\nHarga: Rp${Number(trx.price).toLocaleString('id-ID')}</blockquote>`);

    bot.telegram.sendMessage(userId, `✅ <b>PEMBAYARAN SUKSES</b>\n\n<blockquote>Tier: ${tierTarget} ${trx.days} Hari\nMasa aktif: <b>${expiredAt.toLocaleString('id-ID')}</b></blockquote>`, { parse_mode: 'HTML' }).catch(() => {});

    await ctx.editMessageCaption(`<b>✅ TRANSAKSI DISETUJUI</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser: ${trx.name}\nPaket: ${tierTarget} (${trx.days} Hari)\nHarga: Rp${Number(trx.price).toLocaleString('id-ID')}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
    await safeAnswer(ctx, "✅ Disetujui.");
});

bot.action(/^owner_rej_(.+)$/, async (ctx) => {
    if (!isOwner(ctx.from.id)) return safeAnswer(ctx, `❌ ${tb('Akses Ditolak.')}`, { show_alert: true });
    const trxId = ctx.match[1];
    const pending = getPending(); const trx = pending[trxId];
    if (!trx) return safeAnswer(ctx, "❌ Invoice tidak ditemukan.", { show_alert: true });

    trx.status = 'REJECTED'; pending[trxId] = trx; savePending(pending);
    await kirimNotifGrup(`❌ <b>TRANSAKSI DITOLAK</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser: ${esc(trx.name || 'User')}\nUser ID: <code>${trx.userId}</code>\nPaket: ${trx.tier} (${trx.days} hari)</blockquote>`);

    bot.telegram.sendMessage(String(trx.userId), `❌ <b>PEMBAYARAN DITOLAK</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nHubungi admin untuk info lanjut.</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});

    await ctx.editMessageCaption(`<b>❌ TRANSAKSI DITOLAK</b>\n\n<blockquote>Invoice: <code>${trxId}</code>\nUser: ${trx.name}</blockquote>`, { parse_mode: 'HTML' }).catch(() => {});
    await safeAnswer(ctx, "❌ Ditolak.");
});

bot.command('addnotifall', async (ctx) => {
    if (!isOwner(ctx.from.id)) return ctx.reply(`❌ ${tb('Akses Ditolak.')}`);
    if (ctx.chat.type === 'private') return ctx.reply(`⚠️ ${tb('Hanya di grup.')}`);
    const chatId = ctx.chat.id;
    try {
        const botInfo = await bot.telegram.getChatMember(chatId, bot.botInfo.id);
        if (!['administrator', 'creator'].includes(botInfo.status)) return ctx.reply(`⚠️ ${tb('Bot harus admin.')}`);
    } catch (e) { return ctx.reply(`⚠️ ${tb('Gagal verifikasi admin bot.')}`); }
    const db = getDB();
    db.config.notification_group_ids = [chatId]; saveDB(db);
    await ctx.reply(`✅ ${tb('Grup dijadikan pusat notifikasi.')}`);
    await kirimNotifGrup(`🟢 <b>NOTIFIKASI AKTIF</b>\n\nGrup ini berhasil terhubung sebagai pusat notifikasi semua aktivitas penting bot.`);
});

async function jalankanDetek(ctx, numbers, isProxyMode) {
    const runId = Symbol('detection');

    try {
        return await jalankanDetekInternal(
            ctx,
            numbers,
            isProxyMode,
            runId
        );
    } finally {
        if (activeDetectionRuns.delete(runId)) {
            console.log(
                `[DETEKSI] Sesi selesai. Sisa sesi aktif: ${activeDetectionRuns.size}`
            );

        }
    }
}

bot.telegram.getMe()
.then(() => bot.launch({ dropPendingUpdates: true, allowed_updates: ['message', 'callback_query', 'chat_member', 'new_chat_members'] }))
.then(() => {})
.catch(error => {
    if (error.message.includes('409: Conflict')) console.error('409 Conflict: Bot lain sedang berjalan.');
    process.exitCode = 1;
});

process.on('exit', (code) => {
    console.log(`[PROCESS EXIT] Kode: ${code}`);
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.once('SIGINT', () => { shutdownBot('SIGINT').catch(() => {}); });
process.once('SIGTERM', () => { shutdownBot('SIGTERM').catch(() => {}); });