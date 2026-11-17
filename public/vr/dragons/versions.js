/* versions.js: the list of versions of Two Dragons, October, shown on the opening card of each.
 *
 * /vr/dragons is always the newest; the older ones stay where they are, frozen, at /vr/dragons/v1,
 * /vr/dragons/v2, ... Every version's page loads this one file (the root's copy), so a new version
 * is added here once and every older page lists it too. The script tag says which page it is on:
 *   <script src=".../versions.js" data-current="v2"></script>
 */
(function () {
  var VERSIONS = [
    { id: 'v3', path: '', name: 'Fetch', when: '17 Nov 2026', what: 'throw a ball off the ledge; they race for it' },
    { id: 'v2', path: 'v2', name: 'Dusk', when: '16 Nov 2026', what: 'the sunset look, no ball' },
    { id: 'v1', path: 'v1', name: 'Afternoon', when: '15 Nov 2026', what: 'the first, bright one' },
  ];
  var me = document.currentScript;
  var current = (me && me.getAttribute('data-current')) || VERSIONS[0].id;
  // The root of the piece: this file lives there.
  var src = (me && me.src) || '';
  var root = src.slice(0, src.lastIndexOf('/') + 1); // ends in '/'
  var rootPage = new URL(root, location.href).pathname.replace(/\/$/, '') || '/';

  function href(v) {
    var page = v.path ? (rootPage === '/' ? '' : rootPage) + '/' + v.path : rootPage;
    return page;
  }

  function render() {
    var card = document.getElementById('card');
    if (!card || document.getElementById('versions')) return;
    var box = document.createElement('nav');
    box.id = 'versions';
    box.setAttribute('aria-label', 'Versions');
    box.style.cssText = 'margin:18px auto 0;max-width:560px;font:13px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#d9c7ad;text-shadow:0 1px 10px rgba(0,0,0,.8)';
    var title = document.createElement('div');
    title.textContent = 'Versions';
    title.style.cssText = 'letter-spacing:.08em;text-transform:uppercase;font-size:11px;opacity:.75';
    box.appendChild(title);
    for (var i = 0; i < VERSIONS.length; i++) {
      var v = VERSIONS[i];
      var line = document.createElement('div');
      var label = v.id + ' · ' + v.name + (i === 0 ? ' (newest)' : '');
      var a = document.createElement(v.id === current ? 'strong' : 'a');
      a.textContent = label;
      if (v.id === current) a.style.color = '#fbf3e4';
      else {
        a.href = href(v);
        a.style.cssText = 'color:#f6b24a;text-decoration:none;border-bottom:1px solid rgba(246,178,74,.4)';
      }
      line.appendChild(a);
      line.appendChild(document.createTextNode(' — ' + v.what + ', ' + v.when + (v.id === current ? ' (this one)' : '')));
      box.appendChild(line);
    }
    card.appendChild(box);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
  window.__versions = VERSIONS;
})();
