import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entryShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryShell.tsx'),
  'utf8',
);
const entryNavRailSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryNavRail.tsx'),
  'utf8',
);
const homeViewSource = readFileSync(
  resolve(process.cwd(), 'src/components/HomeView.tsx'),
  'utf8',
);

describe('entry shell unsolicited promotion contract', () => {
  it('does not mount automatic campaign, plan, star, or rail-callout surfaces', () => {
    // These exact render boundaries keep the UI free of unsolicited offers.
    // Keep the assertions anchored to JSX mounts and test ids, so comments or
    // similarly named helper symbols cannot satisfy the contract.
    expect(entryShellSource).not.toMatch(/<WorkbenchCampaignBadge\b/);
    expect(entryShellSource).not.toMatch(/<DeepSeekV4FlashCampaign\b/);
    expect(entryShellSource).not.toMatch(/footerNotice=/);
    expect(entryShellSource).not.toMatch(/<CloudSignInTip\b/);
    expect(entryNavRailSource).not.toMatch(/<WorkbenchCampaignBadge\b/);
    expect(entryNavRailSource).not.toMatch(/entry-top-right-github/);
    expect(entryNavRailSource).not.toMatch(/footerNotice/);
    expect(homeViewSource).not.toMatch(/<DeepSeekV4FlashCampaign\b/);
  });

  it('keeps the user-initiated Settings and AMR onboarding routes', () => {
    expect(entryShellSource).toContain("navigate({ kind: 'home', view: 'onboarding' })");
    expect(entryShellSource).toContain('onOpenSettings={onOpenSettings}');
    expect(entryShellSource).toContain('onAmrLoginStatusChange');
  });
});
