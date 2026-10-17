// Contact developer form for privacy.html and terms.html.
// Messages go through FormSubmit. The endpoint below is a FormSubmit alias;
// the destination inbox is configured on FormSubmit's side, not in this file.
(function () {
  var ENDPOINT = 'https://formsubmit.co/ajax/1c8bd18d13656498c8881cf158c05702';
  var ACTIVATED_PAGE = '/privacy.html';

  function buildPayload(name, email, message, page) {
    var payload = {
      _subject: 'mooInvoicer: message from the Contact developer form',
      _template: 'box',
      _captcha: 'false',
      page: page,
      message: message
    };
    if (name) payload.name = name;
    if (email) payload.email = email;
    return payload;
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text) n.textContent = text;
    return n;
  }

  function open(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    var first = dialog.querySelector('textarea');
    if (first) first.focus();
  }

  function close(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function setup(button) {
    var dialog = el('dialog', { class: 'contact-dev-dialog', 'aria-labelledby': 'contact-dev-title' });
    var form = el('form', { class: 'contact-dev-form', novalidate: '' });
    form.appendChild(el('h2', { id: 'contact-dev-title' }, 'Contact developer'));

    var nameLabel = el('label', {}, 'Name (optional)');
    var nameInput = el('input', { type: 'text', name: 'name', autocomplete: 'name', maxlength: '200' });
    nameLabel.appendChild(nameInput);

    var emailLabel = el('label', {}, 'Your email for a reply (optional)');
    var emailInput = el('input', { type: 'email', name: 'email', autocomplete: 'email', maxlength: '320' });
    emailLabel.appendChild(emailInput);

    var msgLabel = el('label', {}, 'Message');
    var msgInput = el('textarea', { name: 'message', rows: '6', required: '', maxlength: '5000' });
    msgLabel.appendChild(msgInput);

    var honey = el('input', { type: 'text', name: '_honey', tabindex: '-1', autocomplete: 'off', class: 'contact-dev-honey', 'aria-hidden': 'true' });

    var status = el('p', { class: 'contact-dev-status', role: 'status', 'aria-live': 'polite' });
    var actions = el('div', { class: 'contact-dev-actions' });
    var cancel = el('button', { type: 'button', class: 'contact-dev-cancel' }, 'Cancel');
    var send = el('button', { type: 'submit', class: 'contact-dev-send' }, 'Send');
    actions.appendChild(cancel);
    actions.appendChild(send);

    [nameLabel, emailLabel, msgLabel, honey, status, actions].forEach(function (n) { form.appendChild(n); });
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    button.addEventListener('click', function () {
      status.textContent = '';
      open(dialog);
    });
    cancel.addEventListener('click', function () { close(dialog); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var message = msgInput.value.trim();
      var email = emailInput.value.trim();
      if (!message) { status.textContent = 'Please write a message first.'; msgInput.focus(); return; }
      if (email && !emailInput.checkValidity()) { status.textContent = 'That email address does not look right.'; emailInput.focus(); return; }
      if (honey.value) { status.textContent = 'Thanks, your message was sent.'; return; }

      send.disabled = true;
      status.textContent = 'Sending...';
      var init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildPayload(nameInput.value.trim(), email, message, location.pathname))
      };
      if (location.origin === 'https://invoicer.moo.llc') {
        // FormSubmit activated this form for the privacy page; send that as the referrer from both pages.
        init.referrer = ACTIVATED_PAGE;
        init.referrerPolicy = 'unsafe-url';
      }
      fetch(ENDPOINT, init)
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          var ok = res.ok && String(res.j.success) === 'true';
          if (!ok) throw new Error(res.j.message || 'send failed');
          form.reset();
          status.textContent = 'Thanks, your message was sent.';
        })
        .catch(function () {
          status.textContent = 'Could not send right now. Please try again later.';
        })
        .then(function () { send.disabled = false; });
    });
  }

  function init() {
    document.querySelectorAll('[data-contact-developer]').forEach(setup);
  }

  window.__contactDeveloper = { buildPayload: buildPayload, ENDPOINT: ENDPOINT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
