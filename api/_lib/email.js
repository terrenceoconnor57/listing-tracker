const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send email via Resend API
 */
export async function sendEmail(to, subject, text) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      text
    })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Resend API error ${res.status}: ${errorBody}`);
  }

  return res.json();
}
