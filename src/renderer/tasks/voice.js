/**
 * タスクの音声入力関連の処理を管理するモジュール。
 */
import { getEls } from './dom.js';
import { taskState } from './state.js';
import { scheduleState } from '../schedule/state.js';
import { AudioInputControl } from '../components/audio-input-control.js';
import { resolveTaskIdByTitle } from './utils.js';
import { loadTasks } from './model.js';

/**
 * 音声入力の初期化を行う。
 */
export function setupVoice() {
  const root = document.getElementById('tasksVoiceControl');
  const { voiceMsg } = getEls();
  if (!root) return;
  new AudioInputControl(root, {
    promptProfile: 'tasks',
    contextId: 'tasks-dialog',
    title: '音声でタスク操作',
    description: '例:「新しいタスク」「ステータスを完了に」',
    metadata: () => ({
      tasks: taskState.tasks.map((t) => ({ id: t.id, title: t.title })),
      schedules: (scheduleState.schedules || []).map((s) => ({ id: s.id, title: s.title })),
      tags: taskState.tagOptions.map((tag) => tag.name),
    }),
    onResult: async (result) => {
      try {
        if (!result || !Array.isArray(result.commands)) {
          voiceMsg.textContent = '操作を抽出できませんでした。';
          return;
        }
        for (const cmd of result.commands) {
          await applyVoiceCommand(cmd);
        }
        voiceMsg.textContent = '音声コマンドを適用しました。';
        await loadTasks();
      } catch (error) {
        console.error('[Tasks] 音声コマンド適用エラー:', error);
        voiceMsg.textContent = '音声コマンドの適用に失敗しました。';
      }
    },
    onError: (err) => {
      console.warn('[Tasks] 音声入力エラー:', err);
      voiceMsg.textContent = '音声入力に失敗しました。';
    },
  });
}

/**
 * 音声コマンドを適用する。
 */
async function applyVoiceCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return;
  const action = String(cmd.action || '').toLowerCase();
  switch (action) {
    case 'create':
      await handleVoiceCreate(cmd);
      break;
    case 'update':
      await handleVoiceUpdate(cmd);
      break;
    case 'delete':
      await handleVoiceDelete(cmd);
      break;
    case 'complete':
      await handleVoiceComplete(cmd);
      break;
    case 'start':
      await handleVoiceStart(cmd);
      break;
    case 'bulk_delete':
      await handleBulkDelete(cmd.criteria);
      break;
    case 'bulk_complete':
      await handleBulkComplete(cmd.criteria);
      break;
    case 'search':
      await handleVoiceSearch(cmd.criteria);
      break;
    default:
      break;
  }
}

/**
 * 音声コマンド: 作成
 */
async function handleVoiceCreate(cmd) {
  const { normalizeVoiceDateForCreate } = await import('./voice-commands.js');
  const parentId = cmd.parentId ?? resolveTaskIdByTitle(cmd.parentTitle, taskState.tasks);
  const response = await window.electronAPI.tasksCreate({
    title: typeof cmd.title === 'string' ? cmd.title : undefined,
    description: typeof cmd.description === 'string' ? cmd.description : undefined,
    priority: typeof cmd.priority === 'string' ? cmd.priority : undefined,
    status: typeof cmd.status === 'string' ? cmd.status : undefined,
    startDate: normalizeVoiceDateForCreate(cmd.startDate),
    endDate: normalizeVoiceDateForCreate(cmd.endDate),
    scheduleId: cmd.scheduleId,
    parentTaskId: parentId ?? undefined,
    tags: Array.isArray(cmd.tags) ? cmd.tags : undefined,
  });
  console.debug('[Tasks] voice create response', response);
  if (!response?.success) {
    throw new Error(response?.error || 'タスク作成に失敗しました');
  }
}

/**
 * 音声コマンド: 更新
 */
async function handleVoiceUpdate(cmd) {
  const { normalizeVoiceDateForUpdate } = await import('./voice-commands.js');
  let targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : null;
  if (!targetId && cmd.title) {
    targetId = resolveTaskIdByTitle(cmd.title, taskState.tasks) ?? null;
  }
  if (!targetId) return;
  const current = taskState.tasks.find((task) => task.id === targetId);
  const parentId = cmd.parentId ?? resolveTaskIdByTitle(cmd.parentTitle, taskState.tasks);
  const payload = {
    title: typeof cmd.title === 'string' ? cmd.title : undefined,
    description: typeof cmd.description === 'string' ? cmd.description : undefined,
    priority: typeof cmd.priority === 'string' ? cmd.priority : undefined,
    status: typeof cmd.status === 'string' ? cmd.status : undefined,
    startDate: normalizeVoiceDateForUpdate(cmd.startDate),
    endDate: normalizeVoiceDateForUpdate(cmd.endDate),
    scheduleId: cmd.scheduleId,
    parentTaskId: parentId ?? undefined,
  };
  if (Array.isArray(cmd.tags)) {
    const mode = String(cmd.tagMode || 'set').toLowerCase();
    const currentTags = current?.tags ? current.tags.map((tag) => tag.name) : [];
    let nextTags = cmd.tags;
    if (mode === 'add') {
      const merged = new Set([...currentTags, ...cmd.tags]);
      nextTags = Array.from(merged);
    } else if (mode === 'remove') {
      const removeSet = new Set(cmd.tags.map((tag) => tag.toLowerCase()));
      nextTags = currentTags.filter((tag) => !removeSet.has(tag.toLowerCase()));
    }
    payload.tags = nextTags;
  }
  const response = await window.electronAPI.tasksUpdate(targetId, payload);
  console.debug('[Tasks] voice update response', response);
  if (!response?.success) {
    throw new Error(response?.error || 'タスク更新に失敗しました');
  }
}

/**
 * 音声コマンド: 削除
 */
async function handleVoiceDelete(cmd) {
  const targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : resolveTaskIdByTitle(cmd.title, taskState.tasks);
  if (!targetId) return;
  const response = await window.electronAPI.tasksDelete(targetId);
  console.debug('[Tasks] voice delete response', response);
  if (!response?.success) {
    throw new Error(response?.error || 'タスク削除に失敗しました');
  }
}

/**
 * 音声コマンド: 完了
 */
async function handleVoiceComplete(cmd) {
  const targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : resolveTaskIdByTitle(cmd.title, taskState.tasks);
  if (!targetId) return;
  const response = await window.electronAPI.tasksUpdate(targetId, { status: 'done' });
  console.debug('[Tasks] voice complete response', response);
  if (!response?.success) {
    throw new Error(response?.error || 'タスク完了解除に失敗しました');
  }
}

/**
 * 音声コマンド: 開始
 */
async function handleVoiceStart(cmd) {
  const targetId = Number.isFinite(Number(cmd.id)) ? Number(cmd.id) : resolveTaskIdByTitle(cmd.title, taskState.tasks);
  if (!targetId) return;
  const response = await window.electronAPI.tasksUpdate(targetId, { status: 'in_progress' });
  console.debug('[Tasks] voice start response', response);
  if (!response?.success) {
    throw new Error(response?.error || 'タスク更新に失敗しました');
  }
}

/**
 * 一括削除処理
 */
async function handleBulkDelete(criteria) {
  const { normalizeCriteriaForApi } = await import('./voice-commands.js');
  try {
    const normalized = normalizeCriteriaForApi(criteria);
    const res = await window.electronAPI.tasksBulkDelete(normalized);
    if (!res?.success) throw new Error(res?.error || '一括削除に失敗しました');
    const count = res.result?.count ?? 0;
    const { voiceMsg } = getEls();
    if (voiceMsg) {
      voiceMsg.textContent = `一括削除: ${count}件のタスクを削除しました。`;
    }
  } catch (error) {
    console.error('[Tasks] 一括削除エラー:', error);
    const { voiceMsg } = getEls();
    if (voiceMsg) voiceMsg.textContent = '一括削除に失敗しました。';
  }
}

/**
 * 一括完了処理
 */
async function handleBulkComplete(criteria) {
  const { normalizeCriteriaForApi } = await import('./voice-commands.js');
  try {
    const normalized = normalizeCriteriaForApi(criteria);
    const res = await window.electronAPI.tasksBulkComplete(normalized);
    if (!res?.success) throw new Error(res?.error || '一括更新に失敗しました');
    const count = res.result?.count ?? 0;
    const { voiceMsg } = getEls();
    if (voiceMsg) {
      voiceMsg.textContent = `一括完了: ${count}件のタスクを完了にしました。`;
    }
  } catch (error) {
    console.error('[Tasks] 一括完了エラー:', error);
    const { voiceMsg } = getEls();
    if (voiceMsg) voiceMsg.textContent = '一括操作に失敗しました。';
  }
}

/**
 * 音声検索処理
 */
async function handleVoiceSearch(criteria) {
  const { normalizeCriteriaForApi, filterTasksByCriteria, describeTimeframe, priorityJa, statusJa } = await import('./voice-commands.js');
  const { queueVoicevoxSpeech } = await import('../services/tts-adapter.js');
  try {
    const normalized = normalizeCriteriaForApi(criteria);
    const filter = {};
    if (normalized.status) {
      filter.status = normalized.status;
    }
    const res = await window.electronAPI.tasksList(filter);
    if (!res?.success) throw new Error(res?.error || '検索に失敗しました');
    let list = Array.isArray(res.items) ? res.items : [];
    list = filterTasksByCriteria(list, normalized);
    const { voiceMsg } = getEls();
    if (list.length === 0) {
      const summary = '条件に一致するタスクはありません。';
      if (voiceMsg) voiceMsg.textContent = summary;
      await queueVoicevoxSpeech(summary, { speedScale: 1.0 });
      return;
    }
    const timeframeLabel = describeTimeframe(normalized.timeframe);
    const summaryLines = [`${timeframeLabel}のタスクは${list.length}件です。`];
    list.slice(0, 10).forEach((task) => {
      summaryLines.push(`${task.title}、優先度${priorityJa(task.priority)}、ステータス${statusJa(task.status)}。`);
    });
    const summary = summaryLines.join('\n');
    if (voiceMsg) voiceMsg.textContent = summaryLines.join(' ');
    await queueVoicevoxSpeech(summary, { speedScale: 1.05 });
  } catch (error) {
    console.error('[Tasks] 検索コマンドエラー:', error);
    const { voiceMsg } = getEls();
    if (voiceMsg) voiceMsg.textContent = '検索に失敗しました。';
  }
}

