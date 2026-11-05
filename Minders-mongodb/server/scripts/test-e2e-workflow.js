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
  console.log('=== Starting E2E Verification of Member & Manager Workflow ===\n');

  // 1. Log in as member
  console.log('Step 1: Logging in as Member...');
  const memberLogin = await request('/api/login', { method: 'POST' }, {
    email: 'demo.member@kimpc.test',
    password: 'Member123!',
    recaptchaToken: 'bypass',
  });
  if (memberLogin.status !== 200 || !memberLogin.data.token) {
    throw new Error(`Member login failed: ${JSON.stringify(memberLogin.data)}`);
  }
  const memberToken = memberLogin.data.token;
  const memberAuth = { headers: { Authorization: `Bearer ${memberToken}` } };
  console.log('✓ Member logged in successfully.');

  // 2. Member sends a question
  console.log('\nStep 2: Member sends an inquiry/question...');
  const questionPayload = {
    subject: 'Inquiry on John Deere Delivery Time',
    message: 'Can the tractor be delivered to Barangay 4 by 7:00 AM on Monday?',
  };
  const sendRes = await request('/api/member/support-request', {
    method: 'POST',
    ...memberAuth,
  }, questionPayload);
  if (sendRes.status !== 200 && sendRes.status !== 201) {
    throw new Error(`Failed to send question: ${JSON.stringify(sendRes.data)}`);
  }
  console.log('✓ Member question submitted. Response:', sendRes.data.message);

  // 3. Log in as manager
  console.log('\nStep 3: Logging in as Manager...');
  const managerLogin = await request('/api/login', { method: 'POST' }, {
    email: 'manager@kimpc.test',
    password: 'Manager123!',
    recaptchaToken: 'bypass',
  });
  if (managerLogin.status !== 200 || !managerLogin.data.token) {
    throw new Error(`Manager login failed: ${JSON.stringify(managerLogin.data)}`);
  }
  const managerToken = managerLogin.data.token;
  const managerAuth = { headers: { Authorization: `Bearer ${managerToken}` } };
  console.log('✓ Manager logged in successfully.');

  // 4. Manager checks inbox for member question
  console.log('\nStep 4: Manager retrieves messages...');
  const mgrMessages = await request('/api/manager/messages', managerAuth);
  if (mgrMessages.status !== 200) {
    throw new Error(`Failed to fetch manager messages: ${JSON.stringify(mgrMessages.data)}`);
  }
  const messagesList = mgrMessages.data.messages || [];
  const targetMsg = messagesList.find(m => m.subject === questionPayload.subject);
  if (!targetMsg) {
    throw new Error('Submitted question not found in Manager inbox!');
  }
  console.log(`✓ Manager found member question #${targetMsg._id}: "${targetMsg.subject}" (Status: ${targetMsg.status})`);

  // 5. Manager replies to question
  console.log('\nStep 5: Manager replies to member inquiry...');
  const replyRes = await request(`/api/manager/messages/${targetMsg._id}/reply`, {
    method: 'PATCH',
    ...managerAuth,
  }, { reply: 'Yes, operator John will arrive at 7:00 AM sharp at Barangay 4.' });
  if (replyRes.status !== 200) {
    throw new Error(`Failed to reply to message: ${JSON.stringify(replyRes.data)}`);
  }
  console.log('✓ Manager reply sent. Status:', replyRes.data.message?.status);

  // 6. Member verifies reply received
  console.log('\nStep 6: Member verifies receipt of Manager reply...');
  const memberMsgs = await request('/api/member/messages', memberAuth);
  const memberTargetMsg = (memberMsgs.data.messages || []).find(m => m._id === targetMsg._id);
  if (!memberTargetMsg || memberTargetMsg.status !== 'replied' || !memberTargetMsg.reply) {
    throw new Error(`Member messages do not show manager reply! ${JSON.stringify(memberTargetMsg)}`);
  }
  console.log(`✓ Member received reply: "${memberTargetMsg.reply}" from ${memberTargetMsg.repliedBy}`);

  // 7. Member creates a booking
  console.log('\nStep 7: Member creates a booking request...');
  const bookRes = await request('/api/applications', {
    method: 'POST',
    ...memberAuth,
  }, {
    equipment: 'John Deere 5075E Utility Tractor',
    startDate: '2028-09-10',
    endDate: '2028-09-12',
    bookingType: 'daily',
    farmLocation: 'Original Location, Malaybalay',
  });
  if (bookRes.status !== 201) {
    throw new Error(`Failed to create booking: ${JSON.stringify(bookRes.data)}`);
  }
  const bookingId = bookRes.data._id || bookRes.data.id;
  console.log(`✓ Created Pending Booking #${bookingId} (Status: ${bookRes.data.status})`);

  // 8. Pending booking: edit farm location and dates
  console.log('\nStep 8: Member edits farm location & dates of Pending booking...');
  const editRes = await request(`/api/applications/${bookingId}`, {
    method: 'PATCH',
    ...memberAuth,
  }, {
    farmLocation: 'Updated Farm Landmark, Impasug-ong, Bukidnon',
    startDate: '2028-09-11',
    endDate: '2028-09-13',
    bookingType: 'daily',
  });
  if (editRes.status !== 200) {
    throw new Error(`Pending booking edit failed: ${JSON.stringify(editRes.data)}`);
  }
  console.log(`✓ Booking updated successfully. New Location: "${editRes.data.farmLocation}" Dates: ${editRes.data.startDate} to ${editRes.data.endDate}`);

  // 9. Manager approves the booking
  console.log('\nStep 9: Manager approves the booking...');
  const approveRes = await request(`/api/applications/${bookingId}`, {
    method: 'PATCH',
    ...managerAuth,
  }, { status: 'Approved' });
  if (approveRes.status !== 200) {
    throw new Error(`Failed to approve booking: ${JSON.stringify(approveRes.data)}`);
  }
  console.log(`✓ Booking #${bookingId} is now Approved.`);

  // 10. Approved booking: member edit should be BLOCKED
  console.log('\nStep 10: Verifying Approved booking cannot be edited...');
  const blockedEditRes = await request(`/api/applications/${bookingId}`, {
    method: 'PATCH',
    ...memberAuth,
  }, { farmLocation: 'Hacked Farm Location' });
  if (blockedEditRes.status === 400) {
    console.log(`✓ Correctly blocked edit on Approved booking: "${blockedEditRes.data.error}"`);
  } else {
    throw new Error(`Expected HTTP 400 for approved booking edit, got ${blockedEditRes.status}`);
  }

  // 11. Approved booking: member requests cancellation
  console.log('\nStep 11: Member requests cancellation of Approved booking...');
  const cancelReqRes = await request(`/api/applications/${bookingId}/request-cancellation`, {
    method: 'POST',
    ...memberAuth,
  }, { reason: 'Heavy rains caused temporary soil saturation' });
  if (cancelReqRes.status !== 200) {
    throw new Error(`Failed to request cancellation: ${JSON.stringify(cancelReqRes.data)}`);
  }
  console.log(`✓ Cancellation request submitted. Booking Status: "${cancelReqRes.data.application.status}"`);

  // 12. Manager declines cancellation (test revert to Approved)
  console.log('\nStep 12: Manager declines cancellation (reverts to Approved)...');
  const declineRes = await request(`/api/applications/${bookingId}/decline-cancellation`, {
    method: 'POST',
    ...managerAuth,
  });
  if (declineRes.status !== 200) {
    throw new Error(`Failed to decline cancellation: ${JSON.stringify(declineRes.data)}`);
  }
  console.log(`✓ Manager declined cancellation. Booking reverted to: "${declineRes.data.application.status}"`);

  // 13. Member requests cancellation again, then Manager grants cancellation
  console.log('\nStep 13: Member requests cancellation again...');
  await request(`/api/applications/${bookingId}/request-cancellation`, {
    method: 'POST',
    ...memberAuth,
  }, { reason: 'Machinery no longer required for this season' });

  console.log('Step 14: Manager grants cancellation...');
  const grantRes = await request(`/api/applications/${bookingId}/grant-cancellation`, {
    method: 'POST',
    ...managerAuth,
  });
  if (grantRes.status !== 200) {
    throw new Error(`Failed to grant cancellation: ${JSON.stringify(grantRes.data)}`);
  }
  console.log(`✓ Manager granted cancellation. Final Booking Status: "${grantRes.data.application.status}"`);

  // 15. Pending direct cancel test
  console.log('\nStep 15: Testing direct cancel on Pending booking...');
  const pendingBooking = await request('/api/applications', {
    method: 'POST',
    ...memberAuth,
  }, {
    equipment: 'Kubota DC-70 Plus Harvester',
    startDate: '2028-10-01',
    endDate: '2028-10-03',
    bookingType: 'daily',
    farmLocation: 'Pending Test Farm',
  });
  const pendingId = pendingBooking.data._id || pendingBooking.data.id;
  const directCancelRes = await request(`/api/applications/${pendingId}`, {
    method: 'DELETE',
    ...memberAuth,
  });
  if (directCancelRes.status !== 200 || directCancelRes.data.application?.status !== 'Cancelled') {
    throw new Error(`Direct cancellation failed: ${JSON.stringify(directCancelRes.data)}`);
  }
  console.log(`✓ Pending booking #${pendingId} directly cancelled: Status: "${directCancelRes.data.application.status}"`);

  console.log('\n🎉 ALL E2E WORKFLOW TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
