import React, { useState } from 'react';

interface LegalConsentGateProps {
  customerId: string;
  onAcceptAll: (acceptedDocs: string[]) => Promise<void>;
}

const REQUIRED_POLICIES = [
  { key: 'TOS', title: 'Terms of Service (v1.0)' },
  { key: 'PRIVACY', title: 'Privacy Policy & Media Handling (v1.0)' },
  { key: 'LICENSE', title: 'Single-Device 1-Year License Agreement (v1.0)' },
  { key: 'AI_DISCLOSURE', title: 'AI Processing & Consent Disclosure (v1.0)' },
  { key: 'COPYRIGHT', title: 'Copyright & Original Content Policy (v1.0)' },
  { key: 'AUP', title: 'Acceptable Use Policy (v1.0)' },
];

export const LegalConsentGate: React.FC<LegalConsentGateProps> = ({ customerId, onAcceptAll }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const allChecked = REQUIRED_POLICIES.every((p) => checked[p.key]);

  const handleConfirm = async () => {
    if (!allChecked) return;
    setSubmitting(true);
    try {
      await onAcceptAll(REQUIRED_POLICIES.map((p) => p.key));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 text-[#F4F6FA]">
      <div className="max-w-lg w-full bg-[#161922] border border-[#2B3140] rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-bold">Legal & Privacy Consent Required</h2>
        <p className="text-xs text-[#9AA3B5]">
          Fixzology AI Studio में प्रवेश करने से पहले कृपया सभी नीतियों की समीक्षा करें और सहमति दें (Account: {customerId.slice(0, 8)}):
        </p>

        <div className="space-y-2 text-xs">
          {REQUIRED_POLICIES.map((policy) => (
            <label
              key={policy.key}
              className="flex items-center gap-2.5 p-2.5 rounded bg-[#1F2430] border border-[#2B3140] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!checked[policy.key]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [policy.key]: e.target.checked }))}
                className="accent-[#7C5CFF] w-4 h-4"
              />
              <span>{policy.title}</span>
            </label>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!allChecked || submitting}
          className="w-full py-2.5 rounded bg-[#7C5CFF] hover:bg-[#6A48F5] disabled:opacity-40 text-xs font-semibold text-white"
        >
          {submitting ? 'Recording Consent...' : 'I Agree & Continue to Studio'}
        </button>
      </div>
    </div>
  );
};

/**
 * सुरक्षित WhatsApp Support लिंक जनरेटर (केवल License ID शामिल करता है, पासवर्ड कभी नहीं)
 */
export function buildSafeWhatsAppSupportUrl(supportPhoneE164: string, licenseId: string, issueCategory: string) {
  const cleanPhone = supportPhoneE164.replace(/\D/g, '');
  const message = `Hello Fixzology AI Studio Support,\nI need help with: ${issueCategory}\nLicense ID: ${licenseId}\n(Note: I will not share my password.)`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
