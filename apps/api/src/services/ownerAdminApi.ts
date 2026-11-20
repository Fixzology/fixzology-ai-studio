import { DbPool } from './authAndLicenseService';

export async function logOwnerAction(
  db: DbPool,
  ownerId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
) {
  await db.query(
    `INSERT INTO admin_audit_logs (owner_id, action, target_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [ownerId, action, targetId, JSON.stringify(metadata)]
  );
}

/**
 * Owner Dashboard के लाइव आंकड़े (Total Customers, Active/Expired Licenses, Revenue)
 */
export async function getOwnerDashboardMetrics(db: DbPool) {
  const stats = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM customers) AS total_customers,
      (SELECT COUNT(*)::int FROM customers WHERE status = 'BLOCKED') AS blocked_customers,
      (SELECT COUNT(*)::int FROM licenses WHERE status = 'ACTIVE') AS active_licenses,
      (SELECT COUNT(*)::int FROM licenses WHERE status = 'EXPIRED') AS expired_licenses,
      (SELECT COUNT(*)::int FROM licenses WHERE plan_code = 'NORMAL' AND status = 'ACTIVE') AS normal_users,
      (SELECT COUNT(*)::int FROM licenses WHERE plan_code = 'PRO' AND status = 'ACTIVE') AS pro_users,
      (SELECT COUNT(*)::int FROM licenses WHERE plan_code = 'ULTRA' AND status = 'ACTIVE') AS ultra_users,
      (SELECT COALESCE(SUM(amount_paise), 0)::bigint FROM payments WHERE status = 'VERIFIED') AS total_revenue_paise
  `);
  return stats.rows[0];
}

/**
 * Owner द्वारा कस्टमर का Device Reset, Block/Unblock, या License Extend करना
 */
export async function ownerManageLicense(
  db: DbPool,
  ownerId: string,
  licenseId: string,
  command: 'RESET_DEVICE' | 'REVOKE' | 'EXTEND_1_YEAR'
) {
  if (command === 'RESET_DEVICE') {
    await db.query(
      `UPDATE licenses SET registered_device_hash = NULL, device_label = NULL WHERE id = $1`,
      [licenseId]
    );
  } else if (command === 'REVOKE') {
    await db.query(`UPDATE licenses SET status = 'REVOKED' WHERE id = $1`, [licenseId]);
  } else if (command === 'EXTEND_1_YEAR') {
    await db.query(
      `UPDATE licenses 
       SET status = 'ACTIVE',
           expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW()) + INTERVAL '365 days'
       WHERE id = $1`,
      [licenseId]
    );
  }

  await logOwnerAction(db, ownerId, `LICENSE_${command}`, licenseId);
  return { success: true };
}

/**
 * Owner द्वारा किसी भी फीचर को NORMAL / PRO / ULTRA के लिए ऑन-ऑफ करना
 */
export async function ownerUpdateFeatureFlag(
  db: DbPool,
  ownerId: string,
  featureKey: string,
  isEnabled: boolean,
  allowedPlans: Array<'NORMAL' | 'PRO' | 'ULTRA'>
) {
  await db.query(
    `UPDATE feature_flags 
     SET is_enabled = $1, allowed_plans = $2, updated_by = $3, updated_at = NOW()
     WHERE feature_key = $4`,
    [isEnabled, allowedPlans, ownerId, featureKey]
  );
  await logOwnerAction(db, ownerId, 'FEATURE_FLAG_UPDATED', featureKey, {
    isEnabled,
    allowedPlans,
  });
  return { success: true };
}
