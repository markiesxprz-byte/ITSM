// Workers can't open SMTP sockets, so email goes through an HTTP API (Resend).
// Without RESEND_API_KEY, messages are logged instead of sent — the app keeps
// working with zero email configuration, same as the Node version.
async function sendMail(env, { to, subject, text }) {
  if (env.NOTIFICATIONS_ENABLED === 'false' || !to) return;
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev-mode] To: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.FROM_EMAIL || 'no-reply@example.com', to: [to], subject, text }),
    });
    if (!res.ok) console.error('[email] send failed:', res.status, await res.text());
  } catch (err) {
    console.error('[email] send failed:', err.message); // never break the ticket action
  }
}

const label = (s) => String(s).replace(/_/g, ' ');

export function makeNotifier(c) {
  return makeNotifierFromEnv(c.env, c.env.APP_URL || new URL(c.req.url).origin);
}

// The scheduled SLA job has no incoming request, so it builds the notifier from the environment alone.
export function makeNotifierFromEnv(env, appUrl) {
  const sig = '— Infovantage ITSM Service Desk';
  const hi = (n) => `Hi ${n || ''},\n\n`;
  return {
    sendMail: (m) => sendMail(env, m),
    slaAtRisk: ({ to, name, ticketType, number, title, remaining }) =>
      sendMail(env, { to, subject: `[${number}] SLA at risk`, text: `${hi(name)}${label(ticketType)} ${number} — "${title}" — is at risk of breaching its resolution target (about ${remaining} minutes left).\n\nView it: ${appUrl || 'sign in to your service desk'}\n\n${sig}` }),
    slaBreached: ({ to, name, ticketType, number, title, what, escalated }) =>
      sendMail(env, { to, subject: `[${number}] SLA breached: ${what}`, text: `${hi(name)}${label(ticketType)} ${number} — "${title}" — has breached its ${what} target.${escalated ? ' It has been escalated.' : ''}\n\nView it: ${appUrl || 'sign in to your service desk'}\n\n${sig}` }),
    ticketCreated: ({ to, name, ticketType, number, title }) =>
      sendMail(env, { to, subject: `[${number}] ${title}`, text: `${hi(name)}Your ${label(ticketType)} ${number} — "${title}" — has been logged.\n\nView it: ${appUrl}\n\n${sig}` }),
    assigned: ({ to, name, ticketType, number, title }) =>
      sendMail(env, { to, subject: `[${number}] Assigned to you`, text: `${hi(name)}${label(ticketType)} ${number} — "${title}" — has been assigned to you.\n\nView it: ${appUrl}\n\n${sig}` }),
    statusChanged: ({ to, name, ticketType, number, title, status }) =>
      sendMail(env, { to, subject: `[${number}] Status updated: ${label(status)}`, text: `${hi(name)}${label(ticketType)} ${number} — "${title}" — is now: ${label(status)}.\n\nView it: ${appUrl}\n\n${sig}` }),
    commentAdded: ({ to, name, ticketType, number, title, author }) =>
      sendMail(env, { to, subject: `[${number}] New comment from ${author}`, text: `${hi(name)}${author} commented on ${label(ticketType)} ${number} — "${title}".\n\nView it: ${appUrl}\n\n${sig}` }),
    approvalDecision: ({ to, name, ticketType, number, title, decision }) =>
      sendMail(env, { to, subject: `[${number}] ${decision === 'approved' ? 'Approved' : 'Rejected'}`, text: `${hi(name)}${label(ticketType)} ${number} — "${title}" — was ${decision}.\n\nView it: ${appUrl}\n\n${sig}` }),
    approvalRequested: ({ to, name, ticketType, number, title }) =>
      sendMail(env, { to, subject: `[${number}] Awaiting your approval`, text: `${hi(name)}${label(ticketType)} ${number} — "${title}" — needs your approval.\n\nReview it: ${appUrl}\n\n${sig}` }),
  };
}
