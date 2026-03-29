export const VOICE_META_PREFIX = '[[voice:';
export const VOICE_META_SUFFIX = ']]';

export function voiceMessageContent(audioUrl: string): string {
  return `${VOICE_META_PREFIX}${encodeURIComponent(audioUrl)}${VOICE_META_SUFFIX}`;
}
