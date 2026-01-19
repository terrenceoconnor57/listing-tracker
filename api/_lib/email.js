const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Send email via Resend API
 */
export async function sendEmail(to, subject, text) {
  console.log(`Sending email to ${to} from ${process.env.FROM_EMAIL}`);
  
  const body = {
    from: process.env.FROM_EMAIL,
    to,
    subject,
    text
  };

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const responseText = await res.text();
  console.log(`Resend response ${res.status}: ${responseText}`);

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${responseText}`);
  }

  return JSON.parse(responseText);
}
