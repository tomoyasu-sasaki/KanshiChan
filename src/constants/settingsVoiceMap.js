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
    intents: {
      on: ['アラートオン', '通知を有効'],
      off: ['アラートオフ', '通知を無効'],
      toggle: ['アラート切り替え'],
    },
  },
  phoneThreshold: {
    key: 'phoneThreshold',
    label: 'スマホアラート開始までの秒数',
    type: 'number',
    elementId: 'phoneThreshold',
    synonyms: ['スマホしきい値', 'スマホタイマー'],
    numeric: {
      min: 1,
      max: 600,
      step: 1,
      unit: '秒',
      defaultDelta: 5,
    },
    intents: {
      increase: ['もっと遅く', '時間を延長'],
      decrease: ['もっと早く', '時間を短縮'],
      set: ['秒にして', '秒へ変更'],
    },
  },
  phoneConfidence: {
    key: 'phoneConfidence',
    label: 'スマホ検知感度',
    type: 'number',
    elementId: 'phoneConfidence',
    synonyms: ['スマホ感度'],
    numeric: {
      min: 0.1,
      max: 0.9,
      step: 0.1,
      unit: '',
      defaultDelta: 0.1,
    },
    intents: {
      increase: ['感度を上げて'],
      decrease: ['感度を下げて'],
      set: ['にして', 'へ調整'],
    },
  },
  absenceAlertEnabled: {
    key: 'absenceAlertEnabled',
    label: '不在検知アラート',
    type: 'boolean',
    elementId: 'absenceAlertEnabled',
    synonyms: ['離席アラート', '離席通知'],
    intents: {
      on: ['不在アラートオン'],
      off: ['不在アラートオフ'],
      toggle: ['不在アラート切り替え'],
    },
  },
  absenceThreshold: {
    key: 'absenceThreshold',
    label: '不在アラート開始までの秒数',
    type: 'number',
    elementId: 'absenceThreshold',
    synonyms: ['離席しきい値', '不在タイマー'],
    numeric: {
      min: 1,
      max: 600,
      step: 1,
      unit: '秒',
      defaultDelta: 5,
    },
    intents: {
      increase: ['長く待って', '時間を延ばして'],
      decrease: ['短くして', '早めて'],
      set: ['秒にして', '秒で設定'],
    },
  },
  absenceConfidence: {
    key: 'absenceConfidence',
    label: '不在検知感度',
    type: 'number',
    elementId: 'absenceConfidence',
    synonyms: ['離席感度'],
    numeric: {
      min: 0.1,
      max: 0.9,
      step: 0.1,
      unit: '',
      defaultDelta: 0.1,
    },
    intents: {
      increase: ['感度を上げて'],
      decrease: ['感度を下げて'],
      set: ['にして', 'へ調整'],
    },
  },
  soundEnabled: {
    key: 'soundEnabled',
    label: 'アラート音',
    type: 'boolean',
    elementId: 'soundEnabled',
    synonyms: ['サウンド', '効果音'],
    intents: {
      on: ['音を出して', '音をオン'],
      off: ['音を消して', '音をオフ'],
      toggle: ['音を切り替え'],
    },
  },
  desktopNotification: {
    key: 'desktopNotification',
    label: 'デスクトップ通知',
    type: 'boolean',
    elementId: 'desktopNotification',
    synonyms: ['PC通知', '画面通知'],
    intents: {
      on: ['通知を表示', '通知オン'],
      off: ['通知を止めて', '通知オフ'],
      toggle: ['通知を切り替え'],
    },
  },
  showDetections: {
    key: 'showDetections',
    label: '検知オーバーレイ',
    type: 'boolean',
    elementId: 'showDetections',
    synonyms: ['検出オーバーレイ', '検知表示'],
    intents: {
      on: ['枠を表示', 'オーバーレイを表示'],
      off: ['枠を消して', 'オーバーレイを非表示'],
      toggle: ['オーバーレイを切り替え'],
    },
  },
  previewEnabled: {
    key: 'previewEnabled',
    label: '監視プレビュー',
    type: 'boolean',
    elementId: 'previewEnabled',
    synonyms: ['プレビュー', '監視映像', '画面表示'],
    intents: {
      on: ['プレビューを表示', '監視画面を表示', '映像を表示'],
      off: ['プレビューを隠して', '監視画面を非表示', '映像を消して'],
      toggle: ['プレビューを切り替え', '監視画面を切り替え'],
    },
  },
  yoloEnabled: {
    key: 'yoloEnabled',
    label: 'YOLO検知',
    type: 'boolean',
    elementId: 'yoloEnabled',
    synonyms: ['YOLO', '検知モデル'],
    intents: {
      on: ['検知をオン', 'YOLOを有効'],
      off: ['検知をオフ', 'YOLOを無効'],
      toggle: ['検知を切り替え'],
    },
  },
  voicevoxSpeaker: {
    key: 'voicevoxSpeaker',
    label: 'VOICEVOX話者',
    type: 'select',
    elementId: 'voicevoxSpeaker',
    synonyms: ['話者', 'ボイスボックス', '声'],
    intents: {
      set: ['にして', 'に変更'],
    },
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
