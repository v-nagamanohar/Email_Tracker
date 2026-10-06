// popup.js — dashboard of tracked emails and their open status.

function fmt(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();
}

function render(tracked) {
  const list = document.getElementById("list");
  const records = Object.values(tracked || {}).sort((a, b) => b.sentAt - a.sentAt);
  if (!records.length) {
    list.innerHTML = '<li class="empty">No tracked emails yet.<br>Send an email in Gmail/Outlook to start tracking.</li>';
    return;
  }
  list.innerHTML = records
    .map((r) => {
      const status = r.opened
        ? `<span class="opened">✓ Opened (${r.opens}×)</span> · last: ${fmt(r.lastOpened)}`
        : `<span class="unopened">✗ Not opened</span>`;
      return `
        <li>
          <div class="subject">${escapeHtml(r.subject)}</div>
          <div class="to">To: ${r.to.map(escapeHtml).join(", ")}</div>
          <div class="to">Sent: ${fmt(r.sentAt)}</div>
          <div class="status">${status}</div>
        </li>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function load() {
  const resp = await chrome.runtime.sendMessage({ type: "REFRESH" });
  render(resp.tracked);
}

document.getElementById("refresh").addEventListener("click", load);
load();
