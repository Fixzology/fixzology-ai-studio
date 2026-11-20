import React, { useState } from 'react';

interface DashboardMetrics {
  total_customers: number;
  blocked_customers: number;
  active_licenses: number;
  expired_licenses: number;
  normal_users: number;
  pro_users: number;
  ultra_users: number;
  total_revenue_paise: number;
}

interface CustomerLicenseRow {
  licenseId: string;
  licenseKey: string;
  email: string;
  plan: 'NORMAL' | 'PRO' | 'ULTRA';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  deviceLabel: string | null;
  expiresAt: string | null;
}

interface FeatureFlagRow {
  featureKey: string;
  description: string;
  isEnabled: boolean;
  allowedPlans: Array<'NORMAL' | 'PRO' | 'ULTRA'>;
}

interface OwnerControlPanelProps {
  metrics: DashboardMetrics;
  licenses: CustomerLicenseRow[];
  features: FeatureFlagRow[];
  onLicenseCommand: (licenseId: string, cmd: 'RESET_DEVICE' | 'REVOKE' | 'EXTEND_1_YEAR') => Promise<void>;
  onToggleFeature: (featureKey: string, isEnabled: boolean, plans: Array<'NORMAL' | 'PRO' | 'ULTRA'>) => Promise<void>;
}

export const OwnerControlPanel: React.FC<OwnerControlPanelProps> = ({
  metrics,
  licenses,
  features,
  onLicenseCommand,
  onToggleFeature,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'licenses' | 'features'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLicenses = licenses.filter(
    (l) =>
      l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.licenseKey.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0E1015] text-[#F4F6FA] p-4 md:p-6 font-sans">
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-6 border-b border-[#2B3140] gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Fixzology AI Studio — Owner Control Panel</h1>
          <p className="text-xs text-[#9AA3B5]">
            Protected Admin Environment • Audit Logging Active • Passwords Never Readable
          </p>
        </div>

        <nav className="flex gap-2 text-xs">
          {(['overview', 'licenses', 'features'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-2 rounded font-semibold uppercase ${
                activeTab === tab
                  ? 'bg-[#7C5CFF] text-white'
                  : 'bg-[#161922] text-[#9AA3B5] border border-[#2B3140]'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {/* TAB 1: DASHBOARD METRICS */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Customers" value={metrics.total_customers} />
          <MetricCard label="Active Licenses" value={metrics.active_licenses} accent="#22C55E" />
          <MetricCard label="Expired Licenses" value={metrics.expired_licenses} accent="#F59E0B" />
          <MetricCard
            label="Verified Revenue"
            value={`₹${(Number(metrics.total_revenue_paise) / 100).toLocaleString('en-IN')}`}
            accent="#14B8A6"
          />
          <MetricCard label="NORMAL Plan Users" value={metrics.normal_users} />
          <MetricCard label="PRO Plan Users" value={metrics.pro_users} />
          <MetricCard label="ULTRA Plan Users" value={metrics.ultra_users} />
          <MetricCard label="Blocked Accounts" value={metrics.blocked_customers} accent="#EF4444" />
        </div>
      )}

      {/* TAB 2: LICENSES & DEVICE BINDING CONTROL */}
      {activeTab === 'licenses' && (
        <div className="space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Customer Email or License Key (FXZ-...)..."
            className="w-full max-w-md bg-[#161922] border border-[#2B3140] rounded px-3 py-2 text-xs text-white"
          />

          <div className="overflow-x-auto bg-[#161922] border border-[#2B3140] rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1F2430] text-[#9AA3B5] uppercase">
                <tr>
                  <th className="p-3">License Key</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Device</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Owner Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2B3140]">
                {filteredLicenses.map((lic) => (
                  <tr key={lic.licenseId}>
                    <td className="p-3 font-mono text-[#B7A6FF]">{lic.licenseKey}</td>
                    <td className="p-3">{lic.email}</td>
                    <td className="p-3 font-semibold">{lic.plan}</td>
                    <td className="p-3 text-[#9AA3B5]">{lic.deviceLabel || 'Unbound'}</td>
                    <td className="p-3">{lic.status}</td>
                    <td className="p-3 flex flex-wrap gap-1.5">
                      <button
                        onClick={() => onLicenseCommand(lic.licenseId, 'RESET_DEVICE')}
                        className="px-2 py-1 rounded bg-[#1F2430] hover:bg-[#2B3140] border border-[#2B3140]"
                      >
                        Reset Device
                      </button>
                      <button
                        onClick={() => onLicenseCommand(lic.licenseId, 'EXTEND_1_YEAR')}
                        className="px-2 py-1 rounded bg-[#14B8A6]/20 text-[#5EEAD4] border border-[#14B8A6]/40"
                      >
                        +1 Year
                      </button>
                      <button
                        onClick={() => onLicenseCommand(lic.licenseId, 'REVOKE')}
                        className="px-2 py-1 rounded bg-[#EF4444]/20 text-[#FCA5A5] border border-[#EF4444]/40"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CENTRAL FEATURE PERMISSION MATRIX */}
      {activeTab === 'features' && (
        <div className="space-y-3">
          {features.map((feat) => (
            <div
              key={feat.featureKey}
              className="p-3 rounded-lg bg-[#161922] border border-[#2B3140] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-mono font-semibold text-white">{feat.featureKey}</div>
                <div className="text-[#9AA3B5]">{feat.description}</div>
              </div>

              <div className="flex items-center gap-3">
                {(['NORMAL', 'PRO', 'ULTRA'] as const).map((plan) => {
                  const active = feat.allowedPlans.includes(plan);
                  return (
                    <button
                      key={plan}
                      onClick={() => {
                        const nextPlans = active
                          ? feat.allowedPlans.filter((p) => p !== plan)
                          : [...feat.allowedPlans, plan];
                        onToggleFeature(feat.featureKey, feat.isEnabled, nextPlans);
                      }}
                      className={`px-2.5 py-1 rounded font-semibold ${
                        active ? 'bg-[#7C5CFF] text-white' : 'bg-[#1F2430] text-[#9AA3B5]'
                      }`}
                    >
                      {plan}
                    </button>
                  );
                })}

                <button
                  onClick={() => onToggleFeature(feat.featureKey, !feat.isEnabled, feat.allowedPlans)}
                  className={`px-3 py-1 rounded font-semibold ${
                    feat.isEnabled ? 'bg-[#22C55E] text-black' : 'bg-[#EF4444] text-white'
                  }`}
                >
                  {feat.isEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string | number; accent?: string }> = ({
  label,
  value,
  accent = '#F4F6FA',
}) => (
  <div className="p-4 rounded-lg bg-[#161922] border border-[#2B3140]">
    <div className="text-xs text-[#9AA3B5]">{label}</div>
    <div className="text-2xl font-bold mt-1" style={{ color: accent }}>
      {value}
    </div>
  </div>
);
