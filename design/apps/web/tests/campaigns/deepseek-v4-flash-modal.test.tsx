// @vitest-environment jsdom
//
// Behavioral contract for the DeepSeek V4 Flash campaign modal
// (`DeepSeekV4FlashCampaign`). The dialog portals to `document.body` while
// EntryShell keeps every entry view mounted behind `display:none`, so these
// specs pin the behaviors the source-contract tests cannot see:
//
// 1. the modal only interrupts the ACTIVE home view (要求文档:弹窗只在
//    #/home 展示,不在编辑器或其他工作流中打断用户), and re-arms when the
//    user returns to home without having dismissed it;
// 2. frequency control fails closed — an unreadable localStorage must not
//    turn "活动期内出现一次" into "every mount";
// 3. the paid 立即使用 CTA actually moves the workbench onto the campaign
//    model (agent `amr`, model `deepseek-v4-flash`) instead of only opening
//    the model picker (产品拍板 D5);
// 4. the unpaid upgrade path carries the telemetry consent + device id the
//    other two campaign touchpoints already forward.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekV4FlashCampaign } from '../../src/components/DeepSeekV4FlashCampaign';
import { I18nProvider } from '../../src/i18n';

const trackSpy = vi.fn();

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: trackSpy }),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: null,
    resourceReadIdentity: null,
    loading: false,
    identityChangePending: false,
  }),
}));

vi.mock('../../src/analytics/client', () => ({
  getResolvedDeviceId: () => null,
}));

const DIALOG = 'deepseek-v4-flash-campaign-dialog';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  trackSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

describe('paid 立即使用 switches the workbench onto the campaign model', () => {
  it('shows the model provider logo and restores the abbreviation if the asset fails', () => {
    render(<DeepSeekV4FlashCampaign audience="paid" active />);

    const providerLogo = screen.getByRole('img', { name: 'DeepSeek' });
    expect(providerLogo.querySelector('img')).toHaveAttribute(
      'src',
      '/agent-icons/deepseek.svg',
    );
    expect(screen.queryByText('DS', { exact: true })).toBeNull();

    fireEvent.error(providerLogo.querySelector('img')!);

    expect(screen.getByRole('img', { name: 'DeepSeek' })).toBeVisible();
    expect(screen.getByText('DS', { exact: true })).toBeVisible();
  });

  it('applies agent amr + model deepseek-v4-flash and pulses the chip without opening the picker', () => {
    vi.useFakeTimers();
    const onUseCampaignModel = vi.fn();
    // Stand in for the home composer's model-switcher chip.
    const chip = document.createElement('button');
    chip.setAttribute('data-testid', 'inline-model-switcher-chip');
    const chipClick = vi.fn();
    chip.addEventListener('click', chipClick);
    document.body.appendChild(chip);
    try {
      render(
        <DeepSeekV4FlashCampaign
          audience="paid"
          active
          onUseCampaignModel={onUseCampaignModel}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Use now' }));

      // 产品拍板 D5: the CTA performs the real switch, not a picker tour.
      expect(onUseCampaignModel).toHaveBeenCalledWith(
        'amr',
        'deepseek-v4-pro',
      );
      // The analytics element stays `use_now`.
      expect(trackSpy).toHaveBeenCalledWith(
        'ui_click',
        expect.objectContaining({ element: 'use_now' }),
        undefined,
      );

      vi.advanceTimersByTime(1);
      // Visual feedback survives as the highlight pulse alone — no
      // chip.click(), so the model popover stays closed.
      expect(chipClick).not.toHaveBeenCalled();
      expect(chip.getAttribute('data-campaign-highlight')).toBe('true');
      vi.advanceTimersByTime(1_600);
      expect(chip.hasAttribute('data-campaign-highlight')).toBe(false);
    } finally {
      chip.remove();
    }
  });
});

describe('the modal never re-opens for a seen campaign (no URL override left)', () => {
  it('stays closed once the campaign was dismissed, whatever the page URL is', () => {
    // The former ?campaign= review parameter could force a seen campaign
    // back open. That backdoor is gone: frequency control is the only input.
    window.history.replaceState({}, '', '/?campaign=deepseek-v4-flash');
    window.localStorage.setItem(
      'open-design:campaign-seen:deepseek-v4-dual-unlimited-2026',
      '1',
    );

    render(<DeepSeekV4FlashCampaign audience="paid" active />);

    expect(screen.queryByTestId(DIALOG)).toBeNull();
  });

  // Frequency control is keyed on the campaign id, and this campaign is NOT the
  // 8/6–8/13 free week that preceded it. A user who dismissed that one has
  // never seen this offer, so its single showing is still owed to them —
  // otherwise the whole returning-user segment silently loses the announcement
  // (PRD F-14: 旧 Flash 记录不影响本活动).
  it('still shows once to a user who dismissed the previous campaign', () => {
    window.localStorage.setItem(
      'open-design:campaign-seen:deepseek-v4-flash-unlimited-2026',
      '1',
    );

    render(<DeepSeekV4FlashCampaign audience="paid" active />);

    expect(screen.queryByTestId(DIALOG)).not.toBeNull();
  });
});

// History, so this does not read as drift: 29d337c0 (1 Sep, the upstream
// v0.21.1 reconciliation) rewrote the cases below onto the upstream DeepSeek
// contract, where an unpaid user saw the DeepSeek upgrade offer and no Go
// content. The Go welcome modal (built in 27794738, silently dropped by the
// baseline import 1fc930a7) has since been restored and mounted on the unpaid
// branch at the product owner's explicit direction, so an unpaid user now gets
// the Go plan modal. These expectations describe that restored path.
describe('unpaid path opens the Go welcome modal into public Pricing', () => {
  it('renders the Go welcome modal instead of the DeepSeek upgrade offer', () => {
    render(
      <I18nProvider initial="en">
        <DeepSeekV4FlashCampaign audience="unpaid" active />
      </I18nProvider>,
    );

    // Copy source: the `english` record in src/campaigns/go-plan-content.ts.
    expect(screen.getByRole('heading', {
      name: 'Low-cost design plan for everyone',
    })).toBeVisible();
    expect(screen.getByText('NEW PLAN · LAUNCH OFFER')).toBeVisible();
    expect(screen.getByText('GO', { exact: true })).toBeVisible();
    expect(screen.getByText('Go first month $5 · unlimited use')).toBeVisible();
    expect(screen.getByText('Then $10 / month')).toBeVisible();
    // The three unlimited models the Go benefit list names (component source).
    expect(screen.getByText('DeepSeek V4 Flash')).toBeVisible();
    expect(screen.getByText('DeepSeek V4 Pro')).toBeVisible();
    expect(screen.getByText('GLM-5.2')).toBeVisible();
    expect(screen.getAllByText('UNLIMITED', { exact: true })).toHaveLength(3);
    expect(screen.getByRole('button', {
      name: 'View Go plan · Limited-time 50% off',
    })).toBeVisible();

    // …and the DeepSeek upgrade offer this branch used to render is gone.
    expect(screen.queryByRole('heading', {
      name: 'This time, put top-tier intelligence to work. Unlimited.',
    })).toBeNull();
    expect(screen.queryByText('Free for paid plans')).toBeNull();
    expect(screen.queryByText('Upgrade to unlock · through Aug 27')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade and use' })).toBeNull();
  });

  it('keeps provider identity visible when the unpaid DeepSeek logo fails to load', () => {
    render(<DeepSeekV4FlashCampaign audience="unpaid" active />);

    const providerLogo = screen.getByRole('img', { name: 'DeepSeek' });
    fireEvent.error(providerLogo.querySelector('img')!);

    expect(screen.getByRole('img', { name: 'DeepSeek' })).toBeVisible();
    expect(screen.getByText('DS', { exact: true })).toBeVisible();
  });

  // This case was already red at the baseline, before the Go modal was
  // restored: it demanded `url.search === ''` while the unpaid CTA has always
  // built its target through `attributedAmrUrl`, which appends the AMR entry
  // parameters. The rewrite below is that pre-existing bug, not collateral.
  it('opens the locale-neutral comparison page with AMR attribution', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(
      <DeepSeekV4FlashCampaign
        audience="unpaid"
        active
        metricsConsent
        installationId="install-abc123"
      />,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'View Go plan · Limited-time 50% off',
    }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(String(open.mock.calls[0]?.[0]));
    // `en` keeps the bare /pricing/ path, with no locale segment spliced in.
    expect(url.origin + url.pathname).toBe('https://open-design.ai/pricing/');
    expect(url.searchParams.get('od_locale')).toBe('en');
    // The entry attribution rides along in the query so AMR can join the
    // landing back to this campaign click.
    expect(url.searchParams.get('od_origin')).toBe('open_design');
    expect(url.searchParams.get('od_entry_source')).toBe('deepseek_unpaid_modal');
    expect(url.searchParams.get('od_campaign_id')).toBe('deepseek_v4_pro');
    expect(url.searchParams.get('od_conversion_source')).toBe('deepseek_unpaid_modal');
    expect(url.searchParams.get('od_entry_id')).toMatch(/^od-amr-/);
    expect(url.searchParams.get('od_device_id')).toBe('install-abc123');
  });

  it('keeps the same target without metrics consent', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(
      <DeepSeekV4FlashCampaign
        audience="unpaid"
        active
        metricsConsent={false}
        installationId="install-abc123"
      />,
    );

    fireEvent.click(screen.getByRole('button', {
      name: 'View Go plan · Limited-time 50% off',
    }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(String(open.mock.calls[0]?.[0]));
    // Consent gates the device id only. Everything that decides WHERE the
    // user lands stays identical to the consented case above.
    expect(url.searchParams.get('od_device_id')).toBeNull();
    expect(url.origin + url.pathname).toBe('https://open-design.ai/pricing/');
    expect(url.searchParams.get('od_locale')).toBe('en');
    expect(url.searchParams.get('od_entry_source')).toBe('deepseek_unpaid_modal');
    expect(url.searchParams.get('od_campaign_id')).toBe('deepseek_v4_pro');
  });

  it('spends a Go frequency key separate from the paid DeepSeek one', () => {
    vi.stubGlobal('open', vi.fn());
    render(<DeepSeekV4FlashCampaign audience="unpaid" active />);

    fireEvent.click(screen.getByRole('button', {
      name: 'View Go plan · Limited-time 50% off',
    }));

    // `activeCampaignId = paid ? campaign.id : GO_PLAN_CAMPAIGN.id` is a
    // deliberate split: dismissing the Go modal must not consume the paid
    // DeepSeek campaign's single showing, and vice versa.
    expect(window.localStorage.getItem(
      'open-design:campaign-seen:go-plan-launch-2026',
    )).toBe('1');
    expect(window.localStorage.getItem(
      'open-design:campaign-seen:deepseek-v4-dual-unlimited-2026',
    )).toBeNull();
  });
});

describe('campaign modal only interrupts the active home view', () => {
  it('keeps the shared dialog Escape behavior and records the dismissal', () => {
    render(<DeepSeekV4FlashCampaign audience="paid" active />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId(DIALOG)).toBeNull();
    expect(window.localStorage.getItem(
      'open-design:campaign-seen:deepseek-v4-dual-unlimited-2026',
    )).toBe('1');
  });

  it('stays silent on non-home views even when the campaign is unseen', () => {
    render(<DeepSeekV4FlashCampaign audience="paid" active={false} />);

    expect(screen.queryByTestId(DIALOG)).toBeNull();
  });

  it('opens once home becomes active while the campaign is still unseen', () => {
    const { rerender } = render(
      <DeepSeekV4FlashCampaign audience="paid" active={false} />,
    );
    expect(screen.queryByTestId(DIALOG)).toBeNull();

    rerender(<DeepSeekV4FlashCampaign audience="paid" active />);

    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();
  });

  it('fails closed when frequency-control storage is unreadable', () => {
    // Private mode / disabled localStorage: `hasSeenCampaign` cannot know
    // whether the user already saw the modal. Guessing "unseen" would show
    // it on EVERY mount — the campaign promise is 活动期内出现一次, so an
    // unreadable store must count as seen.
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('localStorage disabled');
      });
    try {
      render(<DeepSeekV4FlashCampaign audience="paid" active />);

      expect(screen.queryByTestId(DIALOG)).toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });

  it('re-arms when the user leaves home without dismissing and comes back', () => {
    const { rerender } = render(
      <DeepSeekV4FlashCampaign audience="paid" active />,
    );
    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();

    // Navigating away is not a dismissal: the dialog disappears with the
    // view but must NOT be marked seen…
    rerender(<DeepSeekV4FlashCampaign audience="paid" active={false} />);
    expect(screen.queryByTestId(DIALOG)).toBeNull();

    // …so returning to home within the window shows it again.
    rerender(<DeepSeekV4FlashCampaign audience="paid" active />);
    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();
  });

  it('yields the modal slot while a higher-priority announcement is pending', () => {
    const { rerender } = render(
      <DeepSeekV4FlashCampaign audience="paid" active />,
    );
    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();

    rerender(<DeepSeekV4FlashCampaign audience="unknown" active />);
    expect(screen.queryByTestId(DIALOG)).toBeNull();
    expect(window.localStorage.getItem(
      'open-design:campaign-seen:deepseek-v4-dual-unlimited-2026',
    )).toBeNull();

    rerender(<DeepSeekV4FlashCampaign audience="paid" active />);
    expect(screen.getByTestId(DIALOG)).toBeInTheDocument();
  });
});
