/* Interface locale and translations for the offline and hosted builds. */
(function (root) {
'use strict';

const dictionaries = /*__LOCALE_DICTIONARIES__*/ {};
const editionLabels = /*__EDITION_LABELS__*/ {};
const locales = root.ParaLabRomLocale.LOCALES.flatMap(entry =>
  entry[0] === 'zh-Hans' ? [entry, ['zh-Hant', '繁體中文']] : [entry]);
const supported = new Set(locales.map(([code]) => code));
const preferenceKey = 'paralab.language';
const picker = document.getElementById('interfaceLanguage');

function matchLocale(value) {
  const parts = String(value || '').toLowerCase().split(/[-_]/);
  const language = parts[0];
  if (language === 'zh') {
    if (parts.includes('hans')) return 'zh-Hans';
    if (parts.some(part => ['hant', 'tw', 'hk', 'mo'].includes(part))) return 'zh-Hant';
    return 'zh-Hans';
  }
  return supported.has(language) ? language : null;
}

function initialLocale() {
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (supported.has(saved)) return saved;
  } catch (_) { /* The page also works when browser storage is disabled. */ }
  return (navigator.languages?.length ? navigator.languages : [navigator.language])
    .map(matchLocale).find(Boolean) || 'en';
}

let locale = initialLocale();
for (const [code, autonym] of locales) {
  const option = new Option(autonym, code);
  option.lang = code;
  picker.add(option);
}
picker.value = locale;

const editionTokens = {
  editionParadise: 'paradise',
  editionMyLab: 'my-lab',
  editionNeon: 'neon',
};

function message(key, english = key, variables) {
  const dictionary = dictionaries[locale];
  const value = (dictionary && Object.hasOwn(dictionary, key) && dictionary[key]) || english;
  return value.replace(/\{([\w]+)\}/g, (token, name) => {
    if (variables && Object.hasOwn(variables, name)) return String(variables[name]);
    return Object.hasOwn(editionTokens, name) ? edition(editionTokens[name]) : token;
  });
}

function edition(key) {
  if (key === 'tropical-glacier') return [edition('tropics'), edition('glacier')].join(' / ');
  return editionLabels[locale]?.[key] || editionLabels.en?.[key];
}

function sourceKey(source) {
  return source.trim().replace(/\s+/g, ' ');
}

const eastAsianCharacter = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const closingPunctuation = /^[、。！，．？；：）」』】》〉]/u;
const trailingPunctuation = /[、。！，．？；：（「『【《〈]$/u;
const inlineTags = new Set(['A', 'ABBR', 'B', 'CODE', 'EM', 'I', 'KBD', 'MARK', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'U']);

function inlineText(node, direction) {
  for (let sibling = node[direction]; sibling; sibling = sibling[direction]) {
    if (sibling.nodeType === Node.ELEMENT_NODE && !inlineTags.has(sibling.tagName) &&
        !sibling.classList.contains('text-action')) return '';
    if (sibling.nodeType === Node.ELEMENT_NODE || sibling.nodeType === Node.TEXT_NODE) {
      const text = sibling.textContent.trim();
      if (text) return text;
    }
  }
  return '';
}

function joinsWithoutSpace(left, right) {
  return !!left && !!right && (trailingPunctuation.test(left) || closingPunctuation.test(right) ||
    (eastAsianCharacter.test(left.at(-1)) && eastAsianCharacter.test(right[0])));
}

function compactInlineSpacing(node, value) {
  const text = value.trim();
  if (!text) {
    return joinsWithoutSpace(inlineText(node, 'previousSibling'), inlineText(node, 'nextSibling')) ? '' : value;
  }
  if (/^\s/u.test(value) && joinsWithoutSpace(inlineText(node, 'previousSibling'), text)) value = value.trimStart();
  if (/\s$/u.test(value) && joinsWithoutSpace(text, inlineText(node, 'nextSibling'))) value = value.trimEnd();
  return value;
}

function bindSentences() {
  const sentences = Array.from(document.querySelectorAll('[data-sentence]'), element => ({
    element,
    original: Array.from(element.childNodes),
    parts: new Map(Array.from(element.children, node => [node.dataset.sentencePart, node])),
    current: null,
  }));
  return () => {
    for (const sentence of sentences) {
      const { element, original, parts } = sentence;
      const translation = message(element.dataset.sentence, '');
      if (translation === sentence.current) continue;
      const tokens = translation.split(/\{([\w]+)\}/g);
      const keys = tokens.filter((_, index) => index % 2);
      const valid = keys.length === parts.size && new Set(keys).size === parts.size &&
        keys.every(key => parts.has(key));
      element.replaceChildren(...(valid ? tokens.map((token, index) =>
        index % 2 ? parts.get(token) : token) : original));
      sentence.current = translation;
    }
  };
}

// Bind the original markup once. Dynamic content uses explicit message calls,
// so names, file paths and diagnostics cannot be mistaken for interface copy.
function bindMarkup(scope) {
  const bindings = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return node.nodeType === Node.ELEMENT_NODE && ['SCRIPT', 'STYLE'].includes(node.tagName)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('[translate="no"], [data-edition-label], [data-rom-field]')) continue;
      const original = node.data, key = sourceKey(original);
      if (node.parentElement?.matches('[data-t], [data-sentence]') || node.parentElement?.closest('[data-rom-term]') ||
          (key ? !/[a-z]{2}/i.test(key) : !node.previousSibling || !node.nextSibling)) continue;
      const before = original.match(/^\s*/)[0], after = original.match(/\s*$/)[0];
      bindings.push({
        read: () => node.data, write: value => { node.data = value; }, original, node,
        translate: () => {
          const localized = message(key);
          return localized === key ? original : before + localized + after;
        },
      });
    } else {
      for (const attribute of ['aria-label', 'title', 'alt', 'placeholder', 'label']) {
        const original = node.getAttribute(attribute);
        if (!original) continue;
        bindings.push({
          read: () => node.getAttribute(attribute),
          write: value => node.setAttribute(attribute, value),
          original, translate: () => message(sourceKey(original), original),
        });
      }
    }
  }
  return () => {
    const compact = locale === 'zh-Hant' || locale === 'zh-Hans' || locale === 'ja';
    const inline = [];
    for (const binding of bindings) {
      const current = binding.read();
      if (current !== (binding.last ?? binding.original)) continue;
      const value = binding.translate();
      if (current !== value) binding.write(value);
      binding.last = value;
      if (compact && binding.node && /^\s|\s$/u.test(value)) inline.push(binding);
    }
    // Wait for neighboring inline labels to be translated before joining their text.
    for (const binding of inline) {
      const value = compactInlineSpacing(binding.node, binding.last);
      if (value !== binding.last) binding.write(value);
      binding.last = value;
    }
  };
}
const applyPage = bindMarkup(document.body);
const applySentences = bindSentences();
const applyTemplate = bindMarkup(document.getElementById('labItemsTemplate').content);

const editionElements = document.querySelectorAll('[data-edition-label]');
function applyMarkup() {
  document.documentElement.lang = locale;
  for (const element of editionElements) {
    const name = edition(element.dataset.editionLabel);
    if (name) element.textContent = name;
  }
  applyPage();
  applySentences();
  applyTemplate();
}

function onChange(callback) {
  picker.addEventListener('change', () => {
    if (!supported.has(picker.value) || picker.value === locale) return;
    locale = picker.value;
    try { localStorage.setItem(preferenceKey, locale); } catch (_) { /* Storage may be disabled. */ }
    callback();
  });
}

applyMarkup();
root.ParaLabI18n = { get locale() { return locale; }, message, edition, applyMarkup, onChange };
})(window);
