/**
 * スケジュール機能で参照する主要DOMノードを定義する。
 * - テストや再マウントで null になり得るため、利用側で存在チェックを行うこと。
 */
export const scheduleForm = document.getElementById('scheduleForm');
export const scheduleItems = document.getElementById('scheduleItems');
export const titleInput = document.getElementById('title');
export const dateInput = document.getElementById('date');
export const timeInput = document.getElementById('time');
export const descriptionInput = document.getElementById('description');
export const scheduleFormContainer = document.querySelector('.schedule-form-container');
export const scheduleHeading = scheduleFormContainer ? scheduleFormContainer.querySelector('h3') : null;
export const scheduleSubmitBtn = document.getElementById('scheduleSubmitBtn');
export const scheduleCancelEditBtn = document.getElementById('scheduleCancelEditBtn');
export const scheduleEditHint = document.getElementById('scheduleEditHint');
export const scheduleCsvExportBtn = document.getElementById('scheduleCsvExportBtn');
export const scheduleCsvImportBtn = document.getElementById('scheduleCsvImportBtn');
export const scheduleCsvInput = document.getElementById('scheduleCsvInput');
export const bulkAddBtn = document.getElementById('bulkAddBtn');
