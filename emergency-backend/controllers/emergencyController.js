import admin from "../firebase.js";
import { sendFCM } from "../services/fcmService.js";

export async function createEmergency(req, res) {
  try {
    const db = admin.database().ref();

    const {
      senderUid,
      type,
      condition,
      need,
      location,
      priorities,
    } = req.body;

    if (!type || !need || !location || !priorities || priorities.length === 0) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // ---- 1) Create emergency entry ----
    const ref = db.child("emergencies").push();
    const emergencyId = ref.key;

    const emergency = {
      senderUid,
      type,
      condition,
      need,
      location,
      priorities,
      status: "pending",
      currentPriorityIndex: 0,
      helperAccepted: false,
      createdAt: Date.now(),
      lastSentAt: Date.now(),
    };

    await ref.set(emergency);

    // ---- 2) Start cascading logic ----
    cascadeToNext(emergencyId, emergency);

    return res.json({ ok: true, emergencyId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  async function cascadeToNext(emergencyId, emergency) {
  const db = admin.database().ref("emergencies/" + emergencyId);

  let index = emergency.currentPriorityIndex;
  const list = emergency.priorities;

  if (index >= list.length) {
    console.log("🔥 No more priorities left.");
    await db.update({ status: "all_failed" });
    return;
  }

  const helper = list[index];
  const token = helper.fcmToken;

  if (!token) {
    console.log(`❌ Priority ${index} has NO token → skipping`);
    emergency.currentPriorityIndex++;
    await db.update({ currentPriorityIndex: emergency.currentPriorityIndex });
    return cascadeToNext(emergencyId, emergency);
  }

  console.log(`📨 Sending notification to priority ${index}:`, token);

  await sendFCM(
    token,
    `Emergency: ${emergency.type}`,
    `${emergency.need} — ${emergency.condition || ""}`,
    { emergencyId }
  );

  // Update last sent time
  const sentTime = Date.now();
  await db.update({
    lastSentAt: sentTime,
  });

  // ---- 3) Schedule next check in 5 seconds ----
  setTimeout(async () => {
    const snapshot = await db.get();
    const updated = snapshot.val();

    // STOP if someone accepted
    if (updated.helperAccepted === true) {
      console.log("✅ Helper accepted. Stopping cascade.");
      return;
    }

    // STOP if status is no longer pending
    if (updated.status !== "pending") {
      console.log("⛔ Emergency state changed, stopping.");
      return;
    }

    // If 5 seconds passed → move to next priority
    updated.currentPriorityIndex++;

    await db.update({
      currentPriorityIndex: updated.currentPriorityIndex,
    });

    console.log("⏭ Moving to next priority:", updated.currentPriorityIndex);

    cascadeToNext(emergencyId, updated);

  }, 10000);
}

}
