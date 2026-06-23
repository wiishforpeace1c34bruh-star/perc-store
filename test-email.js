const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

// Usage: node test-email.js <your_resend_api_key> <your_email_address>

const apiKey = process.argv[2];
const toEmail = process.argv[3];

if (!apiKey || !toEmail) {
  console.error("Usage: node test-email.js <resend_api_key> <destination_email>");
  process.exit(1);
}

const resend = new Resend(apiKey);

async function simulatePurchase() {
  try {
    console.log(`Simulating purchase for ${toEmail}...`);

    // 1. Generate a mock license key
    const mockKey = 'PERC-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    console.log(`Generated mock key: ${mockKey}`);

    // 2. Read the email template
    const templatePath = path.join(__dirname, 'email-template.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    // 3. Inject the key into the template
    htmlContent = htmlContent.replace('{{LICENSE_KEY}}', mockKey);

    console.log('Sending email via Resend...');

    // 4. Send the email
    const { data, error } = await resend.emails.send({
      from: 'perc.store <onboarding@resend.dev>', // Use onboarding@resend.dev for testing without a verified domain
      to: [toEmail],
      subject: 'Your perc.store Purchase - Access Key',
      html: htmlContent,
    });

    if (error) {
      console.error('Error sending email:', error);
      return;
    }

    console.log('Success! Email sent. Check your inbox.');
    console.log('Resend Response:', data);

  } catch (error) {
    console.error('Simulation failed:', error);
  }
}

simulatePurchase();
