/**
 * スケジュールドロワーのタブ切り替え挙動を提供する。
 */
export function setupTabs() {
  /**
   * 各タブボタンに共通のクリックハンドラを付与し、対応コンテンツを表示する。
   */
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      tabButtons.forEach((btn) => btn.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));

      button.classList.add('active');
      const targetContent = document.querySelector(`[data-tab-content="${targetTab}"]`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}
