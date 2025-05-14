import fetch from 'node-fetch';
import fs from 'fs';
import { Dropbox } from 'dropbox';
import dayjs from 'dayjs';
(async () => {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const entries = data.entries || data;
    if (!Array.isArray(entries)) throw new Error('API did not return a list');

    const headers = ['Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Time', 'Cost (€)'];
    const rows = entries.map(e => [
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      dayjs(e.timestamp).format('DD.MM.YYYY HH:mm'),
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const filename = `wastage-${dayjs().format('YYYY-MM-DD')}.csv`;

    const dbx = new Dropbox({ accessToken: DROPBOX_TOKEN, fetch });
    const fileBuffer = Buffer.from(csvContent, 'utf8');

    console.log('Uploading to:', `/${filename}`);

    await dbx.filesUpload({
      path: `/${filename}`, // uploads to /Apps/castle-wastage-tracker/
      contents: fileBuffer,
      mode: { '.tag': 'overwrite' },
      autorename: false,
      mute: false
    });

    console.log(`✅ Uploaded ${filename} to Dropbox.`);
  } catch (err) {
    console.error('❌ Failed to send report:', err.message);
  }
})();
