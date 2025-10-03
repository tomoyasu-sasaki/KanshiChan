/**
 * VOICEVOX HTTP API 連携ラッパー。
 * - audio_query → synthesis の 2 ステップをまとめて data URL を返す。
 * - Node.js fetch と VOICEVOX サーバー (local HTTP) に依存。
 */
const voicevoxConfigPromise = import('../../constants/voicevox-config.js');

/**
 * VOICEVOX にテキスト読み上げを要求し、wav の data URL を生成する。
 * @param {string} text 読み上げる本文
 * @param {Object} [options] VOICEVOX 接続/調整パラメータ
 * @returns {Promise<string>} base64 data URL
 * @throws {Error} HTTP ステータス異常時
 */
async function synthesizeWithVoiceVox(text, options = {}) {
  const {
    DEFAULT_VOICEVOX_HOST,
    DEFAULT_VOICEVOX_PORT,
    DEFAULT_VOICEVOX_SPEAKER_ID
  } = await voicevoxConfigPromise;

  const host = options.host || DEFAULT_VOICEVOX_HOST;
  const port = options.port || DEFAULT_VOICEVOX_PORT;
  const speakerId = options.speakerId != null ? options.speakerId : DEFAULT_VOICEVOX_SPEAKER_ID;
  const base = `http://${host}:${port}`;

  const aqUrl = `${base}/audio_query?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(speakerId)}`;
  const aqRes = await fetch(aqUrl, { method: 'POST' });
  if (!aqRes.ok) {
    throw new Error(`VOICEVOX audio_query failed: ${aqRes.status}`);
  }
  const query = await aqRes.json();

  const enrichedQuery = { ...query };
  if (options.speedScale != null) enrichedQuery.speedScale = options.speedScale;
  if (options.pitchScale != null) enrichedQuery.pitchScale = options.pitchScale;
  if (options.intonationScale != null) enrichedQuery.intonationScale = options.intonationScale;

  const synthUrl = `${base}/synthesis?speaker=${encodeURIComponent(speakerId)}`;
  const sRes = await fetch(synthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(enrichedQuery)
  });
  if (!sRes.ok) {
    throw new Error(`VOICEVOX synthesis failed: ${sRes.status}`);
  }
  const buf = Buffer.from(await sRes.arrayBuffer());
  return `data:audio/wav;base64,${buf.toString('base64')}`;
}

module.exports = {
  synthesizeWithVoiceVox
};
