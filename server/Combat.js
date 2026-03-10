// server/Combat.js
import {
  PUNCH_RANGE, PUNCH_HITBOX_RADIUS, PUNCH_DAMAGE,
  PUNCH_KNOCKBACK_XZ, PUNCH_KNOCKBACK_Y, PUNCH_HITSTUN,
  STOMP_HITBOX_RADIUS, STOMP_DAMAGE,
  STOMP_KNOCKBACK_XZ, STOMP_HITSTUN, STOMP_BOUNCE_VELOCITY,
  BLOCK_DAMAGE_MULTIPLIER, BLOCK_KNOCKBACK_MULTIPLIER, BLOCK_STUN,
  PARRY_PUNISH_STUN
} from '../shared/constants.js';

/**
 * Process combat for a tick.
 * Returns array of events generated.
 */
export function processCombat(attacker, target) {
  const events = [];

  // Check punch hit
  if (attacker.state === 'attacking' && attacker.attackPhase === 'active') {
    // Only hit once per attack - track with a flag
    if (!attacker._punchHitThisCycle) {
      const hitResult = checkPunchHit(attacker, target);
      if (hitResult) {
        attacker._punchHitThisCycle = true;
        const event = applyHit(attacker, target, PUNCH_DAMAGE, PUNCH_KNOCKBACK_XZ, PUNCH_KNOCKBACK_Y, PUNCH_HITSTUN, 'punch');
        if (event) events.push(event);
      }
    }
  }

  // Reset punch hit flag when leaving active phase
  if (attacker.state !== 'attacking' || attacker.attackPhase !== 'active') {
    attacker._punchHitThisCycle = false;
  }

  // Check stomp hit
  if (attacker.state === 'stomping' && !attacker.stompHasHit) {
    const hitResult = checkStompHit(attacker, target);
    if (hitResult) {
      attacker.stompHasHit = true;
      const event = applyHit(attacker, target, STOMP_DAMAGE, STOMP_KNOCKBACK_XZ, 0, STOMP_HITSTUN, 'stomp');
      if (event) {
        // Stomp bounce for attacker
        attacker.velocityY = STOMP_BOUNCE_VELOCITY;
        attacker.grounded = false;
        // Target Y velocity set to 0
        target.velocityY = 0;
        events.push(event);
      }
    }
  }

  return events;
}

function checkPunchHit(attacker, target) {
  if (target.isInvincible()) return false;

  // Hitbox: sphere at PUNCH_RANGE in attacker's facing direction, at chest height
  const hitboxX = attacker.x + Math.sin(attacker.yaw) * PUNCH_RANGE;
  const hitboxZ = attacker.z + Math.cos(attacker.yaw) * PUNCH_RANGE;
  const hitboxY = 0.8; // chest height

  // Check distance to target center
  const dx = target.x - hitboxX;
  const dy = (target.y + 1.0) - hitboxY; // target center ~1.0 above ground
  const dz = target.z - hitboxZ;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return dist < PUNCH_HITBOX_RADIUS + 0.4; // hitbox + player radius
}

function checkStompHit(attacker, target) {
  if (target.isInvincible()) return false;

  // Hitbox: sphere at attacker's feet
  const dx = target.x - attacker.x;
  const dy = (target.y + 1.0) - attacker.y; // compare to attacker feet vs target center
  const dz = target.z - attacker.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return dist < STOMP_HITBOX_RADIUS + 0.4;
}

function applyHit(attacker, target, baseDamage, baseKnockbackXZ, knockbackY, baseHitstun, attackType) {
  // Direction from attacker to target
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const nx = dist > 0 ? dx / dist : 0;
  const nz = dist > 0 ? dz / dist : 1;

  let damage = baseDamage;
  let knockbackMult = 1;
  let hitstun = baseHitstun;

  // Block and parry only apply to punches, not stomps
  if (attackType !== 'stomp') {
    // Check parry
    if (target.isParrying()) {
      attacker.enterHitstun(PARRY_PUNISH_STUN);
      return {
        kind: 'parry',
        attackerId: attacker.id,
        targetId: target.id,
      };
    }

    // Check block
    if (target.isBlocking()) {
      damage *= BLOCK_DAMAGE_MULTIPLIER;
      knockbackMult = BLOCK_KNOCKBACK_MULTIPLIER;
      hitstun = BLOCK_STUN;
    }
  }

  // Apply damage
  target.applyDamage(damage);

  // Apply knockback
  target.applyKnockback(
    nx * baseKnockbackXZ * knockbackMult,
    knockbackY * knockbackMult,
    nz * baseKnockbackXZ * knockbackMult
  );

  // Apply hitstun
  target.enterHitstun(hitstun);

  // Apply i-frames
  target.applyIframes();

  // Check KO
  if (target.hp <= 0) {
    target.state = 'ko';
    target.stateTimer = 999;
  }

  return {
    kind: 'hit',
    attackerId: attacker.id,
    targetId: target.id,
    damage: damage,
    attackType: attackType,
  };
}
