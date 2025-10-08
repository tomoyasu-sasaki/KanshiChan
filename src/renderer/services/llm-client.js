/**
 * LLM 呼び出しラッパー。
 * - IPC 経由のレスポンス形式を統一し、用途別の整形ロジックを分離する。
 */

import { getAudioPromptProfile } from '../../constants/audioProfiles.js';

/**
 * プロファイル ID に応じて LLM を実行し、UI が扱いやすい形式へ正規化する。
 * @param {string} profileId
 * @param {string} input ユーザー文字列
 * @param {{context?:object, legacyRawResult?:object}} options
 * @returns {Promise<object>}
 */
export async function runLlm(profileId, input, options = {}) {
  const profile = getAudioPromptProfile(profileId);
  const requestPayload = {
    profileId,
    text: input,
    context: options.context || {},
  };

  if (window?.electronAPI?.audioInfer) {
    const response = await window.electronAPI.audioInfer(requestPayload);
    return normalizeLlmResponse(profile, response);
  }

  // レガシーフォールバック: スケジュールのみ対応
  if (profileId === 'schedule' && options.legacyRawResult) {
    return normalizeLlmResponse(profile, options.legacyRawResult);
  }

  throw new Error('LLM API が利用できません。アプリの更新が必要です。');
}

/**
 * メインプロセスからの応答を用途別に扱いやすい形式へ整形する。
 * @param {object} profile
 * @param {object} response
 * @returns {object}
 */
function normalizeLlmResponse(profile, response) {
  if (!response) {
    throw new Error('LLM の応答が空です');
  }

  if (profile.id === 'schedule') {
    const schedules = Array.isArray(response.schedules) ? response.schedules : [];
    if (schedules.length === 0) {
      throw new Error('予定を抽出できませんでした');
    }
    return {
      type: 'schedule',
      schedules,
      transcribedText: response.transcribedText || null,
    };
  }

  if (profile.id === 'settings') {
    const commands = Array.isArray(response.commands) ? response.commands : [];
    return {
      type: 'settings',
      commands,
      warnings: response.warnings || [],
    };
  }

  if (profile.id === 'chat') {
    const reply = typeof response.reply === 'string' ? response.reply : null;
    if (!reply) {
      throw new Error('チャット応答が生成できませんでした');
    }
    return {
      type: 'chat',
      reply,
      metadata: response.metadata || {},
    };
  }

  throw new Error(`未対応のプロファイルです: ${profile.id}`);
}
