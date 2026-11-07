/* side-panel.js: right-hand collapsible drawer holding <details> sections. Pure state helpers are node-testable; mount() builds DOM. UMD: SidePanel. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.SidePanel = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var KEY = 'sidePanelOpen';
  function parseState(raw) { return raw === '1'; }
  function serializeState(open) { return open ? '1' : '0'; }
  function mount(host) {
    var d = host.ownerDocument, ls = null;
    try { ls = root.localStorage; } catch (e) {}
    var tab = d.createElement('button'); tab.type = 'button'; tab.className = 'sp-tab'; tab.setAttribute('aria-controls', 'sp-body');
    var body = d.createElement('div'); body.className = 'sp-body'; body.id = 'sp-body';
    host.classList.add('sp'); host.append(tab, body);
    var isOpen = false;
    function set(v, save) {
      isOpen = !!v; host.classList.toggle('sp-open', isOpen);
      tab.setAttribute('aria-expanded', String(isOpen)); tab.textContent = isOpen ? 'Settings ›' : '‹ Settings';
      if (save && ls) try { ls.setItem(KEY, serializeState(isOpen)); } catch (e) {}
    }
    tab.addEventListener('click', function () { set(!isOpen, true); });
    set(parseState(ls && ls.getItem(KEY)), false);
    return {
      addSection: function (id, title, el, o) {
        var s = d.createElement('details'); s.className = 'sp-sec'; s.id = id; s.open = !!(o && o.open);
        var sum = d.createElement('summary'); sum.textContent = title;
        s.append(sum, el); body.append(s); return s;
      },
      open: function () { set(true, true); }, close: function () { set(false, true); },
      toggle: function () { set(!isOpen, true); }, isOpen: function () { return isOpen; }
    };
  }
  return { KEY: KEY, parseState: parseState, serializeState: serializeState, mount: mount };
});
