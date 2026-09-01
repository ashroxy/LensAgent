/**
 * ============================================================================
 * ISRO PS 171 - PII Tokenization Vault & Detokenization Engine (Session-Scoped)
 * Module: vault_manager.js
 * ============================================================================
 *
 * INTEGRATION NOTE (Member 1):
 *   - This vault is SESSION-SCOPED and IN-RAM only.
 *   - It tokenizes PII observed on the page OUTBOUND to the LLM.
 *     Token format: [SYS_PAN_01]
 *   - This is DISTINCT from lib/vault.js (chrome.storage, user identity, INBOUND).
 *     Token format: <VAULT_EMAIL>
 *   - The two vaults NEVER collide - different prefixes, different scopes.
 */

export class SessionVaultManager {
  constructor(options = {}) {
    this.options = {
      contextWindowChars: options.contextWindowChars || 50,
      confidenceThreshold: options.confidenceThreshold || 0.65,
      aliasPrefix: options.aliasPrefix || 'SYS',
      ...options
    };
    this.vault = new Map();
    this.reverseVault = new Map();
    this.counters = new Map();
    this.contextDictionary = {
      PAN:             { positive: ['pan','tax','income','permanent account','nsdl','utitsl','father','assesse','tin'], negative: ['item','sku','serial','model','product','tracking','order','part no','build'] },
      AADHAAR:         { positive: ['aadhaar','uidai','uid','identity','citizen','enrollment','resident','biometric','vid'], negative: ['serial','tracking','transaction','barcode','invoice','code','ref','account no'] },
      CREDITCARD:      { positive: ['card','visa','mastercard','amex','rupay','cvv','cvc','expiry','exp','debit','credit','payment','bank'], negative: ['item id','serial','tracking','order id','sku','vin','mac','isbn','shipment'] },
      INDIANPHONE:     { positive: ['phone','mobile','call','contact','tel','cell','whatsapp','sms','otp to','dial'], negative: ['serial','timestamp','date','order','amount','pin code','zip','qty'] },
      PASSWORD:        { positive: ['password','pwd','passcode','secret','credentials','pin','login','token','auth','key'], negative: ['license key','version','hash','public'] },
      EMAIL:           { positive: ['email','mail','contact','inbox','address','send to','recipient'], negative: ['example.com','test.com','domain'] },
      UPIID:           { positive: ['upi','vpa','paytm','gpay','phonepe','bhim','payment','transfer'], negative: ['domain','server'] },
      PERSON_NER:      { positive: ['dr','prof','mr','mrs','ms','shri','smt','scientist','director','commander','name','officer'], negative: ['file','class','function','variable'] },
      CONFIDENTIAL_NER:{ positive: ['isro','drdo','secret','confidential','restricted','classified','defense','mission'], negative: ['public','open-source'] }
    };
  }

  analyzeContext(fullText, matchIndex, matchLength, category) {
    if (!fullText || typeof fullText !== 'string' || matchIndex < 0)
      return { confidence: 0.5, shouldTokenize: true, contextSnippet: '', matchedKeywords: [] };
    const windowSize = this.options.contextWindowChars;
    const start = Math.max(0, matchIndex - windowSize);
    const end = Math.min(fullText.length, matchIndex + matchLength + windowSize);
    const windowText = fullText.slice(start, end).toLowerCase();
    const catKey = category.toUpperCase();
    const dict = this.contextDictionary[catKey] || { positive: [], negative: [] };
    let score = 0.50;
    const matchedPositive = [], matchedNegative = [];
    for (const neg of dict.negative) { if (windowText.includes(neg)) { matchedNegative.push(neg); score -= 0.35; } }
    for (const pos of dict.positive) { if (windowText.includes(pos)) { matchedPositive.push(pos); score += 0.25; } }
    const finalConfidence = Math.max(0.01, Math.min(0.99, parseFloat(score.toFixed(2))));
    return { confidence: finalConfidence, shouldTokenize: finalConfidence >= this.options.confidenceThreshold, matchedPositive, matchedNegative, contextSnippet: fullText.slice(start, end).replace(/\s+/g, ' ').trim() };
  }

  tokenize(rawSecret, category = 'SECRET') {
    if (!rawSecret || typeof rawSecret !== 'string') return rawSecret;
    const trimmed = rawSecret.trim();
    if (!trimmed) return rawSecret;
    if (this.reverseVault.has(trimmed)) return this.reverseVault.get(trimmed);
    const catKey = category.toUpperCase();
    const currentCount = (this.counters.get(catKey) || 0) + 1;
    this.counters.set(catKey, currentCount);
    const pad = currentCount < 10 ? `0${currentCount}` : `${currentCount}`;
    const alias = `[${this.options.aliasPrefix}_${catKey}_${pad}]`;
    this.vault.set(alias, trimmed);
    this.reverseVault.set(trimmed, alias);
    return alias;
  }

  tokenizeText(text, patternMap) {
    if (!text || typeof text !== 'string') return text;
    let sanitized = text;
    for (const [category, regex] of Object.entries(patternMap)) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(sanitized)) !== null) {
        const matchedSecret = match[0];
        const matchIndex = match.index;
        const ctx = this.analyzeContext(sanitized, matchIndex, matchedSecret.length, category);
        if (ctx.shouldTokenize) {
          const alias = this.tokenize(matchedSecret, category);
          sanitized = sanitized.slice(0, matchIndex) + alias + sanitized.slice(matchIndex + matchedSecret.length);
          regex.lastIndex = matchIndex + alias.length;
        } else {
          regex.lastIndex = matchIndex + matchedSecret.length;
        }
      }
    }
    return sanitized;
  }

  detokenize(input) {
    if (!input || typeof input !== 'string') return input;
    if (this.vault.has(input)) return this.vault.get(input);
    return input.replace(/\[SYS_[A-Z0-9_]+\]/g, (m) => this.vault.has(m) ? this.vault.get(m) : m);
  }

  /**
   * Gets available key names from the vault (for backend available_keys field)
   * @returns {string[]} Array of key names (not values)
   */
  getAvailableKeyNames() {
    // Return just the key names (e.g., ["EMAIL", "PAN", "PHONE"])
    // These are stored in the vault entries as the original category names
    const keyNames = new Set();
    for (const [alias, secret] of this.vault.entries()) {
      // Extract key name from alias like [SYS_EMAIL_01] -> EMAIL
      const match = alias.match(/\[SYS_([A-Z]+)_\d+\]/);
      if (match) {
        keyNames.add(match[1]); // Return just the category (EMAIL, PAN, etc.)
      } else {
        // Fallback: use the secret itself as key (not ideal but functional)
        keyNames.add(secret);
      }
    }
    return Array.from(keyNames);
  }

  hasAlias(alias) { return this.vault.has(alias); }
  getVaultSize() { return this.vault.size; }

  flushVault() {
    const clearedItemsCount = this.vault.size;
    for (const [alias, secret] of this.vault.entries()) this.vault.set(alias, '\0'.repeat(secret.length));
    for (const [secret, alias] of this.reverseVault.entries()) this.reverseVault.set(secret, '\0'.repeat(alias.length));
    this.vault.clear(); this.reverseVault.clear(); this.counters.clear();
    return { status: 'FLUSHED_SUCCESSFULLY', clearedItemsCount, activeVaultSize: 0, timestamp: new Date().toISOString() };
  }
}
