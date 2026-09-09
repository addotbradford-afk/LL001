(function () {
  'use strict';
  const home = document.getElementById('scenarioHome');
  const dialog = document.getElementById('returnHomeDialog');
  const stay = document.getElementById('stayInScenario');
  if (!home || !dialog || !stay) return;

  home.addEventListener('click', function (event) {
    event.preventDefault();
    dialog.showModal();
    stay.focus();
  });
  stay.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('close', function () { home.focus(); });
  // Escape cancels this dialog without closing an underlying training panel.
  dialog.addEventListener('keydown', function (event) { event.stopPropagation(); });
})();
