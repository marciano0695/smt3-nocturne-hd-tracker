import { describe, expect, it } from 'vite-plus/test';
import { cleanNumberText } from '../src/components/ui';

describe('cleanNumberText', () => {
  it('drops leading zeros left over from a cleared field', () => {
    expect(cleanNumberText('023')).toEqual({ text: '23', value: 23 });
    expect(cleanNumberText('007')).toEqual({ text: '7', value: 7 });
  });

  it('keeps a single zero', () => {
    expect(cleanNumberText('0')).toEqual({ text: '0', value: 0 });
    expect(cleanNumberText('00')).toEqual({ text: '0', value: 0 });
  });

  it('treats an empty field as no value instead of 0', () => {
    expect(cleanNumberText('')).toEqual({ text: '', value: null });
  });
});
