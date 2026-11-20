import crypto from 'node:crypto';
import { DbPool } from './authAndLicenseService';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

/**
 * Step 1: ग्राहक द्वारा चुने गए प्लान (NORMAL/PRO/ULTRA) के लिए सर्वर पर Razorpay Order बनाता है
 */
export async function createPlanOrder(
  db: DbPool,
  rzp: RazorpayConfig,
  customerId: string,
  planCode: 'NORMAL' | 'PRO' | 'ULTRA'
) {
  const planRes = await db.query(
    'SELECT code, display_name, price_inr, is_active FROM plans WHERE code = $1',
    [planCode]
  );
  const plan = planRes.rows[0];
  if (!plan || !plan.is_active) {
    throw new Error('SELECTED_PLAN_UNAVAILABLE');
  }

  const authHeader = Buffer.from(`${rzp.keyId}:${rzp.keySecret}`).toString('base64');
  const orderResp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: plan.price_inr, // Paise में
      currency: 'INR',
      receipt: `fxz_${Date.now()}`,
      notes: { customerId, planCode },
    }),
  });

  if (!orderResp.ok) {
    throw new Error('RAZORPAY_ORDER_CREATION_FAILED');
  }

  const orderData = await orderResp.json();

  await db.query(
    `INSERT INTO payments (customer_id, plan_code, gateway, gateway_order_id, amount_paise, currency, status)
     VALUES ($1, $2, 'RAZORPAY', $3, $4, 'INR', 'CREATED')`,
    [customerId, planCode, orderData.id, plan.price_inr]
  );

  return {
    orderId: orderData.id,
    amountPaise: plan.price_inr,
    currency: 'INR',
    keyId: rzp.keyId, // केवल पब्लिक Key ID फ्रंटएंड को भेजें, Secret कभी नहीं
  };
}

/**
 * Step 2: पेमेंट के बाद Razorpay Signature को क्रिप्टोग्राफिक तरीके से वेरिफाई करके लाइसेंस जारी करता है
 */
export async function verifyRazorpayPaymentAndActivateLicense(
  db: DbPool,
  rzpSecret: string,
  params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }
) {
  const expectedSignature = crypto
    .createHmac('sha256', rzpSecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');

  const isAuthentic = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(params.razorpaySignature, 'utf-8')
  );

  if (!isAuthentic) {
    await db.query(
      `UPDATE payments SET status = 'FAILED' WHERE gateway_order_id = $1`,
      [params.razorpayOrderId]
    );
    throw new Error('PAYMENT_SIGNATURE_VERIFICATION_FAILED');
  }

  const payRes = await db.query(
    `UPDATE payments 
     SET status = 'VERIFIED', gateway_payment_id = $1, verified_at = NOW() 
     WHERE gateway_order_id = $2 AND status = 'CREATED'
     RETURNING customer_id, plan_code`,
    [params.razorpayPaymentId, params.razorpayOrderId]
  );

  const payment = payRes.rows[0];
  if (!payment) {
    throw new Error('PAYMENT_ALREADY_PROCESSED_OR_NOT_FOUND');
  }

  // नया यूनिक लाइसेंस की (FXZ-XXXX-XXXX-XXXX) जनरेट करें
  const rawHex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const licenseKey = `FXZ-${rawHex.slice(0, 4)}-${rawHex.slice(4, 8)}-${rawHex.slice(8, 12)}`;

  await db.query(
    `INSERT INTO licenses (license_key, customer_id, plan_code, status)
     VALUES ($1, $2, $3, 'ACTIVE')`,
    [licenseKey, payment.customer_id, payment.plan_code]
  );

  return {
    verified: true,
    licenseKey,
    planCode: payment.plan_code,
  };
}
