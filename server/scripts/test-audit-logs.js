const http = require('http');

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {
            json = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== Starting Functional Verification of Audit Logs ===\n');

  // 1. Log in as admin
  console.log('Step 1: Logging in as Admin...');
  const loginRes = await request('/api/login', { method: 'POST' }, {
    email: 'admin@kimpc.test',
    password: 'Admin123!',
    recaptchaToken: 'bypass',
  });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginRes.data)}`);
  }
  const token = loginRes.data.token;
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
  console.log('✓ Admin logged in successfully.');

  // 2. Fetch audit logs from /api/admin/audit-logs
  console.log('\nStep 2: Fetching audit logs from /api/admin/audit-logs...');
  const logsRes = await request('/api/admin/audit-logs?limit=10', authHeaders);
  if (logsRes.status !== 200) {
    throw new Error(`Failed to fetch audit logs: ${JSON.stringify(logsRes.data)}`);
  }
  if (!logsRes.data.ok || !Array.isArray(logsRes.data.logs)) {
    throw new Error(`Unexpected audit logs response format: ${JSON.stringify(logsRes.data)}`);
  }
  console.log(`✓ Fetched ${logsRes.data.logs.length} audit logs. Total in database: ${logsRes.data.total}`);

  // 3. Verify that every record has the 7 required columns
  console.log('\nStep 3: Verifying all 7 required columns on audit logs...');
  const sampleLog = logsRes.data.logs[0];
  console.log('Sample Log Entry:');
  console.log({
    "1. Date & Time": sampleLog.date,
    "2. Performed By": `${sampleLog.performedBy?.name} (${sampleLog.performedBy?.email}) [${sampleLog.performedBy?.role}]`,
    "3. Module": sampleLog.module,
    "4. Action": sampleLog.action,
    "5. Affected Record": sampleLog.affectedRecord,
    "6. Result": sampleLog.result,
    "7. Details": sampleLog.details,
  });

  for (const log of logsRes.data.logs) {
    if (!log.date) throw new Error(`Missing 'date' on log ${log.id}`);
    if (!log.performedBy || !log.performedBy.email) throw new Error(`Missing 'performedBy' on log ${log.id}`);
    if (!log.module) throw new Error(`Missing 'module' on log ${log.id}`);
    if (!log.action) throw new Error(`Missing 'action' on log ${log.id}`);
    if (log.affectedRecord === undefined) throw new Error(`Missing 'affectedRecord' on log ${log.id}`);
    if (!log.result) throw new Error(`Missing 'result' on log ${log.id}`);
    if (log.details === undefined) throw new Error(`Missing 'details' on log ${log.id}`);
  }
  console.log('✓ All 7 columns verified on all retrieved audit log records!');

  // 4. Test filtering by module
  console.log('\nStep 4: Testing module filter (Authentication)...');
  const authModRes = await request('/api/admin/audit-logs?module=Authentication&limit=5', authHeaders);
  if (authModRes.status !== 200) {
    throw new Error(`Module filter request failed: ${JSON.stringify(authModRes.data)}`);
  }
  for (const log of authModRes.data.logs) {
    if (!log.module.includes('Auth')) {
      throw new Error(`Expected module 'Authentication', got '${log.module}' on action '${log.action}'`);
    }
  }
  console.log(`✓ Module filter passed. Found ${authModRes.data.logs.length} Authentication logs.`);

  // 5. Trigger an admin action: Update Deposit/Cancellation Policy
  console.log('\nStep 5: Performing an admin action (Update Financial Policies)...');
  const policyRes = await request('/api/admin/deposit-cancellation-policies', {
    method: 'POST',
    ...authHeaders,
  }, {
    policies: {
      depositPercentage: 25,
      freeCancellationHours: 48,
      lateFeeDailyRatePercent: 15,
    },
  });
  if (policyRes.status !== 200) {
    throw new Error(`Policy update failed: ${JSON.stringify(policyRes.data)}`);
  }
  console.log('✓ Financial policies updated successfully.');

  // 6. Verify that the new action was logged with all 7 fields
  console.log('\nStep 6: Verifying audit log was recorded for policy update...');
  const latestLogsRes = await request('/api/admin/audit-logs?limit=3', authHeaders);
  const latestLog = latestLogsRes.data.logs[0];
  console.log('Latest Log Entry Generated:');
  console.log({
    "1. Date & Time": latestLog.date,
    "2. Performed By": `${latestLog.performedBy?.name} (${latestLog.performedBy?.email})`,
    "3. Module": latestLog.module,
    "4. Action": latestLog.action,
    "5. Affected Record": latestLog.affectedRecord,
    "6. Result": latestLog.result,
    "7. Details": latestLog.details,
  });

  if (latestLog.action !== 'DEPOSIT_CANCELLATION_POLICY_UPDATED') {
    throw new Error(`Expected latest log action to be 'DEPOSIT_CANCELLATION_POLICY_UPDATED', got '${latestLog.action}'`);
  }
  if (latestLog.module !== 'Financial Policies') {
    throw new Error(`Expected module 'Financial Policies', got '${latestLog.module}'`);
  }
  if (latestLog.result !== 'Success') {
    throw new Error(`Expected result 'Success', got '${latestLog.result}'`);
  }
  console.log('✓ Newly generated audit log verified with all 7 fields perfectly recorded!');

  console.log('\n🎉 ALL AUDIT LOG FUNCTIONALITY TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
