'use client';

export function BrandEmblem({ size = 36 }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.88)}
      viewBox="0 0 100 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="38" cy="14" r="6" fill="#062B66" />
      <path d="M77 27C66 13 42 12 27 25C19 32 17 42 21 49" stroke="#062B66" strokeWidth="10" strokeLinecap="round" />
      <circle cx="67" cy="64" r="6" fill="#0095FF" />
      <path d="M22 52C29 70 53 77 73 66C77 64 80 61 82 57" stroke="#0095FF" strokeWidth="10" strokeLinecap="round" />
      <path d="M19 46l6 5M22 51l5 4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      <path d="M36 42a22 22 0 0 1 32 0" stroke="#0095FF" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M41 48a15 15 0 0 1 22 0" stroke="#035EC8" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M46 54a8 8 0 0 1 12 0" stroke="#062B66" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="52" cy="60" r="3.2" fill="#0088FF" />
    </svg>
  );
}

export default function BrandMark({ size = 36, showWordmark = true, showSubtext = false, dark = false, appName = '' }) {
  const custom = appName && !/collective|african/i.test(appName);
  const navyColor = dark ? '#FFFFFF' : '#062B66';
  const azureColor = dark ? '#60C5FF' : '#0095FF';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(8, Math.round(size * 0.25)) }}>
      <span
        style={{
          background: dark ? 'rgba(255,255,255,0.96)' : '#FFFFFF',
          borderRadius: Math.max(10, Math.round(size * 0.28)),
          padding: Math.max(4, Math.round(size * 0.12)),
          border: '1px solid #CFE5FF',
          boxShadow: '0 2px 8px rgba(6, 43, 102, 0.08)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrandEmblem size={size} />
      </span>
      {showWordmark && (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontWeight: 900, fontSize: Math.max(14, Math.round(size * 0.45)), letterSpacing: '-0.2px' }}>
            {custom ? (
              <span style={{ color: navyColor }}>{appName}</span>
            ) : (
              <>
                <span style={{ color: navyColor }}>MYCOLLECTIVE</span>
                <span style={{ color: azureColor }}>SUB</span>
              </>
            )}
          </span>
          {showSubtext && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: dark ? '#BAE6FD' : '#3B5D94', letterSpacing: '0.3px', marginTop: 2 }}>
              Digital Services
            </span>
          )}
        </span>
      )}
    </span>
  );
}
