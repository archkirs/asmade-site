(() => {
  const shells = document.querySelectorAll('[data-record-shell]');

  shells.forEach((shell) => {
    const tabs = Array.from(shell.querySelectorAll('[role="tab"]'));
    const panels = Array.from(shell.querySelectorAll('[role="tabpanel"]'));
    const evidenceTab = tabs.find((tab) => tab.dataset.recordTab === 'evidence');
    const evidenceGroups = Array.from(shell.querySelectorAll('[data-evidence-group]'));
    const evidenceSelectors = Array.from(shell.querySelectorAll('[data-evidence-select]'));

    const activateTab = (targetName, focus = false) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.recordTab === targetName;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        tab.classList.toggle('is-active', active);
        if (active && focus) tab.focus();
      });

      panels.forEach((panel) => {
        const active = panel.dataset.recordPanel === targetName;
        panel.hidden = !active;
        panel.classList.toggle('is-active', active);
      });
    };

    const activateEvidence = (findingId) => {
      if (!findingId || evidenceGroups.length === 0) return;

      evidenceGroups.forEach((group) => {
        const active = group.dataset.evidenceGroup === findingId;
        group.hidden = !active;
        group.classList.toggle('is-active', active);
      });

      evidenceSelectors.forEach((selector) => {
        const active = selector.dataset.evidenceSelect === findingId;
        selector.classList.toggle('is-active', active);
        selector.setAttribute('aria-pressed', String(active));
      });
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.recordTab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();

        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;

        activateTab(tabs[nextIndex].dataset.recordTab, true);
      });
    });

    shell.querySelectorAll('[data-view-evidence]').forEach((button) => {
      button.addEventListener('click', () => {
        const findingId = button.dataset.viewEvidence;
        activateEvidence(findingId);
        activateTab('evidence');
        evidenceTab?.focus({ preventScroll: true });
        shell.querySelector('[data-record-panel="evidence"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    evidenceSelectors.forEach((selector) => {
      selector.addEventListener('click', () => activateEvidence(selector.dataset.evidenceSelect));
    });

    const initialTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.recordTab || 'record';
    activateTab(initialTab);

    const initialEvidence = evidenceSelectors.find((selector) => selector.classList.contains('is-active'))?.dataset.evidenceSelect || evidenceGroups[0]?.dataset.evidenceGroup;
    if (initialEvidence) activateEvidence(initialEvidence);
  });
})();
