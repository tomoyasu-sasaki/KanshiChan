/**
 * 音声コマンドで操作する設定項目のメタデータ。
 * - キー名だけでは判別しづらい発話を補助するため、同義語やバリデーション範囲を持たせている。
 * - LLM 結果が曖昧でも辞書ベースで補完できるようにする設計。
 */

export const SETTINGS_VOICE_MAP = Object.freeze({
  phoneAlertEnabled: {
    key: 'phoneAlertEnabled',
    label: 'スマホ検知アラート',
    type: 'boolean',
    elementId: 'phoneAlertEnabled',
    synonyms: ['スマホアラート', 'スマホ通知', 'スマホ検知'],
  },
  phoneThreshold: {
    key: 'phoneThreshold',
    label: 'スマホアラート開始までの秒数',
    type: 'number',
    elementId: 'phoneThreshold',
    min: 1,
    max: 600,
    step: 1,
    unit: '秒',
    synonyms: ['スマホしきい値', 'スマホタイマー'],
  },
  phoneConfidence: {
    key: 'phoneConfidence',
    label: 'スマホ検知感度',
    type: 'number',
    elementId: 'phoneConfidence',
    min: 0.1,
    max: 0.9,
    step: 0.1,
    synonyms: ['スマホ感度'],
  },
  absenceAlertEnabled: {
    key: 'absenceAlertEnabled',
    label: '不在検知アラート',
    type: 'boolean',
    elementId: 'absenceAlertEnabled',
    synonyms: ['離席アラート', '離席通知'],
  },
  absenceThreshold: {
    key: 'absenceThreshold',
    label: '不在アラート開始までの秒数',
    type: 'number',
    elementId: 'absenceThreshold',
    min: 1,
    max: 600,
    step: 1,
    unit: '秒',
    synonyms: ['離席しきい値', '不在タイマー'],
  },
  absenceConfidence: {
    key: 'absenceConfidence',
    label: '不在検知感度',
    type: 'number',
    elementId: 'absenceConfidence',
    min: 0.1,
    max: 0.9,
    step: 0.1,
    synonyms: ['離席感度'],
  },
  soundEnabled: {
    key: 'soundEnabled',
    label: 'アラート音',
    type: 'boolean',
    elementId: 'soundEnabled',
    synonyms: ['サウンド', '効果音'],
  },
  desktopNotification: {
    key: 'desktopNotification',
    label: 'デスクトップ通知',
    type: 'boolean',
    elementId: 'desktopNotification',
    synonyms: ['PC通知', '画面通知'],
  },
  showDetections: {
    key: 'showDetections',
    label: '検知オーバーレイ',
    type: 'boolean',
    elementId: 'showDetections',
    synonyms: ['検出オーバーレイ', '検知表示'],
  },
  yoloEnabled: {
    key: 'yoloEnabled',
    label: 'YOLO検知',
    type: 'boolean',
    elementId: 'yoloEnabled',
    synonyms: ['YOLO', '検知モデル'],
  },
  voicevoxSpeaker: {
    key: 'voicevoxSpeaker',
    label: 'VOICEVOX話者',
    type: 'select',
    elementId: 'voicevoxSpeaker',
    synonyms: ['話者', 'ボイスボックス', '声'],
  },
});

/**
 * 発話に含まれるキーワードから設定キーを逆引きする。
 * @param {string} keyword 解析済み文字列
 * @returns {string|null} 見つかれば設定キー
 */
export function findSettingsKeyBySynonym(keyword) {
  const normalized = String(keyword || '').trim();
  if (!normalized) {
    return null;
  }

  const direct = SETTINGS_VOICE_MAP[normalized];
  if (direct) {
    return direct.key;
  }

  return (
    Object.values(SETTINGS_VOICE_MAP).find((entry) =>
      entry.synonyms?.some((synonym) => normalized.includes(synonym))
    )?.key || null
  );
}
