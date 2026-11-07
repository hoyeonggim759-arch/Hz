'use strict';

/**
 * KRSMS task extension contract.
 *
 * This file is intentionally disabled by default. It demonstrates a safe
 * monitoring/task hook, not a bulk SMS or repeated verification sender.
 * Do not place provider credentials in this file. Keep secrets in server-side
 * environment variables and use an audited, consent-based provider integration.
 *
 * The application currently records phone + duration as a task request only.
 * No external SMS/API action is executed by default.
 */
module.exports = {
  enabled: false,

  /**
   * @param {Object} context
   * @param {string} context.phone - validated, user-authorized phone number
   * @param {number} context.durationMinutes - requested task monitoring window
   * @param {Date} context.deadline - hard deadline for this job
   * @param {AbortSignal} context.signal - cancellation signal
   * @param {(message: string) => void} context.log - safe task logger
   */
  async execute({ phone, durationMinutes, deadline, signal, log }) {
    log(`Task hook loaded for ${phone.slice(0, 3)}****. Window: ${durationMinutes} min.`);
    log('No provider action is configured. No SMS or external request was sent.');
    return { status: 'NOOP' };
  },
};
