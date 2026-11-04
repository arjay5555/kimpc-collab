const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const Account = require("../models/Account");

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

async function runTests() {
  console.log("\n========================================================");
  console.log("   KIMPC FORGOT & RESET PASSWORD VERIFICATION SUITE   ");
  console.log("========================================================\n");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✓ Connected to MongoDB");

  const testEmail = "test-reset-verify@kimpc.test";
  const testCoopId = "M269999";
  const initialPassword = "initialPassword123!";
  const newPassword = "newSecurePassword456#";

  // Clean up any existing test user
  await Account.deleteOne({ email: testEmail });

  // 1. Create a verified test account with cooperative ID
  const testAccount = await Account.create({
    fullName: "Test Reset Member",
    email: testEmail,
    passwordHash: await bcrypt.hash(initialPassword, 10),
    role: "member",
    cooperativeId: testCoopId,
    emailVerified: true,
    verificationStatus: "verified",
    tokenVersion: 0,
  });
  console.log(`✓ Test account created: ${testEmail} (Cooperative ID: ${testCoopId})`);

  // 2. Test Forgot Password - Unknown Identifier
  console.log("\n--- Test 1: Forgot Password for Unknown Identifier (Generic Response) ---");
  const unknownRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "nonexistent-ghost-account@kimpc.test" }),
  });
  const unknownData = await unknownRes.json();
  if (unknownRes.status === 200 && unknownData.message?.includes("If an eligible account exists")) {
    console.log("✓ Correctly returned generic message for unknown identifier without leaking existence.");
  } else {
    throw new Error(`Expected generic 200 response, got ${unknownRes.status}: ${JSON.stringify(unknownData)}`);
  }

  // 3. Test Forgot Password - Using Cooperative ID (e.g. M269999)
  console.log("\n--- Test 2: Forgot Password using Cooperative ID (M269999) ---");
  const forgotCoopRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: testCoopId }),
  });
  const forgotCoopData = await forgotCoopRes.json();
  if (forgotCoopRes.status === 200 && forgotCoopData.message?.includes("If an eligible account exists")) {
    console.log("✓ Correctly accepted Cooperative ID and returned generic success message.");
  } else {
    throw new Error(`Forgot password by Cooperative ID failed: ${JSON.stringify(forgotCoopData)}`);
  }

  // Verify DB state that reset token was generated for that account's email
  const accWithToken1 = await Account.findOne({ cooperativeId: testCoopId });
  if (!accWithToken1.resetPasswordToken || !accWithToken1.resetPasswordExpires) {
    throw new Error("Token or expiry not stored in MongoDB for Cooperative ID lookup!");
  }
  const tokenHash1 = accWithToken1.resetPasswordToken;
  console.log("✓ Reset token hash generated & stored for linked email:", accWithToken1.email);
  console.log("✓ Hash:", tokenHash1.slice(0, 16) + "...");
  console.log("✓ Expiration set to:", accWithToken1.resetPasswordExpires);

  // 4. Test Forgot Password - Using Email Address
  console.log("\n--- Test 3: Forgot Password using Email Address ---");
  const forgotEmailRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: testEmail }),
  });
  const forgotEmailData = await forgotEmailRes.json();
  if (forgotEmailRes.status === 200 && forgotEmailData.message?.includes("If an eligible account exists")) {
    console.log("✓ Correctly accepted Email address and returned generic success message.");
  } else {
    throw new Error(`Forgot password by Email failed: ${JSON.stringify(forgotEmailData)}`);
  }

  // Verify token replacement
  const accWithToken2 = await Account.findOne({ email: testEmail });
  if (accWithToken2.resetPasswordToken === tokenHash1) {
    throw new Error("Previous token was not replaced by the new request!");
  }
  console.log("✓ Previous token was successfully replaced with a new random token.");

  // For testing reset, generate a known rawToken and store its SHA-256 hash
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  accWithToken2.resetPasswordToken = hashedToken;
  accWithToken2.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
  await accWithToken2.save();

  // 5. Test Verify Reset Token Endpoint
  console.log("\n--- Test 4: Verify Reset Token Endpoint ---");
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-reset-token?token=${rawToken}`);
  const verifyData = await verifyRes.json();
  if (verifyRes.status === 200 && verifyData.valid) {
    console.log("✓ Verify reset token returned valid: true for active token.");
  } else {
    throw new Error(`Token verification failed: ${JSON.stringify(verifyData)}`);
  }

  // 6. Test Password Policy Validation
  console.log("\n--- Test 5: Server-side Password Policy Enforcement ---");
  const shortPassRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, newPassword: "123", confirmPassword: "123" }),
  });
  if (shortPassRes.status === 400) {
    console.log("✓ Short password (< 6 chars) properly rejected with 400.");
  } else {
    throw new Error("Short password was not rejected!");
  }

  const mismatchRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, newPassword: "passwordABC123", confirmPassword: "differentPassword" }),
  });
  if (mismatchRes.status === 400) {
    console.log("✓ Password mismatch properly rejected with 400.");
  } else {
    throw new Error("Password mismatch was not rejected!");
  }

  // Get active session token BEFORE reset to test session invalidation
  const loginBeforeReset = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: initialPassword, recaptchaToken: "bypass" }),
  });
  const loginBeforeData = await loginBeforeReset.json();
  const preResetToken = loginBeforeData.token;
  if (!preResetToken) {
    throw new Error(`Failed to obtain pre-reset login token: ${JSON.stringify(loginBeforeData)}`);
  }
  console.log("✓ Pre-reset session established with initial password.");

  // 7. Test Simultaneous Submissions / Single-Use Token Protection
  console.log("\n--- Test 6: Simultaneous Reset Submissions & Single-Use Enforcement ---");
  const [res1, res2] = await Promise.all([
    fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword, confirmPassword: newPassword }),
    }),
    fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword, confirmPassword: newPassword }),
    }),
  ]);

  const status1 = res1.status;
  const status2 = res2.status;
  console.log(`Responses from simultaneous submissions: [Request 1: ${status1}, Request 2: ${status2}]`);

  // Exactly one should succeed with 200, the other must fail with 400
  if ((status1 === 200 && status2 === 400) || (status1 === 400 && status2 === 200)) {
    console.log("✓ Atomic concurrency lock succeeded: exactly ONE request succeeded; duplicate token reuse was blocked.");
  } else {
    throw new Error(`Expected exactly one 200 and one 400, got ${status1} and ${status2}`);
  }

  // Try using the same token a third time
  const reuseRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, newPassword, confirmPassword: newPassword }),
  });
  if (reuseRes.status === 400) {
    console.log("✓ Subsequent token reuse immediately rejected with 400.");
  } else {
    throw new Error("Token was reusable!");
  }

  // 8. Test Old-Password Rejection
  console.log("\n--- Test 7: Old-Password Rejection ---");
  const oldLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: initialPassword, recaptchaToken: "bypass" }),
  });
  if (oldLoginRes.status === 401) {
    console.log("✓ Sign-in with previous/old password correctly rejected with 401 Unauthorized.");
  } else {
    throw new Error("Old password still worked after reset!");
  }

  // 9. Test New-Password Login
  console.log("\n--- Test 8: New-Password Login ---");
  const newLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: newPassword, recaptchaToken: "bypass" }),
  });
  const newLoginData = await newLoginRes.json();
  if (newLoginRes.status === 200 && newLoginData.token) {
    console.log("✓ Sign-in with newly established password succeeded with 200 OK.");
  } else {
    throw new Error(`Login with new password failed: ${JSON.stringify(newLoginData)}`);
  }

  // 10. Test Session Invalidation
  console.log("\n--- Test 9: Session Invalidation (Pre-Reset Token Revocation) ---");
  const oldSessionTest = await fetch(`${BASE_URL}/api/member/profile`, {
    headers: { Authorization: `Bearer ${preResetToken}` },
  });
  if (oldSessionTest.status === 401) {
    console.log("✓ Pre-reset JWT token correctly rejected by authenticate middleware (tokenVersion bumped).");
  } else {
    throw new Error(`Expected pre-reset token to be rejected with 401, got ${oldSessionTest.status}`);
  }

  // 11. Test Expired Token Handling
  console.log("\n--- Test 10: Expired Token Rejection ---");
  const expiredRawToken = crypto.randomBytes(32).toString("hex");
  const expiredHashedToken = crypto.createHash("sha256").update(expiredRawToken).digest("hex");
  await Account.updateOne(
    { email: testEmail },
    {
      resetPasswordToken: expiredHashedToken,
      resetPasswordExpires: new Date(Date.now() - 5000), // Expired 5 seconds ago
    }
  );

  const expiredVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-reset-token?token=${expiredRawToken}`);
  const expiredResetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: expiredRawToken,
      newPassword: "AnotherPassword123#",
      confirmPassword: "AnotherPassword123#",
    }),
  });

  if (expiredVerifyRes.status === 400 && expiredResetRes.status === 400) {
    console.log("✓ Expired token correctly rejected by both verify and reset endpoints.");
  } else {
    throw new Error("Expired token was not rejected!");
  }

  // Clean up test account
  await Account.deleteOne({ email: testEmail });
  console.log("✓ Test account cleaned up.");

  console.log("\n========================================================");
  console.log("   ALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY!       ");
  console.log("========================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch((err) => {
  console.error("\n❌ VERIFICATION TEST FAILED:", err);
  process.exit(1);
});
