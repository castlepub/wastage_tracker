// test-date-logic.js - Test the date calculation logic
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);

function testDateLogic(simulatedTime) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING AT: ${simulatedTime.format('YYYY-MM-DD HH:mm')} UTC`);
  console.log(`${'='.repeat(60)}`);

  // Current (broken) logic
  const now = simulatedTime;
  const today6AM = now.startOf('day').add(6, 'hour');
  const brokenStartDate = now.isBefore(today6AM) 
    ? today6AM.subtract(24, 'hour')  // If before 6 AM, use yesterday 6 AM
    : today6AM;                      // If after 6 AM, use TODAY 6 AM
  const brokenEndDate = brokenStartDate.add(24, 'hour');

  console.log('CURRENT (BROKEN) LOGIC:');
  console.log('- now.isBefore(today6AM):', now.isBefore(today6AM));
  console.log('- today6AM:', today6AM.format('YYYY-MM-DD HH:mm'));
  console.log('- startDate:', brokenStartDate.format('YYYY-MM-DD HH:mm'));
  console.log('- endDate:', brokenEndDate.format('YYYY-MM-DD HH:mm'));

  // Fixed logic - always report on yesterday
  const fixedStartDate = now.startOf('day').subtract(1, 'day').add(6, 'hour');
  const fixedEndDate = fixedStartDate.add(24, 'hour');

  console.log('\nFIXED LOGIC (always yesterday):');
  console.log('- startDate:', fixedStartDate.format('YYYY-MM-DD HH:mm'));
  console.log('- endDate:', fixedEndDate.format('YYYY-MM-DD HH:mm'));

  // Alternative logic - relative to 6 AM
  const yesterday6AM = now.subtract(1, 'day').startOf('day').add(6, 'hour');
  const today6AMalt = now.startOf('day').add(6, 'hour');

  console.log('\nALTERNATIVE LOGIC (6AM to 6AM):');
  console.log('- startDate:', yesterday6AM.format('YYYY-MM-DD HH:mm'));
  console.log('- endDate:', today6AMalt.format('YYYY-MM-DD HH:mm'));
}

// Test at different times
const testTimes = [
  dayjs.utc('2025-07-28 05:30:00'), // 5:30 AM (before 6 AM)
  dayjs.utc('2025-07-28 06:00:00'), // 6:00 AM (exactly 6 AM - when GitHub Action runs)
  dayjs.utc('2025-07-28 06:30:00'), // 6:30 AM (after 6 AM)
  dayjs.utc('2025-07-28 12:00:00'), // 12:00 PM (noon)
  dayjs.utc('2025-07-28 23:59:00'), // 11:59 PM (end of day)
];

console.log('🔍 Testing date calculation logic at different times...\n');

testTimes.forEach(time => testDateLogic(time));

console.log('\n🎯 CONCLUSION:');
console.log('The current logic is WRONG when GitHub Action runs at 6 AM UTC!');
console.log('It reports on TODAY instead of YESTERDAY.');
console.log('\nWe need to fix this logic to always report on the previous day.'); 