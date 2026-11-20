/**
 * Fixzology AI Studio - Single-Device & Offline License Manager
 * Uses WebCrypto SHA-256 device fingerprint (privacy-preserving) and 1-year validity calculation.
 */
export class LicenseManager {
  static STORAGE_KEY = 'fxz_license_record_v1';
  static DEVICE_KEY = 'fxz_device_id_v1';

  static async getDeviceFingerprint() {
    let rawId = localStorage.getItem(this.DEVICE_KEY);
    if (!rawId) {
      rawId = crypto.randomUUID() + '|' + navigator.platform + '|' + screen.width + 'x' + screen.height;
      localStorage.setItem(this.DEVICE_KEY, rawId);
    }
    const encoded = new TextEncoder().encode(rawId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 24);
  }

  static getSavedLicense() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  static async activateLicense({ email, licenseKey, plan = 'PRO', isOwner = false }) {
    const deviceHash = await this.getDeviceFingerprint();
    const existing = this.getSavedLicense();

    // Enforce single-device rule if already bound to another device hash
    if (existing && existing.licenseKey === licenseKey && existing.deviceHash !== deviceHash && !isOwner) {
      throw new Error('This license is already bound to another device. Contact Owner for device reset.');
    }

    const now = Date.now();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    const record = {
      email: email.trim().toLowerCase(),
      licenseKey: licenseKey.trim().toUpperCase(),
      plan: isOwner ? 'OWNER_LIFETIME' : plan,
      isOwner,
      deviceHash,
      activatedAt: now,
      expiresAt: isOwner ? null : now + oneYearMs,
      status: 'ACTIVE'
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(record));
    return record;
  }

  static async validateCurrentSession() {
    const record = this.getSavedLicense();
    if (!record) return { valid: false, reason: 'NO_LICENSE' };
    if (record.status !== 'ACTIVE') return { valid: false, reason: 'LICENSE_BLOCKED' };

    const currentDevice = await this.getDeviceFingerprint();
    if (record.deviceHash !== currentDevice) {
      return { valid: false, reason: 'DEVICE_MISMATCH' };
    }

    if (!record.isOwner && record.expiresAt && Date.now() > record.expiresAt) {
      return { valid: false, reason: 'LICENSE_EXPIRED' };
    }

    return { valid: true, record };
  }

  static logout() {
    // Keeps device binding intact; clears active session flag
    sessionStorage.removeItem('fxz_session_unlocked');
  }
}