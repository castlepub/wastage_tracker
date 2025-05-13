// daily-report.js
import fetch from 'node-fetch';
import fs from 'fs';
import { Dropbox } from 'dropbox';
import dayjs from 'dayjs';

// 1. CONFIG - change these before running
const API_URL = 'https://wastagetracker-production.up.railway.app/api/entries';
const DROPBOX_TOKEN = 'sl.u.AFtU3mzkZH8uZkDCyRGqt6pmIzlWmVA5rc-6w8--oqf8wNhy1CsUytB6bnoH0V1gwdyqUREDv_I9FRGl82u_urtm_m0SSM7WbXCo2472wLoNhZb_Q51TP-G0lH_M2YNzbbrJNCZj41JDDczca9Tw93TPBmjqx95-Nqvrbqn34vdkc9uetoMAkHg0U_3ErHfpoj8UKuRNBmIbDkT3tTeSMovxsac8YeBbxBtndacyc-xN0e4OxdJZVj8l1L7AgRqybVGI-h22soRuC8Qdk_9hXlvvyqFVfS4uEEWg2nQoattbBGDayQqRFNGo0KofDSIxdejS1GOB2Y_2cZAYCS53AkKWx0NkJG_gkxsVkpy7TASvt8R8Ig8KNIj2m5gHbZwhdH8SwtANlEpTQGhvHK-mY9i9TwCr6vVUXvg0jYq7cLVwdfBRj8hersS49y6s1yGjkWUBCAs5YDMifJimILYdCASLosirkgww0Xu6mmVJO1Re5J5U6ilz4IXqLPYft_JjmWSg1m3CztQpHUEawRpnSZMsZkb5zywTaj1K8xfodpQWidQXwl0EY101Uf0x_q2E3FMg1kJkk0YdzvDfKp31cpP7HqcV8qQgH638EUTAVnrVKfYYc7n9zbj_S1GlaC35J6TE7MFaGYblYBX8H89VvPZb0Ml6qTAU6-0ON0VvYEoMsJ3kAMra56ZnyPFJq9K4f7J25cFrTMjvsMgg57tfdlIvnWRHDodHItMCMyf8W0Fz763e5RXE8tyXhVpUzDN8u6w4gFFC5kCaaGn-WMuQgsImj5I47VFxNpf4V8dRJUYxVEfaxkX9ehyonHo0UrHAYBY3R9-R8htsKopQiKdaiA-DgqYgBKKk2AFUSKezBrOH0IAx75bn07UNOOdq2il1GWxGMqnU5RnBAlthCmweZK2H31KzmI3kBrd0iLbPAYg6qSh4dT7ylG5fzRDOdDd0sbZ9hraRGMIKDwoRQRhmJUsQhxojmNw4seN96EVxlL214WxTPoOpRsLT4qRneZ90Jv5pfPKrOrJ7qVC29tRTnU6UfgCqvUlj3un9r8zEIe2Z0gWtiJ183N8JW0Hhg2gJVvQxypT2u02hkqJVEE3KZ8Rf3iOIBh289Jw7PrU6e1rZFzhOc8OSZ-BMldpHimTEhaone-wUiNHL4BnXYCYdKxCN42rsJto_iaNUKEbUn8C02jSNej1yM8hWxujeJfyLM_ctcyr-MHiGnEevlZaGU6cXYMSj3JIohBi3kpFvkc0wr7M3mA_j_WPX5JAHjyXvEddpGboUQmZkpL76OAgV2-iNKkz_vGVmWXt5EZajw270g5LnVdehmpLlY6GbFmzvs4M'; // <-- replace this
const DROPBOX_FOLDER = '/The Castle Pub GmbH/wastage-report';

(async () => {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();

    if (!Array.isArray(json.entries || json)) throw new Error('Invalid response');
    const entries = json.entries || json;

    const rows = entries.map(e => [
      e.employee_name,
      e.item_name,
      e.quantity,
      e.unit,
      e.reason || '',
      dayjs(e.timestamp).format('DD.MM.YYYY HH:mm'),
      e.total_cost?.toFixed(2) || '0.00'
    ]);

    const headers = ['Employee', 'Item', 'Qty', 'Unit', 'Reason', 'Time', 'Cost (€)'];
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');

    const filename = `wastage-${dayjs().format('YYYY-MM-DD')}.csv`;
    const filepath = `/tmp/${filename}`;
    fs.writeFileSync(filepath, csv);

    const dbx = new Dropbox({ accessToken: DROPBOX_TOKEN, fetch });
    const fileBuffer = fs.readFileSync(filepath);

    await dbx.filesUpload({
      path: `${DROPBOX_FOLDER}/${filename}`,
      contents: fileBuffer,
      mode: 'overwrite'
    });

    console.log(`✅ Uploaded ${filename} to Dropbox.`);
  } catch (err) {
    console.error('❌ Failed to send report:', err.message);
    process.exit(1);
  }
})();
