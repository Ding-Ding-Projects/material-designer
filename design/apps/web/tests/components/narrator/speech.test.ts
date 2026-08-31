import { describe, expect, it } from 'vitest';

import { isVoiceCompatible } from '../../../src/components/narrator/speech';

describe('narrator voice compatibility', () => {
  it('never treats a cross-language preferred identity as compatible', () => {
    const english = { lang: 'en-US' } as SpeechSynthesisVoice;
    const cantonese = { lang: 'zh-HK' } as SpeechSynthesisVoice;
    expect(isVoiceCompatible(english, 'en')).toBe(true);
    expect(isVoiceCompatible(english, 'zh-HK')).toBe(false);
    expect(isVoiceCompatible(cantonese, 'zh-HK')).toBe(true);
    expect(isVoiceCompatible(cantonese, 'en')).toBe(false);
  });
});
