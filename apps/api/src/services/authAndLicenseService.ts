import crypto from 'node:crypto';

export interface LoginRequest {
  email: string;
  password: string;
  deviceHash: string; // क्लाइंट द्वारा बनाया गया privacy-preserving SHA-256 device token
  deviceLabel: string;
}

export interface DbPool {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Owner की Private Key से Offline License Token साइन करता है
 * (Private Key केवल सर्वर के Environment Variable में रहेगी, फ्रंटएंड में कभी नहीं)
 */
export function signOfflineLicenseToken(
  payload: {
    licenseId: string;
    customerId: string;
    plan: 'NORMAL' | 'PRO' | 'ULTRA';
    deviceHash: string;
    issuedAt: number;
    expiresAt: number;
    offlineGraceUntil: number;
    enabledFeatures: string[];
  },
  ownerPrivateKeyPkcs8Base64: string
) {
  const privateKeyDer = Buffer.from(ownerPrivateKeyPkcs8Base64, 'base64');
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8',
  });

  const canonicalMessage = Buffer.from(JSON.stringify(payload), 'utf-8');
  const signature = crypto.sign(null, canonicalMessage, privateKey);

  return {
    payload,
    signatureBase64: signature.toString('base64'),
  };
}

/**
 * Customer Login + 1-Device Enforcement + Legal Consent Check
 */
export async function authenticateCustomerAndIssueToken(
  db: DbPool,
  req: LoginRequest,
  ownerPrivateKeyBase64: string,
  verifyPasswordFn: (hash: string, plain: string) => Promise<boolean>
) {
  const email = req.email.trim().toLowerCase();

  // 1. कस्टमर रिकॉर्ड निकालें
  const custRes = await db.query(
    'SELECT id, email, password_hash, status FROM customers WHERE email = $1 LIMIT 1',
    [email]
  );
  const customer = custRes.rows[0];
  if (!customer) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (customer.status !== 'ACTIVE') {
    throw new Error('ACCOUNT_BLOCKED_BY_OWNER');
  }

  const passwordOk = await verifyPasswordFn(customer.password_hash, req.password);
  if (!passwordOk) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // 2. अनिवार्य Legal Consent चेक करें (Section 31)
  const consentRes = await db.query(
    `SELECT COUNT(DISTINCT document_type)::int AS count 
     FROM legal_consents 
     WHERE customer_id = $1 AND document_version = '1.0'`,
    [customer.id]
  );
  if ((consentRes.rows[0]?.count || 0) < 6) {
    return {
      requiresLegalConsent: true,
      customerId: customer.id,
    };
  }

  // 3. एक्टिव लाइसेंस चेक करें
  const licRes = await db.query(
    `SELECT id, plan_code, status, activated_at, expires_at, registered_device_hash 
     FROM licenses 
     WHERE customer_id = $1 AND status = 'ACTIVE' 
     ORDER BY created_at DESC LIMIT 1`,
    [customer.id]
  );
  const license = licRes.rows[0];
  if (!license) {
    throw new Error('NO_ACTIVE_LICENSE');
  }

  const now = new Date();
  let activatedAt = license.activated_at ? new Date(license.activated_at) : null;
  let expiresAt = license.expires_at ? new Date(license.expires_at) : null;

  // पहली बार एक्टिवेशन पर 1 साल (365 दिन) की वैलिडिटी सेट करें
  if (!activatedAt || !expiresAt) {
    activatedAt = now;
    expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE licenses 
       SET activated_at = $1, expires_at = $2, registered_device_hash = $3, device_label = $4 
       WHERE id = $5`,
      [activatedAt.toISOString(), expiresAt.toISOString(), req.deviceHash, req.deviceLabel, license.id]
    );
  } else {
    // एक्सपायरी चेक करें
    if (now > expiresAt) {
      await db.query(`UPDATE licenses SET status = 'EXPIRED' WHERE id = $1`, [license.id]);
      throw new Error('LICENSE_EXPIRED_RENEWAL_REQUIRED');
    }

    // 1 Account = 1 Approved Device चेक करें (Section 22)
    if (license.registered_device_hash && license.registered_device_hash !== req.deviceHash) {
      throw new Error('DEVICE_LIMIT_REACHED_REQUEST_OWNER_RESET');
    }

    if (!license.registered_device_hash) {
      await db.query(
        `UPDATE licenses SET registered_device_hash = $1, device_label = $2 WHERE id = $3`,
        [req.deviceHash, req.deviceLabel, license.id]
      );
    }
  }

  // 4. इस प्लान के लिए Owner द्वारा इनेबल किए गए सभी फीचर्स लाएं
  const featRes = await db.query(
    `SELECT feature_key FROM feature_flags 
     WHERE is_enabled = TRUE AND $1 = ANY(allowed_plans)`,
    [license.plan_code]
  );
  const enabledFeatures = featRes.rows.map((r) => r.feature_key);

  // 5. ऑफलाइन एडिटर के लिए 15 दिन का Controlled Offline Grace Token साइन करें
  const offlineGraceMs = Math.min(
    expiresAt.getTime(),
    now.getTime() + 15 * 24 * 60 * 60 * 1000
  );

  const signedToken = signOfflineLicenseToken(
    {
      licenseId: license.id,
      customerId: customer.id,
      plan: license.plan_code,
      deviceHash: req.deviceHash,
      issuedAt: now.getTime(),
      expiresAt: expiresAt.getTime(),
      offlineGraceUntil: offlineGraceMs,
      enabledFeatures,
    },
    ownerPrivateKeyBase64
  );

  await db.query(`UPDATE licenses SET offline_token_issued_at = NOW() WHERE id = $1`, [license.id]);

  return {
    requiresLegalConsent: false,
    signedToken,
    expiresAt: expiresAt.toISOString(),
  };
}
