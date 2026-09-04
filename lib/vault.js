export class VaultManager {
  // Predefined vault keys for common form fields
  static KEYS = Object.freeze({
    FULL_NAME: 'full_name',
    FIRST_NAME: 'first_name', 
    LAST_NAME: 'last_name',
    EMAIL: 'email',
    PHONE: 'phone',
    ADDRESS: 'address',
    CITY: 'city',
    STATE: 'state',
    PINCODE: 'pincode',
    DOB: 'dob',
    GENDER: 'gender',
  });

  constructor() {
    this.cache = new Map();
  }

  /**
   * Loads vault from chrome.storage.local
   */
  async initialize() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['lensagent_vault'], (result) => {
        const vaultData = result.lensagent_vault || {};
        this.cache.clear();
        for (const [key, value] of Object.entries(vaultData)) {
          this.cache.set(key, value);
        }
        console.log('[VaultManager] Initialized with', this.cache.size, 'keys');
        resolve();
      });
    });
  }

  /**
   * Returns the real value for a key
   * @param {string} key
   */
  async getEntry(key) {
    return this.cache.get(key);
  }

  /**
   * Saves a key-value pair 
   * @param {string} key
   * @param {string} value
   */
  async setEntry(key, value) {
    this.cache.set(key, value);
    await this._saveToStorage();
    console.log(`[VaultManager] Saved entry for key: ${key}`);
  }

  /**
   * Deletes a key
   * @param {string} key
   */
  async removeEntry(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      await this._saveToStorage();
      console.log(`[VaultManager] Removed entry for key: ${key}`);
    }
  }

  /**
   * Returns all key-value pairs (for UI display)
   */
  async getAllEntries() {
    return Object.fromEntries(this.cache.entries());
  }

  /**
   * Returns boolean
   * @param {string} key
   */
  async hasEntry(key) {
    return this.cache.has(key);
  }
  
  /**
   * Replaces all <VAULT_*> tokens in a string with real values from the vault cache
   * e.g. detokenize('Hello <VAULT_FULL_NAME>') → 'Hello John Doe'
   * @param {string} text
   */
  detokenize(text) {
    if (typeof text !== 'string') return text;
    
    return text.replace(/<VAULT_([A-Z0-9_]+)>/gi, (match, tokenName) => {
      const searchKey = tokenName.toLowerCase();
      if (this.cache.has(searchKey)) {
        return this.cache.get(searchKey);
      }
      return match;
    });
  }
  
  /**
   * Returns array of token strings the AI can use
   * e.g. ['<VAULT_FULL_NAME>', '<VAULT_EMAIL>']
   */
  getAvailableTokens() {
    return Array.from(this.cache.keys()).map(key => `<VAULT_${key.toUpperCase()}>`);
  }
  
  /**
   * Clears entire vault (used on session end or uninstall)
   */
  async flush() {
    this.cache.clear();
    await new Promise((resolve) => {
      chrome.storage.local.remove(['lensagent_vault'], () => {
        console.log('[VaultManager] Flushed vault');
        resolve();
      });
    });
  }
  
  /**
   * Saves a new entry with a custom key
   * @param {string} key
   * @param {string} value
   */
  async learnEntry(key, value) {
    await this.setEntry(key, value);
  }

  async _saveToStorage() {
    const dataToSave = Object.fromEntries(this.cache.entries());
    return new Promise((resolve) => {
      chrome.storage.local.set({ lensagent_vault: dataToSave }, () => {
        resolve();
      });
    });
  }
}
