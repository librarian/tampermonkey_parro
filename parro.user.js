// ==UserScript==
// @name         Make parro.com news translatable and copyable
// @namespace    local.parro.translation
// @version      0.11
// @description  Shows Parro announcements as normal HTML and translates each item inline.
// @match        https://talk.parro.com/*
// @match        https://*.parro.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      translate.googleapis.com
// @updateURL    https://github.com/librarian/tampermonkey_parro/releases/latest/download/parro.user.js
// @downloadURL  https://github.com/librarian/tampermonkey_parro/releases/latest/download/parro.user.js
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = true;

  const SOURCE_LANG = 'nl';
  const DEFAULT_TARGET_LANG = 'en';
  const TARGET_LANG_STORAGE_KEY = 'parroTargetLanguage';
  const TARGET_LANG_OPTIONS = [
    ['af', 'Afrikaans'],
    ['sq', 'Albanian'],
    ['am', 'Amharic'],
    ['ar', 'Arabic'],
    ['hy', 'Armenian'],
    ['az', 'Azerbaijani'],
    ['eu', 'Basque'],
    ['be', 'Belarusian'],
    ['bn', 'Bengali'],
    ['bs', 'Bosnian'],
    ['bg', 'Bulgarian'],
    ['ca', 'Catalan'],
    ['ceb', 'Cebuano'],
    ['ny', 'Chichewa'],
    ['zh-CN', 'Chinese (Simplified)'],
    ['zh-TW', 'Chinese (Traditional)'],
    ['co', 'Corsican'],
    ['hr', 'Croatian'],
    ['cs', 'Czech'],
    ['da', 'Danish'],
    ['nl', 'Dutch'],
    ['en', 'English'],
    ['eo', 'Esperanto'],
    ['et', 'Estonian'],
    ['tl', 'Filipino'],
    ['fi', 'Finnish'],
    ['fr', 'French'],
    ['fy', 'Frisian'],
    ['gl', 'Galician'],
    ['ka', 'Georgian'],
    ['de', 'German'],
    ['el', 'Greek'],
    ['gu', 'Gujarati'],
    ['ht', 'Haitian Creole'],
    ['ha', 'Hausa'],
    ['haw', 'Hawaiian'],
    ['iw', 'Hebrew'],
    ['hi', 'Hindi'],
    ['hmn', 'Hmong'],
    ['hu', 'Hungarian'],
    ['is', 'Icelandic'],
    ['ig', 'Igbo'],
    ['id', 'Indonesian'],
    ['ga', 'Irish'],
    ['it', 'Italian'],
    ['ja', 'Japanese'],
    ['jw', 'Javanese'],
    ['kn', 'Kannada'],
    ['kk', 'Kazakh'],
    ['km', 'Khmer'],
    ['ko', 'Korean'],
    ['ku', 'Kurdish (Kurmanji)'],
    ['ky', 'Kyrgyz'],
    ['lo', 'Lao'],
    ['la', 'Latin'],
    ['lv', 'Latvian'],
    ['lt', 'Lithuanian'],
    ['lb', 'Luxembourgish'],
    ['mk', 'Macedonian'],
    ['mg', 'Malagasy'],
    ['ms', 'Malay'],
    ['ml', 'Malayalam'],
    ['mt', 'Maltese'],
    ['mi', 'Maori'],
    ['mr', 'Marathi'],
    ['mn', 'Mongolian'],
    ['my', 'Myanmar (Burmese)'],
    ['ne', 'Nepali'],
    ['no', 'Norwegian'],
    ['or', 'Odia'],
    ['ps', 'Pashto'],
    ['fa', 'Persian'],
    ['es', 'Spanish'],
    ['pl', 'Polish'],
    ['pt', 'Portuguese'],
    ['pa', 'Punjabi'],
    ['ro', 'Romanian'],
    ['ru', 'Russian'],
    ['sm', 'Samoan'],
    ['gd', 'Scots Gaelic'],
    ['sr', 'Serbian'],
    ['st', 'Sesotho'],
    ['sn', 'Shona'],
    ['sd', 'Sindhi'],
    ['si', 'Sinhala'],
    ['sk', 'Slovak'],
    ['sl', 'Slovenian'],
    ['so', 'Somali'],
    ['su', 'Sundanese'],
    ['sw', 'Swahili'],
    ['sv', 'Swedish'],
    ['tg', 'Tajik'],
    ['ta', 'Tamil'],
    ['te', 'Telugu'],
    ['th', 'Thai'],
    ['tr', 'Turkish'],
    ['uk', 'Ukrainian'],
    ['ur', 'Urdu'],
    ['ug', 'Uyghur'],
    ['uz', 'Uzbek'],
    ['vi', 'Vietnamese'],
    ['cy', 'Welsh'],
    ['xh', 'Xhosa'],
    ['yi', 'Yiddish'],
    ['yo', 'Yoruba'],
    ['zu', 'Zulu']
  ];

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const translationCache = new Map();

  function log(...args) {
    if (DEBUG) console.log('[Parro reader]', ...args);
  }

  function warn(...args) {
    console.warn('[Parro reader]', ...args);
  }

  function getTargetLang() {
    const storedLang = GM_getValue(TARGET_LANG_STORAGE_KEY, DEFAULT_TARGET_LANG);
    const knownLang = TARGET_LANG_OPTIONS.some(([code]) => code === storedLang);

    return knownLang ? storedLang : DEFAULT_TARGET_LANG;
  }

  function getTargetLangLabel(lang = getTargetLang()) {
    return TARGET_LANG_OPTIONS.find(([code]) => code === lang)?.[1] || lang;
  }

  function setTargetLang(lang) {
    GM_setValue(TARGET_LANG_STORAGE_KEY, lang);
    translationCache.clear();
  }

  function isAnnouncementEventUrl(url) {
    url = String(url || '');
    return (
      url.includes('/rest/v2/event') &&
      url.includes('RAnnouncementEventPrimer')
    );
  }

  function stripHtml(value) {
    if (!value || typeof value !== 'string') return '';

    const doc = new DOMParser().parseFromString(value, 'text/html');

    return (doc.body.textContent || value)
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .trim();
  }

  function normalizeAnnouncements(data) {
    if (!data) return [];

    const rawItems = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [data];

    const items = rawItems
      .map(item => {
        if (!item || typeof item !== 'object') return null;

        const id =
          item.id ||
          item.eventId ||
          item.links?.find?.(link => link.rel === 'self')?.id ||
          item.links?.[0]?.id ||
          '';

        const title = stripHtml(item.title || item.subject || '');

        const contents = stripHtml(
          item.contents ||
          item.content ||
          item.body ||
          item.message ||
          item.description ||
          ''
        );

        const createdAt =
          item.createdAt ||
          item.sortDate ||
          item.lastModifiedAt ||
          '';

        if (!title && !contents) return null;

        return {
          id,
          title: title || '(no title)',
          contents,
          createdAt,
          read: item.read,
          liked: item.liked
        };
      })
      .filter(Boolean);

    const seen = new Set();

    return items.filter(item => {
      const key = `${item.id}|${item.title}|${item.contents.slice(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function formatDate(value) {
    if (!value) return '';

    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function buildItemText(item) {
    return [
      item.title,
      item.createdAt ? `Date: ${formatDate(item.createdAt)}` : '',
      '',
      item.contents || ''
    ].filter(Boolean).join('\n');
  }

  function buildPlainText(items) {
    return items.map((item, index) => {
      return [
        `# ${index + 1}. ${item.title}`,
        item.createdAt ? `Date: ${formatDate(item.createdAt)}` : '',
        '',
        item.contents || ''
      ].filter(Boolean).join('\n');
    }).join('\n\n====================\n\n');
  }

  function openGoogleTranslate(text) {
    const limitedText = String(text || '').slice(0, 4500);
    const targetLang = getTargetLang();

    const translateUrl =
      'https://translate.google.com/?sl=' +
      encodeURIComponent(SOURCE_LANG) +
      '&tl=' +
      encodeURIComponent(targetLang) +
      '&op=translate&text=' +
      encodeURIComponent(limitedText);

    window.open(translateUrl, '_blank', 'noopener,noreferrer');
  }

  function chunkText(text, maxLength = 1200) {
    text = String(text || '');

    if (text.length <= maxLength) return [text];

    const chunks = [];
    let current = '';

    const parts = text.split(/(\n\n|\n|\. |\! |\? )/);

    for (const part of parts) {
      if ((current + part).length > maxLength && current.trim()) {
        chunks.push(current);
        current = part;
      } else {
        current += part;
      }
    }

    if (current.trim()) chunks.push(current);

    return chunks;
  }

  function translateChunk(text) {
    const targetLang = getTargetLang();
    const cacheKey = `${SOURCE_LANG}:${targetLang}:${text}`;

    if (translationCache.has(cacheKey)) {
      return Promise.resolve(translationCache.get(cacheKey));
    }

    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx' +
      '&sl=' + encodeURIComponent(SOURCE_LANG) +
      '&tl=' + encodeURIComponent(targetLang) +
      '&dt=t&q=' + encodeURIComponent(text);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: response => {
          try {
            const json = JSON.parse(response.responseText);

            const translated = Array.isArray(json?.[0])
              ? json[0].map(part => part[0]).join('')
              : '';

            if (!translated) {
              reject(new Error('Empty translation response'));
              return;
            }

            translationCache.set(cacheKey, translated);
            resolve(translated);
          } catch (err) {
            reject(err);
          }
        },
        onerror: reject,
        ontimeout: reject,
        timeout: 15000
      });
    });
  }

  async function translateText(text) {
    const chunks = chunkText(text);
    const translatedChunks = [];

    for (const chunk of chunks) {
      translatedChunks.push(await translateChunk(chunk));
    }

    return translatedChunks.join('');
  }

  async function translateItem(item) {
    const [translatedTitle, translatedContents] = await Promise.all([
      translateText(item.title || ''),
      translateText(item.contents || '')
    ]);

    return {
      title: translatedTitle,
      contents: translatedContents
    };
  }

  function ensureBody(callback) {
    if (document.body) {
      callback();
      return;
    }

    window.addEventListener('DOMContentLoaded', callback, { once: true });
  }

  function renderPanelFromData(data, url) {
    const items = normalizeAnnouncements(data);

    if (!items.length) {
      log('No announcement items found in response', data);
      return;
    }

    pageWindow.__lastParroAnnouncementItems = items;
    pageWindow.__lastParroAnnouncementJson = data;

    ensureBody(() => renderPanel(items, url));
  }

  function renderPanel(items, sourceUrl) {
    document.getElementById('parro-readable-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'parro-readable-panel';
    panel.setAttribute('lang', SOURCE_LANG);
    panel.setAttribute('translate', 'yes');

    panel.style.cssText = `
      position: fixed;
      right: 12px;
      top: 12px;
      width: 560px;
      max-width: calc(100vw - 24px);
      max-height: 85vh;
      overflow: auto;
      background: white;
      color: black;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,.25);
      z-index: 2147483647;
      font-family: Arial, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      padding: 12px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      position: sticky;
      top: -12px;
      background: white;
      border-bottom: 1px solid #ddd;
      padding-bottom: 8px;
      margin-bottom: 10px;
      z-index: 1;
    `;

    const titleRow = document.createElement('div');
    titleRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    `;

    const heading = document.createElement('h2');
    heading.textContent = `Parro announcements (${items.length})`;
    heading.style.cssText = 'margin:0; font-size:18px;';

    const close = document.createElement('button');
    close.textContent = 'Close';
    close.onclick = () => panel.remove();

    titleRow.append(heading, close);

    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    `;

    const copyAll = document.createElement('button');
    copyAll.textContent = 'Copy all';
    copyAll.onclick = async () => {
      const text = buildPlainText(items);

      try {
        await navigator.clipboard.writeText(text);
        copyAll.textContent = 'Copied';
        setTimeout(() => copyAll.textContent = 'Copy all', 1200);
      } catch (err) {
        warn('Clipboard failed. Plain text:', text);
        copyAll.textContent = 'Copy failed — see console';
        setTimeout(() => copyAll.textContent = 'Copy all', 1800);
      }
    };

    const openAllExternal = document.createElement('button');
    openAllExternal.textContent = 'Open all in Google Translate';
    openAllExternal.onclick = () => openGoogleTranslate(buildPlainText(items));

    const hideRead = document.createElement('button');
    hideRead.textContent = 'Hide read';
    hideRead.onclick = () => {
      panel.querySelectorAll('[data-parro-read="true"]').forEach(el => {
        el.hidden = !el.hidden;
      });

      hideRead.textContent =
        hideRead.textContent === 'Hide read' ? 'Show read' : 'Hide read';
    };

    toolbar.append(copyAll, openAllExternal, hideRead);

    const settings = document.createElement('label');
    settings.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #555;
      font-size: 12px;
      margin-top: 8px;
    `;

    const targetLangSelect = document.createElement('select');
    targetLangSelect.setAttribute('aria-label', 'Translation language');
    targetLangSelect.style.cssText = 'font-size:12px;';

    for (const [code, label] of TARGET_LANG_OPTIONS) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = `${label} (${code.toUpperCase()})`;
      targetLangSelect.append(option);
    }

    targetLangSelect.value = getTargetLang();
    targetLangSelect.onchange = () => {
      setTargetLang(targetLangSelect.value);
      document.getElementById('parro-readable-panel')?.remove();
      renderPanel(items, sourceUrl);
    };

    settings.append('Translate to', targetLangSelect);

    const hint = document.createElement('div');
    hint.textContent =
      `Use “Translate here” to show ${getTargetLangLabel()} text below the Dutch original.`;
    hint.style.cssText = 'color:#555; font-size:12px; margin-top:6px;';

    header.append(titleRow, toolbar, settings, hint);
    panel.append(header);

    for (const item of items) {
      const article = document.createElement('article');
      article.dataset.parroRead = String(item.read === true);

      article.style.cssText = `
        border-top: 1px solid #ddd;
        padding-top: 10px;
        margin-top: 10px;
      `;

      const itemToolbar = document.createElement('div');
      itemToolbar.style.cssText = `
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      `;

      const translateHere = document.createElement('button');
      translateHere.textContent = 'Translate here';

      const replaceWithTranslation = document.createElement('button');
      replaceWithTranslation.textContent = 'Replace with translation';

      const openTranslate = document.createElement('button');
      openTranslate.textContent = 'Open in Google Translate';
      openTranslate.onclick = () => openGoogleTranslate(buildItemText(item));

      const copyOne = document.createElement('button');
      copyOne.textContent = 'Copy this';
      copyOne.onclick = async () => {
        const text = buildItemText(item);

        try {
          await navigator.clipboard.writeText(text);
          copyOne.textContent = 'Copied';
          setTimeout(() => copyOne.textContent = 'Copy this', 1200);
        } catch (err) {
          warn('Clipboard failed. Item text:', text);
        }
      };

      itemToolbar.append(
        translateHere,
        replaceWithTranslation,
        openTranslate,
        copyOne
      );

      const itemTitle = document.createElement('h3');
      itemTitle.textContent = item.title;
      itemTitle.style.cssText = 'font-size:16px; margin:0 0 6px 0;';

      const meta = document.createElement('div');
      meta.textContent = [
        item.createdAt ? formatDate(item.createdAt) : '',
        item.read === true ? 'read' : '',
        item.liked === true ? 'liked' : ''
      ].filter(Boolean).join(' · ');

      meta.style.cssText = 'color:#666; font-size:12px; margin-bottom:6px;';

      const contents = document.createElement('div');
      contents.textContent = item.contents || '';
      contents.style.cssText = 'white-space:pre-wrap;';

      const translationBox = document.createElement('div');
      translationBox.hidden = true;
      translationBox.setAttribute('lang', getTargetLang());
      translationBox.setAttribute('translate', 'no');
      translationBox.style.cssText = `
        margin-top: 10px;
        padding: 10px;
        background: #f5f5f5;
        border-left: 4px solid #999;
        white-space: pre-wrap;
      `;

      const translationHeading = document.createElement('strong');
      translationHeading.textContent =
        `Translation (${getTargetLangLabel()} / ${getTargetLang().toUpperCase()})`;
      translationHeading.style.cssText = 'display:block; margin-bottom:6px;';

      const translatedTitle = document.createElement('div');
      translatedTitle.style.cssText = 'font-weight:bold; margin-bottom:6px;';

      const translatedContents = document.createElement('div');
      translatedContents.style.cssText = 'white-space:pre-wrap;';

      translationBox.append(
        translationHeading,
        translatedTitle,
        translatedContents
      );

      let translationPromise = null;
      let translationPromiseLang = null;
      const originalTitle = item.title;
      const originalContents = item.contents;
      let isReplaced = false;

      async function getTranslation() {
        const targetLang = getTargetLang();

        if (!translationPromise || translationPromiseLang !== targetLang) {
          translationPromiseLang = targetLang;
          translationPromise = translateItem(item);
        }

        return translationPromise;
      }

      translateHere.onclick = async () => {
        try {
          translateHere.disabled = true;
          translateHere.textContent = 'Translating...';

          const translated = await getTranslation();

          translatedTitle.textContent = translated.title;
          translatedContents.textContent = translated.contents;
          translationBox.hidden = false;

          translateHere.textContent = 'Translated here';
        } catch (err) {
          warn('Translation failed', err);
          translateHere.textContent = 'Translation failed';
          setTimeout(() => {
            translateHere.disabled = false;
            translateHere.textContent = 'Translate here';
          }, 1800);
        }
      };

      replaceWithTranslation.onclick = async () => {
        try {
          replaceWithTranslation.disabled = true;

          if (isReplaced) {
            itemTitle.textContent = originalTitle;
            contents.textContent = originalContents;
            replaceWithTranslation.textContent = 'Replace with translation';
            replaceWithTranslation.disabled = false;
            isReplaced = false;
            return;
          }

          replaceWithTranslation.textContent = 'Translating...';

          const translated = await getTranslation();

          itemTitle.textContent = translated.title;
          contents.textContent = translated.contents;

          replaceWithTranslation.textContent = 'Show original';
          replaceWithTranslation.disabled = false;
          isReplaced = true;
        } catch (err) {
          warn('Translation failed', err);
          replaceWithTranslation.textContent = 'Translation failed';
          setTimeout(() => {
            replaceWithTranslation.disabled = false;
            replaceWithTranslation.textContent = 'Replace with translation';
          }, 1800);
        }
      };

      article.append(
        itemToolbar,
        itemTitle,
        meta,
        contents,
        translationBox
      );

      panel.append(article);
    }

    document.body.appendChild(panel);

    log(`Rendered ${items.length} announcements`, sourceUrl);
  }

  function parseBodyText(text, url, status, kind) {
    if (!text) return;

    try {
      const data = JSON.parse(text);
      log(`${kind} matched`, { status, url, data });
      renderPanelFromData(data, url);
    } catch (err) {
      warn(`${kind} response was not JSON`, {
        status,
        url,
        preview: String(text || '').slice(0, 500),
        err
      });
    }
  }

  function decodeArrayBuffer(buffer) {
    try {
      return new TextDecoder('utf-8').decode(buffer);
    } catch (err) {
      warn('Could not decode arraybuffer', err);
      return '';
    }
  }

  function installNetworkHooks() {
    if (pageWindow.__parroAnnouncementReaderInstalled) {
      log('Already installed');
      return;
    }

    pageWindow.__parroAnnouncementReaderInstalled = true;

    const originalFetch = pageWindow.fetch;

    if (typeof originalFetch === 'function') {
      pageWindow.fetch = async function (...args) {
        const input = args[0];
        const url = typeof input === 'string' ? input : input?.url;

        const response = await originalFetch.apply(this, args);
        const responseUrl = response.url || url;

        if (isAnnouncementEventUrl(responseUrl)) {
          log('fetch matched', responseUrl);

          response.clone().text()
            .then(text => parseBodyText(text, responseUrl, response.status, 'fetch'))
            .catch(err => warn('Could not read fetch response', err));
        }

        return response;
      };
    }

    const originalOpen = pageWindow.XMLHttpRequest.prototype.open;
    const originalSend = pageWindow.XMLHttpRequest.prototype.send;

    pageWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__parroReaderUrl = url;
      this.__parroReaderMethod = method;
      return originalOpen.call(this, method, url, ...rest);
    };

    pageWindow.XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', function () {
        const url = this.__parroReaderUrl;

        if (!isAnnouncementEventUrl(url)) return;

        try {
          log('xhr matched', {
            status: this.status,
            responseType: this.responseType,
            url
          });

          if (this.responseType === 'arraybuffer') {
            const text = decodeArrayBuffer(this.response);
            parseBodyText(text, url, this.status, 'xhr-arraybuffer');
            return;
          }

          if (this.responseType === 'json') {
            renderPanelFromData(this.response, url);
            return;
          }

          if (this.responseType === 'blob') {
            this.response.text()
              .then(text => parseBodyText(text, url, this.status, 'xhr-blob'))
              .catch(err => warn('Could not read blob response', err));
            return;
          }

          if (this.responseType === '' || this.responseType === 'text') {
            parseBodyText(this.responseText || '', url, this.status, 'xhr-text');
            return;
          }

          warn('Unsupported XHR responseType', this.responseType);
        } catch (err) {
          warn('Failed to process XHR response', err);
        }
      });

      return originalSend.apply(this, args);
    };

    log('Installed fetch + XHR hooks');
  }

  installNetworkHooks();

  pageWindow.__renderLastParroAnnouncements = function () {
    if (pageWindow.__lastParroAnnouncementJson) {
      renderPanelFromData(pageWindow.__lastParroAnnouncementJson, 'manual');
      return;
    }

    if (pageWindow.__lastParroAnnouncementItems) {
      renderPanel(pageWindow.__lastParroAnnouncementItems, 'manual');
      return;
    }

    warn('No captured Parro announcements yet. Open/reopen the announcements page.');
  };
})();
