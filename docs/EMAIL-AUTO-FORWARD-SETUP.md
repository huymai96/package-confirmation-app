# 📧 Email Auto-Forward Setup Guide

This guide shows how to automatically capture manifest attachments from supplier emails.

## Overview

When you receive emails from suppliers (Sanmar, S&S Activewear, etc.) with manifest attachments, you can automatically send those attachments to your Supply Chain app.

**Webhook URL:** `https://package-confirmation-app.vercel.app/api/email-webhook`
**Secret Key:** `promos-ink-email-2024` (set in Vercel env as `EMAIL_WEBHOOK_SECRET`)

---

## Option 1: Microsoft Power Automate (Recommended)

Since you're using Microsoft/OneDrive, this is the easiest option.

### Step 1: Go to Power Automate
1. Go to https://flow.microsoft.com
2. Sign in with your Microsoft account

### Step 2: Create New Flow
1. Click **+ Create** → **Automated cloud flow**
2. Name it: "Manifest Email to Supply Chain"
3. Trigger: **When a new email arrives (V3)** - Office 365 Outlook
4. Click **Create**

### Step 3: Configure Trigger
Set these conditions to only process supplier emails:

```
Folder: Inbox
From: Contains any of: sanmar.com, ssactivewear.com
Has Attachment: Yes
Include Attachments: Yes
```

### Step 4: Add HTTP Action
1. Click **+ New step**
2. Search for **HTTP**
3. Select **HTTP** action
4. Configure:

```
Method: POST
URI: https://package-confirmation-app.vercel.app/api/email-webhook
Headers:
  Authorization: Bearer promos-ink-email-2024
  Content-Type: application/json

Body:
{
  "from": "@{triggerOutputs()?['body/from']}",
  "subject": "@{triggerOutputs()?['body/subject']}",
  "attachments": @{triggerOutputs()?['body/attachments']}
}
```

### Step 5: Save and Test
1. Save the flow
2. Have a supplier send a test email with a manifest
3. Check the Supply Chain app → Manifests tab

---

## Option 2: Zapier

### Step 1: Create Zap
1. Go to https://zapier.com
2. Create account if needed
3. Click **+ Create Zap**

### Step 2: Trigger - Email
1. Search for your email provider (Gmail, Outlook, etc.)
2. Choose **New Email Matching Search** or **New Attachment**
3. Connect your email account
4. Set search: `from:sanmar.com OR from:ssactivewear.com has:attachment`

### Step 3: Action - Webhook
1. Click **+** to add action
2. Search for **Webhooks by Zapier**
3. Choose **POST**
4. Configure:

```
URL: https://package-confirmation-app.vercel.app/api/email-webhook
Payload Type: JSON
Data:
  from: (select email from field)
  subject: (select email subject)
  attachment_filename: (select attachment name)
  attachment_base64: (select attachment content - base64)
Headers:
  Authorization: Bearer promos-ink-email-2024
```

### Step 4: Turn On
1. Test the Zap
2. Turn it on

---

## Option 3: Make.com (Integromat)

### Step 1: Create Scenario
1. Go to https://make.com
2. Create new scenario

### Step 2: Email Module
1. Add **Email** → **Watch emails**
2. Connect your email
3. Filter: From contains "sanmar" or "ssactivewear"

### Step 3: HTTP Module
1. Add **HTTP** → **Make a request**
2. Configure:

```
URL: https://package-confirmation-app.vercel.app/api/email-webhook
Method: POST
Headers:
  Authorization: Bearer promos-ink-email-2024
  Content-Type: application/json
Body type: Raw
Content type: JSON
Request content:
{
  "from": "{{1.from.address}}",
  "subject": "{{1.subject}}",
  "attachments": [
    {
      "filename": "{{1.attachments[].filename}}",
      "content": "{{1.attachments[].data}}"
    }
  ]
}
```

---

## Option 4: Gmail Filter + Google Apps Script

### Step 1: Create Gmail Filter
1. In Gmail, create a filter:
   - From: `sanmar.com OR ssactivewear.com`
   - Has attachment: Yes
   - Apply label: `Manifests`

### Step 2: Create Apps Script
1. Go to https://script.google.com
2. Create new project
3. Paste this code:

```javascript
function processManifestEmails() {
  const label = GmailApp.getUserLabelByName('Manifests');
  const threads = label.getThreads(0, 10);
  
  const WEBHOOK_URL = 'https://package-confirmation-app.vercel.app/api/email-webhook';
  const SECRET = 'promos-ink-email-2024';
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      if (message.isUnread()) {
        const attachments = message.getAttachments();
        
        attachments.forEach(att => {
          const filename = att.getName().toLowerCase();
          if (filename.endsWith('.xlsx') || filename.endsWith('.csv')) {
            
            const payload = {
              from: message.getFrom(),
              subject: message.getSubject(),
              attachments: [{
                filename: att.getName(),
                content: Utilities.base64Encode(att.getBytes())
              }]
            };
            
            UrlFetchApp.fetch(WEBHOOK_URL, {
              method: 'POST',
              contentType: 'application/json',
              headers: { 'Authorization': 'Bearer ' + SECRET },
              payload: JSON.stringify(payload)
            });
          }
        });
        
        message.markRead();
      }
    });
  });
}

// Run every 15 minutes
function createTrigger() {
  ScriptApp.newTrigger('processManifestEmails')
    .timeBased()
    .everyMinutes(15)
    .create();
}
```

4. Run `createTrigger()` once to set up automatic checking

---

## Supported Suppliers (Auto-Detected)

The webhook automatically detects these suppliers:

| Supplier | Detection | Saves As |
|----------|-----------|----------|
| Sanmar | from contains "sanmar" | sanmar.xlsx |
| S&S Activewear | from contains "ssactivewear" or "s&s" | s&s.xlsx |
| Alphabroder | from contains "alphabroder" | alphabroder.xlsx |

Unknown suppliers will use the original filename.

---

## Testing the Webhook

You can test manually with curl:

```bash
curl -X POST "https://package-confirmation-app.vercel.app/api/email-webhook" \
  -H "Authorization: Bearer promos-ink-email-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "shipping@sanmar.com",
    "subject": "Your Shipment Manifest",
    "attachments": [{
      "filename": "manifest.xlsx",
      "content": "BASE64_ENCODED_FILE_HERE"
    }]
  }'
```

Or visit the endpoint info:
https://package-confirmation-app.vercel.app/api/email-webhook

---

## Troubleshooting

### Attachments not uploading?
- Check that the email has `.xlsx`, `.xls`, or `.csv` attachments
- Verify the webhook secret matches
- Check Vercel logs for errors

### Wrong supplier detected?
- The system checks the `from` address and `subject` line
- You can manually upload via the Manifests tab

### Need to add more suppliers?
- Contact your admin to update the `MANIFEST_PATTERNS` in the webhook code

---

## Security

- The webhook requires a secret key in the Authorization header
- Only spreadsheet files (.xlsx, .xls, .csv) are processed
- Files are stored securely in Vercel Blob storage

